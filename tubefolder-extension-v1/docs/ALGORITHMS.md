# 튜브폴더 — 알고리즘 (상세 + 복잡도)

표기: `N` = 전체 노드 수, `c` = 현재 폴더의 자식 수, `d` = 서브트리 크기.

---

## 1. 정렬 (탐색기 규칙) — `compareNodes`

탐색기 규칙을 그대로 따른다: **폴더 우선 → 키별 정렬 → 자연(숫자) 정렬**.
([Windows Explorer 정렬](https://www.makeuseof.com/windows-file-explorer-change-numerical-sorting/) — File 2 가 File 10 앞)

```
compareNodes(a, b):
    # 1) 폴더가 항상 파일보다 앞
    if a.isFolder != b.isFolder: return folderFirst
    # 2) 키별 비교
    switch sortKey:
        name → a.name.localeCompare(b.name, 'ko', {numeric:true})   # 자연 정렬
        date → a.modifiedAt - b.modifiedAt
        type → typeLabel 비교, 동률이면 name
        size → sizeValue(a) - sizeValue(b)        # 폴더=하위개수, 영상=재생시간
        none → a.order - b.order                  # 수동 순서
    # 3) 동률이면 order 로 안정화, 그 뒤 방향(asc/desc) 부호
```

- `{numeric:true}` 로 `Intl` 자연 정렬 → "시즌 2" < "시즌 10".
- 휴지통은 정렬에서 **제외**하고 루트 한정 맨 끝에 별도 push(`listFolder`).
- 복잡도: `O(c log c)`. `sizeValue`는 아래 메모이즈로 비교당 `O(1)`.

### 1-1. 하위 개수 메모이제이션 — `buildDescMemo` (성능 보완)

`size` 정렬·표시에 필요한 "하위 항목 수"를 비교마다 재귀로 세면 `O(N)`×비교 → **`O(N² log N)`**.
렌더 시작 시 1회 DFS로 전부 캐시 → 비교는 `O(1)` 조회.

```
buildDescMemo():
    byParent = group all nodes by parentId          # O(N)
    descMemo = {}
    cnt(id):                                         # 후위 DFS
        total = len(children) + Σ cnt(child)
        descMemo[id] = total
        return total
    for every node: if not memoized: cnt(node)       # 전체 O(N)
```

복잡도: 렌더당 `O(N)`. 정렬 전체가 `O(N + c log c)` 로 안정화.

---

## 2. 트리 탐색 보조

```
childrenOf(id)        : nodes 중 parentId==id 필터            O(N)
isDescendant(x, anc)  : x 에서 부모 따라 올라가며 anc 만나면 true  O(높이)
descendantIds(id)     : id 의 모든 후손 id (재귀 DFS)           O(d)
nextOrder(parentId)   : 같은 부모 최대 order + 1               O(N)
```

> `childrenOf`는 단순 스캔(`O(N)`)을 유지해 **변형 도중에도 항상 정확**하게 했다.
> 핫패스(정렬)의 `O(N²)` 요인만 메모이즈로 제거 — 개인 라이브러리 규모(수백~수천)에 충분.

---

## 3. 이동 / 복사 / 삭제 / 복원 / 완전삭제

### move (드래그·잘라내기 붙여넣기) — `moveNodes(ids, target)`
```
pushUndo()
for id in ids:
    skip if id ∈ {root, trash, target}
    skip if isDescendant(target, id)     # 자기 하위로 이동 금지(사이클 방지)
    node.parentId = target               # 서브트리는 참조로 따라옴 → O(1)
    node.order = nextOrder(target)
변경 없으면 pushUndo 취소(undoStack.pop)
```
target == 휴지통이면 `trashNodes`로 위임(=삭제).

### trash (삭제=휴지통 이동) — `trashNodes(ids)`
```
pushUndo()
for id in ids:
    node.prevParentId = node.parentId    # 복원 좌표 백업
    node.parentId = trash
```

### restore (복원) — `restoreNodes(ids)`
```
for id in ids where parent==trash:
    node.parentId = node.prevParentId (없으면 root)
    delete node.prevParentId
```

### purge (완전삭제) — `purgeNodes(ids)`
```
all = ∪ {id, descendantIds(id)}          # 서브트리 전부
for x in all: delete nodes[x]
```

### deepCopy (복사 붙여넣기) — `deepCopy(id, newParent, top)`
```
clone = {...src, id:new, parentId:newParent, order:nextOrder(newParent)}
if top: clone.name = uniqueName(siblings, src.name)   # 최상위만 "(2)" 부여
nodes[clone.id] = clone
for child in childrenOf(id): deepCopy(child, clone.id, top=false)   # 서브트리 깊은 복제
```
복잡도: `O(d × N)`(각 노드마다 `childrenOf` 스캔). 일반 규모에서 충분.

모든 구조 변경은 **변경 전에 `pushUndo()`** → `Ctrl+Z`로 복원(스냅샷 스택, 최대 30).

---

## 4. 드래그&드롭 해석 — `handleDrop(e, targetFolder)`

내부 이동과 외부 URL 추가를 한 핸들러에서 분기(드롭 데이터 타입으로 구분).

```
internal = dataTransfer['application/x-tubefolder']     # 내부: 선택 id 배열(JSON)
if internal: moveNodes(parse(internal), targetFolder); return
text = dataTransfer['text/uri-list' | 'text/plain']     # 외부: 브라우저에서 끌어온 링크
urls = text 에서 youtube videoId 추출 가능한 토큰만
if urls: bulkAdd(urls, targetFolder)                    # 영상으로 추가
```

- 드롭 대상별 폴더 결정: 폴더 아이콘/트리행/브레드크럼 = 그 폴더, 빈 영역 = 현재 폴더.
- 폴더로의 드롭 = "안으로 이동". (수동 순서 변경은 키보드 `Alt+↑/↓`로 분리 — 히트테스트 모호성 제거)

---

## 5. 수동 정렬(없음) — `reorder(delta)`  (`Alt+↑/↓`)

드래그 재배치의 히트테스트 모호성을 피하고 **결정적 동작**을 위해 키보드로 구현.

```
if sortKey != 'none': sortKey='none'           # 수동 순서가 보이도록 전환
items = 현재 폴더 자식(휴지통 제외), order 순 정렬 후 0..n-1 로 재번호
pushUndo()
seq = delta<0 ? items : reverse(items)         # 위로면 앞에서, 아래로면 뒤에서
for n in seq where selected:
    j = i + delta
    swap(items[i], items[j])  if j 유효 and items[j] 미선택   # 선택 블록 경계 보존
재번호하여 order 저장
```

복잡도: `O(c)`. 휴지통 고정은 `listFolder`가 유지.

---

## 6. 마퀴(고무줄) 선택 — `setupMarquee`

빈 영역 `mousedown`에서 시작, 사각형과 각 아이템의 `getBoundingClientRect` **AABB 교차**로 선택.
([rubber-band 선택](https://gist.github.com/cubicleDowns/7666452))

```
mousedown(빈 영역):
    start = (clientX, clientY); base = Ctrl누름? 기존선택 : ∅
    mousemove:
        rect = 정규화(start, 현재)
        sel = base ∪ { item | AABB교차(rect, item.rect) and item != 휴지통 }
        selection = sel; applySelectionClasses()       # 전체 재렌더 없이 클래스만 토글
    mouseup: 박스 제거, 상태바 갱신
```

- `position:fixed` + 뷰포트 좌표 사용(창 스크롤 없음·콘텐츠 내부 스크롤은 rect가 반영).
- 드래그가 일어났으면 `marqueeMoved=true` → 직후의 빈영역 click 이 선택을 지우지 않도록 가드.

---

## 7. 키보드 모델 — `onKey`

| 키 | 동작 |
|---|---|
| `F2` | 이름 바꾸기(단일 선택) |
| `Delete` | 휴지통으로(휴지통 안에선 완전삭제 확인) |
| `Ctrl+Z` | 실행취소(스냅샷 복원) |
| `Ctrl+C/X/V` | 복사 / 잘라내기 / 붙여넣기 |
| `Ctrl+A` | 현재 폴더 전체 선택(휴지통 제외) |
| `↑/↓/←/→` | 선형 선택 이동(`moveSel`) |
| `Alt+↑/↓` | 수동 순서 위/아래(`reorder`) |
| `Enter` | 열기(폴더 진입 / 영상 재생) |
| `Backspace` | 상위 폴더로 |

입력창(`INPUT`) 포커스 중에는 단축키를 가로채지 않는다(이름변경 타이핑 보호).

---

## 8. 메타데이터 수집 — `fetchMeta(url)`  (API 키 불필요)

```
try  youtube.com/oembed?url=…&format=json     # 확장: host_permission 으로 CORS 우회
catch/실패 → noembed.com/embed?url=…           # CORS 허용(ACAO:*) → 모바일 웹 폴백
→ { title, channel } 또는 null
```
근거: oEmbed는 제목·채널·썸네일 제공하나 youtube 엔드포인트는 **브라우저 fetch에서 CORS 차단**되어,
CORS를 허용하는 [noembed](https://noembed.com/)로 폴백한다.
([oEmbed/CORS](https://abdus.dev/posts/youtube-oembed/))

`extractVideoId(url)`는 `watch?v=`, `youtu.be/`, `/shorts/`, `music.youtube` 형태를 모두 파싱.

---

## 9. 검색 — `searchAll(q)`

현재 폴더가 아니라 **전체 트리**에서 이름 부분일치(휴지통/그 하위 제외) → `compareNodes`로 정렬.
복잡도 `O(N + m log m)`(m=매치 수).

---

## 10. 렌더 파이프라인 — `render()`

```
buildDescMemo()      # O(N) 하위개수 캐시
renderCrumbs()       # 루트까지 부모 체인
renderTree()         # 폴더만 재귀(휴지통 루트 끝)
renderContent()      # 보기모드별 그리드/표, 휴지통 고정
renderStatus()       # 개수·선택·정렬·클립보드·실행취소 표시
syncMenus()          # 보기/정렬 메뉴 체크 표시
```

현재는 조작마다 **전체 재렌더**(단순·정확). 대규모에서의 가상 스크롤/증분 렌더는
[로드맵](GAP-ANALYSIS-AND-ROADMAP.md)의 향후 과제.

연관: [아키텍처](ARCHITECTURE.md) · [데이터 모델](DATA-MODEL.md)
