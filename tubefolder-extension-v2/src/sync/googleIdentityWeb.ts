// PWA(독립 웹페이지) 전용 구글 로그인 — Google Identity Services(GIS) 토큰 클라이언트.
// chrome.identity는 확장 컨텍스트에서만 존재하므로, 같은 GCP 프로젝트에서 별도 발급한
// "웹 애플리케이션" 유형 OAuth 클라이언트 ID로 GIS 토큰 클라이언트를 직접 띄운다.
//
// - 크롬 확장과 달리 리프레시 토큰을 자동 관리해 주지 않는다: 액세스 토큰은 메모리에만 캐시하고,
//   만료되면 prompt:''(무동의창) 비대화형 재요청을 먼저 시도한다 — 사용자가 같은 브라우저에
//   구글 로그인 상태를 유지 중이면 대부분 조용히 갱신되고, 세션이 끊겼으면 SyncError('auth')로
//   실패해 UI가 "다시 연결" 흐름을 그대로 재사용한다(googleDrive.ts와 동일한 계약).
// - WEB_CLIENT_ID는 산들이 Google Cloud Console에서 "웹 애플리케이션" 클라이언트를 새로 발급한 뒤
//   교체해야 하는 값이다(확장용 클라이언트 ID와는 다른 별도 값). 미교체 상태에서는 available()이
//   false를 반환해 안전하게 "이 환경에서 사용 불가"로만 처리되고 에러를 던지지 않는다.

import { SyncError } from './backend';

// 타입을 string으로 넓혀 둔다 — 리터럴 타입으로 남으면 아래 REPLACE_ME 비교식이 "항상 참/거짓인
// 비교"로 오인돼 tsc가 에러를 낸다(TS2367). 이 값을 나중에 다시 바꿀 일이 있어도 안전하게 유지된다.
export const WEB_CLIENT_ID: string = '864997495294-804fbu1v7kb49p0jqu3hrc8bn90mdjs5.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
/** 만료 30초 전부터는 캐시를 쓰지 않고 미리 갱신 시도 */
const EXPIRY_SAFETY_MS = 30 * 1000;

export function isGisConfigured(): boolean {
  return typeof window !== 'undefined' && WEB_CLIENT_ID !== 'REPLACE_ME_WEB_OAUTH_CLIENT_ID';
}

let gisLoadPromise: Promise<void> | null = null;
/**
 * 페이지가 뜨자마자(사용자가 "연결" 버튼을 누르기 전에) 미리 스크립트를 불러온다.
 * 버튼 클릭 시점에 그제서야 네트워크로 로드하면, 로딩이 끝날 때까지의 시간차 때문에 모바일
 * 브라우저가 뒤이은 requestAccessToken()의 로그인 창을 "사용자가 직접 연 것"으로 인정하지 않고
 * 팝업을 막아버릴 수 있다(실제로 관찰된 증상: 로그인 창 대신 엉뚱한 페이지가 뜸). 미리 불러와
 * 캐시해두면 클릭 시점엔 즉시(동기에 가깝게) 진행되어 이 문제를 피할 수 있다.
 */
export function preloadGis(): void {
  if (isGisConfigured()) loadGis().catch(() => {});
}

function loadGis(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoadPromise) {
    gisLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('GIS 스크립트 로드 실패')));
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('GIS 스크립트 로드 실패'));
      document.head.appendChild(script);
    });
  }
  return gisLoadPromise;
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function ensureTokenClient(
  onToken: (resp: google.accounts.oauth2.TokenResponse) => void,
  onError: (err: { type: string; message?: string }) => void
): google.accounts.oauth2.TokenClient {
  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: WEB_CLIENT_ID,
      scope: SCOPE,
      callback: () => {
        /* requestAccessToken 시점마다 아래에서 콜백을 갈아끼운다(요청별 Promise 연결) */
      },
      error_callback: () => {
        /* 위와 동일 */
      }
    });
  }
  // GIS는 콜백을 initTokenClient 시점에 한 번만 등록하는 구조가 아니라, 매 요청 전에
  // callback/error_callback을 원하는 함수로 바꿔 끼워도 동작한다(공식 예제 패턴).
  (tokenClient as unknown as { callback: typeof onToken }).callback = onToken;
  (tokenClient as unknown as { error_callback: typeof onError }).error_callback = onError;
  return tokenClient;
}

export function getWebToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isGisConfigured()) {
      reject(new SyncError('unavailable', '이 PWA 빌드에는 아직 구글 웹 로그인이 설정되지 않았습니다.'));
      return;
    }
    if (cachedToken && cachedToken.expiresAt - EXPIRY_SAFETY_MS > Date.now()) {
      resolve(cachedToken.token);
      return;
    }
    loadGis()
      .then(() => {
        const client = ensureTokenClient(
          (resp) => {
            if (resp.error) {
              reject(new SyncError('auth', resp.error_description || '구글 계정 인증이 필요합니다.'));
              return;
            }
            cachedToken = { token: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 };
            resolve(resp.access_token);
          },
          (err) => reject(new SyncError('auth', err.message || '구글 계정 인증이 필요합니다.'))
        );
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      })
      .catch(() => reject(new SyncError('network', '구글 로그인 스크립트를 불러올 수 없습니다.')));
  });
}

export function invalidateWebToken(token: string): void {
  if (cachedToken && cachedToken.token === token) cachedToken = null;
}

export function revokeWebToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (!isGisConfigured() || !window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    try {
      window.google.accounts.oauth2.revoke(token, () => resolve());
    } catch {
      resolve();
    }
  });
}
