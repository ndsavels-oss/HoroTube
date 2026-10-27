/* ===== ДРУЗЬЯ: QR-код, сканер камерой, список (таблицы ht_friends, см. friends.sql) ===== */
var FR={code:'',list:null,stream:null,timer:0,busy:false};
var JSQR_URL='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',JSQR_SRI='sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx';
function frErr(m){return /ht_friend|ht_add_friend|ht_my_friend|PGRST20[25]|does not exist|schema cache/i.test(m||'')?'Друзья ещё не подключены: администратору нужно выполнить friends.sql в Supabase.':rus(m);}
/* ссылка в QR: обычная камера телефона откроет сайт и сразу добавит друга */
function frLink(c){return /^https?:$/.test(location.protocol)?location.origin+location.pathname+'#friend='+c:'HT-FRIEND:'+c;}
function frParse(t){
  t=String(t||'').trim();
  var m=t.match(/friend=([A-Za-z0-9]{8})\b/)||t.match(/^HT-FRIEND:([A-Za-z0-9]{8})$/i)||t.replace(/[\s-]/g,'').match(/^([A-Za-z0-9]{8})$/);
  return m?m[1].toUpperCase():'';
}
function frMsg(t,ok){var m=$('frMsg');m.textContent=t||'';m.className=ok?'frok':'bad';}
function drawQr(text){
  var cv=$('frQr'),q=qrcode(0,'M');q.addData(text);q.make();
  var n=q.getModuleCount(),s=Math.floor(232/(n+8)),x=cv.getContext('2d');
  cv.width=cv.height=s*(n+8);
  x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.fillStyle='#000';
  for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q.isDark(r,c))x.fillRect((c+4)*s,(r+4)*s,s,s);
}
async function openFriends(){
  setMenu('p-friends');
  if(curPage()!=='p-friends')showPage('p-friends');
  frMsg('');
  if(!ME){$('frBox').style.display='none';$('frGuest').style.display='';return;}
  $('frBox').style.display='';$('frGuest').style.display='none';
  if(!FR.code){
    var r=await SB.rpc('ht_my_friend_code');
    if(r.error){frMsg(frErr(r.error.message));$('frCode').textContent='—';}
    else FR.code=r.data;
  }
  if(FR.code){$('frCode').textContent=FR.code.slice(0,4)+' '+FR.code.slice(4);drawQr(frLink(FR.code));}
  drawFriends();
}
async function loadFriends(){
  if(!SB||!ME)return [];
  var r=await SB.rpc('ht_my_friends');
  FR.list=r.error?null:r.data;
  return FR.list||[];
}
async function drawFriends(){
  var b=$('frList');
  await loadFriends();
  b.textContent='';
  if(!FR.list){b.append(el('p','empty','Список друзей появится, когда администратор подключит friends.sql.'));return;}
  $('frCnt').textContent=FR.list.length?' ('+FR.list.length+')':'';
  if(!FR.list.length){b.append(el('p','empty','Друзей пока нет. Покажи свой QR-код однокласснику или отсканируй его код.'));return;}
  FR.list.forEach(function(u){
    var d=el('div','mine dmrow');
    d.append(avatarEl(u.id,u.name||u.nick,40));
    var tx=el('div','dmtx');
    tx.append(el('b',null,dmName(u)),el('small',null,'друзья с '+new Date(u.since).toLocaleDateString(LANG==='en'?'en-GB':'ru-RU')));
    var w=el('button','tab on','💬 Написать'),x=el('button','tab','✕');
    x.title='Убрать из друзей';
    w.addEventListener('click',function(e){e.stopPropagation();openDm(u);});
    x.addEventListener('click',async function(e){
      e.stopPropagation();
      if(!confirm('Убрать '+dmName(u)+' из друзей?'))return;
      var q=await SB.rpc('ht_remove_friend',{other:u.id});
      if(q.error){alert('Не получилось: '+frErr(q.error.message));return;}
      drawFriends();
    });
    d.append(tx,w,x);
    d.addEventListener('click',function(){openDm(u);});
    b.append(d);
  });
}
async function addFriend(code){
  code=frParse(code);
  if(!code){frMsg('Код друга — 8 латинских букв и цифр, например K7MX 4QPA');return;}
  if(!ME){frSave(code);frInvite();return;}
  if(FR.busy)return;FR.busy=true;
  var r=await SB.rpc('ht_add_friend',{code:code});
  FR.busy=false;
  if(r.error){frMsg(frErr(r.error.message));return;}
  var d=r.data||{};
  if(!d.ok){frMsg(d.error||'Не получилось');return;}
  var f=d.friend;
  $('frIn').value='';
  if(d.already)frMsg(dmName(f)+' уже у тебя в друзьях',true);
  else frMsg('🤝 '+dmName(f)+' теперь твой друг!'+(d.reward?' +1 🪙':''),true);
  if(d.reward)refreshTubek();
  drawFriends();
}
/* ---------- сканер: BarcodeDetector (Android, Chrome) или jsQR (iPhone и остальные) ---------- */
var _jsqr=null;
function needJsQR(){
  if(window.jsQR)return Promise.resolve();
  if(_jsqr)return _jsqr;
  _jsqr=new Promise(function(ok,no){
    var s=document.createElement('script');s.src=JSQR_URL;s.integrity=JSQR_SRI;s.crossOrigin='anonymous';
    s.onload=ok;s.onerror=function(){_jsqr=null;no(new Error('Не удалось загрузить сканер. Проверь интернет или введи код вручную.'));};
    document.head.append(s);
  });
  return _jsqr;
}
var _bd=null;
function detector(){
  if(_bd===null){try{_bd=('BarcodeDetector' in window)?new BarcodeDetector({formats:['qr_code']}):false;}catch(e){_bd=false;}}
  return _bd;
}
async function readQr(src,w,h){
  var bd=detector();
  if(bd){try{var a=await bd.detect(src);if(a.length)return a[0].rawValue;}catch(e){}}
  if(!window.jsQR)return '';
  var c=readQr.cv||(readQr.cv=document.createElement('canvas')),k=Math.min(1,640/Math.max(w,h));
  c.width=Math.round(w*k);c.height=Math.round(h*k);
  var x=c.getContext('2d',{willReadFrequently:true});x.drawImage(src,0,0,c.width,c.height);
  var d=x.getImageData(0,0,c.width,c.height),q=jsQR(d.data,d.width,d.height,{inversionAttempts:'dontInvert'});
  return q?q.data:'';
}
function stopScan(){
  clearTimeout(FR.timer);FR.timer=0;
  if(FR.stream){FR.stream.getTracks().forEach(function(t){t.stop();});FR.stream=null;}
  var v=$('frVid');v.srcObject=null;
  $('frScan').style.display='none';
}
async function startScan(){
  frMsg('');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    frMsg(window.isSecureContext===false?'Камера работает только когда сайт открыт по https://. Нажми «🖼 Фото QR» или введи код.':'Этот браузер не даёт доступ к камере. Нажми «🖼 Фото QR» или введи код.');return;
  }
  try{if(!detector())await needJsQR();}catch(e){frMsg(e.message);return;}
  try{FR.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});}
  catch(e){frMsg(/NotAllowed|Permission/i.test(e.name+e.message)?'Нет доступа к камере. Разреши камеру в настройках браузера или введи код.':'Камера не включилась. Введи код вручную.');return;}
  var v=$('frVid');v.srcObject=FR.stream;v.setAttribute('playsinline','');v.muted=true;
  $('frScan').style.display='';
  try{await v.play();}catch(e){}
  (async function tick(){
    if(!FR.stream)return;
    if(v.readyState>=2){
      var t=await readQr(v,v.videoWidth,v.videoHeight),c=frParse(t);
      if(c){stopScan();if(navigator.vibrate)navigator.vibrate(80);addFriend(c);return;}
      if(t)frMsg('Это не код друга HoroTube');
    }
    FR.timer=setTimeout(tick,250);
  })();
}
/* фото QR-кода: запасной путь, если камеру в браузере включить нельзя */
async function scanPhoto(file){
  frMsg('');
  if(!file)return;
  try{if(!detector())await needJsQR();}catch(e){frMsg(e.message);return;}
  var im=new Image(),u=URL.createObjectURL(file);
  im.onload=async function(){
    var t=await readQr(im,im.naturalWidth,im.naturalHeight);URL.revokeObjectURL(u);
    var c=frParse(t);
    if(c)addFriend(c);else frMsg('На фото не нашёлся QR-код друга. Сфотографируй ближе и ровнее.');
  };
  im.onerror=function(){frMsg('Не удалось открыть фото');};
  im.src=u;
}
$('frScanBtn').addEventListener('click',startScan);
$('frStop').addEventListener('click',stopScan);
$('frPhoto').addEventListener('change',function(){scanPhoto(this.files[0]);this.value='';});
$('frAdd').addEventListener('click',function(){addFriend($('frIn').value);});
$('frIn').addEventListener('keydown',function(e){if(e.key==='Enter')addFriend(this.value);});
$('frNew').addEventListener('click',async function(){
  if(!confirm('Сделать новый код? Старый QR-код перестанет работать. Друзья, которые уже добавлены, останутся.'))return;
  var r=await SB.rpc('ht_my_friend_code',{renew:true});
  if(r.error){frMsg(frErr(r.error.message));return;}
  FR.code=r.data;openFriends();
});
$('frShare').addEventListener('click',async function(){
  if(!FR.code)return;
  var link=frLink(FR.code),txt='Добавь меня в друзья на HoroTube: код '+FR.code;
  if(navigator.share&&/^https?:$/.test(location.protocol)){try{await navigator.share({title:'HoroTube',text:txt,url:link});return;}catch(e){if(e.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(link);frMsg('Ссылка скопирована. Отправь её другу.',true);}
  catch(e){prompt('Скопируй ссылку и отправь другу:',link);}
});
$('frLogin').addEventListener('click',function(){openAuth(false);});
/* ссылка #friend=КОД: запомнить и добавить после входа */
/* код из QR хранится сутки: можно спокойно зарегистрироваться, даже если закрыл вкладку */
function frSave(c){try{localStorage.setItem('h_friend',JSON.stringify({c:c,t:Date.now()}));}catch(e){}}
function frGet(){try{var x=JSON.parse(localStorage.getItem('h_friend')||'null');if(x&&Date.now()-x.t<864e5)return frParse(x.c);}catch(e){}return '';}
function frClear(){try{localStorage.removeItem('h_friend');}catch(e){}}
/* без аккаунта: сразу регистрация, после неё вы друзья */
function frInvite(){
  openAuth(true);
  var p=$('aInv');p.textContent='🤝 Тебя пригласили в друзья! Зарегистрируйся, и вы сразу станете друзьями (+1 🪙 обоим). Уже есть аккаунт? Нажми «Войти».';p.style.display='';
}
function frFromHash(){
  var c=frParse((location.hash.match(/friend=[A-Za-z0-9]{8}/)||[''])[0]);
  if(!c)return;
  frSave(c);
  history.replaceState(null,'',location.pathname+location.search);
  if(ME)frPending();else if(window._booted)frInvite();
}
function frPending(){
  var c=frGet();
  if(!c||!ME)return;
  frClear();$('aInv').style.display='none';
  openFriends().then(function(){addFriend(c);});
}
window.addEventListener('hashchange',frFromHash);
frFromHash();

/* ---------- «Поделиться» видео: выбрать друга и сразу перейти в чат ---------- */
var VTAG=/\s*\[видео:(\d+)\]\s*$/;
function shareBody(v){
  var t=String(v.title||'').trim().slice(0,80);
  if(!t||isBad(t)||hasContact(t))t='Видео';
  return '📺 «'+t+'» [видео:'+v.id+']';
}
async function openShare(){
  if(!ME){openAuth(false);return;}
  var v=curV;if(!v)return;
  if(v.status&&v.status!=='approved'){alert('Поделиться можно только видео, которое прошло проверку');return;}
  $('shm').classList.add('show');$('shMsg').textContent='';$('shQ').value='';
  var b=$('shList');b.textContent='';b.append(el('p','empty','Загружаю…'));
  var r=await Promise.all([loadFriends(),SB.rpc('ht_dm_threads')]),seen={},ppl=[];
  r[0].forEach(function(u){seen[u.id]=1;ppl.push({u:u,f:1});});
  ((r[1]&&r[1].data)||[]).forEach(function(t){if(!seen[t.partner_id]&&!t.blocked){seen[t.partner_id]=1;ppl.push({u:{id:t.partner_id,nick:t.nick,name:t.name,role:t.role}});}});
  shDraw(ppl);
}
function shDraw(ppl,empty){
  var b=$('shList');b.textContent='';
  if(!ppl.length)b.append(el('p','empty',empty||'Пока некому отправить. Добавь друзей по QR-коду или найди человека по нику.'));
  ppl.forEach(function(x){
    var d=el('div','mine dmrow');
    d.append(avatarEl(x.u.id,x.u.name||x.u.nick,36),el('b','dmtx',(x.f?'🤝 ':'')+dmName(x.u)));
    d.addEventListener('click',function(){shSend(x.u,d);});
    b.append(d);
  });
}
async function shSend(u,d){
  var v=curV;if(!v||d.dataset.busy)return;
  d.dataset.busy='1';
  var q=await SB.from('ht_dm').insert({recipient_id:u.id,body:shareBody(v)});
  delete d.dataset.busy;
  if(q.error){$('shMsg').textContent=dmErr(q.error.message);return;}
  $('shm').classList.remove('show');
  openDm(u);
}
async function shFind(){
  var t=$('shQ').value.trim();
  if(t.length<2){openShare();return;}
  var f=await SB.rpc('ht_find_users',{q:t});
  if(f.error){$('shMsg').textContent=dmErr(f.error.message);return;}
  shDraw(f.data.map(function(u){return {u:u};}),'Никого не нашли');
}
$('wShare').addEventListener('click',openShare);
$('shX').addEventListener('click',function(){$('shm').classList.remove('show');});
$('shGo').addEventListener('click',shFind);
$('shQ').addEventListener('keydown',function(e){if(e.key==='Enter')shFind();});
/* открыть видео из сообщения */
async function openVideoById(id){
  id=+id;
  var v=VIDEOS.concat(SHORTS).filter(function(x){return x.id===id;})[0];
  if(!v){var q=await SB.from('videos').select('*').eq('id',id).maybeSingle();v=q.data;}
  if(!v||v.status!=='approved'){alert('Это видео удалено или ещё не прошло проверку');return;}
  openWatch(v);
}
