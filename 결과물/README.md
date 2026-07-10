# 튜브폴더 — 결과물 모음 (소스 · 과정 · 관련자료 · 진화기록)

유튜브 동영상·뮤직을 **내 컴퓨터 탐색기처럼 무제한 폴더로 정리**하는 프로젝트의 **모든 산출물**을 한곳에 모았습니다.
플랫폼은 **하이브리드** — 데스크톱은 크롬 확장, 모바일은 PWA 웹앱, 코어 코드는 1벌 공용입니다.

---

## 📦 폴더 구성

```
결과물/
├─ README.md                     ← 지금 이 파일 (전체 안내)
├─ _이어서하기.md                ▶ 핸드오프 (다음 세션/에이전트 진입점)
├─ tubefolder-extension/         ✅ 최종 소스 전체 (그대로 크롬에 로드 가능)
│   ├─ manifest.json · background.js · manager.html · manager.css
│   ├─ app.js · storage.js · sw.js · manager.webmanifest
│   ├─ icons/  (16·48·128·192·512)
│   ├─ README.md            사용자용 설치·사용 설명
│   ├─ AGENTS.md            🤖 AI 에이전트 자가진화 지침
│   └─ docs/                설계문서 4종 (아키텍처·데이터모델·알고리즘·갭분석)
├─ tubefolder-extension.zip      ✅ 배포용 단일 압축 (남에게 전달용)
├─ _preview_server.js            검증용 정적 서버 (웹 로직 재현)
├─ _cdp_test.js                  실제 Chrome 자동검증 (로드→저장→리로드 영속)
├─ _cdp_show.js                  실제 Chrome 창 띄워두고 눈으로 확인 (데모 데이터 포함)
├─ _cdp_shot.js                  떠 있는 창 스크린샷 캡처
├─ 02_과정/
│   ├─ 진화_타임라인.md          Phase 0~4, 무엇을·왜 바꿨나
│   ├─ 개발_검증_기록.md         실제 검증 절차·관측값·재현법
│   └─ 세션_대화_전체기록.md     이 세션 전 대화 원문+작업+실측 (생략 없음)
└─ 03_관련자료/
    └─ 웹조사_연구노트.md        지구내 자료 총조사 결과 + 출처
```

## 🚀 바로 쓰기 (데스크톱 크롬/엣지)
1. `chrome://extensions` → **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드** → `tubefolder-extension` 폴더 선택
   (또는 `tubefolder-extension.zip`을 풀어서 그 폴더 선택)
3. 툴바 아이콘 클릭 → 관리 화면이 새 탭으로 열림. 유튜브에서 **우클릭 → "튜브폴더에 추가"**.

## 🧪 실제 Chrome로 직접 확인 (CDP 자동)
임시 프로필로 실제 Chrome를 띄워 확장을 로드·검증합니다(본인 프로필 미접촉).
```
node _cdp_test.js     # 자동검증: 로드→폴더생성→chrome.storage 저장→리로드 영속 (결과 JSON 출력)
node _cdp_show.js     # 실제 창을 띄워둠(데모 폴더 포함) → 눈으로 보고 직접 조작. 확인 후 창 닫기
node _cdp_shot.js     # 떠 있는 창을 스크린샷으로 저장
```
> ⚠️ Chrome 137+/149는 자동화용 `--load-extension`을 무시하므로, 자동검증은 CDP `Extensions.loadUnpacked`+`--enable-unsafe-extension-debugging`를 씁니다. **사용자가 chrome://extensions에서 수동으로 로드하는 정상 설치는 영향 없습니다.**

## 📱 모바일 (PWA)
`tubefolder-extension` 폴더를 https 정적 호스팅에 올린 뒤 폰에서 열고 **"홈 화면에 추가"** → 앱처럼·오프라인 동작.
기기 간 이동은 **내보내기/가져오기(JSON)**. (실시간 자동동기화는 백엔드 결정 대기 — 권장: 구글 드라이브 appDataFolder)

## 🤖 AI 에이전트가 이어서 개선할 때
**먼저 [`tubefolder-extension/AGENTS.md`](tubefolder-extension/AGENTS.md)를 읽으세요.** 실행·검증 절차, 코드 지도,
절대 불변식(I1~I9), 회귀 테스트(R1~R4), 흔한 함정(P1~P8), 자가진화 루프가 모두 들어 있습니다.
설계 배경은 [`tubefolder-extension/docs/`](tubefolder-extension/docs/), 변천사는 [`02_과정/진화_타임라인.md`](02_과정/진화_타임라인.md),
근거 자료는 [`03_관련자료/웹조사_연구노트.md`](03_관련자료/웹조사_연구노트.md)에 있습니다.

## ✅ 구현 현황
- 요구 1~7·9 (무제한 폴더·CRUD·정렬·휴지통 고정·보기모드·영속·zip배포): **완료·검증**
- 요구 8 (모바일+연동): **PWA + 내보내기/가져오기로 동작** / *실시간 자동동기화*는 백엔드 1개 결정만 남음

> 원본 작업본은 상위 폴더(`튜브폴더\튜브폴더\tubefolder-extension`)에도 그대로 있습니다. 이 `결과물` 폴더는 전달·보관용 사본입니다.
