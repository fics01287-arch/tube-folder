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
  /** 이 노드가 마지막으로 쓰여진 노드 스키마 버전(DATA_VERSION과 동일 값) — 향후 노드 구조 변경 시 자동 마이그레이션 판단 기준 */
  schemaVersion: number;
  /** 마지막으로 이 노드를 수정한 기기 식별자. 3단계 "모바일 자동 동기화" 병합 로직의 전제 조건(ROADMAP-CHECKLIST.md 1단계 참고) */
  deviceId: string;
  /** 항목별 수정 버전 카운터(1부터 시작, 수정마다 +1). 기기 간 시계가 어긋나도 최신 변경을 판별할 보조 지표 */
  version: number;
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
  /** 이어보기: 마지막 저장된 재생 위치(초). 없으면 처음부터 재생(하위호환 optional, 마이그레이션 불필요) */
  lastPosition?: number;
  /** 이어보기: 마지막으로 재생을 멈추거나 닫은 시각(ms epoch). modifiedAt/version과는 분리(touch() 미적용 — ALGORITHMS 참고) */
  lastWatchedAt?: number;
}

export type TubeNode = FolderNode | VideoNode;

export interface Settings {
  view: 'xl' | 'large' | 'medium' | 'small' | 'list' | 'details';
  sortKey: 'name' | 'date' | 'type' | 'size' | 'none';
  sortDir: 'asc' | 'desc';
  /** 휴지통 보관 기간(일). null = 자동 삭제 없음. 기본 30일(ROADMAP 4단계 "휴지통 보존기간 설정"). */
  trashRetentionDays: number | null;
  /** 삭제(휴지통 이동) 시 보관기간 정책 안내 팝업을 "다시 보지 않기" 체크했으면 true. 기본 false(계속 노출). */
  trashInfoDismissed: boolean;
}

export interface TubeStoreData {
  version: number;
  rootId: string;
  trashId: string;
  nodes: Record<string, TubeNode>;
  settings: Settings;
  /**
   * 영구 삭제 기록(id → 삭제시각 ms). 휴지통 비우기로 완전히 지운 노드를 기록해 두지 않으면
   * 동기화 병합 때 다른 기기 데이터에 남아 있던 사본이 "한쪽에만 있는 신규 노드"로 오인돼 부활한다.
   * TOMBSTONE_TTL_MS(90일) 경과분은 병합 시 자동 청소. optional — 구버전 데이터는 migrate()가 {}로 백필.
   */
  tombstones?: Record<string, number>;
}

export function isFolder(node: TubeNode): node is FolderNode {
  return node.type === 'folder';
}

export function isVideo(node: TubeNode): node is VideoNode {
  return node.type === 'video';
}
