// content.ts — 유튜브 페이지에 주입되는 콘텐츠 스크립트.
// background가 컨텍스트 메뉴 클릭을 감지해 보내는 "미니 팝업을 띄워라" 메시지를 받아
// 실제 입력 UI(miniPopup)를 페이지 위에 렌더링하고, 확인되면 storage 계층을 직접 호출해
// 반영한다(content script도 "storage" 권한으로 chrome.storage.local에 접근 가능).

import { showMiniPopup } from './miniPopup';
import { createFolder, renameFolder, trashNode, addVideosToFolder, folderChildren } from '../storage/folderOps';
import { fetchPlaylistWithAuth, PlaylistImportError } from '../storage/playlistImport';
import { load, getLastImportFolderId, setLastImportFolderId, getOpenFolderId, resolveCurrentFolderId } from '../storage/storage';
import { youtubeUrl } from '../shared/youtubeSelectors';
import { FREE_VIDEO_LIMIT } from '../license/licenseEngine';
import { DEFAULT_FOLDER_ICON } from '../shared/folderIcons';
import type { TubeStoreData } from '../storage/types';
import type { BackgroundToContentMessage, FetchPlaylistDataApiResponse } from '../shared/messages';

function flashBadge(text: string, color: string): void {
  chrome.runtime.sendMessage({ type: 'TF_FLASH_BADGE', text, color });
}

/** 무료 버전 한도(LicenseLimitError 또는 그와 동등한 한도 초과 상황)에 걸렸을 때 보여주는 공용
 * 안내 팝업 — 매니저 탭의 LicenseLimitNotice.tsx와 같은 문구·버튼 구성을 유튜브 페이지 위에서도
 * 그대로 재현한다. "PRO 알아보기"는 content script에 chrome.tabs 권한이 없어 background에
 * 매니저 탭을 열어달라고 요청만 한다(TF_OPEN_MANAGER). background가 보낸 TF_SHOW_LICENSE_LIMIT
 * 메시지(우클릭 메뉴로 단일 영상 추가) 외에, content.ts 자체 안에서 한도를 감지하는 흐름(재생목록
 * 가져오기의 finishImport)도 이 함수를 그대로 재사용한다(2026-09-10, "재생목록 가져오기에서는
 * 이 안내가 안 뜬다" 제보로 발견 — 그전까지 이 흐름은 안내 없이 평범한 에러 텍스트만 보여주고
 * 있었음). 기존에 열려 있던 팝업(예: "가져오기 확인" 확인창)을 이 팝업으로 교체한다 — miniPopup의
 * activeHost 추적 덕분에 onSubmit 중간에 새 팝업을 띄워도 경쟁 상태 없이 안전하게 이어진다. */
function showLicenseLimitPopup(message: string): void {
  showMiniPopup({
    mode: 'confirm',
    title: '🔒 무료 버전 제한',
    message,
    confirmLabel: 'PRO 알아보기',
    cancelLabel: '닫기',
    onSubmit: () => {
      chrome.runtime.sendMessage({ type: 'TF_OPEN_MANAGER' });
    }
  });
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
  if (!message) return;

  // 무료 버전 한도(LicenseLimitError)에 걸려 background.ts가 보낸 안내(2026-09-10, "배지만 뜨고
  // 안내가 없다" 제보로 신설) — 매니저 탭의 LicenseLimitNotice.tsx 팝업과 같은 문구·버튼 구성을
  // 유튜브 페이지 위에서도 그대로 재현한다. "PRO 알아보기"는 content script에 chrome.tabs 권한이
  // 없어 background에 매니저 탭을 열어달라고 요청만 한다(TF_OPEN_MANAGER).
  if (message.type === 'TF_SHOW_LICENSE_LIMIT') {
    showLicenseLimitPopup(message.message);
    return;
  }

  if (message.type !== 'TF_SHOW_FOLDER_PROMPT') return;

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

      // 재생목록 가져오기를 실행할 때마다 보여주는 일반 안내(2026-09-08 신설, 2026-09-08 공식
      // API 도입 후 조건부로 변경) — 대형·비공개 재생목록에서 재생목록 자체에 표시된 전체 개수와
      // 실제로 가져와지는 개수(videos.length)가 다를 수 있음을 실사용 중 발견(예: 표시 218개인데
      // 178개만 접근 가능했던 사례, 유튜브 자체 웹클라이언트로 재현해도 동일). 이 문제는 옛
      // 스크래핑 경로(fetchPlaylistWithAuth, /browse 이어받기)에서만 발생하고 공식 API
      // (usedOfficialApi === true)는 유튜브가 문서화·보장하는 API라 이 문제 자체가 없으므로,
      // 공식 API로 성공했을 때는 안내문을 보여주지 않는다.
      const countNote = usedOfficialApi
        ? undefined
        : '참고: 재생목록에 표시된 전체 개수와 실제로 가져와지는 개수가 다를 수 있습니다. 대형·비공개 재생목록에서 유튜브 서버가 일부 항목을 목록에서 제외하는 경우가 있어 발생하며, 확장 프로그램의 오류가 아닙니다.';

      // (2026-09-09, "이미 같은 이름 폴더가 있으면 물어보고, 기존 폴더 선택 시 이름 겹치는
      // 파일만 빼고 가져오고, 새 폴더 선택 시 전체를 그대로 가져오고, 끝나면 결과를 팝업으로
      // 보여줘" 요청) 실제 추가 + 결과 팝업 표시를 한 곳에 모아 새 폴더 생성/기존 폴더 재사용
      // 양쪽 모두에서 재사용한다. dedupeByName이 true면(=기존 폴더에 넣는 경우 — "현재 폴더",
      // "다른 폴더", 또는 "새 폴더 만들기"에서 같은 이름 폴더를 재사용하기로 한 경우) 그 폴더에
      // 이미 있는 영상과 "이름이 정확히 같은" 항목만 걸러내고, false면(=새로 만든 폴더인 경우)
      // 요청대로 중복 여부를 아예 따지지 않고 전부 넣는다. addVideosToFolder의 videoId 기준 전역
      // 중복 방지(휴지통 제외)는 이 흐름에서는 쓰지 않는다 — 여기서 보여줄 "총 N개 중 중복 M개
      // 제외" 카운트가 이름 기준 필터링과 정확히 일치해야 하는데, 전역 dedupe가 추가로 끼어들면
      // 두 기준이 서로 다른 이유로 건너뛴 항목이 섞여 카운트가 안 맞기 때문(skipDuplicateCheck:
      // true로 완전히 우회).
      const finishImport = async (folderId: string, dedupeByName: boolean): Promise<void> => {
        let toImport = videos;
        const duplicateNames: string[] = [];

        if (dedupeByName) {
          const data = await load();
          const existingNames = new Set<string>();
          for (const k in data.nodes) {
            const n = data.nodes[k];
            if (n.type === 'video' && n.parentId === folderId) existingNames.add(n.name);
          }
          toImport = [];
          for (const v of videos) {
            if (existingNames.has(v.title)) duplicateNames.push(v.title);
            else toImport.push(v);
          }
        }

        const result = await addVideosToFolder(
          folderId,
          toImport.map((v) => ({
            url: youtubeUrl.watch(v.videoId),
            videoId: v.videoId,
            title: v.title,
            channel: v.channel,
            kind,
            duration: v.duration,
            playlistAddedAt: v.playlistAddedAt
          })),
          { skipDuplicateCheck: true }
        );

        // (2026-09-09, "가져오기를 실행취소/다시 실행 가능하게 해달라" 요청과 짝을 이루는 로직 —
        // 이번 "새 폴더/현재 폴더/다른 폴더 선택" 요청으로 새로 생긴 "현재 폴더" 개념의 후보 중
        // 하나(매니저가 안 열려있을 때의 대체값)이므로, 실제로 어느 목적지를 골랐든 완료 시점에
        // 항상 갱신해둔다 — 전부 중복이라 added===0이어도 "이 폴더로 가져오기를 시도했다"는
        // 사실 자체는 유효하므로 기록한다.
        await setLastImportFolderId(folderId);

        // 무료 티어 영상 개수 한도(FREE_VIDEO_LIMIT)에 걸린 경우는 "이름이 같아 건너뜀"과 전혀
        // 다른 상황이라(한도 초과분은 몇 번을 다시 시도해도 절대 추가되지 않음) 결과 팝업 대신
        // 별도로 명확히 알린다(기존 동작 유지). 2026-09-10 전까지는 여기서 그냥 Error를 throw해서
        // "가져오기 확인" 창에 인라인 에러 텍스트로만 보여줬는데(취소/가져오기 버튼이 그대로 남아
        // 다시 시도할 수 있는 것처럼 보임), "업그레이드"라는 말만 있고 실제로 업그레이드로 이어지는
        // 버튼이 없어 다른 5곳(App.tsx)·컨텍스트 메뉴 단일 추가(TF_SHOW_LICENSE_LIMIT)와 달리 이
        // 흐름만 안내가 빠져 있던 것을 산들이 실제 화면으로 발견해 제보함 — showLicenseLimitPopup로
        // 교체해 "PRO 알아보기" 버튼이 있는 동일한 안내 팝업이 뜨도록 통일한다.
        if (result.limitReached) {
          flashBadge('🔒', '#cc8800');
          showLicenseLimitPopup(
            `무료 버전 영상 개수 한도(${FREE_VIDEO_LIMIT}개)에 도달해 ${result.added}개만 추가하고 나머지 ${result.skipped}개는 건너뛰었습니다. 기존 영상을 정리하거나 업그레이드 후 다시 시도해 주세요.`
          );
          return;
        }

        flashBadge(result.added > 0 ? `+${result.added}` : '0', result.added > 0 ? '#22a722' : '#888888');

        const finalData = await load();
        let finalCount = 0;
        for (const k in finalData.nodes) {
          const n = finalData.nodes[k];
          if (n.type === 'video' && n.parentId === folderId) finalCount++;
        }

        const dupCount = duplicateNames.length;
        showMiniPopup({
          mode: 'confirm',
          title: '가져오기 완료',
          message: `총 ${videos.length}개 중 중복 ${dupCount}개를 제외하고 ${result.added}개를 가져왔습니다. 현재 폴더에는 총 ${finalCount}개의 파일이 있습니다.`,
          confirmLabel: '확인',
          cancelLabel: '중복 목록 보기',
          hideCancel: dupCount === 0,
          onSubmit: () => {},
          onSecondary:
            dupCount > 0
              ? () => {
                  showMiniPopup({
                    mode: 'list',
                    title: `제외된 중복 파일 (${dupCount}개)`,
                    items: duplicateNames,
                    confirmLabel: '닫기',
                    hideCancel: true,
                    onSubmit: () => {}
                  });
                }
              : undefined
        });
      };

      // 대상 폴더 하나가 정해졌을 때(현재 폴더/다른 폴더) 실행 직전에 폴더 이름을 보여주고 한 번
      // 더 확인받는다(2026-09-09, "현재 폴더/다른 폴더에 넣을 때는 실행 직전에 폴더 이름을 보여
      // 주고 확인하는 팝업을 띄워달라" 요청 — 매니저 탭 URL 입력창에 이미 적용된 것과 동일한
      // 정책). "새 폴더 만들기"는 이름 입력 팝업 자체가 이미 확인 단계 역할을 하므로 이 단계를
      // 거치지 않는다.
      const confirmAndImport = (folderId: string, folderName: string): void => {
        showMiniPopup({
          mode: 'confirm',
          title: '가져오기 확인',
          message: `"${folderName}" 폴더에 영상 ${videos.length}개를 가져올까요?`,
          confirmLabel: '가져오기',
          onSubmit: async () => {
            await finishImport(folderId, true);
          }
        });
      };

      // "새 폴더 만들기"를 고르면 이름 입력 팝업을 띄우고(기존 동작과 동일하게 재생목록 제목을
      // 기본값으로 채움), 그 이름의 폴더가 parentFolderId 안에 이미 있으면 예전처럼(2026-09-09,
      // "1970 폴더에 1개 파일이 있었는데 가져오기 하면서 1970(3) 폴더가 생긴다" 제보로 시작된
      // 로직) 조용히 새로 만들지 않고 사용자에게 먼저 물어본다: 기존 폴더에 합칠지, 새 폴더를
      // 따로 만들지.
      const createNewFolderFlow = (parentFolderId: string): void => {
        showMiniPopup({
          mode: 'prompt',
          title: '새 폴더 만들기',
          message: `영상 ${videos.length}개를 담을 새 폴더 이름을 확인하거나 수정하세요.`,
          note: countNote,
          initialValue: title || '가져온 재생목록',
          confirmLabel: '가져오기',
          onSubmit: async (name) => {
            const trimmed = name.trim();
            if (!trimmed) throw new Error('폴더 이름을 입력하세요.');
            if (videos.length === 0) throw new Error('가져올 영상이 없습니다.');
            const data = await load();
            const existingFolder = folderChildren(data, parentFolderId).find((f) => f.name === trimmed);

            if (existingFolder) {
              showMiniPopup({
                mode: 'confirm',
                title: '같은 이름의 폴더가 이미 있습니다',
                message: `"${trimmed}" 폴더가 이미 있습니다. 이 폴더에 가져올까요?`,
                note: '기존 폴더를 선택하면 이미 있는 것과 이름이 같은 영상은 제외하고 나머지만 추가합니다. 새 폴더를 만들면 중복 여부와 상관없이 재생목록 전체를 그대로 가져옵니다.',
                confirmLabel: '기존 폴더에 가져오기',
                cancelLabel: '새 폴더 만들기',
                onSecondary: async () => {
                  const newFolder = await createFolder(parentFolderId, trimmed);
                  await finishImport(newFolder.id, false);
                },
                onSubmit: async () => {
                  await finishImport(existingFolder.id, true);
                }
              });
              return;
            }

            const folder = await createFolder(parentFolderId, trimmed);
            await finishImport(folder.id, false);
          }
        });
      };

      // "다른 폴더에 넣기" — 매니저 탭의 MoveDialog.tsx와 같은 역할이지만 content script는
      // React를 안 쓰므로 miniPopup의 'pick-folder' 모드로 동등하게 구현. 휴지통은
      // folderChildren이 원래 제외하므로 목록에 안 뜬다.
      const buildFolderRows = (data: TubeStoreData): { id: string; label: string; depth: number }[] => {
        const rows: { id: string; label: string; depth: number }[] = [];
        const root = data.nodes[data.rootId];
        rows.push({ id: data.rootId, label: '🏠 ' + (root?.name ?? '튜브폴더'), depth: 0 });
        const walk = (pid: string, depth: number) => {
          for (const f of folderChildren(data, pid)) {
            rows.push({ id: f.id, label: (f.icon || DEFAULT_FOLDER_ICON) + ' ' + f.name, depth });
            walk(f.id, depth + 1);
          }
        };
        walk(data.rootId, 1);
        return rows;
      };

      // (2026-09-09, "'이 재생목록 가져오기'도 새 폴더/현재 폴더/다른 폴더 중 선택하게 해달라"
      // 요청) "현재 폴더"는 매니저 탭의 currentFolderId와 달리 유튜브 페이지엔 원래 없는
      // 개념이라, 우선순위를 정했다: ①매니저 탭에 지금(마지막으로) 열려있는 폴더 → ②직전에
      // 재생목록을 가져왔던 폴더 → ③(둘 다 없으면) 최상위 폴더(2026-09-10, "바로 직전에 보고
      // 있던 폴더로 나오게 해달라" 피드백으로 ①②순서를 뒤집음 — resolveCurrentFolderId 참고).
      // resolveCurrentFolderId가 유효성 검증(삭제됨·휴지통 이동됨 여부)까지 포함해 계산한다.
      // "새 폴더 만들기"도 이 폴더 안에 만든다(매니저 탭의 "새 폴더 만들기"가 currentFolderId
      // 안에 만드는 것과 같은 원칙).
      const data = await load();
      const currentFolderId = resolveCurrentFolderId(data, await getLastImportFolderId(), await getOpenFolderId());
      const currentFolderName = data.nodes[currentFolderId]?.name ?? '튜브폴더';

      showMiniPopup({
        mode: 'choices',
        title: '재생목록 가져오기',
        message: `영상 ${videos.length}개를 가져올 위치를 선택하세요.`,
        note: countNote,
        choices: [
          { id: 'new', label: '📁 새 폴더 만들기' },
          { id: 'current', label: `📂 현재 폴더에 넣기 (${currentFolderName})` },
          { id: 'other', label: '🗂️ 다른 폴더에 넣기' }
        ],
        onChoice: (id) => {
          if (id === 'new') {
            createNewFolderFlow(currentFolderId);
            return;
          }
          if (id === 'current') {
            confirmAndImport(currentFolderId, currentFolderName);
            return;
          }
          // id === 'other'
          const rows = buildFolderRows(data);
          showMiniPopup({
            mode: 'pick-folder',
            title: '📁 폴더 선택',
            message: `영상 ${videos.length}개를 가져올 폴더를 선택하세요.`,
            folders: rows,
            onPickFolder: (folderId) => {
              const picked = data.nodes[folderId];
              confirmAndImport(folderId, picked?.name ?? '');
            }
          });
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
