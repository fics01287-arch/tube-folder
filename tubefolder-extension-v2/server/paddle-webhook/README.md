# Paddle 결제 확인용 Cloudflare Worker — 배포 절차 (산들 직접 작업 필요)

이 폴더는 확장 코드가 아니라, Paddle 결제 완료를 확인하기 위한 별도 서버(Cloudflare Worker) 코드다.
Stripe/ExtensionPay와 달리 Paddle Billing은 클라이언트에서 바로 "결제 여부"를 물어볼 API가 없고
웹훅(webhook)으로만 통지하므로, 그 웹훅을 대신 받아줄 곳이 필요해서 만들었다(CLAUDE.md·ROADMAP-CHECKLIST
"결제 연동 구현" 항목 참고).

## 준비물
- Cloudflare 계정(무료 플랜으로 충분)
- Node.js가 설치된 PC (이미 v2 개발 환경에 있음)
- Paddle 계정 + 상품/가격(Price) 생성 완료 상태

## 배포 절차

1. Wrangler 설치 및 로그인 (최초 1회)
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. KV 네임스페이스 생성 (이메일→결제상태 저장소)
   ```bash
   wrangler kv namespace create LICENSES
   ```
   출력되는 `id`를 이 폴더의 `wrangler.toml`의 `REPLACE_ME_KV_NAMESPACE_ID` 자리에 붙여넣는다.

3. Paddle 웹훅 시크릿을 Worker 시크릿으로 등록 (Paddle 대시보드 → Developer Tools → Notifications에서
   웹훅 목적지를 추가하면 발급됨 — 4번에서 실제 URL을 알아야 하므로, 먼저 임시로 아무 URL이나 넣어
   시크릿부터 발급받거나, 5번으로 먼저 배포한 뒤 웹훅을 등록해도 된다)
   ```bash
   wrangler secret put PADDLE_WEBHOOK_SECRET
   ```
   (프롬프트가 뜨면 Paddle이 발급한 시크릿 값을 붙여넣기)

4. 배포
   ```bash
   wrangler deploy
   ```
   배포가 끝나면 `https://tubefolder-paddle-license.<계정서브도메인>.workers.dev` 같은 URL이 출력된다.

5. Paddle 대시보드 → Developer Tools → Notifications에서 웹훅 목적지 URL을
   `https://<위에서 나온 URL>/webhook` 으로 등록하고, 이벤트는 **transaction.completed**를 구독한다.

6. `src/license/licenseEngine.ts`의 `PADDLE_VERIFY_ENDPOINT` 상수를 `https://<위 URL>/check`로 교체한다
   (README 루트의 "Paddle 사용 준비" 절차와 연결됨). Worker가 `Access-Control-Allow-Origin: *`로
   응답하므로 `public/manifest.json`의 `host_permissions`에 별도로 추가하지 않아도 fetch()가 동작한다.

## 동작 확인 방법
- Paddle 대시보드에서 테스트(Sandbox) 결제를 한 번 진행한 뒤,
  `https://<위 URL>/check?email=<테스트에 쓴 이메일>` 을 브라우저로 직접 열어 `{"paid":true,...}`가
  뜨는지 확인한다.
- `wrangler tail` 명령으로 Worker 로그를 실시간으로 볼 수 있다(웹훅이 실제로 도착하는지 확인할 때 유용).

## 알려진 한계
- 이메일 하나만으로 결제 여부를 조회하므로, 타인의 이메일을 추측해 조회하면 그 사람이 결제했는지
  여부(참/거짓) 정도는 알아낼 수 있다 — 결제 금액·카드 정보 등 민감정보는 노출되지 않지만, 완전한
  비공개가 필요하면 조회 시 이메일 대신 별도 토큰(구매 완료 시 발급)을 쓰는 방식으로 강화할 수 있다
  (현재는 다루지 않음 — 필요해지면 별도 논의).
