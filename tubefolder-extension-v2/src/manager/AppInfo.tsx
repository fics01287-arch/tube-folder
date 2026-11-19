// 앱 정보(개발자명·버전·최초 개발일·최근 수정일) 표시 패널 — CLAUDE.md "UI·앱 정보 표시 원칙" 반영.
// "오픈소스 라이선스 보기" 단추 — 공통지침 '제3자 라이선스 고지 지침.txt' §5-2(앱 안 진입점). 고지 파일은
// public/THIRD_PARTY_NOTICES.txt(scripts/make-notices.mjs가 생성)이며 확장·PWA 배포물 모두에 들어간다.
// SyncControl·LicenseControl과 같은 "툴바 버튼 + 오버레이 패널" 패턴을 그대로 재사용한다(신규 CSS 클래스 불필요).

import { useState } from 'react';
import { APP_VERSION, BUG_REPORT_EMAIL, DEVELOPER_NAME, INITIAL_DEV_DATE, LAST_MODIFIED_DATE } from '../appInfo';
import { useEscapeClose } from './useEscapeClose';

const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

// 확장 매니저는 chrome-extension://<id>/ 아래, PWA·일반 웹은 현재 문서 기준 상대 주소(base './')로 연다.
function noticesUrl(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    return chrome.runtime.getURL(NOTICES_FILE);
  }
  return new URL(NOTICES_FILE, document.baseURI).href;
}

export default function AppInfo() {
  const [open, setOpen] = useState(false);
  const [noticeError, setNoticeError] = useState('');

  // 접근성 보강(ROADMAP 4단계) — 배경 클릭 외에 Esc 키로도 패널을 닫을 수 있게 한다.
  useEscapeClose(open, () => setOpen(false));

  // 파일이 없거나 읽을 수 없으면 조용히 실패하지 않고 안내 문구를 패널 안에 보인다(지침 §5-2). alert 같은 브라우저 대화상자는 쓰지 않는다.
  async function openNotices() {
    setNoticeError('');
    const url = noticesUrl();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setNoticeError(
        '오픈소스 라이선스 고지 파일(THIRD_PARTY_NOTICES.txt)을 열 수 없습니다. 파일이 없거나(재설치가 필요할 수 있습니다) 오프라인 상태일 수 있습니다.'
      );
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="tf-sync">
      <button className="tf-btn tf-sync-btn" onClick={() => { setNoticeError(''); setOpen(true); }} title="앱 정보">
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
            {noticeError && (
              <p className="tf-sync-fineprint" role="alert">
                {noticeError}
              </p>
            )}
            <div className="tf-sync-actions">
              <button className="tf-btn" onClick={openNotices}>
                오픈소스 라이선스 보기
              </button>
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
