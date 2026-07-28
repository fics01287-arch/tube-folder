// 폴더 아이콘 선택지 (ROADMAP-CHECKLIST.md 4단계 "폴더 아이콘 다양화 + 초기화").
// 산들 결정(2026-07-29): 오픈소스 SVG 아이콘셋(Material Symbols 등) 수집이나 커스텀 디자인 대신
// 이모지 세트를 채택 — 이 앱은 이미 전역이 이모지 기반 UI(📁🗑️🎬✏️ 등)라 스타일이 일관되고,
// 라이선스 표기·에셋 파이프라인 없이 즉시 구현 가능. `icon` 필드는 문자열 하나라, 5단계 정식
// 그리드 뷰에서 더 세련된 SVG 세트로 바꾸고 싶어지면 이 카탈로그만 교체하면 되고 데이터 구조는 그대로 쓴다.

export const DEFAULT_FOLDER_ICON = '📁';

export interface FolderIconCategory {
  label: string;
  icons: string[];
}

export const FOLDER_ICON_CATEGORIES: FolderIconCategory[] = [
  { label: '음악', icons: ['🎵', '🎶', '🎸', '🎹', '🎤', '🎧', '🎺', '🥁'] },
  { label: '취미', icons: ['🎮', '🎨', '📷', '🎲', '♟️', '🧩', '🎣', '🏕️'] },
  { label: '공부', icons: ['📚', '📖', '✏️', '🧪', '🧮', '🖥️', '🔬', '🗂️'] },
  { label: '업무', icons: ['💼', '📈', '📊', '🗓️', '📌', '🧾', '🖇️', '✅'] },
  { label: '생활', icons: ['🏠', '🍔', '🛒', '🧺', '🚗', '🌿', '🐾', '☕'] },
  { label: '여행', icons: ['✈️', '🧳', '🗺️', '🏖️', '⛰️', '🚉', '🚢', '🎫'] },
  { label: '영화·방송', icons: ['🎬', '📺', '🍿', '🎭', '🌟', '🎦', '🎞️', '📹'] }
];
