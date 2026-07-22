// 동기화 백엔드 추상화 — 구글 드라이브를 먼저 구현하되(2026-07-22 산들 승인),
// 원드라이브(OneDrive approot) 등 다른 서비스를 어댑터 하나 추가로 붙일 수 있게 인터페이스를 고정한다.

import type { SyncSnapshot } from './merge';

export type SyncErrorCode =
  /** 로그인/동의 필요 또는 만료 — 재시도로 해결 안 됨, 사용자 재연결 필요 */
  | 'auth'
  /** 네트워크 불통(오프라인 포함) — 다음 주기 재시도로 해결될 수 있음 */
  | 'network'
  /** 서버가 오류 응답 — 재시도 대상 */
  | 'http'
  /** 이 실행 환경에서 백엔드 사용 불가(chrome.identity 없음 등) */
  | 'unavailable';

export class SyncError extends Error {
  code: SyncErrorCode;
  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SyncBackend {
  /** 이 실행 환경에서 사용 가능한지(확장 컨텍스트 여부 등) — 호출 부작용 없음 */
  available(): boolean;
  /** 대화형 OAuth 연결(사용자에게 계정 선택·동의 창이 뜸). 성공 시 이후 ensureAuth가 조용히 통과. */
  connect(): Promise<void>;
  /** 비대화형 인증 확인 — 연결돼 있지 않으면 SyncError('auth') */
  ensureAuth(): Promise<void>;
  /** 연결 해제(권한 회수 + 캐시 토큰 제거). 원격 데이터는 지우지 않는다. */
  disconnect(): Promise<void>;
  /** 원격 스냅샷 다운로드. 아직 파일이 없으면 null. */
  download(): Promise<SyncSnapshot | null>;
  upload(snapshot: SyncSnapshot): Promise<void>;
}
