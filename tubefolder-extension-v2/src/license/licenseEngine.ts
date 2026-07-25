// 유료화(1회 결제, ExtensionPay) — 라이선스 상태 캐시.
// CLAUDE.md "유료화 대비 개발 원칙" 반영:
//  - 유료 검증은 최초 실행 시 1회 + 주기적 1회만 온라인 확인, 평상시는 이 캐시로 오프라인 사용 보장.
//  - 계정 구조는 이메일 기반(ExtensionPay 자체 제공, 별도 계정 시스템을 직접 구현하지 않음).
//
// 이 파일은 'extpay' 패키지를 import하지 않는다(중요) — extpay는 내부적으로 webextension-polyfill을
// 쓰는데, 이 폴리필은 브라우저 확장 컨텍스트가 아니면(즉 PWA 빌드에서) 모듈 로드 시점에 즉시 에러를
// 던진다. src/manager/App.tsx·LicenseControl.tsx는 확장 매니저와 PWA가 공유하는 번들이라, 여기서
// extpay를 정적 import하면 PWA 빌드 전체가 깨진다. 그래서 캐시 읽기/쓰기(순수 chrome.storage
// 접근, 항상 안전)만 이 파일에 두고, 실제 extpay 사용(getUser·openPaymentPage 등)은
// background.ts(정적 import, 확장 전용 번들이라 안전)와 licenseManager.ts(동적 import, 확장
// 컨텍스트일 때만 실행)로 분리한다.
//
// PWA(비확장) 컨텍스트에서는 아직 미지원 — "PWA에 결제 확인 붙이기"(별도 로드맵 항목) 이전까지는
// 항상 안전하게 "무료"로 취급한다(가짜 유료 상태를 만드는 것보다 안전한 기본값).

/** ExtensionPay 대시보드에서 확장을 등록하면 발급되는 식별자로 교체해야 함(README 'ExtensionPay 사용 준비' 참고).
 *  background.ts(정적 import)와 licenseManager.ts(동적 import) 양쪽이 같은 값을 쓰도록 여기 하나로 모은다. */
// 타입을 string으로 넓혀 둔다 — 리터럴 타입인 채로 두면 아래 isLicenseConfigured()의 비교식이
// "항상 참/거짓인 비교"로 오인돼 이 값을 실제 ID로 교체하는 순간 tsc 에러(TS2367)가 난다.
export const EXTPAY_EXTENSION_ID: string = 'REPLACE_ME_EXTPAY_EXTENSION_ID';

export function isLicenseConfigured(): boolean {
  return EXTPAY_EXTENSION_ID !== 'REPLACE_ME_EXTPAY_EXTENSION_ID';
}

export const LICENSE_STORAGE_KEY = 'tubefolder_license';
/** 주기적 재확인 간격 — 결제 상태는 자주 안 바뀌므로 데이터 동기화(15분)보다 훨씬 길게 잡는다 */
export const LICENSE_RECHECK_MS = 24 * 60 * 60 * 1000; // 24시간

export interface LicenseState {
  paid: boolean;
  email: string | null;
  paidAt: number | null;
  /** 마지막으로 온라인 확인을 시도한 시각(성공·실패 무관) */
  checkedAt: number;
  /** 마지막 온라인 확인이 실패했는지(오프라인 등) — 캐시는 유지하되 UI가 참고할 수 있게 남겨둠 */
  lastCheckFailed?: boolean;
}

export const FREE_LICENSE_STATE: LicenseState = { paid: false, email: null, paidAt: null, checkedAt: 0 };

export function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

/** 캐시만 읽는다(네트워크 호출 없음) — 폴더 생성 등 오프라인에서도 계속 동작해야 하는 경로에서 사용 */
export async function getCachedLicense(): Promise<LicenseState> {
  if (!hasChromeStorage()) return FREE_LICENSE_STATE;
  const o = await chrome.storage.local.get(LICENSE_STORAGE_KEY);
  return (o[LICENSE_STORAGE_KEY] as LicenseState) || FREE_LICENSE_STATE;
}

export async function isPaidCached(): Promise<boolean> {
  const s = await getCachedLicense();
  return s.paid;
}

export async function writeLicenseState(state: LicenseState): Promise<void> {
  if (!hasChromeStorage()) return;
  await chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: state });
}

/** 캐시가 없거나 재확인 주기가 지났는지 — background의 온라인 확인 트리거 조건으로 사용 */
export function needsRecheck(state: LicenseState): boolean {
  return !state.checkedAt || Date.now() - state.checkedAt > LICENSE_RECHECK_MS;
}

// ── 무료 티어 한도 (2026-07-21 유료화 정책 확정 그대로 채택) ─────────
export const FREE_FOLDER_LIMIT = 20;
export const FREE_VIDEO_LIMIT = 500;

export class LicenseLimitError extends Error {
  code: 'folder-limit' | 'video-limit' | 'sync-paid-only';
  constructor(code: 'folder-limit' | 'video-limit' | 'sync-paid-only', message: string) {
    super(message);
    this.code = code;
  }
}
