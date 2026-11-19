// 재생 큐 진행 중 화면에 떠 있는 "이전/다음" 컨트롤 위젯 — 2026-09-10, "재생 중에 다음 파일로
// 건너뛰기, 이전 파일로 되돌아가기" 요청으로 신설. miniPopup.ts와 같은 Shadow DOM 격리 원칙(유튜브
// 자체 스타일과 절대 섞이지 않게)은 따르되, miniPopup은 화면을 덮는 모달이고 이 위젯은 영상 재생을
// 가리지 않고 페이지가 살아있는 동안 계속 떠 있어야 하는 별개의 생명주기라 파일을 분리했다.
// 화면 오른쪽 위 구석에 작은 알약 모양으로 고정한다(아래 2026-09-11 기록 참고 — 원래는 오른쪽
// "아래" 구석이었다가 위로 옮겼다).
//
// (2026-09-11, 산들 실사용 제보로 발견한 버그 수정 ①) 일반 watch 페이지(추천영상 사이드바가 있는
// 넓은 레이아웃)에서는 위젯이 정상적으로 보였지만, 유튜브의 "노래(Topic 채널 음원)" 전용
// 풀블리드(fullbleed) 레이아웃 — 앨범아트가 화면 전체를 꽉 채우는 화면 — 에서는 개발자도구로
// 확인해보면 위젯이 DOM에 정확한 좌표(position:fixed, 화면 안쪽)로 존재하는데도 화면에는 전혀 안
// 보이는 현상이 재현됐다. z-index를 아무리 올려도(2147483647, 사실상 최댓값) 못 이기는 상대가
// 있다는 뜻인데, 브라우저에는 일반적인 z-index 경쟁 규칙과 무관하게 항상 그 위에 그려지는 별도의
// "top layer"가 있다(네이티브 <dialog>·전체화면 등). 그 풀블리드 레이아웃이 내부적으로 이런 top
// layer류 메커니즘을 쓰고 있을 가능성이 높다고 보고, 우리 위젯도 같은 top layer에 들어가는
// 표준 Popover API(`popover` 속성 + showPopover())로 전환했다 — 이러면 z-index 경쟁 자체를
// 벗어나 브라우저 top layer 안에서 "가장 나중에 열린 것이 맨 위" 규칙만 적용되므로, 웬만한
// 페이지 자체 오버레이보다 항상 위에 그려진다(우리 위젯은 그 페이지가 이미 다 그려진 뒤에
// content script가 실행되며 여는 것이라 거의 항상 "가장 나중"이 된다). Popover API 미지원
// 브라우저(구형 Chrome)를 위해 지원 여부를 확인해 안 되면 기존 방식(그냥 DOM에 추가)으로
// 조용히 폴백한다 — 완전히 안 보이는 것보다는 예전처럼 대부분의 페이지에서라도 보이는 게 낫다.
//
// (2026-09-11, 버그 수정 ② — ①로도 해결이 안 돼서 추가로 찾은 진짜 원인) ①을 적용한 뒤에도
// 산들 실제 화면에서는 여전히 안 보였는데, "개발자도구를 열어두면 보이고 닫으면 사라진다"는
// 결정적 제보로 진짜 원인을 찾았다: 이 풀블리드 "노래" 레이아웃은 영상 플레이어 높이를 뷰포트
// 크기에 맞춰 자동으로 늘렸다 줄였다 한다(개발자도구가 열려 뷰포트가 작아지면 플레이어도 작아지고,
// 닫혀서 뷰포트가 커지면 플레이어도 같이 커짐). 위젯을 `bottom: 88px`(뷰포트 "아래"에서부터 고정)로
// 두고 있었기 때문에, 플레이어가 뷰포트에 맞춰 커지는 순간 그 자리를 플레이어 자신이 다시 덮어버린
// 것 — popover/top layer 여부와 무관하게, 애초에 위치 선정 자체가 "영상 크기가 변해도 항상 비어
// 있는 자리"가 아니었던 게 근본 원인이었다. 유튜브 헤더(검색창·해버거 메뉴가 있는 맨 위 띠)는
// 영상 크기와 무관하게 항상 고정된 높이라, 위젯을 화면 "위쪽"(`top: 12px`)으로 옮겨서 이 문제
// 자체가 애초에 생길 수 없게 만들었다. 일반 watch 페이지(사이드바 있는 넓은 레이아웃)에서도
// 영상 위쪽 오른편은 원래 비어있는 자리라 부작용은 없을 것으로 판단.
//
// (2026-09-11, 버그 수정 ③ — ②(위로 이동)로도 해결이 안 돼서 찾은 세 번째 원인) 위로 옮긴
// 뒤에도 산들 화면에서는 "개발자도구를 닫으면 사라진다"는 동일한 증상이 그대로 재현됐다 — 위치
// 문제(②)가 아니라는 뜻. 남은 유력한 설명은 이렇다: 개발자도구를 열고 닫을 때마다 브라우저
// 뷰포트 크기가 바뀌는데, 이 풀블리드 "노래" 레이아웃은 그 크기 변화를 계기로 유튜브 자신의
// 전체화면류 오버레이(우리와 마찬가지로 top layer를 쓰는 것으로 보임)를 다시 새로 열었다 닫았다
// 하는 것으로 보인다. top layer는 "가장 나중에 연 것이 맨 위"라 우리가 먼저 열어놨어도, 유튜브가
// 리사이즈 이후에 자기 것을 "다시" 열면 그게 새로 맨 위로 올라와 우리 위젯을 덮어버린다(우리
// 위젯의 화면 위치를 아무리 바꿔도 안 통했던 이유 — 유튜브 쪽 오버레이가 화면 전체를 덮는
// 것이라 어디로 옮기든 소용없었던 것). 정확한 내부 동작을 유튜브 소스 없이 100% 특정하긴
// 어렵지만, 원인이 무엇이든 "리사이즈가 일어나면 우리 popover를 다시 열어서 top layer 맨 위
// 자리를 재탈환"하면 방어적으로 해결된다 — 그래서 `window.resize` 이벤트가 잠잠해지면(짧은
// 디바운스) 위젯을 통째로 다시 그리도록 했다. 리사이즈 자체가 흔한 이벤트가 아니라(사용자가
// 창 크기를 실제로 바꾸거나 개발자도구를 여닫을 때만) 재생 중 버튼 깜빡임 등 부작용 위험도 낮음.
//
// 다만 이것만으로는 부족하다 — 산들이 이 문제를 처음 겪은 실제 상황(개발자도구를 아예 켜지 않고
// "선택 재생"으로 새 탭을 열어 그냥 시청)에는 애초에 리사이즈 이벤트 자체가 한 번도 안 일어난다.
// 즉 유튜브 쪽 오버레이가 "리사이즈를 계기로만" 다시 열리는 게 아니라 페이지 로드 후 어느 시점에
// 비동기로(우리 content script보다 늦게) 한 번은 스스로 열리는 것으로 보이며, 그 "첫 실행"
// 시점이 리사이즈와 무관하게 언제든 일어날 수 있다는 뜻이다. 그래서 리사이즈 감지만으로는
// 실제 사용 시나리오(개발자도구 무관)를 못 잡는다 — 안전하게 몇 초 간격으로 계속 top layer
// 맨 위 자리를 재확인·재탈환하는 보험을 추가로 걸어둔다(`reassertTopLayer` + `setInterval`).
// 이때는 위젯을 통째로 다시 만들지 않고 이미 떠 있는 host에 hidePopover()+showPopover()만
// 다시 호출한다 — 버튼(DOM 노드)은 그대로 유지되므로 마우스를 올려놓고 있거나 막 클릭하려던
// 순간에도 깜빡이거나 이벤트 리스너가 끊기는 부작용이 없다.

export interface QueueWidgetInfo {
  /** 1-based 표시용 위치(예: "2 / 5") */
  position: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

const CSS = `
  .tf-queue-widget {
    position: fixed; right: 12px; top: 12px; z-index: 2147483647;
    display: flex; align-items: center; gap: 2px;
    background: rgba(15, 15, 15, 0.88); color: #fff;
    border-radius: 999px; padding: 6px 6px 6px 10px;
    font-family: "Roboto", "Malgun Gothic", "맑은 고딕", sans-serif;
    font-size: 12px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }
  .tf-queue-btn {
    background: transparent; border: none; color: #fff; cursor: pointer;
    font-size: 13px; font-weight: 700; padding: 5px 9px; border-radius: 999px;
    line-height: 1; white-space: nowrap;
  }
  .tf-queue-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); }
  .tf-queue-btn:disabled { opacity: 0.35; cursor: default; }
  .tf-queue-pos { padding: 0 6px; color: #ccc; white-space: nowrap; }
  .tf-queue-close {
    background: transparent; border: none; color: #999; cursor: pointer;
    font-size: 13px; padding: 4px 7px; margin-left: 2px; border-radius: 999px; line-height: 1;
  }
  .tf-queue-close:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
`;

let host: HTMLElement | null = null;

/** 가장 최근에 showQueueWidget()을 호출한 인자 — 리사이즈 시 같은 내용으로 다시 그리기 위해
 * 기억해둔다(위 2026-09-11 버그 수정 ③ 참고). hideQueueWidget()이 호출되면 null로 비워져서,
 * 큐가 끝난 뒤에는 리사이즈가 일어나도 다시 그리지 않는다. */
let lastArgs: { info: QueueWidgetInfo; onPrev: () => void; onNext: () => void; onClose: () => void } | null = null;
let resizeHandlerAttached = false;
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let periodicReassertTimer: ReturnType<typeof setInterval> | null = null;

/** 이 브라우저가 Popover API(showPopover)를 지원하는지 — 지원하면 브라우저 "top layer"를 써서
 * 일반적인 z-index 경쟁을 아예 건너뛴다(위 상단 주석 참고). */
function supportsPopover(): boolean {
  return typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
}

/** window resize가 잠잠해지면(200ms 디바운스 — 창을 드래그로 늘리는 동안 계속 튀지 않도록) 위젯을
 * 마지막 상태 그대로 다시 그린다. 유튜브 쪽이 리사이즈를 계기로 자기 오버레이를 top layer 맨 위로
 * 다시 올리는 것으로 보이는 문제(버그 수정 ③)에 대한 방어적 대응 — 우리도 다시 열어서 맨 위 자리를
 * 재탈환한다. 큐가 끝나 hideQueueWidget()이 lastArgs를 비워두면 아무 것도 안 함. */
function ensureResizeHandler(): void {
  if (resizeHandlerAttached) return;
  resizeHandlerAttached = true;
  window.addEventListener('resize', () => {
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      if (!lastArgs) return;
      showQueueWidget(lastArgs.info, lastArgs.onPrev, lastArgs.onNext, lastArgs.onClose);
    }, 200);
  });
}

/** 이미 떠 있는 host를 통째로 다시 만들지 않고, popover만 닫았다 다시 열어서 top layer 맨 위
 * 자리를 재확인한다(위 2026-09-11 버그 수정 ③ 두 번째 문단 참고 — 리사이즈 없이도 유튜브 쪽이
 * 비동기로 자기 오버레이를 여는 경우에 대한 보험). 버튼 DOM 자체는 그대로라 클릭 리스너·호버
 * 상태가 끊기지 않는다. */
function reassertTopLayer(): void {
  if (!host || typeof host.showPopover !== 'function') return;
  try {
    host.hidePopover();
  } catch {
    // 이미 닫혀 있으면 예외가 나는데, 그래도 바로 아래에서 다시 열 거라 무시해도 안전하다.
  }
  try {
    host.showPopover();
  } catch {
    // 아주 드물게 실패해도 다음 주기에 다시 시도되므로 조용히 무시.
  }
}

/** 4초 간격으로 reassertTopLayer()를 돌린다. 큐가 끝나 hideQueueWidget()이 타이머를 정리하면
 * 다음 showQueueWidget() 호출 때 새로 시작된다. */
function ensurePeriodicReassert(): void {
  if (periodicReassertTimer) return;
  periodicReassertTimer = setInterval(reassertTopLayer, 4000);
}

/** 위젯을 화면에서 없앤다(큐가 끝났거나 이 페이지가 더 이상 큐 대상이 아닐 때). 이미 없으면 아무 일도 안 함. */
export function hideQueueWidget(): void {
  lastArgs = null;
  if (periodicReassertTimer) {
    clearInterval(periodicReassertTimer);
    periodicReassertTimer = null;
  }
  if (host) {
    // showPopover()로 연 요소는 remove() 전에 hidePopover()를 먼저 호출하지 않아도 DOM에서
    // 제거되면 top layer에서도 자동으로 빠지지만, 혹시 남아있는 참조가 있을 경우를 대비해
    // 명시적으로 닫아준다(지원 안 하는 브라우저에서는 hidePopover 자체가 없으니 존재 확인 후 호출).
    if (typeof host.hidePopover === 'function') {
      try {
        host.hidePopover();
      } catch {
        // 이미 닫혀있거나 popover 상태가 아니면 예외가 나는데(InvalidStateError), 어차피
        // 지금부터 remove()할 거라 무시해도 안전하다.
      }
    }
    host.remove();
    host = null;
  }
}

/** 위젯을 그리거나(이미 있으면 다시 그려 최신 위치/버튼 상태로 교체) 갱신한다. */
export function showQueueWidget(info: QueueWidgetInfo, onPrev: () => void, onNext: () => void, onClose: () => void): void {
  hideQueueWidget();
  lastArgs = { info, onPrev, onNext, onClose };
  ensureResizeHandler();
  ensurePeriodicReassert();

  host = document.createElement('div');
  host.id = 'tubefolder-queue-widget-host';
  // popover 요소의 브라우저 기본(UA) 스타일은 화면 한가운데에 테두리·배경이 있는 박스로 뜨도록
  // 되어 있다(position:fixed; inset:0; margin:auto; border:solid; background-color:Canvas 등) —
  // 우리가 원하는 건 그 기본 박스가 아니라 안(shadow DOM)의 `.tf-queue-widget`가 자기 자신의
  // position:fixed(오른쪽 아래 고정)로 따로 그려지는 것뿐이므로, host 자신은 화면에 아무 흔적도
  // 안 남도록 전부 0/투명으로 리셋한다. position:fixed인 자손은 부모(host)의 박스 크기·위치와
  // 무관하게 뷰포트 기준으로 그려지므로 이렇게 host를 0크기로 만들어도 내부 위젯 표시엔 영향 없다.
  host.style.cssText = 'position: fixed; inset: auto; margin: 0; padding: 0; border: none; background: transparent; width: 0; height: 0; overflow: visible; min-width: 0; min-height: 0;';
  const usePopover = supportsPopover();
  if (usePopover) {
    // 'manual' — 유튜브 페이지의 Esc 키 등 다른 popover/dialog 처리와 얽히지 않도록, 자동으로
    // 닫히는 'auto' 대신 우리가 직접 열고 닫는 수동 모드를 쓴다.
    host.setAttribute('popover', 'manual');
  }
  document.documentElement.appendChild(host);
  if (usePopover) {
    try {
      host.showPopover();
    } catch {
      // 아주 드물게(이미 열려있는 상태 등) 실패해도 아래 CSS의 position:fixed 자체는 여전히
      // 유효해서 대부분의 일반 페이지에서는 그냥 보인다 — 조용히 무시.
    }
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  shadow.appendChild(styleEl);

  const bar = document.createElement('div');
  bar.className = 'tf-queue-widget';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'tf-queue-btn';
  prevBtn.textContent = '⏮ 이전';
  prevBtn.disabled = !info.canPrev;
  prevBtn.title = info.canPrev ? '이전 영상' : '더 되돌아갈 영상이 없습니다';
  prevBtn.addEventListener('click', onPrev);
  bar.appendChild(prevBtn);

  const pos = document.createElement('span');
  pos.className = 'tf-queue-pos';
  pos.textContent = `${info.position} / ${info.total}`;
  bar.appendChild(pos);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'tf-queue-btn';
  nextBtn.textContent = '다음 ⏭';
  nextBtn.disabled = !info.canNext;
  nextBtn.title = info.canNext ? '다음 영상' : '더 재생할 영상이 없습니다';
  nextBtn.addEventListener('click', onNext);
  bar.appendChild(nextBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tf-queue-close';
  closeBtn.title = '재생목록 끄기';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', onClose);
  bar.appendChild(closeBtn);

  shadow.appendChild(bar);
}
