// 사이드바 폴더 트리 — ROADMAP 4단계 작업순서 6/8. 탐색기 왼쪽의 상시 표시 폴더 트리처럼, 전체
// 폴더 구조를 한눈에 보고 클릭 한 번으로 어디든 이동할 수 있게 한다(지금까지는 폴더 안으로
// 들어가는 진입형 네비게이션 + 상단 주소줄로 되돌아오는 방식 하나뿐이었음).
//
// 두 UI 동기화: 사이드바가 가리키는 "선택된 폴더"는 항상 App.tsx의 currentFolderId와 같아야 한다.
// 사이드바 클릭 시엔 onNavigate(id)로 App.tsx의 navigateToFolder를 그대로 호출해 단일 진실
// 공급원(currentFolderId)을 유지하고, 반대 방향(주소줄·타일 클릭 등 다른 경로로 이동했을 때)은
// 아래 useEffect가 currentFolderId의 조상 경로를 자동으로 펼쳐서 사이드바가 항상 현재 위치를
// 보여주도록 한다.
//
// 드래그 확장: "폴더 위로 드래그해 바로 이동"(작업순서 5/8)이 만든 handleDragMove/handleDragEnd의
// into 판정 로직은 store.nodes에서 대상 id로 조회하는 방식이라 이미 어떤 폴더 id든 범용으로
// 동작한다 — 사이드바 행도 useDroppable(id)만 걸면 그대로 드롭 대상이 된다(App.tsx의 DndContext
// 안에서 렌더링되는 한). App.tsx의 handleDragMove에는 "대상이 지금 열려 있는 폴더의 형제가 아니면
// 무조건 into로 판정"하는 분기를 추가해뒀다(순서변경 삽입선 계산은 사이드바 행에는 의미가 없음).
//
// 휴지통은 항상 최상위 폴더 바로 아래 고정(요구사항 5) — 일반 폴더처럼 이름순 정렬 목록에 섞이지
// 않도록 folderChildren()에서 제외하고, 루트 행이 자기 자식을 그릴 때 정렬된 목록 맨 끝에 별도로
// 붙인다(폴더가 하나도 없어도 휴지통은 항상 있으므로 루트는 항상 펼치기 화살표를 가진다).
//
// 폭이 좁은 화면(휴대폰 PWA)에서는 CSS(@media)로 아예 숨긴다 — 이 앱은 지금까지 최대 720px 단일
// 컬럼으로 폰·PC 양쪽에 동일하게 대응해왔는데, 사이드바까지 그 안에 욱여넣으면 폰 화면에서 너무
// 좁아진다. 폭이 넉넉한 데스크톱(확장 매니저 탭)에서만 보여주고, 좁은 화면은 기존 주소줄 방식
// 그대로 유지한다(2026-09-04, 산들이 직접 확인한 결정은 아님 — 문제 있으면 알려달라고 안내함).

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { FolderNode, TubeNode, TubeStoreData } from '../storage/types';
import { DEFAULT_FOLDER_ICON } from '../shared/folderIcons';

// App.tsx의 SIDEBAR_DROP_PREFIX와 반드시 같은 문자열이어야 한다(그쪽 realDropTargetId()가 이 접두어를
// 벗겨서 실제 노드 id로 되돌림) — export/import로 공유하는 대신 문자열 리터럴을 그대로 복사해 뒀다
// (이 파일 하나짜리 상수 때문에 App.tsx쪽 상수를 export하도록 바꾸는 게 더 번거로움).
const SIDEBAR_ID_PREFIX = 'sidebar:';

interface Props {
  store: TubeStoreData;
  currentFolderId: string | null;
  onNavigate: (id: string) => void;
  /**
   * (2026-09-09, "사이드바 빈 공간에서 우클릭하면 새 폴더를 만들 수 있게 해달라" 요청) App.tsx의
   * document 레벨 배경 우클릭 폴백 리스너가 "지금 우클릭한 지점이 사이드바 칸(왼쪽 컬럼) 안인지"를
   * 판단하는 데 쓰는 ref. FolderSidebar가 직접 컨텍스트 메뉴를 그리지는 않는다 — 실제 메뉴는
   * App.tsx가 공용 .tf-context-menu로 그리고, 대상 폴더만 rootId로 넘긴다(사이드바 트리는 항상
   * 루트부터 시작하므로 "빈 공간"에 대응하는 폴더는 루트뿐).
   */
  navRef?: RefObject<HTMLElement>;
}

// App.tsx의 동명 함수와 완전히 같은 로직 — 4줄짜리 순수 함수 하나 때문에 App.tsx에서 export하도록
// 리팩터링하는 것보다 이쪽에 복사해 두는 게 더 안전하다(backupOps.ts의 childrenOfLocal 등과 같은
// 이유로 이 코드베이스에서 이미 여러 번 쓴 패턴).
function sidebarFolderIcon(node: TubeNode, store: TubeStoreData): string {
  if (node.id === store.rootId) return '🏠';
  if (node.id === store.trashId) return '🗑️';
  return (node.type === 'folder' && node.icon) || DEFAULT_FOLDER_ICON;
}

// App.tsx의 folderContentCounts와 완전히 같은 로직 — 위 sidebarFolderIcon과 같은 이유로
// 이 파일에 그대로 복사해 둔다(마우스를 올렸을 때 "폴더 몇 개·영상 몇 개"를 보여주는 용도,
// 2026-09-08 신설, 산들 요청). 직계 자식만 센다(재귀 집계 안 함 — App.tsx 쪽 주석 참고).
function folderContentCountsLabel(store: TubeStoreData, folderId: string): string {
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
  return `폴더 ${folders}개 · 영상 ${videos}개`;
}

function folderChildren(store: TubeStoreData, parentId: string): FolderNode[] {
  const result: FolderNode[] = [];
  for (const k in store.nodes) {
    const n = store.nodes[k];
    if (n.parentId === parentId && n.type === 'folder' && n.id !== store.trashId) {
      result.push(n as FolderNode);
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return result;
}

function ancestorChain(store: TubeStoreData, id: string | null): string[] {
  const chain: string[] = [];
  let cur = id ? store.nodes[id] : undefined;
  while (cur && cur.parentId) {
    chain.push(cur.parentId);
    cur = store.nodes[cur.parentId];
  }
  return chain;
}

// 모듈 최상위에 둬야 함 — App 안에 두면(또는 FolderSidebar 함수 내부에 두면) 렌더마다 새 함수로
// 취급돼 리렌더될 때마다 리마운트된다(SortableRow 등 이 코드베이스의 기존 규칙과 동일한 이유).
function SidebarRow({
  node,
  store,
  depth,
  currentFolderId,
  expanded,
  onToggle,
  onNavigate
}: {
  node: FolderNode;
  store: TubeStoreData;
  depth: number;
  currentFolderId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: SIDEBAR_ID_PREFIX + node.id });
  const isRoot = node.id === store.rootId;
  const isTrash = node.id === store.trashId;
  // 사이드바 안에서 직접 집어 끌기(2026-09-04 신규, 산들 실기기 재확인 — "사이드바 흰 박스 안에서
  // 드래그가 안 된다"): 지금까지 사이드바 행은 드롭 "받는" 대상(useDroppable)만 될 수 있었고, 집어서
  // "끄는" 시작점은 될 수 없었다(본문 타일→사이드바 행 이동만 가능, 사이드바 행끼리는 불가능). id는
  // 위 useDroppable과 동일하게 SIDEBAR_ID_PREFIX를 붙여, 지금 열려 있는 폴더가 사이드바에도 펼쳐져
  // 본문·사이드바 양쪽에 동시에 그려지는 경우에도 본문 타일의 드래그 등록과 충돌하지 않게 한다
  // (handleDragStart/Move/End 쪽에서 realDropTargetId()로 접두어를 떼어내 실제 노드 id로 조회한다 —
  // App.tsx 수정 참고). 루트(최상위 폴더)와 휴지통은 위치가 고정이라 드래그 시작 자체를 막는다.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging
  } = useDraggable({ id: SIDEBAR_ID_PREFIX + node.id, disabled: isRoot || isTrash });
  const setNodeRef = (el: HTMLDivElement | null) => {
    setDropRef(el);
    setDragRef(el);
  };
  const kids = folderChildren(store, node.id);
  const trashChild = isRoot ? (store.nodes[store.trashId] as FolderNode | undefined) : undefined;
  const hasChildren = kids.length > 0 || !!trashChild;
  const isOpen = expanded.has(node.id);
  const isActive = node.id === currentFolderId;

  return (
    <>
      <div
        ref={setNodeRef}
        className={'tf-sidebar-row' + (isActive ? ' tf-sidebar-row-active' : '') + (isOver ? ' tf-row-drop-into' : '')}
        style={{
          paddingLeft: 8 + depth * 16,
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0.4 : 1
        }}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className={'tf-sidebar-toggle' + (isOpen ? ' tf-sidebar-toggle-open' : '')}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            aria-label={isOpen ? `"${node.name}" 접기` : `"${node.name}" 펼치기`}
          >
            ▶
          </button>
        ) : (
          <span className="tf-sidebar-toggle-spacer" aria-hidden="true" />
        )}
        {/* 아이콘+이름을 하나의 버튼으로 묶어 클릭(열기)과 드래그(이동) 양쪽을 모두 받는다 — 본문
            그리드 보기의 .tf-tile-media-btn과 완전히 같은 이유·같은 방식(distance:4 활성화 제약이
            "가만히 클릭하면 열리고, 누른 채 끌면 이동한다"를 자동으로 구분해준다, App.tsx 참고). */}
        <button
          type="button"
          className="tf-sidebar-label"
          onClick={() => onNavigate(node.id)}
          aria-label={`"${node.name}" 열기`}
          title={isTrash ? undefined : `열기 · ${folderContentCountsLabel(store, node.id)}`}
          {...attributes}
          {...listeners}
        >
          <span className="tf-sidebar-icon" aria-hidden="true">
            {sidebarFolderIcon(node, store)}
          </span>
          <span className="tf-sidebar-name">{node.name}</span>
        </button>
      </div>
      {isOpen && (
        <>
          {kids.map((kid) => (
            <SidebarRow
              key={kid.id}
              node={kid}
              store={store}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
          {trashChild && (
            <SidebarRow
              key={trashChild.id}
              node={trashChild}
              store={store}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          )}
        </>
      )}
    </>
  );
}

export default function FolderSidebar({ store, currentFolderId, onNavigate, navRef }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([store.rootId]));

  // 두 UI 동기화 — currentFolderId가 (사이드바 클릭이 아닌 다른 경로로도) 바뀔 때마다 그 조상
  // 경로를 전부 펼쳐서, 사이드바가 접혀 있어서 지금 위치가 안 보이는 상황을 방지한다.
  useEffect(() => {
    if (!currentFolderId) return;
    const chain = ancestorChain(store, currentFolderId);
    if (chain.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of chain) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  function handleToggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const root = store.nodes[store.rootId] as FolderNode | undefined;
  if (!root) return null;

  return (
    <nav ref={navRef} className="tf-sidebar" aria-label="폴더 트리" role="tree">
      <SidebarRow
        node={root}
        store={store}
        depth={0}
        currentFolderId={currentFolderId}
        expanded={expanded}
        onToggle={handleToggle}
        onNavigate={onNavigate}
      />
    </nav>
  );
}
