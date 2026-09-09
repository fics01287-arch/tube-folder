import { useEffect } from 'react';

// 실행취소/다시 실행 겸용 토스트 — 이름변경/아이콘변경/순서변경/휴지통이동/이동 5가지 액션
// 직후엔 "방금 한 걸 되돌릴까요?"(실행취소 버튼)를, 실행취소 직후엔 "다시 적용할까요?"
// (다시 실행 버튼)를 화면 하단에 잠깐 보여준다. (2026-08-29 신규, App.tsx의 undoStack.ts와 짝 —
// 처음엔 실행취소만 있었으나 같은 날 "다시 실행 기능도 추가해줘" 요청으로 액션 종류를
// actionLabel/onAction으로 일반화함)
// 여러 액션이 빠르게 이어지면 이전 토스트를 그대로 교체한다(쌓지 않음) — 실행취소/다시 실행
// 스택 자체는 각각 20개까지 그대로 남아있으므로, 화면에 안 보여도 단축키를 여러 번 누르면
// 더 이전 동작까지 계속 오갈 수 있다. App.tsx가 매번 다른 key(발생 시각)를 줘서 타이머가
// 깨끗하게 재시작된다.

interface ToastProps {
  label: string;
  /** 버튼에 표시할 문구 — "실행취소" 또는 "다시 실행". 생략하면 버튼 없이 문구만 보여준다
   * (안내 전용 토스트, 2026-09-09 "동영상 우클릭 → 카카오톡/문자 공유" 요청으로 추가된 용도 —
   * 되돌릴 동작이 없는 "복사됨" 안내라 실행취소/다시 실행 버튼이 의미가 없음). */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** 자동으로 사라지기까지의 시간(ms). 기본 6초 — 읽고 클릭하기엔 충분하되 화면에 오래 남지 않게. */
  durationMs?: number;
}

export default function Toast({ label, actionLabel, onAction, onDismiss, durationMs = 6000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
    // label/durationMs가 바뀔 때만 타이머를 재시작하면 충분 — onDismiss는 App.tsx에서
    // 매 렌더 새로 만들어지는 콜백이라 의존성에 넣으면 렌더마다 타이머가 리셋된다.
  }, [label, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tf-toast" role="status" aria-live="polite">
      <span className="tf-toast-label">{label}</span>
      {actionLabel && onAction && (
        <button className="tf-btn tf-toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
