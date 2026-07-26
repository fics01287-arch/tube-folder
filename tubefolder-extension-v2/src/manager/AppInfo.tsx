// 앱 정보(개발자명·버전·최초 개발일·최근 수정일) 표시 패널 — CLAUDE.md "UI·앱 정보 표시 원칙" 반영.
// SyncControl·LicenseControl과 같은 "툴바 버튼 + 오버레이 패널" 패턴을 그대로 재사용한다(신규 CSS 클래스 불필요).

import { useState } from 'react';
import { APP_VERSION, DEVELOPER_NAME, INITIAL_DEV_DATE, LAST_MODIFIED_DATE } from '../appInfo';

export default function AppInfo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="tf-sync">
      <button className="tf-btn tf-sync-btn" onClick={() => setOpen(true)} title="앱 정보">
        ℹ️ 정보
      </button>

      {open && (
        <div className="tf-sync-overlay" onClick={() => setOpen(false)}>
          <div className="tf-sync-panel" onClick={(e) => e.stopPropagation()}>
            <h2>튜브폴더 정보</h2>
            <p className="tf-sync-desc">
              개발자: {DEVELOPER_NAME}
              <br />
              버전: {APP_VERSION}
              <br />
              최초 개발일: {INITIAL_DEV_DATE}
              <br />
              최근 수정일: {LAST_MODIFIED_DATE}
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
