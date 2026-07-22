// 개발 검증 전용 목(mock) 백엔드 — 확장 런타임(chrome.identity)이 없는 브라우저 프리뷰에서
// 병합 로직·UI 상태 전이를 실제 클릭으로 검증하기 위한 것. localStorage를 "원격"으로 흉내 낸다.
// 매니저 URL에 ?syncmock=1이 있을 때만 backendFactory가 이 구현을 선택한다(실사용 경로에는 영향 없음).
//
// 프리뷰 콘솔에서 쓸 수 있는 조작:
//   localStorage.tubefolder_sync_mock_fail = 'network' | 'auth'  → 다음 동기화를 해당 오류로 실패시킴
//   localStorage.removeItem('tubefolder_sync_mock_fail')          → 정상 복귀
//   localStorage.tubefolder_sync_mock_remote                      → "원격" 스냅샷(JSON) 직접 조작 가능

import type { SyncSnapshot } from './merge';
import { SyncBackend, SyncError } from './backend';

const REMOTE_KEY = 'tubefolder_sync_mock_remote';
const CONNECTED_KEY = 'tubefolder_sync_mock_connected';
const FAIL_KEY = 'tubefolder_sync_mock_fail';

function maybeFail(): void {
  const mode = localStorage.getItem(FAIL_KEY);
  if (mode === 'network') throw new SyncError('network', '네트워크에 연결할 수 없습니다. (mock)');
  if (mode === 'auth') throw new SyncError('auth', '구글 계정 인증이 필요합니다. (mock)');
}

export class MockBackend implements SyncBackend {
  available(): boolean {
    return true;
  }

  async connect(): Promise<void> {
    maybeFail();
    localStorage.setItem(CONNECTED_KEY, '1');
  }

  async ensureAuth(): Promise<void> {
    maybeFail();
    if (localStorage.getItem(CONNECTED_KEY) !== '1') {
      throw new SyncError('auth', '구글 계정 인증이 필요합니다. (mock)');
    }
  }

  async disconnect(): Promise<void> {
    localStorage.removeItem(CONNECTED_KEY);
  }

  async download(): Promise<SyncSnapshot | null> {
    maybeFail();
    const raw = localStorage.getItem(REMOTE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SyncSnapshot;
    } catch {
      return null;
    }
  }

  async upload(snapshot: SyncSnapshot): Promise<void> {
    maybeFail();
    localStorage.setItem(REMOTE_KEY, JSON.stringify(snapshot));
  }
}
