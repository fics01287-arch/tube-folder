// 동기화 툴바 버튼 + 설정 패널 + 연결 완료 팝업.
// CLAUDE.md 원칙 반영 지점:
//  - ② 수동 동기화 버튼 상시 노출 + 상태(미연결/진행중/최신/실패/재연결 필요) 표시 = 툴바 버튼 자체
//  - ① 수동 실패는 즉시 빨간 배너, 자동 실패는 배지 변경 없이 조용히(인증 만료만 "재연결 필요" 배지)
//  - ④ 외부 서비스 연동 UX: 연결 전 결과 안내 → 구글 창으로 넘어가는 구간 강조 박스 →
//    완료 고지 팝업(최상위 우선순위, 확인 시 설정 패널까지 함께 닫음)
//  - ⑤ 사용자가 보는 OAuth 흐름을 연결 전에 미리 글로 안내

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectAndEnable,
  disconnectAndDisable,
  getSyncState,
  onSyncEvent,
  runSync,
  SYNC_STATE_KEY,
  SyncState
} from '../sync/syncEngine';
import { getCachedLicense } from '../license/licenseEngine';
import { isLicenseAvailable, openPaymentPage } from '../license/licenseManager';
import { preloadGis } from '../sync/googleIdentityWeb';
import { useEscapeClose } from './useEscapeClose';

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + '분 전';
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + '시간 전';
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + '일 전';
}

interface Props {
  /** 동기화가 로컬 데이터를 바꿨을 때(병합 반영) 목록을 새로고침하도록 부모에 알림 */
  onLocalDataChanged: () => void;
}

export default function SyncControl({ onLocalDataChanged }: Props) {
  const [state, setState] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [donePopup, setDonePopup] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  // "지금 몇 분 전인지" 표시 갱신용
  const [, setTick] = useState(0);
  const [paid, setPaid] = useState(true); // 결제 미설정(개발 단계)에서는 게이트 없이 true로 시작
  const [buyBusy, setBuyBusy] = useState(false);
  const mounted = useRef(true);

  // 유료화 정책: 클라우드 동기화는 PRO 전용. isLicenseAvailable()이 false인 동안(결제 미설정 개발
  // 단계이거나, 아직 라이선스 확인을 지원하지 않는 PWA 컨텍스트)은 게이트를 걸지 않는다 — PWA에서
  // "구매하기" 버튼을 눌러 확장 전용 extpay 모듈을 불러오려다 실패하는 상황을 원천 차단한다.
  // syncEngine.connectAndEnable()도 같은 조건(isLicenseConfigured())으로 방어적 체크를 한 번 더 한다.
  useEffect(() => {
    if (!isLicenseAvailable()) return;
    getCachedLicense().then((s) => {
      if (mounted.current) setPaid(s.paid);
    });
  }, []);

  // PWA(비확장) 컨텍스트에서는 페이지가 뜨자마자 구글 로그인 스크립트를 미리 불러온다 — "연결" 버튼을
  // 누른 뒤에야 로드를 시작하면 그 시간차 때문에 모바일 브라우저가 로그인 팝업을 사용자 동작이 아닌
  // 것으로 보고 막아버리는 문제가 실제로 관찰됨(googleIdentityWeb.ts의 preloadGis 참고).
  useEffect(() => {
    const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    if (!isExtension) preloadGis();
  }, []);

  const reloadState = useCallback(async () => {
    const s = await getSyncState();
    if (mounted.current) setState(s);
  }, []);

  useEffect(() => {
    mounted.current = true;
    reloadState();

    // 같은 컨텍스트(이 페이지)의 동기화 진행 알림
    const off = onSyncEvent((event, s) => {
      if (!mounted.current) return;
      if (event === 'statechange' && s) setState(s);
    });

    // 다른 컨텍스트(background 자동 동기화)가 상태·데이터를 바꾼 경우
    const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.onChanged;
    const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (changes[SYNC_STATE_KEY]) reloadState();
    };
    if (hasChromeStorage) chrome.storage.onChanged.addListener(onStorageChanged);

    // 시작 시 자동 동기화(오프라인 우선 — UI는 이미 로컬 데이터로 떠 있고, 이건 백그라운드 확인)
    runSync('auto')
      .then((r) => {
        if (mounted.current && r.status === 'done' && r.localChanged) onLocalDataChanged();
      })
      .catch(() => {
        // auto는 내부에서 삼키므로 도달하지 않음 — 방어용
      });

    const timer = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => {
      mounted.current = false;
      off();
      if (hasChromeStorage) chrome.storage.onChanged.removeListener(onStorageChanged);
      clearInterval(timer);
    };
    // onLocalDataChanged는 부모의 refresh 참조 — 마운트 1회만 실행하는 초기 동기화라 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualSync() {
    if (busy) return;
    setBusy(true);
    setManualError(null);
    try {
      const r = await runSync('manual');
      if (r.status === 'done' && r.localChanged) onLocalDataChanged();
    } catch (e) {
      // 원칙 ①: 사용자가 직접 누른 동기화 실패는 즉시 알림
      setManualError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      reloadState();
    }
  }

  async function handleConnect() {
    if (connectBusy) return;
    setConnectBusy(true);
    setManualError(null);
    try {
      await connectAndEnable();
      setDonePopup(true); // ④ⓒ 완료 고지 — 확인 시 패널까지 함께 닫는다
      onLocalDataChanged();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
      reloadState();
    }
  }

  async function handleDisconnect() {
    setManualError(null);
    try {
      await disconnectAndDisable();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e));
    } finally {
      reloadState();
    }
  }

  // 접근성 보강(ROADMAP 4단계) — 배경 클릭 외에 Esc 키로도 패널/팝업을 닫을 수 있게 한다.
  useEscapeClose(panelOpen, () => setPanelOpen(false));
  useEscapeClose(donePopup, () => {
    setDonePopup(false);
    setPanelOpen(false);
  });

  if (!state) return null;

  // 툴바 배지 상태 결정(원칙 ①·②)
  let badgeClass = 'tf-sync-badge-idle';
  let badgeText: string;
  if (!paid) {
    badgeText = '🔒 동기화 (PRO 전용)';
  } else if (!state.enabled) {
    badgeText = '🔗 동기화 연결 안 됨';
  } else if (busy) {
    badgeClass = 'tf-sync-badge-busy';
    badgeText = '🔄 동기화 중...';
  } else if (state.authRequired) {
    badgeClass = 'tf-sync-badge-warn';
    badgeText = '⚠️ 재연결 필요';
  } else if (state.lastError && state.lastErrorSource === 'manual') {
    badgeClass = 'tf-sync-badge-warn';
    badgeText = '⚠️ 동기화 실패';
  } else if (state.lastSyncAt) {
    badgeClass = 'tf-sync-badge-ok';
    badgeText = '✅ ' + formatAgo(state.lastSyncAt) + ' 동기화됨';
  } else {
    badgeText = '동기화 대기 중';
  }

  return (
    <div className="tf-sync">
      {/* ② 상시 노출 수동 동기화 버튼 — 연결 전이면 설정 패널을 연다 */}
      <button
        className={'tf-btn tf-sync-btn ' + badgeClass}
        onClick={paid && state.enabled && !state.authRequired ? handleManualSync : () => setPanelOpen(true)}
        disabled={busy}
        title={!paid ? 'PRO 전용 기능 — 눌러서 더 알아보기' : state.enabled ? '지금 동기화' : '동기화 설정 열기'}
      >
        {badgeText}
      </button>
      <button className="tf-btn tf-btn-icon" onClick={() => setPanelOpen(true)} title="동기화 설정" aria-label="동기화 설정">
        ⚙️
      </button>

      {/* ① 수동 실패 즉시 알림 배너 (패널 밖에서도 보임) */}
      {manualError && !panelOpen && (
        <div className="tf-error-banner tf-sync-error" role="alert">
          동기화 실패: {manualError}
          <button className="tf-btn tf-btn-icon" onClick={() => setManualError(null)} title="닫기" aria-label="닫기">
            ✕
          </button>
        </div>
      )}

      {panelOpen && (
        <div className="tf-sync-overlay" onClick={() => setPanelOpen(false)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-sync-panel-title"
          >
            <h2 id="tf-sync-panel-title">☁️ 기기 간 동기화</h2>

            {!paid ? (
              <>
                <p className="tf-sync-desc">
                  클라우드 동기화는 PRO 전용 기능입니다. 업그레이드하면 폴더·영상 개수 제한 없이 여러 기기에서
                  자동으로 동기화할 수 있습니다.
                </p>
                {manualError && <div className="tf-error-banner" role="alert">{manualError}</div>}
                <div className="tf-sync-actions">
                  <button
                    className="tf-btn tf-btn-primary"
                    disabled={buyBusy}
                    onClick={async () => {
                      setBuyBusy(true);
                      setManualError(null);
                      try {
                        await openPaymentPage();
                      } catch (e) {
                        setManualError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBuyBusy(false);
                      }
                    }}
                  >
                    {buyBusy ? '여는 중...' : '💳 PRO 업그레이드'}
                  </button>
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
              </>
            ) : !state.enabled ? (
              <>
                {/* ④ⓐ 기능을 켜지 않을 경우의 결과를 선택 전에 안내 */}
                <p className="tf-sync-desc">
                  구글 드라이브에 연결하면 폴더·영상 목록이 다른 기기와 자동으로 동기화됩니다.
                  <br />
                  연결하지 않으면 데이터는 <strong>이 브라우저에만</strong> 저장되며, 다른 기기나 재설치 후에는 볼 수
                  없습니다.
                </p>
                <p className="tf-sync-desc tf-sync-fineprint">
                  데이터는 구글 드라이브의 <strong>앱 전용 숨김 영역</strong>에 저장됩니다(드라이브 화면에 보이지 않고,
                  이 확장만 접근 가능). 내 드라이브 저장용량을 약간(수 MB 이내) 사용하며, 구글의 무료 용량·정책은 구글
                  사정에 따라 달라질 수 있습니다.
                </p>

                {/* ④ⓑ 외부 서비스로 넘어가 사용자 조작을 기다리는 구간 — 강조 박스 + ⑤ 무엇을 보고 누르는지 안내 */}
                <div className="tf-sync-highlight">
                  <strong>연결 버튼을 누르면 구글 창이 열립니다.</strong>
                  <ol>
                    <li>구글 계정을 선택하세요.</li>
                    <li>"앱 자체 구성 데이터 보기·관리" 권한에 <strong>허용</strong>을 누르세요.</li>
                    <li>창이 저절로 닫히면 연결 완료입니다. (다음부터는 로그인 창이 다시 뜨지 않습니다)</li>
                  </ol>
                </div>

                {manualError && <div className="tf-error-banner" role="alert">연결 실패: {manualError}</div>}

                <div className="tf-sync-actions">
                  <button className="tf-btn tf-btn-primary" onClick={handleConnect} disabled={connectBusy}>
                    {connectBusy ? '구글 창에서 진행 중...' : '🔗 구글 드라이브 연결'}
                  </button>
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="tf-sync-desc">
                  {state.authRequired ? (
                    <>
                      ⚠️ 구글 드라이브 접근 권한이 만료되었습니다. 아래 <strong>다시 연결</strong>을 눌러 주세요.
                    </>
                  ) : (
                    <>
                      ✅ 구글 드라이브에 연결되어 있습니다.
                      {state.lastSyncAt ? ` 마지막 동기화: ${formatAgo(state.lastSyncAt)}` : ' 아직 동기화 전입니다.'}
                    </>
                  )}
                </p>

                {manualError && <div className="tf-error-banner" role="alert">동기화 실패: {manualError}</div>}

                <div className="tf-sync-actions">
                  {state.authRequired ? (
                    <button className="tf-btn tf-btn-primary" onClick={handleConnect} disabled={connectBusy}>
                      {connectBusy ? '구글 창에서 진행 중...' : '🔗 다시 연결'}
                    </button>
                  ) : (
                    <button className="tf-btn tf-btn-primary" onClick={handleManualSync} disabled={busy}>
                      {busy ? '🔄 동기화 중...' : '🔄 지금 동기화'}
                    </button>
                  )}
                  <button className="tf-btn tf-btn-danger-outline" onClick={handleDisconnect}>
                    연결 해제
                  </button>
                  <button className="tf-btn" onClick={() => setPanelOpen(false)}>
                    닫기
                  </button>
                </div>
                <p className="tf-sync-fineprint">
                  연결을 해제해도 이 기기와 구글 드라이브에 저장된 데이터는 지워지지 않습니다.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ④ⓒ 완료 고지 팝업 — 설정 패널보다 위(우선순위 분리), 확인 시 하위 화면(패널)까지 함께 닫음 */}
      {donePopup && (
        <div className="tf-sync-overlay tf-sync-overlay-top">
          <div className="tf-sync-popup" role="dialog" aria-modal="true" aria-labelledby="tf-sync-donepopup-title">
            <h3 id="tf-sync-donepopup-title">✅ 구글 드라이브 연결 완료</h3>
            <p>
              이제 폴더·영상 목록이 자동으로 동기화됩니다.
              <br />
              (15분마다 + 내용이 바뀔 때 + 브라우저 시작 시)
            </p>
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
