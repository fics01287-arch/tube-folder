// 공식 YouTube Data API v3(OAuth) 기반 재생목록 가져오기 — 2026-09-08 신설.
// ROADMAP-CHECKLIST.md "재생목록 정확한 개수 가져오기" 항목 참고: 기존 방식(playlistImport.ts의
// /browse 이어받기 스크래핑)은 대형·비공개 재생목록에서 유튜브 서버가 헤더 표시 개수보다 적은
// 지점에서 스스로 끝나버리는 문제가 있었다. 공식 Data API(playlistItems.list)는 이 문제 자체가
// 없고(내부 전용 API가 아니라 유튜브가 문서화·보장하는 공개 API), 삭제됨/비공개 항목도 명시적으로
// 구분해서 알려준다.
//
// **반드시 background.ts(서비스워커)에서만 호출해야 한다** — chrome.identity API 자체가 콘텐츠
// 스크립트에는 제공되지 않는다(확장 페이지/서비스워커 전용). 기존 playlistImport.ts의
// fetchPlaylistWithAuth와 달리, 이 fetch들은 OAuth Bearer 토큰 인증이라 오리진에 묶이지 않으므로
// (SAPISIDHASH처럼 Origin 헤더로 서버가 발신처를 검증하지 않음) background에서 직접 googleapis.com을
// 호출해도 문제없다 — 그래서 fetchPlaylistWithAuth처럼 content script로 fetch 자체를 옮길 필요가
// 없고, background가 토큰 발급부터 fetch까지 전부 처리한 뒤 결과만 content.ts에 메시지로 돌려준다.

import type { PlaylistFetchResult, PlaylistVideo, ProgressCallback } from './playlistImport';

export type YoutubeApiErrorCode = 'no-auth' | 'not-found' | 'forbidden' | 'network' | 'other';

export class YoutubeApiError extends Error {
  code: YoutubeApiErrorCode;
  constructor(message: string, code: YoutubeApiErrorCode) {
    super(message);
    this.code = code;
  }
}

const API_BASE = 'https://www.googleapis.com/youtube/v3';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonNode = any;

/** chrome.identity.getAuthToken은 콜백 스타일이라 Promise로 감싼다. interactive: true는 최초
 * 1회(또는 동의 철회 후) 구글 로그인/동의 팝업을 띄우고, 이미 동의했으면 조용히 캐시된 토큰을 준다. */
function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (result: JsonNode) => {
        if (chrome.runtime.lastError || !result) {
          reject(
            new YoutubeApiError(
              chrome.runtime.lastError?.message || '구글 로그인 또는 동의가 필요합니다.',
              'no-auth'
            )
          );
          return;
        }
        // Chrome 버전에 따라 콜백 인자가 문자열 토큰 자체이거나 { token } 객체일 수 있어 둘 다 처리.
        const token = typeof result === 'string' ? result : result?.token;
        if (!token) {
          reject(new YoutubeApiError('인증 토큰을 받지 못했습니다.', 'no-auth'));
          return;
        }
        resolve(token);
      });
    } catch {
      reject(new YoutubeApiError('이 환경에서는 구글 인증을 사용할 수 없습니다.', 'no-auth'));
    }
  });
}

function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// "PT1H2M3S" 같은 ISO 8601 재생시간 문자열을 초 단위로 변환(D 단위는 실제로는 거의 안 나오지만
// 형식상 포함될 수 있어 안전하게 함께 처리).
function parseIso8601Duration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso);
  if (!m) return 0;
  const days = parseInt(m[1] || '0', 10);
  const hours = parseInt(m[2] || '0', 10);
  const minutes = parseInt(m[3] || '0', 10);
  const seconds = parseFloat(m[4] || '0');
  return days * 86400 + hours * 3600 + minutes * 60 + Math.floor(seconds);
}

/** 재생목록 가져오기 전체 흐름에서 쓰는 인증된 GET 요청 함수를 만든다. 토큰은 클로저에 갇혀있다가
 * 401(만료/무효)을 만나면 캐시를 지우고 한 번만 재발급받아 재시도한다(무한 재시도 방지). */
async function createApiClient(): Promise<(path: string) => Promise<JsonNode>> {
  let token = await getAuthToken(true);

  const request = async (path: string, isRetry = false): Promise<JsonNode> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new YoutubeApiError('구글 서버에 접속하지 못했습니다. 인터넷 연결을 확인해 주세요.', 'network');
    }

    if (res.status === 401 && !isRetry) {
      await removeCachedToken(token);
      token = await getAuthToken(true);
      return request(path, true);
    }
    if (res.status === 403) {
      throw new YoutubeApiError(
        '접근이 거부되었습니다. Google Cloud Console에서 YouTube Data API v3 사용 설정과 동의 화면 범위를 확인해 주세요.',
        'forbidden'
      );
    }
    if (res.status === 404) {
      throw new YoutubeApiError('재생목록을 찾을 수 없습니다.', 'not-found');
    }
    if (!res.ok) {
      throw new YoutubeApiError(`요청이 실패했습니다 (${res.status}).`, 'other');
    }
    try {
      return await res.json();
    } catch {
      throw new YoutubeApiError('응답을 해석하지 못했습니다.', 'other');
    }
  };

  return request;
}

interface CollectedVideo {
  videoId: string;
  title: string;
  channel: string;
}

/**
 * 공식 API로 재생목록을 가져온다 — playlists.list(제목) → playlistItems.list(영상 목록,
 * 페이지네이션) → videos.list(재생시간, 50개씩 배치) 순서. "삭제됨"/"비공개" 표시 항목은
 * 실제로 가져올 수 있는 콘텐츠가 없어(재생 불가) 건너뛰고 개수만 콘솔에 남긴다.
 */
export async function fetchPlaylistViaDataApi(
  playlistId: string,
  onProgress?: ProgressCallback
): Promise<PlaylistFetchResult> {
  const request = await createApiClient();

  let title = '가져온 재생목록';
  try {
    const playlistRes = await request(`/playlists?part=snippet&id=${encodeURIComponent(playlistId)}`);
    const fetchedTitle = playlistRes?.items?.[0]?.snippet?.title;
    if (typeof fetchedTitle === 'string' && fetchedTitle.trim()) title = fetchedTitle.trim();
  } catch (e) {
    // 인증·설정 문제는 뒤이은 playlistItems.list에서도 똑같이 실패할 것이므로 여기서 조기에 포기.
    // 그 외(예: 제목 조회만 우연히 실패)는 기본 제목으로 계속 진행 — 실제 존재 여부 판정은
    // playlistItems.list의 결과 유무에 맡긴다(관용적 실패 정책, playlistImport.ts와 동일한 방향).
    if (e instanceof YoutubeApiError && (e.code === 'no-auth' || e.code === 'forbidden')) throw e;
  }

  const collected: CollectedVideo[] = [];
  const seen = new Set<string>();
  let skippedUnavailable = 0;
  let pageToken: string | undefined;

  do {
    const qs = new URLSearchParams({
      part: 'snippet,status,contentDetails',
      playlistId,
      maxResults: '50'
    });
    if (pageToken) qs.set('pageToken', pageToken);

    const page = await request(`/playlistItems?${qs.toString()}`);
    for (const item of page?.items || []) {
      const videoId = item?.contentDetails?.videoId;
      if (!videoId || typeof videoId !== 'string') continue;
      const itemTitle: string = item?.snippet?.title || '';
      if (itemTitle === 'Deleted video' || itemTitle === 'Private video') {
        skippedUnavailable++;
        continue;
      }
      if (seen.has(videoId)) continue;
      seen.add(videoId);
      collected.push({
        videoId,
        title: itemTitle || videoId,
        channel: item?.snippet?.videoOwnerChannelTitle || item?.snippet?.channelTitle || ''
      });
    }
    onProgress?.({ fetched: collected.length });
    pageToken = typeof page?.nextPageToken === 'string' ? page.nextPageToken : undefined;
  } while (pageToken);

  if (collected.length === 0) {
    throw new YoutubeApiError(
      skippedUnavailable > 0
        ? '재생목록의 모든 영상이 삭제되었거나 비공개 처리되어 가져올 수 없습니다.'
        : '재생목록에서 영상을 찾지 못했습니다.',
      'not-found'
    );
  }

  // 재생시간은 playlistItems.list에 없어 videos.list로 별도 조회(최대 50개 id씩 배치, 문서 스펙 상한).
  const durationById = new Map<string, number>();
  for (let i = 0; i < collected.length; i += 50) {
    const batchIds = collected.slice(i, i + 50).map((v) => v.videoId);
    try {
      const res = await request(`/videos?part=contentDetails&id=${encodeURIComponent(batchIds.join(','))}`);
      for (const v of res?.items || []) {
        if (v?.id && typeof v?.contentDetails?.duration === 'string') {
          durationById.set(v.id, parseIso8601Duration(v.contentDetails.duration));
        }
      }
    } catch {
      // 재생시간 보강 실패는 치명적이지 않음(0으로 남김) — 목록 자체는 이미 확보됨.
    }
  }

  if (skippedUnavailable > 0) {
    console.warn(`[튜브폴더] 공식 API: 삭제됨/비공개 처리된 항목 ${skippedUnavailable}개는 건너뜀`);
  }

  const videos: PlaylistVideo[] = collected.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    channel: v.channel,
    duration: durationById.get(v.videoId) ?? 0
  }));

  // playlistImport.ts(기존 스크래핑 경로)의 PlaylistFetchResult.debug와 형식만 맞춘 것 — 공식
  // API는 페이지 이어받기 실패 같은 진단 정보 자체가 필요 없어(문서화된 API라 이어받기가 항상
  // 보장됨) 스크래핑 경로만큼 자세하지는 않지만, 결과 화면에서 두 경로가 같은 타입을 공유하므로
  // 최소한 "공식 API로 몇 개 가져왔는지"는 남겨둔다.
  const debug: string[] = [`공식 API: ${videos.length}개 수집`];
  if (skippedUnavailable > 0) debug.push(`삭제됨/비공개 ${skippedUnavailable}개 건너뜀`);

  return { title, videos, debug };
}
