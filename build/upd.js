/* ===== Обновления: новая версия сайта выпускается прямо из HoroTube, без вставки кода на хостинг.
   На хостинге лежит маленький загрузчик (index.html), он открывает самую новую версию из Supabase.
   Выпускать и отзывать версии может только админ (проверка на сервере, updates.sql). ===== */
var HT_VERSION='/*HT_VERSION*/',HT_NOTES=/*HT_NOTES*/'';
var UPD={list:null,top:null,has:false};
function updCmp(a,b){var x=String(a).split(/\D+/).map(Number),y=String(b).split(/\D+/).map(Number);for(var i=0;i<Math.max(x.length,y.length);i++){var d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1;}return 0;}
function updUrl(p){return SB_URL+'/storage/v1/object/public/ht_releases/'+encodeURIComponent(p);}
async function updCheck(){
  if(!SB)return;
  if(typeof uappsCheck==='function')uappsCheck().catch(function(){});
  var r=await SB.from('ht_releases').select('id,version,notes,created_at,revoked,path,size_bytes').order('id',{ascending:false}).limit(30);
  if(r.error){UPD.err=r.error.message;return;}
  UPD.err=null;UPD.list=r.data||[];UPD.top=UPD.list.filter(function(x){return !x.revoked;})[0]||null;
  var had=UPD.has;UPD.has=!!UPD.top&&updCmp(UPD.top.version,HT_VERSION)>0;
  if(UPD.has!==had){if(typeof drawDock==='function')drawDock();if(pageOn('p-home'))drawHome(true);}
  if(UPD.has){var seen=null;try{seen=localStorage.getItem('h_upd_seen');}catch(e){}
    if(seen!==UPD.top.version){try{localStorage.setItem('h_upd_seen',UPD.top.version);}catch(e){}osToast(Lx('🔄 Вышло обновление HoroTube ','🔄 HoroTube update available ')+UPD.top.version);}}
  /* открыта версия из памяти устройства, а админ её отозвал: в следующий раз откроется прежняя */
  if(window.HT_LOADER&&HT_LOADER.self){var cur=UPD.list.filter(function(x){return x.version===HT_VERSION;})[0];
    if(cur&&cur.revoked){try{localStorage.removeItem('ht_rel_cache');}catch(e){}osToast(Lx('Эта версия отозвана. Перезапусти HoroTube, откроется прежняя.','This version was withdrawn. Restart HoroTube to go back.'));}}
  if(pageOn('p-upd'))drawUpd();
}
var _updBadge=appBadge;
appBadge=function(id){return id==='upd'?(UPD.has?1:0):_updBadge(id);};
/* скачать версию из базы и сохранить на устройстве: при следующем запуске её откроет boot.js (или загрузчик) */
async function updDownload(x){
  try{
    var r=await fetch(updUrl(x.path),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
    var h=await r.text();if(h.indexOf('<html')<0||h.indexOf('HT_VERSION')<0)throw new Error(Lx('файл повреждён','file is damaged'));
    localStorage.setItem('ht_rel_cache',JSON.stringify({v:x.version,h:h}));localStorage.removeItem('ht_boot');
    return true;
  }catch(e){
    osToast(Lx('Не получилось скачать обновление: ','Could not download the update: ')+(e&&e.name==='QuotaExceededError'?Lx('мало места на устройстве','not enough space on the device'):(e.message||e)));
    return false;
  }
}
function updInit(){try{localStorage.removeItem('ht_boot');}catch(e){}updCheck();setInterval(updCheck,15*60*1000);setTimeout(function(){if(typeof uappsCheck==='function')uappsCheck(true).catch(function(){});},6000);}
function openUpd(){
  var p=$('p-upd');
  if(!p){p=el('section','main page osapp');p.id='p-upd';p.append(el('div','upd'));var host=$('p-uapp');host.parentNode.insertBefore(p,host.nextSibling);}
  showPage('p-upd');OS.app='upd';osRecent('upd');osBar();
  drawUpd();updCheck();
}
function updDate(s){try{return new Date(s).toLocaleDateString(dloc(),{day:'numeric',month:'long',year:'numeric'});}catch(e){return '';}}
function drawUpd(){
  var w=document.querySelector('#p-upd .upd');if(!w)return;w.textContent='';
  var hero=el('div','updhero'),ic=appIcon(appById('upd'),76);ic.classList.add(UPD.has?'updspin':'updok');
  var tx=el('div','updtx');tx.append(el('h2',null,'HoroTube '+HT_VERSION));
  if(UPD.err)tx.append(el('p','mut',Lx('Не удалось проверить обновления: ','Could not check for updates: ')+UPD.err));
  else if(!UPD.list)tx.append(el('p','mut',Lx('Проверяю обновления…','Checking for updates…')));
  else if(UPD.has){
    tx.append(el('p','updnew',Lx('Доступна версия ','Version ')+UPD.top.version+Lx('',' is available')));
    var b=el('button','updbtn',Lx('Обновить','Update'));
    b.onclick=async function(){b.disabled=true;b.textContent=Lx('Скачиваю…','Downloading…');
      var ok=(window.HT_LOADER&&!HT_LOADER.self)?true:await updDownload(UPD.top);
      if(!ok){b.disabled=false;b.textContent=Lx('Обновить','Update');return;}
      b.textContent=Lx('Обновляю…','Updating…');document.documentElement.classList.add('updgo');setTimeout(function(){location.reload();},700);};
    tx.append(b,el('p','mut updhint',Lx('Новая версия скачается из базы и сохранится на этом устройстве.','The new version is downloaded from the database and kept on this device.')));
  }else tx.append(el('p','updok2','✓ '+Lx('У тебя последняя версия','You are up to date')));
  hero.append(ic,tx);w.append(hero);
  if(ME&&ME.role==='admin')w.append(updAdminCard());
  var L2=(UPD.list||[]);
  if(L2.length){w.append(el('h3','updh',Lx('История версий','Version history')));
    L2.forEach(function(x){var c=el('div','updrel'+(x.revoked?' off':''));var h=el('div','updrh');h.append(el('b',null,x.version),el('span','mut',updDate(x.created_at)));
      if(x.version===HT_VERSION)h.append(el('em','updtag',Lx('сейчас у тебя','current')));
      if(x.revoked)h.append(el('em','updtag red',Lx('отозвана','withdrawn')));
      c.append(h);if(x.notes)c.append(el('p','updnotes',x.notes));
      if(ME&&ME.role==='admin'){var rb=el('button','updmini',x.revoked?Lx('Вернуть','Restore'):Lx('Отозвать','Withdraw'));
        rb.onclick=async function(){rb.disabled=true;var r=await SB.rpc('ht_revoke_release',{p_id:x.id,p_revoked:!x.revoked});if(r.error)osToast(r.error.message);await updCheck();};c.append(rb);}
      w.append(c);});}
  else if(UPD.list)w.append(el('p','mut updempty',Lx('Пока не выпущено ни одной версии.','No versions have been released yet.')));
}
function updAdminCard(){
  var c=el('div','updadm');c.append(el('h3',null,'🛠 '+Lx('Выпустить обновление','Release an update')));
  c.append(el('p','mut',Lx('Выбери новый файл HoroTube.html. Все, кто открыл сайт через загрузчик, получат его по кнопке «Обновить».','Pick the new HoroTube.html. Everyone who opens the site through the loader gets it with the Update button.')));
  var f=el('input');f.type='file';f.accept='.html,text/html';
  var ver=el('input','updin');ver.placeholder=Lx('Версия, например 2026.10.25','Version, e.g. 2026.10.25');
  var notes=el('textarea','updin');notes.rows=4;notes.placeholder=Lx('Что нового (увидят все)','What is new (everyone will see it)');
  var go=el('button','updbtn',Lx('Выпустить','Release'));go.disabled=true;var msg=el('p','mut');var txt=null;
  f.onchange=function(){var file=f.files[0];txt=null;go.disabled=true;msg.textContent='';if(!file)return;
    if(file.size>15*1024*1024){msg.textContent=Lx('Файл больше 15 МБ','File is larger than 15 MB');return;}
    file.text().then(function(t){
      if(t.indexOf('<html')<0||t.indexOf('HT_VERSION')<0||t.indexOf('createClient(')<0){msg.textContent=Lx('Это не файл HoroTube','This is not a HoroTube file');return;}
      var m=/var HT_VERSION='([0-9A-Za-z._-]{1,32})'/.exec(t);if(m)ver.value=m[1];
      var n=/HT_NOTES=("(?:[^"\\]|\\.)*")/.exec(t);if(n&&!notes.value){try{notes.value=JSON.parse(n[1]);}catch(e){}}
      txt=t;go.disabled=false;msg.textContent=Lx('Файл готов: ','File ready: ')+Math.round(file.size/1024)+' KB';});};
  /* быстрый путь: выпустить ту версию, что сейчас лежит на сайте (GitHub Pages), без выбора файла */
  var site=el('div','updsite');c.insertBefore(site,c.children[1]);
  if(location.protocol.indexOf('http')===0)fetch(location.pathname,{cache:'no-store'}).then(function(r){return r.ok?r.text():'';}).then(function(t){
    var m=/var HT_VERSION='([0-9A-Za-z._-]{1,32})'/.exec(t||'');if(!m||t.indexOf('createClient(')<0)return;
    var sv=m[1];
    if((UPD.list||[]).some(function(x){return x.version===sv;})){site.append(el('p','updok2','✓ '+Lx('Версия с сайта ','Site version ')+sv+Lx(' уже выпущена',' is already released')));return;}
    var n=/HT_NOTES=("(?:[^"\\]|\\.)*")/.exec(t),nt='';if(n){try{nt=JSON.parse(n[1]);}catch(e){}}
    var sb=el('button','updbtn','🚀 '+Lx('Выпустить версию с сайта ','Release site version ')+sv);
    site.append(sb,el('p','mut',Lx('Одно нажатие: версия появится в «Обновлениях» у всех. Ниже — выбор файла вручную.','One tap: everyone sees it in Updates. Below: pick a file by hand.')));
    sb.onclick=async function(){txt=t;ver.value=sv;if(!notes.value)notes.value=nt;sb.disabled=true;await go.onclick();sb.disabled=false;};
  }).catch(function(){});
  go.onclick=async function(){
    var v=ver.value.trim();if(!/^[0-9A-Za-z._-]{1,32}$/.test(v)){msg.textContent=Lx('Версия: только цифры, буквы, точка, - и _','Version: digits, letters, dot, - and _ only');return;}
    if((UPD.list||[]).some(function(x){return x.version===v;})){msg.textContent=Lx('Такая версия уже есть','This version already exists');return;}
    go.disabled=true;msg.textContent=Lx('Загружаю файл…','Uploading…');
    var path=v.replace(/[^0-9A-Za-z._-]/g,'')+'-'+Date.now().toString(36)+'.html';
    var up=await SB.storage.from('ht_releases').upload(path,new Blob([txt],{type:'text/plain'}),{contentType:'text/plain',upsert:false});
    if(up.error){msg.textContent=up.error.message;go.disabled=false;return;}
    var r=await SB.rpc('ht_publish_release',{p_version:v,p_notes:notes.value.trim(),p_path:path,p_size:new Blob([txt]).size});
    if(r.error||!r.data){msg.textContent=r.error?r.error.message:Lx('Нет прав админа','Not an admin');SB.storage.from('ht_releases').remove([path]);go.disabled=false;return;}
    msg.textContent='';osToast('🚀 '+Lx('Версия ','Version ')+v+Lx(' выпущена',' released'));if(typeof payConfetti==='function')payConfetti(document.body);
    f.value='';notes.value='';ver.value='';txt=null;await updCheck();};
  c.append(f,ver,notes,go,msg);return c;
}
ICO.upd='<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4"/><path d="M12 8.5v4l2.5 1.5"/>';
(function(){var a={id:'upd',core:1,bg:'linear-gradient(160deg,#5AC8FA,#0040DD)',page:'p-upd',open:function(){openUpd();}};
  Object.defineProperty(a,'t',{get:function(){return Lx('Обновления','Updates');},enumerable:true});
  Object.defineProperty(a,'d',{get:function(){return Lx('Новые версии HoroTube одной кнопкой','New HoroTube versions with one tap');},enumerable:true});
  var at=APPS.findIndex(function(x){return x.id==='store';});APPS.splice(at<0?APPS.length:at+1,0,a);})();
