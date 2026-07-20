// 폴더 CRUD — v1엔 없던 신규 헬퍼(v1은 background.js에서 이름변경·삭제 대신 매니저 탭을 열어
// app.js의 조작함수에 위임했음). 우클릭 메뉴에서 탭 전환 없이 바로 처리하기 위해 저장 계층에
// 캡슐화한다. 데이터 구조·불변식(DATA-MODEL.md I1~I8)은 그대로 — 새 진입점만 추가.

import type { FolderNode, TubeNode, TubeStoreData } from './types';
import { load, save, now, uid, uniqueName } from './storage';

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
    modifiedAt: t
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
  folder.modifiedAt = now();
  await save(data);
  return folder;
}

export interface ImportVideoInput {
  url: string;
  videoId: string;
  title?: string;
  channel?: string;
  kind?: 'video' | 'music';
}

export interface ImportVideosResult {
  added: number;
  skipped: number;
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
  let added = 0;
  let skipped = 0;

  for (const v of videos) {
    if (existingVideoIds.has(v.videoId)) {
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
      duration: 0,
      createdAt: t,
      modifiedAt: t,
      order: order++
    };
    data.nodes[id] = node;
    siblings.push(node);
    existingVideoIds.add(v.videoId);
    added++;
  }

  if (added > 0) await save(data);
  return { added, skipped };
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
  folder.modifiedAt = now();
  // 하위 트리는 parentId 참조로 따라오므로 별도 처리 불필요(DATA-MODEL.md §4)
  await save(data);
}
