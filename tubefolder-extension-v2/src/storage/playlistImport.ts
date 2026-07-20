// 유튜브 재생목록 일괄 가져오기 — ROADMAP-CHECKLIST.md 2단계.
// YouTube Data API 키 없이 동작해야 함(이 확장은 파일로 전달돼 API 키 설정 없이 바로 써야 함,
// v1의 noembed.com 폴백과 같은 방향). oEmbed는 영상 1개당 메타데이터만 주고 재생목록 "목록 나열"
// 자체는 지원하지 않으므로, 재생목록 페이지 HTML에 내장된 ytInitialData(공개 페이지에 항상 포함되는
// 초기 렌더 데이터, YouTube 웹 페이지 자체가 쓰는 것과 동일)를 읽어 videoId·제목·채널명을 추출한다.
// 100개 초과분은 continuation 토큰 + 페이지에 내장된 공개 웹 클라이언트 키로 이어서 가져온다
// (개인 계정 인증이 필요한 정보가 아니라 재생목록 페이지 자체가 이미 공개하는 데이터).

export interface PlaylistVideo {
  videoId: string;
  title: string;
  channel: string;
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

function parseVideoRenderer(renderer: JsonNode): PlaylistVideo | null {
  const videoId = renderer?.videoId;
  if (!videoId || typeof videoId !== 'string') return null;
  return {
    videoId,
    title: textOf(renderer.title) || videoId,
    channel: textOf(renderer.shortBylineText)
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
      continuation = item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
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

/** 재생목록 페이지 HTML을 읽어 영상 목록(videoId·제목·채널)을 가져온다. 비공개/삭제된 목록이면 에러. */
export async function fetchPlaylistVideos(playlistId: string, onProgress?: ProgressCallback): Promise<PlaylistVideo[]> {
  let pageRes: Response;
  try {
    pageRes = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`, {
      credentials: 'omit'
    });
  } catch {
    throw new PlaylistImportError('재생목록 페이지에 접속하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (!pageRes.ok) {
    throw new PlaylistImportError('재생목록 페이지를 불러오지 못했습니다.');
  }
  const html = await pageRes.text();

  const dataMatch = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.+?\})\s*;\s*(?:<\/script>|var |window\[)/s);
  if (!dataMatch) {
    throw new PlaylistImportError('재생목록 정보를 읽을 수 없습니다. 목록이 비공개이거나 URL이 올바르지 않을 수 있습니다.');
  }

  let initialData: JsonNode;
  try {
    initialData = JSON.parse(dataMatch[1]);
  } catch {
    throw new PlaylistImportError('재생목록 데이터 형식을 해석하지 못했습니다.');
  }

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

  let continuation = first.continuation;
  if (continuation) {
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const clientVersionMatch = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/);

    if (apiKeyMatch && clientVersionMatch) {
      const apiKey = apiKeyMatch[1];
      const clientVersion = clientVersionMatch[1];
      let page = 0;

      while (continuation && page < MAX_CONTINUATION_PAGES) {
        page++;
        const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion } },
            continuation
          })
        });
        if (!res.ok) break;

        let json: JsonNode;
        try {
          json = await res.json();
        } catch {
          break;
        }

        const next = extractFromContents(extractContinuationContents(json));
        for (const v of next.videos) {
          if (!seen.has(v.videoId)) {
            seen.add(v.videoId);
            all.push(v);
          }
        }
        onProgress?.({ fetched: all.length });
        continuation = next.continuation;
      }
    }
    // apiKey/clientVersion을 못 찾으면 이어받기는 포기하고 이미 얻은 첫 페이지 결과만 반환
    // (재생목록 페이지 구조가 바뀌었을 가능성 — 조용히 일부만 가져오는 것이 완전 실패보다 낫다고 판단)
  }

  if (all.length === 0) {
    throw new PlaylistImportError('재생목록에서 영상을 찾지 못했습니다.');
  }

  return all;
}
