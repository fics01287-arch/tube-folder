// 구글 드라이브 appDataFolder 백엔드 — 크롬 확장 컨텍스트(chrome.identity) 전용.
// - 저장 위치: appDataFolder(앱 전용 숨김 영역) — 사용자 드라이브 화면에 보이지 않고,
//   drive.appdata 스코프는 구글 분류상 "비민감"이라 기본 심사만 필요(CLAUDE.md 동기화 원칙의 기본값).
// - 인증: chrome.identity.getAuthToken — manifest oauth2 블록(클라이언트 ID·스코프) 기반으로
//   크롬이 토큰 발급·캐시·자동 갱신을 전부 대행하므로 리프레시 토큰을 직접 저장·관리하지 않는다.
//   (구글 전용·크롬 브라우저 전용 API. PWA에서는 googleDriveWeb.ts(GIS)가 대신 담당 — 3단계
//   "PWA에 동기화 붙이기"에서 분리. 원드라이브를 붙일 땐 launchWebAuthFlow로 별도 어댑터 필요 — 보류 중)
// - REST 호출(파일 찾기·업로드·다운로드·401 재시도) 자체는 driveBackendBase.ts에 공용화돼 있다.

import { SyncError } from './backend';
import { DriveBackendBase } from './driveBackendBase';

function hasIdentity(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.identity && !!chrome.identity.getAuthToken;
}

function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!hasIdentity()) {
      reject(new SyncError('unavailable', '이 환경에서는 구글 로그인(chrome.identity)을 사용할 수 없습니다.'));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(new SyncError('auth', err?.message || '구글 계정 인증이 필요합니다.'));
        return;
      }
      resolve(typeof token === 'string' ? token : (token as { token?: string }).token || '');
    });
  });
}

function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (!hasIdentity() || !chrome.identity.removeCachedAuthToken) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => {
      void chrome.runtime.lastError; // 이미 제거된 토큰 등 — 무시
      resolve();
    });
  });
}

export class GoogleDriveBackend extends DriveBackendBase {
  available(): boolean {
    return hasIdentity();
  }

  protected getToken(interactive: boolean): Promise<string> {
    return getToken(interactive);
  }

  protected invalidateToken(token: string): Promise<void> {
    return removeCachedToken(token);
  }

  protected async revokeToken(token: string): Promise<void> {
    // 부여된 권한 자체를 회수(best effort) — 실패해도 캐시 토큰 제거만으로 이 확장에서는 로그아웃 상태가 된다
    try {
      await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + encodeURIComponent(token));
    } catch {
      // 오프라인 등 — 무시
    }
  }
}
