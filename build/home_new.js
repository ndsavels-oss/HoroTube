/* ---------- домашний экран: страницы, перестановка иконок ---------- */
var HS={page:0,edit:false,drag:null,moved:0};
try{OS.layout=JSON.parse(localStorage.getItem('h_layout')||'null');}catch(e){}
function hsPhone(){return document.documentElement.classList.contains('phone');}
/* сколько иконок помещается на страницу (на телефоне первая — с виджетами) */
function hsCap(i){return hsPhone()&&i===0?12:24;}
/* раскладка по страницам: что я расставил сам + новые приложения в конец */
function hsPages(){
  var vis=APPS.filter(appVisible).map(function(a){return a.id;});
  var L=(Array.isArray(OS.layout)?OS.layout:[]).map(function(p){return (p||[]).filter(function(id){return vis.indexOf(id)>=0;});});
  if(!L.length)L=[[]];
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
  try{localStorage.setItem('h_layout',JSON.stringify(OS.layout));}catch(e){}
}
function drawHome(quiet){
  if(typeof wpApply==='function')wpApply();
  var box=$('hsApps'),wid=$('hsWid');
  box.classList.toggle('quiet',!!quiet);
  box.textContent='';
  var L=hsPages();if(HS.edit)L.push([]);
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
    if(!make||!HS.edit)return;
    var pg=el('div','hspage');pg.append(el('div','hsgrid'));box.append(pg);
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
}
