# 튜브폴더 — 아키텍처 (전체 구조·뼈대)

> 버전 1.1 · MV3 · 의존성 0 (순수 HTML/CSS/JS)

## 1. 한눈에 보는 구조

```
┌──────────────────────────── Chrome 확장 (데스크톱) ────────────────────────────┐
│                                                                                 │
│   [툴바 아이콘] ──click──▶  background.js (서비스워커, 이벤트 기반·수명 짧음)     │
│        ▲                        │                                               │
│        │                        ├─ action.onClicked   → manager.html 탭 열기     │
│   [유튜브 페이지]                 ├─ contextMenus       → "튜브폴더에 추가"         │
│   우클릭 "추가" ─────────────────┘     └─ TubeStore.addVideo() → storage 기록     │
│                                                                                 │
│   manager.html (전체 화면 탭) ── manager.css ── app.js ── storage.js             │
│        │                                          │            │                │
│        │   탐색기형 UI(트리/그리드/표)             │   tree·정렬·DnD·휴지통        │
│        └──────────────────────────────────────────┴────────────┘                │
│                                  │                                               │
│                         chrome.storage.local  ◀── onChanged ──▶  (다른 탭 자동반영)│
│                         (+unlimitedStorage)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │  내보내기/가져오기 (JSON)
                                   ▼
┌──────────────────────── 일반 웹 / 모바일 브라우저 ────────────────────────┐
│   manager.html + app.js + storage.js  (확장 API 없음)                      │
│   storage.js 가 chrome.storage 부재를 감지 → localStorage 폴백             │
│   "홈 화면에 추가"로 앱처럼 사용 가능                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

핵심 설계 원칙: **하나의 UI 코드(`manager.html`+`app.js`)가 두 런타임(확장/웹)에서 동작**하고,
그 차이는 오직 `storage.js`의 저장 백엔드 선택(=chrome.storage vs localStorage)으로 흡수된다.

## 2. 런타임 컨텍스트 3종

| 컨텍스트 | 파일 | 역할 | 수명 |
|---|---|---|---|
| **서비스워커** | `background.js` | 아이콘 클릭→탭, 우클릭→영상 추가 | 이벤트 시 깨어났다가 종료(전역변수 휘발) |
| **매니저 페이지** | `manager.html`/`app.js` | 전체 탐색기 UI·모든 편집 | 탭이 열려있는 동안 |
| **공용 저장계층** | `storage.js` | 저장/로드/메타·헬퍼 | 위 둘에서 `importScripts`/`<script>`로 로드 |

> **MV3 서비스워커 주의** — 전역 변수는 워커 종료 시 사라지므로 상태를 보관하면 안 되고,
> 이벤트 리스너는 반드시 스크립트 **최상위에서 동기 등록**해야 한다(비동기 등록 시 이벤트 유실).
> `background.js`는 이 규칙을 준수한다. ([service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle))

## 3. 데이터 흐름

```
사용자 조작 ─▶ app.js 의 조작함수(moveNodes/trashNodes/deepCopy/…)
                   │  1) pushUndo()  (변경 전 스냅샷)
                   │  2) store(메모리 트리) 변형
                   │  3) scheduleSave() ─(200ms 디바운스)─▶ TubeStore.save()
                   │  4) render()  ─▶ buildDescMemo → 트리/그리드/표 재구성
                   ▼
            chrome.storage.local  ──onChanged──▶ 다른 탭/창의 app.js 가 store 교체 후 render()
```

- **단방향 흐름**: 조작 → 메모리 트리 → 저장 → 렌더. UI는 항상 `store`의 파생물.
- **교차 탭 동기화 무료**: `storage.onChanged`가 같은 프로필 내 모든 컨텍스트에 브로드캐스트되어,
  한 탭의 변경(또는 서비스워커의 "추가")이 다른 탭에 자동 반영된다.
- **교차 기기 동기화**: `storage.onChanged`는 같은 기기 한정. 기기 간은 내보내기/가져오기(JSON)로 처리.
  (실시간 자동은 [로드맵](GAP-ANALYSIS-AND-ROADMAP.md#5-모바일자동-동기화-옵션) 참조)

## 4. 저장 전략 (근거)

| 항목 | 값 | 근거 |
|---|---|---|
| `storage.local` 기본 한도 | 10 MB (Chrome 113↓ 5 MB) | [chrome.storage 레퍼런스](https://developer.chrome.com/docs/extensions/reference/api/storage) |
| `unlimitedStorage` 권한 | 위 한도 **해제** | 동일 |
| `storage.sync` | 100 KB 총량 / 8 KB·항목 / 512 항목 / 1800 writes·시간 | 동일 — **라이브러리엔 너무 작아 미사용** |
| IndexedDB | ~1 GB 또는 디스크 60%, 비동기, Snappy 압축 | [IndexedDB 개선](https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements) |

**선택: `storage.local` + `unlimitedStorage`.**
영상은 파일이 아니라 *참조*(id·url·썸네일URL)로 저장 → 노드당 ≈200 B. 1만 개라도 ≈2 MB로 한도 내.
`storage.local`은 SW·페이지·`onChanged` 동기화를 한 API로 제공해 단순하다.
다만 [연구](https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements)상 50 MB 이상에서 느려지므로,
초대형(수십만 노드)으로 커지면 **IndexedDB 이전**이 정공법 — `storage.js` 한 파일 교체로 마이그레이션 가능하게 캡슐화해 둠.

## 5. 권한(최소 권한 원칙)

| 권한 | 이유 |
|---|---|
| `storage` | 트리 저장/로드 |
| `unlimitedStorage` | 10 MB 한도 해제(대용량 라이브러리) |
| `contextMenus` | 유튜브 페이지 우클릭 "튜브폴더에 추가" |
| `tabs` | 매니저 탭 열기·활성화, 추가 시 탭 제목 읽기 |
| `host_permissions: youtube.com` | 확장 페이지에서 oEmbed 제목 조회(CORS 우회) |
| `host_permissions: noembed.com` | oEmbed 실패 시 CORS 허용 폴백 |

콘텐츠 스크립트·`<all_urls>`·웹요청 등 광범위 권한은 **쓰지 않는다**.

## 6. 파일 뼈대

```
tubefolder-extension/
├─ manifest.json     MV3 정의 + 권한
├─ background.js     서비스워커 (이벤트 핸들러 최상위 등록)
├─ manager.html      UI 골격 (툴바·브레드크럼·트리·콘텐츠·상태바·컨텍스트메뉴)
├─ manager.css       테마·6종 보기모드·반응형·마퀴/잘라내기 표시
├─ app.js            상태기계 + 모든 알고리즘 (→ ALGORITHMS.md)
├─ storage.js        저장 백엔드 추상화 + 공용 헬퍼(메타/이름/ID)
├─ icons/            16·48·128 PNG
└─ docs/             본 문서 묶음
```

연관 문서: [데이터 모델](DATA-MODEL.md) · [알고리즘](ALGORITHMS.md) · [갭 분석·로드맵](GAP-ANALYSIS-AND-ROADMAP.md)
