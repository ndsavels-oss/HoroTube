/* ===== Игры на весь экран (26.10): без шапки; выйти — ✕ в углу или смахнуть полоску внизу ===== */
function gfsOn(){var a=OS.app&&appById(OS.app);return !!(a&&a.game&&!OS.side&&!pageOn('p-home'));}
function gfsSync(){
  var H=document.documentElement,on=gfsOn();
  if(on===H.classList.contains('gamefs'))return;
  H.classList.toggle('gamefs',on);
  if(pageOn('p-dash'))dashFit();
}
(function(){
  var ob=osBar;osBar=function(){ob.apply(this,arguments);gfsSync();};
  var x=el('button','gfsx','✕');x.id='gfsX';x.title=Lx('Выйти из игры','Exit game');
  x.addEventListener('click',function(){goHome();});document.body.append(x);
  /* Cube Run: большие стрелки прыжка по бокам, под большие пальцы */
  var host=$('p-dash');
  if(host)['l','r'].forEach(function(s){
    var b=el('button','dasharr '+s,'▲');b.setAttribute('aria-label',Lx('Прыжок','Jump'));
    b.addEventListener('pointerdown',function(e){e.preventDefault();if(DS.on)DS.jump();});
    host.append(b);
  });
  window.addEventListener('resize',function(){if(pageOn('p-dash'))dashFit();});
})();
/* высота поля Cube Run: в полноэкранном режиме — под форму экрана (ширина всегда 720) */
function dashFit(){
  var c=$('dashC');if(!c)return;
  var h=260;
  if(document.documentElement.classList.contains('gamefs'))h=Math.max(260,Math.min(520,Math.round(720*innerHeight/Math.max(1,innerWidth))));
  if(c.height!==h)c.height=h;
}
