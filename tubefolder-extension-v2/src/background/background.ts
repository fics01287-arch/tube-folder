// background.ts — MV3 서비스워커.
// tubefolder-extension-v1/background.js 이식 + 폴더 관리(새로 만들기·이름변경·삭제)를
// 매니저 탭 전환 없이 처리하기 위해, 해당 메뉴 클릭 시 현재 탭의 content script에
// "미니 팝업을 띄워라" 메시지만 보낸다(실제 storage 반영은 content script가 직접 수행).
//
// I9(ARCHITECTURE.md 불변식): 이벤트 리스너는 반드시 스크립트 최상위에서 동기 등록해야
// 한다(비동기 등록 시 SW 종료로 이벤트 유실) — 아래 리스너들은 모두 최상위에 있다.

import { addVideoToFolder, extractVideoId, fetchDuration, fetchMeta, load, STORAGE_KEY } from '../storage/storage';
import { folderChildren } from '../storage/folderOps';
import type { TubeStoreData } from '../storage/types';
import type { ContentToBackgroundMessage } from '../shared/messages';
import { MUSIC_HOST_MARKER, YOUTUBE_DOCUMENT_PATTERNS } from '../shared/youtubeSelectors';
import * as syncEngine from '../sync/syncEngine';
import ExtPay from 'extpay';
import {
  EXTPAY_EXTENSION_ID,
  FREE_DISTRIBUTION_MODE,
  isLicenseConfigured,
  LicenseState,
  writeLicenseState
} from '../license/licenseEngine';

// ── 유료화(ExtensionPay) 초기화 — background.ts는 확장 전용 번들이라 정적 import가 안전하다
// (licenseManager.ts는 매니저 페이지가 PWA와 공유하는 번들이라 동적 import로 분리해 둠).
// startBackground()는 라이브러리 요구사항상 스크립트 최상위에서 한 번만 호출해야 한다(아래 참고).
const extpay = ExtPay(EXTPAY_EXTENSION_ID);
extpay.startBackground();

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

// ── 자동 동기화 (3단계 "모바일 자동 동기화") ─────────────────────
// 트리거 3종을 background가 담당: ①주기(15분 알람) ②로컬 변경 후 10초 디바운스 ③브라우저 시작 시.
// (④수동 버튼은 매니저 페이지가 직접 runSync('manual') 호출.)
// 자동 실패는 runSync 내부에서 조용히 기록·백오프 재시도되므로 여기서는 결과를 무시한다(오프라인 우선 원칙).
const SYNC_ALARM = 'tf-sync';
const SYNC_PERIOD_MINUTES = 15;
const SYNC_DEBOUNCE_MS = 10 * 1000;
let syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;

function ensureSyncAlarm(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
}

function autoSync(): void {
  syncEngine.runSync('auto').catch(() => {
    // 'auto'는 원래 throw하지 않지만(내부에서 삼킴), 만약을 위한 최종 방어 — 조용히 무시
  });
}

// ── 라이선스(유료 상태) 확인 — 최초 실행 시 1회 + 주기적 1회만 온라인 확인, 평상시는 캐시
// (licenseEngine.getCachedLicense)로 오프라인 사용을 보장한다(CLAUDE.md 유료화 대비 원칙).
const LICENSE_ALARM = 'tf-license-check';
const LICENSE_PERIOD_MINUTES = 24 * 60; // 24시간 — 결제 상태는 자주 안 바뀌므로 동기화(15분)보다 훨씬 길게

function ensureLicenseAlarm(): void {
  chrome.alarms.create(LICENSE_ALARM, { periodInMinutes: LICENSE_PERIOD_MINUTES });
}

async function refreshLicense(): Promise<void> {
  // 무료 전환 모드에서는 licenseEngine.getCachedLicense()가 항상 "유료"로 응답하므로,
  // 실제 결제 서버를 조회하는 이 네트워크 호출 자체가 무의미하다 — 조용히 건너뛴다.
  if (FREE_DISTRIBUTION_MODE || !isLicenseConfigured()) return;
  try {
    const user = await extpay.getUser();
    const state: LicenseState = {
      paid: !!user.paid,
      email: user.email || null,
      paidAt: user.paidAt ? user.paidAt.getTime() : null,
      checkedAt: Date.now(),
      lastCheckFailed: false
    };
    await writeLicenseState(state);
  } catch {
    // 오프라인 등 — 기존 캐시를 그대로 두고 조용히 실패(다음 주기에 재시도)
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) autoSync();
  if (alarm.name === LICENSE_ALARM) refreshLicense();
});

// ── 이벤트 리스너 (최상위 동기 등록) ──────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  rebuildFolderMenus();
  ensureSyncAlarm();
  ensureLicenseAlarm();
  refreshLicense(); // 최초 실행 시 1회 온라인 확인
});
chrome.runtime.onStartup.addListener(() => {
  rebuildFolderMenus();
  ensureSyncAlarm();
  ensureLicenseAlarm();
  autoSync(); // 시작 시 1회 — 블로킹 없음(백그라운드), UI는 항상 로컬 데이터로 먼저 뜸
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    rebuildFolderMenus();
    // 동기화 자신이 병합 결과를 쓴 변경에는 재트리거하지 않는다(루프 방지).
    // 다른 컨텍스트(매니저 등)의 동기화 쓰기가 온 경우는 잠금+무변경 판정이 걸러준다.
    if (!syncEngine.isSyncWriting) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(autoSync, SYNC_DEBOUNCE_MS);
    }
  }
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
      // 제목/채널(oEmbed)과 재생시간(시청 페이지 파싱)은 서로 다른 소스라 병렬로 조회 — 하나가 실패해도
      // (catch에서 null/0 폴백) 다른 하나는 영향받지 않음(ROADMAP 4단계 "duration 정밀 수집").
      const [meta, duration] = await Promise.all([
        fetchMeta(url).catch(() => null),
        fetchDuration(vid).catch(() => 0)
      ]);
      if (meta && meta.title) title = meta.title;

      await addVideoToFolder({
        url,
        title,
        videoId: vid,
        kind: url.indexOf(MUSIC_HOST_MARKER) >= 0 ? 'music' : 'video',
        channel: meta?.channel || '',
        duration,
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

// SW 초기화 시 즉시 메뉴 구성 + 동기화·라이선스 알람 보장(alarms.create는 같은 이름이면 대체라 중복 걱정 없음)
rebuildFolderMenus();
ensureSyncAlarm();
ensureLicenseAlarm();
