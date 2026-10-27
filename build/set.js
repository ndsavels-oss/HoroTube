/* ===== Настройки: профиль, обои, оформление, язык, приложения ===== */
var WPS={
  aurora:['Аврора','radial-gradient(120% 90% at 10% 0%,#7F5BFF 0%,transparent 55%),radial-gradient(90% 80% at 100% 20%,#00C2FF 0%,transparent 55%),radial-gradient(120% 100% at 50% 110%,#FF4FA3 0%,transparent 60%),#1B1340'],
  sunset:['Закат','linear-gradient(170deg,#FFB86B 0%,#FF6F91 45%,#6A4CFF 100%)'],
  ocean:['Океан','radial-gradient(100% 80% at 80% 0%,#5EE7FF 0%,transparent 60%),linear-gradient(180deg,#0A84FF,#002E6B)'],
  mint:['Мята','linear-gradient(160deg,#C8FFE6 0%,#5ED6B0 50%,#0A7D77 100%)'],
  lavender:['Лаванда','linear-gradient(160deg,#F3E8FF 0%,#C4A7FF 50%,#7A5CFA 100%)'],
  graphite:['Графит','radial-gradient(100% 70% at 50% 0%,#4A4A55 0%,transparent 70%),linear-gradient(180deg,#26262C,#0B0B0F)'],
  dune:['Дюны','linear-gradient(175deg,#FFE7C2 0%,#F6B67B 40%,#C46A4A 75%,#5C2F3A 100%)'],
  space:['Космос','radial-gradient(1.5px 1.5px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 70% 20%,#fff,transparent),radial-gradient(1.5px 1.5px at 40% 70%,#fff,transparent),radial-gradient(1px 1px at 85% 60%,#fff,transparent),radial-gradient(80% 60% at 80% 0%,#3A2390 0%,transparent 60%),radial-gradient(70% 60% at 0% 100%,#0E4A8A 0%,transparent 60%),#07051A'],
  forest:['Лес','linear-gradient(170deg,#D7F5C4 0%,#5FAF6B 45%,#1D4D3A 100%)','Forest'],
  flame:['Огонь','radial-gradient(100% 80% at 50% 120%,#FFD60A 0%,#FF6A00 40%,transparent 75%),#3A0A0A']
};
function wpGet(){try{return localStorage.getItem('h_wp')||'aurora';}catch(e){return 'aurora';}}
function wpApply(){
  var k=wpGet(),w=$('wp'),img=null;
  if(k==='photo'){try{img=localStorage.getItem('h_wp_img');}catch(e){}}
  if(img&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img))w.style.background='center/cover no-repeat url("'+img+'")';
  else w.style.background=(WPS[k]||WPS.aurora)[1];
}
function wpSet(k){try{localStorage.setItem('h_wp',k);}catch(e){}wpApply();}
/* своё фото: уменьшаем до 1600 px, чтобы влезло в память браузера */
function wpPhoto(file){
  if(!file||!/^image\//.test(file.type))return;
  var im=new Image(),u=URL.createObjectURL(file);
  im.onload=function(){
    var sc=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');
    c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    URL.revokeObjectURL(u);
    var d=c.toDataURL('image/jpeg',.82);
    try{localStorage.setItem('h_wp_img',d);localStorage.setItem('h_wp','photo');}catch(e){alert('Фото слишком большое для памяти браузера. Выбери другое.');return;}
    wpApply();openSettings('wp');osToast('Обои поставлены');
  };
  im.src=u;
}
var SETS=[['me','👤','Профиль'],['tubek','🪙','Tubek и Премиум'],['wp','🖼','Обои'],['look','🎨','Оформление'],['lang','🌐','Язык'],['apps','🧩','Приложения'],['priv','🔒','Конфиденциальность'],['about','ℹ️','Об устройстве']];
var setCur='me';
function openSettings(sec){
  if(sec)setCur=sec;
  showPage('p-settings');
  var b=$('setBody');b.textContent='';
  var l=el('div','ip2l'),r=el('div','ip2r');
  l.append(el('h2','iptitle','Настройки'));
  var card=el('button','setme');card.append(ME?avatarEl(ME.id,ME.name||ME.nick,56):el('span','av','👤'));
  var ct=el('div');ct.append(el('b',null,ME?(ME.name||ME.nick):'Гость'),el('small',null,ME?ROLES[ME.role]+' · @'+ME.nick:'Войди в аккаунт'));card.append(ct);
  card.addEventListener('click',function(){setCur='me';openSettings();});
  l.append(card);
  var g=el('div','setgrp');
  SETS.slice(1).forEach(function(x){
    var a=el('button','setrow'+(setCur===x[0]?' on':''));a.append(el('i','seti',x[1]),el('span',null,x[2]),el('em',null,'›'));
    a.addEventListener('click',function(){setCur=x[0];openSettings();b.classList.add('open');});
    g.append(a);
  });
  l.append(g);
  var back=btn('‹ Настройки','ipback',function(){b.classList.remove('open');});
  r.append(back);
  var sec=SETS.filter(function(x){return x[0]===setCur;})[0]||SETS[0];
  r.append(el('h2','iptitle',sec[2]));
  ({me:setMe,tubek:setTubek,wp:setWp,look:setLook,lang:setLangSec,apps:setApps,priv:setPriv,about:setAbout}[setCur])(r);
  b.append(l,r);
}
function setGroup(r,rows){var g=el('div','setgrp');rows.forEach(function(x){g.append(x);});r.append(g);return g;}
function setLine(t,right,fn){var a=el(fn?'button':'div','setrow');a.append(el('span',null,t));if(right!=null){if(typeof right==='string')a.append(el('em',null,right));else a.append(right);}if(fn)a.addEventListener('click',fn);return a;}
function setToggle(on,fn){var t=el('button','ostgl'+(on?' on':''));t.setAttribute('role','switch');t.setAttribute('aria-checked',on?'true':'false');t.addEventListener('click',function(e){e.stopPropagation();fn(!t.classList.contains('on'));});return t;}
function setMe(r){
  if(!ME){r.append(el('p','osempty','Войди, чтобы менять профиль.'),btn('Войти','mbtn go',function(){openAuth(false);}));return;}
  var h=el('div','setmebig');h.append(avatarEl(ME.id,ME.name||ME.nick,96),el('b',null,ME.name||ME.nick),el('small',null,'@'+ME.nick+' · '+ROLES[ME.role]+(ME.class?' · '+ME.class+' класс':'')));
  r.append(h);
  setGroup(r,[setLine('Имя, аватарка, класс и пароль','›',function(){$('pmSet').click();}),setLine('Моё портфолио','›',function(){openApp('portfolio');}),setLine('Мой канал','›',function(){$('pmChan').click();})]);
  setGroup(r,[setLine('Tubek',(ME.tubek||0)+' 🪙  ›',function(){openSettings('tubek');}),setLine('Премиум',(isPremium()?Lx('Есть ⭐','Yes ⭐'):Lx('Нет','No'))+'  ›',function(){openSettings('tubek');})]);
  setGroup(r,[setLine('Выйти из аккаунта',null,function(){$('pmOut').click();})]).classList.add('danger');
}
function setWp(r){
  var cur=wpGet(),pv=el('div','wppv');
  var a=el('div','wpdev');a.style.background=$('wp').style.background;var ah=el('div','wppvhome');for(var i=0;i<12;i++)ah.append(el('i'));a.append(el('b',null,new Date().toLocaleTimeString(dloc(),{hour:'2-digit',minute:'2-digit'})),ah);
  pv.append(a);r.append(pv);
  var g=el('div','wpgrid');
  Object.keys(WPS).forEach(function(k){
    var t=el('button','wpt'+(cur===k?' on':''));t.style.background=WPS[k][1];t.append(el('span',null,Lx(WPS[k][0],WPS[k][2]||WPS[k][0])));
    t.addEventListener('click',function(){wpSet(k);openSettings();});g.append(t);
  });
  var ph=el('button','wpt wpph'+(cur==='photo'?' on':''));ph.append(el('b',null,'📷'),el('span',null,'Своё фото'));
  var fi=el('input');fi.type='file';fi.accept='image/*';fi.style.display='none';fi.addEventListener('change',function(){wpPhoto(fi.files[0]);});
  ph.addEventListener('click',function(){fi.click();});
  g.append(ph,fi);r.append(g);
  r.append(el('p','avhint','Фото для обоев хранится только на этом устройстве.'));
}
function setLook(r){
  var t=curTheme();
  var g=el('div','thgrid');
  Object.keys(THEMES).forEach(function(k){
    var b=el('button','thb'+(t===k?' on':''));b.setAttribute('data-theme',k);b.append(el('i'),el('span',null,THEMES[k]+(PREM_THEMES.indexOf(k)>=0&&!isPremium()?' 🔒':'')));
    b.addEventListener('click',function(){if(PREM_THEMES.indexOf(k)>=0&&!isPremium()){alert('Эта тема — с премиумом');return;}swapTheme(k);openSettings();});
    g.append(b);
  });
  r.append(g);
  setGroup(r,[
    setLine('Жидкое стекло',setToggle(glassOn(),function(v){try{localStorage.setItem('h_glass',v?'1':'0');}catch(e){}glassApply();openSettings();})),
    setLine('Анимации открытия приложений',setToggle(!osNoAnim(),function(v){try{localStorage.setItem('h_noanim',v?'0':'1');}catch(e){}document.documentElement.classList.toggle('noanim',!v);openSettings();})),
    setLine('Крупные иконки',setToggle(osBig(),function(v){try{localStorage.setItem('h_big',v?'1':'0');}catch(e){}document.documentElement.classList.toggle('bigicons',v);openSettings();}))
  ]);
}
function osNoAnim(){try{return localStorage.getItem('h_noanim')==='1';}catch(e){return false;}}
function osBig(){try{return localStorage.getItem('h_big')==='1';}catch(e){return false;}}
document.documentElement.classList.toggle('noanim',osNoAnim());document.documentElement.classList.toggle('bigicons',osBig());
function setLangSec(r){
  setGroup(r,[['ru','Русский'],['en','English']].map(function(x){
    return setLine(x[1],LANG===x[0]?'✓':'',function(){setLang(x[0]);openSettings();});
  }));
  r.append(el('p','avhint','Названия приложений и все надписи переводятся сразу.'));
}
function setApps(r){
  var rows=APPS.filter(function(a){return !a.admin||(ME&&ME.role==='admin');}).map(function(a){
    var row=el('div','setrow setapp');row.append(appIcon(a,30),el('span',null,a.t));
    if(a.core)row.append(el('em',null,'Встроенное'));
    else row.append(setToggle(appInstalled(a),function(v){if(a.user){if(!v){delete OS.uapps[a.uid];uappsSave();}}else setInstalled(a.id,v);openSettings();}));
    return row;
  });
  setGroup(r,rows);
  setGroup(r,[setLine('Вернуть домашний экран как был',null,function(){if(!confirm('Вернуть стандартный набор приложений?'))return;OS.inst=INST_DEF.slice();try{localStorage.setItem(osKey('h_apps'),JSON.stringify(OS.inst));}catch(e){}osToast('Готово');openSettings();})]);
}
function setPriv(r){
  r.append(el('p','avhint','Кто видит твоё портфолио, выбирается в самом портфолио. Учителя и администрация видят его всегда.'));
  setGroup(r,[setLine('Портфолио: кто видит','›',function(){openApp('portfolio');}),setLine('Фото и видео в «Фото»','Только ты и администрация')]);
  setGroup(r,[setLine('Очистить историю приложений',null,function(){OS.recent=[];try{localStorage.removeItem('h_recent');}catch(e){}drawDock();osToast('История очищена');})]);
}
function setAbout(r){
  var used=0;try{for(var k in localStorage)if(localStorage.hasOwnProperty(k))used+=(localStorage.getItem(k)||'').length*2;}catch(e){}
  setGroup(r,[setLine('Система','HoroOS 27'),setLine('Устройство',document.documentElement.classList.contains('phone')?'Телефон':'Планшет / компьютер'),setLine('Приложений',String(APPS.filter(appVisible).length)),setLine('Занято в браузере',fmtSize(used))]);
  r.append(el('p','avhint','HoroOS — школьная платформа HoroTube в стиле iPad: несколько приложений сразу, свой магазин приложений и обои.'));
}

/* ===== HoroStore ===== */
var STORE={tab:'today',list:null,q:''};
function openStore(tab){
  if(tab)STORE.tab=tab;
  showPage('p-store');
  var b=$('stBody');b.textContent='';
  var hd=el('div','sthead');
  var tabs=el('div','sttabs');
  [['today','Сегодня'],['apps','Приложения'],['games','Игры'],['users','От учеников'],['mine',Lx('Мои','Mine')]].forEach(function(t){
    var x=el('button','sttab'+(STORE.tab===t[0]?' on':''),t[1]);x.addEventListener('click',function(){openStore(t[0]);});tabs.append(x);
  });
  var q=inp('search',STORE.q,'Игры, приложения и многое другое');q.className='stq';
  q.addEventListener('input',function(){STORE.q=q.value;stDraw(box);});
  hd.append(tabs,q);
  var box=el('div','stbox');
  b.append(hd,box);
  stDraw(box);
  if(SB&&ME&&!STORE.list)stLoad().then(function(){stDraw(box);});
}
async function stLoad(){
  var r=await SB.rpc('ht_store_apps');
  STORE.err=r.error||null;STORE.list=r.error?[]:r.data||[];
  /* обновляем установленные: новая версия кода, или админ убрал приложение */
  var ch=false,upd=[];
  if(r.error)return upd;
  Object.keys(OS.uapps).forEach(function(id){
    var x=STORE.list.filter(function(a){return String(a.id)===String(id);})[0];
    if(!r.error&&!x){delete OS.uapps[id];ch=true;}
    else if(x&&x.code!=null&&x.code!==OS.uapps[id].code){OS.uapps[id]={name:x.name,icon:x.icon,color:x.color,description:x.description,code:x.code,version:x.version||0};ch=true;upd.push(x);}
  });
  if(ch)uappsSave();
  STORE.at=Date.now();
  upd.forEach(function(x){osToast('🔄 «'+x.name+'» '+Lx('обновилось','was updated')+(x.version?' '+Lx('до версии ','to version ')+x.version:''));});
  return upd;
}
/* проверка обновлений установленных приложений учеников: при запуске и при открытии приложения */
async function uappsCheck(force){
  if(!SB||!ME||!Object.keys(OS.uapps).length)return [];
  if(!force&&STORE.at&&Date.now()-STORE.at<60000)return [];
  try{return await stLoad();}catch(e){return [];}
}
function stMatch(t,d){var q=STORE.q.trim().toLowerCase();return !q||tr(t).toLowerCase().indexOf(q)>=0||t.toLowerCase().indexOf(q)>=0||(d||'').toLowerCase().indexOf(q)>=0;}
function stDraw(box){
  box.textContent='';
  var t=STORE.tab,built=APPS.filter(function(a){return !a.user&&(!a.admin||(ME&&ME.role==='admin'))&&stMatch(a.t,a.d);});
  if(t==='today'&&!STORE.q){
    var hero=el('div','sthero');hero.append(el('small',null,'ПРИЛОЖЕНИЕ ДНЯ'));
    var pick=['code','edit','search','weather','piano','paint','x_sudoku','x_blocks'][new Date().getDate()%8],pa=appById(pick);
    hero.append(el('h3',null,pa.t),el('p',null,pa.d));var hr=el('div','stherorow');hr.append(appIcon(pa,64),stGet(pa));hero.append(hr);
    hero.addEventListener('click',function(e){if(!e.target.closest('button'))stDetail(pa);});
    box.append(hero);
    stSection(box,'Новое в HoroStore',built.filter(function(a){return a.store&&!a.price;}).slice(0,12));
    stSection(box,'Премиальные приложения',built.filter(function(a){return a.price;}));
    var u=(STORE.list||[]).slice(0,6);
    if(u.length)stSection(box,'Сделали ученики',u.map(stUser));
    var c=el('div','stcta');c.append(el('b',null,'Сделай своё приложение'),el('p',null,'Напиши код в Студии кода, проверь его и отправь администрации по Почте. После проверки приложение появится здесь.'),btn('Открыть Студию кода','mbtn go',function(){openApp('code');}));
    box.append(c);
    return;
  }
  if(t==='apps'||(t==='today'&&STORE.q))stSection(box,'Приложения',built.filter(function(a){return !a.game;}));
  if(t==='games'||(t==='today'&&STORE.q))stSection(box,'Игры',built.filter(function(a){return a.game||a.id==='arcade'||a.id==='piano';}));
  if(t==='users'||t==='mine'||(t==='today'&&STORE.q)){
    if(!SB||!ME){box.append(el('p','osempty','Войди, чтобы видеть приложения учеников.'));return;}
    if(!STORE.list){box.append(el('p','osempty','Загрузка…'));return;}
    if(STORE.err){dbErr(box,STORE.err);return;}
    var l=STORE.list.filter(function(a){return (t!=='mine'||a.mine)&&stMatch(a.name,a.description);}).map(stUser);
    if(t==='mine'){var mc=el('div','stcta');mc.append(el('b',null,'Твои приложения'),el('p',null,'Здесь те, что уже выпущены. Черновики — в Студии кода.'),btn('Студия кода','mbtn go',function(){openApp('code');}));box.append(mc);}
    if(!l.length)box.append(el('p','osempty',t==='mine'?'Пока ни одно твоё приложение не выпущено.':'Ученики ещё не выпустили приложений. Стань первым!'));
    else stSection(box,t==='mine'?'Выпущены':'От учеников',l);
  }
}
function stUser(x){return {id:'u'+x.id,uid:x.id,t:x.name,i:x.icon,bg:UCOL[x.color]||UCOL.blue,d:x.description,user:1,raw:x,price:x.price||0};}
function stSection(box,title,list){
  if(!list.length)return;
  box.append(el('h3','sth',title));
  var g=el('div','stlist');
  list.forEach(function(a){
    var r=el('div','strow');var tx=el('div','sttx');tx.append(el('b',null,a.t),el('small',null,a.user?('@'+a.raw.author_nick+' · '+a.raw.installs+' '+plur(a.raw.installs,'загрузка','загрузки','загрузок')+(a.price?' · '+a.price+' 🪙':'')):a.d));
    r.append(appIcon(a,58),tx,stGet(a));
    r.addEventListener('click',function(e){if(!e.target.closest('button'))stDetail(a);});
    g.append(r);
  });
  box.append(g);
}
function stHas(a){return a.user?!!OS.uapps[a.uid]:appInstalled(a);}
function stGet(a){
  var has=stHas(a),buy=!has&&a.price&&!appOwned(a);
  var b=el('button','stget'+(has?' open':'')+(buy?' paid':''),has?'Открыть':buy?a.price+' 🪙':'Загрузить');
  b.addEventListener('click',async function(e){
    e.stopPropagation();
    if(stHas(a)){$('osSheet').classList.remove('show');openApp(a.id,e);return;}
    if(a.price&&!appOwned(a)){if(!await buyApp(a))return;b.classList.remove('paid');}
    if(a.user&&a.raw.code==null){await stLoad();var nx=STORE.list.filter(function(z){return z.id===a.uid;})[0];if(!nx||nx.code==null){osToast(Lx('Не получилось загрузить приложение','Could not get the app'));return;}a.raw=nx;}
    b.textContent='';b.classList.add('load');
    if(a.user){
      var x=a.raw;OS.uapps[x.id]={name:x.name,icon:x.icon,color:x.color,description:x.description,code:x.code,version:x.version||0};uappsSave();
      SB.rpc('ht_install_app',{app:x.id}).then(function(){});
    }else setInstalled(a.id,true);
    setTimeout(function(){b.classList.remove('load');b.classList.add('open');b.textContent='Открыть';osToast('«'+tr(a.t)+'» на домашнем экране');},700);
  });
  return b;
}
function stDetail(a){
  osSheet(function(box,close){
    box.classList.add('stdet');
    var hd=el('div','stdhd');var tx=el('div');tx.append(el('h2',null,a.t),el('small',null,a.user?'Автор: '+a.raw.author_name+' (@'+a.raw.author_nick+')':'HoroTube'));
    var acts=el('div','stdacts');acts.append(stGet(a));
    if(!a.core&&stHas(a))acts.append(btn('Удалить','mbtn',function(){if(a.user){delete OS.uapps[a.uid];uappsSave();}else setInstalled(a.id,false);close();openStore();}));
    tx.append(acts);hd.append(appIcon(a,110),tx);box.append(hd);
    var info=el('div','stinfo');
    if(a.user){info.append(stI(String(a.raw.installs),'загрузок'),stI(a.raw.version>1?'v'+a.raw.version:new Date(a.raw.published_at).toLocaleDateString(dloc()),a.raw.version>1?Lx('обновлено ','updated ')+new Date(a.raw.published_at).toLocaleDateString(dloc()):'выпущено'),stI('✓','проверено администрацией'));}
    else{info.append(stI(a.game?'Игра':'Приложение','категория'),stI(a.core?'Встроенное':a.price?(appOwned(a)?'Куплено':a.price+' 🪙'):'Бесплатно','цена'),stI('HoroTube','разработчик'));}
    box.append(info,el('p','stdesc',a.d||'Без описания'));
    if(a.user)box.append(el('p','avhint','Приложения учеников работают в «песочнице»: им не видны твой аккаунт, сообщения и интернет.'));
    if(a.user&&ME&&ME.role==='admin')box.append(btn('🚫 Убрать из HoroStore','mbtn',async function(){if(!confirm('Убрать «'+a.t+'» из HoroStore?'))return;var r=await SB.rpc('ht_unlist_app',{app:a.uid});if(r.error){alert(r.error.message);return;}STORE.list=null;close();openStore();}));
    var mr=el('div','mrow');mr.append(btn('Закрыть','mbtn',close));box.append(mr);
  });
}
function stI(v,l){var d=el('div');d.append(el('b',null,v),el('small',null,l));return d;}

/* ===== приложения учеников: запуск в песочнице =====
   iframe sandbox="allow-scripts" без allow-same-origin: у кода нет доступа к сайту,
   localStorage, cookies и аккаунту. CSP внутри запрещает интернет (fetch, картинки по ссылкам).
   Связь с сайтом — только через Horo.save / Horo.load / Horo.toast. */
var SBOX=new Map();
var SB_CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";
function sandboxDoc(code){
  var bridge="(function(){var P=parent,q={},n=0;function s(m){P.postMessage(m,'*');}"+
    "window.Horo={save:function(k,v){s({horo:'save',k:String(k).slice(0,40),v:JSON.stringify(v===undefined?null:v)});},"+
    "load:function(k){return new Promise(function(r){var id=++n;q[id]=r;s({horo:'load',k:String(k).slice(0,40),id:id});});},"+
    "toast:function(t){s({horo:'toast',m:String(t).slice(0,140)});},photo:function(d){s({horo:'photo',v:String(d)});}};"+
    "addEventListener('message',function(e){var d=e.data;if(e.source===P&&d&&d.horo==='val'&&q[d.id]){var v=null;try{v=JSON.parse(d.v);}catch(x){}q[d.id](v);delete q[d.id];}});"+
    "window.alert=function(t){Horo.toast(t);};window.confirm=function(){return true;};window.prompt=function(m,d){return d||'';};"+
    "['log','warn','error','info'].forEach(function(k){var o=console[k];console[k]=function(){try{s({horo:'log',k:k,m:[].map.call(arguments,function(a){try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(x){return String(a);}}).join(' ').slice(0,500)});}catch(x){}o.apply(console,arguments);};});"+
    "addEventListener('error',function(e){s({horo:'log',k:'error',m:String(e.message)+(e.lineno?' (строка '+e.lineno+')':'')});});})();";
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+SB_CSP+'">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif}body{padding:16px}</style>'+
    '<script>'+bridge+'<\/script></head><body>'+code+'</body></html>';
}
/* key — где хранятся данные приложения; onLog — консоль для Студии кода */
function sandboxFrame(code,key,onLog,builtin){
  var f=el('iframe','sbox');
  f.setAttribute('sandbox','allow-scripts');
  f.setAttribute('referrerpolicy','no-referrer');
  f.setAttribute('allow','');
  f.title='Приложение';
  var loads=0;
  f.addEventListener('load',function(){
    /* код попытался открыть другой сайт внутри окна — возвращаем приложение */
    if(++loads>1){loads=0;f.srcdoc=sandboxDoc('<p style="font:16px system-ui;color:#c00">'+Lx('Приложение пыталось открыть другой сайт. Это запрещено.','The app tried to open another website. This is not allowed.')+'</p>');if(onLog)onLog('error','Переход на другой сайт заблокирован');}
  });
  f.srcdoc=sandboxDoc(code);
  SBOX.set(f,{key:key,log:onLog,builtin:!!builtin});
  return f;
}
window.addEventListener('message',function(e){
  var info=null;SBOX.forEach(function(v,f){if(f.contentWindow===e.source)info=v;});
  if(!info)return;
  var d=e.data;if(!d||typeof d!=='object')return;
  /* данные приложения — свои у каждого аккаунта (старые общие читаем, пока нет своих) */
  var old='h_ua_'+info.key+'_',pre=ME&&ME.id?'h_ua_'+ME.id+'_'+info.key+'_':old;
  if(d.horo==='save'&&typeof d.k==='string'&&typeof d.v==='string'){
    if(d.v.length>50000){if(info.log)info.log('error','Horo.save: больше 50 000 символов не сохранить');return;}
    var tot=0;try{for(var k in localStorage)if(k.indexOf(pre)===0&&k!==pre+d.k)tot+=localStorage.getItem(k).length;}catch(er){}
    if(tot+d.v.length>200000){if(info.log)info.log('error','Horo.save: у приложения закончилось место');return;}
    try{localStorage.setItem(pre+d.k,d.v);}catch(er){}
  }else if(d.horo==='load'&&typeof d.k==='string'){
    var v=null;try{v=localStorage.getItem(pre+d.k);if(v==null&&pre!==old){v=localStorage.getItem(old+d.k);if(v!=null){localStorage.setItem(pre+d.k,v);localStorage.removeItem(old+d.k);}}}catch(er){}
    e.source.postMessage({horo:'val',id:d.id,v:v},'*');
  }else if(d.horo==='toast')osToast('📱 '+String(d.m).slice(0,140));
  else if(d.horo==='log'&&info.log)info.log(String(d.k),String(d.m));
  /* сохранить картинку в Фото могут только встроенные приложения (не код учеников) */
  else if(d.horo==='photo'&&info.builtin&&typeof d.v==='string'&&d.v.length<4e6&&/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(d.v)&&typeof xappPhoto==='function')xappPhoto(d.v);
});
function sandboxClean(){SBOX.forEach(function(v,f){if(!document.body.contains(f))SBOX.delete(f);});}
function runUserApp(id){
  var x=OS.uapps[id];if(!x)return;
  showPage('p-uapp');
  var b=$('uaBody');b.textContent='';sandboxClean();
  b.append(sandboxFrame(x.code,'s'+id));
  OS.app='u'+id;osRecent('u'+id);osBar();
  /* вышла новая версия — перезапускаем уже её */
  uappsCheck().then(function(u){if(OS.app==='u'+id&&u.some(function(z){return String(z.id)===String(id);})&&OS.uapps[id]){b.textContent='';sandboxClean();b.append(sandboxFrame(OS.uapps[id].code,'s'+id));}});
}
