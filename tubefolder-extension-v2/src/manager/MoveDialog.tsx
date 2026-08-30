import type { FolderNode, TubeNode, TubeStoreData } from '../storage/types';
import { folderChildren } from '../storage/folderOps';
import { DEFAULT_FOLDER_ICON } from '../shared/folderIcons';

// "다른 폴더로 이동" 대상 선택 모달 — 기존 아이콘 선택 모달(App.tsx의 iconPickerFolderId)과
// 같은 .tf-sync-overlay/.tf-sync-panel 모달 틀을 그대로 재사용한다. 폴더 개수가 많지 않은
// 앱이라 접기/펼치기 트리 대신 들여쓰기 있는 평면 목록으로 충분하다는 판단.
// (2026-08-29 신규 — moveNode()와 짝을 이루는 UI)

interface MoveDialogProps {
  store: TubeStoreData;
  node: TubeNode;
  onPick: (destFolderId: string) => void;
  onCancel: () => void;
}

interface TreeRow {
  folder: FolderNode;
  depth: number;
  disabled: boolean;
}

// moveNode()의 검증 로직과 기준을 맞춘 "이동 불가" 폴더 집합: 현재 부모(=no-op)와,
// 대상이 폴더인 경우 자기 자신+모든 하위 폴더(사이클 방지). 휴지통은 애초에 folderChildren()이
// 걸러주므로 목록에 나오지 않는다.
function buildInvalidSet(store: TubeStoreData, node: TubeNode): Set<string> {
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

export default function MoveDialog({ store, node, onPick, onCancel }: MoveDialogProps) {
  const invalid = buildInvalidSet(store, node);
  const rows = buildRows(store, invalid);

  return (
    <div className="tf-sync-overlay" onClick={onCancel}>
      <div
        className="tf-sync-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tf-movedialog-title"
      >
        <h2 id="tf-movedialog-title">📁 다른 폴더로 이동</h2>
        <p className="tf-sync-desc">"{node.name}" 항목을 옮길 폴더를 선택하세요.</p>
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
