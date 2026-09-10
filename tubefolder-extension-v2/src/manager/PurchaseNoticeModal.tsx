// PRO 결제 진입 직전 공용 고지 모달(2026-09-10, 산들 요청: "유튜브가 페이지를 변경하면 튜브폴더의
// 서비스에 차질이 생길 수 있다는 내용을 프로 구매 시에 안내하고, 구매자가 클릭하면 다음으로
// 넘어가도록 해달라"). 결제 진입 버튼이 LicenseControl·BackupControl·SyncControl 세 곳에 각자
// 따로 있고 이메일을 받는 방식도 제각각(입력창 vs window.prompt)이라, 문구·모달 UI만 이 컴포넌트
// 하나로 공용화하고 실제 결제 페이지 열기(openPaymentPage 호출)는 각 파일이 onConfirm 콜백 안에서
// 그대로 수행하게 했다 — 세 곳의 서로 다른 busy/error 상태 관리를 건드리지 않고 "결제 페이지로
// 넘어가기 직전에 한 번 더 고지하고 확인받는" 단계만 앞에 끼워 넣는 방식.
interface Props {
  open: boolean;
  /** 확인 버튼을 눌러 실제 결제 페이지를 여는 동안(각 화면의 busy/buyBusy) true — 중복 클릭 방지 */
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PurchaseNoticeModal({ open, busy, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="tf-sync-overlay tf-sync-overlay-top" onClick={busy ? undefined : onCancel}>
      <div
        className="tf-sync-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tf-purchase-notice-title"
      >
        <h3 id="tf-purchase-notice-title">⚠️ 구매 전 안내</h3>
        <p className="tf-sync-desc">
          튜브폴더는 유튜브 웹페이지 화면 구조를 기반으로 동작합니다. 유튜브가 페이지 구조를 변경하면 재생목록
          가져오기 등 일부 기능에 일시적으로 차질이 생길 수 있습니다.
        </p>
        <div className="tf-sync-actions">
          <button className="tf-btn tf-btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? '여는 중...' : '확인했습니다, 계속하기'}
          </button>
          <button className="tf-btn" onClick={onCancel} disabled={busy}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
