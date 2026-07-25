// Google Identity Services(GIS, https://accounts.google.com/gsi/client) 최소 타입 선언.
// 공식 @types 패키지가 없고, PWA 동기화 하나만을 위해 신규 의존성을 추가하지 않기 위해
// 실제 사용하는 부분(initTokenClient·requestAccessToken·revoke)만 직접 선언한다.
// 이 파일은 import/export가 없는 순수 앰비언트 선언이라 자동으로 전역 스코프에 적용된다.

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number;
    error?: string;
    error_description?: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
  }

  interface TokenClient {
    requestAccessToken(overrideConfig?: { prompt?: string }): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(accessToken: string, done?: () => void): void;
}

interface Window {
  google?: typeof google;
}
