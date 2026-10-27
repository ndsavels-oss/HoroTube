/* ===== HoroTube внутри HoroOS: левое плавающее меню, модерация видео, жесты, многозадачность ===== */
var YTI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
var YT_ICO={
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  home:'<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  shorts:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  chans:'<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M8 2l4 4 4-4M10 10.5v5l4.5-2.5z"/>',
  lessons:'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  creative:'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1-2 0-3h2.5A4.5 4.5 0 0 0 21 11.5C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  mychan:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/>',
  mine:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10.5 10.5v5l4-2.5z"/>',
  up:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  mod:'<path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'
};
function ytSvg(k){return YTI+YT_ICO[k]+'</svg>';}
var YT_ITEMS=[
  {k:'home',t:'Главная',page:'p-feed',mode:'all'},
  {k:'shorts',t:'Шортс',page:'p-shorts'},
  {k:'chans',t:'Каналы',page:'p-chans'},
  {k:'lessons',t:'Уроки',page:'p-feed',mode:'teach'},
  {k:'creative',t:'Творчество',page:'p-feed',mode:'stud'},
  {sep:1},
  {k:'mychan',t:'Мой канал',me:1,go:function(){OS.ytMyChan=true;if(OS.ytadm){OS.ytadm=false;ytAdmMark();}$('pmChan').click();}},
  {k:'mine',t:'Мои видео',page:'p-mine',me:1},
  {k:'up',t:'Загрузить видео',me:1,go:function(){$('btnUp').click();},nomark:1},
  {sep:1,admin:1},
  {k:'mod',t:'Модерация видео',admin:1,go:function(){openYtAdmin();}}
];
try{if(localStorage.getItem('h_ytmini')==='1')document.documentElement.classList.add('ytmini');}catch(e){}
function ytInit(){
  var nav=el('nav','ytrail');nav.id='ytRail';nav.setAttribute('aria-label','Меню HoroTube');
  var tg=el('button','ytit yttog');tg.innerHTML=ytSvg('menu');tg.append(el('span',null,'HoroTube'));tg.title='Свернуть или развернуть меню';
  tg.addEventListener('click',function(){
    var h=document.documentElement;
    if(h.classList.contains('phone')){h.classList.toggle('ytopen');return;}
    h.classList.toggle('ytmini');try{localStorage.setItem('h_ytmini',h.classList.contains('ytmini')?'1':'0');}catch(e){}
    setTimeout(ytRailMark,360);
  });
  nav.append(tg,el('i','ytind'));
  YT_ITEMS.forEach(function(it){
    if(it.sep){var s=el('i','ytsep');if(it.admin)s.dataset.admin=1;nav.append(s);return;}
    var b=el('button','ytit');b.dataset.k=it.k;b.innerHTML=ytSvg(it.k);b.append(el('span',null,it.t));b.title=it.t;
    if(it.admin)b.dataset.admin=1;if(it.me)b.dataset.me=1;
    b.addEventListener('click',function(){
      document.documentElement.classList.remove('ytopen');
      if(it.me&&!ME){openAuth(false);return;}
      ytNav();
      if(it.go)it.go();
      else{
        if(it.page!=='p-admin'&&OS.ytadm){OS.ytadm=false;ytAdmMark();}
        var s=document.querySelector('.side a[data-page="'+it.page+'"]'+(it.mode?'[data-mode="'+it.mode+'"]':''));
        if(s)s.click();else showPage(it.page);
      }
      ytRailMark();
    });
    nav.append(b);
  });
  document.body.append(nav);
  /* на телефоне: тап мимо раскрытого меню — свернуть */
  document.addEventListener('pointerdown',function(e){if(document.documentElement.classList.contains('ytopen')&&!e.target.closest('.ytrail'))document.documentElement.classList.remove('ytopen');});
  ytRailMark();
}
/* мягкий переход между разделами внутри приложения */
function ytNav(){var h=document.documentElement;h.classList.add('ytnav');clearTimeout(OS._ytT);OS._ytT=setTimeout(function(){h.classList.remove('ytnav');},450);}
function ytRailCur(){
  var p=curPage();if(p!=='p-chan')OS.ytMyChan=false;
  if(p==='p-admin')return OS.ytadm?'mod':'';
  if(p==='p-feed')return mode==='teach'?'lessons':mode==='stud'?'creative':'home';
  if(p==='p-shorts')return 'shorts';
  if(p==='p-chans')return 'chans';
  if(p==='p-chan')return OS.ytMyChan?'mychan':'chans';
  if(p==='p-mine')return 'mine';
  return OS.ytLast||'';
}
function ytRailMark(){
  var nav=$('ytRail');if(!nav)return;
  var adm=!!ME&&ME.role==='admin';
  nav.querySelectorAll('[data-admin]').forEach(function(x){x.style.display=adm?'':'none';});
  var k=ytRailCur();if(curPage()!=='p-watch')OS.ytLast=k;
  var on=null;
  nav.querySelectorAll('.ytit[data-k]').forEach(function(b){var m=b.dataset.k===k;b.classList.toggle('on',m);if(m)on=b;});
  var ind=nav.querySelector('.ytind');
  if(on){ind.style.opacity=1;ind.style.transform='translateY('+on.offsetTop+'px)';}else ind.style.opacity=0;
}
/* модерация только про HoroTube: на проверке, жалобы, все видео */
var YT_ADM_TABS=['v','r','a'];
function openYtAdmin(){
  if(!ME||ME.role!=='admin')return;
  OS.ytadm=true;ytAdmMark();
  var s=document.querySelector('.side a[data-page="p-admin"]');if(s)s.click();
  if(YT_ADM_TABS.indexOf(tab)<0){var b=document.querySelector('#adPanel [data-t="v"]');if(b)b.click();}
  osOnPage('p-admin');
}
function ytAdmMark(){
  document.documentElement.classList.toggle('ytadm',!!OS.ytadm);
  var t=document.querySelector('#p-admin .title');if(t)t.textContent=OS.ytadm?'Модерация видео':'Админка';
  if(!OS.ytadm)return;
  if(YT_ADM_TABS.indexOf(tab)<0){var b=document.querySelector('#adPanel [data-t="v"]');if(b&&pageOn('p-admin'))b.click();}
}
/* ---------- выход домой смахиванием вверх ---------- */
function osExit(p){
  p=p||document.querySelector('.page.show:not(.side2)');
  var H=document.documentElement;
  if(!p||H.classList.contains('home')){goHome();return;}
  if(H.classList.contains('noanim')){goHome();return;}
  var r=p.getBoundingClientRect(),cs=getComputedStyle(H);
  var ox=parseFloat(cs.getPropertyValue('--ox'))||innerWidth/2,oy=parseFloat(cs.getPropertyValue('--oy'))||innerHeight-60;
  var cur=p.style.transform||'none';
  var tx=ox-(r.left+r.width/2),ty=oy-(r.top+r.height/2);
  if(OS.side)closeSplit(true);
  var an=p.animate([{transform:cur,borderRadius:p.style.borderRadius||'0px',opacity:1},{transform:'translate('+tx+'px,'+ty+'px) scale(.12)',borderRadius:'60px',opacity:.15}],{duration:330,easing:'cubic-bezier(.4,0,.2,1)'});
  /* пока шла анимация, могли открыть другое приложение — тогда домой не уходим */
  an.onfinish=function(){p.style.transform='';p.style.borderRadius='';p.style.transition='';if(p.classList.contains('show')&&!H.classList.contains('home'))goHome();};
}
function osGestures(hi){
  var st=null,H=document.documentElement;
  function page(){return document.querySelector('.page.show:not(.side2)');}
  function start(x,y){
    if(H.classList.contains('home'))return false;
    var p=page();if(!p)return false;
    st={y:y,t:Date.now(),p:p,d:0};p.style.transition='none';p.style.willChange='transform';
    return true;
  }
  function move(y){
    if(!st)return;
    var d=Math.max(0,st.y-y);st.d=d;
    var s=Math.max(.5,1-d/800);
    st.p.style.transform='translateY('+(-d*.45)+'px) scale('+s+')';
    st.p.style.borderRadius=Math.min(42,d/3)+'px';
    H.classList.toggle('osswipe',d>8);
  }
  function end(){
    if(!st)return;var d=st.d,v=d/Math.max(1,Date.now()-st.t),p=st.p;st=null;
    H.classList.remove('osswipe');p.style.willChange='';
    if(d>120||(d>50&&v>.7)){osExit(p);return;}
    p.style.transition='transform .42s cubic-bezier(.2,.9,.3,1.25),border-radius .42s';
    p.style.transform='';p.style.borderRadius='';
    setTimeout(function(){p.style.transition='';},450);
    if(d>24)dockShow();
    else if(d<6){hi.classList.remove('nudge');void hi.offsetWidth;hi.classList.add('nudge');osToast(Lx('Смахни полоску вверх, чтобы выйти домой','Swipe the bar up to go home'));}
  }
  /* мышь, перо и палец по самой полоске */
  hi.addEventListener('pointerdown',function(e){if(start(e.clientX,e.clientY)){try{hi.setPointerCapture(e.pointerId);}catch(er){}e.preventDefault();}});
  hi.addEventListener('pointermove',function(e){move(e.clientY);});
  hi.addEventListener('pointerup',end);hi.addEventListener('pointercancel',end);
  /* палец от нижнего края экрана, даже мимо полоски */
  var tid=null;
  document.addEventListener('touchstart',function(e){var t=e.touches[0];if(st||e.touches.length>1||t.clientY<innerHeight-26)return;if(start(t.clientX,t.clientY))tid=t.identifier;},{passive:true});
  document.addEventListener('touchmove',function(e){if(tid===null)return;for(var i=0;i<e.touches.length;i++)if(e.touches[i].identifier===tid)move(e.touches[i].clientY);},{passive:true});
  document.addEventListener('touchend',function(){if(tid!==null){tid=null;end();}});
  document.addEventListener('touchcancel',function(){if(tid!==null){tid=null;end();}});
  osMtInit();osDockDrag();
}
/* ---------- многозадачность: меню «•••» сверху ---------- */
function osMtInit(){
  var b=el('button','osmt');b.id='osMt';b.setAttribute('aria-label','Несколько приложений сразу');b.title='Несколько приложений сразу';
  b.append(el('i'),el('i'),el('i'));
  var m=el('div','osmtm');m.id='osMtM';
  function item(ic,t,fn,cls){var x=el('button',cls||'');x.innerHTML=ic;x.append(el('span',null,t));x.addEventListener('click',function(e){e.stopPropagation();m.classList.remove('show');fn();});return x;}
  var I1='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"/></svg>';
  var I2='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/></svg>';
  var I3='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="7" height="14" rx="2"/><rect x="14" y="5" width="7" height="14" rx="2"/></svg>';
  var I4='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14l4-4 4 4"/><path d="M5 20h14"/></svg>';
  function draw(){
    m.textContent='';
    var row=el('div','osmtr');
    row.append(item(I1,'Весь экран',function(){if(OS.side)closeSplit();},OS.side?'':'on'));
    if(!H().classList.contains('phone'))row.append(item(I2,'Рядом',function(){if(!OS.side)pickSplit();},OS.side?'on':''));
    row.append(item(I3,'Все окна',openSwitcher),item(I4,'Домой',function(){osExit();}));
    m.append(row);
    if(!H().classList.contains('phone'))m.append(el('p',null,Lx('Ещё способ: смахни чуть вверх, чтобы появился док, и перетащи значок в правую часть экрана.','Another way: swipe up a little to show the dock, then drag an icon to the right side of the screen.')));
  }
  function H(){return document.documentElement;}
  b.addEventListener('click',function(e){e.stopPropagation();draw();m.classList.toggle('show');});
  document.addEventListener('pointerdown',function(e){if(!e.target.closest('.osmt,.osmtm'))m.classList.remove('show');});
  document.body.append(b,m);
}
/* перетащить значок из дока вправо — приложение откроется рядом */
function osDockDrag(){
  var dz=el('div','osdrop');dz.append(el('b',null,'Отпусти, чтобы открыть рядом'));document.body.append(dz);
  var d=null;
  $('dock').addEventListener('pointerdown',function(e){
    var b=e.target.closest('.dapp');if(!b||document.documentElement.classList.contains('home'))return;
    d={b:b,x0:e.clientX,y0:e.clientY,go:false};
  });
  document.addEventListener('pointermove',function(e){
    if(!d)return;
    if(!d.go){
      if(d.y0-e.clientY<26&&Math.abs(e.clientX-d.x0)<26)return;
      var a=appById(d.b.dataset.app);if(!a){d=null;return;}
      d.a=a;d.go=true;var r=d.b.getBoundingClientRect();
      d.c=d.b.cloneNode(true);d.c.className='dapp osdghost';d.c.style.left=r.left+'px';d.c.style.top=r.top+'px';document.body.append(d.c);
      clearTimeout(_dockT);
      try{d.b.setPointerCapture(e.pointerId);}catch(er){}
    }
    d.c.style.transform='translate('+(e.clientX-d.x0)+'px,'+(e.clientY-d.y0)+'px) scale(1.2)';
    var right=e.clientX>innerWidth*.55&&e.clientY<innerHeight-120;
    dz.classList.toggle('show',right&&!!d.a.split&&!document.documentElement.classList.contains('phone'));
  });
  function up(e){
    if(!d)return;var x=d;d=null;
    if(!x.go)return;
    x.c.remove();var drop=dz.classList.contains('show');dz.classList.remove('show');
    x.b.dataset.dragged=Date.now();
    if(drop)openSplit(x.a);
    else if(e.clientY<innerHeight-120){if(x.a.split||!e||e.clientX<=innerWidth*.55)openApp(x.a.id);else osToast(Lx('Это приложение открывается только на весь экран','This app only opens full screen'));}
    dockHide();
  }
  document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
}
