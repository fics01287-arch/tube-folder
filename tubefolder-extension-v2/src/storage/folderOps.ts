// 폴더 CRUD — v1엔 없던 신규 헬퍼(v1은 background.js에서 이름변경·삭제 대신 매니저 탭을 열어
// app.js의 조작함수에 위임했음). 우클릭 메뉴에서 탭 전환 없이 바로 처리하기 위해 저장 계층에
// 캡슐화한다. 데이터 구조·불변식(DATA-MODEL.md I1~I8)은 그대로 — 새 진입점만 추가.

import type { FolderNode, Settings, TubeNode, TubeStoreData, VideoNode } from './types';
import { load, save, now, uid, uniqueName, newNodeMeta, touch } from './storage';
import { FREE_FOLDER_LIMIT, FREE_VIDEO_LIMIT, isPaidCached, LicenseLimitError } from '../license/licenseEngine';
import { isLicenseAvailable } from '../license/licenseManager';
import { youtubeUrl } from '../shared/youtubeSelectors';

// 무료/유료 한도는 isLicenseAvailable()(Paddle 결제 설정 완료)일 때만 적용한다. (2026-08-17,
// "PWA에 결제 확인 붙이기" 구현 완료) isLicenseAvailable()이 더 이상 확장 컨텍스트를 요구하지
// 않게 되면서 PWA도 이제 동일하게 한도가 적용된다 — PWA에서 유료 여부를 확인할 방법이 이제 생겼으므로
// (LicenseControl.tsx), 애초 계획대로 이 시점에 함께 켜진다(ROADMAP-CHECKLIST.md 참고).

/** 사용자가 만든 폴더 수(루트·휴지통 제외) — 무료 티어 한도 체크용 */
function countUserFolders(data: TubeStoreData): number {
  let n = 0;
  for (const k in data.nodes) {
    const node = data.nodes[k];
    if (node.type === 'folder' && node.id !== data.rootId && node.id !== data.trashId) n++;
  }
  return n;
}

/** 저장소 전체(휴지통 포함)의 영상 수 — 무료 티어 한도 체크용 */
function countVideos(data: TubeStoreData): number {
  let n = 0;
  for (const k in data.nodes) {
    if (data.nodes[k].type === 'video') n++;
  }
  return n;
}

function childrenOf(data: TubeStoreData, parentId: string): TubeNode[] {
  const result: TubeNode[] = [];
  for (const k in data.nodes) {
    if (data.nodes[k].parentId === parentId) result.push(data.nodes[k]);
  }
  return result;
}

function nextOrder(data: TubeStoreData, parentId: string): number {
  let order = 0;
  for (const k in data.nodes) {
    const n = data.nodes[k];
    // 휴지통은 order=Number.MAX_SAFE_INTEGER로 항상 맨 끝 고정용(emptyStore 참고)이라
    // 다음 순번 계산에 끼면 안 됨 — v1 addVideoToFolder의 동일 가드와 일치시킴
    if (n.parentId === parentId && n.id !== data.trashId && (n.order || 0) >= order) order = (n.order || 0) + 1;
  }
  return order;
}

/** 폴더만, 이름(ko, 자연정렬) 순으로 — background.js buildFolderSubMenus 계열과 동일한 정렬 규칙(ALGORITHMS.md §1) */
export function folderChildren(data: TubeStoreData, parentId: string): FolderNode[] {
  const result: FolderNode[] = [];
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.type === 'folder' && n.parentId === parentId && n.id !== data.trashId) result.push(n);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
}

export class FolderOpError extends Error {}

/** 지정 부모 아래 새 폴더 생성. 부모가 유효하지 않거나 휴지통이면 루트에 생성(불변식 I4). */
export async function createFolder(parentId: string, name = '새 폴더'): Promise<FolderNode> {
  const data = await load();

  if (countUserFolders(data) >= FREE_FOLDER_LIMIT && isLicenseAvailable() && !(await isPaidCached())) {
    throw new LicenseLimitError(
      'folder-limit',
      `무료 버전은 폴더를 최대 ${FREE_FOLDER_LIMIT}개까지 만들 수 있습니다. 더 만들려면 업그레이드가 필요합니다.`
    );
  }

  let targetId = parentId;
  const target = data.nodes[targetId];
  if (!target || target.type !== 'folder' || targetId === data.trashId) {
    targetId = data.rootId;
  }

  const siblings = childrenOf(data, targetId).filter((n) => n.id !== data.trashId);
  const t = now();
  const id = uid();
  const folder: FolderNode = {
    id,
    type: 'folder',
    parentId: targetId,
    name: uniqueName(siblings, name),
    order: nextOrder(data, targetId),
    createdAt: t,
    modifiedAt: t,
    ...(await newNodeMeta())
  };
  data.nodes[id] = folder;
  await save(data);
  return folder;
}

/** 폴더 이름 변경. 루트/휴지통은 불변식 I4에 따라 거부. */
export async function renameFolder(folderId: string, newName: string): Promise<FolderNode> {
  const data = await load();
  const folder = data.nodes[folderId];
  if (!folder || folder.type !== 'folder') throw new FolderOpError('폴더를 찾을 수 없습니다.');
  if (folderId === data.rootId || folderId === data.trashId) {
    throw new FolderOpError('이 폴더는 이름을 바꿀 수 없습니다.');
  }
  const trimmed = newName.trim();
  if (!trimmed) throw new FolderOpError('폴더 이름을 입력하세요.');

  folder.name = trimmed;
  await touch(folder);
  await save(data);
  return folder;
}

/**
 * 폴더 아이콘 변경(ROADMAP 4단계 "폴더 아이콘 다양화 + 초기화"). icon=null이면 기본 아이콘으로
 * 초기화(필드 삭제 — 저장 용량·하위호환 양쪽 모두 undefined가 "기본값"과 같은 의미이므로 재사용).
 * 루트/휴지통은 renameFolder와 동일하게 항상 고정 아이콘(🏠/🗑️)이라 변경 대상에서 제외.
 */
export async function setFolderIcon(folderId: string, icon: string | null): Promise<FolderNode> {
  const data = await load();
  const folder = data.nodes[folderId];
  if (!folder || folder.type !== 'folder') throw new FolderOpError('폴더를 찾을 수 없습니다.');
  if (folderId === data.rootId || folderId === data.trashId) {
    throw new FolderOpError('이 폴더는 아이콘을 바꿀 수 없습니다.');
  }

  if (icon) folder.icon = icon;
  else delete folder.icon;
  await touch(folder);
  await save(data);
  return folder;
}

export interface ImportVideoInput {
  url: string;
  videoId: string;
  title?: string;
  channel?: string;
  kind?: 'video' | 'music';
  /** 재생시간(초). ROADMAP 4단계 "duration 정밀 수집" — 없으면 0(미수집)으로 저장. */
  duration?: number;
}

export interface ImportVideosResult {
  added: number;
  skipped: number;
  /** 무료 티어 영상 한도(FREE_VIDEO_LIMIT)에 걸려 일부만 추가되고 나머지는 건너뛴 경우 true */
  limitReached: boolean;
}

/**
 * 재생목록 일괄 가져오기 전용 — 여러 영상을 한 번의 load/save로 폴더에 추가.
 * videoId가 저장소 전체(트리 전역, 휴지통 포함) 어딘가에 이미 있으면 건너뛴다.
 * addVideoToFolder(storage.ts)를 반복 호출하지 않는 이유: 호출마다 load+save가 일어나
 * 영상 수가 많은 재생목록에서는 왕복이 그대로 배가되기 때문.
 */
export async function addVideosToFolder(folderId: string, videos: ImportVideoInput[]): Promise<ImportVideosResult> {
  const data = await load();

  let targetId = folderId;
  const target = data.nodes[targetId];
  if (!target || target.type !== 'folder' || targetId === data.trashId) {
    targetId = data.rootId;
  }

  const existingVideoIds = new Set<string>();
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.type === 'video' && n.videoId) existingVideoIds.add(n.videoId);
  }

  const siblings = childrenOf(data, targetId).filter((n) => n.id !== data.trashId);
  let order = nextOrder(data, targetId);
  const t = now();
  // 배치 전체가 같은 기기·같은 순간에 만들어지므로 스탬프를 한 번만 떠서 재사용(항목별 version은 각자 1부터 시작)
  const meta = await newNodeMeta();
  let added = 0;
  let skipped = 0;
  let limitReached = false;

  const gateActive = isLicenseAvailable() && !(await isPaidCached());
  let videoCount = countVideos(data);

  for (const v of videos) {
    if (existingVideoIds.has(v.videoId)) {
      skipped++;
      continue;
    }
    if (gateActive && videoCount >= FREE_VIDEO_LIMIT) {
      limitReached = true;
      skipped++;
      continue;
    }
    const id = uid();
    const title = v.title || v.url;
    const node: TubeNode = {
      id,
      type: 'video',
      parentId: targetId,
      name: uniqueName(siblings, title),
      videoId: v.videoId,
      url: v.url,
      thumb: youtubeUrl.thumbnail(v.videoId),
      kind: v.kind || 'video',
      channel: v.channel || '',
      duration: v.duration || 0,
      createdAt: t,
      modifiedAt: t,
      order: order++,
      ...meta
    };
    data.nodes[id] = node;
    siblings.push(node);
    existingVideoIds.add(v.videoId);
    videoCount++;
    added++;
  }

  if (added > 0) await save(data);
  return { added, skipped, limitReached };
}

/**
 * 이어보기 재생 위치 저장 — 5~10초 간격으로 백그라운드에서 자주 호출되는 고빈도 쓰기라
 * touch()(version/deviceId/modifiedAt 갱신)를 태우지 않는다: 재생 진행을 "수정"으로 취급하면
 * ①이름순이 아닌 "수정일" 정렬이 재생할 때마다 사용자가 손대지 않았는데도 바뀌고
 * ②3단계 동기화 병합 로직이 실제 구조 변경과 단순 재생 진행을 구분 못 하게 됨.
 * 그래서 lastPosition/lastWatchedAt만 갈아 끼우는 전용 경량 헬퍼로 분리한다.
 */
export async function updatePlaybackPosition(videoId: string, position: number): Promise<void> {
  const data = await load();
  let target: VideoNode | undefined;
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.type === 'video' && n.videoId === videoId) {
      target = n;
      break;
    }
  }
  if (!target) return; // 재생 중 폴더 이동/삭제 등으로 노드가 사라졌으면 조용히 무시
  target.lastPosition = position;
  target.lastWatchedAt = now();
  await save(data);
}

/**
 * 휴지통 비우기 — 휴지통 안 전체 트리를 영구 삭제하고 tombstones에 기록한다.
 * 기록을 남기는 이유: 동기화 병합(sync/merge.ts)이 "한쪽에만 있는 노드=신규 추가"로 취급하므로,
 * 기록 없이 지우면 다른 기기 데이터와 병합될 때 지운 항목이 부활한다.
 */
export async function emptyTrash(): Promise<number> {
  const data = await load();
  const t = now();
  if (!data.tombstones) data.tombstones = {};

  // 휴지통 자손 전체 수집(부모→자식 참조가 없으므로 parentId 역추적을 반복)
  const doomed = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const k in data.nodes) {
      const n = data.nodes[k];
      if (doomed.has(n.id) || n.id === data.trashId) continue;
      if (n.parentId === data.trashId || (n.parentId && doomed.has(n.parentId))) {
        doomed.add(n.id);
        grew = true;
      }
    }
  }

  for (const id of doomed) {
    delete data.nodes[id];
    data.tombstones[id] = t;
  }
  if (doomed.size > 0) await save(data);
  return doomed.size;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 보관기간이 지난 휴지통 항목을 실제로 지운다(제자리 수정, 저장은 호출부 책임).
 * "휴지통에 들어간 시점"은 직접 휴지통으로 옮겨진 최상위 항목(parentId===trashId)의 modifiedAt으로
 * 판단한다(trashFolder가 이동 시 touch()로 갱신) — 그 하위 자손은 부모를 따라가므로 개별 판단 불필요.
 * emptyTrash()와 같은 BFS로 하위 트리를 모아 tombstone까지 함께 남긴다(동기화 병합 시 부활 방지).
 */
function purgeExpiredIn(data: TubeStoreData): number {
  const days = data.settings.trashRetentionDays;
  if (days == null) return 0; // "자동 삭제 없음"
  const cutoff = now() - days * DAY_MS;

  const expiredRoots: string[] = [];
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.parentId === data.trashId && n.modifiedAt <= cutoff) expiredRoots.push(n.id);
  }
  if (expiredRoots.length === 0) return 0;

  if (!data.tombstones) data.tombstones = {};
  const t = now();
  const doomed = new Set<string>(expiredRoots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const k in data.nodes) {
      const n = data.nodes[k];
      if (doomed.has(n.id)) continue;
      if (n.parentId && doomed.has(n.parentId)) {
        doomed.add(n.id);
        grew = true;
      }
    }
  }
  for (const id of doomed) {
    delete data.nodes[id];
    data.tombstones[id] = t;
  }
  return doomed.size;
}

/** 앱 시작 시 자동 호출용 — 기한 지난 항목이 있을 때만 저장한다(불필요한 쓰기 방지). */
export async function purgeExpiredTrash(): Promise<number> {
  const data = await load();
  const purged = purgeExpiredIn(data);
  if (purged > 0) await save(data);
  return purged;
}

/**
 * 보관기간을 바꾸기 "전" 미리보기 — 이 값으로 당장 바꾸면 몇 개 항목이 즉시 완전 삭제되는지 계산만 한다
 * (저장 없음, 순수 함수). 이미 로드된 store를 그대로 넘겨 쓰면 되므로 async가 아니다.
 * UX 원칙: "보관기간을 줄여 기존 항목이 즉시 영구삭제될 수 있는 경우, 적용 전 영향받는 항목 수를 알리고 확인받기".
 */
export function previewRetentionPurgeCount(data: TubeStoreData, days: number | null): number {
  if (days == null) return 0;
  const cutoff = now() - days * DAY_MS;
  let count = 0;
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.parentId === data.trashId && n.modifiedAt <= cutoff) count++;
  }
  return count;
}

/**
 * 보관기간 변경 적용 — "변경은 기존 보관 중인 항목에도 소급 적용"이 기본값이라, 설정을 바꾼 즉시
 * 새 기준으로 만료된 항목이 있으면 함께 정리한다(즉시 삭제될 개수는 호출 전 previewRetentionPurgeCount로
 * 미리 확인해 사용자 동의를 받는 것을 전제로 한다 — 이 함수 자체는 무조건 적용한다).
 */
export async function setTrashRetentionDays(days: number | null): Promise<{ purgedCount: number }> {
  const data = await load();
  data.settings.trashRetentionDays = days;
  const purgedCount = purgeExpiredIn(data);
  await save(data);
  return { purgedCount };
}

/**
 * 삭제(휴지통 이동) 시 뜨는 보관기간 정책 안내 팝업의 "다음부터 이 안내를 보지 않기" 체크 저장.
 * ROADMAP 4단계 "휴지통 보존기간" UX 원칙 ⑤(초기 사용 기간 삭제 시점 안내) 반영.
 */
export async function dismissTrashInfo(): Promise<void> {
  const data = await load();
  data.settings.trashInfoDismissed = true;
  await save(data);
}

/**
 * 정렬 기준 변경(ROADMAP 4단계 "드래그로 순서 재배치 시 삽입선 표시" → "정렬 확장" 추가 구현).
 * "이름순"·"날짜순"·"유형순"·"크기순"·"직접 순서(드래그)" 5종 지원. 방향(오름/내림차순)은 건드리지 않음
 * — 방향만 바꾸려면 setSortDir(), 기준·방향을 한 번에 바꾸려면(표 보기 열 헤더 클릭 등) setSort() 사용.
 */
export async function setSortMode(sortKey: Settings['sortKey']): Promise<void> {
  const data = await load();
  data.settings.sortKey = sortKey;
  await save(data);
}

/** 정렬 방향(오름차순/내림차순)만 변경 — 정렬 기준은 그대로 둔다. */
export async function setSortDir(sortDir: Settings['sortDir']): Promise<void> {
  const data = await load();
  data.settings.sortDir = sortDir;
  await save(data);
}

/**
 * 정렬 기준+방향을 한 번의 load/save로 동시 변경 — 표 보기 열 헤더 클릭처럼 "이 기준으로 바로 오름차순
 * 정렬"을 한 번에 처리해야 할 때, setSortMode()+setSortDir()를 두 번 호출(왕복 두 번)하는 대신 사용.
 */
export async function setSort(sortKey: Settings['sortKey'], sortDir: Settings['sortDir']): Promise<void> {
  const data = await load();
  data.settings.sortKey = sortKey;
  data.settings.sortDir = sortDir;
  await save(data);
}

/**
 * 보기 모드 변경(ROADMAP 4단계 "아이콘 그리드 4종·표 보기"). 지금은 아이콘 그리드 4종
 * (xl/large/medium/small)과 기존 목록(list)만 지원 — 표 보기(details)는 별도 후속 작업.
 * Settings.view 타입 자체는 'details'까지 이미 열어 뒀으므로 후속 작업에서 그대로 확장 가능.
 */
export async function setView(view: Settings['view']): Promise<void> {
  const data = await load();
  data.settings.view = view;
  await save(data);
}

/**
 * 드래그 재배치 커밋 — 지정 부모 아래 자식들의 order를 orderedIds가 준 순서대로 0부터 촘촘하게 다시 매긴다.
 * sortKey==='none'(직접 순서) 모드에서만 호출됨. 휴지통은 항상 별도 취급(MAX_SAFE_INTEGER 고정, emptyStore 참고)이라
 * orderedIds에 포함돼 있어도 무시한다 — 드래그 대상 자체가 아니라서 실제로는 절대 포함되지 않지만 방어적으로 한 번 더 걸러둔다.
 * 실제로 순서가 바뀐 노드만 touch()로 modifiedAt/version을 갱신해, 3단계 동기화 병합(LWW)의 "수정"과 기준을 맞춘다.
 */
export async function reorderChildren(parentId: string, orderedIds: string[]): Promise<void> {
  const data = await load();
  let changed = false;
  for (let index = 0; index < orderedIds.length; index++) {
    const node = data.nodes[orderedIds[index]];
    if (!node || node.parentId !== parentId || node.id === data.trashId) continue;
    if (node.order !== index) {
      node.order = index;
      await touch(node);
      changed = true;
    }
  }
  if (changed) await save(data);
}

/**
 * 폴더 또는 영상을 다른 폴더로 이동(부모 교체) — 탐색기의 "잘라내기/붙여넣기"에 해당.
 * 같은 부모 내 순서만 바꾸는 reorderChildren()과는 별개로, 트리 구조(parentId) 자체를 바꾼다.
 * (2026-08-29, "이동/이름변경 실행취소" 요청과 함께 신규 추가 — v1까지는 같은 폴더 안 드래그
 * 재정렬만 있었고 폴더 간 이동 자체가 없었음. ROADMAP-CHECKLIST.md 참고)
 * 휴지통으로의 이동은 이 함수로 하지 않는다 — prevParentId 기록·보관기간 정책 안내 팝업 등
 * 휴지통 전용 로직은 trashFolder()가 유일하게 담당하므로 여기서 섞으면 안 됨.
 */
export async function moveNode(nodeId: string, newParentId: string): Promise<void> {
  const data = await load();
  const node = data.nodes[nodeId];
  if (!node) throw new FolderOpError('항목을 찾을 수 없습니다.');
  if (nodeId === data.rootId || nodeId === data.trashId) {
    throw new FolderOpError('이 폴더는 이동할 수 없습니다.');
  }
  if (node.type === 'folder' && node.system === 'trash') {
    throw new FolderOpError('이 폴더는 이동할 수 없습니다.');
  }

  const target = data.nodes[newParentId];
  if (!target || target.type !== 'folder') {
    throw new FolderOpError('이동할 폴더를 찾을 수 없습니다.');
  }
  if (newParentId === data.trashId) {
    throw new FolderOpError('휴지통으로는 이 방법으로 이동할 수 없습니다.');
  }
  if (newParentId === node.parentId) {
    throw new FolderOpError('이미 이 폴더에 있습니다.');
  }

  // 사이클 방지: 폴더를 자기 자신이나 자신의 하위 폴더로 옮기면 트리가 끊어져 도달 불가능한
  // 상태가 되므로 반드시 막아야 함. emptyTrash()의 BFS(부모→자식 참조가 없어 반복적으로
  // 역추적)와 동일한 방식으로 자손 집합을 구한다. 영상은 폴더를 담을 수 없으므로 검사 불필요.
  if (node.type === 'folder') {
    if (newParentId === nodeId) throw new FolderOpError('폴더를 자기 자신으로 이동할 수 없습니다.');
    const descendants = new Set<string>([nodeId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const k in data.nodes) {
        const n = data.nodes[k];
        if (!descendants.has(n.id) && n.parentId && descendants.has(n.parentId)) {
          descendants.add(n.id);
          grew = true;
        }
      }
    }
    if (descendants.has(newParentId)) {
      throw new FolderOpError('폴더를 그 하위 폴더로 이동할 수 없습니다.');
    }
  }

  // 대상 폴더에 동명 항목이 있으면 createFolder/addVideosToFolder와 동일한 관례로 이름 뒤에 번호를 붙인다.
  const siblings = childrenOf(data, newParentId).filter((n) => n.id !== data.trashId);
  node.name = uniqueName(siblings, node.name);
  node.parentId = newParentId;
  node.order = nextOrder(data, newParentId);
  await touch(node);
  await save(data);
}

/** 폴더(+하위 트리 전체)를 휴지통으로 이동. 완전삭제가 아니라 소프트 삭제(ALGORITHMS.md trashNodes와 동일). */
export async function trashFolder(folderId: string): Promise<void> {
  const data = await load();
  const folder = data.nodes[folderId];
  if (!folder || folder.type !== 'folder') throw new FolderOpError('폴더를 찾을 수 없습니다.');
  if (folderId === data.rootId || folderId === data.trashId) {
    throw new FolderOpError('이 폴더는 삭제할 수 없습니다.');
  }

  folder.prevParentId = folder.parentId ?? undefined;
  folder.parentId = data.trashId;
  await touch(folder);
  // 하위 트리는 parentId 참조로 따라오므로 별도 처리 불필요(DATA-MODEL.md §4)
  await save(data);
}

/**
 * 휴지통에서 복원 — trashFolder()가 기록해 둔 prevParentId(원래 있던 폴더)로 되돌린다.
 * (신설 2026-08-30, ROADMAP-CHECKLIST.md 4단계 "휴지통 복원 전용 버튼" 작업순서 1/8)
 * moveNode()를 그대로 쓰지 않는 이유: moveNode는 호출부가 목적지를 직접 골라야 하는 범용 함수이고,
 * 복원은 항상 prevParentId를 자동으로 계산해야 하는 별도 정책(원래 위치 우선, 실패 시 최상위 폴더)이라
 * 분리했다 — 이름 충돌 처리·order 재계산 등 세부 로직은 moveNode와 동일하게 맞춤.
 * 원래 폴더가 그 사이 삭제됐거나·폴더가 아니게 됐거나·그 폴더 자신도 휴지통에 있으면(원래 위치 자체가
 * 더 이상 유효하지 않음) 최상위 폴더로 대체한다.
 */
export async function restoreFromTrash(nodeId: string): Promise<void> {
  const data = await load();
  const node = data.nodes[nodeId];
  if (!node) throw new FolderOpError('항목을 찾을 수 없습니다.');
  if (node.parentId !== data.trashId) {
    throw new FolderOpError('휴지통에 있는 항목만 복원할 수 있습니다.');
  }

  const prevTarget = node.prevParentId ? data.nodes[node.prevParentId] : undefined;
  const prevValid =
    !!prevTarget && prevTarget.type === 'folder' && prevTarget.id !== data.trashId && prevTarget.parentId !== data.trashId;
  const targetId = prevValid ? (node.prevParentId as string) : data.rootId;

  const siblings = childrenOf(data, targetId).filter((n) => n.id !== data.trashId);
  node.name = uniqueName(siblings, node.name);
  node.parentId = targetId;
  node.order = nextOrder(data, targetId);
  delete node.prevParentId;
  await touch(node);
  await save(data);
}
