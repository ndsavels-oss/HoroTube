/* Самообновление без загрузчика: если на устройстве сохранена более новая версия из базы
   (её скачивает приложение «Обновления»), открываем её вместо этого файла.
   Если новая версия в прошлый раз не запустилась, сами возвращаемся к этой. */
(function(){
  if(window.HT_LOADER)return;
  var V='/*HT_VERSION*/',c,ls;
  try{ls=window.localStorage;c=JSON.parse(ls.getItem('ht_rel_cache')||'null');}catch(e){return;}
  if(!c||!c.v||typeof c.h!=='string'||c.h.indexOf('<html')<0)return;
  var x=String(c.v).split(/\D+/).map(Number),y=V.split(/\D+/).map(Number),d=0;
  for(var i=0;i<Math.max(x.length,y.length)&&!d;i++)d=(x[i]||0)-(y[i]||0);
  if(d<=0)return;
  try{if(ls.getItem('ht_boot')===c.v){ls.removeItem('ht_rel_cache');ls.removeItem('ht_boot');return;}ls.setItem('ht_boot',c.v);}catch(e){return;}
  window.HT_LOADER={v:c.v,self:1};
  var h=c.h.replace(/<head([^>]*)>/i,function(m){return m+'<script>window.HT_LOADER={v:'+JSON.stringify(c.v)+',self:1};<\/script>';});
  document.write('<plaintext style="display:none">');
  document.addEventListener('DOMContentLoaded',function(){document.open();document.write(h);document.close();});
})();
/* Если HoroOS не запустился (ошибка в коде, обрезанный файл), показываем причину вместо пустого старого сайта. */
(function(){
  var E=[];window.addEventListener('error',function(e){if(E.length<3)E.push((e.message||'error')+(e.lineno?' (строка '+e.lineno+')':''));});
  window.addEventListener('load',function(){setTimeout(function(){
    if(document.documentElement.classList.contains('os'))return;
    var d=document.createElement('div');d.setAttribute('style','position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#B00020;color:#fff;padding:14px 16px;border-radius:14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)');
    var len=document.documentElement.outerHTML.length;
    d.textContent='HoroTube не запустился. '+(E.length?'Ошибка: '+E.join(' | '):'Похоже, файл обрезан или скопирован не целиком.')+' Версия '+(window.HT_LOADER&&HT_LOADER.v||'/*HT_VERSION*/')+', размер '+len+'. Пришли этот текст в чат.';
    var b=document.createElement('button');b.textContent='Вернуть прежнюю версию';b.setAttribute('style','display:block;margin-top:10px;border:0;border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;cursor:pointer');
    b.onclick=function(){try{localStorage.removeItem('ht_rel_cache');localStorage.removeItem('ht_boot');}catch(e){}location.reload();};
    if(window.HT_LOADER&&HT_LOADER.self)d.appendChild(b);
    document.body.appendChild(d);
  },2500);});
})();
