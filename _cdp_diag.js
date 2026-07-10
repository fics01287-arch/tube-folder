// 진단: chrome://extensions 를 열어 우리 확장 로드 여부/에러를 캡처
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT_SRC = path.join(__dirname, 'tubefolder-extension');
const EXT = path.join(os.tmpdir(), 'tubefolder_ext');
const PORT = 9334;
const PROFILE = path.join(os.tmpdir(), 'tubefolder_cdp_profile2');
const SHOT = path.join(os.tmpdir(), 'tubefolder_extpage.png');

const httpGet = (url) => new Promise((res, rej) => { http.get(url, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function connect(wsUrl){ const ws=new WebSocket(wsUrl); let id=0; const p={}; ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&p[m.id]){p[m.id](m);delete p[m.id];}}); const ready=new Promise(r=>ws.addEventListener('open',()=>r())); const send=(method,params={},sessionId)=>new Promise(res=>{const mid=++id;p[mid]=res;ws.send(JSON.stringify(sessionId?{id:mid,method,params,sessionId}:{id:mid,method,params}));}); return {ws,ready,send}; }

(async () => {
  const out = {};
  try { fs.rmSync(PROFILE,{recursive:true,force:true}); } catch(e){}
  try { fs.rmSync(EXT,{recursive:true,force:true}); } catch(e){}
  fs.cpSync(EXT_SRC, EXT, { recursive:true });

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    `--load-extension=${EXT}`,
    '--no-first-run','--no-default-browser-check',
    '--disable-features=Translate,DisableLoadExtensionCommandLineSwitch',
    '--window-size=1200,820','about:blank'
  ]);
  const kill = () => { try { spawn('taskkill',['/pid',String(chrome.pid),'/T','/F']); } catch(e){} };

  try {
    let v=null; for(let i=0;i<60;i++){ try{ v=JSON.parse(await httpGet(`http://localhost:${PORT}/json/version`)); break; }catch(e){ await sleep(500);} }
    if(!v) throw new Error('CDP not ready');
    const b = connect(v.webSocketDebuggerUrl); await b.ready;
    const c = await b.send('Target.createTarget',{url:'chrome://extensions'});
    const tid = c.result.targetId;
    const a = await b.send('Target.attachToTarget',{targetId:tid,flatten:true});
    const sid = a.result.sessionId;
    await b.send('Page.enable',{},sid);
    await b.send('Runtime.enable',{},sid);
    await sleep(2500);

    // chrome://extensions 의 shadow DOM 을 파고들어 확장 카드 정보 추출
    const info = await b.send('Runtime.evaluate',{ returnByValue:true, expression: `
      (function(){
        try{
          var mgr=document.querySelector('extensions-manager');
          if(!mgr) return JSON.stringify({err:'no manager'});
          var items=mgr.shadowRoot.querySelector('extensions-item-list');
          var cards=items?items.shadowRoot.querySelectorAll('extensions-item'):[];
          var res=[];
          cards.forEach(function(card){
            var sr=card.shadowRoot;
            var name=sr.querySelector('#name')?sr.querySelector('#name').textContent.trim():'';
            var errs=sr.querySelector('#errors-button')?sr.querySelector('#errors-button').textContent.trim():'';
            res.push({id:card.id, name:name, errors:errs});
          });
          return JSON.stringify({count:cards.length, cards:res});
        }catch(e){ return JSON.stringify({err:e.message}); }
      })()` }, sid);
    out.extensionsPage = info.result && info.result.result ? info.result.result.value : null;

    const shot = await b.send('Page.captureScreenshot',{format:'png'},sid);
    if(shot.result&&shot.result.data){ fs.writeFileSync(SHOT, Buffer.from(shot.result.data,'base64')); out.screenshot=SHOT; }
  } catch(e){ out.error=e.message; }
  finally { console.log(JSON.stringify(out,null,2)); kill(); await sleep(600); process.exit(0); }
})();
