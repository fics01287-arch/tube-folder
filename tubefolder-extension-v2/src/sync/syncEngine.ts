// 동기화 엔진 — 트리거(시작 시·주기·변경 후·수동)를 한 함수(runSync)로 모아 처리한다.
//
// CLAUDE.md "동기화(멀티기기) 대비 개발 원칙" 반영:
//  - 오프라인 우선: 시작을 막지 않는다. runSync는 항상 백그라운드에서 돌고, UI는 로컬 데이터로 먼저 뜬다.
//  - 자동(auto) 실패: 조용히 기록만 하고 지수 백오프로 다음 주기에 재시도. 알림 없음.
//    단, 재시도로 해결 안 되는 인증 만료(auth)만 상태 배지를 "재연결 필요"로 조용히 바꾼다.
//  - 수동(manual) 실패: 호출부(UI)로 오류를 그대로 던져 즉시 알린다.

import type { TubeStoreData } from '../storage/types';
import { getDeviceId, load, now, save } from '../storage/storage';
import { mergeStores, SyncSnapshot } from './merge';
import { SyncBackend, SyncError, SyncErrorCode } from './backend';
import { GoogleDriveBackend } from './googleDrive';
import { MockBackend } from './mockBackend';

export const SYNC_STATE_KEY = 'tubefolder_sync_state';
const LOCK_KEY = 'tubefolder_sync_lock';
const LOCK_TTL_MS = 2 * 60 * 1000;
/** 자동 재시도 백오프: 15분(알람 주기) × 2^실패횟수, 상한 6시간 */
const BACKOFF_BASE_MS = 15 * 60 * 1000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

export interface SyncState {
  /** 사용자가 동기화를 켰는지(연결 완료 상태). 꺼져 있으면 모든 트리거가 조용히 무시된다. */
  enabled: boolean;
  backendId: 'googleDrive' | 'mock';
  lastSyncAt?: number;
  /** 마지막 실패 원인(성공 시 지워짐) — 수동 동기화 UI가 그대로 표시 */
  lastError?: string;
  lastErrorCode?: SyncErrorCode;
  /** 실패가 자동/수동 어느 트리거에서 났는지 — 자동 실패는 배지를 바꾸지 않고 조용히 재시도(원칙 ①) */
  lastErrorSource?: 'auto' | 'manual';
  /** 인증 만료 — 자동 재시도로 해결 불가, 사용자 재연결 필요 배지용 */
  authRequired?: boolean;
  failCount?: number;
  /** 자동 동기화가 이 시각 전에는 재시도하지 않음(지수 백오프) */
  nextRetryAt?: number;
}

export type SyncRunResult =
  | { status: 'done'; localChanged: boolean; remoteChanged: boolean }
  | { status: 'skipped'; reason: 'disabled' | 'locked' | 'backoff' | 'unavailable' };

// ── chrome.storage / localStorage 이중 런타임 키-값 (storage.ts와 같은 폴백 규칙) ──
function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

async function kvGet<T>(key: string): Promise<T | null> {
  if (hasChromeStorage()) {
    const o = await chrome.storage.local.get(key);
    return (o[key] as T) ?? null;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 프리뷰 폴백 저장 실패는 무시(확장 환경에선 도달하지 않음)
  }
}

async function kvRemove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // 무시
  }
}

export async function getSyncState(): Promise<SyncState> {
  return (await kvGet<SyncState>(SYNC_STATE_KEY)) || { enabled: false, backendId: 'googleDrive' };
}

async function saveSyncState(state: SyncState): Promise<void> {
  await kvSet(SYNC_STATE_KEY, state);
  emit('statechange', state);
}

// ── 백엔드 선택 ──────────────────────────────────────────────────
// ?syncmock=1(개발 프리뷰 전용)일 때만 mock — 실사용 경로는 항상 구글 드라이브.
export function isMockMode(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('syncmock') === '1';
  } catch {
    return false;
  }
}

let backendInstance: SyncBackend | null = null;

export function getBackend(): SyncBackend {
  if (!backendInstance) {
    backendInstance = isMockMode() ? new MockBackend() : new GoogleDriveBackend();
  }
  return backendInstance;
}

// ── 같은 컨텍스트 내 상태 알림(매니저 UI 구독용) ──────────────────
type SyncEvent = 'start' | 'statechange' | 'done';
type Listener = (event: SyncEvent, state?: SyncState) => void;
const listeners = new Set<Listener>();

export function onSyncEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event: SyncEvent, state?: SyncState): void {
  listeners.forEach((fn) => fn(event, state));
}

// ── 잠금(컨텍스트 간 중복 실행 방지 — background 알람과 매니저 수동이 겹칠 수 있음) ──
async function acquireLock(): Promise<boolean> {
  const t = now();
  const held = await kvGet<number>(LOCK_KEY);
  if (held && t - held < LOCK_TTL_MS) return false;
  await kvSet(LOCK_KEY, t);
  return true;
}

async function releaseLock(): Promise<void> {
  await kvRemove(LOCK_KEY);
}

function toSnapshot(store: TubeStoreData, deviceId: string): SyncSnapshot {
  return {
    version: store.version,
    nodes: store.nodes,
    tombstones: store.tombstones || {},
    uploadedAt: now(),
    uploadedBy: deviceId
  };
}

/** 이 컨텍스트에서 동기화가 storage에 쓰는 중 — background의 onChanged 자동 트리거가 자기 쓰기에 반응하지 않게 함 */
export let isSyncWriting = false;

/**
 * 동기화 1회 실행: 다운로드 → LWW 병합 → (바뀐 쪽만) 로컬 저장·업로드.
 * source='manual'이면 실패를 그대로 던지고(즉시 알림), 'auto'면 상태에 기록만 하고 조용히 삼킨다.
 */
export async function runSync(source: 'auto' | 'manual'): Promise<SyncRunResult> {
  const state = await getSyncState();
  if (!state.enabled) return { status: 'skipped', reason: 'disabled' };

  const backend = getBackend();
  if (!backend.available()) return { status: 'skipped', reason: 'unavailable' };

  if (source === 'auto' && state.nextRetryAt && now() < state.nextRetryAt) {
    return { status: 'skipped', reason: 'backoff' };
  }

  if (!(await acquireLock())) {
    if (source === 'manual') throw new SyncError('http', '다른 동기화가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    return { status: 'skipped', reason: 'locked' };
  }

  emit('start');
  try {
    await backend.ensureAuth();
    const local = await load();
    const remote = await backend.download();
    const { merged, localChanged, remoteChanged } = mergeStores(local, remote, now());

    if (localChanged) {
      isSyncWriting = true;
      try {
        await save(merged);
      } finally {
        isSyncWriting = false;
      }
    }
    if (remoteChanged) {
      await backend.upload(toSnapshot(merged, await getDeviceId()));
    }

    await saveSyncState({
      ...state,
      lastSyncAt: now(),
      lastError: undefined,
      lastErrorCode: undefined,
      lastErrorSource: undefined,
      authRequired: false,
      failCount: 0,
      nextRetryAt: undefined
    });
    emit('done');
    return { status: 'done', localChanged, remoteChanged };
  } catch (e) {
    const code: SyncErrorCode = e instanceof SyncError ? e.code : 'http';
    const message = e instanceof Error ? e.message : String(e);
    const failCount = (state.failCount || 0) + 1;
    await saveSyncState({
      ...state,
      lastError: message,
      lastErrorCode: code,
      lastErrorSource: source,
      authRequired: code === 'auth',
      failCount,
      // 인증 만료는 재시도로 해결 안 되므로 백오프 대신 재연결을 기다린다(수동·재연결 시 nextRetryAt 초기화)
      nextRetryAt: code === 'auth' ? undefined : now() + Math.min(BACKOFF_BASE_MS * Math.pow(2, failCount - 1), BACKOFF_MAX_MS)
    });
    emit('done');
    if (source === 'manual') throw e;
    return { status: 'skipped', reason: 'backoff' };
  } finally {
    await releaseLock();
  }
}

/** 대화형 연결(설정 패널 "구글 드라이브 연결" 버튼) — 성공하면 동기화를 켜고 즉시 1회 동기화한다 */
export async function connectAndEnable(): Promise<void> {
  const backend = getBackend();
  if (!backend.available()) {
    throw new SyncError('unavailable', '이 환경에서는 동기화를 연결할 수 없습니다. 크롬 확장으로 로드한 상태에서 시도해 주세요.');
  }
  await backend.connect();
  const state = await getSyncState();
  await saveSyncState({
    ...state,
    enabled: true,
    backendId: isMockMode() ? 'mock' : 'googleDrive',
    authRequired: false,
    lastError: undefined,
    lastErrorCode: undefined,
    lastErrorSource: undefined,
    failCount: 0,
    nextRetryAt: undefined
  });
  await runSync('manual');
}

/** 연결 해제 — 동기화를 끄고 권한을 회수한다. 로컬·원격 데이터는 그대로 둔다. */
export async function disconnectAndDisable(): Promise<void> {
  const backend = getBackend();
  await backend.disconnect();
  const state = await getSyncState();
  await saveSyncState({
    ...state,
    enabled: false,
    authRequired: false,
    lastError: undefined,
    lastErrorCode: undefined,
    lastErrorSource: undefined,
    failCount: 0,
    nextRetryAt: undefined
  });
}
