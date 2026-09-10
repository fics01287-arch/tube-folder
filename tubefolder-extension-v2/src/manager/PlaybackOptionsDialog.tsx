import { useState } from 'react';
import type { QueueOrder, QueueRepeatMode } from '../shared/playbackQueue';

// "재생" 시작 전 순서(순차/무작위)·반복(1회/무한)을 고르는 작은 모달 — 기존 아이콘 선택 모달·
// MoveDialog와 같은 .tf-sync-overlay/.tf-sync-panel 틀을 재사용한다(2026-09-10 신설, "정렬된
// 순서/무작위 순차재생 + 다중선택 재생 + 1회/무한재생" 요청). "재생 시작"을 누르면 첫 영상이
// 실제 유튜브 탭으로 열리고(handleVideoClick과 동일한 window.open() 방식 — 임베드 재도입 금지,
// 2026-09-08 "오류 152-4" 주석 참고) 그 탭 안에서 content.ts가 영상이 끝날 때마다 다음 영상으로
// 자동 이동한다.

interface PlaybackOptionsDialogProps {
  /** 재생 대상 영상 개수 — 안내 문구에만 쓰고 실제 목록은 상위(App.tsx)가 들고 있다가 onStart로 받는다. */
  videoCount: number;
  onStart: (order: QueueOrder, repeat: QueueRepeatMode) => void;
  onCancel: () => void;
}

export default function PlaybackOptionsDialog({ videoCount, onStart, onCancel }: PlaybackOptionsDialogProps) {
  const [order, setOrder] = useState<QueueOrder>('sequential');
  const [repeat, setRepeat] = useState<QueueRepeatMode>('once');

  return (
    <div className="tf-sync-overlay" onClick={onCancel}>
      <div
        className="tf-sync-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tf-playback-dialog-title"
      >
        <h2 id="tf-playback-dialog-title">▶ 재생</h2>
        <p className="tf-sync-desc">영상 {videoCount}개를 재생합니다. 순서와 반복 방식을 선택하세요.</p>

        <fieldset className="tf-playback-option-group">
          <legend>재생 순서</legend>
          <label className="tf-checkbox-row">
            <input type="radio" name="tf-playback-order" checked={order === 'sequential'} onChange={() => setOrder('sequential')} />
            정렬된 순서대로 순차 재생
          </label>
          <label className="tf-checkbox-row">
            <input type="radio" name="tf-playback-order" checked={order === 'shuffle'} onChange={() => setOrder('shuffle')} />
            무작위로 재생
          </label>
        </fieldset>

        <fieldset className="tf-playback-option-group">
          <legend>반복</legend>
          <label className="tf-checkbox-row">
            <input type="radio" name="tf-playback-repeat" checked={repeat === 'once'} onChange={() => setRepeat('once')} />
            1회만 재생
          </label>
          <label className="tf-checkbox-row">
            <input type="radio" name="tf-playback-repeat" checked={repeat === 'loop'} onChange={() => setRepeat('loop')} />
            끝까지 재생 후 처음부터 무한 반복
          </label>
        </fieldset>

        <div className="tf-sync-actions">
          <button className="tf-btn" onClick={onCancel}>
            취소
          </button>
          <button className="tf-btn tf-btn-primary" onClick={() => onStart(order, repeat)}>
            ▶ 재생 시작
          </button>
        </div>
      </div>
    </div>
  );
}
