import sys
F='/mnt/project-files/horotube/HoroTube.new.html'
B='/tmp/claude-0/-home-claude/1ebcb15d-9505-568f-97a9-abf3f2df7554/scratchpad/build/'
s=open(F).read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: sys.exit('count %d for: %s'%(n,a[:80]))
    s=s.replace(a,b)
# --- видео в историях ---
rep('<input id="scF" type="file" accept="image/*">','<input id="scF" type="file" accept="image/*,video/mp4,video/webm,video/quicktime">')
rep('class="avhint">Видна всем 24 часа. Выкладывать могут только пользователи с премиумом.','class="avhint">Видна всем 24 часа. Фото или видео до 30 секунд (до 15 МБ). Выкладывать могут только пользователи с премиумом.')
rep("""  if(s.image_url&&safeImg(s.image_url)){var im=new Image();im.referrerPolicy='no-referrer';im.src=s.image_url;m.append(im);}
  if(s.text)m.append(el('p','svt',s.text));
  clearTimeout(SV.t);SV.t=setTimeout(svNext,5000);""","""  svStopVideo();SV.dur=5000;
  if(s.image_url&&safeImg(s.image_url)&&/\\.(mp4|webm|mov)$/i.test(s.image_url)){
    /* видео-история: играет до конца (не дольше 30 секунд), потом следующая */
    var vd=document.createElement('video');vd.src=s.image_url;vd.playsInline=true;vd.autoplay=true;vd.preload='auto';vd.className='svvid';
    vd.addEventListener('loadedmetadata',function(){SV.dur=Math.min(30,vd.duration||5)*1000+300;clearTimeout(SV.t);SV.t=setTimeout(svNext,SV.dur);});
    vd.addEventListener('ended',function(){clearTimeout(SV.t);svNext();});
    m.append(vd);
    vd.play().catch(function(){vd.muted=true;vd.play().catch(function(){});});/* без жеста пользователя браузер разрешает только без звука */
    SV.dur=30300;
  }else if(s.image_url&&safeImg(s.image_url)){var im=new Image();im.referrerPolicy='no-referrer';im.src=s.image_url;m.append(im);}
  if(s.text)m.append(el('p','svt',s.text));
  clearTimeout(SV.t);SV.t=setTimeout(svNext,SV.dur);""")
rep("function svClose(){clearTimeout(SV.t);$('stv').classList.remove('show');}",
    "function svStopVideo(){var v=document.querySelector('#svMedia video');if(v){v.pause();v.removeAttribute('src');v.load();}}\nfunction svClose(){clearTimeout(SV.t);svStopVideo();$('stv').classList.remove('show');}")
rep("  SV.t=setTimeout(svNext,5000);\n});","  SV.t=setTimeout(svNext,SV.dur||5000);\n});")
rep("if(!confirm('Удалить эту историю?')){SV.t=setTimeout(svNext,5000);return;}","if(!confirm('Удалить эту историю?')){SV.t=setTimeout(svNext,SV.dur||5000);return;}")
rep("""    if(f){
      var im;try{im=await loadImg(f);}catch(e){m.textContent='Не удалось открыть изображение';return;}""","""    if(f&&/^video\\//.test(f.type)){
      if(!/^video\\/(mp4|webm|quicktime)$/.test(f.type)){m.textContent='Видео: подходит mp4, webm или mov';return;}
      if(f.size>15*1048576){m.textContent='Видео больше 15 МБ. Обрежь его покороче';return;}
      m.textContent='Проверяю видео…';
      var info;try{info=await probeVideo(f);}catch(e){m.textContent='Не удалось прочитать видео';return;}
      if(info.dur>30.5){m.textContent='Видео для истории: не длиннее 30 секунд (у тебя '+Math.round(info.dur)+' с)';return;}
      if(info.hard>=2){m.textContent='❌ Видео отклонено: слишком много открытого тела';return;}
      m.textContent='Загружаю…';
      var ext=f.type==='video/webm'?'webm':f.type==='video/quicktime'?'mov':'mp4',vpath=ME.id+'/'+Date.now()+'.'+ext,vb=SB.storage.from('stories');
      var vu=await vb.upload(vpath,f,{contentType:f.type,cacheControl:'3600'});
      if(vu.error){m.textContent='Не получилось: '+rus(vu.error.message)+(/mime|type|size|large/i.test(vu.error.message)?' (нужно выполнить all_in_one.sql)':'');return;}
      rec.image_url=vb.getPublicUrl(vpath).data.publicUrl;rec.path=vpath;
    }else if(f){
      var im;try{im=await loadImg(f);}catch(e){m.textContent='Не удалось открыть изображение';return;}""")
rep("title:String(s.text||'картинка').slice(0,300)","title:String(s.text||(/\\.(mp4|webm|mov)$/i.test(s.image_url||'')?'видео':'картинка')).slice(0,300)")
# --- админ: смена пароля и надёжная выгрузка списка ---
rep("""    b.push(['Убрать аватарку',async function(){""","""    b.push(['🔑 Новый пароль',async function(){
      /* старый пароль узнать нельзя: Supabase хранит только его необратимый отпечаток */
      var abc='abcdefghkmnpqrstuvwxyz23456789',g='';for(var i=0;i<8;i++)g+=abc[Math.random()*abc.length|0];
      var np=prompt('Новый пароль для '+(u.name||u.nick)+' (@'+u.nick+'). Можно оставить предложенный или ввести свой (от 6 символов):',g);
      if(np===null)return;np=np.trim();
      if(np.length<6){alert('Пароль: не короче 6 символов');return;}
      var q=await SB.rpc('ht_admin_set_password',{target:u.id,pass:np});
      if(q.error){alert(q.error.code==='PGRST202'?'Сначала выполните all_in_one.sql в Supabase':'Не получилось: '+q.error.message);return;}
      prompt('Готово! Новый пароль для @'+u.nick+' (скопируйте и передайте ученику лично):',np);
    }]);
    b.push(['Убрать аватарку',async function(){""")
rep("""  document.body.append(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);""","""  var file=new File(['\\ufeff'+lines.join('\\r\\n')],a.download,{type:'text/csv'});
  /* на телефоне и во встроенных браузерах обычное скачивание часто не срабатывает: предлагаем «Поделиться» */
  if(matchMedia('(pointer:coarse)').matches&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:'Ученики HoroTube'});return;}catch(e){if(e&&e.name==='AbortError')return;}
  }
  document.body.append(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},60000);
  /* запасной вариант: таблица прямо на странице, её можно выделить и скопировать */
  var box=el('div','adrow'),ta=el('textarea','csvbox');ta.readOnly=true;ta.value=lines.join('\\n');
  var cp=el('button','tab','Скопировать');cp.addEventListener('click',function(){ta.select();try{navigator.clipboard.writeText(ta.value);}catch(e){document.execCommand('copy');}cp.textContent='Скопировано ✓';});
  box.append(el('span',null,'Если файл не скачался, вот список. Его можно скопировать и вставить в Excel или Google Таблицы. Паролей в списке нет: их не знает никто, даже админ. Ученику, который забыл пароль, нажмите «🔑 Новый пароль».'),cp,ta);
  var old=document.querySelector('.csvwrap');if(old)old.remove();
  box.classList.add('csvwrap');$('adBody').prepend(box);""")
rep("/* === СТИЛИ: КОНЕЦ === */",".csvbox{width:100%;min-height:160px;margin-top:8px;border:2px solid var(--bg);border-radius:12px;padding:10px;font:12px/1.4 monospace;background:var(--bg);color:var(--ink)}\n.csvwrap{flex-wrap:wrap}\n.svvid{width:100%;height:100%;object-fit:contain;background:#000}\n/* === СТИЛИ: КОНЕЦ === */")
# --- админ: все переписки и контакты ---
rep("""      <button class="tab" data-t="w">🕵️ Проверка</button>""","""      <button class="tab" data-t="w">🕵️ Проверка</button>
      <button class="tab" data-t="d">💬 Переписки</button>""")
rep("""  else if(tab==='w')adWatch();""","""  else if(tab==='w')adWatch();
  else if(tab==='d')adDms();""")
rep("""    b.push(['🔑 Новый пароль',async function(){""","""    b.push(['💬 Контакты',function(){AD_DM_USER=u.id;tab='d';document.querySelectorAll('[data-t]').forEach(function(x){x.classList.toggle('on',x.dataset.t==='d');});adDraw();}]);
    b.push(['🔑 Новый пароль',async function(){""")
rep("/* ===== ЯЗЫК: русский / English ===== */",open(B+'addms.js').read()+"\n/* ===== ЯЗЫК: русский / English ===== */")
rep("/* === СТИЛИ: КОНЕЦ === */",".adsel{border:2px solid var(--bg);border-radius:12px;padding:9px 12px;font:inherit;background:var(--white);color:var(--ink);margin-bottom:10px;max-width:100%}\n/* === СТИЛИ: КОНЕЦ === */")
open(F,'w').write(s)
print('ok3',len(s))
