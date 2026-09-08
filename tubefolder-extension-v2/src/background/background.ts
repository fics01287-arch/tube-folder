// background.ts — MV3 서비스워커.
// tubefolder-extension-v1/background.js 이식 + 폴더 관리(새로 만들기·이름변경·삭제)를
// 매니저 탭 전환 없이 처리하기 위해, 해당 메뉴 클릭 시 현재 탭의 content script에
// "미니 팝업을 띄워라" 메시지만 보낸다(실제 storage 반영은 content script가 직접 수행).
//
// I9(ARCHITECTURE.md 불변식): 이벤트 리스너는 반드시 스크립트 최상위에서 동기 등록해야
// 한다(비동기 등록 시 SW 종료로 이벤트 유실) — 아래 리스너들은 모두 최상위에 있다.

import { addVideoToFolder, extractVideoId, fetchDuration, fetchMeta, load, STORAGE_KEY } from '../storage/storage';
import { folderChildren } from '../storage/folderOps';
import { extractPlaylistId } from '../storage/playlistImport';
import { fetchPlaylistViaDataApi, YoutubeApiError } from '../storage/youtubeDataApi';
import type { TubeStoreData } from '../storage/types';
import type { ContentToBackgroundMessage, FetchPlaylistDataApiResponse } from '../shared/messages';
import { MUSIC_HOST_MARKER, YOUTUBE_DOCUMENT_PATTERNS } from '../shared/youtubeSelectors';
import * as syncEngine from '../sync/syncEngine';
import {
  FREE_DISTRIBUTION_MODE,
  getCachedLicense,
  isLicenseConfigured,
  isLicenseKeyGranted,
  LicenseState,
  PADDLE_VERIFY_ENDPOINT,
  writeLicenseState
} from '../license/licenseEngine';

const MANAGER = 'index.html';
const CONTEXTS: chrome.contextMenus.ContextType[] = ['page', 'link'];
// 재생목록 썸네일 카드는 이미지·비디오 배지·삼점 메뉴 등이 겹겹이 얹힌 복잡한 구조라, 우클릭한
// 정확한 지점에 따라 Chrome이 'link'가 아니라 'image'/'video' 컨텍스트로 판단할 수 있음(둘 다
// 같은 <a> 안에 있어도) — 그러면 contexts:['page','link']만으로는 메뉴 자체가 안 뜬다(산들이
// 재생목록 개요 페이지 썸네일에서 우클릭했을 때 메뉴가 안 보인 문제의 원인으로 추정). 이 항목만
// 컨텍스트를 넓혀서 어디를 클릭하든 뜨게 하고, 실제 재생목록 여부는 기존처럼 클릭 시점에
// extractPlaylistId로 검증(정상적인 링크가 아니면 배지로 실패 안내)한다.
const PLAYLIST_MENU_CONTEXTS: chrome.contextMenus.ContextType[] = ['page', 'link', 'image', 'video'];

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

      // ② 재생목록 가져오기 — 비공개 재생목록도 지원(로그인 쿠키를 실어 보내는 인증된 fetch,
      // ARCHITECTURE 원칙: 이 메뉴는 항상 보이고(documentUrlPatterns가 list= 쿼리 유무를
      // 필터링할 수 없어서), 실제 재생목록 여부는 클릭 시점에 extractPlaylistId로 검증한다.
      createMenu({ id: 'tf-import-sep', type: 'separator', contexts: PLAYLIST_MENU_CONTEXTS });
      createMenu({ id: 'tf-import-playlist', title: '🎵 이 재생목록 가져오기', contexts: PLAYLIST_MENU_CONTEXTS });

      // ③ 폴더 관리
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
  const cached = await getCachedLicense();
  // 승인 기반 무료 라이선스(3단계)는 Paddle이 알지 못하는 상태라, 그대로 재확인을 돌리면
  // "결제 없음"으로 오인해 24시간마다 무료로 되돌려버린다 — 영구 자격증명이라 재확인에서 제외.
  if (isLicenseKeyGranted(cached)) return;
  // 이 기기에서 한 번도 구매·복원을 한 적 없으면(이메일 모름) 조회할 대상이 없다 — 그대로 둔다.
  if (!cached.email) return;
  try {
    const res = await fetch(`${PADDLE_VERIFY_ENDPOINT}?email=${encodeURIComponent(cached.email)}`);
    if (!res.ok) throw new Error(`라이선스 조회 실패 (${res.status})`);
    const data = (await res.json()) as { paid?: boolean; paidAt?: number };
    const state: LicenseState = {
      paid: !!data.paid,
      email: cached.email,
      paidAt: data.paidAt ?? null,
      checkedAt: Date.now(),
      lastCheckFailed: false,
      source: 'paddle'
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

// 확장을 새로고침(chrome://extensions ⟳)해도 이미 열려 있던 유튜브 탭에 심어진 콘텐츠 스크립트는
// 자동으로 안 바뀐다(MV3 공통 제약 — content_scripts는 새 페이지 로드 시점에만 주입됨). 개발 중
// "탭도 같이 새로고침해야 한다"를 매번 안내해야 했던 마찰(2026-09-07, 재생목록 가져오기 디버깅
// 과정에서 반복 발견)을 없애기 위해, 확장이 설치/업데이트될 때 열려있는 유튜브 탭을 자동으로
// 새로고침한다.
function reloadYoutubeTabs(): void {
  chrome.tabs.query({ url: YOUTUBE_DOCUMENT_PATTERNS }, (tabs) => {
    for (const t of tabs) {
      if (t.id != null) chrome.tabs.reload(t.id);
    }
  });
}

// ── 이벤트 리스너 (최상위 동기 등록) ──────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  rebuildFolderMenus();
  ensureSyncAlarm();
  ensureLicenseAlarm();
  refreshLicense(); // 최초 실행 시 1회 온라인 확인
  reloadYoutubeTabs();
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

chrome.runtime.onMessage.addListener((message: ContentToBackgroundMessage, _sender, sendResponse) => {
  if (message && message.type === 'TF_FLASH_BADGE') {
    flashBadge(message.text, message.color);
    return undefined; // 동기 처리 — 응답 없음
  }

  if (message && message.type === 'TF_FETCH_PLAYLIST_DATA_API') {
    // chrome.identity는 콘텐츠 스크립트에 없어 여기(서비스워커)에서 토큰 발급부터 fetch까지
    // 전부 처리한 뒤 결과만 돌려준다 — youtubeDataApi.ts 상단 주석 참고. MV3 규칙상 비동기
    // 응답을 쓰려면 리스너가 true를 반환해야 sendResponse를 나중에 불러도 유효하다.
    fetchPlaylistViaDataApi(message.playlistId)
      .then((result) => {
        const response: FetchPlaylistDataApiResponse = { ok: true, title: result.title, videos: result.videos };
        sendResponse(response);
      })
      .catch((e) => {
        const response: FetchPlaylistDataApiResponse =
          e instanceof YoutubeApiError
            ? { ok: false, code: e.code, message: e.message }
            : { ok: false, code: 'other', message: e instanceof Error ? e.message : String(e) };
        sendResponse(response);
      });
    return true;
  }

  return undefined;
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

  if (itemId === 'tf-import-playlist') {
    const url = info.linkUrl || info.pageUrl || (tab && tab.url) || '';
    const playlistId = extractPlaylistId(url);
    if (!playlistId) {
      // list= 파라미터가 없는 일반 페이지에서 클릭한 경우 — 메뉴를 항상 보여주는 대신
      // 여기서 조용히 실패를 알린다(folder_ 핸들러의 videoId 미검출 처리와 동일한 방식).
      flashBadge('!', '#cc0000');
      return;
    }
    // 실제 fetch(인증 헤더 포함 이어받기)는 여기서 하지 않는다 — ShowFolderPromptMessage.playlistId
    // 주석 참고: background(서비스워커)의 오리진에서는 비공개 재생목록 이어받기가 403으로 거부됨을
    // 실측 확인해, content script(유튜브 페이지, 진짜 same-origin)에 id만 넘기고 fetch는 그쪽이 한다.
    const store = await load();
    sendPromptToTab(tab, {
      type: 'TF_SHOW_FOLDER_PROMPT',
      mode: 'import-playlist',
      parentId: store.rootId,
      playlistId,
      playlistKind: url.indexOf(MUSIC_HOST_MARKER) >= 0 ? 'music' : 'video'
    });
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
