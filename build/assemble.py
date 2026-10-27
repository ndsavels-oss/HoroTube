import sys
SP='/tmp/claude-0/-home-claude/1ebcb15d-9505-568f-97a9-abf3f2df7554/scratchpad/'
H='/mnt/project-files/horotube/'
s=open(H+'HoroTube.merged.html').read()
imp=open(H+'HoroTube.html').read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: sys.exit('count %d for: %s'%(n,a[:80]))
    s=s.replace(a,b)
# 1. фильтр мата из улучшенной версии
a=s.index("var LOOK={");b=s.index("function hasContact(t){")
ia=imp.index("var LOOK={");ib=imp.index("function hasContact(t){")
s=s[:a]+imp[ia:ib]+s[b:]
# 2. иконка мессенджера в шапке
rep('''  <button class="icon-btn" id="btnBell" title="Уведомления" aria-label="Уведомления">''',
'''  <button class="icon-btn" id="btnDm" title="Сообщения" aria-label="Сообщения">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>
    <span class="dot" id="dmDot" style="display:none"></span>
  </button>
  <button class="icon-btn" id="btnBell" title="Уведомления" aria-label="Уведомления">''')
# 3. вкладка «Личные»
rep('''    <button class="tab on" data-m="ann">Объявления</button>''','''    <button class="tab" data-m="dm">✉️ Личные</button>
    <button class="tab on" data-m="ann">Объявления</button>''')
rep('''  if(msgTab==='ann')drawAnn();''','''  if(msgTab!=='dm')dmStop();
  if(msgTab==='dm')drawDm();
  else if(msgTab==='ann')drawAnn();''')
rep('''  if(curPage()==='p-msg'){
    var ta=''','''  if(curPage()==='p-msg'&&msgTab!=='dm'){
    var ta=''')
rep('''  }else checkUnread();
},30000);''','''  }else if(curPage()!=='p-msg')checkUnread();
},30000);''')
rep('''  var n=(a.count||0)+(c.count||0)+nv;
  $('bellDot').style.display=n?'':'none';
  $('msgBadge').textContent=n?'('+n+')':'';''','''  var n=(a.count||0)+(c.count||0)+nv,dn=await dmUnread();
  $('bellDot').style.display=n?'':'none';
  $('msgBadge').textContent=n+dn?'('+(n+dn)+')':'';''')
rep('''  msgTab='ann';chatUser=null;REPORTED={};''','''  msgTab='ann';chatUser=null;REPORTED={};DM.peer=null;DM.ro=null;dmStop();$('dmDot').style.display='none';''')
# переход на вкладку «Личные» сбрасывает открытую переписку
rep('''  b.addEventListener('click',function(){msgTab=b.dataset.m;openMsg();});''','''  b.addEventListener('click',function(){msgTab=b.dataset.m;if(msgTab==='dm'){DM.peer=null;DM.ro=null;}openMsg();});''')
# 4. шахматы в аркаде
rep('''    <div class="game" data-game="p-dash">🔷 Geometry Dash</div>''','''    <div class="game" data-game="p-dash">🔷 Geometry Dash</div>
    <div class="game" data-game="p-chess">♟ Шахматы</div>''')
rep('''<section class="main page" id="p-dash">''','''<section class="main page" id="p-chess">
  <button class="back gback">← К играм</button>
  <div class="gbox wide chess">
    <h2 class="title">♟ Шахматы</h2>
    <div class="chips chmode">
      <button class="tab on" data-cm="ai">🤖 С компьютером</button>
      <button class="tab" data-cm="net">🌐 Онлайн</button>
      <button class="tab" data-cm="learn">🎓 Обучение</button>
    </div>
    <div class="chpanel" id="chPanel"></div>
    <p class="gs" id="chInv"></p>
    <p class="chinfo" id="chInfo"></p>
    <div class="chb" id="chBoard"></div>
    <div class="chbtns" id="chBtns"></div>
    <p class="chmoves" id="chMoves"></p>
  </div>
</section>

<section class="main page" id="p-dash">''')
rep('''function stopGames(){dashStop();''','''function stopGames(){if(window.chessStop)chessStop();dashStop();''')
# 5. админка: личные сообщения и истории в очереди и жалобах
rep('''  var kinds={comment:'Комментарий',chat:'Сообщение в чат',video_flag:'Видео'};''','''  var kinds={comment:'Комментарий',chat:'Сообщение в чат',video_flag:'Видео',dm:'Личное сообщение',story:'История'};''')
rep('''    if(n.kind==='chat')b.unshift(['Открыть чат',function(){''','''    if(n.kind==='dm')b.unshift(['Открыть переписку',function(){dmOpenById(n.target_id);}]);
    if(n.kind==='story')b.unshift(['Удалить историю',async function(){
      if(!confirm('Удалить эту историю?'))return;
      var q=await SB.from('stories').select('path').eq('id',n.target_id).maybeSingle();
      await SB.from('stories').delete().eq('id',n.target_id);
      if(q.data&&q.data.path)SB.storage.from('stories').remove([q.data.path]);
      loadStories();done();
    }]);
    if(n.kind==='chat')b.unshift(['Открыть чат',function(){''')
rep('''    if(x.kind==='comment'){''','''    if(x.kind==='dm'){
      row('Личное сообщение: «'+(x.title||'')+'»'+cnt,[
        ['Открыть переписку',function(){dmOpenById(x.target_id);}],
        ['Удалить сообщение',async function(){
          if(!confirm('Удалить это сообщение?'))return;
          await SB.from('ht_dm').delete().eq('id',x.target_id);close();
        }],['Оставить',close]]);
    }else if(x.kind==='story'){
      row('История: «'+(x.title||'')+'»'+cnt,[
        ['Удалить историю',async function(){
          if(!confirm('Удалить эту историю?'))return;
          var q=await SB.from('stories').select('path').eq('id',x.target_id).maybeSingle();
          await SB.from('stories').delete().eq('id',x.target_id);
          if(q.data&&q.data.path)SB.storage.from('stories').remove([q.data.path]);
          close();loadStories();
        }],['Оставить',close]]);
    }else if(x.kind==='comment'){''')
# 6. жалоба на историю
rep('''<button id="svDel" title="Удалить">🗑</button>''','''<button id="svRep" title="Пожаловаться">⚠</button><button id="svDel" title="Удалить">🗑</button>''')
rep('''$('svDel').style.display=(G.uid===ME.id||ME.role==='admin')?'':'none';''','''$('svDel').style.display=(G.uid===ME.id||ME.role==='admin')?'':'none';$('svRep').style.display=G.uid===ME.id?'none':'';''')
rep('''$('svX').addEventListener('click',svClose);''','''$('svX').addEventListener('click',svClose);
$('svRep').addEventListener('click',async function(){
  var s=STO[SV.g].items[SV.i];clearTimeout(SV.t);
  if(!REPORTED['story'+s.id]){
    if(confirm('Пожаловаться на эту историю? Её проверит администратор.')){
      var r=await SB.from('reports').insert({kind:'story',target_id:s.id,title:String(s.text||'картинка').slice(0,300)});
      if(r.error&&!/duplicate|unique/i.test(r.error.message))alert('Не получилось: '+r.error.message);else{REPORTED['story'+s.id]=1;alert('Жалоба отправлена');}
    }
  }else alert('Жалоба уже отправлена');
  SV.t=setTimeout(svNext,5000);
});''')
rep("(нужен stories.sql в Supabase)","(нужен messenger_stories.sql в Supabase)")
# 7. стили
css=open(SP+'build/style.css').read()
rep('''/* === СТИЛИ: КОНЕЦ === */''',css+'''/* === СТИЛИ: КОНЕЦ === */''')
# 8. код перед переводом интерфейса
js=open(SP+'chess_engine.js').read()+'\n'+open(SP+'chess_ui.js').read()+'\n'+open(SP+'dm.js').read()+'\n'
rep('''/* ===== ЯЗЫК: русский / English ===== */''',js+'''/* ===== ЯЗЫК: русский / English ===== */''')
i18n=open(SP+'build/i18n.js').read()
a=s.index('var DICT=Object.keys(I18N)')
s=s[:a]+i18n+s[a:]
open(H+'HoroTube.new.html','w').write(s)
print('ok',len(s))
