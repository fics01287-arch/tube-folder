// 유튜브 재생목록 일괄 가져오기 — ROADMAP-CHECKLIST.md 2단계.
// YouTube Data API 키 없이 동작해야 함(이 확장은 파일로 전달돼 API 키 설정 없이 바로 써야 함,
// v1의 noembed.com 폴백과 같은 방향). oEmbed는 영상 1개당 메타데이터만 주고 재생목록 "목록 나열"
// 자체는 지원하지 않으므로, 재생목록 페이지 HTML에 내장된 ytInitialData(공개 페이지에 항상 포함되는
// 초기 렌더 데이터, YouTube 웹 페이지 자체가 쓰는 것과 동일)를 읽어 videoId·제목·채널명을 추출한다.
// 100개 초과분은 continuation 토큰 + 페이지에 내장된 공개 웹 클라이언트 키로 이어서 가져온다
// (개인 계정 인증이 필요한 정보가 아니라 재생목록 페이지 자체가 이미 공개하는 데이터).
//
// YouTube 의존 지점 중 URL·HTML 스크래핑 정규식은 src/shared/youtubeSelectors.ts로 모아 관리한다
// (구조 변경 시 그 파일만 고치면 됨). 아래 ytInitialData JSON 트리 탐색(extract* 함수들)은 평면
// 선택자가 아니라 다단계 파싱 절차라 이 파일에 그대로 두되, 실패 시 예외 없이 부분 결과를 반환한다.

import { youtubePattern, youtubeUrl } from '../shared/youtubeSelectors';

export interface PlaylistVideo {
  videoId: string;
  title: string;
  channel: string;
  /** 재생시간(초). 재생목록 페이지 데이터에 이미 포함돼 있어 추가 네트워크 호출 없이 얻음(0 = 못 구함/라이브 방송). */
  duration: number;
  /** 유튜브 재생목록에 실제로 추가된 시각(ms epoch) — 이 스크래핑 경로(/browse 이어받기)의 페이지
   * 데이터에는 해당 정보가 없어 항상 undefined(공식 API 경로인 youtubeDataApi.ts만 채워 줌,
   * VideoNode.playlistAddedAt 참고). */
  playlistAddedAt?: number;
}

export interface PlaylistFetchProgress {
  fetched: number;
}

export type ProgressCallback = (progress: PlaylistFetchProgress) => void;

// 안전장치: continuation을 무한 반복하지 않도록 상한(약 60 * 100 = 최대 6천여 개)
const MAX_CONTINUATION_PAGES = 60;

export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const list = u.searchParams.get('list');
    if (list) return list;
  } catch {
    // URL 파싱 실패 시 아래에서 "재생목록 ID를 직접 붙여넣은 경우"로 처리
  }
  if (/^[\w-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonNode = any;

function textOf(node: JsonNode): string {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r: JsonNode) => r.text || '').join('');
  return '';
}

// "1:02:03" / "10:32" 형태의 표시용 재생시간 텍스트를 초로 변환. 형식이 아니면 0(라이브 방송 등 "실시간" 텍스트 포함).
function parseLengthText(text: string): number {
  const parts = text.split(':').map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseDuration(renderer: JsonNode): number {
  // lengthSeconds가 더 정확한 원본 값이라 우선 사용, 없으면 화면 표시용 lengthText를 파싱.
  const seconds = renderer?.lengthSeconds;
  if (typeof seconds === 'string' && /^\d+$/.test(seconds)) return parseInt(seconds, 10);
  const text = textOf(renderer?.lengthText);
  return text ? parseLengthText(text) : 0;
}

function parseVideoRenderer(renderer: JsonNode): PlaylistVideo | null {
  const videoId = renderer?.videoId;
  if (!videoId || typeof videoId !== 'string') return null;
  return {
    videoId,
    title: textOf(renderer.title) || videoId,
    channel: textOf(renderer.shortBylineText),
    duration: parseDuration(renderer)
  };
}

function extractFromContents(contents: JsonNode[] | undefined): { videos: PlaylistVideo[]; continuation: string | null } {
  const videos: PlaylistVideo[] = [];
  let continuation: string | null = null;
  for (const item of contents || []) {
    if (item.playlistVideoRenderer) {
      const v = parseVideoRenderer(item.playlistVideoRenderer);
      if (v) videos.push(v);
    } else if (item.continuationItemRenderer) {
      // 옛 형식 — 대부분의 재생목록에서 여전히 이 형식을 씀
      continuation = item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
    } else if (item.continuationItemViewModel) {
      // 새 형식(2026-09-07 발견, 179개짜리 재생목록에서 100개 이후 멈추는 문제의 원인) — YouTube가
      // 일부 재생목록 탭 응답에서 이어받기 토큰을 continuationItemRenderer 대신 이 구조로 내려주기
      // 시작함. yt-dlp가 동일 증상(100~200개에서 멈춤)을 겪고 낸 수정(yt-dlp PR #16948, 2026-09)에서
      // 정확한 경로를 확인해 그대로 반영: continuationItemViewModel.continuationCommand.innertubeCommand가
      // 옛 형식의 continuationEndpoint에 해당하는 위치이고, 그 안의 continuationCommand.token은 동일.
      continuation =
        item.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token || null;
    }
  }
  return { videos, continuation };
}

function extractInitialContents(ytInitialData: JsonNode): JsonNode[] {
  try {
    const tabs = ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs;
    const tab = tabs.find((t: JsonNode) => t?.tabRenderer?.content) || tabs[0];
    const sectionList = tab.tabRenderer.content.sectionListRenderer.contents;
    const itemSection = sectionList[0].itemSectionRenderer.contents;
    return itemSection[0].playlistVideoListRenderer.contents || [];
  } catch {
    return [];
  }
}

function extractContinuationContents(json: JsonNode): JsonNode[] {
  const actions = json?.onResponseReceivedActions || json?.onResponseReceivedEndpoints || [];
  for (const action of actions) {
    const items = action?.appendContinuationItemsAction?.continuationItems;
    if (items) return items;
  }
  return [];
}

export class PlaylistImportError extends Error {}

/** 재생목록 헤더에서 제목을 뽑는다. YouTube가 두 가지 위치 중 하나에 넣어와서 순서대로 시도하고,
 * 구조가 또 바뀌어 둘 다 실패해도(관용적 실패 정책) 예외 대신 안내용 기본값을 반환한다. */
function extractPlaylistTitle(ytInitialData: JsonNode): string {
  const metaTitle = ytInitialData?.metadata?.playlistMetadataRenderer?.title;
  if (typeof metaTitle === 'string' && metaTitle.trim()) return metaTitle.trim();
  const headerTitle = textOf(ytInitialData?.header?.playlistHeaderRenderer?.title);
  if (headerTitle.trim()) return headerTitle.trim();
  return '가져온 재생목록';
}

export interface PlaylistFetchResult {
  title: string;
  videos: PlaylistVideo[];
  /** 100개 초과 재생목록에서 일부만 가져와지는 문제(2026-09-07 최초 발견) 진단용 임시 필드 —
   * 서비스워커 콘솔이 타이밍 문제로 못 잡는 경우가 있어, 원인 확정 전까지는 호출부가 이 배열을
   * 화면(팝업)에 그대로 보여줄 수 있게 반환값에 포함시켰다. 원인 확정 후 제거 예정. */
  debug: string[];
}

/**
 * fetchPlaylistVideos(공개용, credentials 'omit')와 fetchPlaylistWithAuth(비공개용, credentials
 * 'include') 둘 다 이 내부 함수를 공유한다 — continuation 페이지네이션·파싱 로직이 완전히 같고
 * 자격증명 포함 여부와 반환 형태(제목 포함/미포함)만 다르기 때문에, 로직을 복제하는 대신
 * 인증 여부를 매개변수로 받는 공용 코어로 분리했다.
 */
async function fetchPlaylistCore(
  playlistId: string,
  credentials: RequestCredentials,
  onProgress?: ProgressCallback
): Promise<PlaylistFetchResult> {
  let pageRes: Response;
  try {
    pageRes = await fetch(youtubeUrl.playlist(playlistId), {
      credentials
    });
  } catch {
    throw new PlaylistImportError('재생목록 페이지에 접속하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (!pageRes.ok) {
    throw new PlaylistImportError('재생목록 페이지를 불러오지 못했습니다.');
  }
  const html = await pageRes.text();

  const dataMatch = html.match(youtubePattern.ytInitialData);
  if (!dataMatch) {
    throw new PlaylistImportError('재생목록 정보를 읽을 수 없습니다. 목록이 비공개이거나 URL이 올바르지 않을 수 있습니다.');
  }

  let initialData: JsonNode;
  try {
    initialData = JSON.parse(dataMatch[1]);
  } catch {
    throw new PlaylistImportError('재생목록 데이터 형식을 해석하지 못했습니다.');
  }

  const title = extractPlaylistTitle(initialData);
  const debug: string[] = [];

  const seen = new Set<string>();
  const all: PlaylistVideo[] = [];
  const first = extractFromContents(extractInitialContents(initialData));
  for (const v of first.videos) {
    if (!seen.has(v.videoId)) {
      seen.add(v.videoId);
      all.push(v);
    }
  }
  onProgress?.({ fetched: all.length });
  debug.push(`1p:${first.videos.length}개,cont=${first.continuation ? 'Y' : 'N'}`);

  let continuation = first.continuation;
  if (continuation) {
    const apiKeyMatch = html.match(youtubePattern.innertubeApiKey);
    const clientVersionMatch = html.match(youtubePattern.innertubeClientVersion);
    debug.push(`key=${apiKeyMatch ? 'Y' : 'N'},ver=${clientVersionMatch ? 'Y' : 'N'}`);

    if (apiKeyMatch && clientVersionMatch) {
      const apiKey = apiKeyMatch[1];
      const clientVersion = clientVersionMatch[1];
      let page = 0;

      while (continuation && page < MAX_CONTINUATION_PAGES) {
        page++;
        let res: Response;
        try {
          res = await fetch(youtubeUrl.browseApi(apiKey), {
            method: 'POST',
            credentials,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: { client: { clientName: 'WEB', clientVersion } },
              continuation
            })
          });
        } catch (e) {
          const msg = `${page}p:fetch실패 ${e instanceof Error ? e.message : String(e)}`;
          console.warn('[튜브폴더] 재생목록 이어받기 fetch 실패(네트워크):', page, e);
          debug.push(msg);
          break;
        }
        if (!res.ok) {
          const msg = `${page}p:응답실패 ${res.status} ${res.statusText}`;
          console.warn('[튜브폴더] 재생목록 이어받기 응답 실패:', page, res.status, res.statusText);
          debug.push(msg);
          break;
        }

        let json: JsonNode;
        try {
          json = await res.json();
        } catch (e) {
          const msg = `${page}p:JSON파싱실패`;
          console.warn('[튜브폴더] 재생목록 이어받기 응답 파싱 실패:', page, e);
          debug.push(msg);
          break;
        }

        const next = extractFromContents(extractContinuationContents(json));
        if (next.videos.length === 0 && !next.continuation) {
          console.warn('[튜브폴더] 재생목록 이어받기 응답에서 영상을 못 찾음(구조 변경 의심):', page, JSON.stringify(json).slice(0, 500));
          debug.push(`${page}p:응답에 영상 0개(구조변경 의심) rawlen=${JSON.stringify(json).length}`);
        }
        for (const v of next.videos) {
          if (!seen.has(v.videoId)) {
            seen.add(v.videoId);
            all.push(v);
          }
        }
        onProgress?.({ fetched: all.length });
        debug.push(`${page}p:${next.videos.length}개,cont=${next.continuation ? 'Y' : 'N'}`);
        continuation = next.continuation;
      }
    }
    // apiKey/clientVersion을 못 찾으면 이어받기는 포기하고 이미 얻은 첫 페이지 결과만 반환
    // (재생목록 페이지 구조가 바뀌었을 가능성 — 조용히 일부만 가져오는 것이 완전 실패보다 낫다고 판단)
  }

  if (all.length === 0) {
    throw new PlaylistImportError('재생목록에서 영상을 찾지 못했습니다.');
  }

  return { title, videos: all, debug };
}

/** 공개/미등록(unlisted) 재생목록 가져오기 — 매니저 탭의 기존 "재생목록 가져오기" 입력창이 사용.
 * 의도적으로 비인증(credentials 'omit')이라 비공개 재생목록은 못 읽는다(로그인 여부와 무관하게
 * 항상 같은 결과를 내는 게 이 앱의 원래 설계 — 확장 설치만으로 별도 인증 절차 없이 동작해야 함). */
export async function fetchPlaylistVideos(playlistId: string, onProgress?: ProgressCallback): Promise<PlaylistVideo[]> {
  const result = await fetchPlaylistCore(playlistId, 'omit', onProgress);
  return result.videos;
}

/**
 * 비공개 재생목록 가져오기 — background.ts의 우클릭 메뉴("이 재생목록 가져오기")에서만 사용.
 * credentials 'include'로 호출해야 하고, 이게 실제로 로그인 쿠키를 실어 보내려면 호출부가
 * manifest.json의 host_permissions(youtube.com)를 이미 가진 컨텍스트(서비스워커)여야 한다 —
 * content script나 매니저 탭(별도 오리진)에서 부르면 안 됨. 반환값에 제목을 함께 담는 이유:
 * 호출부(background.ts)가 이 제목을 그대로 새 폴더 이름 제안값으로 content script에 넘기기 때문.
 */
export async function fetchPlaylistWithAuth(playlistId: string, onProgress?: ProgressCallback): Promise<PlaylistFetchResult> {
  return fetchPlaylistCore(playlistId, 'include', onProgress);
}
