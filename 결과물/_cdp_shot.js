// 떠 있는 Chrome(9335)에 다시 붙어 manager 스크린샷만 캡처 (창은 그대로 둠)
const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path');
const PORT = 9335; const SHOT = path.join(os.tmpdir(), 'tubefolder_show.png');
const httpGet = (url) => new Promise((res, rej) => { http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function connect(wsUrl){ const ws=new WebSocket(wsUrl); let id=0; const p={}; ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&p[m.id]){p[m.id](m);delete p[m.id];}}); const ready=new Promise(r=>ws.addEventListener('open',()=>r())); const send=(method,params={})=>new Promise(res=>{const mid=++id;p[mid]=res;ws.send(JSON.stringify({id:mid,method,params}));}); return {ws,ready,send}; }
(async()=>{
  try{
    const list = JSON.parse(await httpGet(`http://localhost:${PORT}/json`));
    const mgr = list.find(t => t.type==='page' && /manager\.html/.test(t.url));
    if(!mgr){ console.log(JSON.stringify({alive:false, tabs:list.map(t=>t.url)})); process.exit(0); }
    const p = connect(mgr.webSocketDebuggerUrl); await p.ready;
    const shot = await p.send('Page.captureScreenshot',{format:'png'});
    if(shot.result&&shot.result.data){ fs.writeFileSync(SHOT, Buffer.from(shot.result.data,'base64')); }
    console.log(JSON.stringify({alive:true, url:mgr.url, title:mgr.title, screenshot:SHOT}));
    try{ p.ws.close(); }catch(e){}
    process.exit(0);
  }catch(e){ console.log(JSON.stringify({alive:false, error:e.message})); process.exit(0); }
})();
