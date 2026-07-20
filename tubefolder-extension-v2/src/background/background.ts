// background.ts — MV3 서비스워커.
// tubefolder-extension-v1/background.js 이식 + 폴더 관리(새로 만들기·이름변경·삭제)를
// 매니저 탭 전환 없이 처리하기 위해, 해당 메뉴 클릭 시 현재 탭의 content script에
// "미니 팝업을 띄워라" 메시지만 보낸다(실제 storage 반영은 content script가 직접 수행).
//
// I9(ARCHITECTURE.md 불변식): 이벤트 리스너는 반드시 스크립트 최상위에서 동기 등록해야
// 한다(비동기 등록 시 SW 종료로 이벤트 유실) — 아래 리스너들은 모두 최상위에 있다.

import { addVideoToFolder, extractVideoId, fetchMeta, load, STORAGE_KEY } from '../storage/storage';
import { folderChildren } from '../storage/folderOps';
import type { TubeStoreData } from '../storage/types';
import type { ContentToBackgroundMessage } from '../shared/messages';
import { YOUTUBE_DOCUMENT_PATTERNS } from '../shared/hostPatterns';

const MANAGER = 'index.html';
const CONTEXTS: chrome.contextMenus.ContextType[] = ['page', 'link'];

function noop(): void {
  if (chrome.runtime.lastError) {
    // 메뉴 재구성 중 경합으로 발생하는 흔한 오류(이미 없는 id 제거 등) — 조용히 무시(v1과 동일)
  }
}

function createMenu(props: chrome.contextMenus.CreateProperties): void {
  chrome.contextMenus.create({ contexts: CONTEXTS, documentUrlPatterns: YOUTUBE_DOCUMENT_PATTERNS, ...props }, noop);
}

// ── 전체 메뉴 재구성 ──────────────────────────────────────────────
async function rebuildFolderMenus(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.contextMenus.removeAll(async () => {
      let store: TubeStoreData;
      try {
        store = await load();
      } catch {
        store = await load(); // load()는 실패해도 emptyStore 기반 migrate 결과를 반환하므로 재호출로 충분
      }

      // ① 동영상 추가
      createMenu({ id: 'tf-root', title: '📁 튜브폴더에 추가' });
      buildAddVideoSubMenus(store, store.rootId, 'tf-root', 0);

      // ② 폴더 관리
      createMenu({ id: 'tf-manage-sep', type: 'separator' });
      createMenu({ id: 'tf-manage', title: '🗂️ 폴더 관리' });

      createMenu({ id: 'tf-new-folder', parentId: 'tf-manage', title: '📁 새 폴더 만들기...' });
      createMenu({ id: 'tf-manage-sep2', parentId: 'tf-manage', type: 'separator' });

      createMenu({ id: 'tf-rename-folder', parentId: 'tf-manage', title: '✏️ 폴더 이름 바꾸기' });
      buildManageSubMenus('rename', store, store.rootId, 'tf-rename-folder');

      createMenu({ id: 'tf-delete-folder', parentId: 'tf-manage', title: '🗑️ 폴더 삭제' });
      buildManageSubMenus('delete', store, store.rootId, 'tf-delete-folder');

      createMenu({ id: 'tf-manage-sep3', parentId: 'tf-manage', type: 'separator' });
      createMenu({ id: 'tf-open-manager', parentId: 'tf-manage', title: '🖥️ 튜브폴더 열기' });

      resolve();
    });
  });
}

// ── 동영상 추가용 폴더 서브메뉴 (재귀) ───────────────────────────
function buildAddVideoSubMenus(store: TubeStoreData, parentFolderId: string, parentMenuId: string, depth: number): void {
  const children = folderChildren(store, parentFolderId);

  if (depth === 0) {
    createMenu({ id: 'folder_' + parentFolderId, parentId: parentMenuId, title: '📁 여기에 추가 (최상위)' });
    if (children.length > 0) {
      createMenu({ id: 'tf-sep-root', parentId: parentMenuId, type: 'separator' });
    }
  }

  children.forEach((folder) => {
    const hasSubFolders = folderChildren(store, folder.id).length > 0;
    const menuId = 'folder_' + folder.id;

    createMenu({ id: menuId, parentId: parentMenuId, title: '📁 ' + folder.name });

    if (hasSubFolders) {
      createMenu({ id: menuId + '_self', parentId: menuId, title: '📁 여기에 추가 (' + folder.name + ')' });
      createMenu({ id: 'tf-sep-' + folder.id, parentId: menuId, type: 'separator' });
      buildAddVideoSubMenus(store, folder.id, menuId, depth + 1);
    }
  });
}

// ── 이름변경/삭제용 폴더 목록 서브메뉴 (재귀, 공용) ───────────────
function buildManageSubMenus(kind: 'rename' | 'delete', store: TubeStoreData, parentFolderId: string, parentMenuId: string): void {
  const children = folderChildren(store, parentFolderId);
  const icon = kind === 'rename' ? '✏️' : '🗑️';
  const verb = kind === 'rename' ? '이름 바꾸기' : '삭제';
  const idPrefix = kind === 'rename' ? 'rename_' : 'delete_';

  children.forEach((folder) => {
    const hasSubFolders = folderChildren(store, folder.id).length > 0;
    const menuId = idPrefix + folder.id;

    if (hasSubFolders) {
      createMenu({ id: menuId, parentId: parentMenuId, title: '📁 ' + folder.name });
      createMenu({ id: menuId + '_self', parentId: menuId, title: `${icon} "${folder.name}" ${verb}` });
      createMenu({ id: idPrefix + 'sep-' + folder.id, parentId: menuId, type: 'separator' });
      buildManageSubMenus(kind, store, folder.id, menuId);
    } else {
      createMenu({ id: menuId, parentId: parentMenuId, title: `${icon} "${folder.name}" ${verb}` });
    }
  });
}

// ── 이벤트 리스너 (최상위 동기 등록) ──────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  rebuildFolderMenus();
});
chrome.runtime.onStartup.addListener(() => {
  rebuildFolderMenus();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) rebuildFolderMenus();
});

chrome.action.onClicked.addListener(async () => {
  await openManager();
});

chrome.runtime.onMessage.addListener((message: ContentToBackgroundMessage) => {
  if (message && message.type === 'TF_FLASH_BADGE') {
    flashBadge(message.text, message.color);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const itemId = String(info.menuItemId);

  if (itemId === 'tf-open-manager') {
    await openManager();
    return;
  }

  if (itemId === 'tf-new-folder') {
    const store = await load();
    sendPromptToTab(tab, { type: 'TF_SHOW_FOLDER_PROMPT', mode: 'new-folder', parentId: store.rootId });
    return;
  }

  if (itemId.indexOf('rename_') === 0) {
    const folderId = itemId.replace(/^rename_/, '').replace(/_self$/, '');
    const store = await load();
    const folder = store.nodes[folderId];
    if (!folder) return;
    sendPromptToTab(tab, { type: 'TF_SHOW_FOLDER_PROMPT', mode: 'rename-folder', folderId, folderName: folder.name });
    return;
  }

  if (itemId.indexOf('delete_') === 0) {
    const folderId = itemId.replace(/^delete_/, '').replace(/_self$/, '');
    const store = await load();
    const folder = store.nodes[folderId];
    if (!folder) return;
    sendPromptToTab(tab, { type: 'TF_SHOW_FOLDER_PROMPT', mode: 'delete-folder', folderId, folderName: folder.name });
    return;
  }

  if (itemId.indexOf('folder_') === 0) {
    const folderId = itemId.replace(/^folder_/, '').replace(/_self$/, '');
    const url = info.linkUrl || info.pageUrl || (tab && tab.url) || '';
    const vid = extractVideoId(url);
    if (!vid) {
      flashBadge('!', '#cc0000');
      return;
    }

    let title = '';
    if (info.linkUrl) {
      title = url;
    } else {
      title = (tab && tab.title) || url;
      title = title.replace(/\s*[-|]\s*YouTube.*$/i, '').trim() || url;
    }

    try {
      const meta = await fetchMeta(url).catch(() => null);
      if (meta && meta.title) title = meta.title;

      await addVideoToFolder({
        url,
        title,
        videoId: vid,
        kind: url.indexOf('music.youtube') >= 0 ? 'music' : 'video',
        channel: meta?.channel || '',
        folderId
      });
      flashBadge('+1', '#22a722');
    } catch (e) {
      console.error('[튜브폴더] 추가 실패:', e);
      flashBadge('!', '#cc0000');
    }
  }
});

function sendPromptToTab(tab: chrome.tabs.Tab | undefined, message: import('../shared/messages').ShowFolderPromptMessage): void {
  if (!tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, message, () => {
    if (chrome.runtime.lastError) {
      // content script가 아직 주입되지 않은 탭(방금 열린 탭 등) — 배지로 실패를 알린다
      flashBadge('!', '#cc0000');
    }
  });
}

// ── 매니저 탭 열기 ────────────────────────────────────────────────
async function openManager(): Promise<number | undefined> {
  const url = chrome.runtime.getURL(MANAGER);
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url && t.url.indexOf(url) === 0);
    if (existing && existing.id != null) {
      chrome.tabs.update(existing.id, { active: true });
      return existing.id;
    }
    const created = await chrome.tabs.create({ url });
    return created.id;
  } catch {
    const created = await chrome.tabs.create({ url });
    return created.id;
  }
}

function flashBadge(text: string, color: string): void {
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  } catch {
    // 배지 API 실패는 사용자 체감에 영향 없어 무시
  }
}

// SW 초기화 시 즉시 메뉴 구성
rebuildFolderMenus();
