// 재생목록(큐) 재생 — "1) 정렬된 순서대로/무작위로 순차 재생 2) 다중 선택해서 재생 3) 1회/무한
// 재생" 요청(2026-09-10)으로 신설. 매니저 탭(React)에서 재생을 시작하면 첫 영상을 실제 유튜브
// 탭으로 열고(App.tsx의 handleVideoClick과 동일하게 window.open() — 임베드 재도입은 하지 않음,
// 2026-09-08 "오류 152-4" 주석 참고) 큐 상태를 저장소에 남긴다. 그 유튜브 탭 안에서 content.ts가
// video 엘리먼트의 'ended'를 감지해 이 모듈의 computeNextIndex()로 다음 영상을 계산하고 그 탭을
// 다음 영상 URL로 직접 이동시킨다(하드 네비게이션 — SPA 내부 라우팅에 의존하지 않아 매번 새
// content script가 깨끗하게 다시 주입된다).
//
// storage.ts와 동일한 이중 런타임 패턴(chrome.storage.local ↔ localStorage 폴백)을 그대로 따르되,
// 이 큐 상태는 tubefolder_v1(TubeStoreData) 본체와 무관한 "이 브라우저에서 지금 재생 중인 것"
// 성격의 로컬 전용 상태라 storage.ts의 getLastImportFolderId 등과 같은 방식으로 별도 키를 쓴다.

import type { VideoNode } from '../storage/types';

export type QueueOrder = 'sequential' | 'shuffle';
export type QueueRepeatMode = 'once' | 'loop';

export interface QueueItem {
  nodeId: string;
  videoId: string;
  title: string;
}

export interface PlaybackQueueState {
  items: QueueItem[];
  currentIndex: number;
  repeatMode: QueueRepeatMode;
  startedAt: number;
}

const QUEUE_KEY = 'tubefolder_playback_queue';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

/** 현재 재생 큐 상태. 재생 중이 아니면(또는 끝났으면) null. */
export async function getQueueState(): Promise<PlaybackQueueState | null> {
  if (hasChromeStorage()) {
    const o = await chrome.storage.local.get(QUEUE_KEY);
    return (o[QUEUE_KEY] as PlaybackQueueState | undefined) ?? null;
  }
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PlaybackQueueState) : null;
  } catch {
    return null;
  }
}

/** state가 null이면 큐를 지운다(재생 종료·중단). */
export async function setQueueState(state: PlaybackQueueState | null): Promise<void> {
  if (hasChromeStorage()) {
    if (state) await chrome.storage.local.set({ [QUEUE_KEY]: state });
    else await chrome.storage.local.remove(QUEUE_KEY);
    return;
  }
  try {
    if (state) localStorage.setItem(QUEUE_KEY, JSON.stringify(state));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // 프리뷰 환경 등에서 실패해도 치명적이지 않으므로 조용히 무시(storage.ts와 동일한 원칙)
  }
}

/** videoId가 없는 영상(재생 불가)은 건너뛴다 — handleVideoClick의 기존 null 체크와 동일한 원칙. */
export function buildQueueItems(nodes: VideoNode[]): QueueItem[] {
  const items: QueueItem[] = [];
  for (const n of nodes) {
    if (!n.videoId) continue;
    items.push({ nodeId: n.id, videoId: n.videoId, title: n.name });
  }
  return items;
}

/** Fisher-Yates. 원본 배열은 건드리지 않고 새 배열을 반환한다. "무작위 재생"은 재생 시작 시
 * 한 번만 섞고, 무한재생으로 끝까지 갔다가 처음으로 돌아갈 때 다시 섞지 않는다(일반적인 미디어
 * 플레이어의 "셔플" 동작과 동일 — 셔플을 새로 걸지 않는 한 같은 순서를 반복 재생). */
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 다음으로 재생할 인덱스. 더 재생할 게 없으면(1회재생 모드에서 끝에 도달) null. */
export function computeNextIndex(state: Pick<PlaybackQueueState, 'items' | 'currentIndex' | 'repeatMode'>): number | null {
  if (state.items.length === 0) return null;
  const next = state.currentIndex + 1;
  if (next < state.items.length) return next;
  if (state.repeatMode === 'loop') return 0;
  return null;
}

/** 지금 보고 있는(재생 중인) 유튜브 페이지가 이 큐의 "현재 항목"과 실제로 일치하는지 확인한다.
 * 사용자가 큐 재생 중간에 직접 다른 영상으로 이동했거나, 탭을 닫았다가 나중에 무관한 영상을 볼 때
 * 저장소에 남아있는 오래된 큐가 엉뚱하게 다음 곡으로 넘기는 사고를 막는 안전장치(2026-09-10
 * 설계 — 이 검사가 없으면 "영상이 끝났다"는 이벤트만으로 무조건 다음 곡으로 넘어가버림). */
export function isCurrentPageInQueue(state: PlaybackQueueState | null, currentVideoId: string | null): boolean {
  if (!state || !currentVideoId) return false;
  const current = state.items[state.currentIndex];
  return current?.videoId === currentVideoId;
}
