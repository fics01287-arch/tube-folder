/*
 * storage.js — 저장 계층 + 공용 헬퍼 (확장 SW / 매니저 페이지 / 모바일 웹 공용)
 *  - 확장 환경: chrome.storage.local (+unlimitedStorage 로 10MB 한도 해제)
 *  - 일반 웹(모바일 브라우저): localStorage 폴백
 * background.js(서비스워커)와 manager 페이지 양쪽에서 globalThis.TubeStore 로 사용.
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
      catch (e) { console.warn('[튜브폴더] 저장 실패(용량 초과 가능):', e); throw e; }
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

  // 구버전/손상 데이터 보정 — 항상 유효한 store 를 반환
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
    // 고아 노드(부모 없음)는 루트로 복구
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

  // 탐색기식 중복 이름 처리: "새 폴더" → "새 폴더 (2)"
  function uniqueName(siblings, base) {
    var taken = {};
    siblings.forEach(function (n) { taken[n.name] = true; });
    if (!taken[base]) return base;
    var i = 2;
    while (taken[base + ' (' + i + ')']) i++;
    return base + ' (' + i + ')';
  }

  // 다양한 유튜브 URL 형태에서 video id 추출
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

  // 제목·채널 메타데이터 (API 키 불필요)
  //  1) youtube oembed — 확장에선 host_permission 으로 CORS 우회
  //  2) noembed.com    — CORS 허용(ACAO:*) → 모바일 웹 폴백
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

  // 컨텍스트 메뉴("튜브폴더에 추가")용 — 루트에 영상 추가(이름 중복 보정)
  async function addVideo(opts) {
    var data = (await load()) || emptyStore();
    var t = now();
    var order = 1, siblings = [];
    for (var k in data.nodes) {
      var n = data.nodes[k];
      if (n.parentId === data.rootId && n.id !== data.trashId) {
        siblings.push(n);
        if (n.order >= order) order = n.order + 1;
      }
    }
    var id = uid();
    var vid = opts.videoId || null;
    data.nodes[id] = {
      id: id, type: 'video', parentId: data.rootId,
      name: uniqueName(siblings, opts.title || opts.url), videoId: vid, url: opts.url,
      thumb: vid ? ('https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg') : '',
      kind: opts.kind || (String(opts.url).indexOf('music.youtube') >= 0 ? 'music' : 'video'),
      channel: opts.channel || '', duration: opts.duration || 0,
      createdAt: t, modifiedAt: t, order: order
    };
    await save(data);
    return id;
  }

  g.TubeStore = {
    KEY: KEY, DATA_VERSION: DATA_VERSION,
    load: load, save: save, emptyStore: emptyStore, migrate: migrate,
    extractVideoId: extractVideoId, fetchMeta: fetchMeta,
    addVideo: addVideo, uniqueName: uniqueName, uid: uid, now: now
  };
})(typeof self !== 'undefined' ? self : window);
