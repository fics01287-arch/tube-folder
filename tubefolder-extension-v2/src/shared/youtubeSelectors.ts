// ── YouTube 의존 지점 통합 레지스트리 (ROADMAP-CHECKLIST.md 4단계 "YouTube DOM 선택자 분리 구조화") ──
//
// 목적: YouTube가 페이지 URL·HTML 구조·내부 응답 형식을 바꾸면 깨질 수 있는 값(엔드포인트 URL,
// HTML 스크래핑 정규식, 호스트 판별 문자열 등)을 코드 전역에 흩어두지 않고 이 한 파일에 모은다.
// YouTube 쪽 변경으로 기능이 깨지면, 원인 파일을 여기저기 뒤질 필요 없이 이 파일만 고치면 되도록 유지한다.
// (CLAUDE.md "유료 판매 리스크 대응 원칙 ④ YouTube DOM 변경 대응" 반영.)
//
// 관련 원칙: DOM/HTML에 의존해 파싱하는 경로는 실패해도 예외로 죽지 않고 "이미 확보한 부분 결과를
// 조용히 반환"하는 관용적 실패 정책을 따른다(playlistImport.ts·storage.ts fetchDuration/fetchMeta 참고).
//
// 여기 포함하지 않는 것: ytInitialData(JSON 트리) 다단계 탐색 로직은 평면 선택자가 아니라 파싱 절차라
// playlistImport.ts에 그대로 둔다(그 파일 상단 주석이 이 레지스트리를 가리킨다). 이 파일이 담는 것은
// "바뀌면 갈아끼울 문자열·정규식·URL"이다.

import { YOUTUBE_DOCUMENT_PATTERNS } from './hostPatterns';

/** youtube.com 오리진 — iframe/embed src, postMessage 대상 오리진, URL 빌더 공용 접두사로 사용 */
export const YT_ORIGIN = 'https://www.youtube.com';

// 우클릭 메뉴 documentUrlPatterns·content_scripts.matches용 호스트 패턴은 manifest.json과 반드시 동기화돼야
// 해서 hostPatterns.ts에 정의를 두고(그 파일의 동기화 경고 주석 유지), 여기서는 "한곳에서 다 보이도록" 재노출만 한다.
export { YOUTUBE_DOCUMENT_PATTERNS };

/** 영상 URL이 YouTube Music인지 판별할 때 찾는 호스트 조각 */
export const MUSIC_HOST_MARKER = 'music.youtube';

/** YouTube가 엔드포인트 경로·쿼리 형식을 바꾸면 여기만 고치면 되도록 모든 URL 조립을 함수로 모은다. */
export const youtubeUrl = {
  /** 재생목록 페이지(HTML에 ytInitialData 내장) — 일괄 가져오기 1차 소스 */
  playlist: (playlistId: string): string =>
    `${YT_ORIGIN}/playlist?list=${encodeURIComponent(playlistId)}`,
  /** 재생목록 100개 초과분 이어받기용 내부 브라우즈 API(페이지에 내장된 공개 웹 클라이언트 키 사용) */
  browseApi: (apiKey: string): string =>
    `${YT_ORIGIN}/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`,
  /** 시청 페이지 — 재생시간(videoDetails.lengthSeconds) 스크래핑 및 영상 URL 조립에 사용 */
  watch: (videoId: string): string => `${YT_ORIGIN}/watch?v=${encodeURIComponent(videoId)}`,
  /** 매니저 내장 재생용 embed URL(enablejsapi=1: postMessage 프로토콜, start: 이어보기 시작 위치) */
  embed: (videoId: string, startSeconds: number): string =>
    `${YT_ORIGIN}/embed/${videoId}?enablejsapi=1&autoplay=1&start=${startSeconds}`,
  /** 단건 추가 시 제목/채널 조회(oEmbed) */
  oembed: (watchUrl: string): string =>
    `${YT_ORIGIN}/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
  /** oEmbed 직통 실패 시 폴백(noembed.com — 서드파티 oEmbed 프록시) */
  noembed: (watchUrl: string): string =>
    `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`,
  /** 영상 썸네일(i.ytimg.com — 안정적인 정적 CDN 경로) */
  thumbnail: (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
};

/**
 * HTML/응답에서 값을 긁어낼 때 쓰는 정규식 모음.
 * YouTube가 페이지에 값을 심는 방식(변수명·키 이름)을 바꾸면 여기 정규식만 갱신하면 된다.
 * 매칭 실패 시 각 호출부는 예외 대신 부분 결과/0/null로 조용히 폴백한다(위 관용적 실패 정책).
 */
export const youtubePattern = {
  /** 재생목록/시청 페이지 HTML에 내장된 초기 렌더 데이터 블록(ytInitialData = {...};) */
  ytInitialData:
    /(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.+?\})\s*;\s*(?:<\/script>|var |window\[)/s,
  /** 이어받기(browse API) 호출에 필요한 공개 웹 클라이언트 API 키 */
  innertubeApiKey: /"INNERTUBE_API_KEY":"([^"]+)"/,
  /** 이어받기 호출 컨텍스트에 넣을 클라이언트 버전 */
  innertubeClientVersion: /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/,
  /** 시청 페이지 videoDetails의 재생시간(초) */
  lengthSeconds: /"lengthSeconds":"(\d+)"/
} as const;
