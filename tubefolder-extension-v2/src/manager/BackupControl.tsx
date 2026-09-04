// JSON 백업(내보내기·가져오기) 툴바 버튼 + 패널 — ROADMAP 4단계 작업순서 8/8.
// SyncControl·LicenseControl·AppInfo와 같은 "툴바 버튼 + tf-sync-overlay/tf-sync-panel" 패턴을
// 그대로 재사용한다(신규 CSS 클래스 불필요). undo/toast 연결은 이 컴포넌트가 pushUndo/setToast를
// 직접 부르지 않고 onUndoableAction 콜백으로 App.tsx에 위임한다 — 토스트 상태(toast)가 App.tsx
// 안에만 있고, 다른 4개 실행취소 지점(이름변경/아이콘변경/순서변경/휴지통이동/이동)도 전부 그
// 자리에서 직접 pushUndo+setToast를 부르는 것과 일관되게, "무엇을 되돌릴 수 있게 만들지"는
// App.tsx가 한곳에서 결정하도록 유지한다.

import { useRef, useState } from 'react';
import {
  exportBackup,
  mergeFromBackup,
  overwriteFromBackup,
  parseBackupFile,
  previewBackupCounts
} from '../storage/backupOps';
import type { BackupFile } from '../storage/backupOps';
import type { TubeStoreData } from '../storage/types';
import { LicenseLimitError } from '../license/licenseEngine';
import { openPaymentPage } from '../license/licenseManager';
import { useEscapeClose } from './useEscapeClose';

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

export default function BackupControl({ onLocalDataChanged, onUndoableAction }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEscapeClose(open, () => setOpen(false));

  function resetPanelState() {
    setStep({ kind: 'idle' });
    setError(null);
    setResultMessage(null);
    setLicenseError(null);
  }

  function closePanel() {
    setOpen(false);
    resetPanelState();
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const json = await exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fileName = `tubefolder-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setResultMessage(`${fileName} 파일로 다운로드했습니다.`);
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
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 onChange가 또 발생하도록 초기화
    if (!f) return;
    setError(null);
    setResultMessage(null);
    setLicenseError(null);
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

  return (
    <div className="tf-sync">
      <button className="tf-btn tf-sync-btn" onClick={() => setOpen(true)} title="JSON 백업(다운로드·업로드)">
        📦 백업
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
                  <button className="tf-btn tf-btn-primary" disabled={buyBusy} onClick={handleBuyUpgrade}>
                    {buyBusy ? '여는 중...' : '💳 PRO 업그레이드'}
                  </button>
                </div>
              </>
            )}

            {resultMessage && !error && !licenseError && (
              <p className="tf-sync-desc">✅ {resultMessage}</p>
            )}

            {step.kind === 'idle' && (
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
    </div>
  );
}
