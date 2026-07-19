# AGENTS.md — 자율 에이전트용 작업 지침 (자가진화 가이드)

> 이 파일은 **사람이 아니라 코드를 고치는 AI 에이전트**를 위한 것이다.
> 오류 수정·기능 개선을 할 때 **여기 적힌 절차·불변식·회귀 테스트를 반드시 지켜라.**
> 설계 배경은 [docs/](docs/)에 있다: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATA-MODEL](docs/DATA-MODEL.md) · [ALGORITHMS](docs/ALGORITHMS.md) · [GAP-ANALYSIS-AND-ROADMAP](docs/GAP-ANALYSIS-AND-ROADMAP.md)

---

## 0. 작업 원칙 (Karpathy)
1. **먼저 생각** — 추측 금지. 불확실하면 가정을 명시하고, 해석이 여럿이면 전부 노출.
2. **단순함 우선** — 요청 안 한 기능·추상화 금지. 프레임워크/빌드툴 도입 금지(아래 함정 P1).
3. **외과적 변경** — 건드릴 것만. 무관 코드 리팩터·삭제 금지. 기존 스타일(vanilla ES5풍, IIFE)에 맞춰라.
4. **목표 지향** — "버그 수정"=재현 테스트부터. §6 회귀 테스트가 통과할 때까지 반복.

---

## 1. 프로젝트 한 줄 요약
유튜브 영상을 탐색기처럼 무제한 폴더로 정리하는 **MV3 크롬 확장 + PWA 웹앱**. **의존성 0**(순수 HTML/CSS/JS, 빌드 없음). 같은 UI 코드가 확장/웹 두 런타임에서 돈다.

## 2. 실행·검증 환경 (반드시 이대로 재현)

### 2-1. 문법 검증 (모든 변경 후 필수)
```bash
node --check storage.js
node --check background.js
node --check app.js
node --check sw.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('manager.webmanifest','utf8'))"
```
> `app.js`는 브라우저 전역(document/window/fetch/prompt)을 쓰므로 `node --check`는 **문법만** 검증한다(정상).

### 2-2. 동작 검증 (정적 서버 + 브라우저)
확장은 `chrome://extensions`에서 "압축해제된 확장 로드"로 수동 로드. 자동화 검증은 정적 서버로:
- 저장소 루트(`tubefolder-extension`의 부모)에 `_preview_server.js`가 있고 `node _preview_server.js` → `http://localhost:8731`에서 `manager.html` 서빙(`.claude/launch.json`의 `tubefolder`).
- 웹 컨텍스트에선 `chrome.storage`가 없어 `storage.js`가 **localStorage 폴백**으로 동작 → 로직 검증 가능.

### 2-3. 깨끗한 상태로 리셋
```js
localStorage.removeItem('tubefolder_v1'); location.reload();
```
> 페이지가 reload되면 클릭이 유실될 수 있다(함정 P6). reload 후 **한 박자 쉬고** 상호작용하라.

## 3. 코드 지도 (파일별 책임 + 핵심 심볼)

| 파일 | 책임 | 진입/핵심 심볼 |
|---|---|---|
| `manifest.json` | MV3 정의·권한 | `permissions`, `host_permissions`, `background.service_worker` |
| `background.js` | 확장 SW: 아이콘→탭, 우클릭→추가 | `action.onClicked`, `contextMenus.onClicked`, `flashBadge` |
| `storage.js` | 저장 백엔드 추상화 + 공용 헬퍼 | `TubeStore.{load,save,emptyStore,migrate,extractVideoId,fetchMeta,addVideo,uniqueName,uid}` |
| `app.js` | 상태기계 + 모든 UI/알고리즘 | `init`→`render`; 조작: `moveNodes/trashNodes/restoreNodes/purgeNodes/deepCopy/reorder`; `pushUndo/undo`; `compareNodes/buildDescMemo`; `setupMarquee/onKey/handleDrop` |
| `manager.html` | UI 골격 + PWA 등록 | 툴바 버튼 id(`#btn-*`), `#content`, `#tree`, `#ctxmenu` |
| `manager.css` | 테마·6보기모드·반응형·마퀴 | `.view-*`, `.item`, `.marquee`, `.item.cut` |
| `sw.js` | PWA 오프라인 캐시(웹 전용) | install/activate/fetch(network-first), `CACHE` 버전 |

> **라인 번호 대신 함수명으로 참조하라**(라인은 변한다). 변경 시 grep으로 심볼을 찾아라.

## 4. 절대 불변식 (깨면 안 됨) + 자가 점검법

| # | 불변식 | 점검 |
|---|---|---|
| I1 | `nodes.root` 존재 & `parentId===null` (유일 무부모) | `migrate()`가 보장. 조작 함수가 root 가드 |
| I2 | `nodes.trash` 존재 & `system==='trash'` & `parentId===rootId` | 동일 |
| I3 | **휴지통은 렌더에서 루트 맨 마지막 고정**(정렬·이동 무관) | `listFolder()`가 강제. → 회귀 R1 |
| I4 | root/trash는 이동·복사·삭제·이름변경 불가 | 각 조작 함수의 `if (id===root||id===trash) skip` |
| I5 | 폴더는 자기/자기하위로 이동 불가(사이클 금지) | `moveNodes`의 `isDescendant` 가드 → 회귀 R4 |
| I6 | 모든 구조 변경 전 `pushUndo()` → `Ctrl+Z` 복원 가능 | → 회귀 R3 |
| I7 | 저장 키는 `tubefolder_v1`, 스키마 `DATA_VERSION` | 바꾸면 `migrate()` 단계 추가 필수 |
| I8 | 같은 폴더 새 폴더/복사 시 이름 `(2)` 자동 | `uniqueName()` → 회귀 R2 |
| I9 | SW(`background.js`/`sw.js`) 이벤트 리스너는 **최상위 동기 등록** | 비동기 등록 시 이벤트 유실(함정 P3) |

## 5. 기능을 안전하게 추가/수정하는 표준 패턴

모든 상태 변경은 이 순서를 지켜라(app.js):
```
function 새조작(...) {
  pushUndo();                 // 1) 변경 전 스냅샷 (구조 변경일 때)
  // 2) store.nodes 직접 변형 (parentId/order/name/... )
  //    - root/trash 가드, 사이클 가드 잊지 말 것
  if (변경없음) { undoStack.pop(); return; }   // 빈 변경은 undo 오염 방지
  scheduleSave();             // 3) 디바운스 저장(200ms)
  render();                   // 4) 전체 재렌더(파생 UI 갱신)
}
```
- **저장 키나 노드 스키마를 바꾸면** `storage.js`의 `migrate()`에 변환을 추가하고 `DATA_VERSION`을 올려라.
- **새 영상 필드**가 필요하면 `addOne()`/`TubeStore.addVideo()` 양쪽에 추가(컨텍스트 메뉴 경로 포함).
- UI는 항상 `store`의 파생물이다. **DOM을 직접 진실로 삼지 마라** — store를 고치고 render() 하라.

## 6. 회귀 테스트 (변경 후 미리보기 콘솔에서 실행 — 전부 통과해야 함)

> 깨끗한 상태(§2-3)에서 시작. 클릭은 `btn.click()`로(함정 P6).

```js
// R1+R2+R3: 생성·중복이름·휴지통고정·실행취소
(function(){
  function L(){return Array.from(document.querySelectorAll('#content .item .label')).map(function(l){var i=l.querySelector('input');return i?i.value:l.textContent;});}
  var b=document.querySelector('#btn-new-folder'); b.click(); b.click();
  var inp=document.querySelector('#content .label input'); if(inp) inp.blur();
  var made=L();                                  // 기대: ["새 폴더","새 폴더 (2)","휴지통"]  (R2,R1)
  function cz(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));}
  cz(); cz();
  var undone=L();                                // 기대: ["휴지통"]  (R3)
  console.log(JSON.stringify({made:made,undone:undone, R1_trashLast: made[made.length-1]==='휴지통'}));
})();
```
```js
// R4: 사이클 방지 — 폴더를 자기 하위로 이동 시도해도 변하지 않음 (코드 점검)
//   moveNodes(ids, target) 에 isDescendant(target, id) 가드가 있는지 grep 으로 확인.
```
- **콘솔 에러 0건** 확인: `preview_console_logs level:error` → "No console logs".
- 추가로 손댄 기능의 **재현 테스트를 직접 작성**해 통과시켜라(약한 기준 금지).

## 7. 흔한 함정 (P) — 반복 금지

| P | 함정 | 올바른 대응 |
|---|---|---|
| P1 | CRA/React/Vite로 빌드하려다 MV3 CSP 충돌 | **빌드툴 도입 금지.** 순수 JS 유지(루트의 `youtube-manager-extension`은 버려진 CRA 스텁이니 건드리지 말 것) |
| P2 | `youtube.com/oembed`를 웹에서 fetch → CORS 차단 | `TubeStore.fetchMeta`가 **noembed.com 폴백**으로 처리. 확장에선 host_permission으로 oembed 직통 |
| P3 | SW 리스너를 비동기/조건부 등록 → 이벤트 유실 | 최상위에서 동기 등록(I9) |
| P4 | `storage.local` 10MB 초과 우려 | manifest에 `unlimitedStorage` 있음. 초대형은 IndexedDB 이전(로드맵) |
| P5 | 정렬에서 하위개수를 비교마다 재계산 → O(N²logN) | `buildDescMemo()`(렌더당 1회)로 캐시된 `descMemo` 사용 |
| P6 | 미리보기 자동화에서 `preview_click`이 안 먹거나 reload 직후 클릭 유실 | `el.click()` 직접 호출 사용 + reload 후 상호작용 분리 |
| P7 | DOM을 직접 고치고 store를 안 고침 → 재렌더 시 사라짐 | store를 진실로, render()로 반영 |
| P8 | 마퀴 드래그 후 빈영역 click이 선택 해제 | `marqueeMoved` 가드 유지 |

## 8. 빌드·패키징 (배포본 갱신)
```powershell
# tubefolder-extension 폴더를 단일 zip으로 (node_modules·빌드산출물 없음)
Compress-Archive -Path .\tubefolder-extension\* -DestinationPath .\tubefolder-extension.zip -Force
```
- `manifest.json`의 `version`을 의미 있는 변경마다 올려라(SemVer).
- `sw.js`의 `CACHE` 문자열도 함께 올려야 PWA 사용자에게 새 코드가 반영된다.
- `_preview_server.js`·`.claude/`는 **배포 zip에 넣지 마라**(검증 전용).

## 9. 자가진화 루프 (이 순서로 반복)
```
① 증상/요청을 검증가능한 목표로 변환 (재현 eval 또는 실패 테스트 작성)
② §3 코드지도로 책임 파일·함수 특정 (grep)
③ §5 패턴으로 최소 변경 (외과적)
④ §2 문법검증 + §6 회귀 전부 통과 + 콘솔 에러 0
⑤ 영향받은 docs/ 갱신 (코드만 바꾸고 문서 방치 금지)
⑥ §8 재패키징 + manifest/sw 버전 상향
⑦ 무엇을 왜 바꿨는지 1줄 기록
```
- 불확실하거나 불변식(§4)을 건드려야 하면 **멈추고 사람에게 질문**하라.
- 파괴적 행동(대량 삭제·스키마 변경) 전엔 반드시 ④까지 통과시켜라.

## 10. 확장 포인트 (다음 작업이 들어올 자리)
| 작업 | 손댈 곳 |
|---|---|
| 클라우드 자동 동기화(구글 드라이브 등) | `storage.js`에 sync 어댑터(load/save 위에 원격 push/pull) — UI 불변 |
| IndexedDB 백엔드 | `storage.js`의 `load/save`만 교체(나머지 코드 영향 없음) |
| 대규모 가상 스크롤 | `renderContent`/`renderGrid`만 증분/가상화로 교체 |
| 유튜브 재생목록 일괄 가져오기 | 새 함수 + `bulkAdd` 재사용. (Data API는 키 필요, oEmbed 반복은 키 불필요) |
| 실제 duration 수집 | `addOne`에서 메타 확장, `sizeValue('size')` 정밀화 |

> 모든 확장은 §4 불변식과 §6 회귀를 깨지 않는 선에서. UI 코드는 확장/PWA **양쪽에서 도는 단일 코어**임을 잊지 마라.
