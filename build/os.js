/* ===== HoroOS: сайт как iPad — домашний экран, док, приложения на весь экран,
   два приложения рядом (Split View) и переключатель приложений ===== */
var OS={app:null,toSide:false,side:null,recent:[]};
try{OS.recent=JSON.parse(localStorage.getItem('h_recent')||'[]');}catch(e){}
/* у каждого приложения свой значок: белый рисунок на цветном фоне */
var ICS='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',ICE='</svg>';
var ICO={
  shorts:'<path d="M13 2 5 13.5h6L10 22l9-12h-6z" fill="#fff" stroke="none"/>',
  chans:'<rect x="3" y="7" width="18" height="13" rx="3"/><path d="m8 3 4 4 4-4"/><path d="M10.5 11v5l4-2.5z" fill="#fff"/>',
  lessons:'<path d="M2 9.5 12 5l10 4.5-10 4.5z" fill="#fff"/><path d="M6 11.5V16c3 2.5 9 2.5 12 0v-4.5M21 10v5"/>',
  creative:'<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.6-1.4.4-2.8 1.9-2.8H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.3" fill="#fff"/><circle cx="10" cy="7" r="1.3" fill="#fff"/><circle cx="15" cy="7.5" r="1.3" fill="#fff"/>',
  arcade:'<path d="M7 7h10a5 5 0 0 1 4.8 6.4l-1 3.3a2.6 2.6 0 0 1-4.4 1L15 16H9l-1.4 1.7a2.6 2.6 0 0 1-4.4-1l-1-3.3A5 5 0 0 1 7 7z"/><path d="M8 10v4M6 12h4"/><circle cx="16" cy="11" r="1" fill="#fff"/><circle cx="17.5" cy="13.5" r="1" fill="#fff"/>',
  g_mult:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8.5 8.5 7 7m0-7-7 7"/>',
  g_words:'<path d="M4 4h16v12H10l-5 4v-4H4z"/><path d="m7.5 13 2.5-6 2.5 6m-4-2h3M15 9.5v3.5m0-2a1.6 1.6 0 1 1 0 .1"/>',
  g_mem:'<rect x="3" y="5" width="10" height="14" rx="2" transform="rotate(-10 8 12)"/><rect x="11" y="5" width="10" height="14" rx="2" transform="rotate(8 16 12)" fill="#fff" fill-opacity=".25"/><path d="M15.5 10.5l1.5 2 -1.5 2-1.5-2z" fill="#fff"/>',
  g_geo:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  g_dash:'<rect x="10" y="7" width="10" height="10" rx="1.5" fill="#fff"/><path d="M2 9h5M4 12h4M2 15h5"/><rect x="13" y="10" width="4" height="4" fill="none" stroke="#7B5CFA"/>',
  g_chess:'<path d="M8 20h9M9 17h7l-.5-4c2-1.5 2-4 0-6l-2.5-2-1 2-3 1.5c-1 .6-1.3 1.8-.6 2.6l.6.5 2.5-.6-2.5 3z" fill="#fff"/>',
  msg:'<path d="M12 3.5c5 0 9 3.4 9 7.6s-4 7.6-9 7.6c-.9 0-1.8-.1-2.6-.3L5 20.5l.9-3.6C4.1 15.5 3 13.4 3 11.1 3 6.9 7 3.5 12 3.5z" fill="#fff" stroke="none"/>',
  friends:'<circle cx="9" cy="8" r="3.2" fill="#fff"/><path d="M3 19c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5z" fill="#fff"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15 13.6c3 .1 5.3 2 5.8 5.4h-3.3"/>',
  edit:'<rect x="3" y="8" width="18" height="12" rx="2"/><path d="m3 8 2.5-4.5 4 0L7 8m4.5 0L14 3.5h4L15.5 8"/><path d="M10 11.5v5l4.5-2.5z" fill="#fff"/>',
  portfolio:'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.2" fill="#fff"/><path d="M5.5 16.5c.6-1.8 2-2.6 3.5-2.6s2.9.8 3.5 2.6M14.5 10h3.5M14.5 13.5h3.5"/>',
  mine:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10.5 11v5l4-2.5z" fill="#fff"/>',
  prem:'<path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6L12 16.8l-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z" fill="#fff" stroke="none"/>',
  settings:'<circle cx="12" cy="12" r="6.6" stroke-width="3.6" stroke-dasharray="2.6 2.6" stroke-linecap="butt"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2.2"/>',
  store:'<path d="M9.5 4.5 15 14M14.5 4.5 7.5 17M5 14h11M17.5 14H19M6 19.5l-1 1.5M18 17l1.5 2.5" stroke-width="2.3"/>',
  code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  mail:'<rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="#fff" stroke="none"/><path d="m4 7 8 6 8-6" stroke="#1F6FFF"/>',
  search:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path d="M8 9.5a2.8 2.8 0 0 1 2.5-1.7" stroke-width="1.5"/>',
  notes:'<path d="M5 3h14v18H5z" fill="#fff" stroke="none"/><path d="M5 7.5h14" stroke="#E0A800" stroke-width="2.5"/><path d="M8 12h8M8 15h8M8 18h5" stroke="#B9B9B9" stroke-width="1.4"/>',
  calc:'<rect x="5" y="3" width="14" height="18" rx="3"/><rect x="8" y="6" width="8" height="3" rx="1" fill="#fff"/><circle cx="9" cy="13" r=".9" fill="#fff"/><circle cx="12" cy="13" r=".9" fill="#fff"/><circle cx="15" cy="13" r=".9" fill="#FF9F0A" stroke="#FF9F0A"/><circle cx="9" cy="17" r=".9" fill="#fff"/><circle cx="12" cy="17" r=".9" fill="#fff"/><circle cx="15" cy="17" r=".9" fill="#FF9F0A" stroke="#FF9F0A"/>',
  paint:'<path d="M19.5 3.5c-3 1.5-7.5 6-9 8.5l1.5 1.5c2.5-1.5 7-6 8.5-9z" fill="#fff"/><path d="M10 13c-2 0-3.5 1.4-3.5 3.3 0 1.2-.8 2-2 2.2 1 1.3 2.5 2 4 2 2.3 0 4-1.7 4-4z" fill="#fff"/>',
  weather:'<circle cx="9" cy="9" r="3.5" fill="#FFD60A" stroke="#FFD60A"/><path d="M9 2.5v1.3M3.7 4.7l.9.9M2.5 9h1.3M14.3 4.7l-.9.9" stroke="#FFD60A"/><path d="M8 20h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 8 20z" fill="#fff" stroke="none"/>',
  piano:'<rect x="3" y="5" width="18" height="14" rx="2" fill="#fff" stroke="none"/><path d="M7.5 5v14M12 5v14M16.5 5v14" stroke="#333" stroke-width="1"/><rect x="6" y="5" width="3" height="8" fill="#222" stroke="none"/><rect x="10.5" y="5" width="3" height="8" fill="#222" stroke="none"/><rect x="15" y="5" width="3" height="8" fill="#222" stroke="none"/>',
  admin:'<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z" fill="#fff" fill-opacity=".2"/><circle cx="12" cy="10.5" r="2.4"/><path d="M12 13v4.5M12 15.5h2"/>'
};
function gameOpen(p){return function(){if(typeof canPlay==='function'&&!canPlay()){osToast(Lx('Игры открываются с тарифом «Игры» или Премиумом','Games unlock with the Games plan or Premium'));openApp('prem');return;}var g=document.querySelector('#games .game[data-game="'+p+'"]');if(g)g.click();};}
var APPS=[
  {id:'video',t:'HoroTube',bg:'linear-gradient(160deg,#ffffff,#e8f1ff)',page:'p-feed',mode:'all',core:1,logo:1,d:'Видео, шортс, каналы, уроки и творчество учеников'},
  {id:'msg',t:'HoroChat',core:1,d:'Личные сообщения, друзья и каналы',bg:'linear-gradient(160deg,#5BF675,#0CBD2A)',page:'p-msg',split:1},
  {id:'mail',t:'Почта',core:1,d:'Письма учителям и администрации',bg:'linear-gradient(160deg,#4FC3FF,#1F6FFF)',page:'p-mail',split:1,open:function(){openMail();}},
  {id:'friends',t:'Друзья',d:'Друзья по QR-коду, +1 🪙 за каждого',bg:'linear-gradient(160deg,#FFD60A,#FF9F0A)',page:'p-friends',split:1,open:function(){openFriends();}},
  {id:'search',t:'Horo Поиск',core:1,d:'Поиск по Википедии: статьи, картинки, факты',bg:'#fff',page:'p-search',split:1,open:function(){openSearch();},hg:1},
  {id:'gallery',t:'Фото',d:'Твои фото и видео: альбомы, избранное, фильтры',bg:'#fff',page:'p-gallery',split:1,open:function(){openGallery();}},
  {id:'edit',t:'Видеостудия',d:'Монтаж: склей ролики, обрежь, добавь текст и фильтр',bg:'linear-gradient(160deg,#4B4B55,#16161C)',page:'p-edit',open:function(){openEditor();}},
  {id:'portfolio',t:'Портфолио',d:'Портфолио: увлечения, навыки, достижения',bg:'linear-gradient(160deg,#64D2FF,#5E5CE6)',page:'p-portfolio',split:1,open:function(){var u=OS.pfUid||(ME&&ME.id);OS.pfUid=null;openPortfolio(u);}},
  {id:'cal',t:'Календарь',d:'Своё расписание и напоминания',bg:'#fff',page:'p-cal',split:1,open:function(){openCal();},cal:1},
  {id:'clock',t:'Часы',d:'Таймер, секундомер и будильник',bg:'#111',page:'p-clock',split:1,open:function(){openClock();},clock:1},
  {id:'code',t:'Студия кода',d:'Пиши свои приложения и отправляй их в HoroStore',bg:'linear-gradient(160deg,#2B2D42,#0D0E1A)',page:'p-code',open:function(){openCode();}},
  {id:'arcade',t:'Игровой центр',d:'Tubek, тарифы и лучшие игроки',bg:'linear-gradient(160deg,#7B5CFA,#3A1C9E)',page:'p-arcade'},
  {id:'g_chess',t:'Шахматы',d:'С компьютером, обучение и онлайн',bg:'linear-gradient(160deg,#C8A27A,#6B4A2B)',page:'p-chess',open:gameOpen('p-chess'),game:1},
  {id:'g_dash',t:'Cube Run',d:'Прыгай через шипы, как в Geometry Dash',bg:'linear-gradient(160deg,#9D7BFF,#4A2FD0)',page:'p-dash',open:gameOpen('p-dash'),game:1},
  {id:'g_mult',t:'Умножение',d:'Таблица умножения на скорость',bg:'linear-gradient(160deg,#FF6B6B,#C81D4E)',page:'p-mult',open:gameOpen('p-mult'),game:1},
  {id:'g_words',t:'Word Quest',d:'Английские слова',bg:'linear-gradient(160deg,#20C997,#087F5B)',page:'p-words',open:gameOpen('p-words'),game:1},
  {id:'g_mem',t:'Мемори',d:'Найди пары слов',bg:'linear-gradient(160deg,#FFA94D,#E8590C)',page:'p-mem',open:gameOpen('p-mem'),game:1},
  {id:'g_geo',t:'География',d:'Найди страну на карте',bg:'linear-gradient(160deg,#4DABF7,#1864AB)',page:'p-geo',open:gameOpen('p-geo'),game:1},
  {id:'prem',t:'Премиум',d:'Тарифы за Tubek',bg:'linear-gradient(160deg,#FFE259,#FFA751)',page:'p-prem',open:function(){openPrem();}},
  {id:'settings',t:'Настройки',core:1,d:'Обои, тема, стекло, язык и профиль',bg:'linear-gradient(160deg,#C7C7CC,#8E8E93)',page:'p-settings',split:1,open:function(){openSettings();}},
  {id:'store',t:'HoroStore',core:1,d:'Магазин приложений',bg:'linear-gradient(160deg,#1AC8FC,#1F6FFF)',page:'p-store',open:function(){openStore();}},
  {id:'notes',t:'Заметки',d:'Заметки и списки дел',bg:'linear-gradient(160deg,#FFF6C8,#FFD84D)',page:'p-notes',split:1,store:1,open:function(){openNotes();}},
  {id:'calc',t:'Калькулятор',d:'Калькулятор как на iPhone',bg:'linear-gradient(160deg,#3A3A3C,#000)',page:'p-calc',split:1,store:1,open:function(){openCalc();}},
  {id:'paint',t:'Скетч',d:'Рисуй пальцем и сохраняй в Фото',bg:'linear-gradient(160deg,#FF9F0A,#FF375F)',page:'p-paint',store:1,open:function(){openPaint();}},
  {id:'weather',t:'Погода',d:'Погода сейчас и на неделю',bg:'linear-gradient(160deg,#5AC8FA,#1C64F2)',page:'p-weather',split:1,store:1,open:function(){openWeather();}},
  {id:'piano',t:'Пианино',d:'Играй мелодии на клавишах',bg:'linear-gradient(160deg,#2C2C2E,#000)',page:'p-piano',store:1,open:function(){openPiano();}},
  {id:'admin',t:'Админ-центр',core:1,d:'Админ: модерация, пользователи, переписки, HoroStore',bg:'linear-gradient(160deg,#FF453A,#9B1C1C)',page:'p-admin',admin:1,open:function(){OS.ytadm=false;ytAdmMark();var s=document.querySelector('.side a[data-page="p-admin"]');if(s)s.click();}}
];
APPS.forEach(function(a){a.d=a.d||'';});
var DOCK=['video','msg','search','gallery','cal','store'];
/* что стоит на домашнем экране: остальное ставится из HoroStore */
var INST_DEF=['video','msg','mail','friends','search','gallery','edit','portfolio','cal','clock','code','arcade','g_chess','g_dash','g_mult','g_words','g_mem','g_geo','prem','settings','store','admin'];
try{OS.inst=JSON.parse(localStorage.getItem('h_apps')||'null');}catch(e){}
if(!Array.isArray(OS.inst))OS.inst=INST_DEF.slice();
/* приложения учеников из HoroStore, которые стоят у меня: {id:{name,icon,color,code}} */
var UCOL={blue:'linear-gradient(160deg,#5AC8FA,#007AFF)',purple:'linear-gradient(160deg,#BF5AF2,#5E2CA5)',pink:'linear-gradient(160deg,#FF9AD5,#FF2D78)',green:'linear-gradient(160deg,#5BF675,#0A8F3C)',orange:'linear-gradient(160deg,#FFB347,#FF6A00)',red:'linear-gradient(160deg,#FF6B6B,#C81D1D)',dark:'linear-gradient(160deg,#4B4B55,#16161C)',teal:'linear-gradient(160deg,#64E3D2,#0A8F84)'};
try{OS.uapps=JSON.parse(localStorage.getItem('h_uapps')||'{}')||{};}catch(e){OS.uapps={};}
function uappEntry(id,x){return {id:'u'+id,uid:id,t:x.name,i:x.icon||'✨',bg:UCOL[x.color]||UCOL.blue,page:'p-uapp',d:x.description||'',user:1,open:function(){runUserApp(id);}};}
function uappsSync(){
  APPS=APPS.filter(function(a){return !a.user;});
  Object.keys(OS.uapps).forEach(function(id){APPS.splice(APPS.length-1,0,uappEntry(id,OS.uapps[id]));});
}
function uappsSave(){try{localStorage.setItem(osKey('h_uapps'),JSON.stringify(OS.uapps));}catch(e){alert('Не хватает места на устройстве для приложения');}uappsSync();}
uappsSync();
function appInstalled(a){return a.core||a.user||(OS.inst.indexOf(a.id)>=0&&(typeof appOwned!=='function'||appOwned(a)));}
function setInstalled(id,on){
  OS.inst=OS.inst.filter(function(x){return x!==id;});if(on)OS.inst.push(id);
  try{localStorage.setItem(osKey('h_apps'),JSON.stringify(OS.inst));}catch(e){}
}
/* набор приложений, загруженные приложения и раскладка домашнего экрана — свои у каждого аккаунта,
   даже если на одном устройстве входят разные ученики. Без своего ключа берём общий (как было до 25.10.6) */
function osKey(k){return k+(window.ME&&ME.id?'_'+ME.id:'');}
function osLoadUser(){
  function get(k){try{var v=localStorage.getItem(osKey(k));return v!=null?v:localStorage.getItem(k);}catch(e){return null;}}
  try{OS.inst=JSON.parse(get('h_apps')||'null');}catch(e){OS.inst=null;}
  if(!Array.isArray(OS.inst))OS.inst=INST_DEF.slice();
  try{OS.uapps=JSON.parse(get('h_uapps')||'{}')||{};}catch(e){OS.uapps={};}
  try{OS.layout=JSON.parse(get('h_layout')||'null');}catch(e){OS.layout=null;}
  try{OS.recent=JSON.parse(get('h_recent')||'[]')||[];}catch(e){OS.recent=[];}
  uappsSync();
}
/* к какому приложению относится страница (например, просмотр видео — «Видео») */
var PAGE_APP={'p-feed':'video','p-watch':'video','p-chan':'video','p-chans':'video','p-shorts':'video','p-mine':'video'};
var VAPPS=['p-feed','p-shorts','p-chans','p-chan','p-watch','p-mine'];/* в этих приложениях наверху поиск */
function appById(id){return APPS.filter(function(a){return a.id===id;})[0];}
function appVisible(a){return (!a.admin||(ME&&ME.role==='admin'))&&appInstalled(a);}
function pageOn(id){var p=$(id);return !!p&&p.classList.contains('show');}
/* значок приложения; у Календаря — сегодняшнее число, у Часов — настоящие часы */
function appIcon(a,size){
  var d=el('div','aicon');d.style.background=a.bg;if(size)d.style.setProperty('--s',size+'px');
  if(a.cal){var n=new Date();d.classList.add('acal');d.append(el('small',null,n.toLocaleDateString(LANG==='en'?'en-GB':'ru-RU',{weekday:'short'})),el('b',null,String(n.getDate())));}
  else if(a.clock){d.classList.add('aclock');var f=el('i','face');f.append(el('i','hh'),el('i','mm'),el('i','ss'));d.append(f);}
  else if(a.logo){d.classList.add('alogo');d.innerHTML='<svg viewBox="0 0 40 40"><rect x="5" y="3" width="8" height="34" rx="3" fill="#004aad"/><rect x="27" y="3" width="8" height="34" rx="3" fill="#004aad"/><rect x="11" y="16" width="18" height="8" fill="#38b6ff"/><polygon points="16,12 27,20 16,28" fill="#fff"/><ellipse cx="20" cy="22" rx="18" ry="7" fill="none" stroke="#38b6ff" stroke-width="2.2" transform="rotate(-20 20 22)"/></svg>';}
  else if(a.id==='gallery'){d.classList.add('agal');var p='';['#FF9F0A','#FFD60A','#34C759','#00C7BE','#007AFF','#5E5CE6','#BF5AF2','#FF375F'].forEach(function(c,k){p+='<ellipse cx="20" cy="11" rx="4.6" ry="8" fill="'+c+'" fill-opacity=".82" transform="rotate('+(k*45)+' 20 20)"/>';});d.innerHTML='<svg viewBox="0 0 40 40">'+p+'</svg>';}
  else if(a.hg){d.classList.add('ahg');d.innerHTML='<svg viewBox="0 0 40 40"><text x="20" y="28" text-anchor="middle" font-size="24" font-weight="800" font-family="Manrope,Arial,sans-serif"><tspan fill="#4285F4">H</tspan><tspan fill="#EA4335" font-size="18">o</tspan></text><path d="M8 33h24" stroke="#FBBC05" stroke-width="2.5" stroke-linecap="round"/><path d="M8 33h9" stroke="#34A853" stroke-width="2.5" stroke-linecap="round"/></svg>';}
  else if(ICO[a.id])d.innerHTML=ICS+ICO[a.id]+ICE;
  else d.append(el('span',null,a.i||'✨'));
  return d;
}
function clockTick(){
  var n=new Date(),h=n.getHours()%12,m=n.getMinutes(),s=n.getSeconds();
  document.querySelectorAll('.aclock').forEach(function(c){
    c.querySelector('.hh').style.transform='rotate('+(h*30+m/2)+'deg)';
    c.querySelector('.mm').style.transform='rotate('+(m*6)+'deg)';
    c.querySelector('.ss').style.transform='rotate('+(s*6)+'deg)';
  });
  var t=$('hsTime');if(t){t.textContent=n.toLocaleTimeString(LANG==='en'?'en-GB':'ru-RU',{hour:'2-digit',minute:'2-digit'});var ds=n.toLocaleDateString(LANG==='en'?'en-GB':'ru-RU',{weekday:'long',day:'numeric',month:'long'});$('hsDate').textContent=ds.charAt(0).toUpperCase()+ds.slice(1);}
}
setInterval(clockTick,1000);
/* ---------- открыть приложение ---------- */
function openApp(id,ev){
  var a=appById(id);if(!a||!appVisible(a))return;
  if(ev&&ev.currentTarget){var r=ev.currentTarget.getBoundingClientRect();document.documentElement.style.setProperty('--ox',(r.left+r.width/2)+'px');document.documentElement.style.setProperty('--oy',(r.top+r.height/2)+'px');}
  if(OS.pick){OS.pick=false;$('osPick').classList.remove('show');return openSplit(a);}
  dockHide();
  var H=document.documentElement;H.classList.add('osopening');clearTimeout(OS._opT);OS._opT=setTimeout(function(){H.classList.remove('osopening');},600);
  if(a.page&&!a.open){
    var s=document.querySelector('.side a[data-page="'+a.page+'"]'+(a.mode?'[data-mode="'+a.mode+'"]':''));
    if(a.page==='p-msg'){msgTab='dm';DM.peer=null;DM.ro=null;DM.chan=null;DM.grp=null;}
    if(s)s.click();else showPage(a.page);
  }else if(a.open)a.open();
  /* приложение могло не открыться (например, игра без премиума) — смотрим, что на экране */
  if(a.page&&curPage()===a.page){OS.app=a.id;osRecent(a.id);}else osOnPage(curPage());
  osBar();
}
function osRecent(id){
  OS.recent=[id].concat(OS.recent.filter(function(x){return x!==id;})).slice(0,8);
  try{localStorage.setItem(osKey('h_recent'),JSON.stringify(OS.recent));}catch(e){}
  drawDock();
}
function appBadge(id){
  if(id==='msg')return (window.DM&&DM.unread)||0;
  if(id==='mail')return (window.ML&&ML.unread)||0;
  return 0;
}
function goHome(){
  document.documentElement.classList.remove('jiggle');HS.edit=false;
  if(OS.side)closeSplit();
  OS.app=null;
  showPage('p-home');
  drawHome();
}
/* вызывается из showPage: обновить шапку под текущее приложение */
function osOnPage(id){
  var h=document.documentElement;
  h.classList.toggle('home',id==='p-home');
  h.classList.toggle('vapp',VAPPS.indexOf(id)>=0||(id==='p-admin'&&!!OS.ytadm));
  if(typeof ytRailMark==='function')ytRailMark();
  if(id!=='p-home'){
    var aid=id==='p-uapp'?null:id==='p-admin'?(OS.ytadm?'video':'admin'):PAGE_APP[id]||(APPS.filter(function(a){return a.page===id&&(!a.mode||a.mode===mode);})[0]||{}).id;
    if(aid&&OS.app!==aid){OS.app=aid;osRecent(aid);}
  }
  osBar();
}
function osBar(){
  var a=appById(OS.app);
  $('osTitle').textContent=a?a.t:'';
  var ic=$('osIcon');ic.textContent='';if(a)ic.append(appIcon(a,28));
  $('osSplit').style.display=a&&!document.documentElement.classList.contains('phone')?'':'none';
  $('osSplit').classList.toggle('on',!!OS.side);
}
/* ---------- домашний экран ---------- */
/* ---------- домашний экран: страницы, перестановка иконок ---------- */
var HS={page:0,edit:false,drag:null,moved:0};
try{OS.layout=JSON.parse(localStorage.getItem('h_layout')||'null');}catch(e){}
function hsPhone(){return document.documentElement.classList.contains('phone');}
/* все приложения на одной странице: размер иконок подгоняет hsFit */
function hsCap(i){return 1e9;}
/* раскладка по страницам: что я расставил сам + новые приложения в конец */
function hsPages(){
  var vis=APPS.filter(appVisible).map(function(a){return a.id;});
  var L=(Array.isArray(OS.layout)?OS.layout:[]).map(function(p){return (p||[]).filter(function(id){return vis.indexOf(id)>=0;});});
  L=[[].concat.apply([],L)];
  var placed=[].concat.apply([],L);
  vis.forEach(function(id){
    if(placed.indexOf(id)>=0)return;
    var i=0;while(L[i]&&L[i].length>=hsCap(i))i++;
    (L[i]=L[i]||[]).push(id);
  });
  return L.filter(function(p,i){return p.length||i===0;});
}
function hsSaveDom(){
  var L=[].map.call(document.querySelectorAll('#hsApps .hsgrid'),function(g){return [].map.call(g.querySelectorAll('.happ'),function(b){return b.dataset.app;});});
  OS.layout=L.filter(function(p,i){return p.length||i===0;});
  try{localStorage.setItem(osKey('h_layout'),JSON.stringify(OS.layout));}catch(e){}
}
function drawHome(quiet){
  if(typeof wpApply==='function')wpApply();
  var box=$('hsApps'),wid=$('hsWid');
  box.classList.toggle('quiet',!!quiet);
  box.textContent='';
  var L=hsPages();
  L.forEach(function(ids,pi){
    var pg=el('div','hspage'),g=el('div','hsgrid');
    if(hsPhone()&&pi===0)pg.append(wid);
    ids.forEach(function(id,i){var a=appById(id);if(a)g.append(hsIcon(a,i));});
    pg.append(g);box.append(pg);
  });
  if(!hsPhone())document.querySelector('.hsbody').prepend(wid);
  HS.page=Math.max(0,Math.min(HS.page,L.length-1));
  box.style.scrollBehavior='auto';box.scrollLeft=HS.page*box.clientWidth;box.style.scrollBehavior='';
  hsDots();
  $('hsDone').hidden=!HS.edit;
  drawWidgets();clockTick();drawDock();
  requestAnimationFrame(hsFit);
  var av=$('hsMe');av.textContent='';if(ME)av.append(avatarEl(ME.id,ME.name||ME.nick,40));else av.append(el('span',null,'👤'));
}
function hsIcon(a,i){
  var b=el('button','happ');b.style.animationDelay=(i*0.02)+'s';b.dataset.app=a.id;
  b.append(appIcon(a),el('span',null,a.t));
  var n=appBadge(a.id);if(n)b.append(el('em','abadge',String(n)));
  if(!a.core){var x=el('i','hx','−');x.title='Удалить с экрана';x.addEventListener('click',function(e){e.stopPropagation();if(confirm('Удалить «'+a.t+'» с домашнего экрана? Вернуть можно в HoroStore.')){if(a.user){delete OS.uapps[a.uid];uappsSave();}else setInstalled(a.id,false);hsSaveDom();drawHome(true);}});b.append(x);}
  b.addEventListener('click',function(e){if(HS.edit||Date.now()-HS.moved<400)return;openApp(a.id,e);});
  b.addEventListener('pointerdown',function(e){hsDown(e,b);});
  b.addEventListener('contextmenu',function(e){e.preventDefault();hsEdit(true);});
  return b;
}
function hsDots(){
  var d=$('hsDots'),n=$('hsApps').children.length;d.textContent='';
  d.hidden=n<2;
  for(var i=0;i<n;i++)(function(i){var x=el('button',i===HS.page?'on':'');x.setAttribute('aria-label','Страница '+(i+1));x.addEventListener('click',function(e){e.stopPropagation();hsGo(i);});d.append(x);})(i);
}
function hsGo(i,make){
  var box=$('hsApps');
  if(i<0)return;
  if(i>=box.children.length){
    return;
  }
  HS.page=i;box.scrollTo({left:i*box.clientWidth,behavior:'smooth'});hsDots();
}
/* режим «расстановки»: иконки дрожат, их можно таскать и уносить на другую страницу */
function hsEdit(on){
  if(HS.edit===on)return;
  HS.edit=on;
  document.documentElement.classList.toggle('jiggle',on);
  $('hsDone').hidden=!on;
  var box=$('hsApps');
  if(on){
    var last=box.lastElementChild;
    if(!last||last.querySelector('.happ')){var pg=el('div','hspage');pg.append(el('div','hsgrid'));box.append(pg);}
    hsDots();
    if(!OS.hsTip){OS.hsTip=1;osToast(Lx('Перетаскивай значки. К краю экрана — на другую страницу','Drag icons around. Hold at the screen edge to move to another page'));}
  }else{hsSaveDom();drawHome(true);}
}
function hsDown(e,b){
  if(e.button>0)return;
  var d={b:b,x0:e.clientX,y0:e.clientY,id:e.pointerId,drag:false};
  d.lp=setTimeout(function(){d.lp=0;if(!HS.edit){hsEdit(true);if(navigator.vibrate)try{navigator.vibrate(12);}catch(er){}}},550);
  HS.drag=d;
}
function hsMove(e){
  var d=HS.drag;if(!d)return;
  var dx=e.clientX-d.x0,dy=e.clientY-d.y0;
  if(!d.drag){
    if(Math.abs(dx)+Math.abs(dy)<8)return;
    clearTimeout(d.lp);
    if(!HS.edit){HS.drag=null;return;}/* обычный свайп — листаем страницы */
    var r=d.b.getBoundingClientRect(),c=d.b.cloneNode(true);
    c.className='happ hsghost';c.style.left=r.left+'px';c.style.top=r.top+'px';c.style.width=r.width+'px';
    document.body.append(c);d.c=c;d.drag=true;d.b.classList.add('hsph');
    try{d.b.setPointerCapture(e.pointerId);}catch(er){}
  }
  e.preventDefault();
  d.c.style.transform='translate('+dx+'px,'+dy+'px) scale(1.15)';
  var box=$('hsApps'),br=box.getBoundingClientRect();
  var edge=e.clientX<br.left+36?-1:e.clientX>br.right-36?1:0;
  if(edge!==d.edge){d.edge=edge;clearTimeout(d.et);if(edge)d.et=setTimeout(function(){d.edge=0;hsGo(HS.page+edge,true);setTimeout(function(){var g=box.children[HS.page];if(g&&!g.querySelector('.happ'))hsPlace(d.b,null,false,g.querySelector('.hsgrid'));},350);},650);}
  if(Date.now()-(d.t||0)<110)return;
  var t=document.elementFromPoint(e.clientX,e.clientY);if(!t)return;
  var over=t.closest('.happ'),pg=t.closest('.hspage');
  if(over&&over!==d.b&&!over.classList.contains('hsghost')&&box.contains(over)){
    var orr=over.getBoundingClientRect();hsPlace(d.b,over,e.clientX>orr.left+orr.width/2);d.t=Date.now();
  }else if(!over&&pg&&box.contains(pg)){
    var g=pg.querySelector('.hsgrid');if(g&&d.b.parentNode!==g){hsPlace(d.b,null,false,g);d.t=Date.now();}
  }
}
/* переставить иконку и плавно подвинуть соседей (FLIP) */
function hsPlace(b,ref,after,grid){
  if(ref&&(after?ref.nextElementSibling===b:ref.previousElementSibling===b))return;
  var items=[].slice.call(document.querySelectorAll('#hsApps .happ')),old=items.map(function(x){return x.getBoundingClientRect();});
  if(ref){if(after)ref.after(b);else ref.before(b);}else grid.append(b);
  items.forEach(function(x,i){
    if(x===b)return;var n=x.getBoundingClientRect(),dx=old[i].left-n.left,dy=old[i].top-n.top;
    if(dx||dy)x.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],{duration:280,easing:'cubic-bezier(.2,.9,.3,1)'});
  });
}
function hsUp(){
  var d=HS.drag;if(!d)return;HS.drag=null;clearTimeout(d.lp);clearTimeout(d.et);
  if(!d.drag)return;
  HS.moved=Date.now();
  var r=d.b.getBoundingClientRect(),c=d.c,b=d.b;
  c.style.transition='transform .28s cubic-bezier(.2,.9,.3,1.15),left .28s cubic-bezier(.2,.9,.3,1.15),top .28s cubic-bezier(.2,.9,.3,1.15)';
  c.style.transform='none';c.style.left=r.left+'px';c.style.top=r.top+'px';
  setTimeout(function(){c.remove();b.classList.remove('hsph');},290);
  hsSaveDom();
  var box=$('hsApps'),last=box.lastElementChild;
  if(last&&last.querySelector('.happ')){var pg=el('div','hspage');pg.append(el('div','hsgrid'));box.append(pg);}
  hsDots();
}
document.addEventListener('pointermove',hsMove,{passive:false});
document.addEventListener('pointerup',hsUp);
document.addEventListener('pointercancel',hsUp);
/* нажал на пустое место — расставляю приложения; ещё раз или «Готово» — закончить */
function hsInit(){
  var home=$('p-home'),box=$('hsApps'),px=0,py=0;
  home.addEventListener('pointerdown',function(e){px=e.clientX;py=e.clientY;});
  home.addEventListener('click',function(e){
    if(Math.abs(e.clientX-px)+Math.abs(e.clientY-py)>8||Date.now()-HS.moved<400)return;
    if(e.target.closest('.happ,.wid,.hsfind,.hsres,.hsme,.hsdots,.hsdone,button,input,a'))return;
    hsEdit(!HS.edit);
  });
  $('hsDone').addEventListener('click',function(e){e.stopPropagation();hsEdit(false);});
  var st=0;
  box.addEventListener('scroll',function(){clearTimeout(st);st=setTimeout(function(){var i=Math.round(box.scrollLeft/Math.max(1,box.clientWidth));if(i!==HS.page){HS.page=i;hsDots();}},60);},{passive:true});
  /* колёсико мыши и стрелки — листать страницы */
  var wt=0;
  box.addEventListener('wheel',function(e){if(Math.abs(e.deltaY)<=Math.abs(e.deltaX)||box.children.length<2)return;e.preventDefault();if(Date.now()-wt<500)return;wt=Date.now();hsGo(HS.page+(e.deltaY>0?1:-1));},{passive:false});
  document.addEventListener('keydown',function(e){if(!pageOn('p-home')||/INPUT|TEXTAREA/.test((e.target||{}).tagName||''))return;if(e.key==='ArrowRight')hsGo(HS.page+1);if(e.key==='ArrowLeft')hsGo(HS.page-1);});
  addEventListener('resize',function(){if(pageOn('p-home'))box.scrollLeft=HS.page*box.clientWidth;});
  if(window.ResizeObserver){var ro=new ResizeObserver(function(){hsFit();});ro.observe(box);ro.observe($('hsWid'));}
}
/* подбирает размер иконок и число колонок, чтобы всё влезло без прокрутки */
function hsFitFor(H,W,n,ph){
  /* iPad в режиме телефона (широкий экран) — иконки крупнее и просторнее */
  var wide=ph&&W>600,max=wide?84:ph?60:(document.documentElement.classList.contains('bigicons')?88:72),s,c=4,gy=8;
  for(s=max;s>=34;s-=2){
    c=Math.max(ph?4:3,Math.floor(W/(s+(wide?44:ph?16:28))));
    gy=Math.max(6,Math.round(s*(ph?.22:.3)));
    var rows=Math.ceil(n/c),lab=s<50?17:(ph?22:25);
    if(rows*(s+lab)+(rows-1)*gy<=H)break;
  }
  return {s:Math.max(s,34),c:c,gy:gy};
}
var HSW=110;
function hsFit(){
  var box=$('hsApps'),pg=box&&box.firstChild,g=pg&&pg.querySelector('.hsgrid'),hb=document.documentElement;
  if(!g||!pg.clientHeight)return;
  var ph=hsPhone(),n=g.children.length,W=g.clientWidth,wid=$('hsWid');
  /* offsetTop/clientHeight не зависят от анимации открытия (transform) */
  var H=pg.clientHeight-g.offsetTop-(ph?6:12);
  /* маленький экран (iPhone SE): если с виджетами иконки выходят мелкими, виджеты прячем */
  var hid=hb.classList.contains('hsnowid');
  if(ph&&!hid&&wid.offsetHeight)HSW=wid.offsetHeight+14;
  var withW=hid?H-HSW:H,f=hsFitFor(withW,W,n,ph),noW=ph&&f.s<44;
  if(noW)f=hsFitFor(withW+HSW,W,n,ph);
  hb.classList.toggle('hsnowid',noW);
  /* после показа или скрытия виджетов перемеряем ещё раз (не больше трёх раз подряд) */
  if(noW!==hid&&(HS.refit=(HS.refit||0)+1)<4)requestAnimationFrame(hsFit);else HS.refit=0;
  box.style.setProperty('--hss',f.s+'px');box.style.setProperty('--hsc',String(f.c));box.style.setProperty('--hsgy',f.gy+'px');
  box.classList.add('fit');box.classList.toggle('small',f.s<50);
}

async function drawWidgets(){
  var w=$('hsWid');w.textContent='';
  /* календарь: ближайшие события */
  var c=el('button','wid wcal'),n=new Date();
  c.append(el('small',null,n.toLocaleDateString(LANG==='en'?'en-GB':'ru-RU',{weekday:'long'}).toUpperCase()),el('b',null,String(n.getDate())));
  var ul=el('div','wlist');c.append(ul);
  c.addEventListener('click',function(e){openApp('cal',e);});
  w.append(c);
  /* часы: таймер, если идёт, иначе секундомер или подсказка */
  var k=el('button','wid wclock');k.id='wClock';k.addEventListener('click',function(e){openApp('clock',e);});
  w.append(k);clkWidget();
  /* Tubek и друзья */
  var t=el('button','wid wtub');
  t.append(el('small',null,'TUBEK'),el('b',null,ME?(ME.tubek||0)+' 🪙':'—'),el('span',null,ME?(isPremium()?'⭐ Премиум':'Премиума нет'):'Войди в аккаунт'));
  t.addEventListener('click',function(){openApp('settings');openSettings('tubek');});
  w.append(t);
  if(ME&&typeof calUpcoming==='function'){
    var ev=await calUpcoming(3);
    if(!ev.length)ul.append(el('span','wmuted','Сегодня событий нет'));
    ev.forEach(function(x){var r=el('div','wev');r.style.setProperty('--c',CALC[x.color]||CALC.blue);r.append(el('b',null,x.title),el('small',null,x.all_day?'весь день':x.when));ul.append(r);});
  }else ul.append(el('span','wmuted',ME?'':'Войди, чтобы вести календарь'));
}
/* ---------- док ---------- */
function drawDock(){
  var d=$('dock');if(!d)return;d.textContent='';
  DOCK.forEach(function(id){var a=appById(id);if(a)d.append(dockBtn(a));});
  var rec=OS.recent.filter(function(id){return DOCK.indexOf(id)<0&&appById(id)&&appVisible(appById(id));}).slice(0,3);
  if(rec.length){d.append(el('i','dsep'));rec.forEach(function(id){d.append(dockBtn(appById(id)));});}
}
function dockBtn(a){
  var b=el('button','dapp'+(OS.app===a.id?' on':''));b.title=a.t;b.dataset.app=a.id;b.setAttribute('aria-label',a.t);
  b.append(appIcon(a));
  var n=appBadge(a.id);if(n)b.append(el('em','abadge',String(n)));
  b.addEventListener('click',function(e){if(Date.now()-(+b.dataset.dragged||0)<400)return;openApp(a.id,e);});
  return b;
}
var _dockT=0;
function dockShow(){if(document.documentElement.classList.contains('home'))return;document.documentElement.classList.add('dockup');clearTimeout(_dockT);_dockT=setTimeout(dockHide,3500);}
function dockHide(){document.documentElement.classList.remove('dockup');}
/* ---------- два приложения рядом (Split View) ---------- */
function openSplit(a){
  if(!a.split||!a.page)return;
  if(a.page===curPage()){alert('Это приложение уже открыто слева');return;}
  if(OS.side)closeSplit(true);
  OS.side=a.id;OS.toSide=true;
  try{
    if(a.open)a.open();
    else{if(a.page==='p-msg'){msgTab='dm';DM.peer=null;DM.ro=null;DM.chan=null;DM.grp=null;openMsg();}else showPage(a.page);}
  }finally{OS.toSide=false;}
  $('osTitle2').textContent=a.t;var ic=$('osIcon2');ic.textContent='';ic.append(appIcon(a,24));
  osBar();osRecent(a.id);
}
/* showPage во время открытия правого окна кладёт страницу справа */
function osShowSide(id){
  document.querySelectorAll('.page.side2').forEach(function(p){p.classList.remove('side2','show');});
  var p=$(id);p.classList.add('show','side2');
  document.documentElement.classList.add('split');
}
function closeSplit(keep){
  document.querySelectorAll('.page.side2').forEach(function(p){p.classList.remove('side2','show');});
  document.documentElement.classList.remove('split');
  OS.side=null;if(!keep)osBar();
}
function swapSplit(){
  var l=appById(OS.app),r=appById(OS.side);if(!l||!r)return;
  closeSplit(true);openApp(r.id);if(l.split)openSplit(l);
}
function pickSplit(){
  if(OS.side){closeSplit();return;}
  var g=$('osPickList');g.textContent='';
  APPS.filter(function(a){return a.split&&a.page!==curPage()&&appVisible(a);}).forEach(function(a){
    var b=el('button','happ');b.append(appIcon(a),el('span',null,a.t));
    b.addEventListener('click',function(e){OS.pick=true;openApp(a.id,e);});
    g.append(b);
  });
  $('osPick').classList.add('show');
}
/* перетаскивание разделителя: окна 1/3, 1/2 или 2/3 */
(function(){
  var dv=el('div','osdiv'),bar=el('div','osbar2');
  dv.title='Потяни, чтобы изменить размер окон';
  var ic=el('span');ic.id='osIcon2';var tt=el('b');tt.id='osTitle2';
  var sw=el('button',null,'⇄'),x=el('button',null,'✕');sw.title='Поменять местами';x.title='Закрыть правое окно';
  sw.addEventListener('click',swapSplit);x.addEventListener('click',function(){closeSplit();});
  bar.append(ic,tt,sw,x);
  document.body.append(dv,bar);
  var drag=false;
  function mv(x){var w=Math.min(Math.max(innerWidth-x,innerWidth*.25),innerWidth*.75);document.documentElement.style.setProperty('--sw',w+'px');}
  dv.addEventListener('pointerdown',function(e){drag=true;dv.setPointerCapture(e.pointerId);document.documentElement.classList.add('dragging');});
  dv.addEventListener('pointermove',function(e){if(drag)mv(e.clientX);});
  dv.addEventListener('pointerup',function(e){
    if(!drag)return;drag=false;document.documentElement.classList.remove('dragging');
    var f=(innerWidth-e.clientX)/innerWidth,snap=[1/3,1/2,2/3].reduce(function(a,b){return Math.abs(b-f)<Math.abs(a-f)?b:a;});
    document.documentElement.style.setProperty('--sw',(snap*100)+'vw');
  });
})();
/* ---------- переключатель приложений ---------- */
function openSwitcher(){
  var g=$('osSwList');g.textContent='';
  var list=OS.recent.filter(function(id){var a=appById(id);return a&&a.page&&appVisible(a);});
  if(!list.length)g.append(el('p','empty','Здесь появятся недавно открытые приложения'));
  list.forEach(function(id){
    var a=appById(id),c=el('div','swcard'+(OS.app===id||OS.side===id?' on':''));
    var hd=el('div','swhd');hd.append(appIcon(a,26),el('b',null,a.t));
    var x=el('button','swx','✕');x.title='Убрать из недавних';
    x.addEventListener('click',function(e){e.stopPropagation();OS.recent=OS.recent.filter(function(r){return r!==id;});try{localStorage.setItem(osKey('h_recent'),JSON.stringify(OS.recent));}catch(er){}c.classList.add('gone');setTimeout(openSwitcher,250);});
    var pv=el('div','swpv');pv.style.background=a.bg;pv.append(appIcon(a,72));
    c.append(hd,pv,x);
    if(a.split&&!document.documentElement.classList.contains('phone')&&OS.app&&OS.app!==id){
      var sp=el('button','swsplit','◧ Справа');sp.title='Открыть рядом с текущим';
      sp.addEventListener('click',function(e){e.stopPropagation();$('osSw').classList.remove('show');openSplit(a);});
      c.append(sp);
    }
    c.addEventListener('click',function(){$('osSw').classList.remove('show');openApp(id);});
    /* смахнуть вверх — закрыть, как на iPad */
    var sy=null;
    c.addEventListener('touchstart',function(e){sy=e.touches[0].clientY;},{passive:true});
    c.addEventListener('touchend',function(e){if(sy!==null&&sy-e.changedTouches[0].clientY>80)x.click();sy=null;});
    g.append(c);
  });
  $('osSw').classList.add('show');
}
/* ---------- шапка, полоска «домой», жесты (запускается после всех приложений) ---------- */
function osInit(){
  var top=document.querySelector('.top');
  var hb=el('button','oshome','⌂');hb.id='osHome';hb.title='Домой';hb.setAttribute('aria-label','Домой');
  hb.addEventListener('click',function(){osExit();});
  var ic=el('span','osicon');ic.id='osIcon';var tt=el('b','ostitle');tt.id='osTitle';
  var sp=el('button','icon-btn osbtn');sp.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M13 4v16"/></svg>';sp.id='osSplit';sp.title='Два приложения рядом';sp.setAttribute('aria-label','Два приложения рядом');
  sp.addEventListener('click',pickSplit);
  var sw=el('button','icon-btn osbtn');sw.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="7" height="14" rx="2"/><rect x="14" y="5" width="7" height="14" rx="2"/></svg>';sw.id='osSw2';sw.title='Все открытые приложения';sw.setAttribute('aria-label','Переключатель приложений');
  sw.addEventListener('click',openSwitcher);
  top.prepend(hb,ic,tt);
  top.insertBefore(sw,$('btnBell'));top.insertBefore(sp,sw);
  /* полоска внизу: смахнуть вверх — домой, чуть-чуть — док (жесты в yt.js) */
  var hi=el('div','oshi');hi.title='Смахни вверх — домой';
  document.body.append(hi);
  osGestures(hi);hsInit();ytInit();
  document.addEventListener('mousemove',function(e){if(e.clientY>innerHeight-10)dockShow();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){$('osSw').classList.remove('show');$('osPick').classList.remove('show');}});
  $('osSwX').addEventListener('click',function(){$('osSw').classList.remove('show');});
  $('osSw').addEventListener('click',function(e){if(e.target.id==='osSw')$('osSw').classList.remove('show');});
  $('osPickX').addEventListener('click',function(){OS.pick=false;$('osPick').classList.remove('show');});
  $('hsMe').addEventListener('click',function(e){e.stopPropagation();pm.classList.toggle('show');});
  $('dock').addEventListener('mouseenter',function(){clearTimeout(_dockT);});
  $('dock').addEventListener('mouseleave',function(){_dockT=setTimeout(dockHide,800);});
  document.documentElement.classList.add('os');
  OS.ready=true;
  goHome();
}
/* после входа или выхода: данные приложений — от нового пользователя */
function osAfterLogin(){
  var id=ME?ME.id:null;
  if(OS.who!==id){
    OS.who=id;osLoadUser();STORE.list=null;CD.list=null;CD.cur=null;GL.rows=null;GL.urls={};CAL.ev=null;ML.list=[];ML.unread=0;ML.people=null;
    if(id){mlLoad();ownLoad();}else OS.owned={};
  }
  if(pageOn('p-home'))drawHome();
}

/* ---------- всплывающие подсказки и нижние листы ---------- */
var _toastT=0;
function osToast(t){var b=$('osToast');b.textContent=t;b.classList.add('show');clearTimeout(_toastT);_toastT=setTimeout(function(){b.classList.remove('show');},2600);}
/* лист (как sheet на iPad): build(box,close) рисует содержимое */
function osSheet(build){
  var o=$('osSheet'),b=$('osSheetBox');b.textContent='';b.className='mdl ossheet';
  function close(){o.classList.remove('show');}
  build(b,close);o.classList.add('show');
  return close;
}
$('osSheet').addEventListener('click',function(e){if(e.target.id==='osSheet')this.classList.remove('show');});
function field(label,inp){var l=el('label','osf');l.append(el('span',null,label),inp);return l;}
function inp(type,val,ph,max){var i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;if(val!=null)i.value=val;if(ph)i.placeholder=ph;if(max)i.maxLength=max;return i;}
function sel(opts,val){var s=el('select');opts.forEach(function(o){var x=el('option',null,o[1]);x.value=o[0];s.append(x);});if(val!=null)s.value=val;return s;}
function btn(t,cls,fn){var b=el('button',cls||'mbtn',t);if(fn)b.addEventListener('click',fn);return b;}
function needSB(box,txt){if(SB&&ME)return true;box.append(el('div','osempty',txt||'Войди в аккаунт, чтобы пользоваться этим приложением.'));if(!ME)box.append(btn('Войти','mbtn go',function(){openAuth(false);}));return false;}
function dbMissing(e){return e&&/does not exist|schema cache|not find|42P01|PGRST20/i.test((e.message||'')+(e.code||''));}
function dbErr(box,e,file){box.append(el('div','osempty',dbMissing(e)?'Это приложение заработает, когда администратор запустит '+(file||'apps.sql')+' в Supabase.':'Ошибка: '+(e.message||e)));}
function Lx(r,e){return LANG==='en'?e:r;}
function subjEn(s){return LANG==='en'?({'Все':'All','Подписки':'Subscriptions','Математика':'Math','Русский':'Russian','Английский':'English','Физика':'Physics','История':'History','Психология':'Psychology','Биология':'Biology','Учусь Учиться':'Learning to Learn'})[s]||s:s;}
function fmtSize(n){n=n||0;return n<1024?n+Lx(' Б',' B'):n<1048576?(n/1024).toFixed(0)+Lx(' КБ',' KB'):(n/1048576).toFixed(1)+Lx(' МБ',' MB');}
function dloc(){return LANG==='en'?'en-GB':'ru-RU';}
/* ---------- поиск на домашнем экране (как Spotlight) ---------- */
(function(){
  var f=$('hsFind'),r=$('hsRes');
  f.addEventListener('input',function(){
    var q=f.value.trim().toLowerCase();r.textContent='';r.classList.toggle('show',!!q);
    if(!q)return;
    APPS.filter(function(a){return appVisible(a)&&(tr(a.t).toLowerCase().indexOf(q)>=0||a.t.toLowerCase().indexOf(q)>=0||tr(a.d).toLowerCase().indexOf(q)>=0);}).slice(0,6).forEach(function(a){
      var b=el('button','hsr');b.append(appIcon(a,34),el('b',null,a.t),el('small',null,a.d));
      b.addEventListener('click',function(e){f.value='';r.classList.remove('show');openApp(a.id,e);});r.append(b);
    });
    var w=el('button','hsr');var wi=appById('search');w.append(appIcon(wi,34),el('b',null,'Искать «'+f.value.trim()+'» в Horo Поиске'),el('small',null,'Статьи из Википедии'));
    w.addEventListener('click',function(e){var v=f.value.trim();f.value='';r.classList.remove('show');openApp('search',e);srGo(v);});r.append(w);
  });
  f.addEventListener('keydown',function(e){if(e.key==='Enter'){var v=f.value.trim();if(!v)return;var first=r.querySelector('.hsr');if(first)first.click();}});
  /* тап по пустому месту — выйти из режима «дрожания» */
  $('p-home').addEventListener('click',function(e){if(!e.target.closest('.happ'))document.documentElement.classList.remove('jiggle');});
})();
