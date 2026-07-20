// 저장 계층 — tubefolder-extension-v1/storage.js(TubeStore)를 TS로 이식.
// 세 컨텍스트(서비스워커·콘텐츠 스크립트·매니저 페이지) 모두 chrome.storage.local을 쓸 수 있어
// 이 모듈 하나로 공유한다. chrome.storage가 없는 일반 웹 컨텍스트에서는 localStorage로 폴백
// (v1과 동일한 이중 런타임 대비 — 향후 PWA 확장 시에도 이 모듈 교체 없이 그대로 동작).

import type { FolderNode, TubeNode, TubeStoreData } from './types';

const KEY = 'tubefolder_v1';
const DATA_VERSION = 1;

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

export function now(): number {
  return Date.now();
}

export function uid(): string {
  return 'n_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);
}

export function emptyStore(): TubeStoreData {
  const t = now();
  return {
    version: DATA_VERSION,
    rootId: 'root',
    trashId: 'trash',
    nodes: {
      root: { id: 'root', type: 'folder', parentId: null, name: '튜브폴더', createdAt: t, modifiedAt: t, order: 0 },
      trash: {
        id: 'trash',
        type: 'folder',
        parentId: 'root',
        name: '휴지통',
        system: 'trash',
        createdAt: t,
        modifiedAt: t,
        order: Number.MAX_SAFE_INTEGER
      }
    },
    settings: { view: 'large', sortKey: 'name', sortDir: 'asc' }
  };
}

// 불변식 보정 (DATA-MODEL.md §5) — 로드 시 항상 통과시킨다.
export function migrate(data: Partial<TubeStoreData> | null | undefined): TubeStoreData {
  if (!data || !data.nodes || typeof data.nodes !== 'object') return emptyStore();

  const d = data as TubeStoreData;
  if (!d.rootId) d.rootId = 'root';
  if (!d.trashId) d.trashId = 'trash';

  const e = emptyStore();
  if (!d.nodes[d.rootId]) d.nodes[d.rootId] = e.nodes.root;
  if (!d.nodes[d.trashId]) d.nodes[d.trashId] = e.nodes.trash;
  (d.nodes[d.trashId] as FolderNode).system = 'trash';

  if (!d.settings) d.settings = e.settings;
  if (!d.settings.view) d.settings.view = 'large';
  if (!d.settings.sortKey) d.settings.sortKey = 'name';
  if (!d.settings.sortDir) d.settings.sortDir = 'asc';

  for (const k in d.nodes) {
    const n = d.nodes[k];
    if (n.id === d.rootId) continue;
    if (n.parentId == null || !d.nodes[n.parentId]) {
      if (n.id !== d.trashId) n.parentId = d.rootId;
    }
  }

  d.version = DATA_VERSION;
  return d;
}

export async function load(): Promise<TubeStoreData> {
  let data: TubeStoreData | null = null;
  if (hasChromeStorage()) {
    const o = await chrome.storage.local.get(KEY);
    data = (o[KEY] as TubeStoreData) || null;
  } else {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? (JSON.parse(raw) as TubeStoreData) : null;
    } catch {
      data = null;
    }
  }
  return migrate(data);
}

export async function save(data: TubeStoreData): Promise<void> {
  if (hasChromeStorage()) {
    try {
      await chrome.storage.local.set({ [KEY]: data });
    } catch (e) {
      console.warn('[튜브폴더] 저장 실패:', e);
      throw e;
    }
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 웹 폴백 저장 실패는 무시(v1과 동일) — 확장 환경에선 도달하지 않음
  }
}

export function uniqueName(siblings: TubeNode[], base: string): string {
  const taken: Record<string, boolean> = {};
  siblings.forEach((n) => {
    taken[n.name] = true;
  });
  if (!taken[base]) return base;
  let i = 2;
  while (taken[base + ' (' + i + ')']) i++;
  return base + ' (' + i + ')';
}

export function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.pathname.indexOf('/shorts/') === 0) return u.pathname.split('/')[2] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    return null;
  } catch {
    const m = String(url).match(/[?&]v=([\w-]{6,})/);
    return m ? m[1] : null;
  }
}

export async function fetchMeta(url: string): Promise<{ title: string; channel: string } | null> {
  try {
    const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
    if (r.ok) {
      const j = await r.json();
      if (j && j.title) return { title: j.title, channel: j.author_name || '' };
    }
  } catch {
    // youtube.com 직통 실패 시 noembed로 폴백(아래)
  }
  try {
    const r2 = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(url));
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2 && j2.title) return { title: j2.title, channel: j2.author_name || '' };
    }
  } catch {
    // 둘 다 실패하면 null 반환(호출부가 URL만으로 제목 대체)
  }
  return null;
}

export interface AddVideoOptions {
  url: string;
  title?: string;
  videoId?: string | null;
  kind?: 'video' | 'music';
  channel?: string;
  duration?: number;
  folderId?: string | null;
}

export async function addVideoToFolder(opts: AddVideoOptions): Promise<string> {
  const data = await load();
  const t = now();

  let targetId = opts.folderId || data.rootId;
  const targetNode = data.nodes[targetId];
  if (!targetNode || targetNode.type !== 'folder') {
    targetId = data.rootId;
  }
  if (targetId === data.trashId) targetId = data.rootId;

  const siblings: TubeNode[] = [];
  let order = 0;
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.parentId === targetId && n.id !== data.trashId) {
      siblings.push(n);
      if ((n.order || 0) >= order) order = (n.order || 0) + 1;
    }
  }

  const id = uid();
  const vid = opts.videoId || null;
  data.nodes[id] = {
    id,
    type: 'video',
    parentId: targetId,
    name: uniqueName(siblings, opts.title || opts.url),
    videoId: vid,
    url: opts.url,
    thumb: vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : '',
    kind: opts.kind || (String(opts.url).indexOf('music.youtube') >= 0 ? 'music' : 'video'),
    channel: opts.channel || '',
    duration: opts.duration || 0,
    createdAt: t,
    modifiedAt: t,
    order
  };
  await save(data);
  return id;
}

// 폴더 목록만 추출 (background에서 메뉴 구성에 사용)
export function getFolders(store: TubeStoreData): FolderNode[] {
  const folders: FolderNode[] = [];
  for (const k in store.nodes) {
    const n = store.nodes[k];
    if (n.type === 'folder' && n.id !== store.trashId) {
      folders.push(n);
    }
  }
  return folders;
}

export const STORAGE_KEY = KEY;
export const STORAGE_DATA_VERSION = DATA_VERSION;
