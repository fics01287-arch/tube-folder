// 실행취소(undo)/다시 실행(redo) 스택 — 이름변경/아이콘변경/순서변경/휴지통이동/이동, 5가지
// 실수를 되돌리고(또 필요하면 되돌린 것을 다시 적용하고) 싶을 때 쓰는 전체 스토어 스냅샷 기반 스택.
// (2026-08-29 신규 — "이동, 이름변경 같은 걸 실수했을 때 되돌리는 기능" 요청으로 undo 먼저 추가,
// 같은 날 "다시 실행 기능도 추가해줘" 요청으로 redo 추가)
//
// 왜 "직전 상태 전체 스냅샷 후 그대로 복원" 방식인가: chrome.storage/localStorage는 부분 저장
// API가 없고 항상 TubeStoreData 전체를 통째로 save()한다. 그래서 순서변경·이동처럼 "정확한
// 이전 위치"까지 복원해야 하는 역연산을 액션별로 따로 만드는 대신, 변경 직전 load()로 뜬
// 스냅샷을 그대로 다시 save()하는 방식이 5가지 모두를 동일하게, 훨씬 적은 코드로 처리한다.
// redo도 같은 원리 — "되돌리기 직전(=지금 되돌리려는 상태)"을 반대쪽 스택에 스냅샷으로 남겨두면,
// 되돌린 걸 다시 적용할 때도 save(snapshot) 한 번으로 끝난다.
//
// 화면 리렌더와 무관한 순수 데이터 구조라 React state가 아니라 모듈 전역 변수로 둔다 —
// App.tsx는 "지금 되돌릴 게/다시 적용할 게 있는지, 토스트에 뭘 보여줄지"만 별도의 가벼운
// state로 들고 있으면 됨.

import type { TubeStoreData } from '../storage/types';

export interface UndoEntry {
  /** 토스트/로그에 표시할 라벨, 예: `"고양이 영상" 이름 변경` */
  label: string;
  /** 이 항목이 가리키는 시점으로 되돌아가기 위해 그대로 save()할 전체 스토어 스냅샷 */
  snapshot: TubeStoreData;
}

const MAX_ENTRIES = 20;

let undoStack: UndoEntry[] = [];
let redoStack: UndoEntry[] = [];

function pushCapped(arr: UndoEntry[], entry: UndoEntry): void {
  arr.push(entry);
  if (arr.length > MAX_ENTRIES) arr.shift();
}

/**
 * 성공적으로 완료된 새 액션 하나를 실행취소 스택에 쌓는다. 20개를 넘으면 가장 오래된 것부터 버린다.
 * 되돌렸다가 다시 적용할 수 있던 "미래"(redo 스택)는 여기서 함께 비운다 — 새 변경이 생기면
 * 이전에 되돌린 상태로는 더 이상 "다시 실행"할 수 없다는, 문서편집기·IDE 등에서 흔한 관례를 따름.
 */
export function pushUndo(entry: UndoEntry): void {
  pushCapped(undoStack, entry);
  redoStack = [];
}

/** 가장 최근 액션을 꺼낸다(LIFO). 되돌릴 게 없으면 null. */
export function popUndo(): UndoEntry | null {
  return undoStack.pop() ?? null;
}

/**
 * performUndo()가 "지금 되돌리기 직전 상태"를 다시 실행용으로 남겨둘 때 쓴다.
 * pushUndo()와 달리 반대쪽(undo) 스택을 비우지 않는다 — undo→redo→undo…를 오갈 때
 * 매번 서로의 기록을 지워버리면 한 번씩만 오갈 수 있게 되므로.
 */
export function pushRedo(entry: UndoEntry): void {
  pushCapped(redoStack, entry);
}

/** 가장 최근에 되돌렸던 액션을 꺼낸다(LIFO). 다시 적용할 게 없으면 null. */
export function popRedo(): UndoEntry | null {
  return redoStack.pop() ?? null;
}

/**
 * performRedo()가 "지금 다시 적용하기 직전 상태"를 실행취소용으로 남겨둘 때 쓴다.
 * pushUndo()와 동작이 비슷해 보이지만 redo 스택을 비우지 않는다는 점이 다르다 — redo로 다시
 * 적용한 것도 "새 변경"이 아니라 원래 스택을 오가는 이동일 뿐이라 미래(redo 기록)를 지우면 안 됨.
 */
export function pushUndoFromRedo(entry: UndoEntry): void {
  pushCapped(undoStack, entry);
}

/** 실행취소 스택 맨 위 라벨만 필요할 때(토스트 텍스트 등) — 꺼내지 않고 들여다보기만 함. */
export function peekUndoLabel(): string | null {
  return undoStack.length ? undoStack[undoStack.length - 1].label : null;
}

/** 다시 실행 스택 맨 위 라벨만 필요할 때 — 꺼내지 않고 들여다보기만 함. */
export function peekRedoLabel(): string | null {
  return redoStack.length ? redoStack[redoStack.length - 1].label : null;
}

/** 테스트/디버그용 — 필요 시 두 스택을 완전히 비운다. */
export function clearUndo(): void {
  undoStack = [];
  redoStack = [];
}
