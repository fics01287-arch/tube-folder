// content.ts — 유튜브 페이지에 주입되는 콘텐츠 스크립트.
// background가 컨텍스트 메뉴 클릭을 감지해 보내는 "미니 팝업을 띄워라" 메시지를 받아
// 실제 입력 UI(miniPopup)를 페이지 위에 렌더링하고, 확인되면 storage 계층을 직접 호출해
// 반영한다(content script도 "storage" 권한으로 chrome.storage.local에 접근 가능).

import { showMiniPopup } from './miniPopup';
import { createFolder, renameFolder, trashFolder } from '../storage/folderOps';
import type { BackgroundToContentMessage } from '../shared/messages';

function flashBadge(text: string, color: string): void {
  chrome.runtime.sendMessage({ type: 'TF_FLASH_BADGE', text, color });
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
        await trashFolder(folderId);
        flashBadge('🗑', '#888888');
      }
    });
  }
});
