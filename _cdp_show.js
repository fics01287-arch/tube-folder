// 실제 Chrome에 확장을 로드하고 manager 를 연 뒤 "창을 닫지 않고" 남겨둠 (사용자가 눈으로 확인)
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_SRC = path.join(__dirname, 'tubefolder-extension');
const EXT = path.join(os.tmpdir(), 'tubefolder_show_ext');
const PORT = 9335;
const PROFILE = path.join(os.tmpdir(), 'tubefolder_show_profile');

const httpGet = (url) => new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const p = {};
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && p[m.id]) { p[m.id](m); delete p[m.id]; } });
  const ready = new Promise(r => ws.addEventListener('open', () => r()));
  const send = (method, params = {}, sessionId) => new Promise(res => { const mid = ++id; p[mid] = res; ws.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params })); });
  return { ws, ready, send };
}

// 데모용 초기 데이터(폴더 2 + 하위폴더 + 예시 영상)
function demoStore() {
  const t = Date.now();
  return {
    version: 1, rootId: 'root', trashId: 'trash',
    nodes: {
      root: { id: 'root', type: 'folder', parentId: null, name: '튜브폴더', createdAt: t, modifiedAt: t, order: 0 },
      trash: { id: 'trash', type: 'folder', parentId: 'root', name: '휴지통', system: 'trash', createdAt: t, modifiedAt: t, order: 9007199254740991 },
      f1: { id: 'f1', type: 'folder', parentId: 'root', name: '🎵 음악', createdAt: t, modifiedAt: t, order: 1 },
      f2: { id: 'f2', type: 'folder', parentId: 'root', name: '📚 강의', createdAt: t, modifiedAt: t, order: 2 },
      f3: { id: 'f3', type: 'folder', parentId: 'f1', name: '발라드', createdAt: t, modifiedAt: t, order: 0 },
      v1: { id: 'v1', type: 'video', parentId: 'f1', name: '예시 동영상', videoId: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', kind: 'video', channel: '', duration: 0, createdAt: t, modifiedAt: t, order: 1 }
    },
    settings: { view: 'large', sortKey: 'name', sortDir: 'asc' }
  };
}

(async () => {
  const out = {};
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(EXT, { recursive: true, force: true }); } catch (e) {}
  fs.cpSync(EXT_SRC, EXT, { recursive: true });

  // 창이 부모(node) 종료 후에도 살아있도록 detached + unref
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
    '--start-maximized', 'about:blank'
  ], { detached: true, stdio: 'ignore' });
  chrome.unref();

  let v = null;
  for (let i = 0; i < 60; i++) { try { v = JSON.parse(await httpGet(`http://localhost:${PORT}/json/version`)); break; } catch (e) { await sleep(500); } }
  if (!v) { out.error = 'CDP not ready'; console.log(JSON.stringify(out)); process.exit(1); }

  const b = connect(v.webSocketDebuggerUrl); await b.ready;
  const loaded = await b.send('Extensions.loadUnpacked', { path: EXT });
  if (loaded.error) { out.error = JSON.stringify(loaded.error); console.log(JSON.stringify(out)); process.exit(1); }
  const extId = loaded.result.id;
  out.extId = extId;

  const managerUrl = `chrome-extension://${extId}/manager.html`;
  const created = await b.send('Target.createTarget', { url: managerUrl });
  const tid = created.result.targetId;
  const att = await b.send('Target.attachToTarget', { targetId: tid, flatten: true });
  const sid = att.result.sessionId;
  await b.send('Runtime.enable', {}, sid);
  await b.send('Page.enable', {}, sid);
  await sleep(1200);

  // 데모 데이터 주입 → onChanged 로 자동 렌더 + 확실히 reload
  const store = JSON.stringify(demoStore());
  await b.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression:
    `new Promise(function(res){ chrome.storage.local.set({'tubefolder_v1': ${store}}, function(){ res('ok'); }); })` }, sid);
  await b.send('Page.reload', {}, sid);
  await sleep(1200);

  // manager 탭을 앞으로, 빈 about:blank 탭은 닫기
  await b.send('Target.activateTarget', { targetId: tid });
  try {
    const list = JSON.parse(await httpGet(`http://localhost:${PORT}/json`));
    const blank = list.find(t => t.type === 'page' && t.url === 'about:blank');
    if (blank) await b.send('Target.closeTarget', { targetId: blank.id });
  } catch (e) {}

  out.opened = managerUrl;
  out.note = 'Chrome 창을 남겨둠 — 직접 확인/조작하세요. 확인 후 창을 닫으면 됩니다.';
  console.log(JSON.stringify(out, null, 2));

  // WS만 닫고 node 종료 → Chrome 은 계속 떠 있음
  try { b.ws.close(); } catch (e) {}
  process.exit(0);
})();
