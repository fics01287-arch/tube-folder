// background ↔ content 메시징 프로토콜.
// 폴더 추가·이름변경·삭제는 UI(입력창)가 유튜브 페이지 위에 떠야 하므로, 실제 DOM을 가진
// content script에서만 렌더링 가능 — background는 "무엇을 물어볼지"만 지시하고,
// 저장소 반영은 content script가 storage 계층을 직접 호출해서 처리한다(둘 다 접근 가능).

import type { PlaylistVideo } from '../storage/playlistImport';
import type { YoutubeApiErrorCode } from '../storage/youtubeDataApi';

export type FolderPromptMode = 'new-folder' | 'rename-folder' | 'delete-folder' | 'import-playlist';

export interface ShowFolderPromptMessage {
  type: 'TF_SHOW_FOLDER_PROMPT';
  mode: FolderPromptMode;
  /** new-folder/import-playlist일 때: 생성될 부모 폴더 id */
  parentId?: string;
  /** rename-folder/delete-folder일 때: 대상 폴더 id */
  folderId?: string;
  /** rename-folder일 때: 입력창 초기값으로 쓸 현재 이름 */
  folderName?: string;
  /** import-playlist일 때: 가져올 재생목록 id. 2026-09-07에 실제 계정으로 직접 검증한 결과, 비공개
   * 재생목록의 이어받기(browse API) 호출은 실제 유튜브 페이지와 동일한 오리진(https://www.youtube.com)
   * 에서 나가야만 인증 헤더(SAPISIDHASH)가 서버에 받아들여짐 — background(서비스워커)의 실제 오리진은
   * chrome-extension://...라 서비스워커에서 이 fetch를 하면 403으로 거부됨을 실측으로 확인했다. 그래서
   * 실제 fetch는 background가 아니라 이 메시지를 받는 content script(유튜브 페이지 컨텍스트, 진짜
   * same-origin)가 하도록 구조를 바꿨다 — background는 재생목록 id만 넘기고, 인증된 fetch
   * (playlistImport.ts의 fetchPlaylistWithAuth)는 content.ts가 직접 호출한다. */
  playlistId?: string;
  /** import-playlist일 때: 재생목록이 유튜브 뮤직 소스인지(영상 kind 결정용) */
  playlistKind?: 'video' | 'music';
}

export interface FlashBadgeMessage {
  type: 'TF_FLASH_BADGE';
  text: string;
  color: string;
}

/** background → content: 유튜브 페이지에서 한 동작(예: "이 동영상만 폴더에 추가")이 무료 버전
 * 한도(LicenseLimitError)에 걸렸을 때, 배지만 깜빡이고 끝내는 대신 이유를 알려주는 미니 팝업을
 * 띄우라는 지시(2026-09-10, "배지만 뜨고 안내가 없다" 제보로 신설 — 매니저 탭의 LicenseLimitNotice.tsx
 * 팝업과 같은 취지). message는 LicenseLimitError.message를 그대로 담는다. */
export interface ShowLicenseLimitMessage {
  type: 'TF_SHOW_LICENSE_LIMIT';
  message: string;
}

/** content → background: 미니 팝업의 "PRO 알아보기" 버튼 클릭 — content script는 chrome.tabs에
 * 접근할 수 없어(권한 자체가 없음), 매니저 탭을 열고 포커스하는 실제 동작은 background(이미
 * openManager() 보유)에 위임한다. */
export interface OpenManagerMessage {
  type: 'TF_OPEN_MANAGER';
}

/** content → background: 공식 YouTube Data API로 재생목록을 가져와 달라는 요청(2026-09-08 신설).
 * chrome.identity가 콘텐츠 스크립트에 없어 background(서비스워커)에게 실제 fetch를 위임한다 —
 * youtubeDataApi.ts 상단 주석 참고. */
export interface FetchPlaylistDataApiMessage {
  type: 'TF_FETCH_PLAYLIST_DATA_API';
  playlistId: string;
}

export type FetchPlaylistDataApiResponse =
  | { ok: true; title: string; videos: PlaylistVideo[] }
  | { ok: false; code: YoutubeApiErrorCode; message: string };

export type BackgroundToContentMessage = ShowFolderPromptMessage | ShowLicenseLimitMessage;
export type ContentToBackgroundMessage = FlashBadgeMessage | FetchPlaylistDataApiMessage | OpenManagerMessage;
