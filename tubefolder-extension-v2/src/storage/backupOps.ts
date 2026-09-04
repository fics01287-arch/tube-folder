// JSON 백업(내보내기·가져오기) — ROADMAP 4단계 "JSON 백업(내보내기·가져오기)", 작업순서 8/8.
// 다른 7개 확장 기능과 데이터·UI 어느 쪽도 겹치지 않는 완전히 독립적인 기능이라 별도 파일로 분리
// (folderOps.ts에 더 얹지 않음 — 그 파일은 이미 CRUD 전용으로 충분히 큼).
//
// 내보내기는 현재 저장소 전체(TubeStoreData)를 JSON으로 직렬화만 하면 되니 단순하다. 가져오기가
// 까다로운 지점은 두 가지:
//  1) 파일 형식 검증 — storage.ts의 migrate()는 관대해서(불변식만 보정, 형식이 안 맞으면 조용히
//     emptyStore()로 대체) 아무 JSON이나 넣어도 "성공"해버려 사용자가 실수로 데이터를 통째로 빈
//     상태로 만들 수 있다. 그래서 이 파일만의 얇은 형식 마커({app, formatVersion, data})로 먼저
//     "이거 진짜 튜브폴더 백업 파일 맞아?"를 확인한 다음에만 migrate()에 넘긴다.
//  2) 병합 시 ID 충돌 — 가져온 파일의 노드 id가 지금 기기의 노드 id와 우연히 겹칠 수 있으므로,
//     병합은 항상 새 id를 발급해 재부모화한다(우클릭 클립보드의 duplicateNode()와 완전히 같은
//     패턴 — 다만 그쪽은 "이미 메모리에 있는 노드 하나"를 복제하고 이쪽은 "방금 가져온 파일 전체
//     트리"를 복제한다는 점만 다르다). 휴지통 내용물은 병합 대상에서 제외한다 — 백업을 가져왔는데
//     상대방이 지워서 잊고 있던 항목까지 부활하면 당황스러우므로.

import type { FolderNode, TubeNode, TubeStoreData } from './types';
import { load, save, now, uid, uniqueName, newNodeMeta, migrate } from './storage';
import { FolderOpError } from './folderOps';
import { FREE_FOLDER_LIMIT, FREE_VIDEO_LIMIT, isPaidCached, LicenseLimitError } from '../license/licenseEngine';
import { isLicenseAvailable } from '../license/licenseManager';

const BACKUP_APP_MARKER = 'tubefolder-backup';
const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP_MARKER;
  formatVersion: number;
  exportedAt: number;
  data: TubeStoreData;
}

/** 지금 저장소 전체를 백업 파일 문자열(JSON, 들여쓰기 포함 — 사람이 열어봐도 읽을 수 있게)로 직렬화. */
export async function exportBackup(): Promise<string> {
  const data = await load();
  const payload: BackupFile = {
    app: BACKUP_APP_MARKER,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now(),
    data
  };
  return JSON.stringify(payload, null, 2);
}

/** 파일 텍스트를 파싱하고 "튜브폴더 백업 파일" 형식인지만 얇게 확인한다(내용 보정은 migrate()가 함). */
export function parseBackupFile(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FolderOpError('올바른 JSON 파일이 아닙니다.');
  }
  const p = parsed as Partial<BackupFile> | null;
  if (
    !p ||
    typeof p !== 'object' ||
    p.app !== BACKUP_APP_MARKER ||
    !p.data ||
    typeof p.data !== 'object' ||
    !p.data.nodes ||
    typeof p.data.nodes !== 'object'
  ) {
    throw new FolderOpError('튜브폴더 백업 파일 형식이 아닙니다. 이 앱에서 다운로드한 JSON 파일인지 확인해 주세요.');
  }
  return p as BackupFile;
}

function childrenOfLocal(data: TubeStoreData, parentId: string): TubeNode[] {
  const result: TubeNode[] = [];
  for (const k in data.nodes) {
    if (data.nodes[k].parentId === parentId) result.push(data.nodes[k]);
  }
  return result;
}

function nextOrderLocal(data: TubeStoreData, parentId: string): number {
  let order = 0;
  for (const k in data.nodes) {
    const n = data.nodes[k];
    if (n.parentId === parentId && n.id !== data.trashId && (n.order || 0) >= order) order = (n.order || 0) + 1;
  }
  return order;
}

/** 병합 대상(가져온 파일의 최상위 폴더 밑, 휴지통 제외) 전체를 재귀로 모은다 — 한도 검사용 사전 집계. */
function collectMergeCandidates(imported: TubeStoreData): TubeNode[] {
  const top = childrenOfLocal(imported, imported.rootId).filter((n) => n.id !== imported.trashId);
  const result: TubeNode[] = [];
  const queue: TubeNode[] = [...top];
  while (queue.length) {
    const n = queue.shift() as TubeNode;
    result.push(n);
    if (n.type === 'folder') {
      queue.push(...childrenOfLocal(imported, n.id).filter((c) => c.id !== imported.trashId));
    }
  }
  return result;
}

function countUserFoldersLocal(data: TubeStoreData): number {
  let n = 0;
  for (const k in data.nodes) {
    const node = data.nodes[k];
    if (node.type === 'folder' && node.id !== data.rootId && node.id !== data.trashId) n++;
  }
  return n;
}

function countVideosLocal(data: TubeStoreData): number {
  let n = 0;
  for (const k in data.nodes) {
    if (data.nodes[k].type === 'video') n++;
  }
  return n;
}

/**
 * 병합 — 가져온 파일의 최상위 폴더들을 지금 루트 밑에 새 폴더로 추가한다(duplicateNode()와 같은
 * "새 id 발급 + uniqueName 충돌 회피 + order 원본 순서 유지" 패턴). 기존 데이터는 전혀 건드리지
 * 않으므로 실행취소 스냅샷은 "가져오기 직전 상태"만 있으면 충분(pushUndo는 호출부(UI)에서 처리).
 */
export async function mergeFromBackup(file: BackupFile): Promise<{ before: TubeStoreData; addedFolders: number; addedVideos: number }> {
  const before = await load();
  // before는 그대로 실행취소 스냅샷으로 반환해야 하므로 절대 변형하지 않는다 — 뒤에서 mutate할
  // data는 깊은 복사본으로 별도로 마련한다.
  const data = JSON.parse(JSON.stringify(before)) as TubeStoreData;
  const imported = await migrate(JSON.parse(JSON.stringify(file.data)));

  const candidates = collectMergeCandidates(imported);
  const gateActive = isLicenseAvailable() && !(await isPaidCached());
  if (gateActive) {
    const newFolderCount = candidates.filter((n) => n.type === 'folder').length;
    const newVideoCount = candidates.filter((n) => n.type === 'video').length;
    if (countUserFoldersLocal(data) + newFolderCount > FREE_FOLDER_LIMIT) {
      throw new LicenseLimitError(
        'folder-limit',
        `무료 버전은 폴더를 최대 ${FREE_FOLDER_LIMIT}개까지 만들 수 있습니다. 업로드할 파일에 폴더가 너무 많아 병합할 수 없습니다 — 업그레이드가 필요합니다.`
      );
    }
    if (countVideosLocal(data) + newVideoCount > FREE_VIDEO_LIMIT) {
      throw new LicenseLimitError(
        'video-limit',
        `무료 버전은 영상을 최대 ${FREE_VIDEO_LIMIT}개까지 담을 수 있습니다. 업로드할 파일에 영상이 너무 많아 병합할 수 없습니다 — 업그레이드가 필요합니다.`
      );
    }
  }

  const t = now();
  const meta = await newNodeMeta();
  const idMap = new Map<string, string>();

  function cloneOne(orig: TubeNode, newParentId: string, siblingsForOrder: TubeNode[]): TubeNode {
    const newId = uid();
    idMap.set(orig.id, newId);
    const clone: TubeNode = {
      ...orig,
      id: newId,
      parentId: newParentId,
      name: uniqueName(siblingsForOrder, orig.name),
      order: nextOrderLocal(data, newParentId),
      createdAt: t,
      modifiedAt: t,
      ...meta
    };
    delete clone.prevParentId;
    if (clone.type === 'folder') delete (clone as FolderNode).system; // 방어적: 최상위/휴지통은 애초에 후보에서 제외되지만 혹시 몰라 한 번 더 확인
    data.nodes[newId] = clone;
    siblingsForOrder.push(clone);
    return clone;
  }

  const destSiblings = childrenOfLocal(data, data.rootId).filter((n) => n.id !== data.trashId);
  const topLevelImported = childrenOfLocal(imported, imported.rootId).filter((n) => n.id !== imported.trashId);

  for (const node of topLevelImported) {
    cloneOne(node, data.rootId, destSiblings);
  }

  // 원본 순서(order)대로 자식을 복제해야 사본도 같은 순서를 유지한다(duplicateNode()와 동일 이유).
  const queue: string[] = topLevelImported.filter((n) => n.type === 'folder').map((n) => n.id);
  while (queue.length) {
    const origParentId = queue.shift() as string;
    const newParentId = idMap.get(origParentId) as string;
    const kids = childrenOfLocal(imported, origParentId)
      .filter((n) => n.id !== imported.trashId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const newSiblings = childrenOfLocal(data, newParentId);
    for (const kid of kids) {
      cloneOne(kid, newParentId, newSiblings);
      if (kid.type === 'folder') queue.push(kid.id);
    }
  }

  await save(data);
  return {
    before,
    addedFolders: candidates.filter((n) => n.type === 'folder').length,
    addedVideos: candidates.filter((n) => n.type === 'video').length
  };
}

/**
 * 덮어쓰기 — 지금 데이터를 전부 버리고 가져온 파일로 완전히 대체한다(매우 파괴적 — 호출부(UI)가
 * 반드시 확인 절차를 거친 뒤에만 불러야 함). migrate()로 정규화해서 구버전 백업이나 살짝 손상된
 * 파일도 최대한 복구해서 받아들인다. 노드의 원래 수정 이력(deviceId·version·modifiedAt)은 "복원"
 * 개념이라 일부러 건드리지 않고 백업 파일 그대로 둔다(다른 실행취소 스냅샷 복원과 동일한 원칙).
 */
export async function overwriteFromBackup(file: BackupFile): Promise<{ before: TubeStoreData }> {
  const before = await load();
  const normalized = await migrate(JSON.parse(JSON.stringify(file.data)));

  const gateActive = isLicenseAvailable() && !(await isPaidCached());
  if (gateActive) {
    const folderCount = countUserFoldersLocal(normalized);
    const videoCount = countVideosLocal(normalized);
    if (folderCount > FREE_FOLDER_LIMIT) {
      throw new LicenseLimitError(
        'folder-limit',
        `무료 버전은 폴더를 최대 ${FREE_FOLDER_LIMIT}개까지 만들 수 있습니다. 업로드할 파일의 폴더 수가 한도를 넘어 덮어쓸 수 없습니다 — 업그레이드가 필요합니다.`
      );
    }
    if (videoCount > FREE_VIDEO_LIMIT) {
      throw new LicenseLimitError(
        'video-limit',
        `무료 버전은 영상을 최대 ${FREE_VIDEO_LIMIT}개까지 담을 수 있습니다. 업로드할 파일의 영상 수가 한도를 넘어 덮어쓸 수 없습니다 — 업그레이드가 필요합니다.`
      );
    }
  }

  await save(normalized);
  return { before };
}

/**
 * 가져오기 전 미리보기용 — 백업 파일 안에 폴더·영상이 총 몇 개 들어있는지 센다. 최상위/휴지통
 * 폴더 노드 자체만 제외하고 나머지는 전부 포함(휴지통 "안"에 있던 항목도 포함) — 덮어쓰기를 하면
 * 그 항목들도 그대로 살아나므로 "이 파일에 들어있는 전체 항목 수"로 보여주는 게 정확하다. 병합은
 * 실제로는 이 중 휴지통 안 항목을 제외하고 최상위 폴더만 가져오므로 그 정확한 수는
 * mergeFromBackup()의 반환값(addedFolders/addedVideos)을 따로 쓴다.
 */
export function previewBackupCounts(file: BackupFile): { folders: number; videos: number } {
  let folders = 0;
  let videos = 0;
  const trashId = file.data.trashId;
  for (const k in file.data.nodes) {
    const n = file.data.nodes[k];
    if (n.id === file.data.rootId || n.id === trashId) continue;
    if (n.type === 'folder') folders++;
    else videos++;
  }
  return { folders, videos };
}
