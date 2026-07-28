// 저장 계층 — tubefolder-extension-v1/storage.js(TubeStore)를 TS로 이식.
// 세 컨텍스트(서비스워커·콘텐츠 스크립트·매니저 페이지) 모두 chrome.storage.local을 쓸 수 있어
// 이 모듈 하나로 공유한다. chrome.storage가 없는 일반 웹 컨텍스트에서는 localStorage로 폴백
// (v1과 동일한 이중 런타임 대비 — 향후 PWA 확장 시에도 이 모듈 교체 없이 그대로 동작).

import type { FolderNode, TubeNode, TubeStoreData } from './types';
import { FREE_VIDEO_LIMIT, isPaidCached, LicenseLimitError } from '../license/licenseEngine';
import { isLicenseAvailable } from '../license/licenseManager';
import { MUSIC_HOST_MARKER, youtubePattern, youtubeUrl } from '../shared/youtubeSelectors';

const KEY = 'tubefolder_v1';
// v1(=1)에서 노드에 schemaVersion·deviceId·version 동기화 메타데이터 필드를 추가하며 2로 상향
// (v1 AGENTS.md 규칙: "저장 키나 노드 스키마를 바꾸면 migrate()에 변환 추가 + DATA_VERSION 상향").
// 노드별 schemaVersion 필드도 이 값을 그대로 재사용한다(스토어 스키마 세대와 노드 스키마 세대는 항상 같이 움직이므로 별도 상수를 두지 않음).
const DATA_VERSION = 2;
const DEVICE_ID_KEY = 'tubefolder_device_id';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

export function now(): number {
  return Date.now();
}

export function uid(): string {
  return 'n_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);
}

function genId(prefix: string): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);
}

let cachedDeviceId: string | null = null;

/** 이 브라우저/기기의 영구 식별자. 최초 호출 시 생성해 저장소에 남기고 이후엔 그대로 재사용한다(3단계 동기화 병합 대비). */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (hasChromeStorage()) {
    const o = await chrome.storage.local.get(DEVICE_ID_KEY);
    let id = o[DEVICE_ID_KEY] as string | undefined;
    if (!id) {
      id = genId('d');
      await chrome.storage.local.set({ [DEVICE_ID_KEY]: id });
    }
    cachedDeviceId = id;
    return id;
  }
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = genId('d');
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
    return id;
  } catch {
    cachedDeviceId = genId('d');
    return cachedDeviceId;
  }
}

/** 새 노드 생성 시 채워 넣을 스키마·동기화 메타데이터(신규 노드는 항상 version 1부터 시작) */
export async function newNodeMeta(): Promise<{ schemaVersion: number; deviceId: string; version: number }> {
  return { schemaVersion: DATA_VERSION, deviceId: await getDeviceId(), version: 1 };
}

/** 기존 노드를 수정할 때 modifiedAt·version·deviceId·schemaVersion을 한 번에 갱신(제자리 수정) */
export async function touch(node: TubeNode): Promise<void> {
  node.modifiedAt = now();
  node.version = (typeof node.version === 'number' ? node.version : 0) + 1;
  node.deviceId = await getDeviceId();
  node.schemaVersion = DATA_VERSION;
}

export async function emptyStore(): Promise<TubeStoreData> {
  const t = now();
  const meta = await newNodeMeta();
  return {
    version: DATA_VERSION,
    rootId: 'root',
    trashId: 'trash',
    nodes: {
      root: { id: 'root', type: 'folder', parentId: null, name: '튜브폴더', createdAt: t, modifiedAt: t, order: 0, ...meta },
      trash: {
        id: 'trash',
        type: 'folder',
        parentId: 'root',
        name: '휴지통',
        system: 'trash',
        createdAt: t,
        modifiedAt: t,
        order: Number.MAX_SAFE_INTEGER,
        ...meta
      }
    },
    settings: { view: 'large', sortKey: 'name', sortDir: 'asc', trashRetentionDays: 30, trashInfoDismissed: false }
  };
}

// 불변식 보정 (DATA-MODEL.md §5) — 로드 시 항상 통과시킨다.
export async function migrate(data: Partial<TubeStoreData> | null | undefined): Promise<TubeStoreData> {
  if (!data || !data.nodes || typeof data.nodes !== 'object') return emptyStore();

  const d = data as TubeStoreData;
  if (!d.rootId) d.rootId = 'root';
  if (!d.trashId) d.trashId = 'trash';

  const e = await emptyStore();
  if (!d.nodes[d.rootId]) d.nodes[d.rootId] = e.nodes.root;
  if (!d.nodes[d.trashId]) d.nodes[d.trashId] = e.nodes.trash;
  (d.nodes[d.trashId] as FolderNode).system = 'trash';

  if (!d.settings) d.settings = e.settings;
  if (!d.settings.view) d.settings.view = 'large';
  if (!d.settings.sortKey) d.settings.sortKey = 'name';
  if (!d.settings.sortDir) d.settings.sortDir = 'asc';
  // null은 "자동 삭제 없음"이라는 유효한 값이라 undefined일 때만 기본값(30일)으로 백필한다.
  if (typeof d.settings.trashRetentionDays === 'undefined') d.settings.trashRetentionDays = 30;
  if (typeof d.settings.trashInfoDismissed !== 'boolean') d.settings.trashInfoDismissed = false;

  for (const k in d.nodes) {
    const n = d.nodes[k];
    if (n.id === d.rootId) continue;
    if (n.parentId == null || !d.nodes[n.parentId]) {
      if (n.id !== d.trashId) n.parentId = d.rootId;
    }
  }

  // 스키마 버전·동기화 메타데이터 필드 도입(DATA_VERSION 1→2) 이전 데이터 하위호환 보정.
  // 원래 기기·수정시각을 알 수 없으므로 "지금 이 값으로 처음 확인됨"으로 보수적으로 채운다.
  const deviceId = await getDeviceId();
  for (const k in d.nodes) {
    const n = d.nodes[k];
    if (typeof n.schemaVersion !== 'number') n.schemaVersion = DATA_VERSION;
    if (!n.deviceId) n.deviceId = deviceId;
    if (typeof n.version !== 'number') n.version = 1;
    if (typeof n.modifiedAt !== 'number') n.modifiedAt = n.createdAt || now();
  }

  // 영구 삭제 기록(3단계 동기화 병합용) — optional 추가 필드라 DATA_VERSION 상향 없이 백필만 한다
  // (이어보기 lastPosition 추가 때와 같은 기준: 기존 필드 의미가 안 바뀌면 버전 유지).
  if (!d.tombstones || typeof d.tombstones !== 'object') d.tombstones = {};

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

// ROADMAP-CHECKLIST.md 4단계 "영상 duration 정밀 수집" — oEmbed/noembed(fetchMeta)는 재생시간을 주지 않으므로,
// 재생목록 가져오기(playlistImport.ts)와 같은 방식으로 API 키 없이 시청 페이지에 이미 공개돼 있는
// ytInitialPlayerResponse.videoDetails.lengthSeconds를 정규식으로 읽는다. 실패해도 조용히 0(미수집) 반환
// — 재생시간 하나 때문에 영상 추가 자체가 실패하면 안 됨(fetchMeta와 동일한 관용적 실패 정책).
export async function fetchDuration(videoId: string): Promise<number> {
  try {
    const res = await fetch(youtubeUrl.watch(videoId), {
      credentials: 'omit'
    });
    if (!res.ok) return 0;
    const html = await res.text();
    const m = html.match(youtubePattern.lengthSeconds);
    return m ? parseInt(m[1], 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function fetchMeta(url: string): Promise<{ title: string; channel: string } | null> {
  try {
    const r = await fetch(youtubeUrl.oembed(url));
    if (r.ok) {
      const j = await r.json();
      if (j && j.title) return { title: j.title, channel: j.author_name || '' };
    }
  } catch {
    // youtube.com 직통 실패 시 noembed로 폴백(아래)
  }
  try {
    const r2 = await fetch(youtubeUrl.noembed(url));
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

  let videoCount = 0;
  for (const k in data.nodes) {
    if (data.nodes[k].type === 'video') videoCount++;
  }
  if (videoCount >= FREE_VIDEO_LIMIT && isLicenseAvailable() && !(await isPaidCached())) {
    throw new LicenseLimitError(
      'video-limit',
      `무료 버전은 영상을 최대 ${FREE_VIDEO_LIMIT}개까지 저장할 수 있습니다. 더 추가하려면 업그레이드가 필요합니다.`
    );
  }

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
    thumb: vid ? youtubeUrl.thumbnail(vid) : '',
    kind: opts.kind || (String(opts.url).indexOf(MUSIC_HOST_MARKER) >= 0 ? 'music' : 'video'),
    channel: opts.channel || '',
    duration: opts.duration || 0,
    createdAt: t,
    modifiedAt: t,
    order,
    ...(await newNodeMeta())
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
