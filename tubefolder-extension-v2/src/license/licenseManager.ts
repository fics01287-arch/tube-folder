// 매니저 페이지(App.tsx·LicenseControl.tsx)에서 쓰는 ExtensionPay 진입점.
// 'extpay'는 여기서만 "동적" import한다 — src/manager는 확장·PWA 공용 번들이라, 정적 import를 쓰면
// PWA에서 모듈 로드 시점에 크래시한다(licenseEngine.ts 상단 주석 참고). isExtensionContext()가
// true일 때만 실제로 import()가 실행되므로 PWA에서는 이 코드 자체가 아예 실행되지 않는다.

import type ExtPayDefault from 'extpay';
import {
  EXTPAY_EXTENSION_ID,
  FREE_LICENSE_STATE,
  isExtensionContext,
  isLicenseConfigured,
  LicenseState,
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
