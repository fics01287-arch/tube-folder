// JSON 백업(내보내기·가져오기) 툴바 버튼 + 패널 — ROADMAP 4단계 작업순서 8/8.
// SyncControl·LicenseControl·AppInfo와 같은 "툴바 버튼 + tf-sync-overlay/tf-sync-panel" 패턴을
// 그대로 재사용한다(신규 CSS 클래스 불필요). undo/toast 연결은 이 컴포넌트가 pushUndo/setToast를
// 직접 부르지 않고 onUndoableAction 콜백으로 App.tsx에 위임한다 — 토스트 상태(toast)가 App.tsx
// 안에만 있고, 다른 4개 실행취소 지점(이름변경/아이콘변경/순서변경/휴지통이동/이동)도 전부 그
// 자리에서 직접 pushUndo+setToast를 부르는 것과 일관되게, "무엇을 되돌릴 수 있게 만들지"는
// App.tsx가 한곳에서 결정하도록 유지한다.

import { useEffect, useRef, useState } from 'react';
import {
  exportBackup,
  mergeFromBackup,
  overwriteFromBackup,
  parseBackupFile,
  previewBackupCounts
} from '../storage/backupOps';
import type { BackupFile } from '../storage/backupOps';
import type { TubeStoreData } from '../storage/types';
import { getLastBackupSave, setLastBackupSave } from '../storage/storage';
import type { LastBackupSave } from '../storage/storage';
import { LicenseLimitError } from '../license/licenseEngine';
import { openPaymentPage } from '../license/licenseManager';
import { useEscapeClose } from './useEscapeClose';
import PurchaseNoticeModal from './PurchaseNoticeModal';

// chrome.downloads는 확장 컨텍스트에만 있고 PWA(비확장) 빌드에는 없다 — 이 상수 하나로 매번
// typeof chrome !== 'undefined' && chrome.downloads 체크를 반복하지 않게 한다.
function hasDownloadsApi(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.downloads;
}

/**
 * chrome.downloads.download()는 "다운로드가 시작됐다"만 알려주고 실제로 저장이 끝났는지(혹은
 * 사용자가 "다른 이름으로 저장" 창에서 취소했는지)는 알려주지 않는다 — onChanged 이벤트로
 * state가 'complete'/'interrupted'가 될 때까지 지켜본 뒤, 최종 절대 경로(filename)를 함께
 * 돌려준다(2026-09-10, "다운로드 폴더를 매번 고를 수 있게 해달라" + "저장 경로를 안내해달라" 요청).
 */
function waitForDownloadSettled(
  downloadId: number
): Promise<{ state: 'complete' | 'interrupted' | 'canceled'; filename?: string; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    function finish(result: { state: 'complete' | 'interrupted' | 'canceled'; filename?: string; error?: string }) {
      if (settled) return;
      settled = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      resolve(result);
    }
    function classify(item: chrome.downloads.DownloadItem) {
      if (item.state === 'complete') finish({ state: 'complete', filename: item.filename });
      else if (item.state === 'interrupted') {
        finish({ state: item.error === 'USER_CANCELED' ? 'canceled' : 'interrupted', error: item.error });
      }
    }
    function onChanged(delta: chrome.downloads.DownloadDelta) {
      if (delta.id !== downloadId || !delta.state) return;
      chrome.downloads.search({ id: downloadId }, (items) => {
        if (items[0]) classify(items[0]);
      });
    }
    chrome.downloads.onChanged.addListener(onChanged);
    // 리스너 등록 전에 이미 끝나버린(아주 빠른 완료) 극단적인 경우 대비 — 등록 직후 한 번 더 확인
    chrome.downloads.search({ id: downloadId }, (items) => {
      if (items[0]) classify(items[0]);
    });
  });
}

interface Props {
  /** 병합/덮어쓰기로 로컬 데이터가 바뀌었을 때 목록을 새로고침하도록 부모에 알림(SyncControl과 동일 계약) */
  onLocalDataChanged: () => void;
  /** 병합/덮어쓰기 성공 시 App.tsx가 실행취소 스택에 쌓고 토스트를 띄우도록 위임 */
  onUndoableAction: (label: string, before: TubeStoreData) => void;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'preview'; file: BackupFile; fileName: string }
  | { kind: 'overwriteConfirm'; file: BackupFile; fileName: string };

/** 방금 내보낸 백업 파일 정보 — 패널 안에 "저장 위치 + 저장경로 열기" 결과 박스를 띄우는 데 쓴다.
 *  PWA(비확장) 빌드나 chrome.downloads 콜백이 절대경로를 못 돌려준 경우 path/downloadId가 null일 수 있다. */
interface ExportInfo {
  fileName: string;
  path: string | null;
  downloadId: number | null;
}

export default function BackupControl({ onLocalDataChanged, onUndoableAction }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  // 구매 전 고지 모달(2026-09-10, "유튜브 페이지 변경 시 서비스 차질 가능성 안내" 요청) — PurchaseNoticeModal 참고.
  const [noticeOpen, setNoticeOpen] = useState(false);
  // 방금 내보낸 백업의 저장 위치(2026-09-10, "다운로드 폴더 선택 + 저장경로 안내 팝업" 요청).
  const [exportInfo, setExportInfo] = useState<ExportInfo | null>(null);
  // 툴바의 "저장경로 열기" 버튼이 패널을 열지 않고도 바로 쓸 수 있도록, 마지막 저장 위치를 미리 로드해둔다.
  const [lastBackupSave, setLastBackupSaveState] = useState<LastBackupSave | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Esc로 닫을 때도 다른 닫기 경로(오버레이 클릭, "닫기" 버튼)와 똑같이 상태를 초기화한다 —
  // 안 그러면 병합/다운로드 결과 화면을 Esc로 닫고 툴바에서 다시 열었을 때, 이미 끝난 결과 화면이
  // 그대로 남아 재사용 버튼(다운로드/업로드)이 안 보이는 채로 다시 뜨는 문제가 있었다.
  useEscapeClose(open, closePanel);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getLastBackupSave();
        if (!cancelled) setLastBackupSaveState(saved);
      } catch {
        // 무시 — 저장된 위치 정보가 없으면 "저장경로 열기"가 기본 다운로드 폴더를 여는 것으로 대체됨
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetPanelState() {
    setStep({ kind: 'idle' });
    setError(null);
    setResultMessage(null);
    setLicenseError(null);
    setExportInfo(null);
  }

  function closePanel() {
    setOpen(false);
    resetPanelState();
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    setExportInfo(null);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fileName = `tubefolder-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    try {
      const json = await exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      if (!hasDownloadsApi()) {
        // PWA(비확장) 빌드 — chrome.downloads가 없으므로 기존 <a download> 방식을 그대로 유지.
        // 이 경로는 저장 위치를 알 수 없으므로 exportInfo.path/downloadId는 null로 남는다.
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setExportInfo({ fileName, path: null, downloadId: null });
        return;
      }

      try {
        const downloadId = await new Promise<number>((resolve, reject) => {
          chrome.downloads.download({ url, filename: fileName, saveAs: true }, (id) => {
            if (chrome.runtime.lastError || id == null) {
              reject(new Error(chrome.runtime.lastError?.message || '다운로드를 시작하지 못했습니다.'));
            } else {
              resolve(id);
            }
          });
        });
        const result = await waitForDownloadSettled(downloadId);
        if (result.state === 'canceled') {
          // 사용자가 "다른 이름으로 저장" 창에서 취소함 — 에러가 아니라 조용히 무시.
          return;
        }
        if (result.state === 'interrupted') {
          setError('다운로드가 중단되었습니다. 다시 시도해 주세요.');
          return;
        }
        const info: ExportInfo = { fileName, path: result.filename ?? null, downloadId };
        setExportInfo(info);
        const saved: LastBackupSave = { downloadId, path: info.path, savedAt: Date.now() };
        setLastBackupSaveState(saved);
        await setLastBackupSave(saved);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handlePickFile() {
    setError(null);
    setResultMessage(null);
    setLicenseError(null);
    setExportInfo(null);
    // 툴바의 "⬆️ 업로드" 버튼은 패널을 열지 않은 상태에서도 눌릴 수 있으므로, 파일을 고르고 나면
    // 미리보기(병합/덮어쓰기 선택) UI가 보이도록 패널을 함께 연다(2026-09-10 요청 4번).
    setOpen(true);
    fileInputRef.current?.click();
  }

  function handleOpenSavePath() {
    if (!hasDownloadsApi()) return;
    if (lastBackupSave?.downloadId != null) {
      chrome.downloads.show(lastBackupSave.downloadId);
    } else {
      chrome.downloads.showDefaultFolder();
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 onChange가 또 발생하도록 초기화
    if (!f) return;
    setError(null);
    setResultMessage(null);
    setLicenseError(null);
    setExportInfo(null);
    try {
      const text = await f.text();
      const parsed = parseBackupFile(text);
      setStep({ kind: 'preview', file: parsed, fileName: f.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMerge() {
    if (step.kind !== 'preview') return;
    setBusy(true);
    setError(null);
    setLicenseError(null);
    try {
      const { before, addedFolders, addedVideos } = await mergeFromBackup(step.file);
      const label = `백업 파일 병합(폴더 ${addedFolders}개, 영상 ${addedVideos}개)`;
      onUndoableAction(label, before);
      onLocalDataChanged();
      setStep({ kind: 'idle' });
      setResultMessage(`폴더 ${addedFolders}개, 영상 ${addedVideos}개를 추가했습니다.`);
    } catch (e) {
      if (e instanceof LicenseLimitError) {
        setLicenseError(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleOverwriteClick() {
    if (step.kind !== 'preview') return;
    setStep({ kind: 'overwriteConfirm', file: step.file, fileName: step.fileName });
  }

  async function handleOverwriteConfirm() {
    if (step.kind !== 'overwriteConfirm') return;
    setBusy(true);
    setError(null);
    setLicenseError(null);
    try {
      const { before } = await overwriteFromBackup(step.file);
      const label = '백업 파일로 전체 덮어쓰기';
      onUndoableAction(label, before);
      onLocalDataChanged();
      setStep({ kind: 'idle' });
      setResultMessage('업로드한 파일 내용으로 전체를 덮어썼습니다.');
    } catch (e) {
      if (e instanceof LicenseLimitError) {
        setLicenseError(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleBuyUpgrade() {
    const email = window.prompt('결제에 사용할 이메일을 입력해 주세요.');
    if (!email || !email.trim()) return;
    setBuyBusy(true);
    try {
      await openPaymentPage(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuyBusy(false);
    }
  }

  const preview = step.kind === 'preview' || step.kind === 'overwriteConfirm' ? previewBackupCounts(step.file) : null;
  // 방금 다운로드/병합/덮어쓰기가 성공해서 결과 화면(✅ 메시지 또는 저장 위치 박스)이 떠 있는 상태 —
  // 이때는 "다운로드/업로드"를 다시 고를 필요가 없으므로 "닫기"만 남긴다(2026-09-10, "병합 결과 화면에
  // 다운로드·업로드 버튼이 불필요" 요청). 에러나 라이선스 한도 안내가 함께 떠 있을 때는 재시도할 수
  // 있어야 하므로 원래대로 전체 액션을 보여준다.
  const showDoneOnly = step.kind === 'idle' && !error && !licenseError && (!!resultMessage || !!exportInfo);

  return (
    <div className="tf-sync">
      <button className="tf-btn tf-sync-btn" onClick={() => setOpen(true)} title="JSON 백업(다운로드·업로드)">
        📦 백업
      </button>
      {hasDownloadsApi() && (
        <button
          className="tf-btn tf-sync-btn"
          onClick={handleOpenSavePath}
          title="마지막으로 저장한 백업 파일의 폴더 열기"
        >
          📂 저장경로 열기
        </button>
      )}
      <button className="tf-btn tf-sync-btn" onClick={handlePickFile} title="저장해둔 백업 파일 다시 업로드">
        ⬆️ 업로드
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {open && (
        <div className="tf-sync-overlay" onClick={closePanel}>
          <div
            className="tf-sync-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tf-backup-panel-title"
          >
            <h2 id="tf-backup-panel-title">📦 JSON 백업</h2>
            <p className="tf-sync-desc">
              지금 가지고 있는 폴더·영상 전체를 JSON 파일로 다운로드하거나, 이전에 다운로드한 파일을 다시 업로드할 수
              있습니다.
            </p>

            {error && <div className="tf-error-banner" role="alert">{error}</div>}

            {licenseError && (
              <>
                <div className="tf-error-banner" role="alert">{licenseError}</div>
                <div className="tf-sync-actions">
                  <button className="tf-btn tf-btn-primary" disabled={buyBusy} onClick={() => setNoticeOpen(true)}>
                    {buyBusy ? '여는 중...' : '💳 PRO 업그레이드'}
                  </button>
                </div>
              </>
            )}

            {resultMessage && !error && !licenseError && (
              <p className="tf-sync-desc">✅ {resultMessage}</p>
            )}

            {exportInfo && !error && (
              <div className="tf-sync-highlight">
                <p className="tf-sync-desc">
                  ✅ "{exportInfo.fileName}" 파일로 다운로드했습니다.
                  {exportInfo.path && (
                    <>
                      <br />
                      저장 위치: <code>{exportInfo.path}</code>
                    </>
                  )}
                </p>
                {exportInfo.downloadId != null && (
                  <div className="tf-sync-actions">
                    <button
                      className="tf-btn"
                      onClick={() => chrome.downloads.show(exportInfo.downloadId as number)}
                    >
                      📂 저장경로 열기
                    </button>
                  </div>
                )}
              </div>
            )}

            {step.kind === 'idle' && showDoneOnly && (
              <div className="tf-sync-actions">
                <button className="tf-btn tf-btn-primary" onClick={closePanel}>
                  닫기
                </button>
              </div>
            )}

            {step.kind === 'idle' && !showDoneOnly && (
              <div className="tf-sync-actions">
                <button className="tf-btn tf-btn-primary" disabled={busy} onClick={handleExport}>
                  {busy ? '다운로드하는 중...' : '⬇️ 다운로드'}
                </button>
                <button className="tf-btn" disabled={busy} onClick={handlePickFile}>
                  ⬆️ 업로드
                </button>
                <button className="tf-btn" onClick={closePanel}>
                  닫기
                </button>
              </div>
            )}

            {step.kind === 'preview' && preview && (
              <>
                <p className="tf-sync-desc">
                  "{step.fileName}" 파일에 폴더 {preview.folders}개, 영상 {preview.videos}개가 들어 있습니다.
                  <br />
                  <strong>병합</strong>은 기존 데이터를 그대로 둔 채 최상위에 새 폴더로 추가하고, <strong>덮어쓰기</strong>는
                  지금 데이터를 전부 지우고 이 파일 내용으로 완전히 바꿉니다(휴지통에 있던 항목은 병합 대상에서
                  제외됩니다).
                </p>
                <div className="tf-sync-actions">
                  <button className="tf-btn tf-btn-primary" disabled={busy} onClick={handleMerge}>
                    {busy ? '병합하는 중...' : '병합'}
                  </button>
                  <button className="tf-btn tf-btn-danger-outline" disabled={busy} onClick={handleOverwriteClick}>
                    덮어쓰기
                  </button>
                  <button className="tf-btn" disabled={busy} onClick={resetPanelState}>
                    취소
                  </button>
                </div>
              </>
            )}

            {step.kind === 'overwriteConfirm' && preview && (
              <span className="tf-confirm-row">
                <span className="tf-confirm-text">
                  지금 폴더·영상 데이터를 전부 지우고 "{step.fileName}" 파일 내용(폴더 {preview.folders}개, 영상{' '}
                  {preview.videos}개)으로 완전히 바꿉니다. 필요하면 나중에 화면 상단의 실행취소 버튼으로 되돌릴 수
                  있습니다. 계속할까요?
                </span>
                <button className="tf-btn tf-btn-danger-outline" disabled={busy} onClick={handleOverwriteConfirm}>
                  {busy ? '덮어쓰는 중...' : '덮어쓰기'}
                </button>
                <button className="tf-btn tf-btn-icon" disabled={busy} onClick={() => setStep({ kind: 'preview', file: step.file, fileName: step.fileName })}>
                  취소
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      <PurchaseNoticeModal
        open={noticeOpen}
        busy={buyBusy}
        onCancel={() => setNoticeOpen(false)}
        onConfirm={async () => {
          setNoticeOpen(false);
          await handleBuyUpgrade();
        }}
      />
    </div>
  );
}
