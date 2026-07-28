// 유료화(1회 결제, ExtensionPay) 상태 배지 + 구매/복원 패널.
// CLAUDE.md 원칙 반영 지점:
//  - 유료화 메뉴는 초기 화면에 노출하지 않는다 = 툴바의 조용한 배지 하나로만 존재(SyncControl과 같은 자리·같은 톤)
//  - 외부 서비스 연동 UX: 켜지 않을 때 결과를 먼저 안내 → 외부(Stripe 결제) 페이지로 넘어가는 구간은
//    강조 박스로 표시 → 돌아왔을 때 상태 변화를 확인 팝업으로 고지
//  - 구매 복원(재설치 시 재결제 방지): 이메일로 로그인 링크를 받는 openLoginPage()를 그대로 노출

import { useCallback, useEffect, useRef, useState } from 'react';
import { FREE_DISTRIBUTION_MODE, getCachedLicense, isLicenseConfigured, LicenseState } from '../license/licenseEngine';
import {
  isLicenseAvailable,
  openLoginPage,
  openPaymentPage,
  redeemLicenseKey,
  refreshLicenseFromManager
} from '../license/licenseManager';
import { useEscapeClose } from './useEscapeClose';

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
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemKey, setRedeemKey] = useState('');
  const [redeemEmail, setRedeemEmail] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
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

  // isLicenseAvailable()은 "확장 컨텍스트 + ExtensionPay 설정 완료"를 요구하므로, EXTPAY_EXTENSION_ID가
  // 아직 플레이스홀더인 동안(또는 PWA)에는 원래 이 배지 전체가 숨겨진다. 하지만 무료 전환 모드
  // (FREE_DISTRIBUTION_MODE)는 애초에 결제 시스템 설정 여부와 무관하게 "무료"를 알려야 하므로,
  // 이 경우엔 그 조건을 건너뛰고 플랫폼(확장/PWA) 상관없이 항상 배지를 보여준다.
  // 접근성 보강(ROADMAP 4단계) — 배경 클릭 외에 Esc 키로도 패널/팝업을 닫을 수 있게 한다.
  useEscapeClose(panelOpen, () => setPanelOpen(false));
  useEscapeClose(donePopup, () => {
    setDonePopup(false);
    setPanelOpen(false);
  });

  if (!FREE_DISTRIBUTION_MODE && !isLicenseAvailable()) return null; // PWA 등 미지원 컨텍스트에서는 조용히 숨김
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

  // 승인 기반 무료 라이선스(3단계) — 산들이 지인·홍보 대상에게 직접 전달한 키+이메일 조합을 검증한다.
  // 결제와 달리 새 탭으로 나가지 않고 이 패널 안에서 즉시 완료된다(외부 서비스 이동 없음).
  async function handleRedeem() {
    setRedeemError(null);
    setRedeemBusy(true);
    try {
      const result = await redeemLicenseKey(redeemKey, redeemEmail);
      if (result.ok) {
        setState(result.state);
        setRedeemOpen(false);
        setRedeemKey('');
        setRedeemEmail('');
        setDonePopup(true);
      } else {
        setRedeemError('키 또는 이메일이 일치하지 않습니다. 다시 확인해 주세요.');
      }
    } catch (e) {
      setRedeemError(e instanceof Error ? e.message : String(e));
    } finally {
      setRedeemBusy(false);
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

  // 산들이 유료→무료로 전환하기로 결정한 빌드(FREE_DISTRIBUTION_MODE=true)에서는 구매·복원 절차 자체가
  // 의미 없으므로, 실제로 결제했는지와 무관하게 "무료 배포 중"이라는 별도 뱃지·안내만 보여준다
  // (CLAUDE.md "유료→무료 전환 대비 원칙"). 결제 여부를 나타내는 state.paid=true를 "PRO"로 오인 표시하지 않기 위함.
  const badgeText = FREE_DISTRIBUTION_MODE ? '🎁 무료' : state.paid ? '✨ PRO' : '무료';
  const badgeClass = FREE_DISTRIBUTION_MODE || state.paid ? 'tf-sync-badge-ok' : 'tf-sync-badge-idle';

  return (
    <div className="tf-sync">
      <button
        className={'tf-btn tf-sync-btn ' + badgeClass}
        onClick={() => setPanelOpen(true)}
        title={FREE_DISTRIBUTION_MODE ? '모든 기능 무료 제공 중' : state.paid ? 'PRO 사용 중' : '무료 버전 — 눌러서 더 알아보기'}
      >
        {badgeText}
      </button>

      {panelOpen && (
        <div className="tf-sync-overlay" onClick={() => setPanelOpen(false)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-license-panel-title"
          >
            <h2 id="tf-license-panel-title">{FREE_DISTRIBUTION_MODE ? '🎁 튜브폴더' : '✨ 튜브폴더 PRO'}</h2>

            {FREE_DISTRIBUTION_MODE ? (
              <>
                <p className="tf-sync-desc">
                  이 앱은 현재 모든 기능을 무료로 제공합니다. 폴더·영상 개수 제한 없이, 클라우드 동기화까지 자유롭게
                  사용하실 수 있습니다.
                </p>
                <div className="tf-sync-actions">
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
              </>
            ) : !isLicenseConfigured() ? (
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
                {error && <div className="tf-error-banner" role="alert">{error}</div>}
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

                {error && <div className="tf-error-banner" role="alert">{error}</div>}

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

                {redeemOpen ? (
                  <div className="tf-license-redeem">
                    <p className="tf-sync-fineprint">
                      개발자에게 받은 라이선스 키와 이메일을 입력하면 결제 없이 PRO로 전환됩니다.
                    </p>
                    <input
                      className="tf-input"
                      aria-label="라이선스 키"
                      placeholder="라이선스 키"
                      value={redeemKey}
                      onChange={(e) => setRedeemKey(e.target.value)}
                      disabled={redeemBusy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRedeem();
                      }}
                    />
                    <input
                      className="tf-input"
                      aria-label="이메일"
                      placeholder="이메일"
                      value={redeemEmail}
                      onChange={(e) => setRedeemEmail(e.target.value)}
                      disabled={redeemBusy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRedeem();
                      }}
                    />
                    {redeemError && <div className="tf-error-banner" role="alert">{redeemError}</div>}
                    <div className="tf-sync-actions">
                      <button
                        className="tf-btn"
                        onClick={handleRedeem}
                        disabled={redeemBusy || !redeemKey.trim() || !redeemEmail.trim()}
                      >
                        {redeemBusy ? '확인 중...' : '확인'}
                      </button>
                      <button
                        className="tf-btn"
                        onClick={() => {
                          setRedeemOpen(false);
                          setRedeemError(null);
                        }}
                        disabled={redeemBusy}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="tf-btn tf-btn-icon" onClick={() => setRedeemOpen(true)}>
                    🔑 라이선스 키가 있으신가요?
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {donePopup && (
        <div className="tf-sync-overlay tf-sync-overlay-top">
          <div className="tf-sync-popup" role="dialog" aria-modal="true" aria-labelledby="tf-license-donepopup-title">
            <h3 id="tf-license-donepopup-title">✨ PRO 활성화 완료</h3>
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
