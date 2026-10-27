/* ===== ТЕЛЕФОН: сайт сам понимает, что открыт на телефоне, и включает мобильный вид =====
   Телефон = узкий экран или сенсорный экран мобильного устройства. Вид меняется сразу при повороте экрана. */
var PHONE={mq:matchMedia('(max-width:760px)'),touch:matchMedia('(pointer:coarse)'),on:null};
function isPhone(){return PHONE.mq.matches||(PHONE.touch.matches&&/Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)&&Math.min(screen.width,screen.height)<=820);}
function phoneApply(){
  var on=isPhone();
  if(on===PHONE.on)return;
  PHONE.on=on;
  document.documentElement.classList.toggle('phone',on);
  if(!on)document.documentElement.classList.remove('more');
}
/* нижняя панель, как в приложениях: Главная, Шортс, «+», Сообщения, Друзья и «Ещё» */
(function(){
  var bar=el('nav','tabbar');bar.setAttribute('aria-label','Нижнее меню');
  function sideLink(page,mode){return document.querySelector('.side a[data-page="'+page+'"]'+(mode?'[data-mode="'+mode+'"]':''));}
  function tb(icon,label,fn,id){
    var b=el('button','tbb');if(id)b.id=id;
    b.append(el('em',null,icon),el('span',null,label));
    b.addEventListener('click',function(){document.documentElement.classList.remove('more');fn();});
    bar.append(b);return b;
  }
  tb('🏠','Главная',function(){sideLink('p-feed','all').click();}).dataset.page='p-feed';
  tb('⚡','Шортс',function(){sideLink('p-shorts').click();}).dataset.page='p-shorts';
  var up=tb('＋','',function(){$('btnUp').click();});up.classList.add('tbup');up.setAttribute('aria-label','Создать видео');
  var mb=tb('💬','Чаты',function(){sideLink('p-msg').click();},'tbMsg');mb.dataset.page='p-msg';
  mb.append(el('i','tbdot'));
  tb('🤝','Друзья',function(){sideLink('p-friends').click();}).dataset.page='p-friends';
  var more=tb('☰','Ещё',function(){});
  more.addEventListener('click',function(e){e.stopPropagation();document.documentElement.classList.toggle('more');});
  document.body.append(bar);
  var shade=el('div','sideshade');shade.addEventListener('click',function(){document.documentElement.classList.remove('more');});
  document.body.append(shade);
  /* в меню «Ещё» после выбора пункта меню закрывается */
  document.querySelectorAll('.side a').forEach(function(a){a.addEventListener('click',function(){document.documentElement.classList.remove('more');});});
  /* подсветка текущего раздела и точка непрочитанных */
  function sync(){
    var p=curPage();
    bar.querySelectorAll('.tbb').forEach(function(b){b.classList.toggle('on',b.dataset.page===p&&(p!=='p-feed'||mode==='all'));});
    mb.classList.toggle('new',$('dmDot').style.display!=='none'||!!$('msgBadge').textContent);
  }
  new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style'],childList:false});
  new MutationObserver(sync).observe($('msgBadge'),{childList:true,characterData:true,subtree:true});
  sync();
})();
(PHONE.mq.addEventListener?PHONE.mq.addEventListener('change',phoneApply):PHONE.mq.addListener(phoneApply));
window.addEventListener('resize',phoneApply);
phoneApply();
