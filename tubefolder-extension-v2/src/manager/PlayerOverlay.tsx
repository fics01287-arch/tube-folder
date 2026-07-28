import { useEffect, useRef } from 'react';
import { updatePlaybackPosition } from '../storage/folderOps';
import type { VideoNode } from '../storage/types';
import { YT_ORIGIN, youtubeUrl } from '../shared/youtubeSelectors';

const SAVE_INTERVAL_MS = 7000;
const PLAYER_STATE_ENDED = 0;
const PLAYER_STATE_PAUSED = 2;

interface PlayerOverlayProps {
  video: VideoNode;
  onClose: () => void;
}

// 유튜브 공식 IFrame Player API(JS 래퍼)는 <script src="https://www.youtube.com/iframe_api">를
// 페이지에 심는 방식인데, 이는 MV3 확장 페이지의 기본 CSP(script-src 'self')를 위반해 차단된다
// (manifest.json에 content_security_policy가 없어 기본값이 적용됨 — 원격 스크립트 로딩만 막고
// iframe 삽입 자체는 제한하지 않음). 그래서 이 컴포넌트는 iframe만 직접 렌더링하고,
// JS 래퍼가 내부적으로 쓰는 postMessage 프로토콜을 직접 구현한다(원격 스크립트 로드 없음).
export default function PlayerOverlay({ video, onClose }: PlayerOverlayProps) {
  const videoId = video.videoId;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentTimeRef = useRef(video.lastPosition || 0);
  const readyRef = useRef(false);

  // 닫기 경로(X·ESC·배경 클릭)는 항상 이 함수를 거친다 — 저장이 끝난 뒤에야 onClose()를 호출해
  // App.tsx의 refresh()가 언마운트 시점의 "fire-and-forget" 저장과 경합해 방금 닫은 위치보다
  // 오래된 값을 읽어오는 레이스를 방지한다(실제 테스트에서 재현된 문제).
  async function handleClose() {
    if (videoId) await updatePlaybackPosition(videoId, currentTimeRef.current);
    onClose();
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void handleClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, videoId]);

  useEffect(() => {
    if (!videoId) return;

    function handleStateChange(state: number) {
      if (state === PLAYER_STATE_ENDED) {
        currentTimeRef.current = 0;
        void updatePlaybackPosition(videoId as string, 0);
      } else if (state === PLAYER_STATE_PAUSED) {
        void updatePlaybackPosition(videoId as string, currentTimeRef.current);
      }
    }

    function handleMessage(e: MessageEvent) {
      if (e.origin !== YT_ORIGIN) return;
      let parsed: { event?: string; info?: unknown };
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }
      readyRef.current = true;

      const info = parsed.info;
      if (info && typeof info === 'object') {
        const obj = info as { currentTime?: number; playerState?: number };
        if (typeof obj.currentTime === 'number') currentTimeRef.current = obj.currentTime;
        if (typeof obj.playerState === 'number') handleStateChange(obj.playerState);
      } else if (parsed.event === 'onStateChange' && typeof info === 'number') {
        handleStateChange(info);
      }
    }

    // 아직 iframe 쪽 위젯이 메시지 리스너를 등록하기 전일 수 있어 첫 응답이 올 때까지 반복 전송
    const handshake = window.setInterval(() => {
      if (readyRef.current) return;
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: video.id, channel: 'widget' }),
        YT_ORIGIN
      );
    }, 300);

    window.addEventListener('message', handleMessage);

    // 재생 중 위치를 5~10초 간격으로 저장(산들 승인: 7초) — 일시정지/종료/닫기는 즉시 저장(위·아래 별도 경로)
    const saveInterval = window.setInterval(() => {
      void updatePlaybackPosition(videoId as string, currentTimeRef.current);
    }, SAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(handshake);
      window.clearInterval(saveInterval);
      window.removeEventListener('message', handleMessage);
      void updatePlaybackPosition(videoId as string, currentTimeRef.current);
    };
  }, [videoId, video.id]);

  function postCommand(func: string, args: unknown[] = []) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN);
  }

  function restartFromBeginning() {
    postCommand('seekTo', [0, true]);
    postCommand('playVideo');
    currentTimeRef.current = 0;
  }

  if (!videoId) return null;

  const start = Math.floor(video.lastPosition || 0);
  const src = youtubeUrl.embed(videoId, start);

  return (
    <div className="tf-player-overlay" onClick={() => void handleClose()}>
      <div className="tf-player-box" onClick={(e) => e.stopPropagation()}>
        <div className="tf-player-toolbar">
          <span className="tf-player-title">{video.name}</span>
          <div className="tf-player-actions">
            <button className="tf-btn tf-btn-icon" onClick={restartFromBeginning} title="처음부터 다시보기">
              ⏮ 처음부터
            </button>
            <button className="tf-btn tf-btn-icon" onClick={() => void handleClose()} title="닫기 (Esc)">
              ✕
            </button>
          </div>
        </div>
        <div className="tf-player-frame-wrap">
          <iframe
            ref={iframeRef}
            src={src}
            title={video.name}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
