import type { FolderNode, TubeNode, TubeStoreData } from '../storage/types';
import { folderChildren } from '../storage/folderOps';
import { DEFAULT_FOLDER_ICON } from '../shared/folderIcons';

// "다른 폴더로 이동" 대상 선택 모달 — 기존 아이콘 선택 모달(App.tsx의 iconPickerFolderId)과
// 같은 .tf-sync-overlay/.tf-sync-panel 모달 틀을 그대로 재사용한다. 폴더 개수가 많지 않은
// 앱이라 접기/펼치기 트리 대신 들여쓰기 있는 평면 목록으로 충분하다는 판단.
// (2026-08-29 신규 — moveNode()와 짝을 이루는 UI)

interface MoveDialogProps {
  store: TubeStoreData;
  /**
   * 옮길 노드들 — 단일 이동(📁 버튼)이든 다중 선택 후 일괄 이동이든 배열 하나로 통일해서 받는다.
   * 빈 배열이면(2026-09-09, 재생목록 가져오기의 "다른 폴더에 넣기" 목적지 선택용으로 재사용
   * — 옮길 기존 항목이 없어 "자기 자신·하위 폴더로는 못 감" 같은 제약이 필요 없는 경우) 아무
   * 폴더도 비활성화하지 않는다 — title/description을 함께 넘겨 문구도 그 용도에 맞게 바꿀 것.
   */
  nodes: TubeNode[];
  onPick: (destFolderId: string) => void;
  onCancel: () => void;
  /** 기본값 "📁 다른 폴더로 이동" — 이동이 아닌 다른 용도로 재사용할 때 덮어쓴다. */
  title?: string;
  /** 기본값은 nodes 개수 기준 이동 안내문 — 이동이 아닌 다른 용도로 재사용할 때 덮어쓴다. */
  description?: string;
}

interface TreeRow {
  folder: FolderNode;
  depth: number;
  disabled: boolean;
}

// moveNode()의 검증 로직과 기준을 맞춘 "이동 불가" 폴더 집합. 단일 노드 기준 무효 집합을
// buildInvalidSetForNode로 구하고, 다중 선택이면 그 합집합을 쓴다(어느 하나라도 옮길 수 없는
// 대상이면 그 폴더는 전체 목록에서 비활성화 — 일부만 성공하는 혼란스러운 상태를 피하기 위함).
// 선택된 항목들은 항상 같은 부모 아래(현재 보고 있는 폴더)에서만 고를 수 있으므로 "현재 부모"
// 무효 판정은 사실상 공통이고, "자기 자신+하위 폴더" 판정만 노드별로 달라진다.
function buildInvalidSetForNode(store: TubeStoreData, node: TubeNode): Set<string> {
  const invalid = new Set<string>();
  if (node.parentId) invalid.add(node.parentId);

  if (node.type === 'folder') {
    invalid.add(node.id);
    const descendants = new Set<string>([node.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const k in store.nodes) {
        const n = store.nodes[k];
        if (!descendants.has(n.id) && n.parentId && descendants.has(n.parentId)) {
          descendants.add(n.id);
          grew = true;
        }
      }
    }
    descendants.forEach((id) => invalid.add(id));
  }
  return invalid;
}

function buildInvalidSet(store: TubeStoreData, nodes: TubeNode[]): Set<string> {
  const invalid = new Set<string>();
  for (const node of nodes) {
    buildInvalidSetForNode(store, node).forEach((id) => invalid.add(id));
  }
  return invalid;
}

function buildRows(store: TubeStoreData, invalid: Set<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const root = store.nodes[store.rootId] as FolderNode;
  rows.push({ folder: root, depth: 0, disabled: invalid.has(root.id) });

  function walk(parentId: string, depth: number) {
    for (const folder of folderChildren(store, parentId)) {
      rows.push({ folder, depth, disabled: invalid.has(folder.id) });
      walk(folder.id, depth + 1);
    }
  }
  walk(store.rootId, 1);
  return rows;
}

export default function MoveDialog({ store, nodes, onPick, onCancel, title, description }: MoveDialogProps) {
  const invalid = buildInvalidSet(store, nodes);
  const rows = buildRows(store, invalid);
  const desc =
    description ??
    (nodes.length === 1
      ? `"${nodes[0]?.name ?? ''}" 항목을 옮길 폴더를 선택하세요.`
      : `선택한 ${nodes.length}개 항목을 옮길 폴더를 선택하세요.`);

  return (
    <div className="tf-sync-overlay" onClick={onCancel}>
      <div
        className="tf-sync-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tf-movedialog-title"
      >
        <h2 id="tf-movedialog-title">{title ?? '📁 다른 폴더로 이동'}</h2>
        <p className="tf-sync-desc">{desc}</p>
        <ul className="tf-move-tree">
          {rows.map((row) => (
            <li key={row.folder.id}>
              <button
                className="tf-move-tree-item"
                style={{ paddingLeft: row.depth * 16 + 8 }}
                disabled={row.disabled}
                title={row.disabled ? '이 폴더로는 이동할 수 없습니다' : `"${row.folder.name}"(으)로 이동`}
                onClick={() => onPick(row.folder.id)}
              >
                {row.folder.id === store.rootId ? '🏠' : row.folder.icon || DEFAULT_FOLDER_ICON} {row.folder.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="tf-sync-actions">
          <button className="tf-btn" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
