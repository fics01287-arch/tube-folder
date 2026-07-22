// 구글 드라이브 appDataFolder 백엔드.
// - 저장 위치: appDataFolder(앱 전용 숨김 영역) — 사용자 드라이브 화면에 보이지 않고,
//   drive.appdata 스코프는 구글 분류상 "비민감"이라 기본 심사만 필요(CLAUDE.md 동기화 원칙의 기본값).
// - 인증: chrome.identity.getAuthToken — manifest oauth2 블록(클라이언트 ID·스코프) 기반으로
//   크롬이 토큰 발급·캐시·자동 갱신을 전부 대행하므로 리프레시 토큰을 직접 저장·관리하지 않는다.
//   (구글 전용·크롬 브라우저 전용 API. 원드라이브를 붙일 땐 launchWebAuthFlow로 별도 어댑터 필요 — 보류 중)

import type { SyncSnapshot } from './merge';
import { SyncBackend, SyncError } from './backend';

const FILE_NAME = 'tubefolder-data.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

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

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new SyncError('network', '네트워크에 연결할 수 없습니다.');
  }
  return res;
}

export class GoogleDriveBackend implements SyncBackend {
  private fileId: string | null = null;

  available(): boolean {
    return hasIdentity();
  }

  async connect(): Promise<void> {
    await getToken(true);
  }

  async ensureAuth(): Promise<void> {
    await getToken(false);
  }

  async disconnect(): Promise<void> {
    try {
      const token = await getToken(false);
      // 부여된 권한 자체를 회수(best effort) — 실패해도 캐시 토큰 제거만으로 이 확장에서는 로그아웃 상태가 된다
      try {
        await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + encodeURIComponent(token));
      } catch {
        // 오프라인 등 — 무시
      }
      await removeCachedToken(token);
    } catch {
      // 이미 미연결 상태 — 할 일 없음
    }
    this.fileId = null;
  }

  /** 토큰 만료로 인한 401은 캐시 토큰을 지우고 한 번만 재시도(크롬이 새 토큰을 발급) */
  private async withAuth<T>(fn: (token: string) => Promise<{ res: Response; parse: () => Promise<T> }>): Promise<T> {
    let token = await getToken(false);
    let { res, parse } = await fn(token);
    if (res.status === 401) {
      await removeCachedToken(token);
      token = await getToken(false);
      ({ res, parse } = await fn(token));
    }
    if (res.status === 401 || res.status === 403) {
      throw new SyncError('auth', '구글 드라이브 접근 권한이 만료되었습니다. 다시 연결해 주세요.');
    }
    if (!res.ok) {
      throw new SyncError('http', `구글 드라이브 응답 오류 (HTTP ${res.status})`);
    }
    return parse();
  }

  private async findFileId(): Promise<string | null> {
    if (this.fileId) return this.fileId;
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const data = await this.withAuth<{ files?: { id: string }[] }>(async (token) => {
      const res = await driveFetch(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)`, token);
      return { res, parse: () => res.json() };
    });
    this.fileId = data.files && data.files.length > 0 ? data.files[0].id : null;
    return this.fileId;
  }

  async download(): Promise<SyncSnapshot | null> {
    const id = await this.findFileId();
    if (!id) return null;
    try {
      return await this.withAuth<SyncSnapshot>(async (token) => {
        const res = await driveFetch(`${API}/files/${id}?alt=media`, token);
        return { res, parse: () => res.json() };
      });
    } catch (e) {
      // 파일이 그 사이 사라진 경우(404) — 캐시된 id를 버리고 "원격 없음"으로 처리
      if (e instanceof SyncError && e.code === 'http') {
        this.fileId = null;
        const retry = await this.findFileId();
        if (!retry) return null;
      }
      throw e;
    }
  }

  async upload(snapshot: SyncSnapshot): Promise<void> {
    const body = JSON.stringify(snapshot);
    const id = await this.findFileId();
    if (id) {
      await this.withAuth<unknown>(async (token) => {
        const res = await driveFetch(`${UPLOAD_API}/files/${id}?uploadType=media`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        return { res, parse: () => res.json() };
      });
      return;
    }
    // 최초 업로드 — 메타데이터(appDataFolder 소속)와 내용을 multipart로 함께 생성
    const boundary = 'tf_boundary_' + Date.now().toString(36);
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      body +
      `\r\n--${boundary}--`;
    const created = await this.withAuth<{ id?: string }>(async (token) => {
      const res = await driveFetch(`${UPLOAD_API}/files?uploadType=multipart`, token, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart
      });
      return { res, parse: () => res.json() };
    });
    if (created.id) this.fileId = created.id;
  }
}
