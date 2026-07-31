# 튜브폴더 버전2 (개발 중)

`tubefolder-extension/` (버전1, 완성·배포됨)은 그대로 두고, 이 폴더에서 버전2 개발을 진행합니다.

## 버전1과의 관계
- 버전1: `tubefolder-extension/` — 건드리지 않음, 배포 유지
- 버전2: 이 폴더 (`tubefolder-extension-v2/`) — 새 개발 진행
- 두 폴더는 완전히 독립적입니다. 배포용 압축도 아래처럼 폴더 단위로 분리됩니다.

## 배포 (단일 zip 패키징)
저장소 루트(`tube-folder/`)에서 실행:

```powershell
Compress-Archive -Path .\tubefolder-extension-v2\* -DestinationPath .\tubefolder-extension-v2.zip -Force
```

- 이 명령은 `tubefolder-extension-v2` 폴더 안의 파일만 압축합니다. `tubefolder-extension`(버전1), `youtube-manager-extension`, 루트의 `CLAUDE.md`·매뉴얼·인계서 등은 대상 경로 밖이라 섞이지 않습니다.
- 개발용 파일(테스트 스크립트, 문서 초안 등)을 배포에서 빼고 싶으면 이 폴더 안에 `docs/`, `_test/` 처럼 하위 폴더로 분리해두고, 위 명령의 `-Path`를 필요한 파일/폴더만 나열하는 방식으로 좁히면 됩니다.

## 기술 스택 (확정)
React + TypeScript + Vite. 저장소는 `chrome.storage.local`(+ `unlimitedStorage`) 유지. 근거는 [ROADMAP-CHECKLIST.md](ROADMAP-CHECKLIST.md) 1단계 참고.

## 폴더 구조
```
tubefolder-extension-v2/
├─ public/               manifest.json(확장)·manifest.webmanifest(PWA)·sw-pwa.js·icons — 빌드 시 dist/·pwa-dist/에 그대로 복사됨
├─ index.html            매니저 페이지 진입점 — 크롬 확장 빌드용 (Vite 기본 규칙)
├─ index.pwa.html        매니저 페이지 진입점 — 독립 PWA(휴대폰 매니저) 빌드용, 같은 src/manager 재사용
├─ vite.config.ts             매니저(React) 빌드 설정 — 확장용, index.html → dist/
├─ vite.background.config.ts  서비스워커 빌드 설정 (lib 모드, ES 모듈)
├─ vite.content.config.ts     콘텐츠 스크립트 빌드 설정 (lib 모드, iife)
├─ vite.pwa.config.ts         독립 PWA 빌드 설정 — index.pwa.html → pwa-dist/ (base: './', 하위 경로 배포용)
├─ scripts/rename-pwa-entry.mjs  build:pwa 마지막 단계 — index.pwa.html → index.html로 이름 변경(정적 호스팅용)
└─ src/
   ├─ storage/           저장 계층 — v1 storage.js를 TS로 이식(types.ts·storage.ts) + 신규 폴더 CRUD(folderOps.ts)
   ├─ background/        MV3 서비스워커 — 컨텍스트 메뉴 구성·클릭 처리
   ├─ content/            유튜브 페이지 콘텐츠 스크립트 — 미니 팝업(새 폴더/이름변경/삭제)
   ├─ manager/            매니저 페이지(React) — 현재는 최소 스캐폴딩(트리 탐색 골격만). 확장·PWA 공용.
   ├─ sync/               동기화 — merge.ts(순수 병합)·syncEngine.ts(트리거)·driveBackendBase.ts(Drive REST 공용)
   │                       ·googleDrive.ts(확장, chrome.identity)·googleDriveWeb.ts+googleIdentityWeb.ts(PWA, GIS)
   ├─ license/            유료화(Paddle) — licenseEngine.ts(캐시·상수, 공용 안전)·licenseManager.ts(구매/복원, Paddle Worker 조회)
   └─ shared/             background↔content 메시지 타입, 호스트 URL 패턴 상수
```

## 개발 · 빌드
```powershell
npm install               # 최초 1회
npm run dev                # 매니저 페이지만 브라우저에서 미리보기 (chrome.storage 없으면 localStorage 폴백)
npm run typecheck          # tsc --noEmit
npm run build               # typecheck + 매니저·background·content 3종 빌드 → dist/
npm run build:pwa           # typecheck + 독립 PWA 빌드 → pwa-dist/ (휴대폰 매니저용, 정적 호스팅에 그대로 올리면 됨)
npm run package             # build 후 dist/ 전체를 tubefolder-extension-v2.zip으로 압축
```

## 확장으로 로드해서 확인하기
1. `npm run build`
2. Chrome 주소창에 `chrome://extensions` 입력 → 우측 상단 "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" → 이 폴더의 `dist/` 선택
4. 유튜브(youtube.com/music.youtube.com) 페이지에서 우클릭 → "🗂️ 폴더 관리"에서 새 폴더·이름변경·삭제 확인

## 동기화(구글 드라이브) 사용 준비 — 개발자 계정 작업 필요
동기화 코드는 구현돼 있지만, 실제로 동작하려면 **구글 OAuth 클라이언트 ID 발급**(무료, 1회)이 필요합니다.

1. https://console.cloud.google.com 접속 → 새 프로젝트 생성 (이름 예: `tubefolder`)
2. "API 및 서비스 → 라이브러리"에서 **Google Drive API** 검색 → 사용 설정
3. "API 및 서비스 → OAuth 동의 화면" 구성:
   - User Type: 외부(External) → 앱 이름·지원 이메일 입력 → 저장
   - 범위(Scopes) 추가: `.../auth/drive.appdata` (비민감 스코프라 기본 심사만 필요)
   - 테스트 사용자에 본인 구글 계정 추가 (게시 전까지는 테스트 모드로 사용 가능)
4. "API 및 서비스 → 사용자 인증 정보" → 사용자 인증 정보 만들기 → **OAuth 클라이언트 ID**:
   - 애플리케이션 유형: **Chrome 확장 프로그램**
   - 항목 ID(확장 ID): `ebmibcpohklfkbhfiiilfnhlhkdbkeen`
     (manifest.json의 `key` 필드로 고정된 ID — `chrome://extensions`에서 로드 후 표시되는 ID와 같아야 함)
5. 발급된 클라이언트 ID(`xxxx.apps.googleusercontent.com`)를 `public/manifest.json`의
   `oauth2.client_id`의 `REPLACE_ME.apps.googleusercontent.com` 자리에 붙여넣고 `npm run build` 재실행

참고:
- `dev-key.pem`(개인키)은 위 확장 ID를 유지하는 데 필요한 키입니다. 지우지 마세요.
  크롬 웹스토어에 **처음 업로드할 때** zip 안에 `key.pem`이라는 이름으로 함께 넣으면 스토어에서도 같은 ID가 유지되어
  OAuth 클라이언트가 그대로 동작합니다.
- 동기화 데이터는 드라이브의 앱 전용 숨김 영역(appDataFolder)에 `tubefolder-data.json` 한 파일로 저장됩니다.
- 매니저 페이지를 `npm run dev` 미리보기에서 열 때 URL에 `?syncmock=1`을 붙이면, 실제 구글 연결 없이
  localStorage를 "원격"으로 흉내 내는 개발용 목(mock) 백엔드로 동기화 UI·병합 로직을 시험할 수 있습니다.

## PWA(휴대폰 매니저) 사용 준비 — 개발자 계정 작업 필요 (v1과 무관, v2 전용)
크롬 확장과 별개로, v2 매니저를 휴대폰에서 쓸 수 있는 독립 PWA로도 빌드할 수 있습니다(`npm run build:pwa` → `pwa-dist/`).
같은 appDataFolder를 공유하므로 확장에서 만든 폴더·영상이 그대로 동기화됩니다. 단, 로그인 방식이 달라 **별도의 웹용 OAuth 클라이언트 ID**가 하나 더 필요합니다.

1. 확장용과 **같은 GCP 프로젝트**에서 "API 및 서비스 → 사용자 인증 정보" → 사용자 인증 정보 만들기 → **OAuth 클라이언트 ID**
2. 애플리케이션 유형: **웹 애플리케이션** (확장용은 "Chrome 확장 프로그램" 유형이었던 것과 다름)
3. 승인된 자바스크립트 원본(Authorized JavaScript origins)에 PWA를 실제로 열 도메인을 등록(예: `https://fics01287-arch.github.io`)
4. 발급된 클라이언트 ID를 `src/sync/googleIdentityWeb.ts`의 `WEB_CLIENT_ID` 상수(`REPLACE_ME_WEB_OAUTH_CLIENT_ID` 자리)에 붙여넣고 `npm run build:pwa` 재실행
5. `pwa-dist/` 안의 내용을 원하는 정적 호스팅 경로에 그대로 올리면 됩니다(디렉터리 접속 시 `index.html`을 자동으로 찾도록 이름이 맞춰져 있음)

참고:
- 크롬 확장(`chrome.identity`)과 달리 GIS는 진짜 리프레시 토큰이 없는 클라이언트 전용 구현이라, 브라우저 세션이 끊기면 확장보다 "재연결 필요"가 더 자주 뜰 수 있습니다(설계상 불가피 — ROADMAP-CHECKLIST.md 해당 항목 참고).
- 모바일 브라우저는 탭이 백그라운드로 가면 15분 주기 타이머가 지연될 수 있어, PWA는 "앱을 열 때(포그라운드 복귀)" 동기화가 사실상 주력 트리거입니다.

## 유료화(Paddle) 사용 준비 — 개발자 계정 작업 필요
(2026-07-30, ExtensionPay → Paddle 전환 — 개발자 소재국이 Stripe 비지원국이라 ExtensionPay를 더 쓸 수 없어,
Merchant of Record이며 한국 판매자를 지원하는 Paddle로 교체했습니다.) 결제 코드는 구현돼 있지만, 실제로
동작하려면 **Paddle 가입 + 상품/가격 등록 + Cloudflare Worker 배포**가 필요합니다.

1. https://www.paddle.com 에서 판매자(Seller) 가입 → 상품(Product) 생성 → 가격(Price)을 **1회성(one-time)**
   으로 추가, 금액은 1단계에서 확정한 ₩15,000~20,000 중 하나로 설정
2. Paddle 대시보드 → Checkout → Checkout Links에서 위 가격이 연결된 **호스티드 체크아웃 링크**를 하나 생성
3. 생성된 링크 전체를 `src/license/licenseEngine.ts`의 `PADDLE_CHECKOUT_URL` 상수
   (`REPLACE_ME_PADDLE_CHECKOUT_URL` 자리)에 붙여넣기
4. `server/paddle-webhook/README.md` 절차대로 Cloudflare Worker를 배포하고, 발급된 `/check` URL을
   `PADDLE_VERIFY_ENDPOINT` 상수(`REPLACE_ME_PADDLE_VERIFY_ENDPOINT` 자리)에 붙여넣은 뒤 `npm run build` 재실행
5. Paddle은 가입 직후 자동으로 **Sandbox(테스트) 모드**로 동작합니다 — [Paddle 테스트 카드](https://developer.paddle.com/concepts/payment-methods/credit-debit-card#testing)로 결제 흐름을 확인한 뒤, 검증이 끝나면 대시보드에서 라이브 모드로 전환합니다.

참고:
- 결제 완료 여부 확인은 **최초 실행 시 1회 + 24시간마다 1회**만 온라인으로 확인하고, 나머지는 캐시(`chrome.storage.local`)로 오프라인 동작합니다(CLAUDE.md 유료화 원칙). 결제 직후에는 매니저 탭이 다시 포그라운드로 돌아올 때 한 번 더 즉시 확인합니다.
- ExtensionPay의 `getUser()`와 달리 Paddle Billing은 클라이언트에서 바로 "결제 여부"를 물어볼 API가 없어,
  이메일 기준으로 `server/paddle-webhook/`(Cloudflare Worker)이 대신 Paddle 웹훅을 받아 저장해두고
  확장이 그 Worker를 조회하는 구조입니다 — 그래서 구매·복원 모두 이메일 입력이 한 단계 더 필요합니다
  (ExtensionPay는 자체 세션으로 이메일 없이도 조회 가능했던 것과 다른 점).
- 무료 티어 한도(폴더 20개·영상 500개)와 클라우드 동기화 잠금은 `PADDLE_CHECKOUT_URL`·`PADDLE_VERIFY_ENDPOINT`를
  실제 값으로 바꾸기 전까지는 걸리지 않습니다(개발 중 테스트 방해 방지) — 실제 값으로 교체한 뒤부터 적용됩니다.
- 구매 복원(재설치·기기 변경 시 재결제 방지)은 결제에 쓴 이메일을 다시 입력하면 Worker 조회로 즉시 복원됩니다.
- PWA(휴대폰 매니저) 빌드는 아직 결제 확인을 지원하지 않습니다(별도 로드맵 항목) — 그 전까지 PWA에서는 한도·동기화 잠금이 걸리지 않습니다(의도된 동작). 다만 이번 전환으로 순수 fetch() 기반이 되어, 확장 전용 API에 묶여 있던 예전 구조적 걸림돌은 없어졌습니다(PWA 지원 자체는 여전히 별도 결정 사항).

## 검증 한계 (알려둘 것)
- 매니저 페이지(storage 계층 CRUD)는 로컬 브라우저 미리보기(`npm run dev`, localStorage 폴백)로 실제 클릭까지 검증함.
- 우클릭 컨텍스트 메뉴 → 서비스워커 → 콘텐츠 스크립트 미니 팝업으로 이어지는 전체 경로는 `chrome.contextMenus`/`chrome.tabs` 등
  실제 확장 런타임이 있어야만 동작해, 이 개발 환경(브라우저 자동화)만으로는 재현할 수 없음 — 코드 경로 수동 추적 + 타입체크로 검증함.
  실제 Chrome에 위 "확장으로 로드해서 확인하기" 절차로 로드해 육안 확인을 권장.
- PWA 빌드(`build:pwa`)는 이 개발 환경에서 네트워크 제한으로 브라우저를 띄울 수 없어 실제 클릭·GIS 로그인·오프라인 동작을 확인하지 못했음 —
  `tsc`·빌드 성공, 산출물 상대경로·매니페스트·서비스워커 구성만 확인함. 위 "PWA(휴대폰 매니저) 사용 준비" 절차로 실기기에서 검증 필요.
- 유료화(Paddle) 결제·구매 복원도 같은 이유로 실제 클릭 검증을 못 했음 — `PADDLE_CHECKOUT_URL`·`PADDLE_VERIFY_ENDPOINT`가 아직 플레이스홀더라 애초에 실제 결제 자체가 불가능한 상태.
  `tsc`·빌드 성공, 무료 티어 한도(폴더·영상 개수, 재생목록 캡) 로직은 코드 경로 수동 추적으로 확인함. Cloudflare Worker(`server/paddle-webhook/`)도 실제 배포·웹훅 수신 검증은 못 했음(로컬 서명 검증 로직만 코드 리뷰로 확인). 위 "유료화(Paddle) 사용 준비" 절차로 실제 가입·배포 후 검증 필요.

## 상태
- 2단계 첫 항목(우클릭 메뉴 폴더 추가·이름변경·삭제) 구현 완료. 자세한 진행 상황은 [ROADMAP-CHECKLIST.md](ROADMAP-CHECKLIST.md) 참고.
