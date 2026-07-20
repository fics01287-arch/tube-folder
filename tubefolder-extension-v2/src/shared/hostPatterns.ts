// manifest.json의 host_permissions·content_scripts.matches와 반드시 동일하게 유지한다.
// (background의 contextMenus.documentUrlPatterns가 이 목록과 어긋나면, 메뉴는 뜨는데
//  content script가 없는 탭으로 메시지를 보내 실패하거나 그 반대 상황이 생길 수 있음)
export const YOUTUBE_DOCUMENT_PATTERNS: string[] = [
  'https://www.youtube.com/*',
  'https://music.youtube.com/*',
  'https://youtu.be/*'
];
