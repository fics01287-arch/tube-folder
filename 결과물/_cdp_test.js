// 실제 Chrome에 확장을 로드해 CDP로 검증 (임시 프로필, 사용자 프로필 미접촉)
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_SRC = path.join(__dirname, 'tubefolder-extension');   // 원본(한글/OneDrive 경로)
const EXT = path.join(os.tmpdir(), 'tubefolder_ext');           // ASCII 임시 경로로 복사해 로드
const PORT = 9333;
const PROFILE = path.join(os.tmpdir(), 'tubefolder_cdp_profile');
const SHOT = path.join(os.tmpdir(), 'tubefolder_cdp.png');

const httpGet = (url) => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = {};
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  });
  const ready = new Promise(res => ws.addEventListener('open', () => res()));
  const send = (method, params = {}, sessionId) => new Promise(resolve => {
    const mid = ++id; pending[mid] = resolve;
    ws.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
  });
  return { ws, ready, send };
}

(async () => {
  const out = { steps: [] };
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  // 확장 로드 경로: 환경변수 TF_SRC=1 이면 원본(OneDrive 한글) 경로 그대로, 아니면 ASCII 임시 복사
  let LOAD = EXT;
  if (process.env.TF_SRC === '1') {
    LOAD = EXT_SRC;
  } else {
    try { fs.rmSync(EXT, { recursive: true, force: true }); } catch (e) {}
    fs.cpSync(EXT_SRC, EXT, { recursive: true });
  }
  out.loadedFrom = LOAD;

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    // 최신 Chrome은 --load-extension 을 무시 → CDP Extensions.loadUnpacked 사용(아래). 이 플래그 필요.
    '--enable-unsafe-extension-debugging',
    '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
    '--window-size=1100,720', 'about:blank'
  ], { detached: false });

  const killChrome = () => { try { spawn('taskkill', ['/pid', String(chrome.pid), '/T', '/F']); } catch (e) {} };

  try {
    // 1) CDP 준비 대기
    let version = null;
    for (let i = 0; i < 60; i++) { try { version = JSON.parse(await httpGet(`http://localhost:${PORT}/json/version`)); break; } catch (e) { await sleep(500); } }
    if (!version) throw new Error('CDP not ready');
    out.browser = version.Browser;
    out.steps.push('CDP ready');

    const b = connect(version.webSocketDebuggerUrl);
    await b.ready;

    // 2) CDP 정식 방법으로 언팩 확장 로드 → 확장 ID 획득
    const loaded = await b.send('Extensions.loadUnpacked', { path: LOAD });
    if (loaded.error) { out.loadError = loaded.error; throw new Error('Extensions.loadUnpacked 실패: ' + JSON.stringify(loaded.error)); }
    const extId = loaded.result.id;
    out.extId = extId;
    out.steps.push('확장 로드됨 (Extensions.loadUnpacked)');
    out.extId = extId;
    out.steps.push('확장 로드됨 (SW 타깃 발견)');

    // 3) manager.html 새 탭 열기
    const managerUrl = `chrome-extension://${extId}/manager.html`;
    const created = await b.send('Target.createTarget', { url: managerUrl });
    const targetId = created.result.targetId;
    const att = await b.send('Target.attachToTarget', { targetId, flatten: true });
    const sid = att.result.sessionId;
    await b.send('Runtime.enable', {}, sid);
    await b.send('Page.enable', {}, sid);
    await sleep(1500);
    out.steps.push('manager.html 열림');

    const evalJS = async (expr) => {
      const r = await b.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails.exception);
      return r.result && r.result.result ? r.result.result.value : undefined;
    };

    // 4) 초기 상태 (실제 확장 컨텍스트 → chrome.storage API 존재해야 함)
    out.test_initial = await evalJS(`JSON.stringify({title:document.title, items:[...document.querySelectorAll('#content .item .label')].map(l=>l.textContent), hasChromeStorage:(typeof chrome!=='undefined' && !!(chrome.storage&&chrome.storage.local))})`);

    // 5) 폴더 2개 생성 (실제 버튼 클릭)
    await evalJS(`(function(){var b=document.querySelector('#btn-new-folder');b.click();b.click();var i=document.querySelector('#content .label input');if(i)i.blur();return 1;})()`);
    await sleep(500);
    out.test_created = await evalJS(`JSON.stringify([...document.querySelectorAll('#content .item .label')].map(l=>l.textContent))`);

    // 6) 실제 chrome.storage.local 에 저장됐는지 (요구 7의 영속 백엔드)
    out.test_storage = await evalJS(`new Promise(res=>{chrome.storage.local.get('tubefolder_v1',o=>{var d=o['tubefolder_v1'];res(JSON.stringify({saved:!!d,nodeCount:d?Object.keys(d.nodes).length:0,version:d?d.version:null}));});})`);

    // 7) 리로드 → 확장 off/on 과 동일하게 데이터가 유지되어야 함 (요구 7)
    await b.send('Page.reload', {}, sid);
    await sleep(1800);
    out.test_afterReload = await evalJS(`JSON.stringify([...document.querySelectorAll('#content .item .label')].map(l=>l.textContent))`);

    // 8) 스크린샷
    const shot = await b.send('Page.captureScreenshot', { format: 'png' }, sid);
    if (shot.result && shot.result.data) { fs.writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64')); out.screenshot = SHOT; }

    out.steps.push('검증 완료');
  } catch (e) {
    out.error = e.message;
  } finally {
    console.log(JSON.stringify(out, null, 2));
    killChrome();
    await sleep(800);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
    process.exit(out.error ? 1 : 0);
  }
})();
