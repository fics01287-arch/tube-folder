// 폴더 CRUD — v1엔 없던 신규 헬퍼(v1은 background.js에서 이름변경·삭제 대신 매니저 탭을 열어
// app.js의 조작함수에 위임했음). 우클릭 메뉴에서 탭 전환 없이 바로 처리하기 위해 저장 계층에
// 캡슐화한다. 데이터 구조·불변식(DATA-MODEL.md I1~I8)은 그대로 — 새 진입점만 추가.

import type { FolderNode, TubeNode, TubeStoreData, VideoNode } from './types';
import { load, save, now, uid, uniqueName, newNodeMeta, touch } from './storage';
import { FREE_FOLDER_LIMIT, FREE_VIDEO_LIMIT, isPaidCached, LicenseLimitError } from '../license/licenseEngine';
import { isLicenseAvailable } from '../license/licenseManager';

// 무료/유료 한도는 isLicenseAvailable()(확장 컨텍스트 + 결제 설정 완료)일 때만 적용한다. PWA는
// "PWA에 결제 확인 붙이기"(별도 로드맵 항목) 이전까지 유료 여부를 확인할 방법이 없어, 여기서 한도를
// 걸면 PWA 사용자가 영영 업그레이드할 수 없는 상태로 갇힌다 — 그래서 PWA에서는 아직 한도를 걸지 않는다.

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
      thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
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
