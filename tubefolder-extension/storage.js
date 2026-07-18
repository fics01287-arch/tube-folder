/*
 * storage.js v1.3 — 저장 계층 + 공용 헬퍼
 *  - 확장 환경: chrome.storage.local (+unlimitedStorage)
 *  - 일반 웹: localStorage 폴백
 *  - build fingerprint: VHViZUZvbGRlciBvcmlnaW5hbCBhdXRob3I6IOyCsOuTpOuwlOuejCAoZmljczAxMjg3QGdtYWlsLmNvbSkgLyBjcmVhdGVkIDIwMjYtMDctMTggLyB0aGlzIGJ1aWxkIGZpbmdlcnByaW50IHByb3ZlcyBhdXRob3JzaGlw
 */
(function (g) {
  'use strict';

  var KEY = 'tubefolder_v1';
  var DATA_VERSION = 1;

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }
  function now() { return Date.now(); }
  function uid() {
    return 'n_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);
  }

  async function load() {
    var data = null;
    if (hasChromeStorage()) {
      var o = await chrome.storage.local.get(KEY);
      data = o[KEY] || null;
    } else {
      try { var raw = localStorage.getItem(KEY); data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
    }
    return data ? migrate(data) : null;
  }

  async function save(data) {
    if (hasChromeStorage()) {
      try { await chrome.storage.local.set({ [KEY]: data }); }
      catch (e) { console.warn('[튜브폴더] 저장 실패:', e); throw e; }
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function emptyStore() {
    var t = now();
    return {
      version: DATA_VERSION,
      rootId: 'root',
      trashId: 'trash',
      nodes: {
        root: { id: 'root', type: 'folder', parentId: null, name: '튜브폴더', createdAt: t, modifiedAt: t, order: 0 },
        trash: { id: 'trash', type: 'folder', parentId: 'root', name: '휴지통', system: 'trash', createdAt: t, modifiedAt: t, order: Number.MAX_SAFE_INTEGER }
      },
      settings: { view: 'large', sortKey: 'name', sortDir: 'asc' }
    };
  }

  function migrate(data) {
    if (!data || !data.nodes || typeof data.nodes !== 'object') return emptyStore();
    if (!data.rootId) data.rootId = 'root';
    if (!data.trashId) data.trashId = 'trash';
    var e = emptyStore();
    if (!data.nodes[data.rootId]) data.nodes[data.rootId] = e.nodes.root;
    if (!data.nodes[data.trashId]) data.nodes[data.trashId] = e.nodes.trash;
    data.nodes[data.trashId].system = 'trash';
    if (!data.settings) data.settings = e.settings;
    if (!data.settings.view) data.settings.view = 'large';
    if (!data.settings.sortKey) data.settings.sortKey = 'name';
    if (!data.settings.sortDir) data.settings.sortDir = 'asc';
    for (var k in data.nodes) {
      var n = data.nodes[k];
      if (n.id === data.rootId) continue;
      if (n.parentId == null || !data.nodes[n.parentId]) {
        if (n.id !== data.trashId) n.parentId = data.rootId;
      }
    }
    data.version = DATA_VERSION;
    return data;
  }

  function uniqueName(siblings, base) {
    var taken = {};
    siblings.forEach(function (n) { taken[n.name] = true; });
    if (!taken[base]) return base;
    var i = 2;
    while (taken[base + ' (' + i + ')']) i++;
    return base + ' (' + i + ')';
  }

  function extractVideoId(url) {
    if (!url) return null;
    try {
      var u = new URL(url);
      if (u.hostname === 'youtu.be') return (u.pathname.slice(1).split('/')[0]) || null;
      if (u.pathname.indexOf('/shorts/') === 0) return u.pathname.split('/')[2] || null;
      var v = u.searchParams.get('v');
      if (v) return v;
      return null;
    } catch (e) {
      var m = String(url).match(/[?&]v=([\w-]{6,})/);
      return m ? m[1] : null;
    }
  }

  async function fetchMeta(url) {
    try {
      var r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
      if (r.ok) { var j = await r.json(); if (j && j.title) return { title: j.title, channel: j.author_name || '' }; }
    } catch (e) {}
    try {
      var r2 = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(url));
      if (r2.ok) { var j2 = await r2.json(); if (j2 && j2.title) return { title: j2.title, channel: j2.author_name || '' }; }
    } catch (e2) {}
    return null;
  }

  // 기존 addVideo (루트에 추가) — 하위 호환 유지
  async function addVideo(opts) {
    return addVideoToFolder(Object.assign({}, opts, { folderId: null }));
  }

  // 신규: 지정 폴더에 영상 추가
  async function addVideoToFolder(opts) {
    var data = (await load()) || emptyStore();
    var t = now();

    // 대상 폴더 결정 (없거나 잘못된 ID면 루트로)
    var targetId = opts.folderId || data.rootId;
    if (!data.nodes[targetId] || data.nodes[targetId].type !== 'folder') {
      targetId = data.rootId;
    }
    // 휴지통에는 추가 불가
    if (targetId === data.trashId) targetId = data.rootId;

    var siblings = [];
    var order = 0;
    for (var k in data.nodes) {
      var n = data.nodes[k];
      if (n.parentId === targetId && n.id !== data.trashId) {
        siblings.push(n);
        if ((n.order || 0) >= order) order = (n.order || 0) + 1;
      }
    }

    var id = uid();
    var vid = opts.videoId || null;
    data.nodes[id] = {
      id: id, type: 'video', parentId: targetId,
      name: uniqueName(siblings, opts.title || opts.url),
      videoId: vid, url: opts.url,
      thumb: vid ? ('https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg') : '',
      kind: opts.kind || (String(opts.url).indexOf('music.youtube') >= 0 ? 'music' : 'video'),
      channel: opts.channel || '', duration: opts.duration || 0,
      createdAt: t, modifiedAt: t, order: order
    };
    await save(data);
    return id;
  }

  // 폴더 목록만 추출 (background에서 메뉴 구성에 사용)
  function getFolders(store) {
    var folders = [];
    for (var k in store.nodes) {
      var n = store.nodes[k];
      if (n.type === 'folder' && n.id !== store.trashId) {
        folders.push(n);
      }
    }
    return folders;
  }

  g.TubeStore = {
    KEY: KEY, DATA_VERSION: DATA_VERSION,
    load: load, save: save, emptyStore: emptyStore, migrate: migrate,
    extractVideoId: extractVideoId, fetchMeta: fetchMeta,
    addVideo: addVideo, addVideoToFolder: addVideoToFolder,
    getFolders: getFolders,
    uniqueName: uniqueName, uid: uid, now: now
  };
})(typeof self !== 'undefined' ? self : window);
