// 구글 드라이브 appDataFolder REST 호출의 공용 로직(토큰 발급 방식과 무관).
// - 크롬 확장(chrome.identity)과 PWA(GIS 웹 로그인) 두 경로가 "토큰을 어떻게 받는가"만 다르고
//   "받은 토큰으로 무엇을 하는가"(파일 찾기·업로드·다운로드·401 재시도)는 완전히 동일하므로 이 파일에 모은다.
// - 하위 클래스는 getToken/invalidateToken/revokeToken 3개만 구현하면 된다.

import type { SyncSnapshot } from './merge';
import { SyncBackend, SyncError } from './backend';

const FILE_NAME = 'tubefolder-data.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

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

export abstract class DriveBackendBase implements SyncBackend {
  private fileId: string | null = null;

  abstract available(): boolean;
  /** 토큰 발급(대화형/비대화형) — 구현체가 chrome.identity 또는 GIS 등으로 처리 */
  protected abstract getToken(interactive: boolean): Promise<string>;
  /** 캐시된 토큰을 버려서 다음 getToken(false)이 새 토큰을 받게 함 */
  protected abstract invalidateToken(token: string): Promise<void>;
  /** 부여된 권한 자체 회수(best effort). 실패해도 무시하고 진행 */
  protected abstract revokeToken(token: string): Promise<void>;

  async connect(): Promise<void> {
    await this.getToken(true);
  }

  async ensureAuth(): Promise<void> {
    await this.getToken(false);
  }

  async disconnect(): Promise<void> {
    try {
      const token = await this.getToken(false);
      try {
        await this.revokeToken(token);
      } catch {
        // 오프라인 등 — 무시
      }
      await this.invalidateToken(token);
    } catch {
      // 이미 미연결 상태 — 할 일 없음
    }
    this.fileId = null;
  }

  /** 토큰 만료로 인한 401은 캐시 토큰을 지우고 한 번만 재시도 */
  private async withAuth<T>(fn: (token: string) => Promise<{ res: Response; parse: () => Promise<T> }>): Promise<T> {
    let token = await this.getToken(false);
    let { res, parse } = await fn(token);
    if (res.status === 401) {
      await this.invalidateToken(token);
      token = await this.getToken(false);
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
