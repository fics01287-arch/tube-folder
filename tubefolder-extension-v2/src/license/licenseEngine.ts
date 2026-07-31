// 유료화(1회 결제, Paddle) — 라이선스 상태 캐시.
// CLAUDE.md "유료화 대비 개발 원칙" 반영:
//  - 유료 검증은 최초 실행 시 1회 + 주기적 1회만 온라인 확인, 평상시는 이 캐시로 오프라인 사용 보장.
//  - 계정 구조는 이메일 기반.
//
// (2026-07-30, ExtensionPay → Paddle 전환) 개발자(산들) 소재국이 Stripe 비지원국이라 ExtensionPay를
// 더 쓸 수 없어, Merchant of Record이며 한국 판매자를 지원하는 Paddle로 교체했다. 다만 Paddle
// Billing은 ExtensionPay의 getUser()처럼 클라이언트에서 바로 호출 가능한 "결제 여부 조회" API가 없고
// 웹훅(webhook)으로만 결제 완료를 통지한다 — 그래서 그 웹훅을 대신 받아 이메일→결제여부를 저장해두는
// 별도 서버(Cloudflare Worker, server/paddle-webhook/) 하나가 새로 필요해졌다(자세한 배경·구조는
// ROADMAP-CHECKLIST.md "결제 연동 구현" 항목 참고).
//
// 이 확인 방식은 순수 fetch()라 extpay의 webextension-polyfill 문제(확장 전용 API라 PWA에서
// 모듈 로드 시점에 크래시)가 애초에 없다 — 그래서 background.ts(정적 import)·licenseManager.ts
// (동적 import)로 나눴던 예전 구조가 더는 필요하지 않다. 다만 PWA 결제 지원 자체는 여전히 별도
// 로드맵 항목이라(가격 확정 여부와 무관하게 UI 노출 여부는 별개 결정), 이번에는 구조적 걸림돌만
// 제거해두고 isExtensionContext() 게이트는 그대로 유지한다.

import { APPROVED_LICENSES } from './approvedLicenses';

/**
 * 유료→무료 전환 스위치 (CLAUDE.md "유료→무료 전환 대비 원칙" 반영, 2026-07-27 산들 요청).
 * 이 앱은 유료 판매 목적으로 개발됐지만, 산들이 이후 언제든 "무료로 배포하기"로 결정할 수 있다.
 * 이 값을 true로 바꾸고 재빌드·재배포하면 Paddle 결제 여부와 무관하게 전체 사용자가
 * 모든 기능(폴더·영상 개수 제한 해제, 클라우드 동기화 등)을 무료로 쓸 수 있게 된다.
 * 아래 getCachedLicense() 한 곳만 바꾸면 되도록 설계해, 무료 전환이 특정 파일 하나만 고치면
 * 끝나는 결정으로 남게 했다(코드 곳곳을 뒤져 조건을 하나씩 지울 필요 없음).
 * 주의: 빌드 시점 상수라 이미 설치된 사용자에게는 새 버전을 배포(업데이트)해야 반영된다 —
 * 이미 설치된 확장에 즉시 반영되는 "실시간 스위치"가 필요하면 별도 설계(원격 설정 파일 등)가
 * 필요하며, 그 경우 새로운 네트워크 호출·보안 검토가 추가로 필요하므로 별도 승인 후 진행한다.
 */
export const FREE_DISTRIBUTION_MODE = false;

/** Paddle 대시보드에서 만든 호스티드 체크아웃 링크(가격이 이미 연결된 상태)로 교체해야 함
 *  (README 'Paddle 사용 준비' 참고). 여기에 구매자 이메일을 ?user_email= 쿼리로 붙여서 연다. */
// 타입을 string으로 넓혀 둔다 — 리터럴 타입인 채로 두면 아래 isLicenseConfigured()의 비교식이
// "항상 참/거짓인 비교"로 오인돼 이 값을 실제 URL로 교체하는 순간 tsc 에러(TS2367)가 난다.
export const PADDLE_CHECKOUT_URL: string = 'REPLACE_ME_PADDLE_CHECKOUT_URL';

/** server/paddle-webhook/ Cloudflare Worker의 /check 엔드포인트 전체 URL로 교체해야 함. */
export const PADDLE_VERIFY_ENDPOINT: string = 'REPLACE_ME_PADDLE_VERIFY_ENDPOINT';

export function isLicenseConfigured(): boolean {
  return PADDLE_CHECKOUT_URL !== 'REPLACE_ME_PADDLE_CHECKOUT_URL' && PADDLE_VERIFY_ENDPOINT !== 'REPLACE_ME_PADDLE_VERIFY_ENDPOINT';
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
  /**
   * paid=true의 근거. 'paddle'=실제 결제 확인(Paddle), 'license-key'=승인 기반 무료 라이선스
   * (3단계 "승인 기반 무료 라이선스 구현", approvedLicenses.ts 화이트리스트 검증 통과).
   * 기존 데이터엔 없던 필드라 optional — 없으면 'paddle'로 간주(하위호환). 스토어 노드 스키마가 아니라
   * 별도 storage 키(LICENSE_STORAGE_KEY)의 값이라 DATA_VERSION 마이그레이션과 무관하게 optional 추가만으로 충분.
   */
  source?: 'paddle' | 'license-key';
}

export const FREE_LICENSE_STATE: LicenseState = { paid: false, email: null, paidAt: null, checkedAt: 0 };

export function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

/** 무료 전환 모드일 때 모든 조회가 공통으로 받는 "항상 유료" 상태 — 실제 결제 여부·이메일과 무관 */
const FREE_DISTRIBUTION_STATE: LicenseState = { paid: true, email: null, paidAt: null, checkedAt: 0 };

/** 캐시만 읽는다(네트워크 호출 없음) — 폴더 생성 등 오프라인에서도 계속 동작해야 하는 경로에서 사용 */
export async function getCachedLicense(): Promise<LicenseState> {
  if (FREE_DISTRIBUTION_MODE) return FREE_DISTRIBUTION_STATE;
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

/**
 * 승인 기반 무료 라이선스로 활성화된 상태인지 — true면 온라인 재확인(Paddle 조회) 대상에서
 * 제외해야 한다. 이런 상태는 실제 결제 기록이 없어 Paddle 웹훅이 발급한 기록이 없으므로,
 * 그대로 주기적 재확인을 돌리면 승인 무료 사용자가 24시간마다 무료로 되돌아가 버린다(로드맵의
 * "재사용 가능한... 영구 자격증명" 요구사항과 상충) — licenseManager.ts·background.ts가 이 함수로
 * 재확인 전 먼저 걸러낸다.
 */
export function isLicenseKeyGranted(state: LicenseState): boolean {
  return state.paid && state.source === 'license-key';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 라이선스 키+이메일 조합이 approvedLicenses.ts 화이트리스트와 정확히 일치하는지 확인.
 * 순수 함수(네트워크·chrome API 없음) — 확장·PWA 어느 컨텍스트에서도 안전하게 호출 가능.
 * 키는 앞뒤 공백만 트리밍해 비교(대소문자 구분), 이메일은 대소문자 구분 없이 비교.
 */
export function verifyLicenseKey(key: string, email: string): boolean {
  const trimmedKey = key.trim();
  const normalizedEmail = normalizeEmail(email);
  if (!trimmedKey || !normalizedEmail) return false;
  return APPROVED_LICENSES.some((entry) => entry.key === trimmedKey && normalizeEmail(entry.email) === normalizedEmail);
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
