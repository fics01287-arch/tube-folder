import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { load, save, STORAGE_KEY } from '../storage/storage';
import {
  addVideosToFolder,
  createFolder,
  dismissTrashInfo,
  emptyTrash,
  moveNode,
  previewRetentionPurgeCount,
  purgeExpiredTrash,
  renameFolder,
  reorderChildren,
  restoreFromTrash,
  setFolderIcon,
  setSort,
  setSortDir,
  setSortMode,
  setTrashRetentionDays,
  setView,
  trashFolder
} from '../storage/folderOps';
import { extractPlaylistId, fetchPlaylistVideos } from '../storage/playlistImport';
import { youtubeUrl } from '../shared/youtubeSelectors';
import { DEFAULT_FOLDER_ICON, FOLDER_ICON_CATEGORIES } from '../shared/folderIcons';
import { useEscapeClose } from './useEscapeClose';
import { isVideo } from '../storage/types';
import type { Settings, TubeNode, TubeStoreData, VideoNode } from '../storage/types';
import PlayerOverlay from './PlayerOverlay';
import SyncControl from './SyncControl';
import LicenseControl from './LicenseControl';
import AppInfo from './AppInfo';
import Toast from './Toast';
import MoveDialog from './MoveDialog';
import { pushUndo, popUndo, pushRedo, popRedo, pushUndoFromRedo, clearUndo } from './undoStack';
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

// 정렬 기준별 1차 비교값(방향·이름 보조정렬은 sortNodes에서 처리) — 이름순은 기존 로캘 자연정렬 그대로.
function compareByKey(a: TubeNode, b: TubeNode, sortKey: Settings['sortKey'], store: TubeStoreData): number {
  switch (sortKey) {
    case 'date':
      return a.modifiedAt - b.modifiedAt;
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
  dragHandleLabel,
  children
}: {
  id: string;
  disabled: boolean;
  isOver: boolean;
  overPosition: 'before' | 'after' | null;
  dragHandleLabel: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };
  const dropClass =
    isOver && overPosition === 'before' ? ' tf-row-drop-before' : isOver && overPosition === 'after' ? ' tf-row-drop-after' : '';
  return (
    <li ref={setNodeRef} style={style} className={'tf-row' + dropClass}>
      {!disabled && (
        <span className="tf-drag-handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
          ⠿
        </span>
      )}
      {children}
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

// 그리드 타일 최소 너비 — App.css의 .tf-grid-xl/large/medium/small(minmax 하한)과 반드시 일치시켜야
// 컨테이너 너비 기준 열 개수 계산(가상 그리드 행 묶음)이 실제 CSS 레이아웃과 어긋나지 않는다.
const GRID_TILE_MIN_WIDTH: Record<string, number> = { xl: 132, large: 104, medium: 84, small: 64 };
const GRID_GAP = 14; // App.css .tf-grid의 gap과 일치

// 그리드 타일용 드래그 손잡이 — 목록 보기(SortableRow)와 같은 이유로 타일 전체가 아니라
// 좌상단 작은 손잡이(⠿)에만 dnd-kit 리스너를 걸어, 타일 클릭(열기)·이름변경·삭제 버튼과 겹치지 않게 한다.
function SortableGridItem({
  id,
  disabled,
  isOver,
  overPosition,
  dragHandleLabel,
  children
}: {
  id: string;
  disabled: boolean;
  isOver: boolean;
  overPosition: 'before' | 'after' | null;
  dragHandleLabel: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };
  const dropClass =
    isOver && overPosition === 'before'
      ? ' tf-tile-drop-before'
      : isOver && overPosition === 'after'
        ? ' tf-tile-drop-after'
        : '';
  return (
    <div ref={setNodeRef} style={style} className={'tf-tile' + dropClass}>
      {!disabled && (
        <span className="tf-drag-handle tf-tile-drag-handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
          ⠿
        </span>
      )}
      {children}
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
  dragHandleLabel,
  children
}: {
  id: string;
  disabled: boolean;
  isOver: boolean;
  overPosition: 'before' | 'after' | null;
  dragHandleLabel: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };
  const dropClass =
    isOver && overPosition === 'before' ? ' tf-row-drop-before' : isOver && overPosition === 'after' ? ' tf-row-drop-after' : '';
  return (
    <tr ref={setNodeRef} style={style} className={'tf-trow' + dropClass}>
      <td className="tf-trow-handle-cell">
        {!disabled && (
          <span className="tf-drag-handle" aria-label={dragHandleLabel} {...attributes} {...listeners}>
            ⠿
          </span>
        )}
      </td>
      {children}
    </tr>
  );
}

export default function App() {
  const [store, setStore] = useState<TubeStoreData | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('새 폴더');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<VideoNode | null>(null);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [licenseOpenSignal, setLicenseOpenSignal] = useState(0);
  // 휴지통 보관기간 변경 확인 흐름 — null이면 확인 대기 중이 아님(선택만 바꾼 상태)
  const [pendingRetentionDays, setPendingRetentionDays] = useState<number | null | undefined>(undefined);
  const [pendingRetentionPreview, setPendingRetentionPreview] = useState(0);
  const [retentionBusy, setRetentionBusy] = useState(false);
  // 삭제(휴지통 이동) 시 뜨는 보관기간 정책 안내 팝업 — 대상 폴더 id가 있으면 열려 있는 상태
  const [trashInfoModalFolderId, setTrashInfoModalFolderId] = useState<string | null>(null);
  const [trashInfoCheckbox, setTrashInfoCheckbox] = useState(false);
  // 폴더 아이콘 선택 패널 — 대상 폴더 id가 있으면 열려 있는 상태(ROADMAP 4단계 "폴더 아이콘 다양화")
  const [iconPickerFolderId, setIconPickerFolderId] = useState<string | null>(null);

  // 실행취소(undo) — 토스트에 뭘 보여줄지만 이 컴포넌트가 들고 있고, 실제 스택 데이터는
  // undoStack.ts 모듈이 관리한다(2026-08-29 신규, ROADMAP-CHECKLIST.md 참고).
  const [toast, setToast] = useState<{ label: string; kind: 'undo' | 'redo'; ts: number } | null>(null);
  // "다른 폴더로 이동" 대상 선택 모달을 열 때, 어떤 노드를 옮기는 중인지 기억해둔다.
  const [moveDialogNodeId, setMoveDialogNodeId] = useState<string | null>(null);
  // 드래그 재배치(ROADMAP 4단계 "드래그 삽입선 표시") — 현재 드롭 대상 행과, 그 행의 위/아래 중 어디에 삽입될지
  const [overId, setOverId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<'before' | 'after' | null>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const refresh = useCallback(async (keepFolderId?: string | null) => {
    const data = await load();
    setStore(data);
    const wanted = keepFolderId ?? data.rootId;
    setCurrentFolderId(data.nodes[wanted] ? wanted : data.rootId);
  }, []);

  // 동기화 등 비동기 콜백이 "지금 보고 있는 폴더"를 유지한 채 새로고침할 수 있게 ref로 추적
  const currentFolderIdRef = useRef<string | null>(null);
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

  // 실행취소/다시 실행 단축키. 실행취소는 Ctrl+Z/Cmd+Z, 다시 실행은 Ctrl+Y(윈도우 관례)와
  // Ctrl+Shift+Z/Cmd+Shift+Z(맥·여러 앱 공통 관례)를 모두 지원한다(2026-08-29 "다시 실행
  // 기능도 추가해줘" 요청으로 추가). 이름변경 입력창 등 편집 가능한 요소에 포커스가 있을 때는
  // 건드리지 않는다 — 브라우저 기본 텍스트 undo/redo를 앱 차원의 실행취소가 가로채면 안 되기 때문.
  // (App.tsx에 keydown 리스너가 이것 하나뿐, 기존 리스너와 충돌 없음)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const isUndo = mod && !e.shiftKey && key === 'z';
      const isRedo = mod && ((e.shiftKey && key === 'z') || key === 'y');
      if (!isUndo && !isRedo) return;
      const el = document.activeElement;
      const isEditable =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      if (isUndo) performUndo();
      else performRedo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentFolderId]);

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

  // 드래그 재배치 대상 id 목록 — 휴지통 제외(항상 마지막 고정, 드래그 불가)
  const sortableIds = useMemo(() => children.filter((n) => n.id !== store?.trashId).map((n) => n.id), [children, store]);
  const isManualSort = store?.settings.sortKey === 'none';
  const isGrid = !!store && GRID_VIEW_KEYS.has(store.settings.view);
  const isTable = store?.settings.view === 'details';

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
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof LicenseLimitError) setLicenseOpenSignal((n) => n + 1);
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
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setOverId(null);
      setOverPosition(null);
      return;
    }
    setOverId(String(over.id));
    const activeIndex = sortableIds.indexOf(String(active.id));
    const targetIndex = sortableIds.indexOf(String(over.id));
    setOverPosition(activeIndex > targetIndex ? 'before' : 'after');
  }

  async function handleDragEnd(event: DragEndEvent) {
    setOverId(null);
    setOverPosition(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !currentFolderId) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
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
      await trashFolder(id);
      pushUndo({ label, snapshot: before });
      setDeletingId(null);
      await refresh(currentFolderId);
      scheduleAutoSync();
      setToast({ label, kind: 'undo', ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 이동 다이얼로그에서 대상 폴더를 클릭하면 호출됨 — moveNode() 성공 시에만 실행취소 스택에 쌓는다.
  async function handleConfirmMove(destFolderId: string) {
    if (!moveDialogNodeId) return;
    setError(null);
    try {
      const before = await load();
      const label = `"${before.nodes[moveDialogNodeId]?.name ?? ''}" 폴더 이동`;
      await moveNode(moveDialogNodeId, destFolderId);
      pushUndo({ label, snapshot: before });
      setMoveDialogNodeId(null);
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
      await trashFolder(trashInfoModalFolderId);
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

  function handleVideoClick(node: TubeNode) {
    setError(null);
    if (!isVideo(node)) return;
    if (!node.videoId) {
      setError('이 영상은 재생할 수 없습니다 (videoId를 확인할 수 없음).');
      return;
    }
    setPlayingVideo(node);
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
      const videos = await fetchPlaylistVideos(playlistId, (p) =>
        setImportStatus(`영상 목록을 가져오는 중... (${p.fetched}개 인식됨)`)
      );
      setImportStatus(`폴더에 추가하는 중... (${videos.length}개)`);
      const result = await addVideosToFolder(
        currentFolderId,
        videos.map((v) => ({
          url: youtubeUrl.watch(v.videoId),
          videoId: v.videoId,
          title: v.title,
          channel: v.channel,
          duration: v.duration
        }))
      );
      setPlaylistUrl('');
      // addVideosToFolder()는 실제로 추가된 게 하나라도 있을 때만 저장한다(전부 건너뛴 경우
      // 저장 자체가 없으니 스냅샷도 그대로 유효 — added===0이면 비울 필요 없음).
      if (result.added > 0) {
        clearUndo();
        setToast(null);
      }
      await refresh(currentFolderId);
      scheduleAutoSync();
      if (result.limitReached) {
        setImportStatus(
          `무료 버전 한도라 ${result.added}개만 추가되고 나머지는 건너뛰었습니다. 전체를 가져오려면 업그레이드가 필요합니다.`
        );
        setLicenseOpenSignal((n) => n + 1);
      } else {
        setImportStatus(`완료: ${result.added}개 추가됨, ${result.skipped}개는 이미 있어 건너뜀`);
      }
    } catch (e) {
      setImportStatus(null);
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof LicenseLimitError) setLicenseOpenSignal((n) => n + 1);
    } finally {
      setImporting(false);
    }
  }

  // 접근성 보강(ROADMAP 4단계) — 배경 클릭 외에 Esc 키로도 오버레이 패널을 닫을 수 있게 한다.
  useEscapeClose(!!trashInfoModalFolderId, () => setTrashInfoModalFolderId(null));
  useEscapeClose(!!iconPickerFolderId, () => setIconPickerFolderId(null));

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
  function renderRowBody(node: TubeNode, isTrash: boolean, isFolder: boolean, store: TubeStoreData): ReactNode {
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
            <button className="tf-row-name" onClick={() => setCurrentFolderId(node.id)} title="열기">
              {folderIcon(node, store)} {node.name}
            </button>
          )
        ) : (
          <button
            className="tf-row-name tf-row-name-video"
            onClick={() => handleVideoClick(node)}
            title={isVideo(node) && node.videoId ? '재생' : '재생할 수 없는 영상(videoId 없음)'}
          >
            🎬 {node.name}
          </button>
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
              onClick={() => setMoveDialogNodeId(node.id)}
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
        {!isFolder && (
          <span className="tf-row-actions">
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setMoveDialogNodeId(node.id)}
              title="다른 폴더로 이동"
              aria-label={`"${node.name}" 다른 폴더로 이동`}
            >
              📁
            </button>
          </span>
        )}
      </>
    );
  }

  function renderTileBody(node: TubeNode, isTrash: boolean, isFolder: boolean, store: TubeStoreData): ReactNode {
    return (
      <>
        <div className="tf-tile-media">
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
        </div>

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
            onClick={() => (isFolder ? setCurrentFolderId(node.id) : handleVideoClick(node))}
            title={isFolder ? '열기' : isVideo(node) && node.videoId ? '재생' : '재생할 수 없는 영상(videoId 없음)'}
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
              onClick={() => setMoveDialogNodeId(node.id)}
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
        {!isFolder && (
          <span className="tf-tile-actions">
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setMoveDialogNodeId(node.id)}
              title="다른 폴더로 이동"
              aria-label={`"${node.name}" 다른 폴더로 이동`}
            >
              📁
            </button>
          </span>
        )}
      </>
    );
  }

  function tableCells(
    node: TubeNode,
    isTrash: boolean,
    isFolder: boolean,
    store: TubeStoreData
  ): { name: ReactNode; date: ReactNode; type: ReactNode; size: ReactNode; actions: ReactNode } {
    const name =
      isFolder && editingId === node.id ? (
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
          onClick={() => (isFolder ? setCurrentFolderId(node.id) : handleVideoClick(node))}
          title={isFolder ? '열기' : isVideo(node) && node.videoId ? '재생' : '재생할 수 없는 영상(videoId 없음)'}
        >
          {isFolder ? folderIcon(node, store) : '🎬'} {node.name}
        </button>
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
              onClick={() => setMoveDialogNodeId(node.id)}
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
        {!isFolder && (
          <span className="tf-row-actions">
            <button
              className="tf-btn tf-btn-icon"
              onClick={() => setMoveDialogNodeId(node.id)}
              title="다른 폴더로 이동"
              aria-label={`"${node.name}" 다른 폴더로 이동`}
            >
              📁
            </button>
          </span>
        )}
      </>
    );

    return {
      name,
      date: formatModifiedAt(node.modifiedAt),
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
          <SyncControl onLocalDataChanged={refreshKeepingFolder} />
          <AppInfo />
        </div>
        <p className="tf-subtitle">
          목록·아이콘 그리드(아주 큰/큰/보통/작은)·표(자세히) 보기, 이름·날짜·유형·크기 정렬(오름·내림차순)을
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
              onClick={() => setCurrentFolderId(node.id)}
            >
              {folderIcon(node, store)} {node.name}
            </button>
          </span>
        ))}
      </nav>

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
            disabled={importing}
          />
          <button className="tf-btn" onClick={handleImportPlaylist} disabled={importing || !playlistUrl.trim()}>
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

      {currentFolder.id !== store.trashId && children.length > 0 && (
        <div className="tf-sort-control">
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
            <option value="date">날짜순</option>
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
        </div>
      )}

      {useVirtual ? (
        <div className="tf-scroll-area" ref={scrollParentRef}>
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
                        <div key={node.id} className="tf-tile">
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
                    { key: 'date', label: '수정한 날짜' },
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
                    >
                      <div className="tf-vtable-cell tf-trow-handle-cell" />
                      <div className="tf-vtable-cell tf-tcell-name">{c.name}</div>
                      <div className="tf-vtable-cell tf-tcell-date">{c.date}</div>
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
                  >
                    {renderRowBody(node, isTrash, isFolder, store)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <DndContext
          sensors={dragSensors}
          collisionDetection={closestCenter}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setOverId(null);
            setOverPosition(null);
          }}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {isGrid ? (
              <div className={`tf-grid tf-grid-${store.settings.view}`}>
                {children.length === 0 && <p className="tf-empty">비어 있습니다.</p>}
                {children.map((node) => {
                  const isTrash = node.id === store.trashId;
                  const isFolder = node.type === 'folder';
                  const tileBody = renderTileBody(node, isTrash, isFolder, store);

                  if (isTrash) {
                    return (
                      <div key={node.id} className="tf-tile">
                        {tileBody}
                      </div>
                    );
                  }

                  return (
                    <SortableGridItem
                      key={node.id}
                      id={node.id}
                      disabled={!isManualSort}
                      isOver={overId === node.id}
                      overPosition={overId === node.id ? overPosition : null}
                      dragHandleLabel={`"${node.name}" 드래그로 순서 변경`}
                    >
                      {tileBody}
                    </SortableGridItem>
                  );
                })}
              </div>
            ) : isTable ? (
              <table className="tf-table">
                <thead>
                  <tr>
                    <th className="tf-trow-handle-cell" aria-hidden="true" />
                    {(
                      [
                        { key: 'name', label: '이름' },
                        { key: 'date', label: '수정한 날짜' },
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
                      <td className="tf-empty" colSpan={6}>
                        비어 있습니다.
                      </td>
                    </tr>
                  )}
                  {children.map((node) => {
                    const isTrash = node.id === store.trashId;
                    const isFolder = node.type === 'folder';
                    const c = tableCells(node, isTrash, isFolder, store);
                    const cells = (
                      <>
                        <td className="tf-tcell-name">{c.name}</td>
                        <td className="tf-tcell-date">{c.date}</td>
                        <td className="tf-tcell-type">{c.type}</td>
                        <td className="tf-tcell-size">{c.size}</td>
                        <td className="tf-tcell-actions">{c.actions}</td>
                      </>
                    );

                    if (isTrash) {
                      return (
                        <tr key={node.id} className="tf-trow">
                          <td className="tf-trow-handle-cell" />
                          {cells}
                        </tr>
                      );
                    }

                    return (
                      <SortableTableRow
                        key={node.id}
                        id={node.id}
                        disabled={!isManualSort}
                        isOver={overId === node.id}
                        overPosition={overId === node.id ? overPosition : null}
                        dragHandleLabel={`"${node.name}" 드래그로 순서 변경`}
                      >
                        {cells}
                      </SortableTableRow>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <ul className="tf-list">
                {children.length === 0 && <li className="tf-empty">비어 있습니다.</li>}
                {children.map((node) => {
                  const isTrash = node.id === store.trashId;
                  const isFolder = node.type === 'folder';
                  const rowBody = renderRowBody(node, isTrash, isFolder, store);

                  if (isTrash) {
                    return (
                      <li key={node.id} className="tf-row">
                        {rowBody}
                      </li>
                    );
                  }

                  return (
                    <SortableRow
                      key={node.id}
                      id={node.id}
                      disabled={!isManualSort}
                      isOver={overId === node.id}
                      overPosition={overId === node.id ? overPosition : null}
                      dragHandleLabel={`"${node.name}" 드래그로 순서 변경`}
                    >
                      {rowBody}
                    </SortableRow>
                  );
                })}
              </ul>
            )}
          </SortableContext>
        </DndContext>
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
              "{store.nodes[trashInfoModalFolderId]?.name}" 폴더를 휴지통으로 옮깁니다. 휴지통에 있는 항목은 설정된 보관
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

      {moveDialogNodeId && store && store.nodes[moveDialogNodeId] && (
        <MoveDialog
          store={store}
          node={store.nodes[moveDialogNodeId]}
          onPick={handleConfirmMove}
          onCancel={() => setMoveDialogNodeId(null)}
        />
      )}

      {toast && (
        <Toast
          key={toast.ts}
          label={toast.label}
          actionLabel={toast.kind === 'undo' ? '실행취소' : '다시 실행'}
          onAction={toast.kind === 'undo' ? performUndo : performRedo}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
