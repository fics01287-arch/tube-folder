// background ↔ content 메시징 프로토콜.
// 폴더 추가·이름변경·삭제는 UI(입력창)가 유튜브 페이지 위에 떠야 하므로, 실제 DOM을 가진
// content script에서만 렌더링 가능 — background는 "무엇을 물어볼지"만 지시하고,
// 저장소 반영은 content script가 storage 계층을 직접 호출해서 처리한다(둘 다 접근 가능).

export type FolderPromptMode = 'new-folder' | 'rename-folder' | 'delete-folder';

export interface ShowFolderPromptMessage {
  type: 'TF_SHOW_FOLDER_PROMPT';
  mode: FolderPromptMode;
  /** new-folder일 때: 생성될 부모 폴더 id */
  parentId?: string;
  /** rename-folder/delete-folder일 때: 대상 폴더 id */
  folderId?: string;
  /** rename-folder일 때: 입력창 초기값으로 쓸 현재 이름 */
  folderName?: string;
}

export interface FlashBadgeMessage {
  type: 'TF_FLASH_BADGE';
  text: string;
  color: string;
}

export type BackgroundToContentMessage = ShowFolderPromptMessage;
export type ContentToBackgroundMessage = FlashBadgeMessage;
