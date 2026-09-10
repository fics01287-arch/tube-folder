import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { load, save, STORAGE_KEY, setOpenFolderId, setLastImportFolderId } from '../storage/storage';
import {
  addVideosToFolder,
  createFolder,
  dismissTrashInfo,
  duplicateNode,
  emptyTrash,
  moveNode,
  moveNodes,
  previewRetentionPurgeCount,
  purgeExpiredTrash,
  renameFolder,
  reorderChildren,
  restoreFromTrash,
  restoreNodesFromTrash,
  setFolderIcon,
  setSort,
  setSortDir,
  setSortMode,
  setTrashRetentionDays,
  setView,
  trashNode,
  trashNodes
} from '../storage/folderOps';
import { extractPlaylistId, fetchPlaylistVideos } from '../storage/playlistImport';
import type { PlaylistVideo } from '../storage/playlistImport';
import { fetchPlaylistViaDataApi } from '../storage/youtubeDataApi';
import { youtubeUrl } from '../shared/youtubeSelectors';
import { DEFAULT_FOLDER_ICON, FOLDER_ICON_CATEGORIES } from '../shared/folderIcons';
import { useEscapeClose } from './useEscapeClose';
import { isVideo } from '../storage/types';
import type { Settings, TubeNode, TubeStoreData, VideoNode } from '../storage/types';
import PlayerOverlay from './PlayerOverlay';
import SyncControl from './SyncControl';
import LicenseControl from './LicenseControl';
import LicenseLimitNotice from './LicenseLimitNotice';
import AppInfo from './AppInfo';
import Toast from './Toast';
import MoveDialog from './MoveDialog';
import PlaybackOptionsDialog from './PlaybackOptionsDialog';
import BackupControl from './BackupControl';
import FolderSidebar from './FolderSidebar';
import { shuffle, buildQueueItems, setQueueState } from '../shared/playbackQueue';
import type { QueueOrder, QueueRepeatMode } from '../shared/playbackQueue';
import {
  pushUndo,
  popUndo,
  pushRedo,
  popRedo,
  pushUndoFromRedo,
  clearUndo,
  subscribeUndoStack,
  getUndoSize,
  getRedoSize,
  peekUndoLabel,
  peekRedoLabel
} from './undoStack';
import { runSync, scheduleAutoSync } from '../sync/syncEngine';
import { LicenseLimitError } from '../license/licenseEngine';

// 매니저 페이지 최소 스캐폴딩.
// 목록형·방사형·개요보기 같은 본격 뷰(그리드/가상 스크롤/드래그앤드롭)는 5단계 별도 작업.
// 여기서는 v1처럼 "한 번에 한 폴더의 자식만 렌더링"하는 탐색기형 이동 골격만 최소로 증명하고,
// 우클릭 미니 팝업과 동일한 storage 계층(createFolder/renameFolder/trashFolder)이
// 매니저 컨텍스트에서도 똑같이 동작함을 확인할 수 있게 한다.

// ROADMAP 4단계 "duration 정밀 수집" 검증용 — 수집된 값을 화면에서 바로 확인할 수 있게 표시.
// "1:02:03" / "12:34" 형태. 0 이하(미수집)면 표시하지 않는다.
function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 루트·휴지통은 항상 고정 아이콘(v1과 동일), 그 외 폴더는 사용자가 고른 아이콘(icon 필드) 또는 기본 아이콘.
function folderIcon(node: TubeNode, store: TubeStoreData): string {
  if (node.id === store.rootId) return '🏠';
  if (node.id === store.trashId) return '🗑️';
  return (node.type === 'folder' && node.icon) || DEFAULT_FOLDER_ICON;
}

// ── 검색(ROADMAP 4단계 "검색", 작업순서 7/8) 헬퍼 ────────────────────────────────────
// 휴지통 안(휴지통 자신 포함)은 검색 대상에서 제외한다 — 탐색기 검색이 기본적으로 휴지통까지
// 뒤지지는 않는 것과 같은 관례(다중 선택·클립보드 등 이 코드베이스의 기존 기능들도 대부분 휴지통을
// 별도 취급). 노드에서 부모를 따라 올라가며 휴지통 id를 만나는지만 확인하면 되므로 트리 깊이만큼만
// 순회해 무제한 중첩에서도 가볍다.
function isUnderTrash(store: TubeStoreData, node: TubeNode): boolean {
  let cur: TubeNode | undefined = node;
  while (cur) {
    if (cur.id === store.trashId) return true;
    cur = cur.parentId ? store.nodes[cur.parentId] : undefined;
  }
  return false;
}

// 검색 결과 목록에 "어디에 있는지" 보여줄 경로 문자열(자기 이름은 제외, 부모 체인만) — App() 안의
// breadcrumb useMemo와 같은 조상 순회 로직을 임의의 노드에 대해 쓸 수 있게 일반화한 버전.
function nodePathLabel(store: TubeStoreData, node: TubeNode): string {
  const names: string[] = [];
  let cur: TubeNode | undefined = node.parentId ? store.nodes[node.parentId] : undefined;
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentId ? store.nodes[cur.parentId] : undefined;
  }
  return names.join(' / ');
}

// ── 표(자세히) 보기(ROADMAP 4단계 "아이콘 그리드 4종·표 보기") 열 데이터 헬퍼들 ─────────
// 탐색기의 "유형" 열과 동일한 역할 — 휴지통은 시스템 폴더로 구분 표시.
function nodeTypeLabel(node: TubeNode, store: TubeStoreData): string {
  if (node.type === 'folder') {
    return node.id === store.trashId ? '시스템 폴더' : '파일 폴더';
  }
  return node.kind === 'music' ? 'YouTube 음악' : 'YouTube 동영상';
}

// 탐색기의 "수정한 날짜" 열 — modifiedAt(ms epoch)을 로캘 형식으로.
function formatModifiedAt(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 탐색기의 "크기" 열 — 영상은 재생시간(duration 정밀 수집 항목의 데이터를 그대로 재사용),
// 폴더는 실제 파일 크기 개념이 없어 직계 자식 개수로 대신 표시(재귀 크기 합산은 이번 범위 밖).
// '크기' 정렬(sortNodes)도 이 숫자값을 그대로 비교 기준으로 재사용한다.
function nodeSizeSortValue(node: TubeNode, store: TubeStoreData): number {
  if (isVideo(node)) return node.duration || 0;
  let count = 0;
  for (const k in store.nodes) {
    if (store.nodes[k].parentId === node.id) count++;
  }
  return count;
}

function nodeSizeLabel(node: TubeNode, store: TubeStoreData): string {
  const value = nodeSizeSortValue(node, store);
  if (isVideo(node)) return value > 0 ? formatDuration(value) : '-';
  return value > 0 ? `${value}개 항목` : '-';
}

// 폴더에 마우스를 올리거나 열었을 때 "그 안에 폴더 몇 개·영상 몇 개가 있는지" 바로 보여주기 위한
// 헬퍼(2026-09-08 신설, 산들 요청). 위 nodeSizeSortValue와 같은 이유로 재귀 집계는 하지 않고
// 직계 자식만 센다(하위 폴더 안의 영상까지 다 더하면 폴더가 깊어질수록 계산량이 커지고, 탐색기도
// 폴더 속성을 열기 전까지는 재귀 크기를 미리 계산해두지 않는 것과 같은 절충). 휴지통은 시스템
// 폴더라 "폴더 개수"에 포함하지 않는다(사용자가 직접 만든 폴더만 셈).
function folderContentCounts(store: TubeStoreData, folderId: string): { folders: number; videos: number } {
  let folders = 0;
  let videos = 0;
  for (const k in store.nodes) {
    const n = store.nodes[k];
    if (n.parentId !== folderId) continue;
    if (n.type === 'folder') {
      if (n.id !== store.trashId) folders++;
    } else {
      videos++;
    }
  }
  return { folders, videos };
}

function folderContentCountsLabel(store: TubeStoreData, folderId: string): string {
  const { folders, videos } = folderContentCounts(store, folderId);
  return `폴더 ${folders}개 · 영상 ${videos}개`;
}

// 탐색기의 "수정한 날짜" 열·정렬 기준 값 — 영상은 산들 요청(2026-09-08)으로 "폴더에 넣은 시각"이
// 아니라 "유튜브 재생목록에 실제로 추가된 시각"(youtubeDataApi.ts가 playlistItems.list의
// snippet.publishedAt에서 받아와 VideoNode.playlistAddedAt에 저장)을 우선 쓴다 — 재생목록을
// 여러 날에 나눠 가져오거나 정리하다 폴더를 옮겨도 "원래 언제 추가한 영상인지" 순서가 안 흔들리게
// 하기 위함. 이 값이 없는 영상(공식 API 실패 시 폴백되는 기존 스크래핑 경로로 가져왔거나, 이 기능
// 도입 전에 이미 저장돼 있던 영상)은 기존처럼 modifiedAt으로 자연스럽게 대체된다(하위호환, 별도
// 마이그레이션 불필요). 폴더는 "재생목록에 추가된 시각" 개념 자체가 없으므로 항상 modifiedAt 그대로.
function nodeDateValue(node: TubeNode): number {
  if (isVideo(node) && node.playlistAddedAt != null) return node.playlistAddedAt;
  return node.modifiedAt;
}

// "튜브폴더 추가일" 열·정렬 기준 값 — 위 nodeDateValue(유튜브 추가일)와 구분해서 산들이 요청한
// 두 번째 날짜 기준(2026-09-08 신설). createdAt은 노드가 처음 만들어질 때 한 번만 찍히고
// touch()(이름변경·이동·아이콘변경 등)로는 절대 갱신되지 않아, "이 항목을 튜브폴더에 실제로
// 추가한 시점"을 항상 정확히 가리킨다(폴더·영상 모두 동일하게 존재하는 필드라 폴백 불필요).
function nodeAddedAtValue(node: TubeNode): number {
  return node.createdAt;
}

// 정렬 기준별 1차 비교값(방향·이름 보조정렬은 sortNodes에서 처리) — 이름순은 기존 로캘 자연정렬 그대로.
function compareByKey(a: TubeNode, b: TubeNode, sortKey: Settings['sortKey'], store: TubeStoreData): number {
  switch (sortKey) {
    case 'date':
      return nodeDateValue(a) - nodeDateValue(b);
    case 'addedAt':
      return nodeAddedAtValue(a) - nodeAddedAtValue(b);
    case 'type':
      return nodeTypeLabel(a, store).localeCompare(nodeTypeLabel(b, store), 'ko');
    case 'size':
      return nodeSizeSortValue(a, store) - nodeSizeSortValue(b, store);
    case 'name':
    default:
      return a.name.localeCompare(b.name, 'ko', { numeric: true });
  }
}

// sortKey==='none'(직접 순서)이면 order 필드 기준으로만 정렬(폴더 우선 규칙 없이 사용자가 끌어놓은 순서
// 그대로 — 폴더·영상이 섞여도 됨). 그 외에는 탐색기 관례대로 폴더를 항상 먼저 그룹핑한 다음, 그룹 안에서
// 선택한 기준(이름/날짜/유형/크기)으로 비교하고 동률이면 이름순으로 보조 정렬(안정적인 순서 보장).
// sortDir(오름·내림차순)은 폴더 우선 그룹핑 자체에는 영향을 주지 않고, 그룹 안의 비교 결과에만 곱해진다
// (탐색기에서 "내림차순"을 눌러도 폴더가 파일 밑으로 안 가는 것과 동일한 동작).
function sortNodes(nodes: TubeNode[], sortKey: Settings['sortKey'], sortDir: Settings['sortDir'], store: TubeStoreData): TubeNode[] {
  const copy = [...nodes];
  if (sortKey === 'none') {
    copy.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return copy;
  }
  const dirMul = sortDir === 'desc' ? -1 : 1;
  copy.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const primary = compareByKey(a, b, sortKey, store);
    if (primary !== 0) return primary * dirMul;
    return a.name.localeCompare(b.name, 'ko', { numeric: true }) * dirMul;
  });
  return copy;
}

function arrayMoveLocal<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// 드래그 재배치(ROADMAP 4단계 "드래그 삽입선 표시") — 행 전체가 아니라 전용 손잡이(⠿)에만
// dnd-kit 리스너를 걸어, 폴더 열기·이름변경·삭제 등 기존 클릭 동작과 충돌하지 않게 한다.
// isOver/overPosition로 드롭 대상 행 위/아래에 삽입선(css box-shadow)을 그린다.
function SortableRow({
  id,
  disabled,
  isOver,
  overPosition,
  coDragging,
  dragHandleLabel,
  onContextMenu,
  onClickCapture,
  children
}: {
  id: string;
  disabled: boolean;
  isOver: boolean;
  overPosition: 'before' | 'after' | 'into' | null;
  coDragging?: boolean;
  dragHandleLabel: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
  children: (dragProps: DragHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || coDragging ? 0.4 : 1
  };
  const dropClass =
    isOver && overPosition === 'before'
      ? ' tf-row-drop-before'
      : isOver && overPosition === 'after'
        ? ' tf-row-drop-after'
        : isOver && overPosition === 'into'
          ? ' tf-row-drop-into'
          : '';
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={'tf-row' + dropClass}
      onContextMenu={onContextMenu}
      onClickCapture={onClickCapture}
    >
      {!disabled && (
        <span className="tf-drag-handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
          ⠿
        </span>
      )}
      {children({ attributes, listeners })}
    </li>
  );
}

// 아이콘 그리드 4종(ROADMAP 4단계 "아이콘 그리드 4종·표 보기") — 표 보기(details)는 이번 범위 밖이라
// 선택지에 넣지 않는다(Settings.view 타입엔 이미 있어 후속 작업에서 그대로 추가 가능).
const GRID_VIEWS: { key: Settings['view']; label: string }[] = [
  { key: 'xl', label: '아주 큰 아이콘' },
  { key: 'large', label: '큰 아이콘' },
  { key: 'medium', label: '보통 아이콘' },
  { key: 'small', label: '작은 아이콘' }
];
const GRID_VIEW_KEYS = new Set(GRID_VIEWS.map((v) => v.key));

// ── 가상 스크롤(ROADMAP 1단계 설계 결정 — "행 단위 가상화") ─────────────────────────
// 폴더 안 항목이 이 개수를 넘고 + "직접 순서(드래그)" 모드가 아닐 때만 가상 스크롤을 켠다.
// ①일반적인 폴더 크기에서는 완전히 기존(검증된) 렌더링 경로를 그대로 타므로 회귀 위험이 없고
// ②드래그 재배치는 대상 항목이 전부 DOM에 마운트돼 있어야 dnd-kit이 정확히 동작하는데, 가상 스크롤은
//   화면 밖 항목을 마운트하지 않으므로 드래그 모드에서는 굳이 가상화하지 않고 항상 전체 렌더링한다
//   (직접 순서로 수천 개를 일일이 드래그 정렬하는 경우는 현실적으로 드묾 — 그런 대량 폴더는 이름/날짜/
//   유형/크기 정렬을 쓰는 게 자연스러움). 값은 상수라 필요시 산들이 쉽게 조정 가능.
const VIRTUALIZE_THRESHOLD = 60;
// 이전 폴더(뒤로가기) 버튼용 방문 기록 스택 최대 길이(2026-09-03 신규) — undoStack.ts의
// MAX_ENTRIES(20)보다 넉넉하게 잡음(단순 폴더 이동 기록이라 undo 스냅샷보다 훨씬 가벼움).
const MAX_FOLDER_HISTORY = 50;

// 사이드바 폴더 트리(작업순서 6/8, 2026-09-04 신규)의 useDroppable id 접두어 — 지금 열려 있는
// 폴더를 사이드바에서도 펼쳐 두면 같은 폴더 노드가 본문 타일과 사이드바 행 양쪽에 동시에 그려질 수
// 있는데, dnd-kit은 등록 id가 겹치면 안 되므로(같은 id를 쓰는 두 요소가 서로의 등록을 덮어써 동작이
// 불안정해짐) 사이드바 쪽 id에는 항상 이 접두어를 붙인다(FolderSidebar.tsx 참고). handleDragMove/
// handleDragEnd는 실제 노드 id가 필요할 때 realDropTargetId()로 되돌린다.
const SIDEBAR_DROP_PREFIX = 'sidebar:';
function realDropTargetId(id: string): string {
  return id.startsWith(SIDEBAR_DROP_PREFIX) ? id.slice(SIDEBAR_DROP_PREFIX.length) : id;
}

// 사이드바 드롭 대상 판정 전용 충돌 감지(작업순서 6/8 배포 후 산들 실기기 테스트에서 발견한 버그
// 수정, 2026-09-04) — 기존 closestCenter는 "커서 위치"가 아니라 "끌고 있는 항목(아이콘을 포함한
// 타일 전체, 세로 ~100px) 중심"을 기준으로 가장 가까운 드롭 대상을 고른다. 본문 타일끼리는 크기가
// 서로 비슷해 문제없지만, 사이드바 행은 세로 30px로 훨씬 얇아서, 화면에서는 분명 원하는 행 위에
// 커서가 있어도(사용자 눈에는 "아무 반응 없음"으로 보임) 실제로는 판정이 위/아래로 어긋나 엉뚱한
// 행(심하면 바로 아래의 휴지통 행)으로 이동해버리는 일이 있었다 — 실제 좌표로 재현해 확인함. 사이드바
// 행에 한해서만 "커서가 실제로 그 행 위에 있는가"(pointerWithin, 화면에 보이는 그대로)로 판정하고,
// 사이드바 대상이 없을 때는 본문 영역의 기존 검증된 동작(순서변경 25%/75% 비율 계산 등)을 그대로
// 유지하기 위해 원래 쓰던 closestCenter로 그대로 넘긴다(본문 쪽 로직은 전혀 건드리지 않음).
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const sidebarHit = pointerHits.find((hit) => String(hit.id).startsWith(SIDEBAR_DROP_PREFIX));
  if (sidebarHit) {
    return [sidebarHit];
  }
  return closestCenter(args);
};

// 그리드 타일 최소 너비 — App.css의 .tf-grid-xl/large/medium/small(minmax 하한)과 반드시 일치시켜야
// 컨테이너 너비 기준 열 개수 계산(가상 그리드 행 묶음)이 실제 CSS 레이아웃과 어긋나지 않는다.
const GRID_TILE_MIN_WIDTH: Record<string, number> = { xl: 132, large: 104, medium: 84, small: 64 };
const GRID_GAP = 14; // App.css .tf-grid의 gap과 일치

// 그리드 타일용 드래그 손잡이 — 왼쪽 위 작은 손잡이(⠿)뿐 아니라 아이콘 자체로도 드래그를 시작할
// 수 있게 dnd-kit 리스너를 renderTileBody의 아이콘 버튼에도 함께 건다(2026-09-04, 산들 스크린샷 지적
// — "이동 또는 복사할 때 흰 사각형[=손잡이] 부분을 클릭해야 되는데, 아이콘을 클릭해도 작동하게 해줘").
// 이게 클릭(열기)과 충돌하지 않는 이유: dragSensors의 PointerSensor가 activationConstraint.distance=4로
// 설정돼 있어(handleDragEnd 근처 정의), 포인터가 4px 이상 움직이기 전까지는 dnd-kit이 드래그로 인식하지
// 않고 그냥 일반 클릭(버튼의 onClick=열기)으로 통과시킨다 — 아이콘 손잡이를 추가해도 "가만히 클릭하면
// 열리고, 누른 채 끌면 이동한다"는 동작이 그대로 유지된다. children을 렌더-prop 함수로 바꿔 이 훅의
// attributes/listeners를 renderTileBody 쪽으로 내려보낸다(이름변경 입력창·삭제 버튼 등 다른 요소는
// 그대로 손잡이 없이 유지 — 아이콘 버튼 하나에만 추가).
type DragHandleProps = Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>;

function SortableGridItem({
  id,
  disabled,
  isOver,
  overPosition,
  coDragging,
  dragHandleLabel,
  onContextMenu,
  onClickCapture,
  children
}: {
  id: string;
  disabled: boolean;
  isOver: boolean;
  overPosition: 'before' | 'after' | 'into' | null;
  coDragging?: boolean;
  dragHandleLabel: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
  children: (dragProps: DragHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || coDragging ? 0.4 : 1
  };
  const dropClass =
    isOver && overPosition === 'before'
      ? ' tf-tile-drop-before'
      : isOver && overPosition === 'after'
        ? ' tf-tile-drop-after'
        : isOver && overPosition === 'into'
          ? ' tf-tile-drop-into'
          : '';
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={'tf-tile' + dropClass}
      onContextMenu={onContextMenu}
      onClickCapture={onClickCapture}
    >
      {!disabled && (
        <span className="tf-drag-handle tf-tile-drag-handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
          ⠿
        </span>
      )}
      {children({ attributes, listeners })}
    </div>
  );
}

// 표(자세히) 보기용 드래그 가능 행 — SortableRow(목록)와 완전히 같은 이유·같은 패턴이지만
// <li> 대신 <tr>이라 DOM 요소만 다르다(테이블 안엔 <li>를 못 씀).
function SortableTableRow({
  id,
  disabled,
  isOver,
  overPosition,
  coDragging,
  dragHandleLabel,
  onContextMenu,
  onClickCapture,
  children
}: {
  id: string;
  disabled: boolean;
  isOver: boolean;
  overPosition: 'before' | 'after' | 'into' | null;
  coDragging?: boolean;
  dragHandleLabel: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
  children: (dragProps: DragHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || coDragging ? 0.4 : 1
  };
  const dropClass =
    isOver && overPosition === 'before'
      ? ' tf-row-drop-before'
      : isOver && overPosition === 'after'
        ? ' tf-row-drop-after'
        : isOver && overPosition === 'into'
          ? ' tf-row-drop-into'
          : '';
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={'tf-trow' + dropClass}
      onContextMenu={onContextMenu}
      onClickCapture={onClickCapture}
    >
      <td className="tf-trow-handle-cell">
        {!disabled && (
          <span className="tf-drag-handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
            ⠿
          </span>
        )}
      </td>
      {children({ attributes, listeners })}
    </tr>
  );
}

// 휴지통 타일을 드롭 대상으로 등록 — 형제 정렬용 SortableContext의 sortableIds에는 휴지통을 일부러
// 넣지 않으므로(항상 맨 끝 고정, 순서변경 불가) 별도로 useDroppable을 붙여야 드래그 오버 시 over로
// 잡힌다. 기존 tf-tile-drop-into/tf-row-drop-into 하이라이트를 그대로 재사용(새 CSS 불필요).
// (SortableRow 등과 마찬가지로 모듈 최상위에 둬야 함 — App 안에 두면 렌더마다 새 함수로 취급돼
// 드래그 중(포인터 이동마다 재렌더되는 handleDragMove 때문에) 매번 리마운트되어 버림.)
function TrashDropZoneTile({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={'tf-tile' + (isOver ? ' tf-tile-drop-into' : '')}>
      {children}
    </div>
  );
}

function TrashDropZoneRow({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <tr ref={setNodeRef} className={'tf-trow' + (isOver ? ' tf-row-drop-into' : '')}>
      <td className="tf-trow-handle-cell" />
      {children}
    </tr>
  );
}

function TrashDropZoneListItem({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <li ref={setNodeRef} className={'tf-row' + (isOver ? ' tf-row-drop-into' : '')}>
      {children}
    </li>
  );
}

export default function App() {
  const [store, setStore] = useState<TubeStoreData | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  // 이전 폴더(뒤로가기) 버튼용 방문 기록(2026-09-03 신규, 산들 스크린샷 지시) — 탐색기의
  // 뒤로가기처럼 부모/자식 관계와 무관하게 '방금 전에 보고 있던 폴더'로 돌아간다. 실제 사용자
  // 탐색(navigateToFolder)에서만 쌓이고, 새로고침·동기화로 인한 자동 setCurrentFolderId에는
  // 관여하지 않는다(아래 refresh() 등은 여전히 setCurrentFolderId를 직접 호출).
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState('새 폴더');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState('');
  // 검색(ROADMAP 4단계 "검색", 작업순서 7/8, 2026-09-07 산들 착수 승인) — 폴더/영상 이름 기준
  // 전체 트리 검색. searchFocused는 입력창에 포커스가 있을 때만 결과 드롭다운을 보여주기 위한
  // 것으로, 저장소에는 전혀 반영되지 않는 순수 UI 상태(사이드바 expanded 등과 같은 성격).
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // "휴지통도 검색" 체크박스(2026-09-07, 산들 지시 — 기본은 기존과 동일하게 휴지통 제외, 체크하면
  // 포함). 결과의 경로 표시(nodePathLabel)가 이미 "튜브폴더 / 휴지통 / ..." 형태로 조상 경로를
  // 그대로 보여주므로, 휴지통 안 항목이 섞여도 결과 목록만 보고 바로 구분할 수 있다.
  const [searchIncludeTrash, setSearchIncludeTrash] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  // 재생목록 URL 입력창 가져오기의 목적지 선택 흐름(2026-09-09, "새 폴더를 만들지, 현재 폴더에
  // 넣을지, 다른 폴더에 넣을지 선택하게 하고, 유튜브 우클릭 가져오기 때처럼 중복 안내도 해달라"
  // 요청) — content.ts(유튜브 페이지 우클릭 "이 재생목록 가져오기")에서 이미 만든 정책을 그대로
  // 가져온다: 새 폴더=중복 검사 없이 전체 추가, 기존 폴더(현재 폴더든 다른 폴더든)=그 폴더 안
  // 영상과 이름이 같은 항목만 제외. 다만 여기는 "같은 이름 폴더가 있어서 자동으로 물어보는" 게
  // 아니라 사용자가 매번 목적지를 직접 고르는 방식이라 충돌 자동 감지 단계가 없다.
  type ImportFlow =
    | { stage: 'choose-destination'; videos: PlaylistVideo[]; apiFailReason: string | null }
    | { stage: 'name-new-folder'; videos: PlaylistVideo[]; apiFailReason: string | null }
    | { stage: 'pick-folder'; videos: PlaylistVideo[]; apiFailReason: string | null }
    // (2026-09-09, "현재 폴더/다른 폴더에 넣을 때는 실행 직전에 폴더 이름을 보여주고 확인하는
    // 팝업을 띄워달라" 요청) "현재 폴더" 버튼을 누르거나 "다른 폴더" 폴더 선택을 마친 직후, 실제
    // 추가(runImport) 전에 한 번 더 거치는 확인 단계. "새 폴더 만들기"는 이름 입력 팝업 자체가
    // 이미 확인 단계 역할을 하므로 이 단계를 거치지 않는다.
    | { stage: 'confirm-existing'; videos: PlaylistVideo[]; apiFailReason: string | null; folderId: string; folderName: string };
  const [importFlow, setImportFlow] = useState<ImportFlow | null>(null);
  const [importNewFolderName, setImportNewFolderName] = useState('');
  interface ImportResultInfo {
    total: number;
    duplicateNames: string[];
    added: number;
    finalCount: number;
    apiFailReason: string | null;
  }
  const [importResult, setImportResult] = useState<ImportResultInfo | null>(null);
  const [importDupListOpen, setImportDupListOpen] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<VideoNode | null>(null);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [licenseOpenSignal, setLicenseOpenSignal] = useState(0);
  // 무료 버전 한도(폴더/영상 개수)에 걸렸을 때 보여줄 안내 팝업 메시지(2026-09-10, "유료 버전
  // 전용 기능이 제한될 때 안내 팝업" 요청) — LicenseLimitNotice.tsx 참고. null이면 안 뜬 상태.
  const [licenseLimitMessage, setLicenseLimitMessage] = useState<string | null>(null);
  // 휴지통 보관기간 변경 확인 흐름 — null이면 확인 대기 중이 아님(선택만 바꾼 상태)
  const [pendingRetentionDays, setPendingRetentionDays] = useState<number | null | undefined>(undefined);
  const [pendingRetentionPreview, setPendingRetentionPreview] = useState(0);
  const [retentionBusy, setRetentionBusy] = useState(false);
  // 삭제(휴지통 이동) 시 뜨는 보관기간 정책 안내 팝업 — 대상 폴더 id가 있으면 열려 있는 상태
  const [trashInfoModalFolderId, setTrashInfoModalFolderId] = useState<string | null>(null);
  const [trashInfoCheckbox, setTrashInfoCheckbox] = useState(false);
  // 폴더 아이콘 선택 패널 — 대상 폴더 id가 있으면 열려 있는 상태(ROADMAP 4단계 "폴더 아이콘 다양화")
  const [iconPickerFolderId, setIconPickerFolderId] = useState<string | null>(null);
  // 영상 상세보기 모달(2026-09-09, "1번 아이콘을 클릭하면 파일의 상세내용을 자세히 볼 수 있도록"
  // 요청) — 대상 영상 id가 있으면 열려 있는 상태. 폴더는 대상이 아니다(요청 확인 시 "영상만"으로 확정).
  const [detailViewNodeId, setDetailViewNodeId] = useState<string | null>(null);

  // 실행취소(undo) — 토스트에 뭘 보여줄지만 이 컴포넌트가 들고 있고, 실제 스택 데이터는
  // undoStack.ts 모듈이 관리한다(2026-08-29 신규, ROADMAP-CHECKLIST.md 참고).
  // kind: 'info'는 되돌릴 동작이 없는 단순 안내(2026-09-09, 영상 카카오톡/문자 공유 시
  // "링크가 복사되었습니다" 안내용으로 추가) — 실행취소/다시 실행 버튼 없이 문구만 보여준다.
  const [toast, setToast] = useState<{ label: string; kind: 'undo' | 'redo' | 'info'; ts: number } | null>(null);
  // 상시 실행취소/다시 실행 버튼(2026-09-03, 화면 하단 토스트 버튼의 시인성 문제로 상단에 신설) —
  // undoStack.ts는 React state가 아닌 모듈 전역이라 useSyncExternalStore로 구독해 개수만 반응형으로
  // 받는다. 개수가 0이면 버튼을 흐리게(disabled) 표시.
  const undoSize = useSyncExternalStore(subscribeUndoStack, getUndoSize);
  const redoSize = useSyncExternalStore(subscribeUndoStack, getRedoSize);
  // "다른 폴더로 이동" 대상 선택 모달을 열 때, 어떤 노드를 옮기는 중인지 기억해둔다.
  // "다른 폴더로 이동" 대상 선택 모달 — 단일 이동(📁 버튼)이든 다중 선택 후 일괄 이동이든
  // 옮길 노드 id 배열 하나로 통일해서 처리한다(길이 1이면 기존 단일 이동과 동일하게 동작).
  const [moveDialogIds, setMoveDialogIds] = useState<string[] | null>(null);
  // 재생(정렬순/무작위·1회/무한 선택) 다이얼로그 — "▶ 폴더 재생"(폴더 안 영상 전체)이나 다중
  // 선택 툴바의 "▶ 재생"을 누르면 대상 영상 목록을 여기 담아 다이얼로그를 연다(2026-09-10 신설,
  // "정렬된 순서/무작위 순차재생 + 다중선택 재생 + 1회/무한재생" 요청). playbackQueue.ts가 실제
  // 재생 큐 상태·다음 곡 계산을 담당하고, 여기서는 "재생 시작" 클릭 시 그 큐를 채우고 첫 영상만
  // handleVideoClick과 동일하게 window.open()으로 연다.
  const [playbackDialogNodes, setPlaybackDialogNodes] = useState<VideoNode[] | null>(null);
  // 다중 선택(ROADMAP 4단계 "다중 선택 + 일괄 이동/삭제", 작업순서 2/8, 2026-08-30 산들 착수 승인) —
  // 체크박스 클릭(추가/해제)·Shift+클릭(범위 선택)으로 고른다. 폴더를 옮기면 선택 대상 자체가
  // 의미 없어지므로 currentFolderId가 바뀔 때마다 자동으로 비운다(아래 useEffect).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAnchorId, setSelectAnchorId] = useState<string | null>(null);
  const [bulkTrashConfirming, setBulkTrashConfirming] = useState(false);
  // (2026-09-09, "삭제를 클릭했을 때 이 메시지가 마우스를 클릭한 자리에서 팝업으로 뜨게 해줘.
  // 이 기능은 없애지 말고 그대로 둬" 요청) 마우스로 삭제를 트리거했을 때(우클릭 메뉴의 "삭제",
  // 툴바의 "🗑 일괄 휴지통 이동" 버튼) 그 클릭 좌표를 기억해뒀다가, 아래 다중 선택 툴바의 기존
  // 확인 UI(tf-confirm-row)는 그대로 둔 채 마우스 위치에 별도 팝업으로도 같은 확인 UI를 띄운다
  // — 둘 다 동일한 bulkTrashConfirming/handleBulkTrash를 공유하므로 어느 쪽에서 눌러도 동작은
  // 같다. Delete 키처럼 마우스 좌표가 없는 경로는 null로 둬 팝업 없이 기존 툴바 UI만 나타난다.
  const [deleteConfirmPos, setDeleteConfirmPos] = useState<{ x: number; y: number } | null>(null);
  // 우클릭 클립보드(복사·잘라내기·붙여넣기, 작업순서 4/8, 2026-08-31 산들 착수 승인) — 탐색기의
  // Ctrl+C/X/V에 해당. 저장소에 남기지 않고 이 세션(탭)이 살아있는 동안만 메모리에 들고 있는다
  // (탐색기도 클립보드는 앱 재시작하면 비워지는 것과 같은 원칙, 굳이 localStorage 등에 영속화할
  // 이유가 없음). mode가 'copy'면 duplicateNode, 'cut'이면 기존 moveNode를 재사용해 붙여넣는다.
  const [clipboard, setClipboard] = useState<{ mode: 'copy' | 'cut'; ids: string[] } | null>(null);
  // 우클릭 컨텍스트 메뉴 — forNode가 true면 특정 항목 위에서 열려 복사/잘라내기도 보여주고,
  // false면 빈 공간에서 열려 붙여넣기·새 폴더를 보여준다. newFolderParentId는 "새 폴더"를 만들
  // 대상 폴더 — 보통 현재 보고 있는 폴더(currentFolderId)지만, 사이드바 빈 공간에서 열렸을 때는
  // (2026-09-09, "사이드바·본문 빈 공간에서 우클릭하면 새 폴더를 만들 수 있게 해달라" 요청) 항상
  // 최상위 폴더(store.rootId)로 고정한다 — 사이드바 트리는 항상 루트부터 시작하고, 빈 공간을
  // 클릭한 자리는 특정 폴더 행이 아니므로 대응되는 폴더가 루트뿐이기 때문.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; forNode: boolean; newFolderParentId: string } | null>(
    null
  );
  // 드래그 재배치(ROADMAP 4단계 "드래그 삽입선 표시") — 현재 드롭 대상 행과, 그 행의 위/아래 중 어디에 삽입될지
  const [overId, setOverId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<'before' | 'after' | 'into' | null>(null);
  // 드래그를 시작한 항목 자체(dnd-kit의 유일한 "active") — 여러 개를 선택한 채 그중 하나를 끌면
  // handleDragEnd에서 선택 전체를 옮기지만, 화면에는 이 항목 하나만 커서를 따라 움직여서 "한 개만
  // 옮기는 것처럼 보인다"는 피드백을 받아 추가(2026-09-03) — 나머지 선택 항목들도 같이 흐리게
  // 표시해 "다같이 들려 있다"는 느낌을 주고, 여러 개일 땐 개수 배지를 커서 옆에 띄운다.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 유튜브 페이지의 "🔒 무료 버전 제한" 미니 팝업에서 "PRO 알아보기"를 눌렀을 때(background.ts의
  // openManagerAndShowLicense()) 매니저 탭이 ?openLicense=1을 달고 열리거나(재)이동해온다 — 마운트
  // 시점에 그 표시를 읽어 라이선스 패널을 강제로 띄운다(2026-09-10, "매니저로 화면만 옮겨가고 PRO
  // 화면이 안 뜬다" 제보로 신설). 새로고침해도 계속 뜨지 않도록 처리 후 쿼리스트링은 지운다.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openLicense') === '1') {
        setLicenseOpenSignal((n) => n + 1);
        params.delete('openLicense');
        const rest = params.toString();
        const newUrl = window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
        window.history.replaceState(null, '', newUrl);
      }
    } catch {
      // URL/History API 접근 실패는 무시 — 패널이 자동으로 안 열려도 치명적이지 않고, 사용자가
      // 직접 PRO 배지를 눌러도 같은 화면으로 갈 수 있다.
    }
    // 마운트 시 한 번만 확인하면 되는 URL 파라미터라 의존성 배열을 비워둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 폴더를 옮겨다니면 이전 폴더에서 고른 선택 항목은 화면에서 사라지므로 의미가 없다 — 탐색기도
  // 폴더를 바꾸면 선택이 풀리는 것과 동일한 관례.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAnchorId(null);
    setBulkTrashConfirming(false);
    setDeleteConfirmPos(null);
  }, [currentFolderId]);

  // (2026-09-09, "'이 재생목록 가져오기' 할 때도 새 폴더/현재 폴더/다른 폴더를 선택하게 해달라"
  // 요청) 유튜브 페이지 우클릭 메뉴(content.ts)에는 이 매니저 탭 같은 "지금 보고 있는 폴더"
  // 개념이 원래 없어서, "매니저 탭에 지금 열려있는 폴더"를 그쪽에서도 참고할 수 있도록 매번
  // chrome.storage.local에 별도로 기록해둔다(본체 데이터와는 무관한 로컬 전용 상태 —
  // storage.ts의 resolveCurrentFolderId 참고). 휴지통 탭에 있을 때도 그대로 기록하지만, 실제
  // 사용 시점(resolveCurrentFolderId)에서 휴지통이면 무시하고 다음 우선순위로 넘어가므로 여기서
  // 따로 걸러낼 필요는 없다.
  useEffect(() => {
    if (currentFolderId) setOpenFolderId(currentFolderId).catch(() => {});
  }, [currentFolderId]);

  // 실제 "사용자가 다른 폴더를 열었다"에 해당하는 지점(목록/그리드/표에서 폴더 열기, breadcrumb
  // 클릭, 상위 폴더 이동)은 전부 setCurrentFolderId를 직접 부르는 대신 이 함수를 거치게 해서
  // 방문 기록을 쌓는다. refresh()의 setCurrentFolderId(동기화·되돌리기 등으로 인한 자동 갱신)는
  // 사용자가 직접 이동한 게 아니므로 일부러 이 함수를 거치지 않고 그대로 둔다.
  function navigateToFolder(id: string) {
    if (currentFolderId && currentFolderId !== id) {
      setFolderHistory((h) => [...h, currentFolderId].slice(-MAX_FOLDER_HISTORY));
    }
    setCurrentFolderId(id);
  }

  // ◀ 이전 폴더 — 부모/자식 관계와 무관하게 방문 기록(LIFO)에서 하나 꺼내 그 폴더로 돌아간다.
  // 브라우저 뒤로가기와 같은 개념(다시 앞으로 가는 "다음 폴더" 버튼은 이번 범위 밖).
  function handleGoBack() {
    if (folderHistory.length === 0) return;
    const prevId = folderHistory[folderHistory.length - 1];
    setFolderHistory((h) => h.slice(0, -1));
    setCurrentFolderId(prevId);
  }

  // ▲ 상위 폴더 — 지금 폴더의 부모로 한 단계만 이동. navigateToFolder를 거치므로 이 이동도
  // "이전 폴더"로 다시 되돌아올 수 있다(탐색기에서 위로 이동도 뒤로가기 기록에 남는 것과 동일).
  function handleGoUp() {
    const parentId = currentFolderId ? store?.nodes[currentFolderId]?.parentId : null;
    if (!parentId) return;
    navigateToFolder(parentId);
  }

  // 검색 결과 클릭 — 폴더면 그 폴더로, 영상이면 그 영상이 들어있는 폴더로 이동한다(검색 자체에서
  // 바로 재생하지는 않음, "결과 클릭 시 해당 폴더로 이동"이라는 요구사항 그대로). navigateToFolder를
  // 거치므로 방문 기록(◀ 이전 폴더)에도 정상적으로 쌓인다.
  function handleSearchResultClick(node: TubeNode) {
    const targetFolderId = node.type === 'folder' ? node.id : node.parentId;
    if (targetFolderId) navigateToFolder(targetFolderId);
    setSearchQuery('');
  }

  const refresh = useCallback(async (keepFolderId?: string | null) => {
    const data = await load();
    setStore(data);
    const wanted = keepFolderId ?? data.rootId;
    setCurrentFolderId(data.nodes[wanted] ? wanted : data.rootId);
  }, []);

  // 동기화 등 비동기 콜백이 "지금 보고 있는 폴더"를 유지한 채 새로고침할 수 있게 ref로 추적
  const currentFolderIdRef = useRef<string | null>(null);
  // 체크박스 부활(2026-09-09, "2번 체크박스는 다시 살려" 요청) — onClick에서 shiftKey 여부를 잠깐
  // 담아뒀다가 onChange에서 꺼내 쓰는 용도. 체크박스는 onClick(클릭 시점의 shiftKey 포함)과
  // onChange(실제 토글) 이벤트가 분리돼 있어 이렇게 넘겨야 한다(원래 있던 방식 그대로 복원).
  const checkboxShiftRef = useRef(false);
  currentFolderIdRef.current = currentFolderId;
  const refreshKeepingFolder = useCallback(() => {
    refresh(currentFolderIdRef.current);
  }, [refresh]);

  useEffect(() => {
    // 자동 비우기: 앱을 열 때마다 보관기간이 지난 휴지통 항목을 조용히 정리(ROADMAP 4단계).
    // 항상 켜져 있는 백그라운드 타이머가 아니라 "열 때 확인"하는 방식이라, 오래 안 열어도
    // 데이터가 유실되진 않고 다음에 열 때 한꺼번에 정리된다.
    purgeExpiredTrash()
      .catch(() => {})
      .finally(() => refresh());
  }, [refresh]);

  // background 자동 동기화가 병합 결과를 저장하면(다른 컨텍스트의 쓰기) 화면을 따라 갱신 — 오프라인 우선 원칙 ③의
  // "원격 확인·병합은 백그라운드, UI는 변경 감지로 자동 반영" 경로. 프리뷰(localStorage 폴백)에서는 이벤트가 없어 무시.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]) refreshKeepingFolder();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refreshKeepingFolder]);

  // PWA(독립 웹페이지) 전용 주기·포그라운드 동기화 트리거. 크롬 확장은 background.ts의
  // chrome.alarms(15분 주기)가 이 역할을 대신하므로 중복 실행하지 않는다.
  useEffect(() => {
    const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    if (isExtension) return;
    const tick = () => runSync('auto').catch(() => {});
    const interval = setInterval(tick, 15 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const currentFolder = store && currentFolderId ? store.nodes[currentFolderId] : null;

  const children = useMemo(() => {
    if (!store || !currentFolderId) return [];
    const list: TubeNode[] = [];
    for (const id in store.nodes) {
      const n = store.nodes[id];
      if (n.parentId === currentFolderId && n.id !== store.trashId) list.push(n);
    }
    const sorted = sortNodes(list, store.settings.sortKey, store.settings.sortDir, store);
    // 휴지통은 루트에서만, 항상 맨 마지막 고정(DATA-MODEL.md 불변식 I3)
    if (currentFolderId === store.rootId) sorted.push(store.nodes[store.trashId]);
    return sorted;
  }, [store, currentFolderId]);

  // "▶ 폴더 재생" 대상 — 지금 보고 있는 폴더의 직계 영상만, children이 이미 현재 정렬 설정(이름/
  // 날짜/직접순서 등, 오름·내림차순)대로 정렬돼 있으므로 그 순서를 그대로 재생 순서로 쓴다("정렬된
  // 순서대로 순차 재생" 요청 그대로).
  const folderVideoNodes = useMemo(() => children.filter((n): n is VideoNode => isVideo(n)), [children]);

  // 드래그 재배치 대상 id 목록 — 휴지통 제외(항상 마지막 고정, 드래그 불가)
  const sortableIds = useMemo(() => children.filter((n) => n.id !== store?.trashId).map((n) => n.id), [children, store]);
  // handleDragEnd의 idsToMove와 같은 규칙(드래그 시작 항목이 다중 선택의 일부면 선택 전체) —
  // 드래그 중 시각 피드백(흐리게 표시할 항목들, 배지 개수)에 그대로 재사용.
  const activeDragIds = useMemo(() => {
    if (!activeDragId) return [];
    return selectedIds.has(activeDragId) && selectedIds.size > 1 ? Array.from(selectedIds) : [activeDragId];
  }, [activeDragId, selectedIds]);
  const isManualSort = store?.settings.sortKey === 'none';
  const isGrid = !!store && GRID_VIEW_KEYS.has(store.settings.view);
  const isTable = store?.settings.view === 'details';

  // (2026-09-09, "사이드바 빈 공간에서 우클릭하면 새 폴더를 만들 수 있게 해달라" 요청) 사이드바
  // <nav> 실제 DOM — 아래 document 배경 우클릭 폴백이 클릭 x좌표가 이 요소의 가로 범위 안인지로
  // "사이드바 칸에서 우클릭했는지"를 판단한다. 사이드바는 내용(폴더 트리)만큼만 높이를 차지해서
  // (max-height일 뿐 height 고정이 아님) 트리 아래쪽 빈 공간은 이 요소의 실제 DOM 영역 밖이지만,
  // x좌표만 보면 "왼쪽 컬럼 vs 오른쪽 컬럼" 구분에는 충분하다(y좌표는 보지 않음). 좁은 화면(모바일)
  // 에서는 CSS로 사이드바 자체가 display:none이라 getBoundingClientRect().width가 0이 되므로
  // 자연히 "사이드바 칸 아님" 판정으로 빠진다.
  const sidebarNavRef = useRef<HTMLElement | null>(null);

  // 가상 스크롤 적용 여부 — 위 VIRTUALIZE_THRESHOLD 주석 참고.
  const useVirtual = !isManualSort && children.length > VIRTUALIZE_THRESHOLD;
  const scrollParentRef = useRef<HTMLDivElement>(null);

  // 그리드 가상화용 컨테이너 실측 너비 — CSS auto-fill과 동일한 방식으로 열 개수를 계산해야
  // 가상 "행" 묶음이 실제 화면에 그려지는 열 배치와 어긋나지 않는다.
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridContainerWidth, setGridContainerWidth] = useState(0);
  useEffect(() => {
    if (!useVirtual || !isGrid) return;
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setGridContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setGridContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [useVirtual, isGrid, currentFolderId]);

  const gridColumns =
    useVirtual && isGrid && store && gridContainerWidth > 0
      ? Math.max(1, Math.floor((gridContainerWidth + GRID_GAP) / (GRID_TILE_MIN_WIDTH[store.settings.view] + GRID_GAP)))
      : 1;

  // 가상 스크롤용 그리드 "행" 묶음 — 컨테이너 너비로 계산한 열 개수(gridColumns)만큼씩 잘라
  // 한 행에 여러 타일을 담고, 그 행 단위로 가상화한다(1단계 설계 결정: "그리드는 컨테이너 너비로
  // 열 개수를 계산해 N개씩 묶은 가상 행을 가상화").
  const gridRows = useMemo(() => {
    if (!useVirtual || !isGrid) return [] as TubeNode[][];
    const rows: TubeNode[][] = [];
    for (let i = 0; i < children.length; i += gridColumns) {
      rows.push(children.slice(i, i + gridColumns));
    }
    return rows;
  }, [children, gridColumns, useVirtual, isGrid]);

  // 목록·표는 항목 1개=행 1개라 가상화기 하나를 공유(둘 다 children을 그대로 씀).
  const itemVirtualizer = useVirtualizer({
    count: useVirtual ? children.length : 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 48,
    overscan: 8
  });
  const gridRowVirtualizer = useVirtualizer({
    count: useVirtual && isGrid ? gridRows.length : 0,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 140,
    overscan: 4
  });

  const breadcrumb = useMemo(() => {
    if (!store || !currentFolderId) return [];
    const chain: TubeNode[] = [];
    let cursor: TubeNode | undefined = store.nodes[currentFolderId];
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.parentId ? store.nodes[cursor.parentId] : undefined;
    }
    return chain;
  }, [store, currentFolderId]);

  // 검색 결과(작업순서 7/8) — 정규화된 노드 맵을 한 번 훑는 것으로 "전체 트리 재귀 탐색"과 같은
  // 효과를 낸다(트리 형태는 부모 링크로만 존재하고 실제 저장은 평평한 맵이라 재귀 순회가 필요 없음).
  // 결과가 너무 많으면 드롭다운이 비대해지므로 이름순 정렬 후 50개로 제한.
  const searchResults = useMemo(() => {
    if (!store) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: TubeNode[] = [];
    for (const id in store.nodes) {
      const n = store.nodes[id];
      if (n.id === store.rootId) continue; // 루트 자신은 항상 갈 수 있는 곳이라 검색 의미 없음
      if (!n.name.toLowerCase().includes(q)) continue;
      if (!searchIncludeTrash && isUnderTrash(store, n)) continue;
      matches.push(n);
    }
    matches.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return matches.slice(0, 50);
  }, [store, searchQuery, searchIncludeTrash]);

  // 다중 선택 토글 — 체크박스 클릭(shiftKey=false)은 그 항목 하나만 추가/해제, Shift+클릭은
  // 마지막으로 클릭한 항목(selectAnchorId)부터 지금 클릭한 항목까지 현재 폴더 목록(children) 순서
  // 기준으로 범위 전체를 선택한다(탐색기 Shift+클릭 관례, 기존 선택은 범위로 교체됨).
  function toggleSelect(id: string, shiftKey: boolean) {
    if (!store) return;
    const orderedIds = children.filter((n) => n.id !== store.trashId).map((n) => n.id);
    if (shiftKey && selectAnchorId) {
      const a = orderedIds.indexOf(selectAnchorId);
      const b = orderedIds.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(new Set(orderedIds.slice(lo, hi + 1)));
        return;
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAnchorId(id);
  }

  // 우클릭 컨텍스트 메뉴 열기 — id가 있으면(항목 위 우클릭) 그 항목이 이미 선택돼 있지 않을 때만
  // 선택을 그 항목 하나로 교체한다(탐색기 관례: 선택 안 된 항목을 우클릭하면 그 항목만 선택되고,
  // 이미 여러 개 선택된 상태에서 그중 하나를 우클릭하면 선택 전체가 유지됨 — 이 경우 복사/잘라내기가
  // 선택 전체에 적용됨). id가 없으면(빈 공간 우클릭) 붙여넣기만 보여준다. 휴지통 폴더 자체나 휴지통
  // 안에서는 클립보드 개념이 없어 메뉴를 띄우지 않는다(기존 이동/복원 버튼 전환과 같은 원칙).
  // e는 React.MouseEvent(항목·컨테이너에 직접 붙인 핸들러)와 네이티브 MouseEvent(아래
  // document 레벨 배경 우클릭 폴백)를 둘 다 받을 수 있게 최소 구조 타입으로 받는다.
  function openContextMenu(
    e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number },
    id: string | null,
    newFolderParentId?: string
  ) {
    if (currentFolderId === store?.trashId) return;
    if (id && id === store?.trashId) return;
    // 아이콘 선택·이동 대상 선택·이름변경 등 다른 모달/편집 UI가 이미 열려있으면 겹쳐서 뜨지
    // 않게 무시한다(전역 단축키 effect의 modalOpen 판단과 같은 기준).
    if (
      editingId ||
      deletingId ||
      iconPickerFolderId ||
      trashInfoModalFolderId ||
      detailViewNodeId ||
      (moveDialogIds && moveDialogIds.length > 0) ||
      pendingRetentionDays !== undefined ||
      playingVideo ||
      emptyingTrash ||
      importFlow ||
      importResult
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (id && !selectedIds.has(id)) {
      setSelectedIds(new Set([id]));
      setSelectAnchorId(id);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, forNode: !!id, newFolderParentId: newFolderParentId ?? currentFolderId ?? '' });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  // 배경(빈 공간) 우클릭 폴백 — .tf-grid/.tf-table/.tf-list/.tf-scroll-area에 직접 붙인
  // onContextMenu만으로는 부족하다는 걸 산들 피드백으로 발견: 이 앱은 카드형 레이아웃
  // (.tf-app이 max-width:720px로 가운데 정렬)이라 항목이 몇 개 없으면 그 카드 자체의 실제
  // 높이가 브라우저 창보다 훨씬 작은데, 페이지 배경(#0f0f0f)은 화면 전체를 채우고 있어서
  // 눈에는 "빈 공간"이 카드 안팎 구분 없이 이어져 보인다 — 그런데 실제 DOM에서는 그 아래
  // 여백이 .tf-grid 등의 테두리 밖(문서 자체)이라 위 컨테이너별 핸들러가 안 잡혔음.
  // document에 한 번만 등록해 화면 전체를 커버한다 — 항목·컨테이너 위에서 이미 처리된
  // 우클릭은 그쪽 openContextMenu()가 stopPropagation()을 호출해 여기까지 올라오지
  // 않으므로 중복 실행되지 않는다. 입력창·버튼 등 실제 조작 요소 위에서는 브라우저 기본
  // 메뉴(복사/붙여넣기 등)를 그대로 두는 게 자연스러워 그런 요소는 건드리지 않는다.
  useEffect(() => {
    function onDocumentContextMenu(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, button, select, a, [role="menu"], [role="dialog"]')) return;
      // (2026-09-09, "사이드바·본문 빈 공간에서 우클릭하면 새 폴더를 만들 수 있게 해달라" 요청)
      // 이 폴백 하나가 사이드바 쪽 빈 공간과 본문 쪽 빈 공간을 둘 다 잡는다(둘 다 카드 실제 높이
      // 밖의 문서 배경) — 클릭 x좌표가 사이드바 <nav>의 가로 범위 안이면 "새 폴더"의 대상을
      // 최상위 폴더로, 아니면 지금 보고 있는 폴더(기존 동작, openContextMenu의 기본값)로 고정한다.
      const sidebarRect = sidebarNavRef.current?.getBoundingClientRect();
      const inSidebarColumn = !!sidebarRect && sidebarRect.width > 0 && e.clientX >= sidebarRect.left && e.clientX < sidebarRect.right;
      openContextMenu(e, null, inSidebarColumn && store ? store.rootId : undefined);
    }
    document.addEventListener('contextmenu', onDocumentContextMenu);
    return () => document.removeEventListener('contextmenu', onDocumentContextMenu);
  }, [
    currentFolderId,
    store,
    editingId,
    deletingId,
    iconPickerFolderId,
    trashInfoModalFolderId,
    detailViewNodeId,
    moveDialogIds,
    pendingRetentionDays,
    playingVideo,
    emptyingTrash,
    importFlow,
    importResult,
    selectedIds
  ]);

  function handleCopy() {
    if (selectedIds.size === 0) return;
    setClipboard({ mode: 'copy', ids: Array.from(selectedIds) });
    closeContextMenu();
  }

  function handleCut() {
    if (selectedIds.size === 0) return;
    setClipboard({ mode: 'cut', ids: Array.from(selectedIds) });
    closeContextMenu();
  }

  // 영상 우클릭 → 카카오톡/문자로 공유(2026-09-09 신규, 산들 요청). PC 환경에서는 카카오톡·문자
  // 앱으로 완전 자동 전송할 방법이 없어(각각 별도 API 키/도메인 등록, OS 공유 대상 등록 여부가
  // 불확실) 산들이 직접 고른 방식대로 "제목+링크를 클립보드에 복사 → 해당 앱을 열어 붙여넣기"로
  // 처리한다. target은 안내 문구만 다르고 동작은 동일 — 어느 앱을 열지는 사용자가 직접 고른다.
  async function handleShare(target: 'kakao' | 'sms') {
    closeContextMenu();
    if (!store || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const videos = ids.map((id) => store.nodes[id]).filter((n): n is VideoNode => !!n && isVideo(n));
    if (videos.length === 0) return;
    const text = videos.map((v) => `${v.name}\n${v.url}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API가 막혀 있을 때(권한·포커스 문제 등) execCommand로 대체 — 오래된 방식이지만
      // 우클릭 메뉴 클릭 직후처럼 포커스가 애매한 상황에서 더 안정적으로 동작한다.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      if (!ok) {
        setError('클립보드 복사에 실패했습니다.');
        return;
      }
    }
    const appLabel = target === 'kakao' ? '카카오톡' : '문자 메시지 앱';
    const itemLabel = videos.length === 1 ? `"${videos[0].name}"` : `영상 ${videos.length}개`;
    setToast({ label: `${itemLabel} 링크가 복사되었습니다. ${appLabel}을 열어 붙여넣기(Ctrl+V) 하세요.`, kind: 'info', ts: Date.now() });
  }

  // 항목별 메뉴(우클릭 컨텍스트 메뉴와 동일한 목록, 2026-09-08 "2번 아이콘을 선택하면 복사/삭제/
  // 이동/잘라내기를 선택할 수 있게" 요청으로 신설)의 "이동" — openContextMenu가 이미 클릭한 항목을
  // 선택에 포함시켜 두므로(선택 안 돼 있었으면 그 항목 하나로 교체, 이미 다중 선택 중이었으면 전체
  // 유지) 항상 selectedIds 전체를 대상으로 기존 이동 다이얼로그를 그대로 연다 — 단일 이동(기존 📁
  // 버튼)과 다중 선택 후 일괄 이동(툴바)이 이미 같은 handleConfirmMove로 합쳐져 있는 것과 동일한 원칙.
  function handleMenuMove() {
    closeContextMenu();
    if (selectedIds.size === 0) return;
    setMoveDialogIds(Array.from(selectedIds));
  }

  // 항목별 메뉴의 "삭제" — 선택 개수와 무관하게 항상 다중 선택 툴바의 삭제 확인(bulkTrashConfirming)을
  // 재사용한다. openContextMenu가 메뉴를 열기 전에 이미 selectedIds를 최소 1개로 맞춰두므로(선택 안
  // 됐던 항목이면 그 항목 하나로 교체) 단일 선택도 항상 이 경로로 안전하게 처리된다.
  // (2026-09-09 수정: 예전에는 단일 선택일 때 handleTrashClick(개별 삭제 흐름, 폴더 행의 인라인
  // 확인 UI에 의존)으로 갈라졌는데, 영상 행에는 그 인라인 확인 UI가 이제 없어서(체크박스로 대체)
  // 영상 하나를 우클릭 메뉴로 삭제하면 확인 UI가 아예 뜨지 않는 버그가 있었다 — 폴더·영상 모두
  // 있는 툴바 확인 UI 하나로 통일해 해결.)
  function handleMenuDelete() {
    // 컨텍스트 메뉴가 열렸던 우클릭 좌표를 팝업 위치로 재사용 — closeContextMenu()가 그 상태를
    // 지우기 전에 먼저 읽어둔다(2026-09-09, 마우스 위치 팝업 요청).
    const pos = contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null;
    closeContextMenu();
    if (selectedIds.size === 0) return;
    setBulkTrashConfirming(true);
    setDeleteConfirmPos(pos);
  }

  // 붙여넣기는 항상 "지금 보고 있는 폴더"(currentFolderId)를 대상으로 한다 — 우클릭한 항목이
  // 폴더여도 그 폴더 "안"에 붙여넣지는 않는다(탐색기처럼 "여기에 붙여넣기" 세부 대상까지는
  // 이번 범위에서 제외 — 범위를 좁게 유지하는 편이 혼란이 적다고 판단).
  // 복사(copy)는 duplicateNode를 반복 호출해 사본을 만들고 클립보드를 비우지 않는다(탐색기처럼
  // 같은 걸 여러 폴더에 반복해서 붙여넣을 수 있게). 잘라내기(cut)는 기존 moveNode를 재사용하고,
  // 한 번 붙여넣으면 클립보드를 비운다(탐색기 관례 — 오려낸 항목은 한 번만 옮겨감).
  // 둘 다 스냅샷은 배치 시작 전 한 번만 떠서 Ctrl+Z 한 번에 전체가 되돌아간다(2/8과 같은 패턴).
  async function handlePaste() {
    if (!clipboard || !currentFolderId || currentFolderId === store?.trashId) return;
    closeContextMenu();
    setError(null);
    try {
      const before = await load();
      if (clipboard.mode === 'copy') {
        const label =
          clipboard.ids.length === 1 ? `"${before.nodes[clipboard.ids[0]]?.name ?? ''}" 복사` : `${clipboard.ids.length}개 항목 복사`;
        for (const id of clipboard.ids) {
          if (!before.nodes[id]) continue; // 복사한 뒤 원본이 지워졌으면 조용히 건너뜀
          await duplicateNode(id, currentFolderId);
        }
        pushUndo({ label, snapshot: before });
        await refresh(currentFolderId);
        scheduleAutoSync();
        setToast({ label, kind: 'undo', ts: Date.now() });
      } else {
        const label =
          clipboard.ids.length === 1
            ? `"${before.nodes[clipboard.ids[0]]?.name ?? ''}" 이동(붙여넣기)`
            : `${clipboard.ids.length}개 항목 이동(붙여넣기)`;
        for (const id of clipboard.ids) {
          const n = before.nodes[id];
          if (!n) continue; // 잘라낸 뒤 원본이 지워졌으면 조용히 건너뜀
          if (n.parentId === currentFolderId) continue; // 이미 이 폴더면 moveNode 에러 대신 조용히 건너뜀
          await moveNode(id, currentFolderId);
        }
        pushUndo({ label, snapshot: before });
        setClipboard(null);
        await refresh(currentFolderId);
        scheduleAutoSync();
        setToast({ label, kind: 'undo', ts: Date.now() });
      }
    } catch (e) {
      // 복사(duplicateNode)도 새 폴더/영상을 만드는 동작이라 무료 한도(LicenseLimitError)에 걸릴 수
      // 있다(2026-09-10, "복사·붙여넣기 했을 때도 예전 안내 메시지가 뜬다" 제보로 추가 — 다른 5개
      // 지점과 같은 패턴).
      if (e instanceof LicenseLimitError) {
        setLicenseLimitMessage(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // 실행취소/다시 실행/F2(이름변경)/Delete(휴지통 이동)/Ctrl+C·X·V(복사·잘라내기·붙여넣기)
  // 전역 단축키. 실행취소는 Ctrl+Z/Cmd+Z, 다시 실행은 Ctrl+Y(윈도우 관례)와 Ctrl+Shift+Z/
  // Cmd+Shift+Z(맥·여러 앱 공통 관례)를 모두 지원한다(2026-08-29 "다시 실행 기능도 추가해줘"
  // 요청으로 추가). F2/Delete/Ctrl+C/X/V는 다중 선택(2/8, selectedIds)이
  // 이미 있어야 "지금 어떤 항목에 적용할지"를 알 수 있어서 그 기능 이후로 미뤄뒀던 항목들
  // (작업순서 3/8·4/8, 2026-08-30 산들 착수 승인) — F2는 폴더 하나만 선택돼 있을 때 기존 ✏️
  // 버튼과 동일하게 이름변경 모드로 진입시키고(영상은 이름변경 자체가 없어 대상에서 제외),
  // Delete는 선택된 항목(폴더 또는 영상)이 있으면 다중 선택 툴바의 🗑 버튼을 누른 것과 동일하게
  // 확인 단계(bulkTrashConfirming)부터 띄운다(즉시 삭제하지 않음 — 탐색기 Delete 키도 기본적으로
  // 확인을 거치는 것과 같은 원칙, 2026-09-08 trashFolder→trashNode 일반화로 영상도 대상에 포함).
  // Ctrl+C/X는 handleCopy/handleCut, Ctrl+V는 handlePaste를 그대로 호출한다(우클릭 메뉴와 동일한
  // 함수 재사용 — 작업순서 4/8, 우클릭 컨텍스트 메뉴 참고).
  // 이름변경 입력창 등 편집 가능한 요소에 포커스가 있거나, 다른 모달/확인 UI가 이미 열려있을
  // 때는 건드리지 않는다 — 브라우저 기본 텍스트 undo/redo·복사/붙여넣기를 가로채면 안 되고,
  // 모달 뒤에서 배경 단축키가 같이 발동하면 혼란스럽기 때문. (App.tsx에 keydown 리스너가
  // 이것 하나뿐)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const isUndo = mod && !e.shiftKey && key === 'z';
      const isRedo = mod && ((e.shiftKey && key === 'z') || key === 'y');
      const isF2 = !mod && key === 'f2';
      const isDelete = !mod && key === 'delete';
      const isCopy = mod && !e.shiftKey && key === 'c';
      const isCut = mod && !e.shiftKey && key === 'x';
      const isPaste = mod && !e.shiftKey && key === 'v';
      if (!isUndo && !isRedo && !isF2 && !isDelete && !isCopy && !isCut && !isPaste) return;
      const el = document.activeElement;
      // 체크박스(다중 선택)에 포커스가 있는 상태에서도 F2/Delete/Ctrl+Z가 먹어야 하므로, 실제로
      // 텍스트를 입력하는 요소(텍스트 입력창·textarea·contentEditable)만 "편집 중"으로 취급한다
      // — HTMLInputElement라고 전부 막으면 체크박스 클릭 직후 포커스가 그 위에 남아있어 단축키가
      // 아무 반응도 안 하는 것처럼 보이는 문제가 있었음(자체 테스트로 발견·수정).
      const isTextInput =
        el instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(el.type);
      const isEditable = isTextInput || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable;
      if (isEditable) return;

      if (isUndo || isRedo) {
        e.preventDefault();
        if (isUndo) performUndo();
        else performRedo();
        return;
      }

      const modalOpen = Boolean(
        editingId ||
          deletingId ||
          iconPickerFolderId ||
          trashInfoModalFolderId ||
          detailViewNodeId ||
          (moveDialogIds && moveDialogIds.length > 0) ||
          pendingRetentionDays !== undefined ||
          playingVideo ||
          emptyingTrash ||
          importFlow ||
          importResult
      );
      if (modalOpen) return;

      if (isF2) {
        if (selectedIds.size !== 1) return;
        const id = Array.from(selectedIds)[0];
        const node = store?.nodes[id];
        if (!node || node.type !== 'folder') return;
        e.preventDefault();
        setEditingId(id);
        setEditingValue(node.name);
        return;
      }

      if (isDelete) {
        if (currentFolderId === store?.trashId) return; // 휴지통 안에서는 Delete로 할 동작이 없음(영구삭제 없음)
        if (selectedIds.size === 0) return;
        e.preventDefault();
        setBulkTrashConfirming(true);
        setDeleteConfirmPos(null); // 키보드 트리거는 마우스 좌표가 없으니 팝업 없이 툴바 확인 UI만
        return;
      }

      if (isCopy || isCut) {
        if (currentFolderId === store?.trashId) return; // 휴지통 안 항목은 복사/잘라내기 대상에서 제외(이동/복원 버튼과 같은 원칙)
        if (selectedIds.size === 0) return;
        e.preventDefault();
        if (isCopy) handleCopy();
        else handleCut();
        return;
      }

      if (isPaste) {
        if (!clipboard || currentFolderId === store?.trashId) return;
        e.preventDefault();
        handlePaste();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentFolderId,
    store,
    selectedIds,
    editingId,
    deletingId,
    iconPickerFolderId,
    trashInfoModalFolderId,
    detailViewNodeId,
    moveDialogIds,
    pendingRetentionDays,
    playingVideo,
    emptyingTrash,
    importFlow,
    importResult,
    clipboard,
  ]);

  // 우클릭 컨텍스트 메뉴는 열려있을 때만 리스너를 등록해 Esc로 닫는다(위 전역 단축키 effect와
  // 분리한 이유: contextMenu가 열고 닫힐 때마다 저 큰 리스너를 통째로 재등록할 필요는 없음).
  useEffect(() => {
    if (!contextMenu) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeContextMenu();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextMenu]);

  // (2026-09-09, "사이드바·본문 빈 공간에서 우클릭하면 새 폴더를 만들 수 있게 해달라" 요청)
  // 컨텍스트 메뉴의 "📁 새 폴더" 항목 전용 — 툴바의 handleCreateFolder()와 달리 이름 입력창이
  // 옆에 없으므로(우클릭한 자리에 바로 뜨는 메뉴라), 탐색기 관례대로 기본 이름("새 폴더", 겹치면
  // createFolder()가 자동으로 "새 폴더(2)"식으로 번호를 붙임)으로 즉시 만든 뒤, 그 자리에서 바로
  // 이름을 고칠 수 있도록 인라인 이름변경 모드로 넣어준다(기존 ✏️ 버튼과 같은 editingId 메커니즘
  // 재사용). parentId가 currentFolderId와 다르면(사이드바 빈 공간 → 최상위 폴더) refresh()가
  // 그 폴더로 화면을 전환해줘서, 새로 만든 폴더가 바로 눈에 보이는 상태에서 이름을 고칠 수 있다.
  async function handleContextCreateFolder(parentId: string) {
    setError(null);
    try {
      const folder = await createFolder(parentId, '새 폴더');
      // handleCreateFolder()와 같은 이유(추적 안 되는 변경) — 실행취소 스택을 비운다.
      clearUndo();
      setToast(null);
      await refresh(parentId);
      scheduleAutoSync();
      setEditingId(folder.id);
      setEditingValue(folder.name);
    } catch (e) {
      if (e instanceof LicenseLimitError) {
        setLicenseLimitMessage(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async function handleCreateFolder() {
    setError(null);
    try {
      if (!currentFolderId) return;
      await createFolder(currentFolderId, newFolderName.trim() || '새 폴더');
      setNewFolderName('새 폴더');
      // 실행취소/다시 실행 스택이 가리키는 스냅샷은 전부 "이 시점 이전" 상태다. 지금처럼 스택
      // 추적 밖에서 새 항목이 저장되면 그 스냅샷들은 이 새 폴더가 없던 시절 것이 되어, 나중에
      // save(snapshot)하면 방금 만든 폴더가 통째로 사라진다 — 그런 조용한 데이터 손실을 막기 위해
      // 추적 안 되는 변경이 성공할 때마다 두 스택을 비운다(2026-08-29 "다시 실행" 추가 중 발견).
      clearUndo();
      setToast(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
    } catch (e) {
      if (e instanceof LicenseLimitError) {
        setLicenseLimitMessage(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async function commitRename(id: string) {
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[id]?.name ?? ''}" 이름 변경`;
      await renameFolder(id, editingValue);
      pushUndo({ label, snapshot: before });
      setEditingId(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handlePickIcon(id: string, icon: string | null) {
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[id]?.name ?? ''}" 아이콘 변경`;
      await setFolderIcon(id, icon);
      pushUndo({ label, snapshot: before });
      setIconPickerFolderId(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSortModeChange(mode: Settings['sortKey']) {
    setError(null);
    try {
      await setSortMode(mode);
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSortDirChange(dir: Settings['sortDir']) {
    setError(null);
    try {
      await setSortDir(dir);
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 표 보기 열 헤더 클릭 정렬 — 같은 열을 다시 누르면 방향만 뒤집고, 다른 열을 누르면 그 기준으로
  // 오름차순부터 새로 시작(탐색기 관례). 두 경우 모두 setSort()로 한 번의 load/save에 처리.
  async function handleHeaderSort(key: Settings['sortKey']) {
    if (!store) return;
    setError(null);
    try {
      if (store.settings.sortKey === key) {
        await setSortDir(store.settings.sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        await setSort(key, 'asc');
      }
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleViewChange(view: Settings['view']) {
    setError(null);
    try {
      await setView(view);
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 어느 쪽에 삽입선을 그릴지는 픽셀 위치가 아니라 "지금 순서에서 활성 항목이 대상보다 뒤에 있는가"로
  // 판단한다 — 실제 드롭 결과(handleDragEnd의 arrayMove는 항상 대상 위치로 끼워 넣음)와 항상 일치시키기
  // 위함(픽셀 중심선 비교는 가상화 없는 목록에서도 드래그 중 다른 행이 함께 움직이며 어긋날 수 있었음).
  // dnd-kit의 onDragOver는 대상(overId)이 바뀔 때만 발동해서(같은 대상 위에서 계속 움직여도
  // 재계산되지 않음) 존 판정을 못 함 - 포인터가 움직일 때마다 계속 발동하는 onDragMove로 대신 연결.
  function handleDragStart(event: DragStartEvent) {
    // 사이드바에서 시작한 드래그(2026-09-04 신규 — 사이드바 행끼리 서로 끌어다 놓기)는 id에
    // SIDEBAR_DROP_PREFIX가 붙어 있으므로 실제 노드 id로 되돌려 저장한다. activeDragId는
    // store.nodes 조회·selectedIds 비교·DragOverlay 렌더링 등 전부 접두어 없는 순수 노드 id를
    // 전제로 하는 기존 코드가 그대로 재사용하기 때문(realDropTargetId는 접두어가 없으면 원래
    // 값을 그대로 돌려주므로 본문 드래그에는 영향이 없다).
    setActiveDragId(realDropTargetId(String(event.active.id)));
  }

  function handleDragMove(event: DragMoveEvent) {
    const { active, over } = event;

    // 사이드바 행(2026-09-04 신규, 서로 끌어다 놓기 지원)에서 시작한 드래그인지 여부 — 본문
    // 형제 목록(sortableIds)에 속하지 않는 항목이라 "순서변경(삽입선)" 개념 자체가 의미가 없다.
    const activeRawId = String(active.id);
    const isSidebarSource = activeRawId.startsWith(SIDEBAR_DROP_PREFIX);
    const activeRealId = realDropTargetId(activeRawId);

    if (!over) {
      setOverId(null);
      setOverPosition(null);
      return;
    }

    // 사이드바 폴더 트리(작업순서 6/8, 2026-09-04 신규) 행은 본문 타일과 id가 겹칠 수 있어(지금 열려
    // 있는 폴더를 사이드바에서도 펼쳐 두면 같은 폴더가 본문·사이드바 양쪽에 동시에 그려짐) dnd-kit
    // 등록 id가 서로 충돌하지 않도록 SIDEBAR_DROP_PREFIX를 붙여 구분한다(FolderSidebar.tsx의
    // useDroppable(id) 참고). 여기서는 실제 노드 id로 되돌려 조회한다.
    const overRawId = String(over.id);
    const isSidebarDrop = overRawId.startsWith(SIDEBAR_DROP_PREFIX);
    const overRealId = realDropTargetId(overRawId);

    // 자기 자신 위(사이드바에 펼쳐진 자기 행 포함) — 본문에서는 active.id === over.id로 이미
    // 걸러지던 경우지만, 사이드바는 id가 접두어로 달라서 별도로 한 번 더 확인해야 한다.
    if (overRealId === activeRealId) {
      setOverId(null);
      setOverPosition(null);
      return;
    }

    setOverId(overRawId);

    // 대상이 폴더이고(휴지통 제외) 이미 그 폴더 안이 아니면, 드래그 중인 항목의 세로 중심이
    // 대상 세로 영역 가운데 50%에 들어올 때만 "그 폴더 안으로 이동"(into)으로 판정한다.
    // 위/아래 25%씩은 기존 순서변경(삽입선)과 동일하게 처리 — 탐색기에서 아이콘 정중앙 부근에
    // 놓아야 "그 안으로 들어가는" 동작과 같은 관례를 따른 것.
    const overNode = store?.nodes[overRealId];
    const activeNode = store?.nodes[activeRealId];
    const targetIsFolder = !!overNode && overNode.type === 'folder' && overNode.id !== store?.trashId;
    const alreadyInside = !!activeNode && activeNode.parentId === overNode?.id;

    // 사이드바 행이 대상이거나(기존) 사이드바 행에서 시작한 드래그면(신규) "순서변경(삽입선)"
    // 개념 자체가 의미가 없다 — 위/아래 25%씩 구분 없이 무조건 into로 판정한다.
    if (isSidebarDrop || isSidebarSource) {
      setOverPosition(targetIsFolder && !alreadyInside ? 'into' : null);
      return;
    }

    // 이름순/날짜순 등 자동 정렬에서는 order 필드를 sortNodes()가 무시하므로 형제 순서변경 자체가
    // 화면에 반영되지 않는다 — 그래서 이 모드에서는 "폴더 안으로 이동"만 지원하고 삽입선(순서변경)
    // 판정은 아예 하지 않는다(폴더 위 어디에 놓든 전부 into, 폴더가 아니면 무효). 다중 선택 드래그도
    // 마찬가지로 into 전용으로 처리 — ①여러 항목을 형제 사이 어느 위치로 "함께" 끼워 넣을지는 애초에
    // 잘 정의되지 않는 조작이고 ②DragOverlay가 렌더링되는 동안(개수 배지 표시) dnd-kit이 충돌 판정에
    // 원래 타일이 아니라 오버레이 칩의(훨씬 작은) rect를 쓰게 돼 세로 비율 계산 자체가 부정확해짐.
    if (!isManualSort || activeDragIds.length > 1) {
      setOverPosition(targetIsFolder && !alreadyInside ? 'into' : null);
      return;
    }

    const activeRect = active.rect.current.translated;

    // 대상이 폴더이고(휴지통 제외) 이미 그 폴더 안이 아니면, 드래그 중인 항목의 세로 중심이
    // 대상 세로 영역 가운데 50%에 들어올 때만 "그 폴더 안으로 이동"(into)으로 판정한다.
    // 위/아래 25%씩은 기존 순서변경(삽입선)과 동일하게 처리 — 탐색기에서 아이콘 정중앙 부근에
    // 놓아야 "그 안으로 들어가는" 동작과 같은 관례를 따른 것.
    if (targetIsFolder && !alreadyInside && activeRect) {
      const activeCenterY = activeRect.top + activeRect.height / 2;
      const ratio = (activeCenterY - over.rect.top) / over.rect.height;
      if (ratio > 0.25 && ratio < 0.75) {
        setOverPosition('into');
        return;
      }
    }

    // 어느 쪽에 삽입선을 그릴지는 픽셀 위치가 아니라 "지금 순서에서 활성 항목이 대상보다 뒤에 있는가"로
    // 판단한다 — 실제 드롭 결과(handleDragEnd의 arrayMove는 항상 대상 위치로 끼워 넣음)와 항상 일치시키기
    // 위함(픽셀 중심선 비교는 가상화 없는 목록에서도 드래그 중 다른 행이 함께 움직이며 어긋날 수 있었음).
    const activeIndex = sortableIds.indexOf(activeRealId);
    const targetIndex = sortableIds.indexOf(overRealId);
    setOverPosition(activeIndex > targetIndex ? 'before' : 'after');
  }

  async function handleDragEnd(event: DragEndEvent) {
    const dropPosition = overPosition;
    setOverId(null);
    setOverPosition(null);
    setActiveDragId(null);
    const { active, over } = event;
    // 사이드바 드롭(작업순서 6/8)이나 사이드바에서 시작한 드래그(2026-09-04 신규)는 id에
    // SIDEBAR_DROP_PREFIX가 붙어 있으므로 실제 노드 id로 되돌려 아래 로직 전체(휴지통 판정·
    // moveNode 대상·순서변경 인덱스 조회)에 그대로 재사용한다.
    const overRealId = over ? realDropTargetId(String(over.id)) : null;
    const activeId = realDropTargetId(String(active.id));
    if (!over || overRealId === null || overRealId === activeId || !currentFolderId) return;

    // 드래그를 시작한 항목이 "이미 선택돼 있던 다중 선택"의 일부이면, 그 선택 전체를 함께
    // 옮긴다(탐색기에서 여러 개 선택 후 하나를 끌면 전부 같이 움직이는 것과 동일한 관례).
    // 단일 항목만 선택돼 있었거나 선택 밖의 항목을 끈 경우는 그 항목 하나만 대상.
    const idsToMove =
      selectedIds.has(activeId) && selectedIds.size > 1 ? Array.from(selectedIds) : [activeId];

    // 휴지통 타일(또는 사이드바의 휴지통 행) 위로 드롭 — 선택(또는 단일 드래그 항목) 전부를 일괄
    // 휴지통 이동으로 처리한다(2026-09-08, trashFolder→trashNode 일반화로 영상도 대상에 포함).
    if (overRealId === store?.trashId) {
      const idsToTrash = idsToMove;
      if (idsToTrash.length === 0) return;
      setError(null);
      try {
        const before = await load();
        const label =
          idsToTrash.length === 1
            ? `"${before.nodes[idsToTrash[0]]?.name ?? ''}" 휴지통으로 이동`
            : `${idsToTrash.length}개 항목 휴지통으로 이동`;
        // (2026-09-09, "파일이 수십 개 이상 되면 삭제되는 속도가 너무 느린데 개선할 수 있나"
        // 요청) trashNode()를 개수만큼 반복 호출하면 매번 저장소 전체를 읽고 쓰게 되어 선택
        // 개수에 비례해 느려졌다 — load 한 번·save 한 번으로 끝나는 trashNodes()로 교체.
        await trashNodes(idsToTrash);
        pushUndo({ label, snapshot: before });
        setSelectedIds(new Set());
        await refresh(currentFolderId);
        scheduleAutoSync();
        setToast({ label, kind: 'undo', ts: Date.now() });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    // "into" 판정이었던 드롭 — 순서변경이 아니라 moveNode()로 그 폴더 안으로 이동시킨다.
    // 자기 하위 폴더로 옮기려는 시도 등 유효하지 않은 이동은 moveNode 자체가 거부하며,
    // 그 경우 항목은 원래 자리에 그대로 남고(내용 변경 없음) 에러 배너로 사유를 안내한다.
    if (dropPosition === 'into') {
      const destFolderId = overRealId;
      const ids = idsToMove.filter((id) => id !== destFolderId);
      if (ids.length === 0) return;
      setError(null);
      try {
        const before = await load();
        const label =
          ids.length === 1
            ? `"${before.nodes[ids[0]]?.name ?? ''}" → "${before.nodes[destFolderId]?.name ?? ''}" 폴더로 이동`
            : `${ids.length}개 항목 → "${before.nodes[destFolderId]?.name ?? ''}" 폴더로 이동`;
        // (2026-09-09, 위 trashNodes와 같은 이유) moveNode() 반복 호출 대신 load/save 한 번씩만
        // 하는 moveNodes()로 교체 — 다중 선택 드래그 이동도 항목 수에 비례해 느려지던 문제가 있었다.
        await moveNodes(ids, destFolderId);
        pushUndo({ label, snapshot: before });
        setSelectedIds(new Set());
        await refresh(currentFolderId);
        scheduleAutoSync();
        setToast({ label, kind: 'undo', ts: Date.now() });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    // 자동 정렬 모드이거나 다중 선택 드래그면 순서변경을 하지 않는다(위 handleDragMove의 into-only
    // 우회 분기와 같은 이유 — 여기 도달했다는 건 유효하지 않은 드롭이라는 뜻이지, 드래그를 시작한
    // 항목 하나만 슬쩍 순서를 바꿔도 된다는 뜻이 아니다. 아무 것도 하지 않는다).
    if (!isManualSort || activeDragIds.length > 1) return;

    const oldIndex = sortableIds.indexOf(activeId);
    const newIndex = sortableIds.indexOf(overRealId);
    if (oldIndex === -1 || newIndex === -1) return;
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[currentFolderId]?.name ?? ''}" 순서 변경`;
      await reorderChildren(currentFolderId, arrayMoveLocal(sortableIds, oldIndex, newIndex));
      pushUndo({ label, snapshot: before });
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmDelete(id: string) {
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[id]?.name ?? ''}" 휴지통으로 이동`;
      await trashNode(id);
      pushUndo({ label, snapshot: before });
      setDeletingId(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 이동 다이얼로그에서 대상 폴더를 클릭하면 호출됨 — 단일 이동(📁 버튼)과 다중 선택 후 일괄
  // 이동(툴바) 모두 이 함수 하나로 처리한다(moveDialogIds 길이가 1이면 기존 단일 이동과 동일).
  // moveNode()를 그대로 반복 호출 — 스냅샷은 배치 전체 시작 전 한 번만 떠서, 여러 개를 옮겨도
  // Ctrl+Z 한 번에 전부 되돌아간다.
  async function handleConfirmMove(destFolderId: string) {
    if (!moveDialogIds || moveDialogIds.length === 0) return;
    setError(null);
    try {
      const before = await load();
      const label =
        moveDialogIds.length === 1
          ? `"${before.nodes[moveDialogIds[0]]?.name ?? ''}" 폴더 이동`
          : `${moveDialogIds.length}개 항목 이동`;
      // (2026-09-09, 위 trashNodes와 같은 이유) moveNode() 반복 호출 대신 moveNodes()로 교체.
      await moveNodes(moveDialogIds, destFolderId);
      pushUndo({ label, snapshot: before });
      setMoveDialogIds(null);
      setSelectedIds(new Set());
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ↩ 복원 버튼(휴지통 안에서만 노출) — restoreFromTrash()가 원래 있던 폴더(prevParentId)로
  // 자동 계산해 되돌리므로, handleConfirmMove와 달리 목적지를 고르는 다이얼로그가 필요 없다.
  async function handleRestore(id: string) {
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[id]?.name ?? ''}" 복원`;
      await restoreFromTrash(id);
      pushUndo({ label, snapshot: before });
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 다중 선택 툴바의 🗑 일괄 휴지통 이동 — trashNode 일반화(2026-09-08)로 폴더·영상 구분 없이
  // selectedIds 전체를 대상으로 한다. 한 번 확인을 거친 뒤(bulkTrashConfirming) 실행 — 개별 삭제의
  // 확인 절차와 같은 원칙.
  async function handleBulkTrash() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setError(null);
    try {
      const before = await load();
      const label = `${ids.length}개 항목 휴지통으로 이동`;
      // (2026-09-09, "파일이 수십 개 이상 되면 삭제되는 속도가 너무 느린데 개선할 수 있나" 요청)
      // trashNode() 반복 호출 대신 load/save 한 번씩만 하는 trashNodes()로 교체 — 이게 산들이
      // 겪은 "다중 선택 삭제가 느리다" 문제의 핵심 경로였다.
      await trashNodes(ids);
      pushUndo({ label, snapshot: before });
      setSelectedIds(new Set());
      setBulkTrashConfirming(false);
      setDeleteConfirmPos(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 다중 선택 툴바의 ↩ 일괄 복원(휴지통 안에서만 노출) — handleRestore와 같은 로직을 선택된 항목
  // 전부에 반복 적용.
  async function handleBulkRestore() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setError(null);
    try {
      const before = await load();
      const label = `${ids.length}개 항목 복원`;
      // (2026-09-09, 위 trashNodes와 같은 이유) restoreFromTrash() 반복 호출 대신
      // restoreNodesFromTrash()로 교체 — 다중 선택 복원도 항목 수에 비례해 느려지던 문제가 있었다.
      await restoreNodesFromTrash(ids);
      pushUndo({ label, snapshot: before });
      setSelectedIds(new Set());
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 실행취소 — Ctrl+Z와 토스트 버튼 둘 다 이 함수를 호출한다. 어떤 액션이었는지 몰라도
  // save(snapshot) 하나로 5가지(이름변경/아이콘변경/순서변경/휴지통이동/이동) 전부 복원된다.
  // 되돌리기 직전 상태는 pushRedo()로 반대쪽 스택에 남겨둬서, 되돌린 걸 다시 적용(redo)할 수 있게 한다.
  async function performUndo() {
    const entry = popUndo();
    if (!entry) return;
    setError(null);
    try {
      const current = await load();
      await save(entry.snapshot);
      pushRedo({ label: entry.label, snapshot: current });
      await refresh(currentFolderId);
      setToast({ label: `${entry.label} 취소됨`, kind: 'redo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 다시 실행 — Ctrl+Y(또는 Ctrl+Shift+Z)와 실행취소 직후 뜨는 토스트의 "다시 실행" 버튼이
  // 이 함수를 호출한다. performUndo()와 대칭 — redo 스택에서 꺼낸 스냅샷을 그대로 복원하고,
  // 지금(다시 적용하기 직전) 상태는 pushUndoFromRedo()로 실행취소 스택에 도로 남겨서 필요하면
  // 다시 되돌릴 수 있게 한다. 새 액션(pushUndo)과 달리 redo 스택을 비우지 않아, undo↔redo를
  // 여러 번 오갈 수 있다.
  async function performRedo() {
    const entry = popRedo();
    if (!entry) return;
    setError(null);
    try {
      const current = await load();
      await save(entry.snapshot);
      pushUndoFromRedo({ label: entry.label, snapshot: current });
      await refresh(currentFolderId);
      setToast({ label: entry.label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 🗑 버튼 클릭 — 정책 안내를 "다시 보지 않기" 체크하지 않았으면 먼저 팝업으로 보관기간 정책을
  // 설명하고, 이미 체크해 뒀으면 기존의 가벼운 한 줄 확인(휴지통으로 이동할까요?)만 띄운다.
  function handleTrashClick(id: string) {
    if (store?.settings.trashInfoDismissed) {
      setDeletingId(id);
    } else {
      setTrashInfoCheckbox(false);
      setTrashInfoModalFolderId(id);
    }
  }

  async function confirmTrashWithInfo() {
    if (!trashInfoModalFolderId) return;
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[trashInfoModalFolderId]?.name ?? ''}" 휴지통으로 이동`;
      if (trashInfoCheckbox) await dismissTrashInfo();
      await trashNode(trashInfoModalFolderId);
      pushUndo({ label, snapshot: before });
      setTrashInfoModalFolderId(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 휴지통 안 전체 항목 수(하위 트리 포함) — 비우기 확인 시 "영향받는 항목 수" 안내용
  const trashCount = useMemo(() => {
    if (!store) return 0;
    const doomed = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const k in store.nodes) {
        const n = store.nodes[k];
        if (doomed.has(n.id) || n.id === store.trashId) continue;
        if (n.parentId === store.trashId || (n.parentId && doomed.has(n.parentId))) {
          doomed.add(n.id);
          grew = true;
        }
      }
    }
    return doomed.size;
  }, [store]);

  async function confirmEmptyTrash() {
    setError(null);
    try {
      const purgedCount = await emptyTrash();
      setEmptyingTrash(false);
      // 완전삭제는 되돌릴 수 없는 작업이라, 남아있는 실행취소/다시 실행 스냅샷으로 되돌리면
      // 방금 영구 삭제한 항목이 되살아나는 모순이 생긴다 — 뭔가 실제로 지워졌을 때만 비운다.
      if (purgedCount > 0) {
        clearUndo();
        setToast(null);
      }
      await refresh(currentFolderId);
      scheduleAutoSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 보관기간 선택 변경 — 즉시 적용하지 않고, 그 값으로 바꾸면 당장 완전 삭제될 항목이 있는지부터 확인한다
  // (영향 없으면 확인 절차 없이 바로 적용 — UX 원칙은 "즉시 삭제될 수 있는 경우"에만 확인을 요구함).
  function handleRetentionSelect(value: string) {
    if (!store) return;
    const days = value === 'none' ? null : parseInt(value, 10);
    const impact = previewRetentionPurgeCount(store, days);
    if (impact > 0) {
      setPendingRetentionDays(days);
      setPendingRetentionPreview(impact);
    } else {
      applyRetention(days);
    }
  }

  async function applyRetention(days: number | null) {
    setError(null);
    setRetentionBusy(true);
    try {
      const { purgedCount } = await setTrashRetentionDays(days);
      setPendingRetentionDays(undefined);
      // 보관기간을 줄이면 그 자리에서 즉시 완전 삭제(영구 삭제)가 함께 일어날 수 있다 — 그 경우
      // 실행취소/다시 실행 스냅샷이 되살릴 수 없는 상태를 가리키게 되므로 비운다. 설정값만
      // 바뀌고 실제로 삭제된 게 없으면(purgedCount===0) 정렬·보기 설정 변경과 마찬가지로 낮은
      // 위험이라 그냥 둔다(되돌리면 보관기간 설정도 같이 되돌아갈 뿐, 데이터 손실은 없음).
      if (purgedCount > 0) {
        clearUndo();
        setToast(null);
      }
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetentionBusy(false);
    }
  }

  // (2026-09-08, "오류 152-4" 원인 확정 반영) 확장 페이지 내부에 iframe으로 유튜브를 직접 재생하던
  // 방식(PlayerOverlay)을 껐다 — 원인은 우리 코드가 아니라 유튜브 임베드 플레이어 자체의 현재 진행형
  // 플랫폼 이슈였다(오류 152-4가 우리 확장·일반 웹사이트·전혀 다른 브라우저 어디서나 똑같이 재현되고,
  // 유튜브 공식 oEmbed API로는 영상들이 "임베드 가능"으로 확인됨 — 즉 영상·확장 문제가 아니라 유튜브
  // 임베드 플레이어 쪽 문제). 버전1(v1)이 "잘 됐던" 이유도 같은 결론을 뒷받침한다 — v1은 애초에 iframe
  // 임베드를 쓴 적이 없고, 영상 클릭 시 항상 window.open()으로 진짜 유튜브 탭을 새로 열었을 뿐이다
  // (app.js: `window.open(n.url,'_blank')`). 그래서 v2도 이 방식으로 되돌린다 — 임베드가 언제 고쳐질지
  // 알 수 없는 유튜브 쪽 문제라, 우리가 통제 가능한 유일한 안정적 재생 경로는 실제 유튜브 탭을 여는 것.
  // 이어보기 위치(lastPosition)는 새 탭 안에서는 우리가 관찰할 수 없어 재생 중 자동 저장은 더 이상 안
  // 되지만, 마지막으로 저장돼있던 위치는 watch URL의 t= 파라미터로 그대로 살려서 이어서 볼 수 있게 한다.
  function handleVideoClick(node: TubeNode) {
    setError(null);
    if (!isVideo(node)) return;
    if (!node.videoId) {
      setError('이 영상은 재생할 수 없습니다 (videoId를 확인할 수 없음).');
      return;
    }
    const resumeAt = node.lastPosition && node.lastPosition > 0 ? Math.floor(node.lastPosition) : 0;
    const url = resumeAt > 0 ? `${youtubeUrl.watch(node.videoId)}&t=${resumeAt}s` : youtubeUrl.watch(node.videoId);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // 다중 선택 툴바의 "▶ 재생" — 선택된 항목 중 영상만, 선택한 순서가 아니라 지금 폴더에 보이는
  // 정렬 순서(children) 그대로 골라 다이얼로그에 넘긴다("정렬된 순서대로" 옵션이 실제 화면 순서와
  // 어긋나지 않게 하기 위함).
  function openPlaybackDialogForSelection() {
    const nodes = children.filter((n): n is VideoNode => isVideo(n) && selectedIds.has(n.id));
    if (nodes.length === 0) return;
    setPlaybackDialogNodes(nodes);
  }

  // 재생 옵션 다이얼로그의 "▶ 재생 시작" — 순서(정렬순/무작위)·반복(1회/무한)을 반영해 큐를 만들고,
  // handleVideoClick과 똑같이 첫 영상만 실제 유튜브 탭으로 연다(임베드 재도입 금지, 위 2026-09-08
  // "오류 152-4" 주석 참고). 클릭 이벤트 핸들러 안에서 동기적으로 window.open을 호출해야 팝업
  // 차단을 피할 수 있으므로, 큐 상태 저장(setQueueState, 비동기)은 그 뒤에 fire-and-forget으로
  // 이어간다 — 실제로 필요한 시점은 첫 영상이 끝나 content.ts가 다음 곡을 찾을 때라 그 전에 여유
  // 있게 끝난다. 이어보기 위치(t= 파라미터)는 큐 재생에는 적용하지 않는다 — 여러 영상을 순서대로
  // 넘기는 목적과 "지난번 멈춘 자리부터"는 서로 다른 기능이라 섞으면 혼란스러움.
  function handlePlaybackStart(order: QueueOrder, repeat: QueueRepeatMode) {
    if (!playbackDialogNodes) return;
    const ordered = order === 'shuffle' ? shuffle(playbackDialogNodes) : playbackDialogNodes;
    const items = buildQueueItems(ordered);
    if (items.length === 0) {
      setError('재생할 수 있는 영상이 없습니다 (videoId를 확인할 수 없음).');
      setPlaybackDialogNodes(null);
      return;
    }
    setError(null);
    window.open(youtubeUrl.watch(items[0].videoId), '_blank', 'noopener,noreferrer');
    void setQueueState({ items, currentIndex: 0, repeatMode: repeat, startedAt: Date.now() });
    setPlaybackDialogNodes(null);
    setSelectedIds(new Set());
  }

  async function handleClosePlayer() {
    setPlayingVideo(null);
    await refresh(currentFolderId); // 재생 위치(lastPosition) 갱신을 store에 반영
    scheduleAutoSync();
  }

  async function handleImportPlaylist() {
    setError(null);
    if (!currentFolderId || importing) return;

    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      setError('올바른 재생목록 URL(또는 재생목록 ID)이 아닙니다.');
      return;
    }

    setImporting(true);
    setImportStatus('재생목록 불러오는 중...');
    try {
      // 매니저 탭(chrome-extension:// 페이지)은 content.ts와 달리 chrome.identity를 직접 쓸 수
      // 있는 컨텍스트라(확장 페이지·서비스워커 전용, 콘텐츠 스크립트에는 없음 — youtubeDataApi.ts
      // 상단 주석 참고) background 경유 메시지 없이 공식 API를 바로 호출할 수 있다. 2026-09-08까지
      // 이 입력창은 fetchPlaylistVideos(인증 없는 공개 스크래핑, "재생목록 추가일" 정보가 없음)만
      // 써서 content.ts 쪽 우클릭 메뉴 가져오기와 다르게 동작하고 있었음(산들이 "날짜순 정렬이
      // 안 맞는다"고 지적해 발견) — 여기도 똑같이 공식 API를 우선 시도하고, 실패하면(설정
      // 미완료·동의 거부·네트워크 오류 등) 조용히 기존 공개 스크래핑으로 대체한다(content.ts와
      // 동일한 정책 — 신규 경로 도입으로 기존에 되던 가져오기가 안 되는 회귀를 막기 위함).
      let videos: PlaylistVideo[];
      let suggestedTitle = '가져온 재생목록';
      let apiFailReason: string | null = null;
      try {
        const apiResult = await fetchPlaylistViaDataApi(playlistId, (p) =>
          setImportStatus(`영상 목록을 가져오는 중... (${p.fetched}개 인식됨)`)
        );
        videos = apiResult.videos;
        if (apiResult.title) suggestedTitle = apiResult.title;
      } catch (apiError) {
        // 왜 대체됐는지가 콘솔에만 남으면 산들처럼 개발자도구를 안 여는 사용자는 원인을 알 방법이
        // 없다(2026-09-08, "그대로야"로 재현 안 되던 문제 진단 중 발견) — 최종 완료 메시지에
        // 이유를 그대로 노출해 콘솔 없이도 바로 알 수 있게 한다.
        apiFailReason = apiError instanceof Error ? apiError.message : String(apiError);
        console.warn('[튜브폴더] 공식 API 가져오기 실패, 기존 방식으로 대체:', apiError);
        videos = await fetchPlaylistVideos(playlistId, (p) =>
          setImportStatus(`영상 목록을 가져오는 중... (${p.fetched}개 인식됨)`)
        );
      }
      setPlaylistUrl('');
      if (videos.length === 0) {
        setImportStatus('가져올 영상이 없습니다.');
        return;
      }
      // (2026-09-09, "새 폴더를 만들지, 현재 폴더에 넣을지, 다른 폴더에 넣을지 선택하게 해달라"
      // 요청) 예전엔 여기서 바로 currentFolderId에 추가했는데, 이제는 목적지 선택 팝업부터
      // 띄운다 — 실제 추가는 runImport()가 목적지가 정해진 뒤에 담당한다.
      setImportStatus(null);
      setImportNewFolderName(suggestedTitle);
      setImportFlow({ stage: 'choose-destination', videos, apiFailReason });
    } catch (e) {
      setImportStatus(null);
      if (e instanceof LicenseLimitError) {
        setLicenseLimitMessage(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setImporting(false);
    }
  }

  // 목적지가 정해진 뒤 실제로 영상을 추가하고 결과 팝업을 띄운다 — 유튜브 페이지 우클릭
  // "이 재생목록 가져오기"(content.ts)에서 이미 쓰는 것과 동일한 정책: dedupeByName이 true면
  // (기존 폴더 재사용 — "현재 폴더" 또는 "다른 폴더") 그 폴더 안 영상과 이름이 같은 항목만
  // 제외하고, false면(새 폴더) 중복 여부를 아예 따지지 않고 전부 넣는다. addVideosToFolder의
  // videoId 기준 전역 중복 방지(휴지통 제외)는 여기서는 skipDuplicateCheck:true로 우회한다 —
  // 이름 기준 필터링 결과와 "총 N개 중 중복 M개" 카운트가 정확히 일치해야 하기 때문.
  async function runImport(folderId: string, videos: PlaylistVideo[], dedupeByName: boolean, apiFailReason: string | null) {
    setError(null);
    setImporting(true);
    setImportStatus('폴더에 추가하는 중...');
    try {
      // (2026-09-09, "재생목록 가져오기도 실행취소/다시 실행이 가능하게 해달라. 기존에 만들어
      // 두었던 버튼을 쓸 수 있게 해달라" 요청) addVideosToFolder가 실제로 저장하기 전 시점을
      // 미리 떠 둔다 — 이 스냅샷을 아래에서 이름 기준 중복 판정에도 그대로 재사용하고(예전엔
      // 별도로 한 번 더 load()했음), 성공하면 undo 스냅샷으로도 쓴다.
      const before = await load();
      let toImport = videos;
      const duplicateNames: string[] = [];
      if (dedupeByName) {
        const existingNames = new Set<string>();
        for (const k in before.nodes) {
          const n = before.nodes[k];
          if (n.type === 'video' && n.parentId === folderId) existingNames.add(n.name);
        }
        toImport = [];
        for (const v of videos) {
          if (existingNames.has(v.title)) duplicateNames.push(v.title);
          else toImport.push(v);
        }
      }

      const result = await addVideosToFolder(
        folderId,
        toImport.map((v) => ({
          url: youtubeUrl.watch(v.videoId),
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          duration: v.duration,
          playlistAddedAt: v.playlistAddedAt
        })),
        { skipDuplicateCheck: true }
      );

      // (2026-09-09, "'이 재생목록 가져오기'도 새 폴더/현재 폴더/다른 폴더를 선택하게 해달라"
      // 요청으로 새로 생긴 "현재 폴더" 후보 중 하나(매니저 탭이 아예 안 열려있을 때의 대체값,
      // resolveCurrentFolderId 참고)라 — 실제로 어느 목적지를 골랐든(새 폴더/현재 폴더/다른 폴더)
      // 완료 시점에 항상 갱신해둔다. 전부 중복이라 result.added===0이어도 "이 폴더로 가져오기를
      // 시도했다"는 사실 자체는 유효하므로 기록한다.
      await setLastImportFolderId(folderId);

      // addVideosToFolder()는 실제로 추가된 게 하나라도 있을 때만 저장한다(전부 건너뛴 경우
      // 저장 자체가 없으니 스냅샷도 그대로 유효 — added===0이면 스택에 쌓을 것도 없음).
      // 예전엔 여기서 clearUndo()로 스택을 통째로 비웠는데(가져오기가 아직 undo 추적 대상이
      // 아니었을 때의 정책) — 이제는 이름변경·이동 등 다른 작업과 동일하게 pushUndo로 스택에
      // 쌓아서, 상단 "↩ 실행취소"/"↪ 다시 실행" 버튼과 Ctrl+Z/Ctrl+Y로 그대로 되돌릴 수 있다.
      if (result.added > 0) {
        const folderName = before.nodes[folderId]?.name ?? '';
        const label = `"${folderName}" 폴더에 영상 ${result.added}개 가져오기`;
        pushUndo({ label, snapshot: before });
        setToast({ label, kind: 'undo', ts: Date.now() });
      }
      await refresh(currentFolderId);
      scheduleAutoSync();

      if (result.limitReached) {
        const fallbackNote = apiFailReason ? ` (공식 API 실패로 예전 방식 사용: ${apiFailReason})` : '';
        setImportFlow(null);
        setImportStatus(
          `무료 버전 한도라 ${result.added}개만 추가되고 나머지는 건너뛰었습니다. 전체를 가져오려면 업그레이드가 필요합니다.${fallbackNote}`
        );
        setLicenseLimitMessage(
          `무료 버전 한도라 ${result.added}개만 추가되고 나머지는 건너뛰었습니다. 전체를 가져오려면 업그레이드가 필요합니다.`
        );
        return;
      }

      const finalData = await load();
      let finalCount = 0;
      for (const k in finalData.nodes) {
        const n = finalData.nodes[k];
        if (n.type === 'video' && n.parentId === folderId) finalCount++;
      }

      setImportFlow(null);
      setImportStatus(null);
      setImportResult({ total: videos.length, duplicateNames, added: result.added, finalCount, apiFailReason });
    } catch (e) {
      setImportStatus(null);
      if (e instanceof LicenseLimitError) {
        setLicenseLimitMessage(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setImporting(false);
    }
  }

  // "새 폴더 만들기" 선택 후 이름을 확정하면 currentFolderId 안에 그 이름으로 새 폴더를 만들고
  // (기존 "+ 새 폴더" 버튼과 같은 위치 규칙 — handleCreateFolder 참고) 중복 검사 없이 전체를 넣는다.
  async function handleCreateNewFolderAndImport() {
    if (!importFlow || importFlow.stage !== 'name-new-folder' || !currentFolderId) return;
    const trimmed = importNewFolderName.trim();
    if (!trimmed) {
      setError('폴더 이름을 입력하세요.');
      return;
    }
    setError(null);
    try {
      const folder = await createFolder(currentFolderId, trimmed);
      await runImport(folder.id, importFlow.videos, false, importFlow.apiFailReason);
    } catch (e) {
      if (e instanceof LicenseLimitError) {
        setLicenseLimitMessage(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // 접근성 보강(ROADMAP 4단계) — 배경 클릭 외에 Esc 키로도 오버레이 패널을 닫을 수 있게 한다.
  useEscapeClose(!!trashInfoModalFolderId, () => setTrashInfoModalFolderId(null));
  useEscapeClose(!!iconPickerFolderId, () => setIconPickerFolderId(null));
  useEscapeClose(!!detailViewNodeId, () => setDetailViewNodeId(null));
  useEscapeClose(!!importFlow, () => setImportFlow(null));
  useEscapeClose(!!importResult && !importDupListOpen, () => setImportResult(null));
  useEscapeClose(importDupListOpen, () => setImportDupListOpen(false));

  // (2026-09-09, "이 상태[실행취소 토스트가 떠 있는 상태]에서 빈 공간을 클릭하면 표시한 버튼이
  // 사라지게 해줘" 요청) 토스트는 다른 모달들과 달리 배경을 덮는 오버레이가 없는(비침해적) UI라
  // .tf-sync-overlay식 "오버레이 클릭=닫기" 패턴을 그대로 쓸 수 없다 — 대신 document 전체에
  // mousedown을 한 번 걸어, 토스트 자신(실행취소/다시 실행 버튼 포함) 바깥을 클릭하면 닫는다.
  // 토스트가 떠 있을 때만 리스너를 등록해(불필요한 상시 리스너 방지) 자동 사라짐(6초) 전에
  // 사용자가 화면 다른 곳을 클릭해 다음 작업으로 넘어가면 조용히 같이 사라지도록 한다.
  useEffect(() => {
    if (!toast) return;
    function onDocumentMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.tf-toast')) return;
      setToast(null);
    }
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [toast]);

  if (!store || !currentFolder) {
    return (
      <div className="tf-app">
        <p>불러오는 중...</p>
      </div>
    );
  }

  // ── 아래 3개 render* 함수는 "가상 스크롤 켜짐/꺼짐" 두 렌더링 경로가 항목 내용(이름 열기·인라인
  // 이름변경·삭제 확인·아이콘변경 등)을 완전히 동일하게 공유하기 위한 것 — 감싸는 태그(<li>/<tr 대신
  // <td> 안 내용/<div class="tf-tile">)만 호출부에서 다르게 씌운다. 목록·그리드는 감싸는 태그가
  // 가상화 여부와 무관하게 항상 같아서(li/div) 그대로 재사용하고, 표는 가상화 시 <table>이 아니라
  // CSS grid div로 바뀌므로(가상 스크롤이 <tr>에 position:absolute를 주면 표 레이아웃 계산이
  // 깨지는 브라우저 제약 때문) 셀 "내용"만 반환하는 tableCells()로 따로 분리했다.
  function renderRowBody(
    node: TubeNode,
    isTrash: boolean,
    isFolder: boolean,
    store: TubeStoreData,
    dragProps?: DragHandleProps
  ): ReactNode {
    return (
      <>
        {isFolder ? (
          editingId === node.id ? (
            <span className="tf-edit-row">
              <input
                className="tf-input tf-input-inline"
                aria-label="폴더 이름 수정"
                value={editingValue}
                autoFocus
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(node.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
              <button className="tf-btn tf-btn-icon" onClick={() => commitRename(node.id)} title="저장" aria-label="저장">
                ✔
              </button>
              <button className="tf-btn tf-btn-icon" onClick={() => setEditingId(null)} title="취소" aria-label="취소">
                ✕
              </button>
            </span>
          ) : (
            <button
              className="tf-row-name"
              onClick={() => navigateToFolder(node.id)}
              title={`열기 · ${folderContentCountsLabel(store, node.id)}`}
              {...dragProps?.attributes}
              {...dragProps?.listeners}
            >
              {folderIcon(node, store)} {node.name}
            </button>
          )
        ) : (
          <>
            {/* (2026-09-09, "1번 아이콘을 클릭하면 파일의 상세내용을 자세히 볼 수 있도록" 요청)
                체크박스가 있던 자리(1번)를 상세보기 버튼으로 대체 — 영상 전용, 폴더는 대상이 아님
                (확인 완료). 이름 버튼과 분리된 별도 버튼이라 클릭해도 재생이 같이 실행되지 않는다. */}
            <button
              className="tf-btn tf-btn-icon tf-detail-btn"
              onClick={() => setDetailViewNodeId(node.id)}
              title="상세보기"
              aria-label={`"${node.name}" 상세보기`}
            >
              ℹ️
            </button>
            <button
              className="tf-row-name tf-row-name-video"
              onClick={() => handleVideoClick(node)}
              title={isVideo(node) && node.videoId ? '재생' : '재생할 수 없는 영상(videoId 없음)'}
              {...dragProps?.attributes}
              {...dragProps?.listeners}
            >
              🎬 {node.name}
            </button>
          </>
        )}
        {!isFolder && isVideo(node) && node.duration > 0 && <span className="tf-row-duration">{formatDuration(node.duration)}</span>}

        {isFolder && !isTrash && editingId !== node.id && deletingId === node.id && (
          <span className="tf-row-actions tf-confirm-row">
            <span className="tf-confirm-text">
              휴지통으로 이동할까요?
              {store.settings.trashRetentionDays != null && ` (보관기간 ${store.settings.trashRetentionDays}일 후 자동 완전삭제)`}
            </span>
            <button className="tf-btn tf-btn-danger-outline" onClick={() => confirmDelete(node.id)}>
              삭제
            </button>
            <button className="tf-btn tf-btn-icon" onClick={() => setDeletingId(null)}>
              취소
            </button>
          </span>
        )}

        {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && currentFolderId !== store.trashId && (
          <span className="tf-row-actions">
            {/* (2026-09-09, "폴더에도 적용해줘" 요청) 영상과 동일하게 폴더도 체크박스로 다중 선택 가능 — Shift+클릭 범위 선택 포함, toggleSelect 재사용. */}
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setIconPickerFolderId(node.id)}
              title="아이콘 변경"
              aria-label={`"${node.name}" 아이콘 변경`}
            >
              🎨
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => {
                setEditingId(node.id);
                setEditingValue(node.name);
              }}
              title="이름 변경"
              aria-label={`"${node.name}" 이름 변경`}
            >
              ✏️
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setMoveDialogIds([node.id])}
              title="다른 폴더로 이동"
              aria-label={`"${node.name}" 다른 폴더로 이동`}
            >
              📁
            </button>
            <button
              className="tf-btn tf-btn-danger-outline"
              onClick={() => handleTrashClick(node.id)}
              title="휴지통으로 이동"
              aria-label={`"${node.name}" 휴지통으로 이동`}
            >
              🗑
            </button>
          </span>
        )}
        {/* (신설 2026-08-30, 작업순서 1/8) 휴지통 안에서는 이동/휴지통행 대신 전용 복원 버튼 하나만 노출 */}
        {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && currentFolderId === store.trashId && (
          <span className="tf-row-actions">
            {/* (2026-09-09, "폴더에도 적용해줘" 요청) 영상과 동일하게 폴더도 체크박스로 다중 선택 가능 — Shift+클릭 범위 선택 포함, toggleSelect 재사용. */}
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => handleRestore(node.id)}
              title="복원"
              aria-label={`"${node.name}" 복원`}
            >
              ↩
            </button>
          </span>
        )}
        {/* (2026-09-09, "2번 체크박스는 다시 살려" 요청으로 원복) 영상 행의 2번 자리는 체크박스로
            복원한다 — 클릭 한 번은 개별 토글, Shift+클릭은 범위 선택(toggleSelect, 다중 선택 툴바와
            동일한 selectedIds를 공유). 복사/삭제/이동/잘라내기는 체크 후 다중 선택 툴바에서 고른다
            (확인 완료) — 우클릭 컨텍스트 메뉴로도 동일하게 가능. */}
        {!isFolder && !isTrash && (
          <span className="tf-row-actions">
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
          </span>
        )}
      </>
    );
  }

  function renderTileBody(
    node: TubeNode,
    isTrash: boolean,
    isFolder: boolean,
    store: TubeStoreData,
    dragProps?: DragHandleProps
  ): ReactNode {
    // (신설 2026-08-30, 산들 지적 — "아이콘 그림을 클릭해도 안 열린다") 목록·표 보기는 이름 버튼 안에
    // 아이콘이 함께 들어있어 아이콘을 눌러도 열리지만, 아이콘 그리드 보기만 아이콘(.tf-tile-media)이
    // 이름 버튼과 분리된 별도 요소라 이름 글자 부분만 눌러야 열리는 문제가 있었음. 이름 변경 중(입력창이
    // 뜬 상태)에는 기존과 동일하게 클릭해도 아무 반응 없는 일반 div로 유지(입력 중인 값이 사라지는 걸 방지).
    // dragProps는 그리드 아이콘 보기(SortableGridItem)에서만 넘어온다(2026-09-04 신규) — 표·트래시
    // 타일 등 다른 호출부는 넘기지 않으므로 아래에서 옵셔널 스프레드(?.)로 안전하게 처리한다.
    const media = (
      <>
        {isFolder ? (
          <span className="tf-tile-icon" aria-hidden="true">
            {folderIcon(node, store)}
          </span>
        ) : isVideo(node) && node.thumb ? (
          <img className="tf-tile-thumb" src={node.thumb} alt="" loading="lazy" />
        ) : (
          <span className="tf-tile-icon" aria-hidden="true">
            🎬
          </span>
        )}
        {!isFolder && isVideo(node) && node.duration > 0 && <span className="tf-tile-duration">{formatDuration(node.duration)}</span>}
      </>
    );

    return (
      <>
        {/* (2026-09-09, "1번 아이콘을 클릭하면 파일의 상세내용을 자세히 볼 수 있도록" 요청) 아이콘
            그리드 보기에서는 타일 오른쪽 위 코너(드래그 손잡이의 대칭 위치)에 상세보기 버튼을 둔다
            — 영상 전용, 폴더는 대상이 아님(확인 완료). */}
        {!isFolder && (
          <button
            className="tf-btn tf-btn-icon tf-tile-detail-btn"
            onClick={() => setDetailViewNodeId(node.id)}
            title="상세보기"
            aria-label={`"${node.name}" 상세보기`}
          >
            ℹ️
          </button>
        )}
        {isFolder && editingId === node.id ? (
          <div className="tf-tile-media">{media}</div>
        ) : (
          <button
            className="tf-tile-media tf-tile-media-btn"
            onClick={() => (isFolder ? navigateToFolder(node.id) : handleVideoClick(node))}
            title={
              isFolder
                ? `열기 · ${folderContentCountsLabel(store, node.id)}`
                : isVideo(node) && node.videoId
                  ? '재생'
                  : '재생할 수 없는 영상(videoId 없음)'
            }
            aria-label={isFolder ? `"${node.name}" 열기` : `"${node.name}" 재생`}
            {...dragProps?.attributes}
            {...dragProps?.listeners}
          >
            {media}
          </button>
        )}

        {isFolder && editingId === node.id ? (
          <span className="tf-tile-edit">
            <input
              className="tf-input tf-input-inline"
              aria-label="폴더 이름 수정"
              value={editingValue}
              autoFocus
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(node.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
            <span className="tf-tile-edit-actions">
              <button className="tf-btn tf-btn-icon" onClick={() => commitRename(node.id)} title="저장" aria-label="저장">
                ✔
              </button>
              <button className="tf-btn tf-btn-icon" onClick={() => setEditingId(null)} title="취소" aria-label="취소">
                ✕
              </button>
            </span>
          </span>
        ) : (
          <button
            className="tf-tile-name"
            onClick={() => (isFolder ? navigateToFolder(node.id) : handleVideoClick(node))}
            title={
              isFolder
                ? `열기 · ${folderContentCountsLabel(store, node.id)}`
                : isVideo(node) && node.videoId
                  ? '재생'
                  : '재생할 수 없는 영상(videoId 없음)'
            }
          >
            {node.name}
          </button>
        )}

        {isFolder && !isTrash && editingId !== node.id && deletingId === node.id && (
          <span className="tf-tile-confirm">
            <span className="tf-confirm-text">
              휴지통으로 이동할까요?
              {store.settings.trashRetentionDays != null && ` (보관기간 ${store.settings.trashRetentionDays}일 후 자동 완전삭제)`}
            </span>
            <span className="tf-tile-edit-actions">
              <button className="tf-btn tf-btn-danger-outline" onClick={() => confirmDelete(node.id)}>
                삭제
              </button>
              <button className="tf-btn tf-btn-icon" onClick={() => setDeletingId(null)}>
                취소
              </button>
            </span>
          </span>
        )}

        {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && currentFolderId !== store.trashId && (
          <span className="tf-tile-actions">
            {/* (2026-09-09, "폴더에도 적용해줘" 요청) 영상과 동일하게 폴더도 체크박스로 다중 선택 가능 — Shift+클릭 범위 선택 포함, toggleSelect 재사용. */}
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setIconPickerFolderId(node.id)}
              title="아이콘 변경"
              aria-label={`"${node.name}" 아이콘 변경`}
            >
              🎨
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => {
                setEditingId(node.id);
                setEditingValue(node.name);
              }}
              title="이름 변경"
              aria-label={`"${node.name}" 이름 변경`}
            >
              ✏️
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setMoveDialogIds([node.id])}
              title="다른 폴더로 이동"
              aria-label={`"${node.name}" 다른 폴더로 이동`}
            >
              📁
            </button>
            <button
              className="tf-btn tf-btn-danger-outline"
              onClick={() => handleTrashClick(node.id)}
              title="휴지통으로 이동"
              aria-label={`"${node.name}" 휴지통으로 이동`}
            >
              🗑
            </button>
          </span>
        )}
        {/* (신설 2026-08-30, 작업순서 1/8) 휴지통 안에서는 이동/휴지통행 대신 전용 복원 버튼 하나만 노출 */}
        {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && currentFolderId === store.trashId && (
          <span className="tf-tile-actions">
            {/* (2026-09-09, "폴더에도 적용해줘" 요청) 영상과 동일하게 폴더도 체크박스로 다중 선택 가능 — Shift+클릭 범위 선택 포함, toggleSelect 재사용. */}
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => handleRestore(node.id)}
              title="복원"
              aria-label={`"${node.name}" 복원`}
            >
              ↩
            </button>
          </span>
        )}
        {/* (2026-09-09, "2번 체크박스는 다시 살려" 요청으로 원복) 영상 타일의 액션 칸은 체크박스로
            복원한다 — 목록 보기와 동일한 toggleSelect 로직(Shift+클릭 범위 선택 포함) 공유. 복사/삭제/
            이동/잘라내기는 체크 후 다중 선택 툴바에서 고른다(확인 완료). */}
        {!isFolder && !isTrash && (
          <span className="tf-tile-actions">
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
          </span>
        )}
      </>
    );
  }

  function tableCells(
    node: TubeNode,
    isTrash: boolean,
    isFolder: boolean,
    store: TubeStoreData,
    dragProps?: DragHandleProps
  ): { name: ReactNode; date: ReactNode; addedAt: ReactNode; type: ReactNode; size: ReactNode; actions: ReactNode } {
    const name = (
      <>
        {/* (2026-09-09, "1번 아이콘을 클릭하면 파일의 상세내용을 자세히 볼 수 있도록" 요청) 표(자세히)
            보기에서는 이름 칸 맨 앞, 체크박스가 있던 자리에 상세보기 버튼을 둔다 — 영상 전용, 폴더는
            대상이 아님(확인 완료). */}
        {!isFolder && (
          <button
            className="tf-btn tf-btn-icon tf-detail-btn"
            onClick={() => setDetailViewNodeId(node.id)}
            title="상세보기"
            aria-label={`"${node.name}" 상세보기`}
          >
            ℹ️
          </button>
        )}
        {isFolder && editingId === node.id ? (
        <span className="tf-edit-row">
          <input
            className="tf-input tf-input-inline"
            aria-label="폴더 이름 수정"
            value={editingValue}
            autoFocus
            onChange={(e) => setEditingValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(node.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
          />
          <button className="tf-btn tf-btn-icon" onClick={() => commitRename(node.id)} title="저장" aria-label="저장">
            ✔
          </button>
          <button className="tf-btn tf-btn-icon" onClick={() => setEditingId(null)} title="취소" aria-label="취소">
            ✕
          </button>
        </span>
      ) : (
        <button
          className="tf-row-name"
          onClick={() => (isFolder ? navigateToFolder(node.id) : handleVideoClick(node))}
          title={
            isFolder
              ? `열기 · ${folderContentCountsLabel(store, node.id)}`
              : isVideo(node) && node.videoId
                ? '재생'
                : '재생할 수 없는 영상(videoId 없음)'
          }
          {...dragProps?.attributes}
          {...dragProps?.listeners}
        >
          {isFolder ? folderIcon(node, store) : '🎬'} {node.name}
        </button>
      )}
      </>
    );

    const actions = (
      <>
        {isFolder && !isTrash && editingId !== node.id && deletingId === node.id && (
          <span className="tf-row-actions tf-confirm-row">
            <span className="tf-confirm-text">
              휴지통으로 이동할까요?
              {store.settings.trashRetentionDays != null && ` (보관기간 ${store.settings.trashRetentionDays}일 후 자동 완전삭제)`}
            </span>
            <button className="tf-btn tf-btn-danger-outline" onClick={() => confirmDelete(node.id)}>
              삭제
            </button>
            <button className="tf-btn tf-btn-icon" onClick={() => setDeletingId(null)}>
              취소
            </button>
          </span>
        )}
        {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && currentFolderId !== store.trashId && (
          <span className="tf-row-actions">
            {/* (2026-09-09, "폴더에도 적용해줘" 요청) 영상과 동일하게 폴더도 체크박스로 다중 선택 가능 — Shift+클릭 범위 선택 포함, toggleSelect 재사용. */}
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setIconPickerFolderId(node.id)}
              title="아이콘 변경"
              aria-label={`"${node.name}" 아이콘 변경`}
            >
              🎨
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => {
                setEditingId(node.id);
                setEditingValue(node.name);
              }}
              title="이름 변경"
              aria-label={`"${node.name}" 이름 변경`}
            >
              ✏️
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setMoveDialogIds([node.id])}
              title="다른 폴더로 이동"
              aria-label={`"${node.name}" 다른 폴더로 이동`}
            >
              📁
            </button>
            <button
              className="tf-btn tf-btn-danger-outline"
              onClick={() => handleTrashClick(node.id)}
              title="휴지통으로 이동"
              aria-label={`"${node.name}" 휴지통으로 이동`}
            >
              🗑
            </button>
          </span>
        )}
        {/* (신설 2026-08-30, 작업순서 1/8) 휴지통 안에서는 이동/휴지통행 대신 전용 복원 버튼 하나만 노출 */}
        {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && currentFolderId === store.trashId && (
          <span className="tf-row-actions">
            {/* (2026-09-09, "폴더에도 적용해줘" 요청) 영상과 동일하게 폴더도 체크박스로 다중 선택 가능 — Shift+클릭 범위 선택 포함, toggleSelect 재사용. */}
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => handleRestore(node.id)}
              title="복원"
              aria-label={`"${node.name}" 복원`}
            >
              ↩
            </button>
          </span>
        )}
        {/* (2026-09-09, "2번 체크박스는 다시 살려" 요청으로 원복) 영상 행의 액션 칸은 체크박스로
            복원한다 — 목록/그리드 보기와 동일한 toggleSelect 로직(Shift+클릭 범위 선택 포함) 공유.
            복사/삭제/이동/잘라내기는 체크 후 다중 선택 툴바에서 고른다(확인 완료). */}
        {!isFolder && !isTrash && (
          <span className="tf-row-actions">
            <input
              type="checkbox"
              className="tf-select-checkbox"
              checked={selectedIds.has(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                checkboxShiftRef.current = e.shiftKey;
              }}
              onChange={() => toggleSelect(node.id, checkboxShiftRef.current)}
              title="선택"
              aria-label={`"${node.name}" 선택`}
            />
          </span>
        )}
      </>
    );

    return {
      name,
      date: formatModifiedAt(nodeDateValue(node)),
      addedAt: formatModifiedAt(nodeAddedAtValue(node)),
      type: nodeTypeLabel(node, store),
      size: nodeSizeLabel(node, store),
      actions
    };
  }

  return (
    <div className="tf-app">
      <header className="tf-header">
        <div className="tf-header-row">
          <h1>튜브폴더</h1>
          <LicenseControl openSignal={licenseOpenSignal} />
          <LicenseLimitNotice
            message={licenseLimitMessage}
            onUpgrade={() => setLicenseOpenSignal((n) => n + 1)}
            onClose={() => setLicenseLimitMessage(null)}
          />
          <SyncControl onLocalDataChanged={refreshKeepingFolder} />
          <BackupControl
            onLocalDataChanged={refreshKeepingFolder}
            onUndoableAction={(label, before) => {
              pushUndo({ label, snapshot: before });
              setToast({ label, kind: 'undo', ts: Date.now() });
            }}
          />
          <AppInfo />
        </div>
        <p className="tf-subtitle">
          목록·아이콘 그리드(아주 큰/큰/보통/작은)·표(자세히) 보기, 이름·유튜브 추가일·튜브폴더 추가일·유형·크기
          정렬(오름·내림차순)을
          지원합니다. 항목이 {VIRTUALIZE_THRESHOLD}개를 넘는 폴더는 가상 스크롤이 자동으로 켜집니다(직접 순서
          드래그 모드에서는 항목을 전부 그려야 해서 예외).
        </p>
      </header>

      <nav className="tf-breadcrumb" aria-label="폴더 위치">
        {breadcrumb.map((node, i) => (
          <span key={node.id}>
            {i > 0 && (
              <span className="tf-breadcrumb-sep" aria-hidden="true">
                {' '}
                /{' '}
              </span>
            )}
            <button
              className="tf-breadcrumb-btn"
              disabled={node.id === currentFolderId}
              aria-current={node.id === currentFolderId ? 'page' : undefined}
              onClick={() => navigateToFolder(node.id)}
            >
              {folderIcon(node, store)} {node.name}
            </button>
          </span>
        ))}
      </nav>

      {/* 지금 열려 있는 폴더 안에 뭐가 몇 개 있는지(2026-09-08 신설, 산들 요청) — 사이드바·목록/표/
          그리드 행의 마우스오버 툴팁과 같은 숫자를 "폴더를 열어서 들어왔을 때"도 바로 보여준다(위
          folderContentCounts 참고, 직계 자식만 집계). */}
      {store && currentFolderId && (
        <p className="tf-folder-summary">
          {folderContentCountsLabel(store, currentFolderId)}
          {/* "정렬되어 있는대로 순차 재생/무작위 재생" 요청(2026-09-10) — 휴지통 안이거나 영상이
              하나도 없으면 재생할 대상이 없으므로 숨긴다. */}
          {currentFolderId !== store.trashId && folderVideoNodes.length > 0 && (
            <button
              className="tf-btn tf-btn-icon tf-folder-play-btn"
              onClick={() => setPlaybackDialogNodes(folderVideoNodes)}
              title="이 폴더의 영상을 지금 정렬 순서대로 재생합니다"
            >
              ▶ 폴더 재생
            </button>
          )}
        </p>
      )}

      {/* 검색(작업순서 7/8) — 사이드바는 좁은 화면(휴대폰 PWA)에서 숨겨지므로, 화면 크기와
          무관하게 항상 쓸 수 있도록 사이드바가 아니라 상단 네비게이션 공용 영역(breadcrumb 바로
          아래)에 둔다. 지금 보고 있는 폴더와 무관한 전역 검색이라 휴지통을 보고 있을 때도 그대로
          노출한다. */}
      <div className="tf-search">
        <input
          className="tf-input tf-search-input"
          type="text"
          aria-label="폴더/영상 검색"
          placeholder="🔍 폴더·영상 이름으로 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('');
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Enter' && searchResults.length > 0) {
              handleSearchResultClick(searchResults[0]);
            }
          }}
        />
        {searchQuery && (
          <button
            type="button"
            className="tf-search-clear"
            aria-label="검색어 지우기"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
        {/* "휴지통도 검색"(2026-09-07, 산들 지시) — 기본은 기존과 동일하게 휴지통 제외, 체크하면
            포함. onMouseDown에서 preventDefault()로 검색 입력창의 blur를 막아, 체크박스를 눌러도
            결과 드롭다운이 닫히지 않고(searchFocused 유지) 바뀐 결과를 그 자리에서 바로 보여준다
            (검색 결과 버튼과 같은 이유·같은 방식). */}
        <label className="tf-checkbox-row tf-search-trash-toggle">
          <input
            type="checkbox"
            checked={searchIncludeTrash}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => setSearchIncludeTrash(e.target.checked)}
          />
          휴지통도 검색
        </label>
        {searchFocused && searchQuery.trim() && (
          <div className="tf-search-results" role="listbox" aria-label="검색 결과">
            {searchResults.length === 0 ? (
              <div className="tf-search-empty">검색 결과가 없습니다.</div>
            ) : (
              searchResults.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="tf-search-result"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSearchResultClick(n)}
                >
                  <span className="tf-search-result-icon" aria-hidden="true">
                    {n.type === 'folder' ? folderIcon(n, store) : '🎬'}
                  </span>
                  <span className="tf-search-result-main">
                    <span className="tf-search-result-name">{n.name}</span>
                    <span className="tf-search-result-path">{nodePathLabel(store, n) || ' '}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {currentFolder.id === store.trashId ? (
        <div className="tf-trash-policy-banner">
          {pendingRetentionDays !== undefined ? (
            <span className="tf-confirm-row">
              <span className="tf-confirm-text">
                지금 바꾸면 보관기간이 지난 {pendingRetentionPreview}개 항목이 <strong>즉시 완전 삭제</strong>됩니다(되돌릴 수
                없음). 계속할까요?
              </span>
              <button
                className="tf-btn tf-btn-danger-outline"
                disabled={retentionBusy}
                onClick={() => applyRetention(pendingRetentionDays)}
              >
                {retentionBusy ? '적용 중...' : '적용'}
              </button>
              <button className="tf-btn tf-btn-icon" onClick={() => setPendingRetentionDays(undefined)}>
                취소
              </button>
            </span>
          ) : (
            <>
              <span className="tf-trash-policy-text">
                {store.settings.trashRetentionDays == null
                  ? '휴지통 항목을 자동으로 삭제하지 않습니다.'
                  : `휴지통 항목은 ${store.settings.trashRetentionDays}일이 지나면 자동으로 완전히 삭제됩니다(되돌릴 수 없음).`}
              </span>
              <select
                className="tf-input tf-retention-select"
                aria-label="휴지통 보관 기간"
                value={store.settings.trashRetentionDays == null ? 'none' : String(store.settings.trashRetentionDays)}
                onChange={(e) => handleRetentionSelect(e.target.value)}
                disabled={retentionBusy}
              >
                <option value="7">7일</option>
                <option value="14">14일</option>
                <option value="30">30일</option>
                <option value="60">60일</option>
                <option value="90">90일</option>
                <option value="none">자동 삭제 안 함</option>
              </select>
            </>
          )}
        </div>
      ) : null}

      {currentFolder.id !== store.trashId ? (
        <div className="tf-new-folder">
          <input
            className="tf-input"
            aria-label="새 폴더 이름"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
            }}
            placeholder="새 폴더 이름"
          />
          <button className="tf-btn" onClick={handleCreateFolder}>
            + 새 폴더
          </button>
        </div>
      ) : null}

      {currentFolder.id !== store.trashId ? (
        <div className="tf-import-playlist">
          <input
            className="tf-input"
            aria-label="유튜브 재생목록 URL"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleImportPlaylist();
            }}
            placeholder="유튜브 재생목록 URL 붙여넣기 (이 폴더로 가져오기)"
            disabled={importing || !!importFlow}
          />
          <button className="tf-btn" onClick={handleImportPlaylist} disabled={importing || !!importFlow || !playlistUrl.trim()}>
            {importing ? '가져오는 중...' : '📥 재생목록 가져오기'}
          </button>
        </div>
      ) : null}

      {currentFolder.id === store.trashId && trashCount > 0 ? (
        <div className="tf-empty-trash">
          {emptyingTrash ? (
            <span className="tf-confirm-row">
              <span className="tf-confirm-text">
                휴지통의 {trashCount}개 항목이 <strong>영구 삭제</strong>됩니다(되돌릴 수 없음). 계속할까요?
              </span>
              <button className="tf-btn tf-btn-danger-outline" onClick={confirmEmptyTrash}>
                영구 삭제
              </button>
              <button className="tf-btn tf-btn-icon" onClick={() => setEmptyingTrash(false)}>
                취소
              </button>
            </span>
          ) : (
            <button className="tf-btn tf-btn-danger-outline" onClick={() => setEmptyingTrash(true)}>
              🗑️ 휴지통 비우기 ({trashCount}개)
            </button>
          )}
        </div>
      ) : null}

      {importStatus && <div className="tf-import-status">{importStatus}</div>}

      {error && (
        <div className="tf-error-banner" role="alert">
          {error}
        </div>
      )}

      {/* 정렬/보기 컨트롤 + 상시 네비게이션(이전 폴더·상위 폴더)/실행취소·다시 실행 버튼 한 줄
          (2026-09-03, 산들 스크린샷 지시로 배치 — 기존엔 정렬/보기만 있던 줄이었고, 항목이 없거나
          휴지통 안이면 이 줄 자체가 안 보였음). 네비게이션·실행취소 버튼은 정렬/보기가 없는 상황
          (빈 폴더·휴지통 안)에서도 계속 써야 하므로 바깥 조건(children.length > 0 등) 밖에 둬서
          이 줄 자체는 항상 렌더링하고, 정렬/보기 쪽만 조건부로 보인다. */}
      <div className="tf-sort-control">
        {currentFolder.id !== store.trashId && children.length > 0 && (
          <>
            <label className="tf-sort-label" htmlFor="tf-sort-select">
              정렬
            </label>
            <select
              id="tf-sort-select"
              className="tf-input tf-sort-select"
              value={store.settings.sortKey}
              onChange={(e) => handleSortModeChange(e.target.value as Settings['sortKey'])}
            >
              <option value="name">이름순</option>
              <option value="date">날짜순 (유튜브 추가일)</option>
              <option value="addedAt">날짜순 (튜브폴더 추가일)</option>
              <option value="type">유형순</option>
              <option value="size">크기순</option>
              <option value="none">직접 순서(드래그로 정렬)</option>
            </select>

            {!isManualSort && (
              <button
                type="button"
                className="tf-btn tf-btn-icon tf-sort-dir-btn"
                onClick={() => handleSortDirChange(store.settings.sortDir === 'asc' ? 'desc' : 'asc')}
                title={store.settings.sortDir === 'asc' ? '오름차순 (클릭하면 내림차순으로)' : '내림차순 (클릭하면 오름차순으로)'}
                aria-label={
                  store.settings.sortDir === 'asc'
                    ? '오름차순 정렬 중, 클릭하면 내림차순으로 전환'
                    : '내림차순 정렬 중, 클릭하면 오름차순으로 전환'
                }
              >
                {store.settings.sortDir === 'asc' ? '↑' : '↓'}
              </button>
            )}

            <label className="tf-sort-label" htmlFor="tf-view-select">
              보기
            </label>
            <select
              id="tf-view-select"
              className="tf-input tf-sort-select"
              value={isGrid || isTable ? store.settings.view : 'list'}
              onChange={(e) => handleViewChange(e.target.value as Settings['view'])}
            >
              <option value="list">목록</option>
              {GRID_VIEWS.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
              <option value="details">표(자세히)</option>
            </select>
          </>
        )}

        <div className="tf-nav-toolbar-group">
          <button
            type="button"
            className="tf-btn tf-btn-icon tf-undo-redo-btn"
            onClick={handleGoBack}
            disabled={folderHistory.length === 0}
            title={
              folderHistory.length > 0
                ? `이전 폴더로: "${store.nodes[folderHistory[folderHistory.length - 1]]?.name ?? ''}"`
                : '이동 기록이 없습니다'
            }
            aria-label="이전 폴더"
          >
            ◀ 이전 폴더
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-icon tf-undo-redo-btn"
            onClick={handleGoUp}
            disabled={!currentFolder.parentId}
            title={
              currentFolder.parentId
                ? `상위 폴더로: "${store.nodes[currentFolder.parentId]?.name ?? ''}"`
                : '최상위 폴더입니다'
            }
            aria-label="상위 폴더"
          >
            ▲ 상위 폴더
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-icon tf-undo-redo-btn"
            onClick={performUndo}
            disabled={undoSize === 0}
            title={undoSize > 0 ? `실행취소: ${peekUndoLabel()}` : '실행취소할 작업이 없습니다'}
            aria-label="실행취소"
          >
            ↩ 실행취소
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-icon tf-undo-redo-btn"
            onClick={performRedo}
            disabled={redoSize === 0}
            title={redoSize > 0 ? `다시 실행: ${peekRedoLabel()}` : '다시 실행할 작업이 없습니다'}
            aria-label="다시 실행"
          >
            ↪ 다시 실행
          </button>
        </div>
      </div>

      {/* 다중 선택 툴바(ROADMAP 4단계 "다중 선택 + 일괄 이동/삭제", 작업순서 2/8) — 하나 이상
          선택됐을 때만 나타난다. 휴지통 안에서는 이동/삭제 대신 일괄 복원(↩)을 보여준다(개별
          복원 버튼과 같은 원칙 — 1/8 항목 참고). */}
      {selectedIds.size > 0 && (
        <div className="tf-bulk-toolbar">
          <span className="tf-bulk-count">{selectedIds.size}개 선택됨</span>
          <button className="tf-btn tf-btn-icon" onClick={() => setSelectedIds(new Set())}>
            선택 해제
          </button>
          {currentFolderId === store.trashId ? (
            <button className="tf-btn" onClick={handleBulkRestore}>
              ↩ 일괄 복원
            </button>
          ) : (
            <>
              {/* (2026-09-09, "2번 체크박스를 클릭하면 복사·삭제·이동·잘라내기를 선택할 수 있도록"
                  요청 — 체크 후 이 도구모음에서 고르는 방식으로 확정) 기존에 이미 있던 handleCopy/
                  handleCut을 그대로 재사용 — 우클릭 메뉴·Ctrl+C/X와 동일한 함수라 동작이 하나로
                  유지된다. 휴지통 안에서는 클립보드 대상이 아니라(기존 원칙) 노출하지 않는다. */}
              {/* "파일을 다중선택해서 재생하는 기능" 요청(2026-09-10) — 선택 중 영상이 하나도
                  없으면(폴더만 선택) 숨긴다. */}
              {Array.from(selectedIds).some((id) => store.nodes[id] && isVideo(store.nodes[id])) && (
                <button className="tf-btn" onClick={openPlaybackDialogForSelection}>
                  ▶ 재생
                </button>
              )}
              <button className="tf-btn" onClick={handleCopy}>
                복사
              </button>
              <button className="tf-btn" onClick={() => setMoveDialogIds(Array.from(selectedIds))}>
                📁 일괄 이동
              </button>
              <button className="tf-btn" onClick={handleCut}>
                잘라내기
              </button>
            </>
          )}
          {currentFolderId === store.trashId ? null : bulkTrashConfirming ? (
            <span className="tf-confirm-row">
              <span className="tf-confirm-text">
                {selectedIds.size}개 항목을 휴지통으로 이동할까요?
                {store.settings.trashRetentionDays != null && ` (보관기간 ${store.settings.trashRetentionDays}일 후 자동 완전삭제)`}
              </span>
              <button className="tf-btn tf-btn-danger-outline" onClick={handleBulkTrash}>
                이동
              </button>
              <button
                className="tf-btn tf-btn-icon"
                onClick={() => {
                  setBulkTrashConfirming(false);
                  setDeleteConfirmPos(null);
                }}
              >
                취소
              </button>
            </span>
          ) : (
            selectedIds.size > 0 && (
              <button
                className="tf-btn tf-btn-danger-outline"
                onClick={(e) => {
                  // (2026-09-09 요청) 이 버튼 자체의 확인 UI(위 tf-confirm-row)는 그대로 두고,
                  // 추가로 클릭한 마우스 좌표에도 같은 확인 팝업을 띄운다 — 툴바가 화면 밖으로
                  // 스크롤돼 있어도 방금 클릭한 자리에서 바로 확인/취소할 수 있게.
                  setBulkTrashConfirming(true);
                  setDeleteConfirmPos({ x: e.clientX, y: e.clientY });
                }}
              >
                🗑 일괄 휴지통 이동 ({selectedIds.size}개)
              </button>
            )
          )}
        </div>
      )}

      {/* 마우스로 삭제를 트리거한 자리에 뜨는 휴지통 이동 확인 팝업(2026-09-09 요청) — 위
          tf-bulk-toolbar 안의 tf-confirm-row와 완전히 같은 내용·같은 핸들러를 그대로 다시
          렌더링한다(하나를 지우는 게 아니라 함께 보여주는 것). 오버레이를 깔지 않아 툴바 쪽
          확인/취소 버튼도 동시에 그대로 눌릴 수 있다. */}
      {bulkTrashConfirming && deleteConfirmPos && (
        <div
          className="tf-trash-confirm-popup"
          style={{
            left: Math.min(deleteConfirmPos.x, window.innerWidth - 320),
            top: Math.min(deleteConfirmPos.y, window.innerHeight - 96)
          }}
          role="alertdialog"
          aria-label="휴지통으로 이동 확인"
        >
          <span className="tf-confirm-text">
            {selectedIds.size}개 항목을 휴지통으로 이동할까요?
            {store.settings.trashRetentionDays != null && ` (보관기간 ${store.settings.trashRetentionDays}일 후 자동 완전삭제)`}
          </span>
          <span className="tf-trash-confirm-popup-actions">
            <button className="tf-btn tf-btn-danger-outline" onClick={handleBulkTrash}>
              이동
            </button>
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => {
                setBulkTrashConfirming(false);
                setDeleteConfirmPos(null);
              }}
            >
              취소
            </button>
          </span>
        </div>
      )}

      <DndContext
        sensors={dragSensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setOverId(null);
          setOverPosition(null);
          setActiveDragId(null);
        }}
      >
        <div className="tf-layout">
          <FolderSidebar store={store} currentFolderId={currentFolderId} onNavigate={navigateToFolder} navRef={sidebarNavRef} />
          <div className="tf-main-panel">
            {useVirtual ? (
              <div className="tf-scroll-area" ref={scrollParentRef} onContextMenu={(e) => openContextMenu(e, null)}>
          {isGrid ? (
            <div
              ref={gridContainerRef}
              className={`tf-grid tf-grid-${store.settings.view} tf-grid-virtual`}
              style={{ position: 'relative', height: gridRowVirtualizer.getTotalSize() }}
            >
              {gridRowVirtualizer.getVirtualItems().map((vRow) => {
                const rowNodes = gridRows[vRow.index] ?? [];
                return (
                  <div
                    key={vRow.index}
                    ref={gridRowVirtualizer.measureElement}
                    data-index={vRow.index}
                    className="tf-grid-row"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vRow.start}px)`,
                      gridTemplateColumns: `repeat(${gridColumns}, 1fr)`
                    }}
                  >
                    {rowNodes.map((node) => {
                      const isTrash = node.id === store.trashId;
                      const isFolder = node.type === 'folder';
                      return (
                        <div
                          key={node.id}
                          className="tf-tile"
                          onContextMenu={(e) => openContextMenu(e, node.id)}
                        >
                          {renderTileBody(node, isTrash, isFolder, store)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : isTable ? (
            <div className="tf-vtable" role="table" aria-label="영상·폴더 표 보기">
              <div className="tf-vtable-header" role="row">
                <div className="tf-vtable-cell tf-trow-handle-cell" aria-hidden="true" />
                {(
                  [
                    { key: 'name', label: '이름' },
                    { key: 'date', label: '유튜브 추가일' },
                    { key: 'addedAt', label: '튜브폴더 추가일' },
                    { key: 'type', label: '유형' },
                    { key: 'size', label: '크기' }
                  ] as { key: Settings['sortKey']; label: string }[]
                ).map((col) => (
                  <button key={col.key} type="button" role="columnheader" className="tf-th-sort" onClick={() => handleHeaderSort(col.key)}>
                    {col.label}
                    {store.settings.sortKey === col.key && (
                      <span aria-hidden="true"> {store.settings.sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                ))}
                <div className="tf-vtable-cell" aria-hidden="true" />
              </div>
              <div style={{ position: 'relative', height: itemVirtualizer.getTotalSize() }} role="rowgroup">
                {itemVirtualizer.getVirtualItems().map((vItem) => {
                  const node = children[vItem.index];
                  const isTrash = node.id === store.trashId;
                  const isFolder = node.type === 'folder';
                  const c = tableCells(node, isTrash, isFolder, store);
                  return (
                    <div
                      key={node.id}
                      ref={itemVirtualizer.measureElement}
                      data-index={vItem.index}
                      role="row"
                      className="tf-vtable-row"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                      onContextMenu={(e) => openContextMenu(e, node.id)}
                    >
                      <div className="tf-vtable-cell tf-trow-handle-cell" />
                      <div className="tf-vtable-cell tf-tcell-name">{c.name}</div>
                      <div className="tf-vtable-cell tf-tcell-date">{c.date}</div>
                      <div className="tf-vtable-cell tf-tcell-addedat">{c.addedAt}</div>
                      <div className="tf-vtable-cell tf-tcell-type">{c.type}</div>
                      <div className="tf-vtable-cell tf-tcell-size">{c.size}</div>
                      <div className="tf-vtable-cell tf-tcell-actions">{c.actions}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ul className="tf-list" style={{ position: 'relative', height: itemVirtualizer.getTotalSize(), margin: 0, padding: 0 }}>
              {itemVirtualizer.getVirtualItems().map((vItem) => {
                const node = children[vItem.index];
                const isTrash = node.id === store.trashId;
                const isFolder = node.type === 'folder';
                return (
                  <li
                    key={node.id}
                    ref={itemVirtualizer.measureElement}
                    data-index={vItem.index}
                    className="tf-row"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                    onContextMenu={(e) => openContextMenu(e, node.id)}
                  >
                    {renderRowBody(node, isTrash, isFolder, store)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
            ) : (
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {isGrid ? (
              <div className={`tf-grid tf-grid-${store.settings.view}`} onContextMenu={(e) => openContextMenu(e, null)}>
                {children.length === 0 && <p className="tf-empty">비어 있습니다.</p>}
                {children.map((node) => {
                  const isTrash = node.id === store.trashId;
                  const isFolder = node.type === 'folder';

                  if (isTrash) {
                    return (
                      <TrashDropZoneTile key={node.id} id={node.id}>
                        {renderTileBody(node, isTrash, isFolder, store)}
                      </TrashDropZoneTile>
                    );
                  }

                  return (
                    <SortableGridItem
                      key={node.id}
                      id={node.id}
                      disabled={false}
                      isOver={overId === node.id}
                      overPosition={overId === node.id ? overPosition : null}
                      coDragging={activeDragIds.length > 1 && activeDragIds.includes(node.id) && node.id !== activeDragId}
                      dragHandleLabel={`"${node.name}" 드래그로 이동`}
                      onContextMenu={(e) => openContextMenu(e, node.id)}
                    >
                      {(dragProps) => renderTileBody(node, isTrash, isFolder, store, dragProps)}
                    </SortableGridItem>
                  );
                })}
              </div>
            ) : isTable ? (
              <table className="tf-table" onContextMenu={(e) => openContextMenu(e, null)}>
                <thead>
                  <tr>
                    <th className="tf-trow-handle-cell" aria-hidden="true" />
                    {(
                      [
                        { key: 'name', label: '이름' },
                        { key: 'date', label: '유튜브 추가일' },
                        { key: 'addedAt', label: '튜브폴더 추가일' },
                        { key: 'type', label: '유형' },
                        { key: 'size', label: '크기' }
                      ] as { key: Settings['sortKey']; label: string }[]
                    ).map((col) => (
                      <th key={col.key}>
                        <button type="button" className="tf-th-sort" onClick={() => handleHeaderSort(col.key)}>
                          {col.label}
                          {store.settings.sortKey === col.key && (
                            <span aria-hidden="true"> {store.settings.sortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </button>
                      </th>
                    ))}
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {children.length === 0 && (
                    <tr>
                      <td className="tf-empty" colSpan={7}>
                        비어 있습니다.
                      </td>
                    </tr>
                  )}
                  {children.map((node) => {
                    const isTrash = node.id === store.trashId;
                    const isFolder = node.type === 'folder';

                    if (isTrash) {
                      const c = tableCells(node, isTrash, isFolder, store);
                      return (
                        <TrashDropZoneRow key={node.id} id={node.id}>
                          <td className="tf-tcell-name">{c.name}</td>
                          <td className="tf-tcell-date">{c.date}</td>
                          <td className="tf-tcell-addedat">{c.addedAt}</td>
                          <td className="tf-tcell-type">{c.type}</td>
                          <td className="tf-tcell-size">{c.size}</td>
                          <td className="tf-tcell-actions">{c.actions}</td>
                        </TrashDropZoneRow>
                      );
                    }

                    return (
                      <SortableTableRow
                        key={node.id}
                        id={node.id}
                        disabled={false}
                        isOver={overId === node.id}
                        overPosition={overId === node.id ? overPosition : null}
                        coDragging={activeDragIds.length > 1 && activeDragIds.includes(node.id) && node.id !== activeDragId}
                        dragHandleLabel={`"${node.name}" 드래그로 이동`}
                        onContextMenu={(e) => openContextMenu(e, node.id)}
                      >
                        {(dragProps) => {
                          const c = tableCells(node, isTrash, isFolder, store, dragProps);
                          return (
                            <>
                              <td className="tf-tcell-name">{c.name}</td>
                              <td className="tf-tcell-date">{c.date}</td>
                              <td className="tf-tcell-addedat">{c.addedAt}</td>
                              <td className="tf-tcell-type">{c.type}</td>
                              <td className="tf-tcell-size">{c.size}</td>
                              <td className="tf-tcell-actions">{c.actions}</td>
                            </>
                          );
                        }}
                      </SortableTableRow>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <ul className="tf-list" onContextMenu={(e) => openContextMenu(e, null)}>
                {children.length === 0 && <li className="tf-empty">비어 있습니다.</li>}
                {children.map((node) => {
                  const isTrash = node.id === store.trashId;
                  const isFolder = node.type === 'folder';

                  if (isTrash) {
                    return (
                      <TrashDropZoneListItem key={node.id} id={node.id}>
                        {renderRowBody(node, isTrash, isFolder, store)}
                      </TrashDropZoneListItem>
                    );
                  }

                  return (
                    <SortableRow
                      key={node.id}
                      id={node.id}
                      disabled={false}
                      isOver={overId === node.id}
                      overPosition={overId === node.id ? overPosition : null}
                      coDragging={activeDragIds.length > 1 && activeDragIds.includes(node.id) && node.id !== activeDragId}
                      dragHandleLabel={`"${node.name}" 드래그로 이동`}
                      onContextMenu={(e) => openContextMenu(e, node.id)}
                    >
                      {(dragProps) => renderRowBody(node, isTrash, isFolder, store, dragProps)}
                    </SortableRow>
                  );
                })}
              </ul>
            )}
              </SortableContext>
            )}
          </div>
        </div>
        {/* 여러 개를 선택한 채 드래그하면 실제로 커서를 따라 움직이는 dnd-kit 요소는 하나뿐이라
            "한 개만 옮기는 것처럼 보인다"는 피드백이 있었음(2026-09-03) — 나머지 선택 항목은
            coDragging으로 흐리게 표시하고, 여기서는 "N개 항목" 배지를 커서 옆에 띄워 다같이
            옮겨지고 있음을 알려준다. 단일 항목 드래그는 기존처럼 항목 자체가 커서를 따라가는
            것으로 충분해 배지를 띄우지 않는다. */}
        <DragOverlay>
          {activeDragId && activeDragIds.length > 1 && store?.nodes[activeDragId] ? (
            <div className="tf-drag-overlay-chip">
              <span className="tf-drag-overlay-icon">
                {store.nodes[activeDragId].type === 'folder' ? folderIcon(store.nodes[activeDragId], store) : '🎬'}
              </span>
              <span className="tf-drag-overlay-name">{store.nodes[activeDragId].name}</span>
              <span className="tf-drag-count-badge">{activeDragIds.length}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {contextMenu && (
        <div
          className="tf-context-menu-overlay"
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        >
          <div
            className="tf-context-menu"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 168),
              top: Math.min(contextMenu.y, window.innerHeight - 196)
            }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            {/* 항목(폴더/영상) 위에서 열렸을 때만 복사/삭제/이동/잘라내기 노출 — 빈 공간 우클릭이면
                forNode=false라 이 메뉴 항목들은 숨고 붙여넣기만 보인다. 순서는 산들 요청 원문 그대로:
                복사, 삭제, 이동, 잘라내기(2026-09-08). 체크박스로 선택한 뒤 다중 선택 툴바에서 같은
                작업을 고르는 경로와 별개로, 우클릭으로도 동일하게 쓸 수 있게 유지한다. */}
            {contextMenu.forNode && (
              <>
                <button type="button" className="tf-context-menu-item" role="menuitem" onClick={handleCopy}>
                  복사
                </button>
                <button type="button" className="tf-context-menu-item" role="menuitem" onClick={handleMenuDelete}>
                  삭제
                </button>
                <button type="button" className="tf-context-menu-item" role="menuitem" onClick={handleMenuMove}>
                  이동
                </button>
                <button type="button" className="tf-context-menu-item" role="menuitem" onClick={handleCut}>
                  잘라내기
                </button>
                {/* "공유"는 선택 항목이 전부 영상일 때만 노출(2026-09-09, "동영상 우클릭 →
                    카카오톡/문자 공유" 요청) — 폴더가 섞여 있으면 링크 공유 개념이 성립하지 않음.
                    store가 아직 없을 리 없지만(이 메뉴 자체가 store 로드 후에만 열림) 타입 좁히기용
                    안전장치로 옵셔널 체이닝. */}
                {Array.from(selectedIds).every((id) => store?.nodes[id] && isVideo(store.nodes[id])) && (
                  <>
                    <div className="tf-context-menu-sep" role="separator" />
                    <button type="button" className="tf-context-menu-item" role="menuitem" onClick={() => handleShare('kakao')}>
                      💬 카카오톡으로 공유
                    </button>
                    <button type="button" className="tf-context-menu-item" role="menuitem" onClick={() => handleShare('sms')}>
                      ✉️ 문자로 공유
                    </button>
                  </>
                )}
                <div className="tf-context-menu-sep" role="separator" />
              </>
            )}
            {/* (2026-09-09, "사이드바·본문 빈 공간에서 우클릭하면 새 폴더를 만들 수 있게 해달라"
                요청) 빈 공간 우클릭(forNode=false)일 때만 노출 — 항목 위에서 우클릭했을 땐 그
                항목에 대한 동작(위 복사/삭제/이동/잘라내기)만 의미가 있으므로 숨긴다. 대상 폴더는
                openContextMenu가 미리 계산해 contextMenu.newFolderParentId에 담아둔 값(사이드바
                빈 공간이면 최상위 폴더, 본문 빈 공간이면 지금 보고 있는 폴더)을 그대로 쓴다. */}
            {!contextMenu.forNode && (
              <>
                <button
                  type="button"
                  className="tf-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    const parentId = contextMenu.newFolderParentId;
                    closeContextMenu();
                    handleContextCreateFolder(parentId);
                  }}
                >
                  📁 새 폴더
                </button>
                <div className="tf-context-menu-sep" role="separator" />
              </>
            )}
            <button type="button" className="tf-context-menu-item" role="menuitem" onClick={handlePaste} disabled={!clipboard}>
              붙여넣기{clipboard ? ` (${clipboard.ids.length}개)` : ''}
            </button>
          </div>
        </div>
      )}

      {playingVideo && <PlayerOverlay key={playingVideo.id} video={playingVideo} onClose={handleClosePlayer} />}

      {iconPickerFolderId && store && (
        <div className="tf-sync-overlay" onClick={() => setIconPickerFolderId(null)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-iconpicker-title"
          >
            <h2 id="tf-iconpicker-title">🎨 폴더 아이콘 선택</h2>
            <p className="tf-sync-desc">"{store.nodes[iconPickerFolderId]?.name}" 폴더에 사용할 아이콘을 골라주세요.</p>
            <div className="tf-icon-picker">
              {FOLDER_ICON_CATEGORIES.map((cat) => (
                <div key={cat.label} className="tf-icon-picker-category">
                  <div className="tf-icon-picker-label">{cat.label}</div>
                  <div className="tf-icon-picker-grid">
                    {cat.icons.map((icon) => (
                      <button
                        key={icon}
                        className="tf-icon-picker-item"
                        onClick={() => handlePickIcon(iconPickerFolderId, icon)}
                        title={icon}
                        aria-label={`${cat.label} ${icon}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={() => handlePickIcon(iconPickerFolderId, null)}>
                {DEFAULT_FOLDER_ICON} 기본 아이콘으로 초기화
              </button>
              <button className="tf-btn" onClick={() => setIconPickerFolderId(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 영상 상세보기 모달(2026-09-09, "1번 아이콘을 클릭하면 파일의 상세내용을 자세히 볼 수 있도록"
          요청, 확인 완료: 모달 팝업 형태·영상 전용) — 다른 모달과 같은 tf-sync-overlay/tf-sync-panel
          틀을 재사용해 새 모달 셸 CSS가 필요 없다. 표(자세히) 보기의 열 데이터 헬퍼(nodeDateValue 등)를
          그대로 재사용해 표시 값이 표 보기와 항상 일치한다. */}
      {detailViewNodeId &&
        store &&
        (() => {
          const detailNode = store.nodes[detailViewNodeId];
          if (!detailNode || !isVideo(detailNode)) return null;
          return (
            <div className="tf-sync-overlay" onClick={() => setDetailViewNodeId(null)}>
              <div
                className="tf-sync-panel"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tf-detailview-title"
              >
                <h2 id="tf-detailview-title">ℹ️ 상세보기</h2>
                {detailNode.thumb && <img className="tf-detail-thumb" src={detailNode.thumb} alt="" />}
                <p className="tf-sync-desc">
                  <strong>{detailNode.name}</strong>
                </p>
                <dl className="tf-detail-list">
                  <dt>채널</dt>
                  <dd>{detailNode.channel || '-'}</dd>
                  <dt>유형</dt>
                  <dd>{nodeTypeLabel(detailNode, store)}</dd>
                  <dt>재생시간</dt>
                  <dd>{detailNode.duration > 0 ? formatDuration(detailNode.duration) : '-'}</dd>
                  <dt>유튜브 추가일</dt>
                  <dd>{formatModifiedAt(nodeDateValue(detailNode)) || '-'}</dd>
                  <dt>튜브폴더 추가일</dt>
                  <dd>{formatModifiedAt(nodeAddedAtValue(detailNode)) || '-'}</dd>
                  <dt>위치</dt>
                  <dd>{nodePathLabel(store, detailNode) || '(최상위)'}</dd>
                </dl>
                <div className="tf-sync-actions">
                  <button
                    className="tf-btn"
                    onClick={() => {
                      setDetailViewNodeId(null);
                      handleVideoClick(detailNode);
                    }}
                  >
                    ▶ 재생
                  </button>
                  <button className="tf-btn" onClick={() => setDetailViewNodeId(null)}>
                    닫기
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {trashInfoModalFolderId && store && (
        <div className="tf-sync-overlay" onClick={() => setTrashInfoModalFolderId(null)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-trashinfo-title"
          >
            <h2 id="tf-trashinfo-title">🗑️ 휴지통으로 이동</h2>
            <p className="tf-sync-desc">
              "{store.nodes[trashInfoModalFolderId]?.name}" 항목을 휴지통으로 옮깁니다. 휴지통에 있는 항목은 설정된 보관
              기간이 지나면 자동으로 완전히 삭제됩니다(되돌릴 수 없음).
            </p>
            <p className="tf-sync-fineprint">
              기본 보관 기간은 30일이며, 휴지통 화면에서 원하는 기간으로 직접 조정하거나 자동 삭제를 아예 꺼둘 수도
              있습니다(현재 설정:{' '}
              {store.settings.trashRetentionDays == null ? '자동 삭제 안 함' : `${store.settings.trashRetentionDays}일`}).
            </p>
            <label className="tf-checkbox-row">
              <input
                type="checkbox"
                checked={trashInfoCheckbox}
                onChange={(e) => setTrashInfoCheckbox(e.target.checked)}
              />
              다음부터 이 안내를 보지 않기
            </label>
            <div className="tf-sync-actions">
              <button className="tf-btn tf-btn-danger-outline" onClick={confirmTrashWithInfo}>
                휴지통으로 이동
              </button>
              <button className="tf-btn" onClick={() => setTrashInfoModalFolderId(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {moveDialogIds && moveDialogIds.length > 0 && store && (
        <MoveDialog
          store={store}
          nodes={moveDialogIds.map((id) => store.nodes[id]).filter((n): n is TubeNode => !!n)}
          onPick={handleConfirmMove}
          onCancel={() => setMoveDialogIds(null)}
        />
      )}

      {playbackDialogNodes && playbackDialogNodes.length > 0 && (
        <PlaybackOptionsDialog
          videoCount={playbackDialogNodes.length}
          onStart={handlePlaybackStart}
          onCancel={() => setPlaybackDialogNodes(null)}
        />
      )}

      {/* 재생목록 URL 입력창 가져오기의 목적지 선택 팝업(2026-09-09 요청) — 유튜브 우클릭
          가져오기와 달리 "같은 이름 폴더가 있어서 물어보는" 게 아니라, 매번 직접 고르는 방식이라
          단순한 3지선다. 다른 모달들과 같은 tf-sync-overlay/tf-sync-panel 틀을 재사용한다. */}
      {importFlow?.stage === 'choose-destination' && currentFolder && (
        <div className="tf-sync-overlay" onClick={() => setImportFlow(null)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-import-dest-title"
          >
            <h2 id="tf-import-dest-title">📥 재생목록 가져오기</h2>
            <p className="tf-sync-desc">영상 {importFlow.videos.length}개를 어디에 가져올까요?</p>
            <div className="tf-import-dest-options">
              <button
                className="tf-btn"
                onClick={() => setImportFlow({ stage: 'name-new-folder', videos: importFlow.videos, apiFailReason: importFlow.apiFailReason })}
              >
                🆕 새 폴더 만들기
              </button>
              <button
                className="tf-btn"
                onClick={() =>
                  setImportFlow({
                    stage: 'confirm-existing',
                    videos: importFlow.videos,
                    apiFailReason: importFlow.apiFailReason,
                    folderId: currentFolder.id,
                    folderName: currentFolder.name
                  })
                }
              >
                📂 현재 폴더("{currentFolder.name}")에 넣기
              </button>
              <button
                className="tf-btn"
                onClick={() => setImportFlow({ stage: 'pick-folder', videos: importFlow.videos, apiFailReason: importFlow.apiFailReason })}
              >
                🗂 다른 폴더에 넣기
              </button>
            </div>
            <p className="tf-note">
              새 폴더는 중복 여부와 상관없이 전체를 가져오고, 현재 폴더·다른 폴더는 그 폴더에 이미 있는 것과 이름이 같은 영상은 제외합니다.
            </p>
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={() => setImportFlow(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {importFlow?.stage === 'name-new-folder' && (
        <div className="tf-sync-overlay" onClick={() => setImportFlow(null)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-import-newfolder-title"
          >
            <h2 id="tf-import-newfolder-title">🆕 새 폴더 만들기</h2>
            <p className="tf-sync-desc">영상 {importFlow.videos.length}개를 담을 새 폴더 이름을 확인하거나 수정하세요.</p>
            <input
              className="tf-input"
              value={importNewFolderName}
              onChange={(e) => setImportNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNewFolderAndImport();
              }}
              maxLength={200}
              autoFocus
            />
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={() => setImportFlow(null)}>
                취소
              </button>
              <button className="tf-btn tf-btn-primary" onClick={handleCreateNewFolderAndImport} disabled={!importNewFolderName.trim()}>
                가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {importFlow?.stage === 'pick-folder' && store && (
        <MoveDialog
          store={store}
          nodes={[]}
          title="🗂 가져올 폴더 선택"
          description="재생목록을 가져올 폴더를 선택하세요. 그 폴더에 이미 있는 것과 이름이 같은 영상은 제외됩니다."
          onPick={(destFolderId) => {
            const destFolder = store.nodes[destFolderId];
            setImportFlow({
              stage: 'confirm-existing',
              videos: importFlow.videos,
              apiFailReason: importFlow.apiFailReason,
              folderId: destFolderId,
              folderName: destFolder?.name ?? ''
            });
          }}
          onCancel={() => setImportFlow(null)}
        />
      )}

      {/* (2026-09-09, "현재 폴더/다른 폴더에 넣을 때는 실행 직전에 폴더 이름을 보여주고
          확인하는 팝업을 띄워달라" 요청) 실제로 addVideosToFolder를 호출하기 전 마지막 확인
          단계 — "새 폴더 만들기"는 이름 입력 팝업 자체가 이미 확인 역할을 하므로 여기 없음. */}
      {importFlow?.stage === 'confirm-existing' && (
        <div className="tf-sync-overlay" onClick={() => setImportFlow(null)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-import-confirm-title"
          >
            <h2 id="tf-import-confirm-title">가져오기 확인</h2>
            <p className="tf-sync-desc">
              "{importFlow.folderName}" 폴더에 영상 {importFlow.videos.length}개를 가져올까요?
            </p>
            <p className="tf-note">이미 있는 것과 이름이 같은 영상은 제외하고 추가합니다.</p>
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={() => setImportFlow(null)}>
                취소
              </button>
              <button
                className="tf-btn tf-btn-primary"
                onClick={() => runImport(importFlow.folderId, importFlow.videos, true, importFlow.apiFailReason)}
              >
                가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 가져오기 결과 팝업(2026-09-09 요청) — 유튜브 페이지 우클릭 "이 재생목록 가져오기"의
          결과 팝업과 완전히 같은 형식·문구를 매니저 탭 URL 입력창 가져오기에도 그대로 맞춘다. */}
      {importResult && !importDupListOpen && (
        <div className="tf-sync-overlay" onClick={() => setImportResult(null)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-import-result-title"
          >
            <h2 id="tf-import-result-title">가져오기 완료</h2>
            <p className="tf-sync-desc">
              총 {importResult.total}개 중 중복 {importResult.duplicateNames.length}개를 제외하고 {importResult.added}개를 가져왔습니다.
              현재 폴더에는 총 {importResult.finalCount}개의 파일이 있습니다.
            </p>
            {importResult.apiFailReason && (
              <p className="tf-note">참고: 공식 API 실패로 예전 방식을 사용했습니다 ({importResult.apiFailReason}).</p>
            )}
            <div className="tf-sync-actions">
              {importResult.duplicateNames.length > 0 && (
                <button className="tf-btn" onClick={() => setImportDupListOpen(true)}>
                  중복 목록 보기
                </button>
              )}
              <button className="tf-btn tf-btn-primary" onClick={() => setImportResult(null)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {importResult && importDupListOpen && (
        <div className="tf-sync-overlay" onClick={() => setImportDupListOpen(false)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-import-duplist-title"
          >
            <h2 id="tf-import-duplist-title">제외된 중복 파일 ({importResult.duplicateNames.length}개)</h2>
            <ul className="tf-import-dup-list">
              {importResult.duplicateNames.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={() => setImportDupListOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          key={toast.ts}
          label={toast.label}
          actionLabel={toast.kind === 'undo' ? '실행취소' : toast.kind === 'redo' ? '다시 실행' : undefined}
          onAction={toast.kind === 'undo' ? performUndo : toast.kind === 'redo' ? performRedo : undefined}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
