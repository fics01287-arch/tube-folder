'use strict';
/* app.js v1.5 — 튜브폴더 매니저
 * 신규: 우클릭 폴더 추가/이동/삭제 · 내보내기 완료 팝업 · 폴더선택 모달
 *       background pending command 처리 (새 폴더, 이름 바꾸기)
 */
(function () {
  var T = window.TubeStore;
  var store = null;
  var currentId = 'root';
  var selection = new Set();
  var clipboard = null;
  var expanded = {};
  var query = '';
  var saveTimer = null;
  var undoStack = [];
  var descMemo = {};
  var marqueeMoved = false;
  var history = [];
  var historyPos = -1;

  function pushHistory(id) {
    history = history.slice(0, historyPos + 1);
    if (history[history.length - 1] !== id) history.push(id);
    historyPos = history.length - 1;
    updateNavButtons();
  }
  function goBack() {
    if (historyPos <= 0) return;
    historyPos--;
    currentId = history[historyPos];
    selection.clear(); query = ''; $('#search').value = '';
    render(); updateNavButtons();
  }
  function goUp() {
    var cur = node(currentId);
    if (!cur || !cur.parentId) return;
    goTo(cur.parentId);
  }
  function updateNavButtons() {
    var bb = $('#btn-back'), bu = $('#btn-up');
    if (bb) bb.disabled = (historyPos <= 0);
    if (bu) { var cur = node(currentId); bu.disabled = !cur || !cur.parentId; }
  }

  function $(s) { return document.querySelector(s); }
  function node(id) { return store.nodes[id]; }
  function now() { return Date.now(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function childrenOf(id) { var o=[]; for(var k in store.nodes) if(store.nodes[k].parentId===id) o.push(store.nodes[k]); return o; }
  function isDescendant(descId, ancId) { var p=node(descId); while(p&&p.parentId){if(p.parentId===ancId)return true;p=node(p.parentId);} return false; }
  function descendantIds(id) { var o=[]; childrenOf(id).forEach(function(c){o.push(c.id);o.push.apply(o,descendantIds(c.id));}); return o; }
  function nextOrder(pid) { var m=0; childrenOf(pid).forEach(function(n){if(n.id!==store.trashId&&n.order>=m)m=n.order+1;}); return m; }
  function scheduleSave() { if(saveTimer)clearTimeout(saveTimer); saveTimer=setTimeout(function(){T.save(store);saveTimer=null;},200); }
  function buildDescMemo() {
    var byP={}; for(var k in store.nodes){var n=store.nodes[k];(byP[n.parentId]=byP[n.parentId]||[]).push(n.id);}
    descMemo={};
    function cnt(id){var ks=byP[id]||[],c=ks.length;for(var i=0;i<ks.length;i++)c+=cnt(ks[i]);descMemo[id]=c;return c;}
    for(var k2 in store.nodes) if(descMemo[k2]===undefined) cnt(k2);
  }

  function pushUndo() { try{undoStack.push(JSON.stringify(store));if(undoStack.length>30)undoStack.shift();}catch(e){} }
  function undo() { var s=undoStack.pop();if(!s)return;try{store=JSON.parse(s);}catch(e){return;} selection.clear();clipboard=null;T.save(store);render(); }

  function typeLabel(n){return n.type==='folder'?'폴더':(n.kind==='music'?'YouTube 뮤직':'YouTube 동영상');}
  function sizeValue(n){return n.type==='folder'?(descMemo[n.id]||0):(n.duration||0);}
  function fmtSize(n){return n.type==='folder'?((descMemo[n.id]||0)+'개 항목'):(n.duration?fmtDur(n.duration):'—');}
  function fmtDur(s){var m=Math.floor(s/60),x=s%60;return m+':'+(x<10?'0':'')+x;}
  function fmtDate(ts){if(!ts)return'';var d=new Date(ts);function p(n){return n<10?'0'+n:''+n;} return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
  function compareNodes(a,b){
    var dir=store.settings.sortDir==='desc'?-1:1;
    var af=a.type==='folder'?0:1,bf=b.type==='folder'?0:1;
    if(af!==bf)return af-bf;
    var r=0,key=store.settings.sortKey;
    if(key==='name')r=a.name.localeCompare(b.name,'ko',{numeric:true});
    else if(key==='date')r=(a.modifiedAt||0)-(b.modifiedAt||0);
    else if(key==='type'){r=typeLabel(a).localeCompare(typeLabel(b),'ko');if(r===0)r=a.name.localeCompare(b.name,'ko',{numeric:true});}
    else if(key==='size')r=sizeValue(a)-sizeValue(b);
    else if(key==='none')r=(a.order||0)-(b.order||0);
    if(r===0)r=(a.order||0)-(b.order||0);
    return r*dir;
  }
  function listFolder(id){
    var items=childrenOf(id).filter(function(n){return n.id!==store.trashId;});
    items.sort(compareNodes);
    if(id===store.rootId){var tr=node(store.trashId);if(tr)items.push(tr);}
    return items;
  }

  var IF='📁',IFO='📂',IT='🗑️',IV='▶',IM='🎵';
  function thumbInner(n){if(n.type==='folder')return n.system==='trash'?IT:IF;if(n.thumb)return'<img src="'+esc(n.thumb)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">';return n.kind==='music'?IM:IV;}
  function isCut(id){return clipboard&&clipboard.mode==='cut'&&clipboard.ids.indexOf(id)>=0;}
  function render(){buildDescMemo();renderCrumbs();renderTree();renderContent();renderStatus();syncMenus();updateNavButtons();}

  function renderCrumbs(){
    var el=$('#crumbs');var chain=[];var p=node(currentId);
    while(p){chain.unshift(p);p=p.parentId?node(p.parentId):null;}
    el.innerHTML='';
    chain.forEach(function(n,i){
      if(i>0){var s=document.createElement('span');s.className='chev';s.textContent=' › ';el.appendChild(s);}
      var c=document.createElement('span');c.className='crumb';c.textContent=n.name;c.dataset.id=n.id;
      c.onclick=function(){goTo(n.id);};attachFolderDrop(c,n.id);el.appendChild(c);
    });
  }

  function renderTree(){
    var el=$('#tree');el.innerHTML='';
    el.appendChild(treeRow(node(store.rootId),0));
    function buildChildren(parent,depth){
      var kids=childrenOf(parent.id).filter(function(n){return n.type==='folder'&&n.id!==store.trashId;});
      kids.sort(function(a,b){return a.name.localeCompare(b.name,'ko',{numeric:true});});
      kids.forEach(function(k){el.appendChild(treeRow(k,depth));if(expanded[k.id])buildChildren(k,depth+1);});
      if(parent.id===store.rootId)el.appendChild(treeRow(node(store.trashId),depth));
    }
    if(expanded[store.rootId]!==false)buildChildren(node(store.rootId),1);
  }

  function treeRow(n,depth){
    var row=document.createElement('div');
    row.className='row'+(n.id===currentId?' active':'')+(n.system==='trash'?' is-trash':'');
    row.style.paddingLeft=(6+depth*14)+'px';
    var hasKids=n.type==='folder'&&childrenOf(n.id).some(function(c){return c.type==='folder'&&c.id!==store.trashId;});
    var tw=document.createElement('span');tw.className='twisty';tw.textContent=hasKids?(expanded[n.id]?'▾':'▸'):'';
    tw.onclick=function(e){e.stopPropagation();expanded[n.id]=!expanded[n.id];renderTree();};
    var ic=document.createElement('span');ic.className='ti';ic.textContent=n.system==='trash'?IT:(expanded[n.id]?IFO:IF);
    var lb=document.createElement('span');lb.textContent=n.name;
    row.appendChild(tw);row.appendChild(ic);row.appendChild(lb);
    row.onclick=function(){goTo(n.id);};
    row.oncontextmenu=function(e){e.preventDefault();e.stopPropagation();selection.clear();selection.add(n.id);render();showContextMenu(e.clientX,e.clientY,n);};
    attachFolderDrop(row,n.id);
    return row;
  }

  function renderContent(){
    var host=$('#content');host.className='content view-'+store.settings.view;host.innerHTML='';
    var items=query?searchAll(query):listFolder(currentId);
    if(!items.length){var hint=document.createElement('div');hint.className='empty-hint';hint.textContent=query?'검색 결과가 없습니다.':'비어 있습니다. "새 폴더"나 "동영상 추가"로 시작하세요.';host.appendChild(hint);return;}
    host.appendChild(store.settings.view==='details'?renderTable(items):renderGrid(items));
  }

  function renderGrid(items){var g=document.createElement('div');g.className='grid';items.forEach(function(n){g.appendChild(renderItem(n));});return g;}

  function renderItem(n){
    var it=document.createElement('div');
    it.className='item'+(selection.has(n.id)?' selected':'')+(n.system==='trash'?' is-trash':'')+(isCut(n.id)?' cut':'');
    it.dataset.id=n.id;it.draggable=!n.system;
    var th=document.createElement('div');th.className='thumb';th.innerHTML=thumbInner(n);
    var lb=document.createElement('div');lb.className='label';lb.textContent=n.name;
    it.appendChild(th);it.appendChild(lb);
    if(n.kind==='music'){var b=document.createElement('span');b.className='badge-music';b.textContent='🎵';it.appendChild(b);}
    wireItem(it,n,lb);return it;
  }

  function renderTable(items){
    var table=document.createElement('table');table.className='table';
    var cols=[['name','이름'],['date','수정한 날짜'],['type','유형'],['size','크기']];
    var thead=document.createElement('tr');
    cols.forEach(function(c){
      var th=document.createElement('th');
      var arrow=store.settings.sortKey===c[0]?(store.settings.sortDir==='asc'?' ▲':' ▼'):'';
      th.innerHTML=esc(c[1])+'<span class="arrow">'+arrow+'</span>';
      th.onclick=function(){if(store.settings.sortKey===c[0])store.settings.sortDir=store.settings.sortDir==='asc'?'desc':'asc';else{store.settings.sortKey=c[0];store.settings.sortDir='asc';}scheduleSave();render();};
      thead.appendChild(th);
    });
    table.appendChild(thead);
    items.forEach(function(n){
      var tr=document.createElement('tr');tr.className='row'+(selection.has(n.id)?' selected':'')+(isCut(n.id)?' cut':'');tr.dataset.id=n.id;tr.draggable=!n.system;
      var tdN=document.createElement('td');tdN.className='name';
      tdN.innerHTML=(n.type==='folder'?'<span class="ti">'+(n.system==='trash'?IT:IF)+'</span>':(n.thumb?'<img src="'+esc(n.thumb)+'" alt="">':'<span class="ti">'+(n.kind==='music'?IM:IV)+'</span>'));
      var nm=document.createElement('span');nm.textContent=n.name;tdN.appendChild(nm);
      var tdD=document.createElement('td');tdD.className='col-muted';tdD.textContent=fmtDate(n.modifiedAt);
      var tdT=document.createElement('td');tdT.className='col-muted';tdT.textContent=typeLabel(n);
      var tdS=document.createElement('td');tdS.className='col-muted';tdS.textContent=fmtSize(n);
      tr.appendChild(tdN);tr.appendChild(tdD);tr.appendChild(tdT);tr.appendChild(tdS);
      wireItem(tr,n,nm);table.appendChild(tr);
    });
    return table;
  }

  function renderStatus(){
    var total=childrenOf(currentId).filter(function(n){return n.id!==store.trashId;}).length;
    var sortName={name:'이름',date:'수정한 날짜',type:'유형',size:'크기',none:'없음(수동)'}[store.settings.sortKey];
    $('#status').innerHTML='<span>'+total+'개 항목</span>'+(selection.size?'<span>'+selection.size+'개 선택됨</span>':'')+'<span>정렬: '+sortName+' ('+(store.settings.sortDir==='asc'?'오름차순':'내림차순')+')</span>'+(clipboard?'<span>클립보드: '+clipboard.ids.length+'개 ('+(clipboard.mode==='copy'?'복사':'잘라내기')+')</span>':'')+(undoStack.length?'<span>↶ 실행취소 가능 (Ctrl+Z)</span>':'');
  }

  function applySelectionClasses(){document.querySelectorAll('#content .item, #content .table tr.row').forEach(function(el){el.classList.toggle('selected',selection.has(el.dataset.id));});}

  function wireItem(el,n,labelEl){
    el.onclick=function(e){e.stopPropagation();onSelect(n.id,e);};
    el.ondblclick=function(e){e.stopPropagation();openNode(n);};
    el.oncontextmenu=function(e){e.preventDefault();e.stopPropagation();if(!selection.has(n.id)){selection.clear();selection.add(n.id);render();}showContextMenu(e.clientX,e.clientY,n);};
    if(!n.system){el.ondragstart=function(e){if(!selection.has(n.id)){selection.clear();selection.add(n.id);render();}e.dataTransfer.setData('application/x-tubefolder',JSON.stringify(Array.from(selection)));e.dataTransfer.effectAllowed='copyMove';};}
    if(n.type==='folder')attachFolderDrop(el,n.id);
    el._startRename=function(){startRename(el,n,labelEl);};
  }

  function attachFolderDrop(el,fid){
    el.ondragover=function(e){e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('drop-target');};
    el.ondragleave=function(){el.classList.remove('drop-target');};
    el.ondrop=function(e){e.preventDefault();e.stopPropagation();el.classList.remove('drop-target');handleDrop(e,fid);};
  }

  function handleDrop(e,tgt){
    var internal=e.dataTransfer.getData('application/x-tubefolder');
    if(internal){var ids;try{ids=JSON.parse(internal);}catch(x){return;}moveNodes(ids,tgt);return;}
    var text=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');
    if(text){var urls=text.split(/\s+/).filter(function(u){return T.extractVideoId(u);});if(urls.length)bulkAdd(urls,tgt);}
  }

  function onSelect(id,e){
    if(e.ctrlKey||e.metaKey){if(selection.has(id))selection.delete(id);else selection.add(id);}
    else if(e.shiftKey&&selection.size){rangeSelect(id);}
    else{selection.clear();selection.add(id);}
    render();
  }
  function rangeSelect(id){
    var items=(query?searchAll(query):listFolder(currentId)).map(function(n){return n.id;});
    var idx=items.indexOf(id),anchor=items.findIndex(function(x){return selection.has(x);});
    if(idx<0||anchor<0){selection.add(id);return;}
    var a=Math.min(idx,anchor),b=Math.max(idx,anchor);selection.clear();for(var i=a;i<=b;i++)selection.add(items[i]);
  }

  function openNode(n){if(n.type==='folder')goTo(n.id);else if(n.url)window.open(n.url,'_blank');}
  function goTo(id){currentId=id;selection.clear();query='';$('#search').value='';pushHistory(id);render();}

  function startRename(el,n,labelEl){
    if(n.system)return;
    var input=document.createElement('input');input.value=n.name;labelEl.textContent='';labelEl.appendChild(input);input.focus();input.select();
    var done=false;
    function commit(){if(done)return;done=true;var v=input.value.trim();if(v&&v!==n.name){pushUndo();n.name=v;n.modifiedAt=now();scheduleSave();}render();}
    input.onkeydown=function(e){if(e.key==='Enter')commit();else if(e.key==='Escape'){done=true;render();}e.stopPropagation();};
    input.onblur=commit;input.onclick=function(e){e.stopPropagation();};
  }
  function renameSelected(){if(selection.size!==1)return;var id=Array.from(selection)[0];var el=document.querySelector('[data-id="'+id+'"]');if(el&&el._startRename)el._startRename();}

  function moveNodes(ids,tgtId){
    if(tgtId===store.trashId)return trashNodes(ids);
    var tgt=node(tgtId);if(!tgt||tgt.type!=='folder')return;
    var moved=false;pushUndo();
    ids.forEach(function(id){
      if(id===store.rootId||id===store.trashId||id===tgtId)return;
      if(isDescendant(tgtId,id))return;
      var n=node(id);if(!n||n.parentId===tgtId)return;
      n.parentId=tgtId;n.modifiedAt=now();n.order=nextOrder(tgtId);moved=true;
    });
    if(!moved){undoStack.pop();return;}
    selection.clear();clipboard=null;scheduleSave();render();
  }

  function trashNodes(ids){var any=false;pushUndo();ids.forEach(function(id){if(id===store.rootId||id===store.trashId)return;var n=node(id);if(!n)return;n.prevParentId=n.parentId;n.parentId=store.trashId;n.modifiedAt=now();any=true;});if(!any){undoStack.pop();return;}selection.clear();scheduleSave();render();}
  function restoreNodes(ids){pushUndo();ids.forEach(function(id){var n=node(id);if(!n||n.parentId!==store.trashId)return;var p=(n.prevParentId&&node(n.prevParentId))?n.prevParentId:store.rootId;if(p===store.trashId)p=store.rootId;n.parentId=p;delete n.prevParentId;n.modifiedAt=now();});selection.clear();scheduleSave();render();}
  function purgeNodes(ids){pushUndo();var all=new Set();ids.forEach(function(id){if(id===store.rootId||id===store.trashId)return;all.add(id);descendantIds(id).forEach(function(d){all.add(d);});});all.forEach(function(id){delete store.nodes[id];});selection.clear();scheduleSave();render();}
  function emptyTrash(){var kids=childrenOf(store.trashId).map(function(n){return n.id;});if(!kids.length)return;if(!confirm('휴지통의 '+kids.length+'개 항목을 완전히 삭제할까요? 되돌릴 수 없습니다.'))return;purgeNodes(kids);}

  function deepCopy(id,newParent,top){
    var src=node(id);if(!src)return;
    var nid=T.uid();var name=top?T.uniqueName(childrenOf(newParent),src.name):src.name;
    var clone=Object.assign({},src,{id:nid,parentId:newParent,name:name,createdAt:now(),modifiedAt:now(),order:nextOrder(newParent)});
    delete clone.prevParentId;store.nodes[nid]=clone;
    childrenOf(id).forEach(function(c){deepCopy(c.id,nid,false);});return nid;
  }
  function doCopy(){if(selection.size){clipboard={mode:'copy',ids:Array.from(selection)};render();}}
  function doCut(){if(selection.size){clipboard={mode:'cut',ids:Array.from(selection)};render();}}
  function doPaste(){
    if(!clipboard)return;
    if(clipboard.mode==='copy'){pushUndo();clipboard.ids.forEach(function(id){deepCopy(id,currentId,true);});scheduleSave();render();}
    else{moveNodes(clipboard.ids,currentId);clipboard=null;render();}
  }

  function newFolder(parentId){
    var pid=parentId||currentId;pushUndo();
    var id=T.uid();
    store.nodes[id]={id:id,type:'folder',parentId:pid,name:T.uniqueName(childrenOf(pid),'새 폴더'),createdAt:now(),modifiedAt:now(),order:nextOrder(pid)};
    scheduleSave();
    if(pid!==currentId){expanded[pid]=true;}
    render();
    setTimeout(function(){var el=document.querySelector('[data-id="'+id+'"]');if(el&&el._startRename)el._startRename();},50);
  }

  function showFolderPicker(title, excludeIds, callback) {
    var modal = $('#modal-folder-picker');
    var modalTitle = $('#modal-folder-title');
    var modalTree = $('#modal-folder-tree');
    modalTitle.textContent = title;
    modalTree.innerHTML = '';
    var selectedFolderId = null;

    function buildTree(parentId, depth) {
      var kids = childrenOf(parentId).filter(function(n) {
        return n.type === 'folder' && n.id !== store.trashId && excludeIds.indexOf(n.id) < 0;
      });
      kids.sort(function(a,b){return a.name.localeCompare(b.name,'ko',{numeric:true});});
      kids.forEach(function(n) {
        var row = document.createElement('div');
        row.className = 'fp-row';
        row.style.paddingLeft = (12 + depth * 16) + 'px';
        row.innerHTML = '<span>' + IF + '</span> ' + esc(n.name);
        row.dataset.id = n.id;
        row.onclick = function() {
          modalTree.querySelectorAll('.fp-row').forEach(function(r){r.classList.remove('fp-sel');});
          row.classList.add('fp-sel');
          selectedFolderId = n.id;
          $('#modal-folder-ok').disabled = false;
        };
        modalTree.appendChild(row);
        buildTree(n.id, depth + 1);
      });
    }

    var rootRow = document.createElement('div');
    rootRow.className = 'fp-row';
    rootRow.style.paddingLeft = '12px';
    rootRow.innerHTML = '<span>' + IFO + '</span> 📁 튜브폴더 (최상위)';
    rootRow.dataset.id = store.rootId;
    if (excludeIds.indexOf(store.rootId) < 0) {
      rootRow.onclick = function() {
        modalTree.querySelectorAll('.fp-row').forEach(function(r){r.classList.remove('fp-sel');});
        rootRow.classList.add('fp-sel');
        selectedFolderId = store.rootId;
        $('#modal-folder-ok').disabled = false;
      };
    } else {
      rootRow.style.opacity = '0.4';
    }
    modalTree.appendChild(rootRow);
    buildTree(store.rootId, 1);

    $('#modal-folder-ok').disabled = true;
    $('#modal-folder-ok').onclick = function() {
      if (selectedFolderId) { modal.classList.add('hidden'); callback(selectedFolderId); }
    };
    $('#modal-folder-cancel').onclick = function() { modal.classList.add('hidden'); };
    modal.classList.remove('hidden');
  }

  function showExportPopup() {
    var modal = $('#modal-export');
    modal.classList.remove('hidden');
    $('#modal-export-ok').onclick = function() { modal.classList.add('hidden'); };
  }

  function searchAll(q){
    q=q.toLowerCase();var out=[];
    for(var k in store.nodes){var n=store.nodes[k];if(n.id===store.rootId||n.id===store.trashId)continue;if(n.parentId===store.trashId)continue;if(n.name&&n.name.toLowerCase().indexOf(q)>=0)out.push(n);}
    out.sort(compareNodes);return out;
  }

  function showContextMenu(x, y, n) {
    var m = $('#ctxmenu');
    var inTrash = n && (n.parentId === store.trashId);
    var isTrashFolder = n && n.system === 'trash';
    var items = [];

    if (isTrashFolder) {
      items.push(['🗑️ 휴지통 비우기', emptyTrash, 'danger']);
    } else if (inTrash) {
      items.push(['↩️ 복원', function(){restoreNodes(Array.from(selection));}]);
      items.push(['sep']);
      items.push(['❌ 완전 삭제', function(){if(confirm('완전히 삭제할까요?'))purgeNodes(Array.from(selection));}, 'danger']);
    } else if (n && n.type === 'folder') {
      items.push(['📂 열기', function(){openNode(n);}]);
      items.push(['sep']);
      items.push(['📁 새 하위 폴더', function(){newFolder(n.id);}]);
      items.push(['sep']);
      items.push(['✏️ 이름 바꾸기 (F2)', renameSelected, null, selection.size !== 1]);
      items.push(['sep']);
      items.push(['📋 복사', doCopy]);
      items.push(['✂️ 잘라내기', doCut]);
      items.push(['📂 복사 위치 선택…', function(){
        var ids = Array.from(selection);
        var excl = [];
        ids.forEach(function(id){excl.push(id);excl.push.apply(excl,descendantIds(id));});
        showFolderPicker('복사할 폴더를 선택하세요', excl, function(tgtId){
          pushUndo();ids.forEach(function(id){deepCopy(id,tgtId,true);});scheduleSave();render();
        });
      }, null, !selection.size]);
      items.push(['📂 이동 위치 선택…', function(){
        var ids = Array.from(selection);
        var excl = [];
        ids.forEach(function(id){excl.push(id);excl.push.apply(excl,descendantIds(id));});
        showFolderPicker('이동할 폴더를 선택하세요', excl, function(tgtId){moveNodes(ids, tgtId);});
      }, null, !selection.size]);
      items.push(['sep']);
      items.push(['🗑️ 삭제 (휴지통)', function(){trashNodes(Array.from(selection));}, 'danger']);
    } else if (n && n.type === 'video') {
      items.push(['▶️ 유튜브에서 재생', function(){openNode(n);}]);
      items.push(['sep']);
      items.push(['✏️ 이름 바꾸기 (F2)', renameSelected, null, selection.size !== 1]);
      items.push(['sep']);
      items.push(['📋 복사', doCopy]);
      items.push(['✂️ 잘라내기', doCut]);
      items.push(['📂 이동 위치 선택…', function(){
        var ids = Array.from(selection);
        showFolderPicker('이동할 폴더를 선택하세요', [], function(tgtId){moveNodes(ids, tgtId);});
      }, null, !selection.size]);
      items.push(['sep']);
      items.push(['🗑️ 삭제 (휴지통)', function(){trashNodes(Array.from(selection));}, 'danger']);
    } else {
      items.push(['📁 새 폴더', newFolder]);
      items.push(['🎬 동영상 추가', addVideoPrompt]);
      items.push(['sep']);
      items.push(['📋 붙여넣기 (Ctrl+V)', doPaste, null, !clipboard]);
      items.push(['sep']);
      items.push(['↶ 실행취소 (Ctrl+Z)', undo, null, !undoStack.length]);
    }

    m.innerHTML = '';
    items.forEach(function(it){
      if(it[0]==='sep'){m.appendChild(document.createElement('hr'));return;}
      var b=document.createElement('button');b.textContent=it[0];
      if(it[2])b.className=it[2];
      if(it[3])b.disabled=true;else b.onclick=function(){hideContextMenu();it[1]();};
      m.appendChild(b);
    });
    m.classList.remove('hidden');
    var mw=210, mh=m.scrollHeight||300;
    m.style.left=Math.min(x, window.innerWidth-mw-8)+'px';
    m.style.top=Math.min(y, window.innerHeight-mh-8)+'px';
  }
  function hideContextMenu(){$('#ctxmenu').classList.add('hidden');}

  function exportData(){
    var blob=new Blob([JSON.stringify(store,null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tubefolder-backup.json';a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    showExportPopup();
  }

  function importData(file){
    var reader=new FileReader();
    reader.onload=function(){
      try{
        var data=JSON.parse(reader.result);
        if(!data||!data.nodes)throw new Error('형식 오류');
        if(!confirm('현재 내용을 가져온 파일로 교체할까요?\n(현재 정리 내용은 사라집니다 — 실행취소 가능)'))return;
        pushUndo();store=T.migrate(data);currentId=store.rootId;selection.clear();clipboard=null;query='';$('#search').value='';T.save(store);render();
      }catch(e){alert('가져오기 실패: 올바른 튜브폴더 백업 파일이 아닙니다.');}
    };
    reader.readAsText(file);
  }

  function syncMenus(){
    document.querySelectorAll('#menu-view button').forEach(function(b){b.classList.toggle('checked',b.dataset.view===store.settings.view);});
    document.querySelectorAll('#menu-sort button').forEach(function(b){if(b.dataset.sort)b.classList.toggle('checked',b.dataset.sort===store.settings.sortKey);if(b.dataset.dir)b.classList.toggle('checked',b.dataset.dir===store.settings.sortDir);});
  }

  function wireToolbar(){
    $('#btn-new-folder').onclick=function(){newFolder(currentId);};
    $('#btn-add-video').onclick=addVideoPrompt;
    $('#btn-export').onclick=exportData;
    $('#btn-import').onclick=function(){$('#importer').click();};
    $('#importer').onchange=function(e){if(e.target.files[0])importData(e.target.files[0]);e.target.value='';};
    $('#btn-tree').onclick=function(){$('#tree').classList.toggle('collapsed');};
    $('#btn-back').onclick=goBack;
    $('#btn-up').onclick=goUp;
    toggleMenu($('#btn-view'),$('#menu-view'));
    toggleMenu($('#btn-sort'),$('#menu-sort'));
    $('#menu-view').onclick=function(e){var v=e.target.dataset.view;if(!v)return;store.settings.view=v;scheduleSave();render();$('#menu-view').classList.add('hidden');};
    $('#menu-sort').onclick=function(e){if(e.target.dataset.sort)store.settings.sortKey=e.target.dataset.sort;else if(e.target.dataset.dir)store.settings.sortDir=e.target.dataset.dir;else return;scheduleSave();render();$('#menu-sort').classList.add('hidden');};
    var sb=$('#search');sb.oninput=function(){query=sb.value.trim();selection.clear();render();};
    var content=$('#content');
    content.onclick=function(){if(marqueeMoved){marqueeMoved=false;return;}selection.clear();render();};
    content.oncontextmenu=function(e){e.preventDefault();selection.clear();render();showContextMenu(e.clientX,e.clientY,null);};
    content.ondragover=function(e){e.preventDefault();content.classList.add('drop-root');};
    content.ondragleave=function(){content.classList.remove('drop-root');};
    content.ondrop=function(e){content.classList.remove('drop-root');if(e.target.closest('.item')||e.target.closest('tr.row')||e.target.closest('.crumb')||e.target.closest('.tree'))return;e.preventDefault();handleDrop(e,currentId);};
    setupMarquee(content);
    document.addEventListener('click',function(){hideContextMenu();});
    document.addEventListener('keydown',onKey);
  }

  function toggleMenu(btn,menu){
    btn.onclick=function(e){e.stopPropagation();var w=menu.classList.contains('hidden');document.querySelectorAll('.menu').forEach(function(m){m.classList.add('hidden');});if(w)menu.classList.remove('hidden');};
    menu.onclick=function(e){e.stopPropagation();};
  }

  function setupMarquee(content){
    content.addEventListener('mousedown',function(e){
      if(e.button!==0)return;if(e.target.closest('.item')||e.target.closest('tr.row')||e.target.closest('th'))return;
      var sx=e.clientX,sy=e.clientY;var base=(e.ctrlKey||e.metaKey)?new Set(selection):new Set();
      var box=document.createElement('div');box.className='marquee';document.body.appendChild(box);marqueeMoved=false;
      function move(ev){var x=Math.min(sx,ev.clientX),y=Math.min(sy,ev.clientY),w=Math.abs(ev.clientX-sx),h=Math.abs(ev.clientY-sy);if(w>3||h>3)marqueeMoved=true;box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';var r={left:x,top:y,right:x+w,bottom:y+h};var sel=new Set(base);content.querySelectorAll('.item,.table tr.row').forEach(function(it){if(it.dataset.id===store.trashId)return;var b=it.getBoundingClientRect();if(!(b.right<r.left||b.left>r.right||b.bottom<r.top||b.top>r.bottom))sel.add(it.dataset.id);});selection=sel;applySelectionClasses();}
      function up(){document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);box.remove();renderStatus();}
      document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
    });
  }

  async function addOne(url,pid){
    var vid=T.extractVideoId(url);if(!vid)return false;var meta=await T.fetchMeta(url);var id=T.uid();
    store.nodes[id]={id:id,type:'video',parentId:pid,name:T.uniqueName(childrenOf(pid),(meta&&meta.title)||url),videoId:vid,url:url,thumb:'https://i.ytimg.com/vi/'+vid+'/mqdefault.jpg',kind:url.indexOf('music.youtube')>=0?'music':'video',channel:(meta&&meta.channel)||'',duration:0,createdAt:now(),modifiedAt:now(),order:nextOrder(pid)};
    return true;
  }
  async function bulkAdd(urls,pid){pushUndo();var added=0;for(var i=0;i<urls.length;i++){if(await addOne(urls[i],pid)){added++;render();}}if(!added){undoStack.pop();return;}scheduleSave();render();}
  async function addVideoPrompt(){
    var raw=prompt('YouTube 동영상/뮤직 URL을 붙여넣으세요.\n여러 개는 줄바꿈 또는 공백으로 구분하면 한 번에 추가됩니다.');
    if(!raw)return;var urls=raw.split(/\s+/).filter(Boolean);var valid=urls.filter(function(u){return T.extractVideoId(u);});
    if(!valid.length){alert('유효한 YouTube URL이 없습니다.');return;}await bulkAdd(valid,currentId);
  }

  function reorder(delta){
    if(!selection.size)return;if(store.settings.sortKey!=='none'){store.settings.sortKey='none';store.settings.sortDir='asc';}
    var items=childrenOf(currentId).filter(function(n){return!n.system;});items.sort(function(a,b){return(a.order||0)-(b.order||0);});items.forEach(function(n,i){n.order=i;});pushUndo();
    var seq=delta<0?items.slice():items.slice().reverse();var changed=false;
    seq.forEach(function(n){if(!selection.has(n.id))return;var i=items.indexOf(n),j=i+delta;if(j<0||j>=items.length||selection.has(items[j].id))return;var t=items[i];items[i]=items[j];items[j]=t;changed=true;});
    if(!changed){undoStack.pop();return;}items.forEach(function(n,i){n.order=i;n.modifiedAt=now();});scheduleSave();render();
  }

  function moveSel(delta){
    var items=query?searchAll(query):listFolder(currentId);if(!items.length)return;
    var ids=items.map(function(n){return n.id;});var cur=selection.size?ids.indexOf(Array.from(selection)[selection.size-1]):-1;
    var ni=cur<0?0:Math.max(0,Math.min(ids.length-1,cur+delta));selection.clear();selection.add(ids[ni]);render();
    var el=document.querySelector('[data-id="'+ids[ni]+'"]');if(el)el.scrollIntoView({block:'nearest'});
  }

  function onKey(e){
    if(e.target.tagName==='INPUT')return;
    var ctrl=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
    if(e.key==='F2'){renameSelected();e.preventDefault();}
    else if(e.key==='Delete'){var ids=Array.from(selection);if(!ids.length)return;if(currentId===store.trashId){if(confirm('완전히 삭제할까요?'))purgeNodes(ids);}else trashNodes(ids);}
    else if(ctrl&&k==='z'){e.preventDefault();undo();}
    else if(ctrl&&k==='c')doCopy();
    else if(ctrl&&k==='x')doCut();
    else if(ctrl&&k==='v')doPaste();
    else if(ctrl&&k==='a'){e.preventDefault();selection.clear();listFolder(currentId).forEach(function(n){if(!n.system)selection.add(n.id);});render();}
    else if(e.altKey&&e.key==='ArrowUp'){e.preventDefault();reorder(-1);}
    else if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();reorder(1);}
    else if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();goBack();}
    else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();moveSel(-1);}
    else if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();moveSel(1);}
    else if(e.key==='Enter'){if(selection.size===1)openNode(node(Array.from(selection)[0]));}
    else if(e.key==='Backspace')goUp();
  }

  function wireStorageSync(){
    if(typeof chrome!=='undefined'&&chrome.storage&&chrome.storage.onChanged){
      chrome.storage.onChanged.addListener(function(changes,area){if(area==='local'&&changes[T.KEY]&&changes[T.KEY].newValue){store=changes[T.KEY].newValue;render();}});
    }
  }

  // ── background 명령 처리 (새 폴더, 이름 바꾸기) ──────────────
  async function processPendingCommand() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      var result = await chrome.storage.local.get('tf_pending_command');
      var cmd = result && result['tf_pending_command'];
      if (!cmd) return;
      await chrome.storage.local.remove('tf_pending_command');

      if (cmd.cmd === 'new-folder') {
        goTo(cmd.parentId || store.rootId);
        setTimeout(function(){ newFolder(cmd.parentId || store.rootId); }, 150);
      } else if (cmd.cmd === 'rename-folder') {
        var n = node(cmd.folderId);
        if (!n) return;
        goTo(n.parentId || store.rootId);
        selection.clear(); selection.add(cmd.folderId);
        setTimeout(function(){ renameSelected(); }, 250);
      }
    } catch(e) {}
  }

  async function init(){
    store=(await T.load())||T.emptyStore();
    expanded[store.rootId]=true;
    wireToolbar();wireStorageSync();
    history=[store.rootId];historyPos=0;
    render();
    await processPendingCommand();
  }
  init();
})();
