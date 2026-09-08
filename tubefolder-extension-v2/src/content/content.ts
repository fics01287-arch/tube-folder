// content.ts — 유튜브 페이지에 주입되는 콘텐츠 스크립트.
// background가 컨텍스트 메뉴 클릭을 감지해 보내는 "미니 팝업을 띄워라" 메시지를 받아
// 실제 입력 UI(miniPopup)를 페이지 위에 렌더링하고, 확인되면 storage 계층을 직접 호출해
// 반영한다(content script도 "storage" 권한으로 chrome.storage.local에 접근 가능).

import { showMiniPopup } from './miniPopup';
import { createFolder, renameFolder, trashNode, addVideosToFolder } from '../storage/folderOps';
import { fetchPlaylistWithAuth, PlaylistImportError } from '../storage/playlistImport';
import { youtubeUrl } from '../shared/youtubeSelectors';
import { FREE_VIDEO_LIMIT } from '../license/licenseEngine';
import type { BackgroundToContentMessage, FetchPlaylistDataApiResponse } from '../shared/messages';

function flashBadge(text: string, color: string): void {
  chrome.runtime.sendMessage({ type: 'TF_FLASH_BADGE', text, color });
}

/** background로 메시지를 보내고 응답(sendResponse)을 Promise로 받는다. 메시지 전송 자체가
 * 실패하거나(chrome.runtime.lastError) 응답이 없으면 undefined를 반환 — 호출부가 이를 "실패"로
 * 취급해 기존 방식으로 대체(fallback)할 수 있게 한다. */
function sendMessageAsync<T>(message: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(response as T);
      });
    } catch {
      resolve(undefined);
    }
  });
}

chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
  if (!message || message.type !== 'TF_SHOW_FOLDER_PROMPT') return;

  if (message.mode === 'new-folder') {
    const parentId = message.parentId;
    showMiniPopup({
      mode: 'prompt',
      title: '새 폴더 만들기',
      initialValue: '새 폴더',
      confirmLabel: '만들기',
      onSubmit: async (name) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('폴더 이름을 입력하세요.');
        if (!parentId) throw new Error('폴더를 만들 위치를 확인할 수 없습니다.');
        await createFolder(parentId, trimmed);
        flashBadge('📁', '#22a722');
      }
    });
    return;
  }

  if (message.mode === 'rename-folder') {
    const folderId = message.folderId;
    showMiniPopup({
      mode: 'prompt',
      title: '폴더 이름 바꾸기',
      initialValue: message.folderName || '',
      confirmLabel: '변경',
      onSubmit: async (name) => {
        if (!folderId) throw new Error('대상 폴더를 확인할 수 없습니다.');
        await renameFolder(folderId, name);
        flashBadge('✏️', '#22a722');
      }
    });
    return;
  }

  if (message.mode === 'import-playlist') {
    const parentId = message.parentId;
    const playlistId = message.playlistId;
    const kind = message.playlistKind || 'video';

    if (!playlistId || !parentId) {
      flashBadge('!', '#cc0000');
      return;
    }

    // 실제 fetch(인증 헤더 포함 이어받기)를 이 content script(유튜브 페이지, same-origin)에서
    // 직접 한다 — messages.ts의 ShowFolderPromptMessage.playlistId 주석 참고: background(서비스
    // 워커)에서 하면 403으로 거부됨을 실측 확인했다. 가져오는 동안(최대 몇 초) 배지로 진행 중임을
    // 알리고, 완료 후에 실제 개수가 채워진 입력창을 띄운다(기존엔 background가 먼저 fetch를 끝내고
    // 나서 메시지를 보냈으니 체감 지연은 이전과 동일 — 위치만 옮겼을 뿐 순서는 그대로).
    flashBadge('…', '#3ea6ff');
    (async () => {
      let title: string;
      let videos: Awaited<ReturnType<typeof fetchPlaylistWithAuth>>['videos'];
      let usedOfficialApi = false;

      // 1순위: 공식 YouTube Data API(OAuth, background.ts에 위임 — chrome.identity가 콘텐츠
      // 스크립트엔 없음). 표시 개수와 실제 개수가 어긋나는 문제 자체가 없어 아래 fallback 경로보다
      // 우선 시도한다(2026-09-08 도입, ROADMAP-CHECKLIST.md "재생목록 정확한 개수 가져오기" 참고).
      // 산들이 Google Cloud Console 설정을 아직 안 끝냈거나 사용자가 로그인 동의를 거부하면 실패할
      // 수 있으므로, 그 경우 기존 스크래핑 방식(fetchPlaylistWithAuth)으로 조용히 대체한다 — 신규
      // 기능 도입 때문에 기존에 되던 가져오기가 안 되는 회귀가 생기지 않도록 하기 위함.
      const apiResponse = await sendMessageAsync<FetchPlaylistDataApiResponse>({
        type: 'TF_FETCH_PLAYLIST_DATA_API',
        playlistId
      });

      if (apiResponse && apiResponse.ok) {
        title = apiResponse.title;
        videos = apiResponse.videos;
        usedOfficialApi = true;
      } else {
        if (apiResponse) {
          console.warn('[튜브폴더] 공식 API 가져오기 실패, 기존 방식으로 대체:', apiResponse.code, apiResponse.message);
        }
        try {
          const result = await fetchPlaylistWithAuth(playlistId);
          title = result.title;
          videos = result.videos;
        } catch (e) {
          console.error('[튜브폴더] 재생목록 가져오기 실패:', e instanceof PlaylistImportError ? e.message : e);
          flashBadge('!', '#cc0000');
          return;
        }
      }

      showMiniPopup({
        mode: 'prompt',
        title: '재생목록 가져오기',
        message: `영상 ${videos.length}개를 새 폴더로 가져옵니다. 폴더 이름을 확인하거나 수정하세요.`,
        // 재생목록 가져오기를 실행할 때마다 보여주는 일반 안내(2026-09-08 신설, 2026-09-08 공식
        // API 도입 후 조건부로 변경) — 대형·비공개 재생목록에서 재생목록 자체에 표시된 전체 개수와
        // 실제로 가져와지는 개수(위 videos.length)가 다를 수 있음을 실사용 중 발견(예: 표시 218개인데
        // 178개만 접근 가능했던 사례, 유튜브 자체 웹클라이언트로 재현해도 동일). 이 문제는 옛
        // 스크래핑 경로(fetchPlaylistWithAuth, /browse 이어받기)에서만 발생하고 공식 API
        // (usedOfficialApi === true)는 유튜브가 문서화·보장하는 API라 이 문제 자체가 없으므로,
        // 공식 API로 성공했을 때는 안내문을 보여주지 않는다. 특정 사용자 이름이나 구체적 기능명은
        // 언급하지 않고 지금 실제로 존재하는 동작만 서술한다 — 다른 사용자에게 배포됐을 때도 그대로
        // 맞는 문구여야 하기 때문.
        note: usedOfficialApi
          ? undefined
          : '참고: 재생목록에 표시된 전체 개수와 실제로 가져와지는 개수가 다를 수 있습니다. 대형·비공개 재생목록에서 유튜브 서버가 일부 항목을 목록에서 제외하는 경우가 있어 발생하며, 확장 프로그램의 오류가 아닙니다.',
        initialValue: title || '가져온 재생목록',
        confirmLabel: '가져오기',
        onSubmit: async (name) => {
          const trimmed = name.trim();
          if (!trimmed) throw new Error('폴더 이름을 입력하세요.');
          if (videos.length === 0) throw new Error('가져올 영상이 없습니다.');
          const folder = await createFolder(parentId, trimmed);
          const result = await addVideosToFolder(
            folder.id,
            videos.map((v) => ({
              url: youtubeUrl.watch(v.videoId),
              videoId: v.videoId,
              title: v.title,
              channel: v.channel,
              kind,
              duration: v.duration,
              playlistAddedAt: v.playlistAddedAt
            }))
          );
          // 무료 티어 영상 개수 한도(FREE_VIDEO_LIMIT)에 걸린 경우는 "이미 보관 중이라 건너뜀"과
          // 전혀 다른 상황이다 — 한도 초과분은 몇 번을 다시 시도해도 절대 추가되지 않으므로, 배지
          // 한 글자로는 원인이 전혀 전달되지 않아 "가져오기가 그냥 안 됨" 버그처럼 보인다(실측:
          // 2026-09-07, 366개짜리 재생목록을 가져왔는데 폴더가 텅 빈 채로 남았던 사례 — 원인은
          // 이전 테스트로 이미 저장된 영상 수가 한도를 넘어서 이번 배치 전체가 조용히 건너뛰어진 것).
          // 팝업의 에러 영역(errorEl)에 사유를 명확히 남겨 재작업 없이 바로 원인을 알 수 있게 한다.
          if (result.limitReached) {
            flashBadge('🔒', '#cc8800');
            throw new Error(
              `무료 버전 영상 개수 한도(${FREE_VIDEO_LIMIT}개)에 도달해 ${result.added}개만 추가하고 나머지 ${result.skipped}개는 건너뛰었습니다. "${trimmed}" 폴더는 이미 만들어졌습니다. 기존 영상을 정리하거나 업그레이드 후 다시 시도해 주세요.`
            );
          }
          // 이미 보관 중인 영상은 건너뛰는 것이 정상 동작(전역 중복 방지, ROADMAP-CHECKLIST.md
          // 참고)이라 added가 0이어도 에러로 취급하지 않는다 — 배지 색으로만 구분해서 알린다.
          flashBadge(result.added > 0 ? `+${result.added}` : '0', result.added > 0 ? '#22a722' : '#888888');
        }
      });
    })();
    return;
  }

  if (message.mode === 'delete-folder') {
    const folderId = message.folderId;
    showMiniPopup({
      mode: 'confirm',
      title: '폴더 삭제',
      message: `"${message.folderName ?? ''}" 폴더를 휴지통으로 이동할까요? 하위 폴더·영상도 함께 이동됩니다.`,
      confirmLabel: '휴지통으로 이동',
      danger: true,
      onSubmit: async () => {
        if (!folderId) throw new Error('대상 폴더를 확인할 수 없습니다.');
        await trashNode(folderId);
        flashBadge('🗑', '#888888');
      }
    });
  }
});
