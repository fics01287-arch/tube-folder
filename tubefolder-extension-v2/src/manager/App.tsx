import { useCallback, useEffect, useMemo, useState } from 'react';
import { load } from '../storage/storage';
import { createFolder, renameFolder, trashFolder } from '../storage/folderOps';
import type { TubeNode, TubeStoreData } from '../storage/types';

// 매니저 페이지 최소 스캐폴딩.
// 목록형·방사형·개요보기 같은 본격 뷰(그리드/가상 스크롤/드래그앤드롭)는 5단계 별도 작업.
// 여기서는 v1처럼 "한 번에 한 폴더의 자식만 렌더링"하는 탐색기형 이동 골격만 최소로 증명하고,
// 우클릭 미니 팝업과 동일한 storage 계층(createFolder/renameFolder/trashFolder)이
// 매니저 컨텍스트에서도 똑같이 동작함을 확인할 수 있게 한다.

function sortNodes(nodes: TubeNode[]): TubeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko', { numeric: true });
  });
}

export default function App() {
  const [store, setStore] = useState<TubeStoreData | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('새 폴더');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (keepFolderId?: string | null) => {
    const data = await load();
    setStore(data);
    const wanted = keepFolderId ?? data.rootId;
    setCurrentFolderId(data.nodes[wanted] ? wanted : data.rootId);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentFolder = store && currentFolderId ? store.nodes[currentFolderId] : null;

  const children = useMemo(() => {
    if (!store || !currentFolderId) return [];
    const list: TubeNode[] = [];
    for (const id in store.nodes) {
      const n = store.nodes[id];
      if (n.parentId === currentFolderId && n.id !== store.trashId) list.push(n);
    }
    const sorted = sortNodes(list);
    // 휴지통은 루트에서만, 항상 맨 마지막 고정(DATA-MODEL.md 불변식 I3)
    if (currentFolderId === store.rootId) sorted.push(store.nodes[store.trashId]);
    return sorted;
  }, [store, currentFolderId]);

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
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function commitRename(id: string) {
    setError(null);
    try {
      await renameFolder(id, editingValue);
      setEditingId(null);
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmDelete(id: string) {
    setError(null);
    try {
      await trashFolder(id);
      setDeletingId(null);
      await refresh(currentFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!store || !currentFolder) {
    return (
      <div className="tf-app">
        <p>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="tf-app">
      <header className="tf-header">
        <h1>튜브폴더</h1>
        <p className="tf-subtitle">
          이 화면은 초기 스캐폴딩용 최소 목록입니다. 그리드·가상 스크롤 등 정식 뷰는 5단계에서 구현됩니다.
        </p>
      </header>

      <nav className="tf-breadcrumb">
        {breadcrumb.map((node, i) => (
          <span key={node.id}>
            {i > 0 && <span className="tf-breadcrumb-sep"> / </span>}
            <button
              className="tf-breadcrumb-btn"
              disabled={node.id === currentFolderId}
              onClick={() => setCurrentFolderId(node.id)}
            >
              {node.id === store.rootId ? '🏠' : node.id === store.trashId ? '🗑️' : '📁'} {node.name}
            </button>
          </span>
        ))}
      </nav>

      {currentFolder.id !== store.trashId ? (
        <div className="tf-new-folder">
          <input
            className="tf-input"
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

      {error && <div className="tf-error-banner">{error}</div>}

      <ul className="tf-list">
        {children.length === 0 && <li className="tf-empty">비어 있습니다.</li>}
        {children.map((node) => {
          const isTrash = node.id === store.trashId;
          const isFolder = node.type === 'folder';
          return (
            <li key={node.id} className="tf-row">
              {isFolder ? (
                editingId === node.id ? (
                  <span className="tf-edit-row">
                    <input
                      className="tf-input tf-input-inline"
                      value={editingValue}
                      autoFocus
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(node.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button className="tf-btn tf-btn-icon" onClick={() => commitRename(node.id)} title="저장">
                      ✔
                    </button>
                    <button className="tf-btn tf-btn-icon" onClick={() => setEditingId(null)} title="취소">
                      ✕
                    </button>
                  </span>
                ) : (
                  <button className="tf-row-name" onClick={() => setCurrentFolderId(node.id)} title="열기">
                    {isTrash ? '🗑️' : '📁'} {node.name}
                  </button>
                )
              ) : (
                <span className="tf-row-name tf-row-name-video">🎬 {node.name}</span>
              )}

              {isFolder && !isTrash && editingId !== node.id && deletingId === node.id && (
                <span className="tf-row-actions tf-confirm-row">
                  <span className="tf-confirm-text">휴지통으로 이동할까요?</span>
                  <button className="tf-btn tf-btn-danger-outline" onClick={() => confirmDelete(node.id)}>
                    삭제
                  </button>
                  <button className="tf-btn tf-btn-icon" onClick={() => setDeletingId(null)}>
                    취소
                  </button>
                </span>
              )}

              {isFolder && !isTrash && editingId !== node.id && deletingId !== node.id && (
                <span className="tf-row-actions">
                  <button
                    className="tf-btn tf-btn-icon"
                    onClick={() => {
                      setEditingId(node.id);
                      setEditingValue(node.name);
                    }}
                    title="이름 변경"
                  >
                    ✏️
                  </button>
                  <button className="tf-btn tf-btn-danger-outline" onClick={() => setDeletingId(node.id)} title="휴지통으로 이동">
                    🗑
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
