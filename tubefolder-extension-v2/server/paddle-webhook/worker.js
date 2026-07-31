// Paddle 결제 확인용 Cloudflare Worker.
// ExtensionPay의 getUser()를 대신한다 — Paddle Billing은 클라이언트에서 바로 호출 가능한
// "결제 여부 조회" API를 제공하지 않고 웹훅(webhook)으로만 결제 완료를 통지하므로, 그 웹훅을
// 받아 이메일→결제여부를 KV에 저장해두고, 확장이 이 Worker의 /check를 조회하는 구조로 대체한다.
//
// 엔드포인트:
//  - POST /webhook : Paddle이 호출(transaction.completed 시 이메일을 paid로 기록)
//  - GET  /check?email=...  : 확장이 호출(해당 이메일의 결제 상태 조회)
//
// 필요한 바인딩(wrangler.toml 참고):
//  - KV 네임스페이스 LICENSES
//  - 시크릿 PADDLE_WEBHOOK_SECRET (Paddle 대시보드 웹훅 설정에서 발급되는 값)

const REPLAY_TOLERANCE_SECONDS = 300; // 웹훅 재전송·네트워크 지연 감안 — 너무 짧으면 정상 웹훅도 거부될 수 있음

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/webhook') {
      return handleWebhook(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/check') {
      return handleCheck(url, env);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    return new Response('Not found', { status: 404 });
  }
};

async function handleWebhook(request, env) {
  const signatureHeader = request.headers.get('Paddle-Signature');
  const rawBody = await request.text();

  if (!(await isValidSignature(signatureHeader, rawBody, env.PADDLE_WEBHOOK_SECRET))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (event.event_type === 'transaction.completed') {
    const email = event.data && event.data.customer && event.data.customer.email;
    if (email) {
      const record = {
        paid: true,
        paidAt: Date.now(),
        transactionId: event.data.id || null
      };
      await env.LICENSES.put(normalizeEmail(email), JSON.stringify(record));
    }
  }

  return new Response('ok', { status: 200 });
}

async function handleCheck(url, env) {
  const email = url.searchParams.get('email');
  if (!email) {
    return jsonResponse({ paid: false });
  }
  const raw = await env.LICENSES.get(normalizeEmail(email));
  if (!raw) {
    return jsonResponse({ paid: false });
  }
  return new Response(raw, { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

function corsHeaders() {
  // 확장(host_permissions 등록 시)은 원래 CORS 제약을 받지 않지만, 향후 PWA 등 일반 웹 컨텍스트에서도
  // 조회할 가능성을 열어두기 위해 명시적으로 허용해둔다 — 응답 내용 자체가 "이메일의 결제 여부" 하나뿐이라
  // 민감정보 노출 범위가 제한적이다.
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function isValidSignature(header, rawBody, secret) {
  if (!header || !secret) return false;

  const parts = {};
  for (const segment of header.split(';')) {
    const [key, value] = segment.split('=');
    if (key && value) parts[key] = value;
  }
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(ts)) > REPLAY_TOLERANCE_SECONDS) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(computedHex, h1);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
