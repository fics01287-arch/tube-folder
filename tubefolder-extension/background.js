/* background.js v1.5 — MV3 서비스워커
 *  - 아이콘 클릭 → 매니저 탭 열기
 *  - 유튜브 우클릭 → 동영상 추가 + 폴더 관리 (새 폴더·이름변경·삭제)
 *  - storage 변경 시 폴더 메뉴 자동 갱신
 */
importScripts('storage.js');

var MANAGER = 'manager.html';
var YOUTUBE_PATTERNS = [
  '*://*.youtube.com/*',
  '*://youtu.be/*',
  '*://music.youtube.com/*'
];

// ── 전체 메뉴 재구성 ────────────────────────────────────────────
async function rebuildFolderMenus() {
  return new Promise(async function (resolve) {
    chrome.contextMenus.removeAll(async function () {
      if (chrome.runtime.lastError) {}

      var store = null;
      try { store = await TubeStore.load(); } catch (e) {}
      if (!store) store = TubeStore.emptyStore();

      // ── ① 동영상 추가 메뉴 ──────────────────────────────────
      chrome.contextMenus.create({
        id: 'tf-root',
        title: '📁 튜브폴더에 추가',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      buildFolderSubMenus(store, store.rootId, 'tf-root', 0);

      // ── ② 폴더 관리 메뉴 (구분선 + 관리 항목) ────────────────
      chrome.contextMenus.create({
        id: 'tf-manage-sep',
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 폴더 관리 진입점
      chrome.contextMenus.create({
        id: 'tf-manage',
        title: '🗂️ 폴더 관리',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 새 폴더 만들기
      chrome.contextMenus.create({
        id: 'tf-new-folder',
        parentId: 'tf-manage',
        title: '📁 새 폴더 만들기...',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 구분선
      chrome.contextMenus.create({
        id: 'tf-manage-sep2',
        parentId: 'tf-manage',
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 폴더 이름 바꾸기 (서브메뉴로 폴더 목록)
      chrome.contextMenus.create({
        id: 'tf-rename-folder',
        parentId: 'tf-manage',
        title: '✏️ 폴더 이름 바꾸기',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      buildRenameFolderSubMenus(store, store.rootId, 'tf-rename-folder');

      // 폴더 삭제 (서브메뉴로 폴더 목록)
      chrome.contextMenus.create({
        id: 'tf-delete-folder',
        parentId: 'tf-manage',
        title: '🗑️ 폴더 삭제',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      buildDeleteFolderSubMenus(store, store.rootId, 'tf-delete-folder');

      // 구분선
      chrome.contextMenus.create({
        id: 'tf-manage-sep3',
        parentId: 'tf-manage',
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 튜브폴더 열기
      chrome.contextMenus.create({
        id: 'tf-open-manager',
        parentId: 'tf-manage',
        title: '🖥️ 튜브폴더 열기',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      resolve();
    });
  });
}

// ── 동영상 추가용 폴더 서브메뉴 ─────────────────────────────────
function buildFolderSubMenus(store, parentFolderId, parentMenuId, depth) {
  var nodes = store.nodes;
  var trashId = store.trashId;

  var children = [];
  for (var k in nodes) {
    var n = nodes[k];
    if (n.type === 'folder' && n.parentId === parentFolderId && n.id !== trashId) {
      children.push(n);
    }
  }
  children.sort(function (a, b) {
    return a.name.localeCompare(b.name, 'ko', { numeric: true });
  });

  if (depth === 0) {
    chrome.contextMenus.create({
      id: 'folder_' + parentFolderId,
      parentId: parentMenuId,
      title: '📁 여기에 추가 (최상위)',
      contexts: ['page', 'link'],
      documentUrlPatterns: YOUTUBE_PATTERNS
    }, function () { if (chrome.runtime.lastError) {} });

    if (children.length > 0) {
      chrome.contextMenus.create({
        id: 'tf-sep-root',
        parentId: parentMenuId,
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });
    }
  }

  children.forEach(function (folder) {
    var hasSubFolders = false;
    for (var k in nodes) {
      if (nodes[k].type === 'folder' && nodes[k].parentId === folder.id && nodes[k].id !== trashId) {
        hasSubFolders = true; break;
      }
    }
    var menuId = 'folder_' + folder.id;

    if (hasSubFolders) {
      chrome.contextMenus.create({
        id: menuId, parentId: parentMenuId,
        title: '📁 ' + folder.name,
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      chrome.contextMenus.create({
        id: menuId + '_self', parentId: menuId,
        title: '📁 여기에 추가 (' + folder.name + ')',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      chrome.contextMenus.create({
        id: 'tf-sep-' + folder.id, parentId: menuId,
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      buildFolderSubMenus(store, folder.id, menuId, depth + 1);
    } else {
      chrome.contextMenus.create({
        id: menuId, parentId: parentMenuId,
        title: '📁 ' + folder.name,
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });
    }
  });
}

// ── 이름 바꾸기용 폴더 목록 서브메뉴 ────────────────────────────
function buildRenameFolderSubMenus(store, parentFolderId, parentMenuId) {
  var nodes = store.nodes;
  var trashId = store.trashId;
  var children = [];
  for (var k in nodes) {
    var n = nodes[k];
    if (n.type === 'folder' && n.parentId === parentFolderId && n.id !== trashId) {
      children.push(n);
    }
  }
  children.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko', { numeric: true }); });

  children.forEach(function (folder) {
    var menuId = 'rename_' + folder.id;
    var hasSubFolders = false;
    for (var k in nodes) {
      if (nodes[k].type === 'folder' && nodes[k].parentId === folder.id && nodes[k].id !== trashId) {
        hasSubFolders = true; break;
      }
    }

    if (hasSubFolders) {
      chrome.contextMenus.create({
        id: menuId, parentId: parentMenuId,
        title: '📁 ' + folder.name,
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 이 폴더 자신 이름 바꾸기
      chrome.contextMenus.create({
        id: menuId + '_self', parentId: menuId,
        title: '✏️ "' + folder.name + '" 이름 바꾸기',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      chrome.contextMenus.create({
        id: 'rename-sep-' + folder.id, parentId: menuId,
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      buildRenameFolderSubMenus(store, folder.id, menuId);
    } else {
      chrome.contextMenus.create({
        id: menuId, parentId: parentMenuId,
        title: '✏️ "' + folder.name + '" 이름 바꾸기',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });
    }
  });
}

// ── 삭제용 폴더 목록 서브메뉴 ───────────────────────────────────
function buildDeleteFolderSubMenus(store, parentFolderId, parentMenuId) {
  var nodes = store.nodes;
  var trashId = store.trashId;
  var children = [];
  for (var k in nodes) {
    var n = nodes[k];
    if (n.type === 'folder' && n.parentId === parentFolderId && n.id !== trashId) {
      children.push(n);
    }
  }
  children.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko', { numeric: true }); });

  children.forEach(function (folder) {
    var menuId = 'delete_' + folder.id;
    var hasSubFolders = false;
    for (var k in nodes) {
      if (nodes[k].type === 'folder' && nodes[k].parentId === folder.id && nodes[k].id !== trashId) {
        hasSubFolders = true; break;
      }
    }

    if (hasSubFolders) {
      chrome.contextMenus.create({
        id: menuId, parentId: parentMenuId,
        title: '📁 ' + folder.name,
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      // 이 폴더 자신 삭제
      chrome.contextMenus.create({
        id: menuId + '_self', parentId: menuId,
        title: '🗑️ "' + folder.name + '" 삭제',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      chrome.contextMenus.create({
        id: 'delete-sep-' + folder.id, parentId: menuId,
        type: 'separator',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });

      buildDeleteFolderSubMenus(store, folder.id, menuId);
    } else {
      chrome.contextMenus.create({
        id: menuId, parentId: parentMenuId,
        title: '🗑️ "' + folder.name + '" 삭제',
        contexts: ['page', 'link'],
        documentUrlPatterns: YOUTUBE_PATTERNS
      }, function () { if (chrome.runtime.lastError) {} });
    }
  });
}

// ── 이벤트 리스너 ────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(function () { rebuildFolderMenus(); });
chrome.runtime.onStartup.addListener(function () { rebuildFolderMenus(); });
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes[TubeStore.KEY]) { rebuildFolderMenus(); }
});

// 아이콘 클릭 → 매니저 탭
chrome.action.onClicked.addListener(async function () {
  var url = chrome.runtime.getURL(MANAGER);
  try {
    var tabs = await chrome.tabs.query({});
    var ex = tabs.find(function (t) { return t.url && t.url.indexOf(url) === 0; });
    if (ex) chrome.tabs.update(ex.id, { active: true });
    else chrome.tabs.create({ url: url });
  } catch (e) { chrome.tabs.create({ url: url }); }
});

// ── 컨텍스트 메뉴 클릭 처리 ─────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  var itemId = String(info.menuItemId);

  // ── 튜브폴더 열기 ──
  if (itemId === 'tf-open-manager') {
    openManager();
    return;
  }

  // ── 새 폴더 만들기 ──
  if (itemId === 'tf-new-folder') {
    var store = (await TubeStore.load()) || TubeStore.emptyStore();
    // 매니저 탭을 열고 새 폴더 생성 명령 전달
    openManagerWithCommand({ cmd: 'new-folder', parentId: store.rootId });
    return;
  }

  // ── 폴더 이름 바꾸기 ──
  if (itemId.indexOf('rename_') === 0) {
    var folderId = itemId.replace(/^rename_/, '').replace(/_self$/, '');
    var store2 = (await TubeStore.load()) || TubeStore.emptyStore();
    var folder = store2.nodes[folderId];
    if (!folder) return;
    openManagerWithCommand({ cmd: 'rename-folder', folderId: folderId, folderName: folder.name });
    return;
  }

  // ── 폴더 삭제 ──
  if (itemId.indexOf('delete_') === 0) {
    var folderId2 = itemId.replace(/^delete_/, '').replace(/_self$/, '');
    var store3 = (await TubeStore.load()) || TubeStore.emptyStore();
    var folder2 = store3.nodes[folderId2];
    if (!folder2) return;
    // 확인 없이 바로 삭제 (휴지통으로)
    folder2.prevParentId = folder2.parentId;
    folder2.parentId = store3.trashId;
    folder2.modifiedAt = Date.now();
    await TubeStore.save(store3);
    flashBadge('🗑', '#888888');
    rebuildFolderMenus();
    return;
  }

  // ── 동영상 추가 (기존) ──
  if (itemId.indexOf('folder_') === 0) {
    var folderId3 = itemId.replace(/^folder_/, '').replace(/_self$/, '');
    var url = info.linkUrl || info.pageUrl || (tab && tab.url) || '';
    var vid = TubeStore.extractVideoId(url);
    if (!vid) { flashBadge('!', '#cc0000'); return; }

    var title = '';
    if (info.linkUrl) {
      title = url;
    } else {
      title = (tab && tab.title) || url;
      title = title.replace(/\s*[-|]\s*YouTube.*$/i, '').trim() || url;
    }

    try {
      var meta = null;
      try { meta = await TubeStore.fetchMeta(url); } catch (e) {}
      if (meta && meta.title) title = meta.title;

      await TubeStore.addVideoToFolder({
        url: url, title: title, videoId: vid,
        kind: String(url).indexOf('music.youtube') >= 0 ? 'music' : 'video',
        channel: (meta && meta.channel) || '',
        folderId: folderId3
      });
      flashBadge('+1', '#22a722');
    } catch (e) {
      console.error('[튜브폴더] 추가 실패:', e);
      flashBadge('!', '#cc0000');
    }
  }
});

// ── 매니저 탭 열기 ───────────────────────────────────────────────
async function openManager() {
  var url = chrome.runtime.getURL(MANAGER);
  try {
    var tabs = await chrome.tabs.query({});
    var ex = tabs.find(function (t) { return t.url && t.url.indexOf(url) === 0; });
    if (ex) { chrome.tabs.update(ex.id, { active: true }); return ex.id; }
    else { var t = await chrome.tabs.create({ url: url }); return t.id; }
  } catch (e) { var t2 = await chrome.tabs.create({ url: url }); return t2.id; }
}

// ── 매니저 탭 열고 명령 전달 ─────────────────────────────────────
async function openManagerWithCommand(command) {
  // 명령을 storage에 저장 → 매니저가 열릴 때 읽어서 처리
  try {
    await chrome.storage.local.set({ 'tf_pending_command': command });
  } catch (e) {}
  await openManager();
}

function flashBadge(text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: color });
    chrome.action.setBadgeText({ text: text });
    setTimeout(function () { chrome.action.setBadgeText({ text: '' }); }, 2000);
  } catch (e) {}
}

// SW 초기화 시 즉시 메뉴 구성
rebuildFolderMenus();
