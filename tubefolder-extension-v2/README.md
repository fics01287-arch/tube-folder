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
├─ public/               manifest.json·icons — 빌드 시 dist/로 그대로 복사됨
├─ index.html            매니저 페이지 진입점 (Vite 기본 규칙)
├─ vite.config.ts             매니저(React) 빌드 설정
├─ vite.background.config.ts  서비스워커 빌드 설정 (lib 모드, ES 모듈)
├─ vite.content.config.ts     콘텐츠 스크립트 빌드 설정 (lib 모드, iife)
└─ src/
   ├─ storage/           저장 계층 — v1 storage.js를 TS로 이식(types.ts·storage.ts) + 신규 폴더 CRUD(folderOps.ts)
   ├─ background/        MV3 서비스워커 — 컨텍스트 메뉴 구성·클릭 처리
   ├─ content/            유튜브 페이지 콘텐츠 스크립트 — 미니 팝업(새 폴더/이름변경/삭제)
   ├─ manager/            매니저 페이지(React) — 현재는 최소 스캐폴딩(트리 탐색 골격만)
   └─ shared/             background↔content 메시지 타입, 호스트 URL 패턴 상수
```

## 개발 · 빌드
```powershell
npm install               # 최초 1회
npm run dev                # 매니저 페이지만 브라우저에서 미리보기 (chrome.storage 없으면 localStorage 폴백)
npm run typecheck          # tsc --noEmit
npm run build               # typecheck + 매니저·background·content 3종 빌드 → dist/
npm run package             # build 후 dist/ 전체를 tubefolder-extension-v2.zip으로 압축
```

## 확장으로 로드해서 확인하기
1. `npm run build`
2. Chrome 주소창에 `chrome://extensions` 입력 → 우측 상단 "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" → 이 폴더의 `dist/` 선택
4. 유튜브(youtube.com/music.youtube.com) 페이지에서 우클릭 → "🗂️ 폴더 관리"에서 새 폴더·이름변경·삭제 확인

## 검증 한계 (알려둘 것)
- 매니저 페이지(storage 계층 CRUD)는 로컬 브라우저 미리보기(`npm run dev`, localStorage 폴백)로 실제 클릭까지 검증함.
- 우클릭 컨텍스트 메뉴 → 서비스워커 → 콘텐츠 스크립트 미니 팝업으로 이어지는 전체 경로는 `chrome.contextMenus`/`chrome.tabs` 등
  실제 확장 런타임이 있어야만 동작해, 이 개발 환경(브라우저 자동화)만으로는 재현할 수 없음 — 코드 경로 수동 추적 + 타입체크로 검증함.
  실제 Chrome에 위 "확장으로 로드해서 확인하기" 절차로 로드해 육안 확인을 권장.

## 상태
- 2단계 첫 항목(우클릭 메뉴 폴더 추가·이름변경·삭제) 구현 완료. 자세한 진행 상황은 [ROADMAP-CHECKLIST.md](ROADMAP-CHECKLIST.md) 참고.
