// 앱 정보(개발자명·최초 개발일·최근 수정일) — CLAUDE.md "UI·앱 정보 표시 원칙"(신설 2026-07-21) 반영.
// 최근 수정일·버전은 빌드 시점에 자동 산출되어 vite define으로 주입된다(vite.config.ts·vite.pwa.config.ts 참고,
// 매 커밋마다 수동으로 갱신할 필요 없음). 최초 개발일은 git 이력상 고정된 사실(v2 폴더 최초 커밋)이라 상수로 둔다.

declare const __TF_LAST_MODIFIED__: string;
declare const __TF_VERSION__: string;

export const DEVELOPER_NAME = '산들';
export const INITIAL_DEV_DATE = '2026-07-19';

export const APP_VERSION = typeof __TF_VERSION__ !== 'undefined' && __TF_VERSION__ ? __TF_VERSION__ : '0.0.0';

// git 조회 실패 등으로 빌드 시점에 값을 못 얻으면(__TF_LAST_MODIFIED__가 빈 문자열) 조용히 안내 문구로 대체 —
// 앱 정보 패널이 깨지거나 잘못된 날짜를 보여주는 것보다 안전.
export const LAST_MODIFIED_DATE =
  typeof __TF_LAST_MODIFIED__ !== 'undefined' && __TF_LAST_MODIFIED__ ? __TF_LAST_MODIFIED__.slice(0, 10) : '확인 불가';
