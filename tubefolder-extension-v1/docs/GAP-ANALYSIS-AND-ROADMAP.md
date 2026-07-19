# 튜브폴더 — 갭 분석 & 로드맵

웹 자료 총조사로 1.0의 부족분을 도출하고, 1.1에서 보완·고도화한 내역과 남은 과제를 정리한다.

---

## 1. v1.1에서 보완·고도화한 항목 (적용 완료)

| # | 갭(1.0) | 심각도 | 보완 내용(1.1) | 근거 |
|---|---|---|---|---|
| G1 | `storage.local` 10 MB 한도 초과 위험 | 중 | `unlimitedStorage` 권한 추가 | [storage 한도](https://developer.chrome.com/docs/extensions/reference/api/storage) |
| G2 | oEmbed가 **모바일 웹에서 CORS 차단** | 높음 | `noembed.com` 폴백(`fetchMeta`) | [oEmbed/CORS](https://abdus.dev/posts/youtube-oembed/) |
| G3 | 정렬 비교마다 하위개수 재계산 → `O(N²logN)` | 중 | 렌더당 1회 DFS 메모이즈(`buildDescMemo`) | — |
| G4 | 중복 이름 무한 생성("새 폴더" 다수) | 낮 | 탐색기식 `(2)` 자동 부여(`uniqueName`) | [Explorer 동작](https://www.makeuseof.com/windows-file-explorer-change-numerical-sorting/) |
| G5 | '없음'(수동) 정렬인데 재배치 수단 없음 | 중 | `Alt+↑/↓` 수동 순서 이동(`reorder`) | — |
| G6 | 다중 선택 수단이 Ctrl/Shift 클릭뿐 | 중 | 마퀴(고무줄) 선택 | [rubber-band](https://gist.github.com/cubicleDowns/7666452) |
| G7 | 키보드 탐색 부재 | 낮 | `↑↓←→` 선택 이동 | — |
| G8 | 실수 삭제/이동 되돌리기 불가(휴지통 외) | 높음 | `Ctrl+Z` 실행취소(스냅샷 스택 30) | — |
| G9 | 브라우저 링크를 끌어다 못 담음 | 낮 | 외부 YouTube URL 드롭 → 추가 | — |
| G10 | 한 번에 한 개씩만 추가 | 낮 | 다중 URL(줄바꿈/공백) 일괄 추가 | — |
| G11 | 잘라내기 상태가 안 보임 | 낮 | `cut` 항목 흐리게 표시 | — |
| G12 | 손상/구버전 데이터 무방비 | 중 | `migrate()` 로드시 항상 보정(고아 복구 등) | [SW 상태관리](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |

### 검증(미리보기 자동화)
- 중복이름: `["새 폴더","새 폴더 (2)"]` ✓
- 수동정렬 `Alt+↓`: 순서 교체 + 휴지통 하단 유지 ✓
- 실행취소: 정렬→생성 역순 3단계 복원 ✓
- 잘라내기 표시 클래스 ✓ · 콘솔 에러 0건 ✓

---

## 2. 확인된 "이미 올바름"(연구로 재검증)

| 항목 | 상태 | 근거 |
|---|---|---|
| SW 이벤트 리스너 최상위 동기 등록 | ✅ 준수 | [lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |
| SW가 전역상태 의존 안 함(매번 storage 읽기) | ✅ 준수 | 동일 |
| 폴더 우선 + 자연(숫자) 정렬 | ✅ `{numeric:true}` | [Explorer](https://www.makeuseof.com/windows-file-explorer-change-numerical-sorting/) |
| 교차 탭 자동 반영(`onChanged`) | ✅ 구현 | [storage](https://developer.chrome.com/docs/extensions/reference/api/storage) |

---

## 3. 남은 과제(향후 — 우선순위 순)

| 우선 | 과제 | 비고 |
|---|---|---|
| ★★★ | **모바일 실시간 자동 동기화**(§5) | 백엔드/계정 결정 필요 |
| ★★ | **대규모 가상 스크롤/증분 렌더** | 현재 전체 재렌더. 수만 항목 이상에서 체감 |
| ★★ | **IndexedDB 백엔드 옵션** | 50 MB↑ 또는 영상 메타 캐시 확장 시 ([근거](https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements)) |
| ★★ | **유튜브 재생목록 일괄 가져오기** | Data API(list=1유닛/콜, 50개/콜) 또는 키 없이 oEmbed 반복 ([quota](https://developers.google.com/youtube/v3/determine_quota_cost)) |
| ★ | 드래그로 직접 순서 재배치(삽입선 표시) | 현재는 `Alt+↑/↓` |
| ★ | 영상 `duration` 실제 수집(‘크기’ 정렬 정밀화) | 메타 확장 |
| ★ | 휴지통 보존기간/자동 비우기 | 옵션 |
| ★ | 접근성(role/aria/포커스 링) 보강 | — |
| ★ | 실제 유튜브 재생목록 양방향 동기화 | insert=50유닛 → 일 200건 제한 ([quota](https://developers.google.com/youtube/v3/determine_quota_cost)) |

---

## 4. 의도적으로 **하지 않은** 것(단순성 원칙)

- 프레임워크/빌드툴(React·CRA 등) — MV3 CSP 충돌 + 배포 비대화. 순수 JS 유지로 zip 단일 배포.
- `<all_urls>`·콘텐츠 스크립트·웹요청 등 광범위 권한 — 최소 권한 유지.
- 실제 유튜브 재생목록 직접 조작(기본 동작) — 평면 구조 + 쓰기 쿼터(일 200건) 제약. 자체 가상 계층이 정답.

---

## 5. 모바일/자동 동기화 옵션 (사용자 결정 필요)

> 핵심 제약: **일반 모바일 크롬은 확장을 지원하지 않는다**(브라우저 한계).
> 현재 1.1은 **내보내기/가져오기(JSON) + 모바일 웹 호환**까지 무료·무계정으로 제공.
> 아래는 *실시간 자동* 동기화를 원할 때의 선택지.

| 옵션 | 방식 | 장점 | 비용/필요 | 근거 |
|---|---|---|---|---|
| **A. 구글 드라이브 appDataFolder** (추천) | 본인 구글계정 숨김 폴더에 store JSON 저장/동기 | 무료·서버 불필요·앱전용 비공개 | OAuth `drive.appdata`(비민감, 최소 검증) | [appData](https://developers.google.com/workspace/drive/api/guides/appdata) |
| **B. Firebase / Supabase** | 실시간 DB에 store 동기 | 즉시 실시간·다기기 | 가입·무료한도 관리 | — |
| **C. `chrome.storage.sync`** | 데스크톱 크롬 간 자동 | 설정 한 줄 | **100KB/8KB·항목 한도 → 라이브러리엔 부족, 모바일 제외** | [sync 한도](https://developer.chrome.com/docs/extensions/reference/api/storage) |

**권고: A(구글 드라이브 appDataFolder).** 추가 서버·비용 없이 본인 계정으로 다기기 동기화가 되고,
`drive.appdata` 스코프는 비민감이라 검증 부담이 가장 작다. 결정 시 `storage.js` 위에 동기 어댑터를 얹어 구현한다.

연관: [아키텍처](ARCHITECTURE.md) · [데이터 모델](DATA-MODEL.md) · [알고리즘](ALGORITHMS.md)
