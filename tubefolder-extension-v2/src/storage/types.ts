// 데이터 모델 — tubefolder-extension-v1/docs/DATA-MODEL.md 그대로 포팅.
// 정규화된 노드 맵(id → node)으로 트리를 표현한다. parentId만으로 부모-자식 관계를 나타내
// 무제한 중첩을 O(1) 재부모화로 다룬다 (이동 = parentId 교체).

export type NodeType = 'folder' | 'video';

interface BaseNode {
  id: string;
  parentId: string | null;
  name: string;
  /** 같은 부모 내 수동 정렬 순서('없음' 정렬·드래그 재배치 기준) */
  order: number;
  createdAt: number;
  modifiedAt: number;
  /** 휴지통에 있는 동안만 존재 — 복원 시 되돌아갈 위치(DATA-MODEL.md §2 "휴지통 안 노드 전용") */
  prevParentId?: string;
}

export interface FolderNode extends BaseNode {
  type: 'folder';
  /** 휴지통 폴더에만 존재하는 시스템 표식. 있으면 이동·복사·삭제·이름변경 불가. */
  system?: 'trash';
}

export interface VideoNode extends BaseNode {
  type: 'video';
  videoId: string | null;
  url: string;
  thumb: string;
  kind: 'video' | 'music';
  channel: string;
  /** 재생시간(초). 현재 메타 미수집 시 0 (ROADMAP 4단계 "duration 정밀 수집" 과제) */
  duration: number;
}

export type TubeNode = FolderNode | VideoNode;

export interface Settings {
  view: 'xl' | 'large' | 'medium' | 'small' | 'list' | 'details';
  sortKey: 'name' | 'date' | 'type' | 'size' | 'none';
  sortDir: 'asc' | 'desc';
}

export interface TubeStoreData {
  version: number;
  rootId: string;
  trashId: string;
  nodes: Record<string, TubeNode>;
  settings: Settings;
}

export function isFolder(node: TubeNode): node is FolderNode {
  return node.type === 'folder';
}

export function isVideo(node: TubeNode): node is VideoNode {
  return node.type === 'video';
}
