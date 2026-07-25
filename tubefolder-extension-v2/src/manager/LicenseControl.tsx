// 유료화(1회 결제, ExtensionPay) 상태 배지 + 구매/복원 패널.
// CLAUDE.md 원칙 반영 지점:
//  - 유료화 메뉴는 초기 화면에 노출하지 않는다 = 툴바의 조용한 배지 하나로만 존재(SyncControl과 같은 자리·같은 톤)
//  - 외부 서비스 연동 UX: 켜지 않을 때 결과를 먼저 안내 → 외부(Stripe 결제) 페이지로 넘어가는 구간은
//    강조 박스로 표시 → 돌아왔을 때 상태 변화를 확인 팝업으로 고지
//  - 구매 복원(재설치 시 재결제 방지): 이메일로 로그인 링크를 받는 openLoginPage()를 그대로 노출

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCachedLicense, isLicenseConfigured, LicenseState } from '../license/licenseEngine';
import { isLicenseAvailable, openLoginPage, openPaymentPage, refreshLicenseFromManager } from '../license/licenseManager';

interface Props {
  /** 무료 한도에 걸렸을 때(App.tsx) 이 숫자를 증가시키면 패널이 강제로 열린다 */
  openSignal: number;
}

export default function LicenseControl({ openSignal }: Props) {
  const [state, setState] = useState<LicenseState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donePopup, setDonePopup] = useState(false);
  const pendingPurchase = useRef(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const s = await getCachedLicense();
    if (mounted.current) setState(s);
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  // App.tsx가 무료 한도 초과 안내에서 "업그레이드"를 눌렀을 때 패널을 강제로 연다
  useEffect(() => {
    if (openSignal > 0) setPanelOpen(true);
  }, [openSignal]);

  // 결제 페이지(새 탭)를 열고 돌아왔을 때 한 번만 온라인으로 재확인 — 매 포커스마다 확인하지 않는다
  // (CLAUDE.md "최초 1회+주기적 1회만 온라인 확인" 원칙)
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || !pendingPurchase.current) return;
      pendingPurchase.current = false;
      const before = state?.paid;
      const fresh = await refreshLicenseFromManager();
      if (mounted.current) setState(fresh);
      if (!before && fresh.paid) setDonePopup(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.paid]);

  if (!isLicenseAvailable()) return null; // PWA 등 미지원 컨텍스트에서는 조용히 숨김
  if (!state) return null;

  async function handleBuy() {
    setError(null);
    setBusy(true);
    try {
      pendingPurchase.current = true;
      await openPaymentPage();
    } catch (e) {
      pendingPurchase.current = false;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setError(null);
    setBusy(true);
    try {
      pendingPurchase.current = true;
      await openLoginPage();
    } catch (e) {
      pendingPurchase.current = false;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleManualRefresh() {
    setError(null);
    setBusy(true);
    try {
      const fresh = await refreshLicenseFromManager();
      setState(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const badgeText = state.paid ? '✨ PRO' : '무료';
  const badgeClass = state.paid ? 'tf-sync-badge-ok' : 'tf-sync-badge-idle';

  return (
    <div className="tf-sync">
      <button
        className={'tf-btn tf-sync-btn ' + badgeClass}
        onClick={() => setPanelOpen(true)}
        title={state.paid ? 'PRO 사용 중' : '무료 버전 — 눌러서 더 알아보기'}
      >
        {badgeText}
      </button>

      {panelOpen && (
        <div className="tf-sync-overlay" onClick={() => setPanelOpen(false)}>
          <div className="tf-sync-panel" onClick={(e) => e.stopPropagation()}>
            <h2>✨ 튜브폴더 PRO</h2>

            {!isLicenseConfigured() ? (
              <>
                <p className="tf-sync-desc">아직 결제 설정이 완료되지 않았습니다(개발자 준비 중).</p>
                <div className="tf-sync-actions">
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
              </>
            ) : state.paid ? (
              <>
                <p className="tf-sync-desc">
                  ✅ PRO 사용 중입니다.
                  {state.email ? ` (${state.email})` : ''}
                </p>
                <p className="tf-sync-fineprint">
                  폴더·영상 개수 제한 해제, 클라우드 동기화, 재생목록 대량 가져오기를 모두 사용할 수 있습니다.
                </p>
                {error && <div className="tf-error-banner">{error}</div>}
                <div className="tf-sync-actions">
                  <button className="tf-btn" onClick={handleManualRefresh} disabled={busy}>
                    {busy ? '확인 중...' : '상태 새로고침'}
                  </button>
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* 켜지 않을 경우의 결과를 먼저 안내 */}
                <p className="tf-sync-desc">
                  무료 버전은 폴더 20개·영상 500개까지, 재생목록은 한 번에 일부만 가져올 수 있습니다.
                  <br />
                  PRO로 업그레이드하면 폴더·영상 개수 제한이 없어지고, 클라우드 동기화·재생목록 전체 가져오기를 쓸 수
                  있습니다.
                </p>

                {/* 외부(Stripe 결제) 페이지로 넘어가는 구간 — 강조 박스 */}
                <div className="tf-sync-highlight">
                  <strong>구매하기를 누르면 결제 페이지(새 탭)가 열립니다.</strong>
                  <ol>
                    <li>1회 결제로 평생 사용할 수 있습니다(구독 아님).</li>
                    <li>결제가 끝나면 이 탭으로 돌아오세요 — 자동으로 PRO 상태가 반영됩니다.</li>
                  </ol>
                </div>

                {error && <div className="tf-error-banner">{error}</div>}

                <div className="tf-sync-actions">
                  <button className="tf-btn tf-btn-primary" onClick={handleBuy} disabled={busy}>
                    {busy ? '여는 중...' : '💳 구매하기'}
                  </button>
                  <button className="tf-btn" onClick={handleRestore} disabled={busy}>
                    이미 구매했어요(복원)
                  </button>
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
                <p className="tf-sync-fineprint">
                  다른 기기·재설치 후에도 결제할 때 쓴 이메일로 "복원"하면 다시 결제하지 않고 PRO 상태를 되살릴 수
                  있습니다.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {donePopup && (
        <div className="tf-sync-overlay tf-sync-overlay-top">
          <div className="tf-sync-popup">
            <h3>✨ PRO 활성화 완료</h3>
            <p>이제 폴더·영상 개수 제한 없이, 클라우드 동기화도 사용할 수 있습니다.</p>
            <button
              className="tf-btn tf-btn-primary"
              onClick={() => {
                setDonePopup(false);
                setPanelOpen(false);
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
