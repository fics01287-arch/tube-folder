import { useEffect } from 'react';

// ROADMAP 4단계 "접근성 보강" — 오버레이 패널 5종(SyncControl·LicenseControl·AppInfo·App.tsx의
// 휴지통 안내/아이콘 선택)이 전부 같은 "배경 클릭으로 닫기"만 지원하고 Esc 키로는 못 닫던 것을
// 공용 훅으로 통일. PlayerOverlay.tsx는 이미 자체적으로 Esc를 처리하고 있어 이 훅을 쓰지 않아도 됨.
export function useEscapeClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, onClose]);
}
