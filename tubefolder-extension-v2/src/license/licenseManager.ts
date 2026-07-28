// 매니저 페이지(App.tsx·LicenseControl.tsx)에서 쓰는 ExtensionPay 진입점.
// 'extpay'는 여기서만 "동적" import한다 — src/manager는 확장·PWA 공용 번들이라, 정적 import를 쓰면
// PWA에서 모듈 로드 시점에 크래시한다(licenseEngine.ts 상단 주석 참고). isExtensionContext()가
// true일 때만 실제로 import()가 실행되므로 PWA에서는 이 코드 자체가 아예 실행되지 않는다.

import type ExtPayDefault from 'extpay';
import {
  EXTPAY_EXTENSION_ID,
  FREE_DISTRIBUTION_MODE,
  FREE_LICENSE_STATE,
  getCachedLicense,
  isExtensionContext,
  isLicenseConfigured,
  isLicenseKeyGranted,
  LicenseState,
  verifyLicenseKey,
  writeLicenseState
} from './licenseEngine';

export function isLicenseAvailable(): boolean {
  return isExtensionContext() && isLicenseConfigured();
}

type ExtPayInstance = ReturnType<typeof ExtPayDefault>;
let instance: ExtPayInstance | null = null;

async function getInstance(): Promise<ExtPayInstance> {
  if (!instance) {
    const { default: ExtPay } = await import('extpay');
    instance = ExtPay(EXTPAY_EXTENSION_ID);
  }
  return instance;
}

/** 온라인 확인(네트워크 호출) — 결제 완료 직후나 사용자가 명시적으로 새로고침을 눌렀을 때만 호출할 것 */
export async function refreshLicenseFromManager(): Promise<LicenseState> {
  // 무료 전환 모드에서는 실제 결제 서버 조회가 무의미하므로(어차피 항상 "유료"로 응답),
  // 네트워크 호출 없이 바로 그 오버라이드 상태를 반환한다.
  if (FREE_DISTRIBUTION_MODE) return getCachedLicense();
  const cached = await getCachedLicense();
  // 승인 기반 무료 라이선스는 ExtensionPay가 알지 못하는 상태(실제 결제 기록 없음)라, 그대로 온라인
  // 재확인을 돌리면 "결제 없음"으로 오인해 무료로 되돌려버린다 — 영구 자격증명이라 재확인에서 제외.
  if (isLicenseKeyGranted(cached)) return cached;
  if (!isLicenseAvailable()) return FREE_LICENSE_STATE;
  try {
    const extpay = await getInstance();
    const user = await extpay.getUser();
    const state: LicenseState = {
      paid: !!user.paid,
      email: user.email || null,
      paidAt: user.paidAt ? user.paidAt.getTime() : null,
      checkedAt: Date.now(),
      lastCheckFailed: false
    };
    await writeLicenseState(state);
    return state;
  } catch {
    return FREE_LICENSE_STATE;
  }
}

/** 결제 페이지를 새 탭으로 연다(Stripe Checkout) */
export async function openPaymentPage(): Promise<void> {
  const extpay = await getInstance();
  await extpay.openPaymentPage();
}

/** 구매 복원 — 이미 결제한 이메일로 로그인 링크를 받아 다른 기기/재설치 후 유료 상태를 되살린다 */
export async function openLoginPage(): Promise<void> {
  const extpay = await getInstance();
  await extpay.openLoginPage();
}

/**
 * 승인 기반 무료 라이선스 활성화 — 키+이메일이 approvedLicenses.ts 화이트리스트와 일치하면 즉시
 * paid:true로 저장한다(네트워크 호출 없음, ExtensionPay 미사용). 결제와 마찬가지로 저장 구조
 * (LICENSE_STORAGE_KEY)를 그대로 재사용하되 근거만 source:'license-key'로 다르게 남겨,
 * 이후 온라인 재확인(refreshLicenseFromManager)이 이 상태를 되돌리지 않도록 한다.
 */
export async function redeemLicenseKey(key: string, email: string): Promise<{ ok: boolean; state: LicenseState }> {
  if (!verifyLicenseKey(key, email)) {
    return { ok: false, state: await getCachedLicense() };
  }
  const state: LicenseState = {
    paid: true,
    email: email.trim(),
    paidAt: Date.now(),
    checkedAt: Date.now(),
    lastCheckFailed: false,
    source: 'license-key'
  };
  await writeLicenseState(state);
  return { ok: true, state };
}
