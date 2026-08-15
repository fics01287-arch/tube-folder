// 앱 정보(개발자명·버전·최초 개발일·최근 수정일) 표시 패널 — CLAUDE.md "UI·앱 정보 표시 원칙" 반영.
// SyncControl·LicenseControl과 같은 "툴바 버튼 + 오버레이 패널" 패턴을 그대로 재사용한다(신규 CSS 클래스 불필요).

import { useState } from 'react';
import { APP_VERSION, BUG_REPORT_EMAIL, DEVELOPER_NAME, INITIAL_DEV_DATE, LAST_MODIFIED_DATE } from '../appInfo';
import { useEscapeClose } from './useEscapeClose';

export default function AppInfo() {
  const [open, setOpen] = useState(false);

  // 접근성 보강(ROADMAP 4단계) — 배경 클릭 외에 Esc 키로도 패널을 닫을 수 있게 한다.
  useEscapeClose(open, () => setOpen(false));

  return (
    <div className="tf-sync">
      <button className="tf-btn tf-sync-btn" onClick={() => setOpen(true)} title="앱 정보">
        ℹ️ 정보
      </button>

      {open && (
        <div className="tf-sync-overlay" onClick={() => setOpen(false)}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-appinfo-title"
          >
            <h2 id="tf-appinfo-title">튜브폴더 정보</h2>
            <p className="tf-sync-desc">
              개발자: {DEVELOPER_NAME}
              <br />
              버전: {APP_VERSION}
              <br />
              최초 개발일: {INITIAL_DEV_DATE}
              <br />
              최근 수정일: {LAST_MODIFIED_DATE}
            </p>
            <p className="tf-sync-fineprint">
              오작동이나 오류를 발견하셨나요?
              <br />
              <a href={`mailto:${BUG_REPORT_EMAIL}`}>{BUG_REPORT_EMAIL}</a>로 제보해 주세요.
            </p>
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
