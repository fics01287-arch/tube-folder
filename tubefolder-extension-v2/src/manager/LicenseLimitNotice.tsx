// 무료 버전 한도(폴더·영상 개수)에 걸렸을 때 뜨는 공용 안내 팝업(2026-09-10, 산들 요청: "무료버전
// 사용 중 유료 버전 전용 기능이 제한될 때 이 내용을 안내해주는 팝업창을 만들어줘"). PurchaseNoticeModal과
// 같은 "최상위 우선순위" 오버레이 패턴(.tf-sync-overlay tf-sync-overlay-top + .tf-sync-popup)을
// 재사용한다 — 신규 CSS 불필요.
//
// 예전엔 폴더 만들기·이름 바꾸기(우클릭 "새 폴더" 포함)·재생목록 가져오기에서 한도에 걸리면 화면
// 중간의 작은 인라인 에러 배너(.tf-error-banner)에 이유가 조용히 나타나는 동시에, 사용자 동의 없이
// LicenseControl의 결제 패널이 곧장 강제로 열려버렸다 — 배너는 스크롤에 묻혀 놓치기 쉽고, 결제
// 패널이 안내 없이 갑자기 뜨는 것도 다소 느닷없었다. 이 팝업은 눈에 띄는 오버레이로 "왜 안 됐는지"를
// 먼저 분명히 보여주고, "PRO 알아보기"를 직접 눌렀을 때만 LicenseControl 패널로 넘어가도록 한 단계를
// 사이에 끼워 넣는다 — 실제 결제·복원 로직은 그대로 LicenseControl에 남아있고, 이 컴포넌트는 순수
// 안내 전용이라 App.tsx의 LicenseLimitError catch 지점들만 이 컴포넌트를 향해 메시지를 넘기면 된다.
interface Props {
  /** 띄울 안내 메시지(LicenseLimitError.message 그대로) — null이면 팝업을 그리지 않음 */
  message: string | null;
  /** "PRO 알아보기" 클릭 시 실행 — App.tsx가 LicenseControl 패널을 강제로 열도록 위임(licenseOpenSignal) */
  onUpgrade: () => void;
  onClose: () => void;
}

export default function LicenseLimitNotice({ message, onUpgrade, onClose }: Props) {
  if (!message) return null;
  return (
    <div className="tf-sync-overlay tf-sync-overlay-top" onClick={onClose}>
      <div
        className="tf-sync-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tf-license-limit-title"
      >
        <h3 id="tf-license-limit-title">🔒 무료 버전 제한</h3>
        <p className="tf-sync-desc">{message}</p>
        <div className="tf-sync-actions">
          <button
            className="tf-btn tf-btn-primary"
            onClick={() => {
              onUpgrade();
              onClose();
            }}
          >
            PRO 알아보기
          </button>
          <button className="tf-btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
