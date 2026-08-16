# 튜브폴더 버전2 — 개발 체크리스트

작성일: 2026-07-20 (최종 갱신: 2026-08-17)
사용법: "한눈에 보기" 표의 상태 칸을 갱신하며 진행합니다. 상태는 `⬜ 미착수` → `🔧 진행중` → `✅ 완료`로 바꾸고, 완료 시 날짜·커밋을 detail 항목에 적어두면 다음 세션에서 이어가기 쉽습니다. 단계별 진행률(아래 "단계 기준" 표의 진행 상태 칸)도 함께 갱신합니다.

> **양식 안내**: 이 문서의 구성(① 단계 기준 → ② 한눈에 보기 요약표 → ③ 단계별 상세 → ④ 다음에 결정할 것)은 앞으로 이 프로젝트의 체크리스트 기본 틀로 유지합니다. 항목이 추가·완료되어도 이 순서와 형식을 그대로 씁니다. "다음에 결정할 것"은 미확정 사항이 생길 때만 채우고, 없으면 비워둡니다.

---

## 단계 기준

| 단계 | 기준 | 진행 상태 |
|---|---|---|
| 1단계 | 구조에 영향 — v2를 짜기 시작하기 *전에* 정해야 나중에 재작업이 없음 | 5/5 완료 |
| 2단계 | 핵심 신규 기능 — 사용자가 가장 체감하는 가치, 구조가 정해진 다음 바로 착수 가능 | 3/3 완료 |
| 3단계 | 고급 기능 — 외부 서비스 연동 등 복잡도·리스크가 높아 핵심 기능이 안정된 뒤 진행 권장 | 5/6 완료 |
| 4단계 | 마무리 다듬기 — 있으면 좋지만 없어도 동작에 지장 없는 항목, 여유 있을 때 처리 | 6/7 완료 |
| 5단계 | 출시 준비 — 앱 기능이 다 완성된 뒤에 진행하는 마무리 작업 | 1/5 완료 |

---

## 한눈에 보기 (진행 현황판)

| 단계 | 항목 | 복잡도 | 상태 |
|---|---|---|---|
| 1. 구조 설계 | 기술 스택 | - | ✅ 결정됨 — React + TypeScript + Vite |
| 1. 구조 설계 | 가상 스크롤 구조 설계 | 중간 | ✅ 완료 (2026-07-20) — @tanstack/react-virtual + dnd-kit |
| 1. 구조 설계 | 저장소 백엔드 결정 | 중간 | ✅ 완료 (2026-07-20) — chrome.storage.local 유지 |
| 1. 구조 설계 | 유료화 정책 결정 | 중간 | ✅ 완료 (2026-07-21, 가격·한도 2026-08-16 갱신) — 규모확장 기능 유료·1회결제·₩30,000, 무료 한도 폴더 30개(하위 포함)·영상 150개 |
| 1. 구조 설계 | 스키마 버전 + 동기화 메타데이터 필드 추가 | 낮음~중간 | ✅ 완료 (2026-07-22) — DATA_VERSION 1→2, 노드에 schemaVersion·deviceId·version 추가 |
| 2. 핵심 기능 | 우클릭 메뉴 폴더 추가·이름변경·삭제 | 중간 | ✅ 완료 (2026-07-20) — 탭 전환 없이 미니 팝업으로 처리 |
| 2. 핵심 기능 | 유튜브 재생목록 일괄 가져오기 | 중간 | ✅ 완료 (2026-07-21) — oEmbed 키 없이 ytInitialData 파싱 방식 |
| 2. 핵심 기능 | 이어보기(재생 위치 기억) | 높음 | ✅ 완료 (2026-07-22) — 매니저 내장 iframe 재생 + 자동 이어재생 |
| 3. 고급 기능 | 모바일 자동 동기화(구글드라이브) | 높음 | ✅ 완료 (2026-07-23) — appDataFolder+LWW 병합, 실확장 OAuth·드라이브 동기화 검증 완료 |
| 3. 고급 기능 | PWA(휴대폰 매니저)에 동기화 붙이기 | 중간 | ✅ 완료 (2026-07-25) — 산들 실기기(네이버 브라우저)에서 구글 로그인·동기화 실제 클릭 검증 완료 |
| 3. 고급 기능 | 결제 연동 구현(유료화 실장) | 높음 | 🔧 진행중 (2026-08-17) — Paddle 샌드박스 기준 결제→웹훅→라이선스 확인 전체 파이프라인 테스트 결제로 끝까지 검증 완료. 남은 것: 라이브 전환(계정 가입·본인인증·Paddle 고객지원 접근요청·라이브용 시크릿/API키 교체) |
| 3. 고급 기능 | 유료→무료 전환 스위치 구현 | 낮음 | ✅ 완료 (2026-07-27) — `FREE_DISTRIBUTION_MODE` 상수 하나로 전환, 빌드 시점 스위치 |
| 3. 고급 기능 | PWA(휴대폰 매니저)에 결제 확인 붙이기 | 중간 | ✅ 완료 (2026-08-17) — Paddle 전환으로 blocker 해소, 확장 4종 빌드 통과. 실제 결제 클릭은 미검증(아래 상세) |
| 3. 고급 기능 | 승인 기반 무료 라이선스 구현 | 중간 | ✅ 완료 (2026-07-29) — 키+이메일 화이트리스트, LicenseControl.tsx 내장 UI |
| 4. 다듬기 | 폴더 아이콘 다양화 + 초기화 | 낮음~중간 | ✅ 완료 (2026-07-29) — 이모지 카탈로그 7종 카테고리, 🎨 버튼으로 선택·초기화 |
| 4. 다듬기 | 드래그 삽입선 표시 | 낮음 | ⬜ 미착수 |
| 4. 다듬기 | 영상 duration 정밀 수집 | 낮음 | ✅ 완료 (2026-07-27) — 단건 추가(시청페이지 파싱)·재생목록 가져오기(이미 받은 데이터 활용) 둘 다 실제 값 저장 |
| 4. 다듬기 | 휴지통 보존기간 설정·자동 비우기 | 낮음 | ✅ 완료 (2026-07-27) — 기본 30일, 조정 가능, "자동 삭제 없음" 옵션 포함 |
| 4. 다듬기 | 접근성 보강 | 낮음 | ✅ 완료 (2026-07-29) — 포커스 링·오버레이 5종 dialog화+Esc 닫기·aria-label 보강 |
| 4. 다듬기 | 앱 정보 표시(개발자명·버전·수정일) | 낮음 | ✅ 완료 (2026-07-27) — 툴바 ℹ️ 패널, 수정일·버전 빌드 시점 git 자동 산출 |
| 4. 다듬기 | YouTube DOM 선택자 분리 구조화 | 낮음~중간 | ✅ 완료 (2026-07-29) — `src/shared/youtubeSelectors.ts` 레지스트리로 URL·정규식 통합 |
| 5. 출시 준비 | 사용자 매뉴얼 작성 | 중간 | ⬜ 미착수 |
| 5. 출시 준비 | 개인정보처리방침 작성 | 낮음~중간 | 🔧 진행중 (2026-08-17) — 문서 4종 작성·`public/legal/`로 배포 경로 배치·빌드 검증 완료, 결제 관련 법적 신고 요건 웹 조사 완료(아래 참고), 최종 확정은 세무사 상담 권장 |
| 5. 출시 준비 | 다국어(i18n) 지원 준비 | 낮음~중간 | ⬜ 미착수 (신설 2026-07-21) |
| 5. 출시 준비 | Chrome 웹 스토어 비공개(Unlisted) 등록 | 낮음~중간 | 🔧 진행중 (2026-08-17) — 개발자 등록·zip 업로드 완료, 스토어 등록정보 작성 중 중단(아래 참고) |
| 5. 출시 준비 | 버그 제보 채널 마련 | 낮음 | ✅ 완료 (2026-08-15) — 앱 정보(ℹ️) 패널에 이메일 제보 링크(mailto) 추가 |

---

## 1단계 — 구조 설계 (착수 전 결정)

- [x] **기술 스택: React + TypeScript + Vite** — 결정 완료
  - v1(순수 JS)과 달리 빌드 과정이 추가되지만, 이번 v2에서 예정된 기능(가상 스크롤, 아이콘 관리, 결제 연동 등)으로 코드 규모가 커질 걸 감안해 구조적으로 관리하기 쉬운 방식 선택.
  - 참고: 저장소의 `youtube-manager-extension`이 같은 방식으로 시도되다 중단된 뼈대가 있음 — 재사용 가능성 검토.

- [x] **가상 스크롤 구조 설계** — 결정 완료 (2026-07-20)
  - 이유: 폴더 하나에 영상이 많을 때(실측: 8,000개에서 렌더링 중 약 113ms 멈춤) 성능 문제가 실제로 확인됨. 렌더링 방식은 v2 전체 UI 컴포넌트 구조의 기반이라, 나중에 붙이면 관련 코드를 거의 다시 짜야 함.
  - **결정: `@tanstack/react-virtual`(헤드리스) + `@dnd-kit/sortable`**
    - 후보였던 `react-virtuoso`(배터리 포함형)보다 제어권이 큰 헤드리스 방식을 선택 — v1에 이미 있는 커스텀 마퀴(고무줄) 선택·키보드 방향키 이동·드래그 삽입선 같은 상호작용을 그대로 재현하려면 자체 DOM/스크롤 구조를 강제하는 라이브러리보다 제어권이 필요.
    - dnd-kit + tanstack/react-virtual 조합은 공식적으로 검증된 조합(2025년 문서 기준) — 단, 가상화의 `translateY`와 드래그의 `transform`이 충돌할 수 있어 두 오프셋을 합산 적용하는 처리 필요(알려진 이슈, 해결 패턴 존재).
    - **핵심 설계**: v1처럼 한 번에 한 폴더의 자식만 렌더링(전체 트리를 펼쳐서 보여주지 않음) → 가상화 대상은 항상 "현재 폴더의 자식 배열" 하나뿐, 무제한 하위폴더 깊이는 가상화와 무관.
    - 아이콘 그리드(xl/large/medium/small)·목록(list)·표(details) 6종 보기 모두 "행 단위" 가상화로 통일: 그리드는 컨테이너 너비로 열 개수를 계산해 N개씩 묶은 가상 행을, 목록/표는 항목당 1행을 가상화. `virtualizer.getVirtualItems()`가 각 항목의 위치를 주므로 마퀴 선택 히트테스트·키보드 포커스 이동(`scrollToIndex`)에도 그대로 활용.
    - 휴지통 폴더 항상 마지막 고정 등 정렬 규칙은 기존처럼 데이터 계층(`listFolder()`)에서 처리 — 가상화 레이어는 신경 쓸 필요 없음.
  - 복잡도: 중간

- [x] **저장소 백엔드 결정** — 결정 완료 (2026-07-20)
  - 이유: "이어보기" 기능이 영상별 재생 위치 데이터를 추가로 저장해야 하고, 동기화·유료화(라이선스 상태 저장) 기능도 저장 구조에 영향을 주므로 먼저 정해야 함.
  - **결정: `chrome.storage.local` + `unlimitedStorage` 유지 (IndexedDB 전환 안 함)**
    - 근거: 실측(8,000개, 113ms 지연)의 원인은 저장소 읽기/쓰기가 아니라 DOM 렌더링이었고, 이는 가상 스크롤 결정으로 이미 해결됨 — 저장소 자체는 병목이 아니었음.
    - 노드당 ≈200B 기준으로 수만 개까지도 chrome.storage.local의 안전 마진(성능 저하 시작점 ≈50MB) 안에 들어옴. "이어보기" 재생위치·라이선스 상태 필드가 추가돼도 노드당 크기 증가는 미미해 결론 불변.
    - 탭 간 자동 동기화(`storage.onChanged`)를 무료로 유지 — IndexedDB 전환 시 이 부분을 BroadcastChannel 등으로 직접 구현해야 해서 복잡도만 늘고 얻는 이득이 없음.
    - v1과 동일하게 `storage.js` 계층에 캡슐화해 향후(수십만 노드 규모로 커질 경우) IndexedDB로 교체 가능한 구조는 유지.
  - 복잡도: 중간

- [x] **유료화 정책 결정** — 확정 완료 (2026-07-21, 아래 제안 그대로 채택)
  - 결정할 것: ① 무엇을 유료로 할지 ② 1회 결제 vs 구독 ③ 가격
  - 이유: 어떤 기능을 유료로 막을지에 따라 2·3단계 기능들의 설계(어디에 "잠금" 로직을 넣을지)가 달라지므로 먼저 큰 틀을 정해야 함.
  - 착수 시점에 산들과 위 세 가지(대상 기능/가격모델/가격)를 확정해야 다음 단계(3단계 결제 연동 구현)로 넘어갈 수 있음.
  - **제안 초안 (시장 조사 근거, 2026-07-21)**:
    - 참고 벤치마크: 탭/북마크 관리 확장 유사군 — Tab Folio(무료 100탭/월), Toby(무료 60탭 캡), Leap(무료 25개+3스페이스), Bookmarker(무료 100개+5컬렉션, 유료 $5/월 무제한), Raindrop.io(무료 무제한이지만 Pro $3/월엔 검색·중복탐지·백업 추가), Tab Group Vault(무료 10스냅샷, Pro **1회 $39**로 무제한+자동저장+내보내기), Session Buddy·OneTab(완전 무료).
    - **① 유료 대상(제안)**: 핵심 폴더·영상 정리(생성·이동·복사·삭제·정렬·보기모드)는 전부 무료 유지 — 이탈 방지·입소문이 우선. 유료는 "규모 확장/부가" 계열에 배치:
      - 폴더·영상 개수 제한 해제(무료는 폴더 30개(하위 폴더 포함)·영상 150개 캡 — 2026-08-16 갱신, 최초 제안 시점엔 폴더 20개·영상 500개였음)
      - 클라우드 자동 동기화(구글드라이브/원드라이브)
      - 재생목록 일괄 가져오기(무료는 1회당 소량 캡, 대량은 유료)
      - "이어보기"는 무료 유지 제안 — 핵심 사용성이라 여기서 막으면 만족도가 크게 떨어짐(락인보다 만족 우선).
    - **② 결제 모델(제안): 1회 결제**. 근거: 솔로 개발 유지보수 부담(구독은 갱신 실패·환불·이탈 대응이 상시 필요), ExtensionPay 등 대행 서비스가 서버 코드 없이 1회 결제도 지원, 사용자 저항도 구독보다 적음.
      - 반대 고려: 동기화처럼 서버·API 호출이 실제로 드는 기능은 구독이 더 맞을 수 있음(원가 지속 발생) — 동기화만 별도 소액 구독, 나머지는 1회 결제인 "하이브리드"도 대안으로 검토 가능.
    - **③ 가격(제안)**: 1회 결제 **₩15,000~20,000** (Tab Group Vault $39 One-time보다 낮게 — 이 제품은 더 라이트한 유틸이라 판단). 동기화 별도 구독 채택 시 월 ₩2,000~3,000 선(Raindrop.io Pro $3/월 참고).
    - **확정(2026-07-21)**: 위 제안(①②③) 그대로 채택. 동기화 하이브리드 구독안은 채택 안 함(단순화를 위해 전부 1회 결제로 통일).
    - **갱신(2026-08-16, 산들 확정)**: 경쟁 제품(FolderTube 등) 가격 분석 후 가격을 ₩30,000(1회)으로 상향, 무료 한도를 폴더 30개(하위 폴더 포함)·영상 150개로 조정(기존 대비 폴더는 상향, 영상은 하향). `licenseEngine.ts`의 `FREE_FOLDER_LIMIT`·`FREE_VIDEO_LIMIT` 상수와 `public/legal/` 문서 4종에 반영·배포 완료(커밋 `81f6e2d`).
  - 복잡도: 중간 (정책 결정 자체는 복잡도보다 결정의 문제. 실제 결제 연동은 3단계 별도 항목)

- [x] **스키마 버전 + 동기화 메타데이터 필드 추가** — 구현 완료 (2026-07-22, 커밋 `653c7c7`)
  - 배경: CLAUDE.md·ROADMAP 지침 비교 검토에서 발견된 누락 항목. 이미 완료된 "저장소 백엔드 결정"에는 이 필드가 반영되지 않은 상태였음.
  - 내용: 저장 데이터(폴더·영상 노드)에 ①스키마 버전 번호 ②수정시각(기존에도 있었음) ③기기ID ④버전번호 메타데이터 필드를 추가.
  - 이유: 스키마 버전은 향후 구조 변경 시 자동 마이그레이션의 전제 조건. 나머지는 3단계 "모바일 자동 동기화" 착수 시 자동 병합(마지막 저장 우선 등) 로직의 전제 조건 — 나중에 추가하면 이미 쌓인 데이터를 일일이 손봐야 해서 미리 반영.
  - **구현 내용** (`src/storage/types.ts`·`storage.ts`·`folderOps.ts`):
    - `BaseNode`에 `schemaVersion`·`deviceId`·`version` 3개 필드 추가(`modifiedAt`은 기존에 이미 있었음).
    - `DATA_VERSION`을 1→2로 상향(v1 AGENTS.md 규칙: "노드 스키마를 바꾸면 DATA_VERSION 상향" 적용) — 노드별 `schemaVersion`도 이 값을 그대로 재사용(스토어·노드 스키마 세대를 분리하지 않아 단순화).
    - `getDeviceId()`: 기기별 영구 ID를 최초 1회 생성해 별도 키(`tubefolder_device_id`)에 저장 후 재사용.
    - `newNodeMeta()`(신규 노드 생성 시 스탬프, `version` 1부터 시작) / `touch()`(기존 노드 수정 시 `modifiedAt`·`version`·`deviceId`·`schemaVersion` 일괄 갱신) 헬퍼 추가.
    - `createFolder`·`addVideoToFolder`·`addVideosToFolder`(신규 생성)와 `renameFolder`·`trashFolder`(수정)에 각각 적용.
    - `migrate()`에 하위호환 백필 로직 추가: 필드가 없는 구버전 데이터를 읽을 때 `schemaVersion=DATA_VERSION`, `version=1`, `deviceId=현재 기기ID`로 조용히 채워 넣음(에러 없이 통과).
  - **검증**: `tsc --noEmit` 및 3개 빌드(manager/background/content) 모두 통과. 매니저 페이지 프리뷰에서 신규 필드 없는 구버전 데이터를 seed해 로드 → 콘솔 에러 없이 정상 렌더링, 이후 이름변경·새 폴더 생성 실행 시 각각 `version` 증가/1부터 시작, `schemaVersion`·`deviceId` 정상 부여를 실제 클릭으로 확인.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 선택 개선: `uid()`와 신규 `genId()` 로직 중복(접두사만 다름, 각 3줄이라 통합 보류) / 노드별 `version`은 아직 실제 충돌 병합 로직에서 사용되지 않음(3단계에서 실사용 예정, 필드만 선반영).
  - 복잡도: 낮음~중간

---

## 2단계 — 핵심 신규 기능

- [x] **우클릭 메뉴에서 폴더 추가·이름변경·삭제 직접 처리** — 구현 완료 (2026-07-20)
  - 배경: 현재(v1)는 유튜브 페이지 우클릭 메뉴에 폴더 목록만 뜨고, 폴더를 새로 만들거나 이름을 바꾸거나 지우려면 별도의 "폴더 관리" 화면(새 탭)을 열어야 함. 산들이 실제로 우클릭 메뉴를 쓰다가 발견한 불편함.
  - 목표: 우클릭 메뉴 안에서 바로 새 폴더 만들기 / 이름변경 / 삭제까지 처리 → 페이지를 벗어날 필요 없음
  - 구현 메모: Chrome의 우클릭 메뉴(`contextMenus` API)는 글자를 직접 입력하는 칸을 지원하지 않아서, "새 폴더 만들기"를 누르면 유튜브 페이지 위에 작은 입력창(미니 팝업)을 띄우는 방식이 필요함. 이름변경·삭제도 같은 방식. 폴더/영상 추가·이름변경·삭제 로직 자체는 v1에도 이미 있어서(storage.js), 이번 작업은 주로 새로운 진입점(우클릭 메뉴 UI)을 추가하는 것이지 데이터 구조를 바꾸는 게 아님 → 1단계 결정과 무관하게 병행 가능.
  - **v2 스캐폴딩과 함께 처음 구현** — Vite+React+TS MV3 프로젝트 자체가 이 세션에서 새로 만들어짐(이전엔 폴더가 비어 있었음). storage.js → TS 이식(`src/storage/types.ts`·`storage.ts`), 신규 폴더 CRUD 헬퍼(`src/storage/folderOps.ts`: createFolder/renameFolder/trashFolder)도 함께 작성.
  - **구현 결정**:
    1. background(서비스워커)는 v1의 컨텍스트 메뉴 트리(동영상 추가 + 폴더 관리)를 그대로 이식하되, "새 폴더/이름변경/삭제" 클릭 시 매니저 탭을 열지 않고 `chrome.tabs.sendMessage`로 우클릭한 탭의 콘텐츠 스크립트에 "미니 팝업을 띄워라" 메시지만 전달(`src/shared/messages.ts`).
    2. 콘텐츠 스크립트(`src/content/`)가 실제 입력 UI를 렌더링 — **Shadow DOM + vanilla TS**로 구현(React 미사용): 유튜브 자체 프레임워크와 같은 페이지에 얹히므로 스타일 완전 격리·번들 최소화가 목적. 확인/취소 후 `storage/folderOps.ts`를 콘텐츠 스크립트가 **직접 호출**해 반영(콘텐츠 스크립트도 "storage" 권한으로 `chrome.storage.local` 접근 가능하므로 background 왕복 불필요) → `chrome.storage.onChanged`가 자동으로 컨텍스트 메뉴 재구성을 트리거.
    3. `documentUrlPatterns`(background)·`content_scripts.matches`(manifest.json)를 동일한 3개 패턴(www.youtube.com/music.youtube.com/youtu.be, https만)으로 일치시킴 — v1은 이 둘이 서로 다른 패턴을 썼는데(내부 상수는 와일드카드 서브도메인, manifest는 www만), 어긋나면 메뉴는 뜨는데 콘텐츠 스크립트가 없는 탭으로 메시지를 보내는 실패가 생길 수 있어 v2에서 통일.
    4. 삭제는 v1처럼 확인 없이 즉시 휴지통行이 아니라, 미니 팝업에 확인 단계(빨간 버튼)를 추가 — 소프트 삭제라 되돌릴 수 있지만 그래도 즉시 실행보다 한 번 더 확인하는 편이 안전하다고 판단.
    5. MV3 번들링은 별도 플러그인(@crxjs/vite-plugin 등) 없이 Vite `build.lib` 모드로 3개 진입점(매니저=일반 빌드, background=ES 모듈, content=iife)을 각각 빌드 — 이미 결정된 의존성(Vite)만으로 해결 가능해 새 의존성 추가를 피함.
  - **매니저 페이지 최소 스캐폴딩도 함께 작성**(`src/manager/`) — 그리드/가상 스크롤 등 정식 뷰는 5단계 몫이라, 여기서는 "한 번에 한 폴더의 자식만 렌더링"하는 탐색기형 이동 골격만 최소로 구현해 storage 계층이 매니저 컨텍스트에서도 동일하게 동작함을 확인하는 용도로 둠.
  - **개발 중 발견·수정한 버그 2건** (매니저 페이지로 실제 클릭 테스트하다 발견):
    - `folderOps.ts`의 `nextOrder`가 휴지통 노드를 다음 순번 계산에서 제외하지 않아, 휴지통의 `order`(항상 `Number.MAX_SAFE_INTEGER`, 맨 끝 고정용)를 기준으로 새 폴더의 order가 폭주하던 문제 → v1의 동일 가드(`n.id !== trashId`)를 누락 없이 반영해 수정.
    - 매니저 페이지에서 이름변경을 "더블클릭"으로 열도록 했더니 더블클릭의 첫 클릭이 먼저 발생해 폴더 안으로 들어가버리는 충돌 발견 → 더블클릭 대신 명시적 "이름 변경"(✏️) 버튼 + 저장/취소 버튼으로 변경.
    - (참고: 삭제 확인도 처음엔 `window.confirm()`을 썼다가, 네이티브 모달이라 자동화 검증 도구를 막아버리는 것을 발견해 인라인 확인 UI로 교체 — 실사용자에게는 문제없었을 동작이지만 테마 일관성·견고성 면에서도 인라인 쪽이 더 나은 선택으로 판단.)
  - **검증 한계**: 우클릭 컨텍스트 메뉴 → 서비스워커 → 콘텐츠 스크립트 미니 팝업으로 이어지는 경로는 실제 Chrome 확장 런타임이 있어야 동작해 이 개발 환경(브라우저 자동화)에서는 재현 불가 — 타입체크(`tsc --noEmit`) 통과 + 코드 경로 수동 추적으로 검증. storage 계층(createFolder/renameFolder/trashFolder) 자체는 매니저 페이지를 로컬 브라우저 미리보기(localStorage 폴백)로 실제 클릭까지 검증 완료(생성·중복이름 `(2)` 자동부여·이름변경·삭제→휴지통 이동·휴지통 내 조회까지 전부 확인). 실제 Chrome에 로드해 우클릭 메뉴 자체를 육안 확인하는 것을 권장([README.md](README.md) "확장으로 로드해서 확인하기" 참고).
  - 복잡도: 중간 (구조 변경 없음, UI 진입점 추가 위주)

- [x] **유튜브 재생목록 일괄 가져오기** — 구현 완료 (2026-07-21)
  - 이유: 처음 쓸 때 폴더를 하나하나 채우는 수고를 줄여줌. 구조 변경 없이 추가 가능한 기능이라 먼저 처리.
  - **구현 결정: oEmbed 반복 호출이 아니라 재생목록 페이지의 `ytInitialData` 파싱 방식 채택**
    - 착수 전 확인한 사실: oEmbed(및 noembed.com)는 영상 1개 URL당 메타데이터만 돌려줄 뿐, "이 재생목록 안에 어떤 영상들이 있는지" 자체는 제공하지 않음 — 재생목록 나열이라는 원천 기능이 없어 oEmbed만으로는 이 항목을 구현할 수 없었음.
    - 대신 재생목록 페이지(`https://www.youtube.com/playlist?list=...`) HTML에 이미 내장돼 있는 `ytInitialData`(유튜브 웹페이지 자신이 렌더링에 쓰는 공개 데이터, 로그인 불필요)를 정규식으로 추출해 videoId·제목·채널명을 파싱. API 키 불필요 — v1의 "API 키 없이 바로 동작" 방향과 일치.
    - 100개 초과(재생목록 페이지 최초 응답의 기본 상한) 시 `continuationItemRenderer` 토큰과 페이지에 함께 내장된 공개 웹 클라이언트 키(`INNERTUBE_API_KEY`)로 `youtubei/v1/browse`를 반복 호출해 이어받기 — 진행 상황을 매니저 화면에 "영상 목록을 가져오는 중... (N개 인식됨)"으로 실시간 표시(요청사항의 "느리면 진행 상황 표시" 대응). 안전장치로 최대 60페이지(약 6천 개)에서 중단.
    - 페이지 구조가 바뀌어 이어받기 정보(API 키·클라이언트 버전)를 못 찾으면 예외를 던지지 않고 이미 받은 첫 페이지 결과만 조용히 반환(완전 실패보다 일부 성공이 낫다고 판단).
  - **구현 파일**:
    - `src/storage/playlistImport.ts` (신규) — `extractPlaylistId`(URL 또는 재생목록 ID 문자열 파싱), `fetchPlaylistVideos`(파싱+이어받기), `PlaylistImportError`.
    - `src/storage/folderOps.ts`에 `addVideosToFolder` 신규 — 재생목록처럼 영상이 여러 개일 때 `load()`/`save()`를 영상 개수만큼 반복하지 않고 한 번씩만 호출하도록 별도 벌크 함수로 분리(기존 `addVideoToFolder`는 단건 추가용으로 유지, 우클릭 메뉴 등 기존 호출부는 변경 없음).
    - `src/manager/App.tsx`·`App.css` — 매니저 페이지 상단에 "재생목록 URL 붙여넣기" 입력창 + "📥 재생목록 가져오기" 버튼 추가, 현재 열려 있는 폴더로 가져옴(휴지통을 보고 있을 때는 숨김).
  - **중복 처리**: videoId 기준으로 저장소 전체(전 폴더 트리, 휴지통 포함)에서 이미 있는 영상은 건너뜀 — "이미 존재하는 영상은 건너뛰기" 요구사항을 같은 폴더 안이 아니라 내 튜브폴더 전체 기준으로 해석(v1에 없던 신규 동작이라 새로 정의한 기준).
  - **검증**: `tsc --noEmit` 통과, 4개 빌드(typecheck/manager/background/content) 모두 성공. 매니저 페이지를 로컬 브라우저 미리보기로 띄우고 `window.fetch`를 재생목록 HTML 응답으로 모킹해 실제 클릭 경로로 확인 — 최초 가져오기(2개 추가), 같은 재생목록 재가져오기(2개 모두 건너뜀, 중복 미생성) 모두 통과. 잘못된 URL·네트워크 실패 시 사용자 친화적 한국어 오류 메시지 노출도 확인.
  - **검증 한계**: 실제 youtube.com 재생목록 페이지에 대한 진짜 네트워크 호출과 `youtubei/v1/browse` 이어받기 경로는 이 개발 환경(브라우저 미리보기)이 확장 컨텍스트가 아니라 CORS로 막혀 있어 재현 불가 — 파싱·중복처리·저장 로직은 모킹된 응답으로 검증했지만, 실제 대형 재생목록(100개 초과) 이어받기 동작과 유튜브의 실제 HTML 구조 일치 여부는 확장으로 로드해 실제 재생목록 URL로 확인 필요.
  - 복잡도: 중간

- [x] **이어보기(재생 위치 기억) 기능** — 구현 완료 (2026-07-22, 커밋 `b8b76c3`)
  - 내용: 시청 중단 시점부터 이어서 재생. 유료화 정책상 무료 유지 확정(과금 로직 없음).
  - 배경: v1은 영상 클릭 시 유튜브로 새 탭을 여는 방식(`window.open`)이라 재생 위치를 알 수 없었음. v2 매니저는 영상 클릭 자체가 미구현 상태였어서, 이번에 "영상 클릭 → 앱 내장 재생"이라는 v2의 첫 재생 경로를 함께 설계.
  - **산들 승인 설계(착수 전 AskUserQuestion으로 확정)**: ①오버레이(모달) 팝업 방식 — 닫으면 목록 상태 유지 ②자동 이어재생 + "처음부터 다시보기" 버튼 상시 노출 ③재생 중 7초 간격 저장 + 일시정지/닫기 시 즉시 저장 ④재생 완료(ENDED) 시 위치 리셋.
  - **구현 결정 — CSP 때문에 공식 JS 래퍼 대신 postMessage 직접 구현**:
    - 유튜브 공식 IFrame Player API의 표준 로딩(`<script src="https://www.youtube.com/iframe_api">`)은 MV3 확장 페이지 기본 CSP(`script-src 'self'`)에 걸려 차단됨. manifest에 `content_security_policy` 필드가 없어 기본값 적용 — 기본 CSP는 원격 스크립트만 막고 iframe 삽입은 제한하지 않으므로, **manifest 수정 없이** `<iframe src=".../embed/{videoId}?enablejsapi=1&autoplay=1&start=N">`을 직접 렌더링하고 JS 래퍼가 내부적으로 쓰는 postMessage 프로토콜(`listening` 핸드셰이크 → `infoDelivery`의 `currentTime`/`playerState` 수신, `command`로 seekTo/playVideo 전송)을 직접 구현. 신규 의존성·권한 추가 없음.
  - **데이터 설계 — `touch()`/`version`과 의도적 분리**:
    - `VideoNode`에 optional 필드 2개(`lastPosition`, `lastWatchedAt`)만 추가 — optional이라 기존 데이터 하위호환, DATA_VERSION 재상향·마이그레이션 불필요.
    - 재생 위치는 7초마다 갱신되는 고빈도 쓰기라 `touch()`를 태우지 않는 전용 헬퍼 `updatePlaybackPosition()`(folderOps.ts)으로 분리 — 재생만 해도 "수정일" 정렬이 바뀌는 부작용과, 3단계 동기화 병합이 구조 변경과 재생 진행을 구분 못 하는 문제를 방지. 검증에서 재생 중 `modifiedAt`/`version`/`deviceId` 불변 확인.
  - **구현 파일**: `src/manager/PlayerOverlay.tsx`(신규 — iframe+postMessage 래퍼, ESC/배경클릭/X 닫기), `src/manager/App.tsx`(영상 행 클릭 → 오버레이, videoId 없는 영상은 에러 배너), `src/manager/App.css`(오버레이 스타일), `src/storage/types.ts`·`folderOps.ts`(위 데이터 설계).
  - **개발 중 발견·수정한 버그 1건**: 오버레이를 닫을 때 자식의 언마운트 시 저장(fire-and-forget)과 부모 `refresh()`가 경합해, 재입장 시 실제 멈춘 지점보다 최대 7초 이전에서 재생되는 레이스 발견(실제 테스트로 재현) → 닫기 경로가 저장 완료를 `await`한 뒤 `onClose()`를 호출하도록 수정, 재검증에서 닫은 지점(`lastPosition` 75.6초)과 재입장 `start=75` 정확히 일치 확인.
  - **검증**: `tsc --noEmit` + 3개 빌드(manager/background/content) 통과. 브라우저 프리뷰에서 실제 youtube.com iframe으로 종단 검증 — 자동재생, 7초 간격 저장, 처음부터 다시보기(208초→11초 리셋), 닫기 즉시 저장, 재입장 시 정확한 지점 자동 이어재생 모두 실제 클릭으로 확인. 폴더 생성 회귀 없음, 콘솔 에러 0건.
  - **검증 한계**: 실제 크롬 확장 컨텍스트(chrome.storage.local)가 아닌 로컬 프리뷰(localStorage 폴백)로 검증 — 저장 계층은 동일 모듈이라 동작 차이는 없을 것으로 판단하나, 확장으로 로드해 육안 확인 권장. ENDED(끝까지 재생) 리셋 경로는 코드 검토로만 확인(장시간 재생 필요).
  - 🔴 치명적·🟡 중요 결함 0건(레이스는 발견 즉시 수정 완료). 🟢 선택 개선: ①postMessage 프로토콜은 유튜브 비공식 내부 규약이라 유튜브 측 변경 시 깨질 수 있음 ②"새 탭에서 열기"(v1 방식) 보조 버튼 미제공 ③목록에 "이어보기 N%" 시각 표시 없음(4단계 duration 수집과 연계 가능).
  - 복잡도: 높음 (구조 변경 수반)

---

## 3단계 — 고급 기능 (핵심 안정화 후 권장)

- [x] **모바일 자동 동기화 (구글 드라이브)** — ✅ 완료 (2026-07-23, 구현 커밋 `8b82ee6` / 완료 커밋 `4e254f8`)
  - 이유: 기존 GAP-ANALYSIS 문서에서 가장 높은 우선순위로 평가됐던 항목이지만, OAuth 인증·충돌 해결 로직이 들어가 리스크가 커서 핵심 기능이 안정된 뒤 진행을 권장.
  - **착수 전 조사·설계 승인 (2026-07-22, 산들 확정)**:
    - 원드라이브(OneDrive Graph API `approot`) 조사 결과: 앱 전용 폴더는 가능하나 ①사용자에게 보이는 폴더(`Apps/앱이름`)라 "숨김 영역" 원칙 미충족 ②`chrome.identity.getAuthToken`이 구글 전용이라 launchWebAuthFlow+토큰 자체 관리가 추가로 필요 → **구글 드라이브 먼저, 원드라이브는 보류**(어댑터 인터페이스 `SyncBackend`만 열어둠).
    - 충돌 해결: 노드(id) 단위 LWW 병합 — modifiedAt 큰 쪽 승 → 동률 시 version → deviceId 사전순. 이어보기(lastPosition·lastWatchedAt)는 노드 승패와 별개로 lastWatchedAt 큰 쪽 채택. settings는 기기별 로컬 유지(동기화 제외). **영구 삭제 전파용 tombstones 필드 추가 승인**(90일 후 자동 청소, "삭제 우선" 규칙).
    - 원격 저장: appDataFolder에 스냅샷 JSON 1파일(`tubefolder-data.json`).
  - **구현 내용 (2026-07-23)**:
    - `src/sync/merge.ts` — 순수 병합 함수(mergeStores)·stableStringify·tombstone TTL. chrome 의존성 없음(프리뷰 검증 가능).
    - `src/sync/backend.ts`·`googleDrive.ts` — SyncBackend 인터페이스 + 구글 드라이브 구현(getAuthToken, 401 시 캐시 토큰 제거 후 1회 재시도, multipart 최초 업로드/PATCH 갱신, 연결 해제 시 권한 회수).
    - `src/sync/syncEngine.ts` — runSync(auto/manual 구분): 다운로드→병합→바뀐 쪽만 저장/업로드. 컨텍스트 간 잠금(2분 TTL), 자동 실패 지수 백오프(15분×2^n, 상한 6h), 인증 만료는 authRequired 배지로 분리. `src/sync/mockBackend.ts` — `?syncmock=1` 개발 검증 전용.
    - background: 트리거 4종 중 3종(15분 알람·변경 후 10초 디바운스·시작 시) + 자기 쓰기 재트리거 방지. 매니저: 수동 버튼.
    - 매니저 UI(`SyncControl.tsx`): ①수동 실패 즉시 빨간 배너 / 자동 실패는 조용히(인증 만료만 "재연결 필요" 배지) ②툴바 상시 버튼=상태 배지(미연결/진행중/최신 N분 전/실패) ③오프라인 우선 — 로컬 즉시 렌더 후 백그라운드 동기화, storage.onChanged로 자동 갱신 ④연결 전 결과 안내→구글 창 구간 강조 박스→완료 팝업(최상위 z-index, 확인 시 패널까지 닫음) ⑤OAuth에서 사용자가 볼 것 사전 안내 — CLAUDE.md 원칙 5종 전부 반영.
    - 휴지통 비우기(영구 삭제→tombstone 기록) 신설: 영향 항목 수 표시 + 인라인 확인.
    - manifest: `identity`·`alarms` 권한, `oauth2` 블록(클라이언트 ID는 REPLACE_ME 플레이스홀더), 확장 ID 고정용 `key`(ID: `ebmibcpohklfkbhfiiilfnhlhkdbkeen`, 개인키 `dev-key.pem` 보관).
  - **검증(목백엔드, 실제 클릭)**: 연결→완료팝업→패널 동시 닫힘 / 업로드·다운로드 병합 / LWW 원격 승·로컬 승 / tombstone 전파·옛 사본 부활 방지 / 이어보기 필드 분리 병합(노드는 로컬 승+재생 위치는 원격 승 동시 확인) / 수동 실패 즉시 배너·자동 실패 무배너(백오프 기록만) / 재연결 흐름 / 연결 해제(데이터 보존). `tsc --noEmit`+3종 빌드 통과, 콘솔 에러 0건.
  - **실확장 종단 검증 (2026-07-23, 산들 실기기)**: Google Cloud 프로젝트(`tube-folder`) 생성 → Drive API 활성화 → OAuth 동의 화면(외부·테스트 모드, 테스트 사용자 등록) → "Chrome 확장 프로그램" 유형 클라이언트 ID 발급(고정 확장 ID 일치 확인) → manifest 반영 후 dist/ 로드. 실제 구글 OAuth 창에서 계정 선택·허용 → "연결 완료" 팝업 → 배지 "✅ 방금 전 동기화됨" → 폴더 생성 후 재동기화까지 실기기에서 확인 완료. 콘솔 범위(Scopes) 등록은 프로덕션 게시 시점(5단계) 과제로 이월.
  - 복잡도: 높음

- [x] **PWA(휴대폰 매니저)에 동기화 붙이기** (신설 2026-07-23, "모바일 자동 동기화" 설계 승인 시 분리 확정) — ✅ 완료(2026-07-25)
  - 배경: 이번 구현은 크롬 확장(데스크톱) 쪽 동기화 엔진까지. 휴대폰에서 같은 데이터를 보려면 PWA 매니저에도 동기화를 붙여야 하는데, PWA에는 chrome.identity가 없어 웹용 구글 로그인(GIS, Google Identity Services)이 별도로 필요 — "PWA에 결제 확인 붙이기"와 같은 구조의 독립 작업.
  - **착수 전 확인한 전제 (2026-07-25, 산들 승인)**: v1(`tubefolder-extension-v1/`, 배포 유지 목적으로 건드리지 않음)에는 붙이지 않는다. v1은 데이터 모델도 다르다(`DATA_VERSION 1`, `schemaVersion`·`deviceId`·`version`·tombstone 필드 없음). "PWA 매니저"는 v2를 새로 독립 PWA로 빌드해 만든다 — v1과 무관, 데스크톱 확장(v2)과 완전히 같은 스키마·같은 appDataFolder를 공유.
  - **구현 내용**:
    - `src/sync/driveBackendBase.ts`(신규): 기존 `googleDrive.ts`의 Drive REST 로직(파일 찾기·업로드·다운로드·401 재시도)을 토큰 발급 방식과 무관한 추상 클래스로 분리 — 크롬 확장(`chrome.identity`)과 PWA(GIS) 두 경로가 "무엇을 하는가"는 완전히 같고 "토큰을 어떻게 받는가"만 다르기 때문. `googleDrive.ts`는 이 베이스를 상속하는 얇은 어댑터로 축소(동작 변경 없음, 코드만 이동).
    - `src/sync/googleIdentityWeb.ts`(신규) — GIS 토큰 클라이언트 래퍼. `accounts.google.com/gsi/client` 스크립트를 동적 로드하고 `initTokenClient`로 액세스 토큰을 받는다. 크롬 확장과 달리 진짜 리프레시 토큰이 없어(GIS는 클라이언트 사이드 구현체라 서버 없이는 불가), 토큰은 메모리에만 캐시하고 만료 시 `prompt:''`(무동의창) 비대화형 재요청을 먼저 시도 — 실패하면 `SyncError('auth')`로 기존 "재연결 필요" UI 흐름을 그대로 재사용.
    - `src/sync/googleDriveWeb.ts`(신규) — `GoogleDriveWebBackend`(`driveBackendBase` + GIS 토큰). `googleDrive.ts`와 완전히 같은 파일(`tubefolder-data.json`)·같은 appDataFolder를 읽고 쓴다.
    - `src/sync/gis.d.ts`(신규) — GIS 최소 타입 선언(공식 `@types` 패키지가 없고, 이 하나를 위해 신규 npm 의존성을 추가하지 않기 위해 필요한 부분만 직접 선언).
    - `src/sync/syncEngine.ts`: `getBackend()`가 `chrome.identity` 존재 여부로 확장/PWA를 자동 분기(`GoogleDriveBackend` vs `GoogleDriveWebBackend`) — SyncControl.tsx 등 UI 쪽은 원래부터 환경 비의존적으로 짜여 있어 **수정 불필요**. `connectAndEnable()`의 "unavailable" 안내 문구도 환경별로 분기(확장/PWA). 신규 `scheduleAutoSync()`(10초 디바운스) 추가 — 크롬 확장은 `background.ts`의 `chrome.storage.onChanged`가 변경 후 자동 동기화를 담당하지만, PWA는 별도 백그라운드 컨텍스트가 없어 매니저 페이지 자신이 로컬 변경 직후 직접 호출해야 함.
    - `src/manager/App.tsx`: 폴더 생성·이름변경·삭제·휴지통 비우기·재생목록 가져오기·재생 위치 갱신 6곳에서 로컬 반영 후 `scheduleAutoSync()` 호출. 확장 컨텍스트가 아닐 때만 15분 주기(`setInterval`) + 포그라운드 복귀(`visibilitychange`) 동기화 트리거 추가(확장은 `chrome.alarms`가 이미 담당하므로 중복 실행 안 함).
    - **PWA 빌드 타깃 신설**: `index.pwa.html`(신규 진입점, 크롬 확장 매니저의 `index.html`과 별개) + `public/manifest.webmanifest`(PWA 웹매니페스트 — 크롬 확장 MV3 `manifest.json`과는 별도 파일) + `public/sw-pwa.js`(오프라인 캐시 서비스워커, v1 `sw.js`와 같은 "네트워크 우선→캐시 폴백" 전략이나 Vite 빌드는 파일명에 해시가 붙어 사전 캐시 목록 대신 런타임 캐싱만 사용) + `vite.pwa.config.ts`(별도 산출물 `pwa-dist/`, GitHub Pages 하위 경로 배포를 위해 `base: './'`) + `scripts/rename-pwa-entry.mjs`(빌드 산출물 `index.pwa.html`을 `index.html`로 이름 변경 — 정적 호스팅이 디렉터리 접속 시 `index.html`을 기본으로 찾기 때문) + `package.json`에 `build:pwa` 스크립트 추가.
    - `WEB_CLIENT_ID`(`googleIdentityWeb.ts`) — **산들이 GCP 콘솔에서 "웹 애플리케이션" 유형 OAuth 클라이언트를 직접 발급하고(승인된 자바스크립트 원본: `https://fics01287-arch.github.io`), 발급된 ID를 반영 완료(2026-07-25)**. 반영 직후 리터럴 타입 비교로 인한 tsc 에러(TS2367)가 나서 `WEB_CLIENT_ID`·`EXTPAY_EXTENSION_ID` 둘 다 타입을 `string`으로 명시해 수정함(플레이스홀더 상수를 나중에 실제 값으로 바꾸는 패턴에서 공통으로 발생하는 문제 — 미리 대응해둠). `npm run build:pwa` 재실행 후 `pwa-dist/` 갱신·재배포함.
  - **검증**: `tsc --noEmit` 통과, 기존 3개 확장 빌드(manager/background/content) 회귀 없이 통과, 신규 `build:pwa` 빌드 성공 확인 — 산출물(`pwa-dist/index.html`·`manifest.webmanifest`·`sw-pwa.js`·`icons/`)의 상대경로 정상 확인(하위 경로 배포 가능한 구조). 번들에 `GoogleDriveWebBackend` 관련 코드가 실제 포함됨을 빌드 산출물에서 확인.
  - **검증 한계 (중요)**: 이 개발 환경(리눅스 샌드박스)에서는 네트워크 제한으로 브라우저(playwright/chromium)를 설치할 수 없어, 실제 화면 클릭·GIS 로그인 창·PWA 설치·오프라인 동작은 이번 세션에서 실제로 띄워보지 못했다 — 코드 경로를 수동 추적해 "미설정 상태에서 안전하게 실패"만 확인.
  - **실기기 검증 완료 (2026-07-25, 산들)**: GCP 콘솔에서 "웹 애플리케이션" 유형 OAuth 클라이언트 직접 발급(승인된 자바스크립트 원본: `https://fics01287-arch.github.io`) → `WEB_CLIENT_ID` 반영. 1차 시도에서 카카오톡 인앱 브라우저로 열어 "구글 로그인 스크립트를 불러올 수 없음" 오류 발생(인앱 브라우저의 구글 로그인 차단 — 일반 브라우저로 열도록 안내). 2차 시도(일반 브라우저)에서는 로그인 팝업 대신 구글 고객센터 일반 안내 문서로 튐 — GIS 스크립트를 "연결" 클릭 시점에야 로드하기 시작해 생기는 시간차 때문에 모바일 브라우저가 팝업을 사용자 동작으로 인정하지 않고 막은 것으로 추정, `preloadGis()`(페이지 로드 시 미리 스크립트 준비) 추가로 수정. 수정 후 네이버 브라우저에서 재시도 → 로그인·폴더 생성·"✅ 방금 전 동기화됨" 배지까지 실제 클릭으로 확인 완료.
  - 🟢 참고: 인앱 브라우저(카카오톡 등)에서는 구글 로그인이 막힐 수 있음 — 사용자 매뉴얼(5단계)에 "일반 브라우저에서 열어주세요" 안내를 넣을 필요 있음.
  - 🟢 알려진 제약(결함 아님, 설계상 불가피): GIS는 서버 없는 클라이언트 전용 구현이라 진짜 리프레시 토큰이 없음 — 크롬 확장(`chrome.identity`)만큼 조용한 자동 재인증이 보장되지 않고, 브라우저 세션이 끊기면 크롬 확장보다 "재연결 필요"가 더 자주 뜰 수 있음. 모바일 브라우저는 탭이 백그라운드로 가면 `setInterval` 15분 주기가 지연/중단될 수 있어(브라우저 절전) 실질적으로는 "앱을 열 때(포그라운드 복귀)" 트리거가 주력이 됨 — 데스크톱 확장의 "항상 켜진" 백그라운드 동기화와는 체감이 다를 수 있음.
  - 배포 위치: `tubefolder-extension-v2/pwa-dist/`를 빌드해 커밋 — 기존 루트 `index.html`(v1로 리다이렉트)은 건드리지 않았으므로 URL은 `.../tubefolder-extension-v2/pwa-dist/`가 됨(가칭, 산들이 원하면 더 나은 경로·랜딩 페이지 연결은 별도 논의).
  - 복잡도: 중간

- [ ] **결제 연동 구현 (유료화 실장)** — 🔧 샌드박스 기준 결제→웹훅→라이선스 확인 전체 검증 완료(2026-08-17), 라이브 전환만 남음
  - 전제: 1단계 "유료화 정책 결정" 완료 후 착수 — 이미 완료됨.
  - **서비스 조사·선정 (2026-07-25, 산들 승인) — ⚠️ 아래 2026-07-30 항목으로 대체됨**: Chrome 자체 인앱결제는 2021년 완전 종료, 부활 계획 없음(재확인함). ExtensionPay·Fungies.io·Dodo Payments 3곳 비교 — **ExtensionPay 채택**. 근거: 크롬 확장 전용 설계로 통합이 가장 간단(서버 코드 불필요), 이메일 기반 로그인이라 "구매 복원" 요구사항이 기본 내장. 수수료 5%(Fungies 0%보다 높음)는 통합 난이도·유지보수 부담이 훨씬 낮은 대가로 감수. 세금 신고는 산들 책임(Dodo처럼 대행 안 해줌) — 5단계 "개인정보처리방침 작성" 항목에서 함께 검토 필요.
  - **구현 내용**:
    - `src/license/licenseEngine.ts`(신규) — 순수 캐시 계층(chrome.storage.local 읽기/쓰기만, 'extpay' 패키지 import 없음). `LICENSE_RECHECK_MS`(24시간)·`FREE_FOLDER_LIMIT`(20)·`FREE_VIDEO_LIMIT`(500) 상수. **'extpay'를 여기서 import하지 않는 이유**: extpay가 내부적으로 쓰는 webextension-polyfill이 확장 컨텍스트가 아니면 모듈 로드 시점에 즉시 에러를 던져서, 매니저 공용 번들(App.tsx 등, 확장·PWA 공유)에 정적 import하면 PWA 빌드 전체가 깨짐.
    - `src/license/licenseManager.ts`(신규) — 매니저 UI에서 쓰는 진입점(`openPaymentPage`·`openLoginPage`·`refreshLicenseFromManager`). `'extpay'`를 **동적** import(`await import('extpay')`)로만 사용 — `isLicenseAvailable()`(확장 컨텍스트 + 결제 설정 완료)이 true일 때만 실제로 실행되므로 PWA에서는 이 코드 자체가 실행되지 않음. 빌드 산출물 확인 결과 Rollup이 이 모듈을 별도 지연 로드 청크(`ExtPay.module-*.js`)로 정상 분리함 — PWA는 이 청크를 아예 내려받지 않음.
    - `src/background/background.ts` — `ExtPay(EXTPAY_EXTENSION_ID)`를 스크립트 최상위에서 정적 import(배경은 확장 전용 번들이라 안전) + `startBackground()` 호출. 신규 `tf-license-check` 알람(24시간 주기) + `onInstalled`/SW 초기화 시 최초 1회 온라인 확인 — CLAUDE.md "최초 1회+주기적 1회만 온라인, 평상시 오프라인" 원칙 그대로 구현.
    - **무료/유료 기능 잠금** (유료화 정책 확정 문구 그대로 적용): `storage/folderOps.ts`(createFolder·addVideosToFolder)·`storage/storage.ts`(addVideoToFolder, 우클릭 단건 추가 경로)에 폴더 20개·영상 500개 한도 체크 추가. 재생목록 대량 가져오기는 하드 차단이 아니라 한도까지만 추가하고 나머지는 건너뛴 뒤 안내(`ImportVideosResult.limitReached`). `sync/syncEngine.ts`의 `connectAndEnable()`에 "동기화는 PRO 전용" 방어 체크 추가(UI 우회 대비).
      - **한도 조정 (2026-08-15, 산들 요청)**: `FREE_FOLDER_LIMIT` 20→**30**(하위 폴더 포함 전체 개수 기준, `countUserFolders()`가 이미 평면 순회라 깊이 무관하게 셈), `FREE_VIDEO_LIMIT` 500→**150**. 재생목록 가져오기는 애초에 별도의 "소량" 캡이 코드에 없었음(`addVideosToFolder`가 처음부터 `FREE_VIDEO_LIMIT` 하나만 참조) — 통합 작업 불필요, 상수만 조정.
    - **한도는 `isLicenseAvailable()`(확장 컨텍스트 + 결제 설정 완료)일 때만 적용** — 결제 미설정 개발 단계와 PWA 컨텍스트에서는 아직 걸지 않음. 이유: "PWA에 결제 확인 붙이기"(별도 로드맵 항목)가 아직 없어 PWA는 유료 여부를 확인할 방법 자체가 없는데, 여기서 한도를 걸면 PWA 사용자가 영영 업그레이드 못 하고 갇히는 상태가 됨 — 그 항목이 완료된 뒤 함께 켜는 것으로 설계.
    - `src/manager/LicenseControl.tsx`(신규, SyncControl.tsx와 같은 패턴) — 툴바에 "무료"/"✨ PRO" 배지(초기 화면에 강조 노출하지 않음), 패널에 구매(`openPaymentPage`, 새 탭 강조 박스 안내)·구매 복원(`openLoginPage`, 이메일 재인증) 버튼. `SyncControl.tsx`도 미결제 시 "PRO 전용" 안내로 교체. App.tsx는 한도 초과 시(`LicenseLimitError`) 이 패널을 자동으로 열어줌(`openSignal` prop).
    - 결제는 새 탭(Stripe Checkout)에서 진행되므로 `onPaid` 콜백(별도 콘텐츠 스크립트 빌드 타깃 필요) 대신, 결제 버튼을 누른 뒤 매니저 탭이 다시 포그라운드로 돌아왔을 때 한 번만 온라인 재확인하는 방식으로 단순화함(🟢, 아래 참고).
  - **검증**: `tsc --noEmit` 통과, 기존 확장 3종 빌드 회귀 없이 통과(`background.js`가 extpay 포함으로 21KB→52KB 증가, 정상), 신규 `build:pwa` 빌드 성공 — PWA 산출물에 결제 관련 청크가 포함은 되지만(전체 삭제는 안 함, 🟢) 실행 경로상 로드되지 않음을 코드·번들 구조로 확인.
  - **검증 한계**: 이 개발 환경은 네트워크 제한으로 브라우저를 못 띄워 실제 결제·복원 클릭은 검증 못 함. `EXTPAY_EXTENSION_ID`는 아직 `REPLACE_ME_EXTPAY_EXTENSION_ID` 플레이스홀더 — 산들이 ExtensionPay 가입·Stripe 연결·확장 등록·가격 설정(1회 결제 ₩15,000~20,000, 1단계에서 확정한 값) 후 교체 필요(README 'ExtensionPay 사용 준비' 절차 참고).
  - **ExtensionPay 확장 등록 완료 (2026-07-28, 산들 로그인 상태에서 Claude in Chrome으로 대신 등록 진행)**: `extensionpay.com/home` 대시보드에서 이미 로그인·"Stripe 고객 포털 활성화"까지 완료돼 있음을 확인 → "Register an extension"으로 확장 등록: 이름 `TubeFolder`, id `tubefolder`, 결제 플랜 KRW 20,000(1단계에서 정한 ₩15,000~20,000 범위 중 산들이 상한값 확정) · 1회 결제(Once-Lifetime). 발급된 id를 `licenseEngine.ts`의 `EXTPAY_EXTENSION_ID`에 반영 → 4개 빌드 재검증(tsc 통과, "구매하기" 버튼 정상 노출 확인) → dist/pwa-dist 재배포·커밋(`dd18fc1`)·푸시 완료.
  - **남은 절차**: 대시보드 3번 "Stripe 계정 연결"이 아직 안 돼 있음 — 은행 계좌·세금 정보 등 금융 정보 입력이 필요해 Claude가 대신 할 수 없는 영역이라 산들이 직접 `extensionpay.com/home`에서 "Connect a Stripe account" 진행 필요. Stripe 연결 전까지는 "구매하기"를 눌러도 실제 결제까지는 못 감(등록만 된 상태) — 실사용자 배포 전 반드시 완료 필요.
  - 🟢 알려진 제약·확인 필요(결함 아님): ①환불 시 `user.paid`가 자동으로 false로 바뀌는지는 ExtensionPay 문서상 구독 기준으로만 명시돼 있어 1회 결제 환불 케이스는 실제 가입 후 확인 필요(코드는 24시간마다·수동 새로고침 시 항상 최신 상태를 다시 받아오므로, ExtensionPay가 반영만 해주면 자동으로 따라감) ②`onPaid` 자동 콜백 대신 "탭 복귀 시 1회 재확인" 방식이라, 결제 후 원래 탭으로 돌아오지 않고 새로고침만 하는 경우 최대 24시간 뒤에나 반영될 수 있음(수동 "상태 새로고침" 버튼으로 즉시 해결 가능) ③PWA(사이트) 배포본은 이번 작업으로 아직 유료 기능을 확인할 방법이 없음 — "PWA에 결제 확인 붙이기" 항목과 함께 해결 예정.
  - **⚠️ ExtensionPay → Paddle 전환 (2026-07-30, 산들 요청 — Stripe가 대한민국을 지원하지 않는다는 사실이 확인되어 위 ExtensionPay 구현 전체를 더 쓸 수 없게 됨)**: 위 2026-07-25 구현·2026-07-28 확장 등록은 Stripe 연결 전 단계에서 막혔음(대한민국 계좌로는 애초에 "Connect a Stripe account"가 불가능). 공통지침 "앱개발지침 작성용 지침.txt" §7에 신설된 "결제 대행 서비스 선정 시 개발자 국가 지원 여부 확인 원칙"에 따라 재조사 후 **Paddle**(Merchant of Record, 개발자 본인 명의 Stripe 계좌 불필요, 대한민국 판매자 지원 공식 확인됨)로 교체 결정.
    - **핵심 설계 차이**: ExtensionPay의 `getUser()`는 클라이언트에서 바로 "결제 여부"를 물어볼 수 있었지만(자체 세션 기반, 서버 코드 불필요), Paddle Billing은 이런 API가 없고 웹훅(webhook)으로만 결제 완료를 통지한다. 이 차이 때문에 웹훅을 받아줄 별도 서버가 필요해져, `server/paddle-webhook/`(Cloudflare Worker, 신규)를 추가했다 — Paddle Classic에 있던 "License List"(서버 없이 자동 발급) 기능은 Billing에는 없음을 공식 문서로 확인함.
    - **결제 확인 방식 결정 (AskUserQuestion으로 3안 제시 후 산들 선택)**: ①서버리스 웹훅(Cloudflare Workers, 자동·즉시 반영, 신규 인프라 필요) ②기존 승인 라이선스 화이트리스트 재사용(서버 없음, 판매마다 수동 재배포 필요) ③정적 파일(GitHub Pages) 방식(서버 코드 없음, 수동 갱신) 중 **①번 채택** — ExtensionPay와 가장 비슷한 사용자 경험(구매 즉시 자동 반영, 이메일로 복원)을 유지하기 위함.
    - **구현 내용**:
      - `server/paddle-webhook/worker.js`(신규) — `POST /webhook`(Paddle-Signature 헤더를 HMAC-SHA256으로 검증 후 `transaction.completed` 이벤트의 구매자 이메일을 KV에 `{paid:true, paidAt, transactionId}`로 저장), `GET /check?email=`(확장이 조회). `wrangler.toml`·배포 절차 README 포함.
      - `src/license/licenseEngine.ts` — `EXTPAY_EXTENSION_ID`/`isLicenseConfigured()`를 `PADDLE_CHECKOUT_URL`(Paddle 호스티드 체크아웃 링크)·`PADDLE_VERIFY_ENDPOINT`(Worker `/check` URL) 기반으로 교체. `LicenseState.source`에서 `'extpay'` 제거, `'paddle'` 추가.
      - `src/license/licenseManager.ts` — `extpay` 동적 import 전체 제거. `openPaymentPage(email)`은 Paddle 체크아웃 링크에 `?user_email=`을 붙여 새 탭으로 열기(SDK 불필요). `openLoginPage()`(매직링크)를 `restoreByEmail(email)`(Worker `/check` 직접 조회)로 대체 — Paddle에는 매직링크 로그인이 없어, 구매·복원 모두 이메일 입력이 한 단계 더 필요해짐.
      - `src/background/background.ts` — `import ExtPay`/`extpay.startBackground()` 정적 import 제거. 24시간 주기 `refreshLicense()`가 저장된 이메일로 Worker `/check`를 `fetch()`하도록 교체.
      - `src/manager/LicenseControl.tsx` — 구매 전 이메일 입력 필드 추가(강조 박스 안). "이미 구매했어요(복원)" 버튼이 새 탭 대신 이메일로 즉시 Worker를 조회하도록 변경.
      - `package.json` — `extpay` 의존성 제거(신규 npm 패키지는 추가하지 않음 — 호스티드 체크아웃+`fetch()`만 사용).
    - **부수적 구조 단순화**: Paddle 확인 방식은 순수 `fetch()`라 extpay가 강제했던 "webextension-polyfill이 PWA에서 크래시하는 문제"가 애초에 없다 — 그래서 background.ts(정적 import)·licenseManager.ts(동적 import)로 나눴던 분리가 더는 필요 없어졌다. PWA 결제 지원 자체(아래 "PWA에 결제 확인 붙이기" 항목)는 이번에 켜지 않았지만, 구조적 걸림돌은 제거해뒀다.
    - **검증**: `npm run typecheck` 통과 확인 예정(이 편집 직후). 실제 Paddle 가입·Worker 배포·결제 클릭은 이 개발 환경에서 검증 불가 — 아래 "남은 절차" 참고.
    - **남은 절차(산들 직접 작업 필요, 코드로 대신 불가)**: ① Paddle 판매자 가입·상품/가격 생성·호스티드 체크아웃 링크 발급 ② Cloudflare 계정 생성·Worker 배포(KV 네임스페이스·웹훅 시크릿 포함, `server/paddle-webhook/README.md` 절차) ③ Paddle 대시보드에 웹훅 URL 등록 ④ 위에서 발급된 두 URL을 `licenseEngine.ts`의 `PADDLE_CHECKOUT_URL`·`PADDLE_VERIFY_ENDPOINT`에 반영 후 재빌드.
    - **Paddle 샌드박스 가입·상품/가격·호스티드 체크아웃 진행 (2026-08-16, Claude in Chrome으로 산들 화면 직접 조작 진행)**: 산들이 Paddle 가입·설정 화면에서 드롭다운(통화·결제주기 등) 선택이 화면에 반영 안 되는 문제로 여러 브라우저(Chrome·Whale)·재부팅까지 시도했으나 해결 안 돼, Claude가 대신 화면을 조작해 진행함.
      - 원인 진단: 드롭다운 선택 자체는 내부 상태에 정상 반영되고 있었음(다시 열면 올바른 항목이 선택 표시됨, 저장 후 "가격 수정" 별도 화면에서도 값이 맞게 보임) — **닫힌 드롭다운의 표시 텍스트만 안 바뀌는 Paddle 자체 화면 버그**로 확인, 산들 컴퓨터·브라우저 문제 아님.
      - 진행 완료: 상품 "TubeFolder PRO" 생성(세금분류: 표준 디지털 상품) → 가격 ₩30,000 KRW·일회성 구매로 생성(내부 설명 입력 필수였음, "TubeFolder PRO 1회 결제"로 기입) → 호스티드 체크아웃 링크 생성.
      - **체크아웃 설정(Checkout Settings) 저장 실패 원인 규명·해결**: 결제수단(대한민국 로컬 카드·네이버페이·카카오페이)과 "기본 결제 링크"를 저장해도 새로고침하면 되돌아가는 문제 발생 → 저장 버튼 클릭 시 네트워크 요청 자체가 안 나가는 것을 확인 → JS로 직접 점검한 결과 "기본 결제 링크" 입력란이 `type="url"` 필드라 브라우저 자체 검증이 절대 URL 형식(스킴 포함)을 요구하는데 `localhost`만 입력해 검증 실패 → 클릭이 씹히고 있었음(Paddle 버그 아님, HTML5 표준 검증). `http://localhost`로 입력해 해결(저장 시 `https://localhost`로 자동 정규화됨) — 새로고침 후 결제수단 3종·기본 결제 링크 모두 서버에 정상 저장된 것을 재확인, 호스티드 체크아웃 URL도 "Something went wrong" 에러 없이 정상적으로 결제 화면(₩30,000, 국내카드/네이버페이/카카오페이/카드 탭) 노출까지 확인.
      - 🟡 **후속조치 (미해결, 산들 확인 필요)**: 호스티드 체크아웃 페이지에 "라이브(실제 판매) 계정에서는 호스티드 체크아웃이 앱투웹 판매 퍼널이 있거나 데스크톱 앱 등에 임베드하는 경우에만 기본 제공되고, 그 외에는 Paddle 고객지원에 접근 요청이 필요하다"는 안내 문구를 발견함 — 튜브폴더의 결제 아키텍처 전체가 호스티드 체크아웃 링크 방식이라, 라이브 전환 전 Paddle 고객지원에 접근 요청을 넣어야 할 가능성이 있음(승인 여부·소요 기간 미확인). 이후 라이브 전환 착수 시 가장 먼저 확인 필요.
      - **연락 방법 확인 완료 (2026-08-16, Paddle 공식 고객센터 페이지로 확인)**: `sellers@paddle.com`으로 이메일 — 반드시 Paddle 판매자 계정에 등록된 이메일 주소(`fics01287@gmail.com`)로 보내야 함(계정 식별용). 별도 신청 양식 없음. **권장 시점: 라이브 계정 가입·본인인증(Identity Verification)까지 끝난 뒤 발송** — 계정 상태가 확정돼야 Paddle이 확인하기 쉬움. 요청 이메일 초안은 산들과의 대화에서 전달함(TubeFolder를 데스크톱 앱 임베드 체크아웃 사례로 설명하는 영문 초안) — 라이브 전환 착수 시 이 초안을 그대로 발송.
      - **Cloudflare Worker 배포 완료 및 서명 검증 401 버그 해결 (2026-08-16~17)**: 산들과 함께 `wrangler login`·KV 네임스페이스 생성·`wrangler secret put`·`wrangler deploy`까지 진행해 `https://tubefolder-paddle-license.sandeul-tf.workers.dev` 배포 완료, `licenseEngine.ts`의 `PADDLE_VERIFY_ENDPOINT`·`PADDLE_CHECKOUT_URL`에 반영함. 이후 실제 테스트 결제마다 웹훅이 `401 Invalid signature`로 거부되는 문제 발생 — 서명 알고리즘 자체는 Paddle 공식 문서·별도 런타임(브라우저 Web Crypto) 교차검증으로 정확함을 확인했으나 계속 불일치. 여러 차례 시크릿 재복사·재입력에도 실패해, Paddle 대시보드의 해당 웹훅 목적지가 표시하는 시크릿 자체를 신뢰할 수 없다고 보고 **그 목적지를 비활성화하고 새 목적지를 새로 생성**해 새 시크릿을 발급받음 → Node로 직접 HMAC 재계산해 새 시크릿으로는 서명이 정확히 일치함을 확인, 문제 해결. (부수적으로 확인된 사실: Paddle 대시보드의 "시크릿 복사" 버튼이 자동화된 클릭으로는 실제 OS 클립보드에 써지지 않는 경우가 있었음 — 이번 문제의 직접 원인은 아니었지만 재발 방지를 위해 클립보드 복사 후에는 항상 실제로 복사됐는지 재확인하는 방식으로 진행함.)
      - **구매자 이메일 미확보 버그 발견·해결 (2026-08-17)**: 서명 검증은 해결됐는데도 `/check`가 계속 `paid:false`를 반환 — 원인은 `transaction.completed` 웹훅 payload에 애초에 `customer.email` 필드가 없고 `customer_id`만 있다는 것(코드가 존재하지 않는 필드를 읽으려 하고 있었음). 산들에게 두 가지 해결 방식(①Paddle API로 `customer_id`→이메일 조회 ②`customer.created` 이벤트를 구독해 KV에 미리 매핑 저장)을 제시, **①번(Paddle API 조회) 채택** — 이벤트 도착 순서에 의존하지 않아 항상 정확함. Paddle 대시보드에서 "Customers: Read" 권한만 있는 API 키를 새로 발급해 `PADDLE_API_KEY` 시크릿으로 등록, `worker.js`에 `fetchCustomerEmail()` 추가(API 실패 시에도 예외로 죽지 않고 `__unresolved__` 키에 남겨 나중에 확인 가능하게 함). 디버깅용으로 넣었던 `/debug-last` 임시 엔드포인트·상세 콘솔 로그는 문제 해결 후 모두 제거함.
      - **최종 검증 완료 (2026-08-17)**: 새 테스트 결제(`sandeul.test7@example.com`) 진행 → `GET /check?email=...`이 `{"paid":true,"paidAt":...,"transactionId":"txn_01m05n8sgvgchc8htnevhtvd56"}`를 정상 반환하는 것까지 확인 — 웹훅 서명 검증부터 이메일 확보·라이선스 저장·조회까지 전체 파이프라인이 샌드박스 기준으로 끝까지 작동함을 확인함.
      - 🟡 **후속조치**: ① `PADDLE_API_KEY`는 만료일이 있는 키로 발급됨(2026-11-14) — 라이브 전환 전 무기한 키로 재발급하거나 만료 전 갱신 알림을 잊지 말 것. ② `worker.js`의 `PADDLE_API_BASE` 상수가 샌드박스 주소로 고정돼 있음 — 라이브 전환 시 `PADDLE_CHECKOUT_URL`·`PADDLE_WEBHOOK_SECRET`·`PADDLE_API_KEY`와 함께 반드시 같이 라이브 값으로 교체할 것(하나만 바꾸면 불일치로 다시 막힘).
      - **라이브 계정 전환 착수 (2026-08-17, 산들 진행 중, Cowork 화면 캡처로 안내)**: Paddle 라이브 계정 온보딩 시작 — 본인인증(신원 확인) 신청 제출 완료, 웹사이트 도메인 검토는 1차 반려됨(사유: 제출한 `fics01287-arch.github.io`가 GitHub Pages "프로젝트 사이트" 구조라 도메인 루트 자체는 빈 페이지(404)이고 실제 콘텐츠는 `/tube-folder/...` 하위 경로에 있어 Paddle 자동 스캐너가 "오프라인"으로 판단 — SSL·로그인 벽 문제 아님, 직접 접속해 확인함). 대시보드의 연필 아이콘으로 제출 도메인 값을 `fics01287-arch.github.io/tube-folder/tubefolder-extension-v2/pwa-dist/legal`(실제 콘텐츠 있는 경로, 접속 확인함)로 수정 후 재제출함 — 결과 대기 중.
      - **라이브 온보딩 "01 실계정을 설정하세요" 체크리스트 확인 (2026-08-17)**: Paddle이 보여주는 항목 중 실제로 튜브폴더 구조(호스티드 체크아웃 링크 + Cloudflare Worker 웹훅, Paddle.js 미사용)에 해당하는 것만 추림 — ①카탈로그(상품+가격) 실계정에 재생성 ②결제 수단 활성화(카드+국내 결제수단) ③기본 결제 링크 설정(→`PADDLE_CHECKOUT_URL` 라이브 값) ④알림 수신처(웹훅) 생성 — 기존 Worker 주소(`.../webhook`)를 실계정에 등록해 새 시크릿 발급(→`PADDLE_WEBHOOK_SECRET` 라이브 값). "클라이언트 측 토큰 생성"·`Paddle.Environment.set`/`Retain` 관련 안내는 Paddle.js 전용이라 튜브폴더에는 해당 없음(무시). 착수 시점에 "02 계정을 인증하세요"(본인인증+도메인) 승인 전이라 카탈로그 생성이 막혀 있는 것으로 보임 — 계정 인증 완료 후 재시도 필요.
      - 🟡 **후속조치(신규 발견, 2026-08-17)**: 기존 체크리스트에 없던 **지급금 설정**(비즈니스 계정 > 지급 > 지급 설정에서 은행 계좌 등록) 항목을 Paddle 라이브 온보딩 화면에서 새로 확인함 — 실제 정산을 받으려면 필요, 급하지 않으나 라이브 전환 완료 전 처리 필요.
    - 복잡도: 높음 (외부 서비스 연동 + 신규 서버 컴포넌트 + 검증 로직)
  - 복잡도: 높음 (외부 서비스 연동 + 검증 로직) — *위 Paddle 전환 이후 실제 복잡도는 "신규 서버 컴포넌트" 추가로 더 높아졌음, 상세는 위 항목 참고*

- [x] **유료→무료 전환 스위치 구현** (신설·완료 2026-07-27, 산들 요청 — "유료 판매 목적으로 개발했지만 내가 무료 배포로 결정하면 언제든 전환할 수 있게 해줘")
  - 배경: 위 "결제 연동 구현"으로 유료화 자체는 구현됐지만, 산들이 이후 마음을 바꿔 "이 앱은 무료로 풀겠다"고 결정할 경우를 대비한 되돌리기 경로가 없었음. CLAUDE.md "유료화 대비 개발 원칙"에 원칙만 있고 구현은 없던 상태.
  - **질문 절차 관련 참고**: 착수 전 AskUserQuestion으로 "빌드 시점 스위치 vs 실시간 원격 스위치" 중 확인을 시도했으나 응답을 받지 못함 → 산들의 후속 설명("무료로 배포하고 싶을 때 전환")이 급박한 실시간 전환보다는 "재배포 시점에 결정"에 가깝다고 판단해 **빌드 시점 스위치(Option A)로 진행** — 이 가정을 여기 기록해둠. 실시간(이미 설치된 사용자에게 즉시 반영) 전환이 필요하면 원격 설정 파일 등 별도 설계·네트워크 호출·보안 검토가 추가로 필요해 별도 승인 후 진행 예정.
  - **구현 내용**:
    - `src/license/licenseEngine.ts`에 `export const FREE_DISTRIBUTION_MODE = false;` 상수 하나만 추가 — 이 값을 `true`로 바꾸고 재빌드·재배포하면 끝나는 단일 스위치로 설계(코드 곳곳의 조건을 하나씩 지울 필요 없음). `getCachedLicense()`가 이 값이 true일 때 무조건 `{ paid: true, ... }`를 반환하도록 처리해, 이 함수 하나에 의존하는 모든 하위 로직(폴더·영상 개수 제한, 동기화 PRO 잠금 등)에 자동으로 전파됨.
    - `src/license/licenseManager.ts`(`refreshLicenseFromManager`)·`src/background/background.ts`(`refreshLicenseFromManager`/알람 재확인 로직)에도 같은 플래그 체크를 추가해, 무료 전환 모드에서는 결제 서버 온라인 조회 자체를 하지 않음(어차피 항상 "유료" 취급이라 네트워크 호출이 무의미).
    - `src/manager/LicenseControl.tsx` — 무료 전환 모드에서는 "🎁 무료" 배지 + "모든 기능을 무료로 제공합니다" 안내 패널을 보여주도록 분기 추가.
  - **개발 중 발견·수정한 버그 1건 (esbuild 데드코드 제거로 인한 컴포넌트 전체 소거)**: `LicenseControl.tsx`의 기존 가드(`if (!isLicenseAvailable()) return null;`)가 `EXTPAY_EXTENSION_ID`가 아직 플레이스홀더인 동안은 컴파일 타임에 항상 참으로 확정되는 식이라, esbuild 압축 시 이 컴포넌트 전체(무료 전환 배지 분기 포함)가 통째로 제거되는 문제를 빌드 산출물 직접 검사로 발견 → 가드를 `if (!FREE_DISTRIBUTION_MODE && !isLicenseAvailable()) return null;`로 수정해 무료 전환 모드일 때는 이 가드를 건너뛰도록 해결.
  - **검증**: `/tmp` 스크래치 빌드에서 `FREE_DISTRIBUTION_MODE=true`/`false` 두 상태 모두 4개 빌드(manager/background/content/pwa) 전부 `tsc --noEmit` 통과 확인. 컴파일된 번들을 Node.js로 직접 문자열 검색해 true일 때 "🎁"·"모든 기능을 무료로 제공" 포함 및 "구매하기" 제외(정상 소거)를, false일 때는 배지 자체가 통째로 숨겨지는 기존 동작(ExtensionPay 미설정 상태이므로 원래도 배지가 안 보이던 것과 동일 — 이번 변경으로 인한 회귀 아님)이 그대로 유지됨을 각각 확인.
  - **검증 한계**: 실제 Chrome 확장·PWA 화면에 띄워 "🎁 무료" 배지를 육안으로 확인하지는 못함(이 개발 환경은 브라우저 실행 불가) — 번들 문자열 검사로만 검증. 산들이 실제로 이 스위치를 켤 일이 생기면(즉 `true`로 바꿔 재배포하기 직전) 확장으로 로드해 배지가 정확히 뜨는지 한 번 육안 확인 권장.
  - 🟢 알려진 제약(결함 아님): 빌드 시점 상수라 이미 설치된 사용자에게는 새 버전 배포(업데이트) 후에만 반영됨 — "즉시 전체 사용자에게 실시간 반영"이 필요하면 별도 설계 필요(위 참고 항목).
  - 복잡도: 낮음 (설계는 "한 곳만 고치면 끝"으로 단순화, 검증 과정에서 무관한 기존 버그 하나를 함께 발견·수정)

- [x] **PWA(휴대폰 매니저)에 결제 확인 붙이기** — 구현 완료 (2026-08-17) (신설 2026-07-21, 앱개발지침 §7 "멀티 플랫폼 배포 시 주의" 반영)
  - 배경: 크롬 확장은 데스크톱 전용이라 휴대폰에서는 v1 PWA 매니저 페이지(GitHub Pages)로만 접근 가능. "결제 연동 구현" 항목이 지금까지는 크롬 확장 기준으로만 계획돼 있었음.
  - 내용: PWA에서도 이메일로 결제 대행 서비스에 직접 조회해 결제 여부를 확인하고 유료 기능을 풀어준다. 콘텐츠 동기화(모바일 자동 동기화 항목)와는 무관하게 독립적으로 동작해야 함 — 동기화가 안 돼 있어도 결제 확인은 가능해야 함.
  - **조사 결과 (2026-07-27, 당시엔 산들 결정 필요 상태였음)**: ExtensionPay(당시 채택 서비스) 기준으로는 `extpay.getUser()`가 확장 전용 API라 PWA에서 바로 호출할 방법이 없어 3가지 선택지를 놓고 산들 결정을 기다리던 상태였음.
  - **착수 시점 재확인 (2026-08-17) — 위 blocker가 이미 해소돼 있었음**: 2026-07-30 ExtensionPay → Paddle 전환(별도 항목) 때 결제 확인 방식 자체가 "Cloudflare Worker의 `GET /check?email=` 순수 REST 엔드포인트 조회"로 바뀌었고, 이 Worker는 애초에 `Access-Control-Allow-Origin: '*'`로 PWA 등 일반 웹 컨텍스트의 조회를 염두에 두고 만들어져 있었음(`worker.js` 주석에 명시, 실제로도 확인함) — 즉 "①ExtensionPay에 웹용 조회 방법 문의" 선택지가 필요 없어졌고, 별도 산들 결정 없이 바로 착수 가능한 상태였음. 인계서(`튜브폴더_v2_인계서_2026-08-17.docx`)에도 이 판단이 기록돼 있어 동일한 결론으로 착수.
  - **구현 내용**:
    - `src/license/licenseManager.ts` — `isLicenseAvailable()`에서 `isExtensionContext()` 요구조건 제거, `isLicenseConfigured()` 하나만 확인하도록 변경. 이 함수 하나에 의존하던 하위 로직(결제 UI 노출 `LicenseControl.tsx`, 온라인 재확인 `refreshLicenseFromManager`, 폴더·영상 무료 한도 `folderOps.ts`/`storage.ts`, 동기화 PRO 전용 게이트 `SyncControl.tsx`/`syncEngine.ts`)에 자동으로 전파됨 — 별도 파일마다 조건을 고쳐 다닐 필요 없이 단일 지점 수정으로 끝남(CLAUDE.md "유료→무료 전환 대비 원칙"의 단일 진입점 설계 원칙과 같은 이유로 이미 그렇게 짜여 있던 구조 덕분).
    - `src/license/licenseEngine.ts` — `getCachedLicense()`/`writeLicenseState()`가 지금까지 `chrome.storage.local` 전용이라 PWA(chrome 미정의)에서는 캐시가 항상 비어 있고 저장도 no-op이었던 문제를 발견·수정. `storage.ts`의 `hasChromeStorage()`+`localStorage` 폴백과 동일한 패턴을 추가(이미 그 모듈 주석에 "향후 PWA 확장 시에도 이 모듈 교체 없이 그대로 동작"이라고 설계돼 있던 것과 같은 패턴을 라이선스 모듈에도 뒤늦게 맞춤).
    - `src/manager/LicenseControl.tsx` — PWA는 크롬 확장의 `chrome.alarms`(24시간 주기 백그라운드 재확인, `background.ts`)에 해당하는 상시 백그라운드 컨텍스트가 없어, 이 컴포넌트(매니저 페이지 자신)가 대신 트리거하는 `useEffect` 추가 — 마운트 시 1회 + `visibilitychange`(포그라운드 복귀) 시 `needsRecheck()`가 참이고 저장된 이메일이 있을 때만 `refreshLicenseFromManager()` 호출(모바일 자동 동기화 항목의 "포그라운드 복귀 트리거" 패턴, `App.tsx`와 같은 이유로 setInterval 없이 이 두 시점만 사용 — 24시간 주기라 짧은 폴링이 불필요). 승인 기반 무료 라이선스(`isLicenseKeyGranted`)는 기존 로직과 동일하게 재확인 대상에서 제외.
    - `Worker(server/paddle-webhook/worker.js)` — 변경 없음(이미 PWA 조회를 염두에 둔 CORS 설정이었음, 위 참고).
    - 나머지 파일(`folderOps.ts`·`storage.ts`·`SyncControl.tsx`·`syncEngine.ts`)은 "확장 컨텍스트 + 결제 설정 완료"를 전제로 쓰여 있던 주석만 현재 동작에 맞게 갱신(코드 로직 자체는 `isLicenseAvailable()` 정의 변경만으로 이미 올바르게 동작).
  - **의도된 부수효과(결함 아님) — PWA에도 무료 한도·동기화 PRO 게이트가 함께 켜짐**: `folderOps.ts`/`storage.ts`의 폴더 30개·영상 150개 무료 한도, `SyncControl.tsx`/`syncEngine.ts`의 "클라우드 동기화는 PRO 전용" 게이트가 `isLicenseAvailable()`을 그대로 참조하고 있어, Paddle이 설정된 뒤로는 PWA에도 자동으로 함께 적용된다. 이는 우연이 아니라 "결제 연동 구현" 항목 당시(2026-08-17 이전 기록)부터 "그 항목(PWA 결제 확인)이 완료된 뒤 함께 켜는 것으로 설계"라고 명시돼 있던 계획 그대로임 — 별도 작업 불필요.
  - **검증**: `npm run typecheck`(`tsc --noEmit`, `noUnusedLocals`/`noUnusedParameters` 포함) 통과, `npm run build`(확장 3종: manager/background/content) + `npm run build:pwa` 총 4개 빌드 전부 통과. PWA 빌드 산출물(`pwa-dist/assets/*.js`)을 문자열로 직접 검사해 "구매하기"·"결제에 사용할 이메일"·"PRO 사용 중"·"라이선스 키가 있으신가요" 텍스트가 실제로 포함됨을 확인 — `LicenseControl.tsx`가 더는 PWA에서 숨겨지지 않고 번들에 포함돼 있음을 확인.
  - **검증 한계**: 이 개발 환경은 브라우저를 띄울 수 없어 실제 PWA 화면에서 이메일 입력→구매/복원 클릭→Paddle Worker 조회까지의 종단 클릭 검증은 하지 못함(기존 확장 쪽 Paddle 파이프라인은 2026-08-16~17 세션에서 이미 실제 테스트 결제로 종단 검증 완료 — 동일한 `refreshLicenseFromManager`/`fetchPaidStatus` 경로를 PWA도 그대로 재사용하므로 로직 자체의 신뢰도는 높으나, PWA만의 변수(모바일 브라우저 CORS·localStorage 동작)는 실기기 확인 전까지 미확정). 산들이 실제로 `pwa-dist`를 재배포한 뒤 휴대폰에서 이메일 입력→"이미 구매했어요(복원)" 클릭으로 기존 테스트 결제 이메일(`sandeul.test7@example.com`) 조회가 실제로 되는지 한 번 확인 권장.
  - 🟢 참고: 현재 `PADDLE_CHECKOUT_URL`은 여전히 샌드박스 체크아웃 링크다 — "결제 연동 구현" 항목의 라이브 전환이 끝나기 전까지는 PWA에서도 실제 결제는 불가능(확장과 동일한 제약, 이 항목이 그 라이브 전환을 대신하지는 않음).
  - 🟢 참고(파일 정리 필요): 빌드 결과물을 이 마운트된 폴더에 반영하는 과정에서 이전 해시의 자산 파일(`dist/assets/index-DXD6Wg2j.js`, `pwa-dist/assets/index.pwa-DGqbalq4.js`)을 삭제하지 못했다(이 개발 환경의 마운트가 파일 삭제(unlink) 자체를 막고 있음 — 덮어쓰기·이름변경은 되지만 삭제는 안 됨, 이번 세션에서 재확인). `.orphaned-2026-08-17` 접미사를 붙여 표시만 해뒀으니, 산들이 로컬 탐색기에서 이 두 파일을 지우고 커밋해주시면 됨(둘 다 더는 어디서도 참조되지 않는 안전한 삭제 대상).
  - **🟡 실기기 검증 중 버그 발견·수정 (2026-08-17, 산들)**: 위 절차대로 PWA에서 이메일 복원 테스트 → "PRO 활성화 완료" 팝업의 "확인" 버튼 글씨가 안 보인다고 제보. 원인: `App.css`의 `.tf-btn`(배경 `#3ea6ff` 파란색)과 `.tf-btn-primary`(글씨색도 `#3ea6ff` 파란색)가 `className="tf-btn tf-btn-primary"`로 항상 함께 쓰이는데 배경·글씨가 같은 색이라 텍스트가 안 보였음(테두리도 `.tf-btn`의 `border:none`을 `.tf-btn-primary`가 `border-color`만 지정해 스타일 없이는 렌더링 안 돼 사실상 완전히 안 보이는 버튼이었음). `.tf-btn-primary`를 배경 투명+테두리 강조형으로 변경해 수정 — 같은 클래스 조합을 쓰는 다른 버튼(💳 구매하기, 동기화 연결·수동 동기화 등, `SyncControl.tsx`)도 전부 같은 문제였어서 이번 수정 하나로 함께 해결됨. `tsc`+4개 빌드 재검증, `pwa-dist` 재배포 완료(커밋 `2019ec6`). 산들이 다시 한번 육안 확인 권장.
  - 복잡도: 중간

- [x] **승인 기반 무료 라이선스 구현** — 구현 완료 (2026-07-29) (신설 2026-07-21, 앱개발지침 §7 반영)
  - 배경: 유료화 앱이라도 개발자(산들)가 승인한 특정 사용자에게는 결제 없이 무료로 제공할 수 있는 경로가 필요할 수 있음(예: 지인 테스트, 홍보용 배포).
  - 내용: 재사용 가능한 라이선스 키(활성화해도 소모되지 않는 영구 자격증명) + 이메일 조합으로 검증. 키 하나만으로는 타인 공유·무단 사용 위험이 있어 최소 키+이메일 조합을 기본으로 한다.
  - 구현 메모: "결제 연동 구현" 항목의 라이선스 상태 저장 구조를 그대로 활용 — 정식 결제와 마찬가지로 "유료 상태 = true" 플래그를 세팅하되, 그 근거가 "결제 확인"이 아니라 "라이선스 키 검증"이라는 점만 다름.
  - 전제: "결제 연동 구현" 항목의 라이선스 상태 저장 구조 확정 후 착수.
  - **점검 확인 (2026-07-28, 산들 요청으로 실제 코드 검색해 확인)**: `src` 전체를 라이선스 키·화이트리스트 관련 키워드로 검색한 결과 관련 코드 없음 — 지침·체크리스트에 원칙만 반영돼 있고 실제 구현은 아직 착수 전인 상태 그대로임(상태 변경 없음).
  - **주의 — 위 "유료→무료 전환 스위치"(완료됨)와는 다른 기능**: 그 항목은 켜면 **전체 사용자**가 무료가 되는 전역 스위치이고, 이 항목은 개발자가 지정한 **특정 인원만** 무료로 쓰게 하는 개별 승인 기능이다 — 서로 대체 관계 아님, 별도로 구현됨.
  - **핵심 설계 판단 — 검증 방식은 서버 없이 클라이언트 화이트리스트 대조**: 이 확장은 서버 코드가 없는 구조(3단계 "결제 연동 구현"에서 ExtensionPay를 고른 이유와 동일 원칙)라, 라이선스 키 검증도 별도 서버 구축 없이 빌드에 포함된 배열과 클라이언트에서 직접 대조하는 방식으로 구현(착수 전 별도 승인 절차 없이 기존 "서버 없음" 원칙을 그대로 연장 적용한 판단 — FREE_DISTRIBUTION_MODE처럼 소스를 고쳐 재빌드·재배포하는 방식과 같은 급의 결정이라고 보고 진행). 트레이드오프(번들을 열면 화이트리스트가 보임)는 알려진 한계로 아래에 명시.
  - **구현 내용**:
    - `src/license/approvedLicenses.ts`(신규) — `{ key, email, note? }` 배열 `APPROVED_LICENSES`(초기값 빈 배열). 산들이 새 승인 대상을 추가하려면 이 배열에 한 줄 추가 후 재빌드·재배포(주석에 안내 포함). key는 임의 문자열(형식 강제 없음, 트리밍 후 대소문자 구분 비교), email은 대소문자 구분 없이 비교.
    - `src/license/licenseEngine.ts` — `LicenseState`에 `source?: 'extpay' | 'license-key'` 필드 추가(optional, 별도 storage 키의 값이라 DATA_VERSION 마이그레이션과 무관). `verifyLicenseKey(key, email)`(순수 함수, 화이트리스트 대조) · `isLicenseKeyGranted(state)`(재확인 제외 판단용) 신규.
    - `src/license/licenseManager.ts` — `redeemLicenseKey(key, email)` 신규(검증 통과 시 `{ paid: true, source: 'license-key', ... }`를 기존 저장 구조 그대로 `writeLicenseState`). **버그 방지 처리**: `refreshLicenseFromManager()`가 매 재확인마다 `isLicenseKeyGranted()`로 먼저 걸러 캐시를 그대로 반환하도록 수정 — 안 하면 승인 무료 사용자는 ExtensionPay에 결제 기록이 없어 온라인 재확인 때마다 "무료"로 오인돼 되돌아감(요구사항의 "영구 자격증명"과 정면으로 상충하는 문제라 구현 중 미리 발견해 방어).
    - `src/background/background.ts` — 24시간 주기 `refreshLicense()`에도 동일한 `isLicenseKeyGranted()` 가드 추가(매니저를 안 열어도 백그라운드 재확인이 되돌리지 않도록).
    - `src/manager/LicenseControl.tsx` — 기존 "구매/복원" 패널 하단에 "🔑 라이선스 키가 있으신가요?" 토글 버튼 → 키+이메일 입력 폼(Enter로 제출, 기존 `.tf-input`/`.tf-error-banner`/`.tf-sync-actions` 클래스 재사용, 신규 CSS는 `.tf-license-redeem`(간격) 하나만 추가) → 성공 시 기존 결제 완료와 동일한 "✨ PRO 활성화 완료" 팝업 재사용. 결제(Stripe 새 탭 이동)와 달리 외부 이동 없이 패널 안에서 즉시 완료.
    - **적용 범위**: 기존 `LicenseControl`이 `isLicenseAvailable()`(확장 컨텍스트 + ExtensionPay 설정 완료)일 때만 렌더링되는 가드를 그대로 물려받아, PWA에서는 자동으로 숨겨짐 — "PWA에 결제 확인 붙이기"(별도 로드맵 항목, 아직 미착수) 범위와 자연스럽게 일치, 이번 작업에서 PWA용 추가 작업 불필요.
  - **알려진 한계(결함 아님, 서버 없는 구조의 트레이드오프, `approvedLicenses.ts` 주석에도 명시)**: 화이트리스트 배열이 빌드된 JS 번들에 그대로 포함되므로 번들을 열어보면 키·이메일 목록이 노출됨 — 배포 대상이 산들이 직접 선정한 소수의 지인·홍보 대상이라는 낮은 위협 모델을 전제로 한 "확인 절차" 수준 보호이지, 실제 결제(ExtensionPay·Stripe)와 동등한 보안 수준은 아님. 불특정 다수의 무단 사용 방지가 목적이 아니라 산들이 지정한 사람에게 결제 없이 간단히 제공하는 것이 목적이므로 이 수준이면 충분하다고 판단.
  - **검증**: `npm run build`(tsc --noEmit + 확장 3종) + `npm run build:pwa` 총 4개 빌드 전부 통과. `APPROVED_LICENSES`가 초기값 빈 배열이라 아직 실제 키로 종단 검증(화면에서 입력→PRO 전환)은 하지 못함 — 산들이 실제 승인 대상이 생기면 `approvedLicenses.ts`에 항목을 추가한 뒤 확장으로 로드해 키 입력→PRO 배지 전환→앱 재시작 후에도 유지(24시간 재확인에도 되돌아가지 않음)를 육안 확인 권장.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고: 발급된 키를 개발자가 회수(철회)하려면 화이트리스트에서 제거 후 재배포해야 하는데, 이미 그 키로 활성화해 로컬에 `paid:true`가 저장된 기존 사용자에게는 재배포만으로는 소급 적용되지 않음(다음 온라인 재확인 대상에서 애초에 제외되도록 설계했기 때문) — 철회가 필요한 사례가 실제로 생기면 별도 처리(예: 재확인 예외 목록에 "철회된 키" 블랙리스트 추가) 검토 필요.
  - 복잡도: 중간

---

## 4단계 — 마무리 다듬기

- [x] **폴더 아이콘 다양화 + 기본 아이콘으로 초기화** — 구현 완료 (2026-07-29)
  - 배경: 지금(v1)은 모든 폴더 아이콘이 노란 폴더 하나로 동일해서 폴더가 많아지면 구분이 안 됨(실사용 화면에서 확인됨).
  - 목표: 폴더마다 다른 아이콘을 고를 수 있는 메뉴 추가, 종류별(예: 음악/취미/공부/업무/생활 등 카테고리)로 구분해서 고르기 쉽게. 원하면 다시 기본 아이콘 하나로 되돌리는 "초기화" 기능도 포함.
  - 아이콘 소스: **오픈소스 아이콘셋 수집(Material Symbols·Heroicons 등 라이선스 명확한 무료 항목)과 클로드가 직접 디자인하는 아이콘 제작, 둘 다 검토** — 수집으로만 한정하지 않음. 수집 아이콘은 실제 착수 시 라이선스 표기(출처) 문서화 필요.
  - 구현 메모: 폴더 데이터에 `icon` 필드 추가(현재 storage.js 데이터 모델에 없음 — 작은 추가라 1단계 저장소 백엔드 결정과 무관하게 진행 가능). 아이콘 없으면 기존 기본 폴더 아이콘 사용(하위 호환).
  - **착수 전 결정 (2026-07-29, AskUserQuestion, 산들 선택)**: 아이콘 소스 세 옵션(오픈소스 SVG 수집 / 클로드 커스텀 디자인 / 이모지 세트) 중 **이모지 세트**로 확정. 근거: 이 앱은 이미 전역이 이모지 기반 UI(📁🗑️🎬✏️ 등)라 스타일이 일관되고, 라이선스 표기 문서화·에셋 파이프라인 구축 없이 즉시 구현 가능. 지금 매니저 화면이 아직 최소 스캐폴딩 목록 뷰(그리드 등 정식 뷰는 5단계 예정)라는 점도 고려됨 — `icon` 필드는 문자열 하나라 나중에 SVG 세트로 바꾸고 싶어지면 카탈로그 파일만 교체하면 되고 데이터 구조는 그대로 유지.
  - **구현 내용**:
    - `src/shared/folderIcons.ts`(신규) — `FOLDER_ICON_CATEGORIES`(카테고리 7종 × 이모지 8개씩: 음악/취미/공부/업무/생활/여행/영화·방송) + `DEFAULT_FOLDER_ICON`(📁).
    - `src/storage/types.ts` — `FolderNode`에 `icon?: string` optional 필드 추가(하위호환, DATA_VERSION 마이그레이션 불필요 — VideoNode의 `lastPosition`/`lastWatchedAt` 추가 때와 같은 패턴).
    - `src/storage/folderOps.ts` — `setFolderIcon(folderId, icon)` 신규(`renameFolder`와 동일 구조: 루트·휴지통은 변경 거부, `touch()`로 modifiedAt·version 갱신 → 동기화 병합 대상에 자동 포함). `icon=null`이면 필드를 삭제해 기본 아이콘으로 초기화.
    - `src/manager/App.tsx` — 폴더 행·브레드크럼에 아이콘을 그리던 하드코딩(`isTrash ? '🗑️' : '📁'`)을 `folderIcon(node, store)` 헬퍼로 교체(루트=🏠·휴지통=🗑️ 고정, 그 외는 `node.icon || 기본값`). 폴더 행 액션(✏️ 이름변경·🗑 삭제) 옆에 "🎨 아이콘 변경" 버튼 추가 → 클릭 시 카테고리별 그리드 오버레이 패널(기존 `.tf-sync-overlay`/`.tf-sync-panel` 패턴 재사용) 오픈, 이모지 클릭 시 즉시 반영, "기본 아이콘으로 초기화" 버튼 포함.
    - `src/manager/App.css` — `.tf-icon-picker`(최대높이 320px + 스크롤)·`.tf-icon-picker-grid`(8열 그리드) 등 5개 클래스 신규 추가.
    - **동기화 호환성 확인**: `src/sync/merge.ts`의 노드 병합이 승자 노드 객체를 통째로 스프레드(`{ ...winner }`)하는 구조라, `icon` 필드는 별도 코드 수정 없이 자동으로 병합 대상에 포함됨을 코드 확인.
  - **검증**: `npm run build`(tsc + 확장 3종) + `npm run build:pwa` 4개 빌드 통과. **Playwright(headless Chromium)로 로컬 dev 서버(`npm run dev`, localStorage 폴백)를 실제로 띄워 클릭 경로 종단 검증**: 폴더 생성 시 기본 아이콘(📁) → 🎨 버튼 클릭 시 카테고리 7종이 담긴 패널 오픈(스크린샷 확인) → 🎵(음악) 클릭 시 즉시 폴더 표시가 🎵로 변경 → 다시 열어 "기본 아이콘으로 초기화" 클릭 시 📁로 복귀, 매 단계 콘솔 에러 0건. 패널 내 아이콘 목록이 320px를 넘는 경우(여행·영화·방송 카테고리) 실제 스크롤로 나머지가 보임을 스크린샷으로 확인. 검증에 쓴 임시 스크립트·스크린샷·playwright 패키지는 작업 종료 후 모두 정리(제거)함 — 저장소에 남지 않음.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고: 지금은 최소 목록 뷰라 아이콘이 텍스트 앞에 붙는 형태로만 보임 — 5단계 정식 그리드 뷰가 만들어지면 더 큰 타일 형태로 부각될 것으로 예상(추가 작업 불필요, 이미 `node.icon` 데이터로 준비돼 있음).
  - 복잡도: 낮음~중간

- [ ] 드래그로 순서 재배치 시 삽입선 표시 (현재 v1은 `Alt+↑/↓`로만 수동 정렬)
  - **착수 중 발견(2026-07-27, 산들 확인 필요)**: 이 항목은 "이미 있는 드래그 재배치에 삽입선만 추가"를 전제로 복잡도 낮음으로 분류돼 있었으나, 실제로는 v2 매니저(App.tsx)에 그리드·가상 스크롤·드래그앤드롭 자체가 아직 구현돼 있지 않음(1단계에서 기술 스택만 결정, 실제 구현은 안 됨 — `dnd-kit`·`@tanstack/react-virtual` 패키지도 미설치). 즉 이 항목은 사실상 "정식 뷰(그리드/가상스크롤/드래그앤드롭) 전체 구현"이 되며, 새 의존성 추가가 필요해 산들 승인 후 별도 착수 필요. 착수 보류.

- [x] **영상 `duration` 실제 수집** — 구현 완료 (2026-07-27)
  - 목표: '크기' 정렬 정밀화용 재생시간(초) 데이터를 실제 값으로 채운다(데이터 모델 `VideoNode.duration` 필드는 이미 있었음, 지금까지 항상 0으로 저장되고 있었음).
  - **구현 결정 — 새 API 키·의존성 없이, 이미 쓰던 것과 같은 방식(공개 페이지 파싱) 재사용**:
    - 재생목록 일괄 가져오기(`playlistImport.ts`): 이미 fetch해 파싱하던 `ytInitialData`의 `playlistVideoRenderer`에 `lengthSeconds`(정확한 초 단위 원본값)가 그대로 들어있어, 추가 네트워크 호출 없이 그 값만 더 읽음(없으면 표시용 `lengthText`, 예: `"1:02:03"`를 초로 환산하는 것으로 폴백, 라이브 방송 등 파싱 불가 텍스트는 조용히 0).
    - 단건 추가(우클릭 "동영상 추가", `background.ts`): oEmbed(`fetchMeta`)는 재생시간을 안 주므로, 재생목록과 같은 원리로 시청 페이지(`youtube.com/watch?v=`) HTML에 공개돼 있는 `videoDetails.lengthSeconds`를 정규식으로 읽는 `fetchDuration()`(신규, `storage.ts`) 추가. 제목/채널 조회(`fetchMeta`)와 재생시간 조회를 `Promise.all`로 병렬 실행 — 하나가 실패해도 다른 하나(및 영상 추가 자체)는 영향받지 않음.
  - **구현 파일**: `src/storage/storage.ts`(`fetchDuration` 신규) · `src/background/background.ts`(병렬 조회 후 `addVideoToFolder`에 전달) · `src/storage/playlistImport.ts`(`PlaylistVideo.duration` 필드 추가, `lengthSeconds`/`lengthText` 파싱) · `src/storage/folderOps.ts`(`ImportVideoInput.duration` 추가, 하드코딩된 `duration: 0` 제거) · `src/manager/App.tsx`(재생목록 가져오기 호출부에 `duration` 전달, 목록에 재생시간 표시용 `formatDuration()` 추가) · `src/manager/App.css`(`.tf-row-duration` 스타일).
  - **부가 작업**: 데이터만 모아두면 눈으로 확인이 안 돼, 검증 겸 현재 최소 목록 화면의 영상 줄에 재생시간을 작게 표시하도록 함(`🎬 제목  12:34`) — '크기' 정렬 UI 자체는 정식 뷰(4단계 위 항목·보류) 몫이라 범위에 넣지 않음.
  - **검증**: `tsc --noEmit` + 확장 3종 + PWA 빌드 총 4개 통과. 파싱 로직(`lengthSeconds` 우선, `lengthText`의 `"10:34"`/`"1:02:03"`/`"실시간"` 각 케이스, `formatDuration` 표시 형식)은 Node 스크립트로 별도 단위 검증(전부 통과) — playlist 페이지 실제 HTML 구조 자체는 이 환경에서 네트워크 접근이 안 돼 재현 불가(2단계 재생목록 가져오기 항목과 동일한 기존 검증 한계).
  - **검증 한계**: 실제 유튜브 서버 응답으로 시청 페이지 파싱(`fetchDuration`)이 잘 되는지, 화면에 재생시간이 올바르게 뜨는지는 확장으로 로드해 실제 클릭으로 확인 필요.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고: 라이브 방송·비공개/삭제 영상 등 `lengthSeconds`를 못 구하는 경우는 계속 0(미수집)으로 남음 — 나중에 정식 뷰에서 정렬 시 "크기 없음" 취급하면 됨.
  - 복잡도: 낮음

- [x] **휴지통 보존기간 설정·자동 비우기** — 구현 완료 (2026-07-27)
  - 착수 전 반영 필요했던 5가지(앱개발지침 §5 "삭제·보관정책 UX 투명성 원칙") 모두 반영: ①보관기간·자동 영구삭제 시점을 휴지통 화면에 상시 배너로 안내 ②보관기간 조정 옵션 + "자동 삭제 없음" 옵션 ③보관기간 변경은 기존 항목에도 소급 적용 기본값 ④보관기간을 줄여 기존 항목이 즉시 영구삭제될 수 있는 경우 영향받는 항목 수를 알리고 확인받기 ⑤초기 사용 기간 삭제 시점 안내 — **추가 구현(2026-07-27, 산들 요청)으로 완전 반영**: 삭제(휴지통 이동) 시 보관기간 정책 안내 팝업 + "다음부터 이 안내를 보지 않기" 체크(아래 참고).
  - **산들 결정 (2026-07-27)**: 구글 드라이브·원드라이브·드롭박스 개인 요금제 모두 30일이 업계 표준이라는 조사 결과를 바탕으로 **기본값 30일 + 직접 조정 + "자동 삭제 없음" 옵션**으로 확정.
  - **구현 결정 — "휴지통에 들어간 시점" 판단 기준**: 별도 `trashedAt` 필드를 새로 추가하지 않고, 휴지통으로 직접 옮겨진 최상위 항목(`parentId===trashId`)의 기존 `modifiedAt`(휴지통 이동도 `touch()`가 갱신하는 "수정"으로 취급돼 있었음)을 그대로 재사용 — 새 필드·마이그레이션 불필요. 하위 자손은 부모를 따라가는 구조(DATA-MODEL.md)라 자손 각각의 만료 여부는 판단하지 않고, 최상위 항목이 만료되면 하위 트리 전체를 함께 정리(emptyTrash와 같은 BFS 패턴 재사용).
  - **구현 결정 — 자동 비우기 실행 시점**: 상시 백그라운드 타이머(`chrome.alarms`) 대신 "매니저 화면을 열 때마다 한 번 확인"하는 방식 채택 — 4단계 낮음 복잡도에 맞게 범위를 최소화. 오래 안 열어도 데이터가 사라지는 게 아니라 다음에 열 때 한꺼번에 정리되므로 안전 측면 문제 없음. 더 즉각적인 정리를 원하면 추후 `chrome.alarms` 방식으로 승격 가능(🟢, 아래 참고).
  - **구현 파일**: `src/storage/types.ts`(`Settings.trashRetentionDays: number | null` 추가) · `src/storage/storage.ts`(`emptyStore` 기본값 30, `migrate()`에 `typeof === 'undefined'`로만 백필 — `null`은 유효한 "자동 삭제 없음" 값이라 덮어쓰지 않음) · `src/storage/folderOps.ts`(`purgeExpiredIn` 내부 헬퍼, `purgeExpiredTrash()`(자동 실행용), `previewRetentionPurgeCount()`(적용 전 영향 개수 미리보기, 순수 함수·저장 없음), `setTrashRetentionDays()`(설정 변경+즉시 소급 정리)) · `src/manager/App.tsx`(휴지통 화면 상시 배너+보관기간 선택 드롭다운, 보관기간을 줄여 즉시 삭제될 항목이 있을 때만 확인 절차 노출, 폴더 삭제(휴지통 이동) 확인 문구에도 보관기간 안내 추가 — ⑤ 부분 반영) · `src/manager/App.css`(`.tf-trash-policy-banner` 등).
  - **검증**: `tsc --noEmit` + 확장 3종 + PWA 빌드 4개 통과. 만료 판정·BFS 하위 트리 정리·tombstone 기록·"자동 삭제 없음" 시 미삭제·미리보기 계산 로직은 Node 스크립트로 별도 단위 검증(만료/미만료 경계값, 자식이 최근에 수정됐어도 부모 따라 삭제되는 케이스 포함 — 전부 통과).
  - **검증 한계**: 실제 화면에서 배너 문구·드롭다운 변경·확인 절차·삭제 확인 문구 노출까지는 이 환경에서 브라우저를 못 띄워 실제 클릭으로 확인하지 못함 — 확장으로 로드해 육안 확인 권장.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고(추가 구현 전 시점 기록, 아래에서 해소됨): ①자동 비우기가 "열 때 확인" 방식이라 크롬 확장을 며칠씩 안 열면 그만큼 정리가 늦어짐(데이터 유실은 아님) — 더 즉각적으로 하려면 `chrome.alarms` 주기 실행으로 승격 가능(여전히 유효한 참고) ②~~"초기 사용 기간 동안 삭제 시점에도 동일 안내 노출"은 한 줄만 반영~~ → 아래 추가 구현으로 정식 팝업 반영.
  - **추가 구현 (2026-07-27, 산들 요청) — 삭제 시 정책 안내 팝업 + "다시 보지 않기"**: 폴더를 휴지통으로 옮길 때(🗑 버튼) `Settings.trashInfoDismissed`(신규, 기본 false)가 false이면, 기존의 가벼운 한 줄 확인 대신 보관기간 정책(직접 조정 가능·자동 삭제 없음 옵션·기본 30일·현재 실제 설정값)을 설명하는 팝업을 먼저 띄운다. 팝업의 "다음부터 이 안내를 보지 않기" 체크박스를 켜고 "휴지통으로 이동"을 누르면 `dismissTrashInfo()`(`folderOps.ts` 신규)가 `trashInfoDismissed`를 영구 저장해, 이후부터는 기존의 가벼운 한 줄 확인만 뜬다(체크 안 하면 다음 삭제 때도 계속 팝업이 뜸). 구현 파일: `types.ts`(필드 추가) · `storage.ts`(기본값·백필) · `folderOps.ts`(`dismissTrashInfo`) · `App.tsx`(`handleTrashClick`/`confirmTrashWithInfo`, `LicenseControl`과 같은 오버레이 패널 패턴 재사용) · `App.css`(`.tf-checkbox-row`). `tsc`+빌드 4종 통과.
  - 복잡도: 낮음

- [x] **접근성(role/aria/키보드 포커스 링) 보강** — 구현 완료 (2026-07-29)
  - 착수 전 점검: `src/manager/**`에 `aria-*`·`role` 속성이 전무했고, 포커스 링은 브라우저 기본값에만 의존(전역 CSS에 `outline` 관련 규칙 자체가 없었음 — 브라우저가 지우고 있진 않았지만 다크테마 커스텀 버튼 위에서 대비가 약할 수 있는 상태)하던 것을 확인 후 착수.
  - **구현 내용**:
    - `src/manager/App.css` — 전역 `button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; }` 추가(마우스 클릭 시엔 안 뜨고 키보드 포커스일 때만 표시되는 `:focus-visible` 사용, 앱 강조색 재사용).
    - `src/manager/useEscapeClose.ts`(신규 공용 훅) — 오버레이 패널 5종(아래)이 전부 "배경 클릭으로만 닫힘" 동일 패턴을 복붙해 쓰고 있어, Esc 키 닫기를 한 훅으로 통일 추가(개별 컴포넌트마다 useEffect 중복 방지).
    - **오버레이 패널 5종에 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`(제목에 id 부여) + Esc 닫기 추가**: `App.tsx`(휴지통 이동 안내 팝업, 폴더 아이콘 선택 패널) · `SyncControl.tsx`(동기화 설정 패널, 연결완료 팝업) · `LicenseControl.tsx`(구매/복원 패널, PRO 활성화 완료 팝업) · `AppInfo.tsx`(앱 정보 패널) · `PlayerOverlay.tsx`(재생 오버레이 — 이미 자체 Esc 처리가 있어 새 훅은 안 씀, `role="dialog"`/`aria-label={영상명}`만 추가).
    - **아이콘 전용 버튼에 `aria-label` 보강**(이모지만 있는 버튼은 스크린리더가 유니코드 이름으로만 읽어 의미 전달이 약함): 폴더 행의 🎨/✏️/🗑(폴더명 포함, 예: `"영상폴더" 아이콘 변경`) · 이름변경 중 ✔/✕ · 동기화 ⚙️·✕ 닫기 · 아이콘 선택 그리드 각 항목(카테고리+이모지 조합) · 재생 오버레이 ✕ 닫기.
    - **입력창 `aria-label` 보강**(placeholder만으로는 텍스트 입력 후 시각적으로 사라지는 문제와 별개로 명시적 라벨이 더 견고함): 새 폴더 이름·재생목록 URL·폴더 이름 수정·휴지통 보관기간 select·라이선스 키/이메일 입력창.
    - **오류 배너에 `role="alert"` 추가**(App.tsx·SyncControl.tsx·LicenseControl.tsx 전체) — 스크린리더가 배너 등장을 즉시 알리도록.
    - **브레드크럼**: `<nav aria-label="폴더 위치">` + 현재 폴더 버튼에 `aria-current="page"` 추가, 구분자(`/`)는 `aria-hidden="true"`로 스크린리더가 읽지 않도록.
  - **검증**: `npm run build`(tsc + 확장 3종) + `npm run build:pwa` 4개 빌드 통과. **Playwright(headless Chromium)로 dev 서버를 띄워 실제 키보드 조작으로 종단 검증**: ①실제 Tab 키 이동(프로그램적 `.focus()`가 아님)으로 🎨 버튼에 도달 시 `outline: solid 2px rgb(62,166,255)` 실제 적용 확인(스크린샷) ②`getByRole('button', { name: '"...' 아이콘 변경' })`로 aria-label이 접근성 트리에 정확히 노출됨을 확인 ③아이콘 선택 패널·앱 정보 패널·동기화 설정 패널·휴지통 안내 팝업 4곳 모두 `role="dialog"`+`aria-modal="true"`+`aria-labelledby`가 실제 제목 텍스트를 정확히 가리킴을 확인, Esc 키로 4곳 모두 정상 닫힘 확인 ④breadcrumb `aria-label`·`aria-current` 확인. 매 단계 콘솔 에러 0건. 검증에 쓴 임시 스크립트·스크린샷·playwright 패키지는 작업 종료 후 모두 정리(제거)함 — 저장소에 남지 않음.
  - **검증 한계**: `LicenseControl.tsx`의 구매/복원 패널·완료 팝업은 `isLicenseAvailable()`(확장 컨텍스트 필요)이 false인 로컬 dev 프리뷰에서는 컴포넌트 자체가 렌더링되지 않아 이번 종단 검증 대상에서 제외됨(기존 다른 항목들과 동일한 검증 한계) — 코드는 SyncControl과 완전히 같은 패턴을 그대로 적용했으므로 동작할 것으로 판단하나, 확장으로 로드한 뒤(또는 결제 설정 완료 후) 육안 확인 권장. 실제 스크린리더(NVDA·VoiceOver 등)로의 음성 출력 확인은 이 환경에서 하지 못함 — DOM의 role/aria 속성·접근성 트리 매칭까지만 검증.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고: 오버레이 패널에 포커스 트랩(모달 밖으로 Tab이 못 나가게 가두는 것)은 이번 범위에 포함하지 않음 — 배경 클릭·Esc로는 닫히지만 Tab을 계속 누르면 포커스가 모달 밖 요소로 빠져나갈 수 있음. 낮음 복잡도 범위를 벗어나는 작업(포커스 트랩·모달 열릴 때 첫 포커스 이동·닫을 때 트리거 버튼으로 포커스 복귀)이라 필요해지면 별도 항목으로 검토 권장.
  - 복잡도: 낮음

- [x] **앱 정보 표시(개발자명·버전·최근 수정일)** — 구현 완료 (2026-07-27)
  - 내용: 설정/정보 화면 등에 개발자명, 최초 개발일, 최근 수정일을 표시한다.
  - **배경**: 3단계 결제 연동 항목이 산들의 ExtensionPay 가입(외부 액션) 대기 중이라, 그 사이 이미 승인·스펙이 확정된 4단계 항목 중 설계 결정이 필요 없는 이 항목을 먼저 진행함(다른 3단계 잔여 항목은 외부 조사·산들 결정이 더 필요해 보류).
  - **구현 결정 — 날짜는 수동 갱신 부담을 줄이기 위해 git 커밋일자 자동 산출 채택**:
    - `vite.config.ts`(확장 매니저)·`vite.pwa.config.ts`(PWA) 양쪽에 `execSync('git log -1 --format=%cI')`로 최신 커밋 일자를 빌드 시점에 구해 `define`으로 `__TF_LAST_MODIFIED__`·`__TF_VERSION__`(package.json 버전) 주입. git 조회 실패 시(예: git 없는 환경) 빈 문자열로 안전 폴백 → 화면엔 "확인 불가"로 표시(빌드 자체가 깨지지 않음).
    - 최초 개발일은 git 이력상 고정된 사실(v2 폴더 최초 커밋 `2026-07-19`)이라 매번 계산할 필요 없이 상수(`src/appInfo.ts`)로 고정.
  - **구현 파일**: `src/appInfo.ts`(신규, 상수+define 값 읽기) · `src/manager/AppInfo.tsx`(신규, SyncControl·LicenseControl과 같은 "툴바 버튼+오버레이 패널" 패턴 재사용, 신규 CSS 클래스 없이 기존 `tf-sync-*` 재사용) · `src/manager/App.tsx`(툴바에 `<AppInfo />` 마운트).
  - **개발 중 발견·해결한 이슈**: `node:child_process`·`node:fs`를 vite config에서 import하니 프로젝트에 `@types/node`가 없어 `tsc --noEmit`이 실패함. `@types/node` 추가는 CLAUDE.md상 "의존성 패키지 추가"라 승인 필요 항목이라, **의존성을 새로 추가하지 않고** 영향받는 두 설정 파일(`vite.config.ts`·`vite.pwa.config.ts`)에만 `// @ts-nocheck`를 적용해 우회함 — `src/**` 앱 코드의 타입 검사 범위·엄격도에는 변경 없음. 더 정석적인 해결(별도 `tsconfig.node.json`+`@types/node` devDependency)은 산들이 원하면 별도 승인 후 진행 가능(🟢, 아래 참고).
  - **검증**: `tsc --noEmit` 통과, 확장 3종(manager/background/content) + `build:pwa` 총 4개 빌드 전부 통과. 빌드 산출물(`dist/assets/index-*.js`, `pwa-dist/assets/index.pwa-*.js`)에 실제 git 커밋일자(`2026-07-27T00:04:36+09:00`)·버전(`0.1.0`) 문자열이 정확히 주입됐음을 grep으로 직접 확인. `/tmp` 빌드 산출물을 실 폴더 `dist/`·`pwa-dist/`로 반영하는 과정에서 실수로 중첩 폴더(`pwa-dist/pwa-dist`, `dist/dist`)가 생겨 `allow_cowork_file_delete` 승인 후 제거, 이전 빌드의 고아 해시 파일(참조되지 않는 옛 `index.pwa-*.js`·`ExtPay.module-*.js` 등)도 함께 정리 — 최종적으로 각 폴더의 `index.html`이 실제로 존재하는 최신 해시 파일만 참조함을 확인함.
  - **검증 한계**: 이 개발 환경은 브라우저를 띄울 수 없어 ℹ️ 버튼 클릭 → 패널 표시까지 실제 화면 클릭으로는 확인하지 못함 — 코드 경로(상태 토글·기존 SyncControl과 동일 패턴) 검토로만 확인. 확장/PWA로 직접 로드해 육안 확인 권장.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고: ①`@types/node` 정식 추가(devDependency)로 `@ts-nocheck` 없이 타입 검사하는 편이 더 정석적 — 원하면 별도 승인 후 진행 ②개발자명은 산들로 표시했음(다른 이름/표기를 원하면 `src/appInfo.ts`의 `DEVELOPER_NAME` 한 줄만 수정하면 됨) ③"최근 수정일"은 v2 폴더가 아니라 저장소 전체 최신 커밋 기준(v1 등 다른 폴더 수정도 반영됨) — v2만 기준으로 좁히고 싶으면 `git log -1 --format=%cI -- .`처럼 경로 필터를 추가하는 별도 조정 가능.
  - 복잡도: 낮음

- [x] **YouTube DOM 선택자 분리 구조화** — 구현 완료 (2026-07-29) (신설 2026-07-28, Chat 세션 "유료 판매 리스크 대응" — CLAUDE.md "YouTube DOM 변경 대응 원칙" 반영)
  - 배경: YouTube가 페이지 구조를 바꾸면 DOM 의존 기능(우클릭 메뉴 삽입, 재생목록/시청페이지 파싱 등)이 깨질 수 있음. 유료 판매로 전환하면 이 리스크의 체감 비중이 커짐(유료 고객이 겪는 장애는 무료보다 체감 비용이 큼).
  - 내용: 현재 코드 곳곳에 흩어져 있는 YouTube 선택자·마크업 패턴(우클릭 메뉴 `documentUrlPatterns`, `playlistImport.ts`의 `ytInitialData` 파싱 키, `fetchDuration`의 `videoDetails.lengthSeconds` 패턴 등)을 별도 설정 객체(예: `src/shared/youtubeSelectors.ts`) 하나로 모아 관리한다.
  - 모든 DOM 의존 파싱 경로가 이미 있는 "실패 시 예외 대신 부분 결과를 조용히 반환"(`playlistImport.ts`) 패턴을 따르는지 점검하고, 따르지 않는 경로(예: `fetchDuration`)에도 동일 패턴을 확대 적용한다.
  - 전제: 기존 로직 동작 변경 없이 선택자 문자열만 한 곳으로 모으는 리팩토링이라 구조 변경으로 보지 않음 — 별도 승인 없이 착수 가능.
  - **구현 내용** (신규 `src/shared/youtubeSelectors.ts` 레지스트리 + 6개 파일 호출부 배선):
    - 레지스트리에 모은 것: ①`YT_ORIGIN` ②`youtubeUrl.*` URL 빌더 7종(playlist / browseApi(이어받기) / watch / embed / oembed / noembed / thumbnail) ③`MUSIC_HOST_MARKER`(`music.youtube` 호스트 판별) ④`youtubePattern.*` HTML 스크래핑 정규식 4종(ytInitialData 블록 추출 / INNERTUBE_API_KEY / INNERTUBE_CONTEXT_CLIENT_VERSION / lengthSeconds).
    - 호출부 배선(전부 동작 동일, 문자열만 함수/상수로 치환): `playlistImport.ts`(playlist·browseApi URL + ytInitialData·apiKey·clientVersion 정규식) · `storage.ts`(watch·oembed·noembed·thumbnail URL + lengthSeconds 정규식 + music 마커) · `folderOps.ts`(thumbnail) · `background.ts`(music 마커) · `PlayerOverlay.tsx`(embed URL·YT_ORIGIN) · `App.tsx`(재생목록 영상 watch URL).
    - **호스트 패턴(`YOUTUBE_DOCUMENT_PATTERNS`)은 manifest.json과 반드시 동기화돼야 해 정의는 기존 `hostPatterns.ts`에 그대로 두고**(그 파일의 동기화 경고 주석 유지), 레지스트리에서 `export {}`로 재노출만 함 — "YouTube 의존 지점은 한 파일만 보면 된다"는 목적은 달성하되 manifest 동기화 경고의 위치는 흩뜨리지 않음. `background.ts`는 이제 이 재노출 경로로 import.
    - **레지스트리에 넣지 않은 것(의도적)**: ①`playlistImport.ts`의 `ytInitialData` JSON 트리 다단계 탐색(`extractInitialContents`/`extractContinuationContents` 등) — 평면 선택자 문자열이 아니라 파싱 "절차"라, 브래킷 접근으로 억지로 옮기면 깊은 옵셔널 체인에서 버그 위험만 커지고 가독성이 떨어짐. 그대로 두되 파일 상단 주석이 레지스트리를 가리키도록 함. ②`storage.ts`의 `extractVideoId`(youtu.be·/shorts/·?v= URL 형태 파싱) — 매우 안정적인 공개 URL 규격이라 스크래핑 선택자와 성격이 다름(URL 파싱 로직).
  - **관용적 실패 정책 점검 결과**: 모든 DOM/파싱 경로가 이미 "예외 대신 부분 결과/0/null 반환" 패턴을 따르고 있음을 확인 — `fetchDuration`은 체크리스트에 "따르지 않는 예"로 적혀 있었으나 실제로는 이미 `catch → return 0`으로 준수 중이었음(별도 수정 불필요). `fetchMeta`(→null), `extractVideoId`(→정규식 폴백→null), `playlistImport`(JSON 탐색 catch→[], 이어받기 키 없으면 첫 페이지만 반환)도 모두 준수. 즉 이 항목의 "패턴 확대 적용"은 신규 수정 없이 점검·확인으로 종결.
  - **검증**: `npm run build`(tsc --noEmit + manager/background/content 3종) + `npm run build:pwa` 총 4개 빌드 전부 통과. 각 호출부 치환이 기존 리터럴과 문자 단위로 동일함을 대조 확인(유일한 미세 차이: `App.tsx`의 재생목록 watch URL이 이제 `encodeURIComponent`를 거치나, videoId는 항상 `[\w-]`라 no-op — 회귀 아님). 순수 문자열/정규식 이동이라 런타임 동작 변화 없음.
  - 🔴 치명적·🟡 중요 결함 0건. 🟢 참고: 향후 필요하면 ytInitialData JSON 탐색 키(renderer 이름들)도 레지스트리에 문서화 상수로 모아두는 확장이 가능(현재는 탐색 절차 자체를 옮기는 리스크가 이득보다 커 보류).
  - 복잡도: 낮음~중간

---

## 5단계 — 출시 준비

- [ ] **사용자 매뉴얼 작성**
  - 형식: v1의 사용자매뉴얼(`tubefolder-extension-v1/docs/튜브폴더_사용자매뉴얼.pdf`)과 동일한 틀 유지 — 목차·페이지 번호, 도입부 핵심기능 요약, 실제 화면 캡처, 초보자 기준 단계별 설명.
  - **아이콘 색상 규칙 (v1과 다름 — v2 전용으로 새로 지정됨)**:

    | 구분 | v2 색상 | 참고: v1 색상 |
    |---|---|---|
    | ✅ 권장사항 | 초록 | 초록 (동일) |
    | 🚫 자주 하는 실수 | 주황 | 빨강 |
    | 📌 주의사항 | 노랑 | 파랑 |
    | 🚨 경고 | 빨강 | 주황 |

  - 아이콘 모양은 2026-07-21에 산들이 확정(✕→🚫, ℹ️→📌, ⚠️→🚨). 색상 규칙은 변경 없음.

  - 아이콘 제작 방식: 오픈소스 아이콘 수집 또는 **클로드가 직접 디자인** — 수집으로 한정하지 않음.
  - 착수 시점: CLAUDE.md 규칙에 따라 v2 앱 코딩·검증이 모두 끝나 "완성" 판정이 난 뒤 진행(진행 전 산들께 제작 여부 먼저 제안).
  - 복잡도: 중간

- [ ] **개인정보처리방침 작성** (신설 2026-07-21, 앱개발지침 §7 반영)
  - 배경: 3단계 "클라우드 동기화"·"결제 연동" 모두 외부 서비스로 사용자 데이터·결제 정보가 오가므로 법적 요건 검토 필요.
  - 내용: 개인정보처리방침 문서 작성, 결제 관련 법적 신고 요건 확인.
  - 전제: 3단계(동기화·결제) 착수 시점에 구체적 수집 항목이 정해진 뒤 작성.
  - **문서 작성·배포 (2026-08-15)**: `index.html`(제품 소개+가격)·`terms.html`(이용약관)·`refund.html`(환불정책)·`privacy.html`(개인정보처리방침) 4종이 이미 작성돼 `legal/`에 있던 것을, Vite `public/` 규칙에 맞춰 `public/legal/`로 옮겨 배치(빌드 시 자동으로 `pwa-dist/legal/`에 복사됨 — vite.pwa.config.ts의 "public/ 아래는 자동 복사" 방식 그대로 재사용, 별도 빌드 설정 변경 없음). `npm run build:pwa` 성공 확인, 로컬 정적 서버로 실제 GitHub Pages 배포 경로(레포 루트 기준 `/tubefolder-extension-v2/pwa-dist/legal/`, `terms.html`·`refund.html`·`privacy.html` 포함) 접속·상호 링크 정상 확인. `index.html`의 `#buyLink`(PRO 구매하기)는 Paddle 체크아웃 URL이 아직 없어 `href="#"` 플레이스홀더 + TODO 주석으로 남겨둠(licenseEngine.ts의 `PADDLE_CHECKOUT_URL` 확정 시 함께 교체 필요).
  - **결제 관련 법적 신고 요건 웹 조사 (2026-08-17)**: 국세청·공정거래위원회 관련 자료 기준으로 확인(법률 자문 아님, 세무사 확인 권장).
    - Paddle이 MoR로서 대신 처리하는 것: 구매자에게 부과되는 부가가치세(VAT)·판매세의 국가별 계산·징수·납부. 이미 이용약관·개인정보처리방침에 반영돼 있음.
    - Paddle이 대신 안 해주는 것 — 산들 개인의 국내 신고 의무:
      - **통신판매업 신고**: "해외 소비자만 대상"이라고 자동 면제되는 게 아님(관련 상담 사례 확인) — 다만 **직전연도 통신판매 거래횟수 50회 미만 또는 부가가치세법상 간이과세자**면 신고 의무 면제. 첫 판매 전인 지금은 면제 기준에 해당할 가능성 높음.
      - **사업자등록**: 통신판매업 신고 여부와 무관하게 원칙적으로 필요하다는 게 일반적 안내이나, 소규모·비정기 판매는 사업자등록 없이 개인 소득으로 신고하는 실무 사례도 있어 경계가 세무사 확인 필요 영역.
      - **소득세 신고**: 사업자등록 여부와 무관하게 발생 소득에 대한 신고·납부 의무는 있음.
    - 산들에게 전달: 실제 판매 시작 전 세무사 상담 권장(위 내용은 확정적 법률 자문 아님).
  - 복잡도: 낮음~중간

- [ ] **다국어(i18n) 지원 준비** (신설 2026-07-21, 앱개발지침 §7 반영)
  - 배경: 유료화·해외 출시 로드맵을 감안해 다국어 전환이 쉬운 구조를 미리 열어두는 항목.
  - 구현 시점: 실제 다국어 메뉴(언어 선택 UI 등) 구현은 해외 출시를 준비하는 단계에 착수한다. 구조 준비(텍스트를 함수 호출 형태로 분리해두는 습관 등)는 그 이전 개발 단계부터 미리 적용해도 된다 — 별도 승인 없이 진행 가능한 습관성 준비.
  - 구현 방식: 신규 의존성 추가 여부(표준 i18n 라이브러리 vs 자체 JSON 딕셔너리 구현)는 착수 시점에 앱 규모에 맞춰 검토·승인 필요(의존성 추가에 해당).
  - 적용 범위: 메뉴·버튼·다이얼로그 등 UI 텍스트가 기본 대상. 폴더명·영상 제목 등 사용자 입력 콘텐츠는 번역 대상에서 제외.
  - 지원 언어: 착수 시점에 목표 시장에 맞춰 산들이 결정.
  - 복잡도: 낮음(구조 준비)~중간(실제 다국어 구현)

- [ ] **Chrome 웹 스토어 비공개(Unlisted) 등록** (신설 2026-07-28, Chat 세션 "유료 판매 리스크 대응" — CLAUDE.md "Chrome 웹 스토어 비공개(Unlisted) 등록 원칙" 반영)
  - 배경: Chrome이 확장프로그램 자체 결제 시스템 지원을 중단해, 지금은 zip 파일을 개별 전달하는 방식으로 배포 중(v1)·배포 예정(v2). 구매자가 개발자 모드를 켜야 하는 불편함·신뢰도 문제가 있음.
  - 내용: Chrome 웹 스토어에 "비공개(Unlisted)"로 등록해, 개발자 모드 활성화 없이 직접 링크로만 설치할 수 있도록 한다. 검색에는 노출되지 않아 지금처럼 특정 대상에게만 공유하는 목적은 유지된다.
  - 부가 효과: 자동 업데이트 지원(재배포·재설치 불필요), 기존 `chrome.storage.local` 기반 라이선스 상태가 업데이트와 무관하게 유지됨(재설치 시에만 초기화).
  - 완전 공개(Public) 전환은 별도 결정 사항 — 이 항목은 비공개 등록까지만을 범위로 함.
  - **착수 (2026-08-17, Paddle 계정 인증 대기 중 병행 진행)**: Chrome 웹 스토어 개발자 계정 등록($5) 완료. "사업자 선언"에서 "판매자 계정" 선택(유료 판매 목적이라 EEA 소비자보호법 기준 trader에 해당 — 산들에게 근거 설명 후 진행).
    - **manifest.json `key` 필드 제거 버그 수정**: 로컬 개발용으로 넣어뒀던 `key`(확장 ID 고정용) 필드가 있으면 스토어 업로드 자체가 거부됨("key 입력란은 매니페스트에 허용되지 않습니다") — `public/manifest.json`에서 제거, 재빌드(커밋 `4168646`).
    - **업로드 완료, 새 확장 프로그램 ID 발급**: `ldhokniendkojmkngaojjlkhememdgog`. 🟡 **후속조치(중요)**: 기존 `oauth2.client_id`(`864997495294-...`)는 `key`로 고정돼 있던 예전 ID 기준으로 Google Cloud Console에 등록돼 있음 — 구글 드라이브 동기화가 스토어 배포판에서도 동작하려면, GCP OAuth 클라이언트(Chrome Extension 유형)의 Application ID를 이 새 ID로 갱신해야 함. 아직 미처리.
    - **zip 업로드 중 겪은 사소한 문제들(참고용)**: ①리눅스 `zip`으로 만든 파일을 Chrome 웹 스토어가 "확장자 지원 안됨"으로 거부 — Windows 자체 압축(우클릭 → 보내기 → 압축 폴더)으로 다시 만드니 해결(원인 불명, 재발 시 같은 방법 사용) ②이 작업 세션의 출력 폴더 경로가 길어서 그 안에서 압축 풀면 Windows 260자 경로 제한(`0x80010135`)에 걸림 — 바탕화면 등 짧은 경로로 옮겨서 압축 풀면 해결 ③압축 해제 시 `.js` 파일마다 Windows가 "손상을 줄 수도 있음" 보안 경고를 띄움(제가 만든 파일이라 Windows가 "인터넷에서 받음"으로 표시) — zip 파일 속성에서 "차단 해제" 체크 후 재시도하면 한 번에 해결.
    - **스토어 등록정보 작성 중 중단 (2026-08-17)**: 설명 문구는 제가 초안 작성해 전달함(제품 소개 페이지 내용과 일치시킴). 카테고리 드롭다운("생산성" 선택)이 화면에 반영 안 되는 문제 발생 — Paddle 대시보드에서 겪었던 것과 같은 종류(선택은 되는데 표시만 안 바뀌는 화면 버그일 가능성)로 추정, 확인 전 산들 요청으로 여기서 중단. **Claude in Chrome으로 대신 조작 시도했으나 불가 확인**: Chrome이 자체 웹 스토어 도메인(`chrome.google.com/webstore/*`)에는 어떤 확장 프로그램도 스크립팅하지 못하도록 막아둬서("확장 프로그램 갤러리는 스크립팅할 수 없음"), 이 작업만큼은 산들이 직접 화면에서 진행해야 함 — 우회 불가.
    - **남은 일**: ①카테고리·언어 선택 ②스토어 아이콘(`icons/icon128.png` 드래그) ③캡처화면 최소 1장(필수, `chrome://extensions`에 압축해제된 확장 프로그램 로드 후 직접 캡처 필요 — 제가 대신 만들 수 없음) ④제출 시 반드시 "배포 보류(Defer publish)" 체크(Paddle 결제 라이브 전환 전 실수로 공개되지 않도록) ⑤위 OAuth Application ID 갱신.
  - 복잡도: 낮음~중간

- [x] **버그 제보 채널 마련** — 구현 완료 (2026-08-15) (신설 2026-07-28, Chat 세션 "유료 판매 리스크 대응" — CLAUDE.md "YouTube DOM 변경 대응 원칙" 반영)
  - 배경: YouTube 페이지 구조 변경을 개발자가 먼저 감지하기 어려운 경우가 많아, 사용자 제보가 가장 빠른 변경 감지 수단이 될 수 있음.
  - 내용: 이메일(`fics01287@gmail.com`)을 채널로 채택(산들 확인). `src/appInfo.ts`에 `BUG_REPORT_EMAIL` 상수로 추가하고, 기존 "앱 정보(ℹ️)" 패널(`src/manager/AppInfo.tsx`)에 mailto 링크로 노출 — 별도 신규 UI 없이 기존 패턴 재사용.
  - 남은 일: 5단계 "사용자 매뉴얼 작성" 착수 시 매뉴얼에도 동일 채널을 안내할 것.
  - 복잡도: 낮음

---

## 다음에 결정할 것

(현재 없음)
