// 유튜브 페이지 위에 뜨는 미니 팝업 — 새 폴더 만들기·이름변경·삭제 확인용.
// React 미사용(vanilla TS + Shadow DOM): 콘텐츠 스크립트가 유튜브 자체 프레임워크와 같은
// 페이지에서 돌기 때문에, Shadow DOM으로 스타일을 완전히 격리하고 번들 크기도 최소화한다.

// (2026-09-09, "같은 이름 폴더가 있으면 기존 폴더에 가져올지 새 폴더를 만들지 먼저 물어보고,
// 결과를 팝업으로 보여주고, 원하면 중복 목록도 보여줘" 요청으로 'list' 모드 신설) 'list'는
// 입력창 대신 스크롤 가능한 목록(items)을 보여주는 단순 알림용 — 제외된 중복 파일 이름처럼
// 여러 줄을 보여줘야 할 때 쓴다.
export type MiniPopupMode = 'prompt' | 'confirm' | 'list';

export interface MiniPopupOptions {
  mode: MiniPopupMode;
  title: string;
  message?: string;
  /**
   * 본문(message)과 별도로, 한 단계 옅은 톤으로 보여주는 부가 안내문(신설 2026-09-08).
   * "재생목록 가져오기 실행 시 표시 개수와 실제 개수가 다를 수 있음을 매번 알림" 요청 반영 —
   * 특정 상황에서만 뜨는 경고가 아니라, 해당 동작을 실행할 때마다 항상 보여주는 일반 안내문 용도라
   * message와 스타일을 분리했다(강조하되 본문만큼 시선을 끌지 않도록).
   */
  note?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌리기 성격이 다른 동작을 강조할 때 확인 버튼을 빨간색으로 */
  danger?: boolean;
  /** mode:'list' 전용 — 스크롤 목록에 한 줄씩 표시할 항목들. */
  items?: string[];
  /**
   * (신설) 취소(cancel) 버튼 자리를 "진짜 취소"가 아니라 제3의 선택지로 쓰고 싶을 때 지정.
   * 있으면 취소 버튼 클릭 시 팝업을 그냥 닫는 대신 이 콜백을 실행한다(confirm 버튼과 동일하게
   * 실패 시 에러 메시지를 보여주고 팝업은 유지). 예: "이미 같은 이름 폴더가 있습니다" 선택
   * 팝업에서 확인=기존 폴더 재사용, 취소 자리=새 폴더 만들기. 없으면(기존 모든 호출부) 그냥 닫는
   * 예전 동작 그대로.
   */
  onSecondary?: () => Promise<void> | void;
  /** 취소/보조 버튼 자체를 아예 숨긴다(확인 버튼 하나만 있는 단순 알림 팝업용). */
  hideCancel?: boolean;
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
  .tf-note { font-size: 11px; line-height: 1.45; color: #888; margin: -6px 0 12px; }
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
  .tf-list-scroll {
    max-height: 240px; overflow-y: auto;
    border: 1px solid #eee; border-radius: 8px;
    margin-bottom: 8px;
  }
  .tf-dup-list { margin: 0; padding: 8px 8px 8px 24px; font-size: 12px; line-height: 1.6; color: #333; }
  .tf-dup-list li { word-break: break-all; }
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

  if (opts.note) {
    const noteEl = document.createElement('div');
    noteEl.className = 'tf-note';
    noteEl.textContent = opts.note;
    box.appendChild(noteEl);
  }

  let input: HTMLInputElement | null = null;
  if (opts.mode === 'prompt') {
    input = document.createElement('input');
    input.className = 'tf-input';
    input.type = 'text';
    input.value = opts.initialValue || '';
    input.maxLength = 200;
    box.appendChild(input);
  } else if (opts.mode === 'list') {
    const listWrap = document.createElement('div');
    listWrap.className = 'tf-list-scroll';
    const ul = document.createElement('ul');
    ul.className = 'tf-dup-list';
    for (const item of opts.items || []) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    listWrap.appendChild(ul);
    box.appendChild(listWrap);
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

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'tf-btn tf-btn-confirm' + (opts.danger ? ' tf-btn-danger' : '');
  confirmBtn.textContent = opts.confirmLabel || (opts.mode === 'prompt' ? '만들기' : '확인');

  // 이 특정 showMiniPopup() 호출이 만든 host를 기억해뒀다가, onSubmit/onSecondary가 끝난 뒤
  // "그 사이 다른 팝업으로 안 바뀌었을 때만" 닫는다 — onSubmit/onSecondary 안에서 다음 단계로
  // showMiniPopup()을 또 호출해 팝업을 이어가는 경우(2026-09-09, 재생목록 가져오기 흐름의
  // "폴더 선택→결과→중복 목록" 다단계 팝업), 그 새 팝업이 열리자마자 여기서 다시 닫아버리는
  // 경쟁 상태를 막기 위함. 기존 호출부(입력 하나로 끝나는 단순 확인/생성)는 onSubmit이 새 팝업을
  // 안 열므로 activeHost가 그대로라 지금까지와 동일하게 동작한다.
  const submit = async (): Promise<void> => {
    const value = input ? input.value : '';
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    errorEl.textContent = '';
    try {
      await opts.onSubmit(value);
      if (activeHost === host) closeMiniPopup();
    } catch (e) {
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      errorEl.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  confirmBtn.addEventListener('click', submit);

  cancelBtn.addEventListener('click', async () => {
    if (!opts.onSecondary) {
      closeMiniPopup();
      return;
    }
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    errorEl.textContent = '';
    try {
      await opts.onSecondary();
      if (activeHost === host) closeMiniPopup();
    } catch (e) {
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      errorEl.textContent = e instanceof Error ? e.message : String(e);
    }
  });

  if (!opts.hideCancel) {
    actions.appendChild(cancelBtn);
  }
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
