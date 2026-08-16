// 매니저 페이지(App.tsx·LicenseControl.tsx)에서 쓰는 Paddle 결제 진입점.
//
// (2026-07-30, ExtensionPay → Paddle 전환) Paddle Billing은 ExtensionPay의 getUser()처럼
// "지금 로그인된 사용자가 결제했는가"를 바로 물어볼 API·세션 개념이 없다. 대신 이메일을 기준으로
// server/paddle-webhook/(Cloudflare Worker)의 /check 엔드포인트를 조회해 결제 여부를 확인한다.
// 순수 fetch()라 chrome 전용 API가 필요 없어, extpay 시절 "동적 import로 확장 컨텍스트에서만
// 실행"하던 방어 코드가 더는 필요하지 않다(licenseEngine.ts 상단 주석 참고).

import {
  FREE_DISTRIBUTION_MODE,
  getCachedLicense,
  isLicenseConfigured,
  isLicenseKeyGranted,
  LicenseState,
  PADDLE_CHECKOUT_URL,
  PADDLE_VERIFY_ENDPOINT,
  verifyLicenseKey,
  writeLicenseState
} from './licenseEngine';

// (2026-08-17, "PWA에 결제 확인 붙이기") 예전엔 isExtensionContext()도 함께 요구해 PWA(일반 웹
// 컨텍스트)에서는 결제 확인 UI 자체가 숨겨졌다. Paddle 확인은 순수 fetch()라 확장 전용 API가 필요
// 없으므로(licenseEngine.ts 상단 주석 참고) 그 게이트를 제거 — 이제 "Paddle 설정 완료" 하나만
// 확인하면 확장·PWA 어느 쪽에서도 동일하게 동작한다.
export function isLicenseAvailable(): boolean {
  return isLicenseConfigured();
}

/** Paddle Worker의 /check?email=...을 조회해 결제 여부를 가져온다(네트워크 호출) */
async function fetchPaidStatus(email: string): Promise<{ paid: boolean; paidAt: number | null }> {
  const res = await fetch(`${PADDLE_VERIFY_ENDPOINT}?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`라이선스 조회 실패 (${res.status})`);
  const data = (await res.json()) as { paid?: boolean; paidAt?: number };
  return { paid: !!data.paid, paidAt: data.paidAt ?? null };
}

/**
 * 온라인 확인(네트워크 호출) — 결제 완료 직후나 사용자가 명시적으로 새로고침을 눌렀을 때만 호출할 것.
 * email을 넘기지 않으면 캐시에 저장된 이메일(과거에 구매·복원한 적 있는 경우)을 대신 쓴다 —
 * 둘 다 없으면(한 번도 구매·복원 시도를 안 한 상태) 조회할 대상이 없으므로 캐시를 그대로 반환한다.
 */
export async function refreshLicenseFromManager(email?: string): Promise<LicenseState> {
  // 무료 전환 모드에서는 실제 결제 서버 조회가 무의미하므로(어차피 항상 "유료"로 응답),
  // 네트워크 호출 없이 바로 그 오버라이드 상태를 반환한다.
  if (FREE_DISTRIBUTION_MODE) return getCachedLicense();
  const cached = await getCachedLicense();
  // 승인 기반 무료 라이선스는 Paddle이 알지 못하는 상태(실제 결제 기록 없음)라, 그대로 온라인
  // 재확인을 돌리면 "결제 없음"으로 오인해 무료로 되돌려버린다 — 영구 자격증명이라 재확인에서 제외.
  if (isLicenseKeyGranted(cached)) return cached;
  if (!isLicenseAvailable()) return cached;

  const targetEmail = email || cached.email;
  if (!targetEmail) return cached;

  try {
    const { paid, paidAt } = await fetchPaidStatus(targetEmail);
    const state: LicenseState = {
      paid,
      email: targetEmail,
      paidAt,
      checkedAt: Date.now(),
      lastCheckFailed: false,
      source: 'paddle'
    };
    await writeLicenseState(state);
    return state;
  } catch {
    return { ...cached, lastCheckFailed: true };
  }
}

/** 결제 페이지(Paddle Hosted Checkout)를 새 탭으로 연다 */
export async function openPaymentPage(email: string): Promise<void> {
  const url = `${PADDLE_CHECKOUT_URL}?user_email=${encodeURIComponent(email)}`;
  window.open(url, '_blank');
}

/** 구매 복원 — 이미 결제에 쓴 이메일로 상태를 다시 조회해 다른 기기/재설치 후 유료 상태를 되살린다.
 *  ExtensionPay의 매직링크 로그인과 달리 새 탭으로 나가지 않고 이메일 입력만으로 즉시 확인한다. */
export async function restoreByEmail(email: string): Promise<LicenseState> {
  return refreshLicenseFromManager(email);
}

/**
 * 승인 기반 무료 라이선스 활성화 — 키+이메일이 approvedLicenses.ts 화이트리스트와 일치하면 즉시
 * paid:true로 저장한다(네트워크 호출 없음, Paddle 미사용). 결제와 마찬가지로 저장 구조
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
