// 동기화 병합 로직 — "마지막 저장 우선(LWW)" 노드 단위 병합.
// chrome API에 의존하지 않는 순수 함수로 분리해 브라우저 프리뷰에서도 그대로 검증할 수 있게 한다.
//
// 병합 규칙(2026-07-22 산들 승인 설계):
//  1) 한쪽에만 있는 노드 → 신규 추가로 보고 유지 (영구 삭제는 tombstone으로만 표현되므로 안전)
//  2) 양쪽에 있는 노드 → modifiedAt 큰 쪽 승 / 동률이면 version 큰 쪽 / 그래도 동률이면 deviceId 사전순
//     (version은 기기별 독립 증가 카운터라 단독 비교는 부정확 — 시계가 어긋난 기기 대비 보조 지표로만 사용)
//  3) 이어보기(lastPosition·lastWatchedAt)는 touch() 미적용 설계라 modifiedAt에 안 잡힘 —
//     노드 승패와 별개로 lastWatchedAt 큰 쪽을 채택한다
//  4) tombstone(영구 삭제 기록)은 항상 승리("삭제 우선") — 삭제 후 다른 기기의 수정보다 명시적
//     "휴지통 비우기"를 우선한다. 단순하고 예측 가능함을 우선한 결정.
//  5) settings(보기 모드·정렬)는 기기별 로컬 유지 — 원격 스냅샷에 아예 싣지 않는다

import type { TubeNode, TubeStoreData } from '../storage/types';
import { isVideo } from '../storage/types';

/** tombstone 보존 기간 — 90일 지난 삭제 기록은 병합 시 청소(설계 승인 사항) */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** 원격(클라우드) 파일에 저장하는 형태. settings는 기기별 로컬 유지라 제외한다. */
export interface SyncSnapshot {
  version: number;
  nodes: Record<string, TubeNode>;
  tombstones: Record<string, number>;
  uploadedAt: number;
  uploadedBy: string;
}

export interface MergeResult {
  /** 병합된 노드·tombstone (settings 등 나머지는 local 것을 유지한 완전한 스토어) */
  merged: TubeStoreData;
  /** 병합 결과가 로컬과 다름 → 로컬 저장 필요 */
  localChanged: boolean;
  /** 병합 결과가 원격과 다름 → 업로드 필요 (원격 파일이 아직 없으면 항상 true) */
  remoteChanged: boolean;
}

/** 키 순서에 영향받지 않는 비교용 직렬화 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** 양쪽에 있는 노드의 승자 판정 — true면 a 승 */
function wins(a: TubeNode, b: TubeNode): boolean {
  if ((a.modifiedAt || 0) !== (b.modifiedAt || 0)) return (a.modifiedAt || 0) > (b.modifiedAt || 0);
  if ((a.version || 0) !== (b.version || 0)) return (a.version || 0) > (b.version || 0);
  return (a.deviceId || '') >= (b.deviceId || '');
}

export function mergeStores(local: TubeStoreData, remote: SyncSnapshot | null, nowMs: number): MergeResult {
  const localTombs = local.tombstones || {};
  const remoteTombs = remote?.tombstones || {};

  // ① tombstone 합집합(같은 id면 늦은 삭제시각) + TTL 경과분 청소. 루트·휴지통은 삭제 불가 노드라 무시.
  const tombstones: Record<string, number> = {};
  for (const src of [localTombs, remoteTombs]) {
    for (const id in src) {
      if (id === local.rootId || id === local.trashId) continue;
      if (nowMs - src[id] > TOMBSTONE_TTL_MS) continue;
      if (!(id in tombstones) || src[id] > tombstones[id]) tombstones[id] = src[id];
    }
  }

  // ② 노드 병합
  const remoteNodes = remote?.nodes || {};
  const nodes: Record<string, TubeNode> = {};
  const ids = new Set<string>([...Object.keys(local.nodes), ...Object.keys(remoteNodes)]);
  for (const id of ids) {
    if (id in tombstones) continue; // 삭제 우선
    const ln = local.nodes[id];
    const rn = remoteNodes[id];
    if (ln && rn) {
      const winner = wins(ln, rn) ? ln : rn;
      const merged: TubeNode = { ...winner };
      // 이어보기 진행은 노드 승패와 별개 — 더 최근에 본 쪽을 채택
      if (isVideo(ln) && isVideo(rn) && isVideo(merged)) {
        const src = (ln.lastWatchedAt || 0) >= (rn.lastWatchedAt || 0) ? ln : rn;
        if (src.lastWatchedAt !== undefined) {
          merged.lastPosition = src.lastPosition;
          merged.lastWatchedAt = src.lastWatchedAt;
        }
      }
      nodes[id] = merged;
    } else {
      nodes[id] = { ...(ln || rn)! };
    }
  }

  // ③ 구조 보정 — 승자 조합 결과 부모가 tombstone 등으로 사라진 노드는 루트로 회수
  //    (migrate()의 고아 보정과 같은 규칙을 병합 직후에도 적용해 불변식을 지킨다)
  for (const id in nodes) {
    const n = nodes[id];
    if (id === local.rootId) continue;
    if (n.parentId == null || !nodes[n.parentId]) {
      if (id !== local.trashId) n.parentId = local.rootId;
    }
  }

  const merged: TubeStoreData = { ...local, nodes, tombstones };

  const sig = (n: Record<string, TubeNode>, t: Record<string, number>) => stableStringify({ n, t });
  const mergedSig = sig(nodes, tombstones);
  const localChanged = mergedSig !== sig(local.nodes, localTombs);
  const remoteChanged = !remote || mergedSig !== sig(remoteNodes, remoteTombs);

  return { merged, localChanged, remoteChanged };
}
