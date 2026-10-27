/* ===== СТЕКЛО, КАПСУЛЫ И ЖИВЫЕ ИКОНКИ ===== */
/* боковые иконки — плавающие капсулы, как на новых iPhone: основное, моё, админ */
(function(){
  var side=document.querySelector('.side'),groups=[['p-feed','p-shorts','p-chans'],['p-arcade','p-mine','p-msg','p-friends'],['p-admin']];
  var all=[].slice.call(side.querySelectorAll('a')),made=groups.map(function(){return el('div','sgrp');});
  all.forEach(function(a){
    var g=0;groups.forEach(function(x,i){if(x.indexOf(a.dataset.page)>=0)g=i;});
    a.dataset.tip=a.textContent.trim();
    made[g].append(a);
  });
  made.forEach(function(g){if(g.children.length)side.append(g);});
})();
/* режим «жидкого стекла»: включён сразу, выключается в меню профиля */
function glassOn(){try{return localStorage.getItem('h_glass')!=='0';}catch(e){return true;}}
function glassApply(){
  var on=glassOn();document.documentElement.classList.toggle('glass',on);
  $('pmGlass').textContent=on?'🫧 Стекло: вкл':'🫧 Стекло: выкл';
}
$('pmGlass').addEventListener('click',function(){try{localStorage.setItem('h_glass',glassOn()?'0':'1');}catch(e){}glassApply();});
glassApply();
/* меню-шторка: в полноэкранных чатах открывается тапом по левому краю, свайпом вправо или кнопкой ☰ */
function drawerOpen(){document.documentElement.classList.add('drawer');}
function drawerClose(){document.documentElement.classList.remove('drawer');}
(function(){
  var edge=el('div','edgezone');edge.title='Меню';
  edge.addEventListener('click',drawerOpen);
  document.body.append(edge);
  document.querySelector('.sideshade').addEventListener('click',drawerClose);
  document.querySelectorAll('.side a').forEach(function(a){a.addEventListener('click',drawerClose);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')drawerClose();});
  var sx=-1,sy=0;
  document.addEventListener('touchstart',function(e){var t=e.touches[0];sx=document.documentElement.classList.contains('chatfull')&&t.clientX<28?t.clientX:-1;sy=t.clientY;},{passive:true});
  document.addEventListener('touchmove',function(e){if(sx<0)return;var t=e.touches[0];if(t.clientX-sx>50&&Math.abs(t.clientY-sy)<40){sx=-1;drawerOpen();}},{passive:true});
})();
/* живые иконки: пружинка при нажатии, а страница «вырастает» из иконки, как приложение на iPhone */
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('.side a,.tbb,.icon-btn,.tgfi,.tgsend');
  if(!a)return;
  var i=a.querySelector('em,svg,.av')||a;
  i.classList.remove('boing');void i.offsetWidth;i.classList.add('boing');
  i.addEventListener('animationend',function(){i.classList.remove('boing');},{once:true});
  if(a.matches('.side a,.tbb')){var r=a.getBoundingClientRect(),h=document.documentElement;h.style.setProperty('--ox',(r.left+r.width/2)+'px');h.style.setProperty('--oy',(r.top+r.height/2)+'px');}
},true);
