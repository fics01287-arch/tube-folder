// 유튜브 페이지 위에 뜨는 미니 팝업 — 새 폴더 만들기·이름변경·삭제 확인용.
// React 미사용(vanilla TS + Shadow DOM): 콘텐츠 스크립트가 유튜브 자체 프레임워크와 같은
// 페이지에서 돌기 때문에, Shadow DOM으로 스타일을 완전히 격리하고 번들 크기도 최소화한다.

export type MiniPopupMode = 'prompt' | 'confirm';

export interface MiniPopupOptions {
  mode: MiniPopupMode;
  title: string;
  message?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌리기 성격이 다른 동작을 강조할 때 확인 버튼을 빨간색으로 */
  danger?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
}

const CSS = `
  .tf-backdrop {
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 96px;
    font-family: "Roboto", "Malgun Gothic", "맑은 고딕", sans-serif;
  }
  .tf-box {
    background: #fff; color: #0f0f0f;
    width: min(360px, calc(100vw - 32px));
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    padding: 20px;
    box-sizing: border-box;
  }
  .tf-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .tf-message { font-size: 13px; line-height: 1.5; color: #444; margin-bottom: 12px; }
  .tf-input {
    width: 100%; box-sizing: border-box; font-size: 14px;
    padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px;
    outline: none; margin-bottom: 4px;
  }
  .tf-input:focus { border-color: #3ea6ff; }
  .tf-error { min-height: 18px; font-size: 12px; color: #cc0000; margin-bottom: 4px; }
  .tf-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .tf-btn {
    font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 18px;
    border: none; cursor: pointer;
  }
  .tf-btn-cancel { background: #f2f2f2; color: #0f0f0f; }
  .tf-btn-cancel:hover { background: #e5e5e5; }
  .tf-btn-confirm { background: #065fd4; color: #fff; }
  .tf-btn-confirm:hover { background: #0553ba; }
  .tf-btn-confirm:disabled { opacity: 0.6; cursor: default; }
  .tf-btn-danger { background: #cc0000; }
  .tf-btn-danger:hover { background: #a80000; }
`;

let activeHost: HTMLElement | null = null;
let keydownBound = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeMiniPopup();
  }
}

export function closeMiniPopup(): void {
  if (activeHost) {
    activeHost.remove();
    activeHost = null;
  }
  if (keydownBound) {
    document.removeEventListener('keydown', onKeyDown, true);
    keydownBound = false;
  }
}

export function showMiniPopup(opts: MiniPopupOptions): void {
  closeMiniPopup(); // 이미 열린 팝업이 있으면 먼저 닫아 중복 방지

  const host = document.createElement('div');
  host.id = 'tubefolder-mini-popup-host';
  document.documentElement.appendChild(host);
  activeHost = host;

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  const backdrop = document.createElement('div');
  backdrop.className = 'tf-backdrop';
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeMiniPopup();
  });

  const box = document.createElement('div');
  box.className = 'tf-box';

  const titleEl = document.createElement('div');
  titleEl.className = 'tf-title';
  titleEl.textContent = opts.title;
  box.appendChild(titleEl);

  if (opts.message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'tf-message';
    messageEl.textContent = opts.message;
    box.appendChild(messageEl);
  }

  let input: HTMLInputElement | null = null;
  if (opts.mode === 'prompt') {
    input = document.createElement('input');
    input.className = 'tf-input';
    input.type = 'text';
    input.value = opts.initialValue || '';
    input.maxLength = 200;
    box.appendChild(input);
  }

  const errorEl = document.createElement('div');
  errorEl.className = 'tf-error';
  box.appendChild(errorEl);

  const actions = document.createElement('div');
  actions.className = 'tf-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'tf-btn tf-btn-cancel';
  cancelBtn.textContent = opts.cancelLabel || '취소';
  cancelBtn.addEventListener('click', () => closeMiniPopup());

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'tf-btn tf-btn-confirm' + (opts.danger ? ' tf-btn-danger' : '');
  confirmBtn.textContent = opts.confirmLabel || (opts.mode === 'prompt' ? '만들기' : '확인');

  const submit = async (): Promise<void> => {
    const value = input ? input.value : '';
    confirmBtn.disabled = true;
    errorEl.textContent = '';
    try {
      await opts.onSubmit(value);
      closeMiniPopup();
    } catch (e) {
      confirmBtn.disabled = false;
      errorEl.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  confirmBtn.addEventListener('click', submit);

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  box.appendChild(actions);
  backdrop.appendChild(box);
  shadow.appendChild(backdrop);

  document.addEventListener('keydown', onKeyDown, true);
  keydownBound = true;

  if (input) {
    const inputEl = input;
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 0);
  } else {
    setTimeout(() => confirmBtn.focus(), 0);
  }
}
