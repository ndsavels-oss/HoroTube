/* ===== Студия кода: свои приложения для HoroStore ===== */
var CD={list:null,cur:null,timer:0,dirty:false};
var CD_TPL={
  blank:['Пустое','<h1>Привет!</h1>\n<p>Это моё приложение.</p>\n\n<style>\n  h1 { color: #007AFF; }\n</style>\n\n<script>\n  // пиши код здесь\n<\/script>'],
  counter:['Счётчик','<div class="box">\n  <h1 id="n">0</h1>\n  <button id="plus">+1</button>\n  <button id="reset">Сброс</button>\n</div>\n\n<style>\n  .box { text-align: center; margin-top: 40px; }\n  h1 { font-size: 72px; margin: 10px; }\n  button { font-size: 20px; padding: 12px 24px; border: 0; border-radius: 14px; background: #007AFF; color: #fff; margin: 4px; }\n</style>\n\n<script>\n  let n = 0;\n  const show = () => document.getElementById("n").textContent = n;\n  // Horo.load / Horo.save хранят данные приложения на устройстве\n  Horo.load("n").then(v => { n = v || 0; show(); });\n  document.getElementById("plus").onclick = () => { n++; show(); Horo.save("n", n); };\n  document.getElementById("reset").onclick = () => { n = 0; show(); Horo.save("n", n); Horo.toast("Сброшено"); };\n<\/script>'],
  todo:['Список дел','<h2>📋 Мои дела</h2>\n<input id="t" placeholder="Новое дело">\n<button id="add">Добавить</button>\n<ul id="list"></ul>\n\n<style>\n  input { font-size: 18px; padding: 10px; border-radius: 10px; border: 1px solid #ccc; width: 60%; }\n  button { font-size: 18px; padding: 10px 16px; border: 0; border-radius: 10px; background: #34C759; color: #fff; }\n  li { font-size: 18px; padding: 8px 0; cursor: pointer; }\n  li.done { text-decoration: line-through; color: #999; }\n</style>\n\n<script>\n  let items = [];\n  function draw() {\n    const ul = document.getElementById("list");\n    ul.innerHTML = "";\n    items.forEach((it, i) => {\n      const li = document.createElement("li");\n      li.textContent = it.t;\n      if (it.d) li.className = "done";\n      li.onclick = () => { it.d = !it.d; save(); };\n      ul.append(li);\n    });\n  }\n  function save() { Horo.save("items", items); draw(); }\n  document.getElementById("add").onclick = () => {\n    const v = document.getElementById("t").value.trim();\n    if (v) { items.push({ t: v, d: false }); document.getElementById("t").value = ""; save(); }\n  };\n  Horo.load("items").then(v => { items = v || []; draw(); });\n<\/script>'],
  game:['Игра: поймай круг','<canvas id="c" width="360" height="480"></canvas>\n<p id="s">Очки: 0</p>\n\n<style>\n  body { text-align: center; background: #111; color: #fff; }\n  canvas { background: #222; border-radius: 16px; touch-action: none; max-width: 100%; }\n</style>\n\n<script>\n  const c = document.getElementById("c"), g = c.getContext("2d");\n  let x = 180, y = 240, r = 30, score = 0;\n  function move() { x = r + Math.random() * (c.width - 2 * r); y = r + Math.random() * (c.height - 2 * r); }\n  function draw() {\n    g.clearRect(0, 0, c.width, c.height);\n    g.fillStyle = "hsl(" + (score * 30) + ",90%,60%)";\n    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();\n    requestAnimationFrame(draw);\n  }\n  c.onpointerdown = e => {\n    const b = c.getBoundingClientRect(), px = (e.clientX - b.left) * c.width / b.width, py = (e.clientY - b.top) * c.height / b.height;\n    if (Math.hypot(px - x, py - y) < r) { score++; r = Math.max(10, r - 1); move(); document.getElementById("s").textContent = "Очки: " + score; }\n  };\n  setInterval(move, 1200);\n  draw();\n<\/script>']
};
var CD_ST={draft:['Черновик','gray'],review:['На проверке','orange'],published:['В HoroStore','green'],rejected:['Вернули на доработку','red']};
/* выпущенное приложение: автор правит код, а в HoroStore живёт проверенная версия, пока не выпустят обновление */
function cdLive(a){return !!(a.listed&&a.pub_code!=null);}
function cdChanged(a){return cdLive(a)&&(a.code!==a.pub_code||(a.price||0)!==(a.pub_price||0));}
function cdState(a){
  if(!cdLive(a))return CD_ST[a.status]||CD_ST.draft;
  var v=a.version?' · v'+a.version:'';
  if(a.status==='review')return [Lx('Обновление на проверке','Update in review'),'orange'];
  if(a.status==='rejected')return [Lx('Обновление вернули','Update returned')+v,'red'];
  if(cdChanged(a))return [Lx('Есть изменения','Changed')+v,'blue'];
  return [Lx('В HoroStore','In HoroStore')+v,'green'];
}
function cdSendUpdate(a){
  osSheet(function(box,close){
    var n=(a.version||1)+1;
    box.append(el('h2',null,'🔄 '+Lx('Обновление «','Update “')+a.name+Lx('»','”')),
      el('p','avhint',Lx('Админ проверит новую версию. После выпуска у всех, кто загрузил приложение, оно заменится на версию ','An admin will check it. After release everyone who has the app gets version ')+n+Lx('. Пока идёт проверка, в HoroStore остаётся текущая.','. Until then HoroStore keeps the current one.')));
    var t=inp('textarea','',Lx('Что нового? Например: добавил уровни, исправил кнопку','What’s new? e.g. new levels, fixed a button'));t.className='cdwhat';t.maxLength=800;
    var msg=el('p','merr');
    var mr=el('div','mrow');
    var go=btn(Lx('Отправить','Send'),'mbtn go',async function(){
      msg.textContent='';var w=t.value.trim();
      if(isBad(w)){msg.textContent=Lx('В тексте есть недопустимые слова','Inappropriate words in the text');return;}
      go.disabled=true;
      var r=await SB.from('ht_mail').insert({to_admins:true,to_id:null,subject:'Обновление: '+a.name+' (версия '+n+')',
        body:'Здравствуйте! Я исправил и доработал приложение «'+a.name+'». Посмотрите, пожалуйста, и выпустите обновление.\n\nЧто нового: '+(w||'—')+((a.price||0)!==(a.pub_price||0)?'\n\nНовая цена: '+(a.price?a.price+' Tubek':'бесплатно'):''),app_id:a.id}).select('id').single();
      go.disabled=false;
      if(r.error||!r.data){msg.textContent=r.error?r.error.message:Lx('Не отправлено','Not sent');return;}
      a.status='review';a.review_note=null;close();osToast(Lx('Обновление отправлено на проверку','Update sent for review'));cdDraw();
      if(typeof mlLoad==='function')mlLoad().catch(function(){});
    });
    mr.append(btn(Lx('Отмена','Cancel'),'mbtn',close),go);box.append(t,msg,mr);setTimeout(function(){t.focus();},50);
  });
}
async function openCode(id){
  showPage('p-code');
  var b=$('cdBody');b.textContent='';
  if(!needSB(b,'Войди в аккаунт, чтобы писать свои приложения.'))return;
  if(!CD.list||!CD.dirty){
    var r=await SB.from('ht_user_apps').select('*').eq('author_id',ME.id).order('updated_at',{ascending:false});
    if(r.error){dbErr(b,r.error);return;}
    CD.list=r.data||[];
  }
  if(id!==undefined)CD.cur=id;
  if(CD.cur&&!CD.list.some(function(a){return a.id===CD.cur;}))CD.cur=null;
  cdDraw();
}
function cdDraw(){
  var b=$('cdBody');b.textContent='';
  var wrap=el('div','cdwrap'+(CD.cur?' open':''));
  var side=el('div','cdside');
  side.append(el('h2','iptitle','Студия кода'));
  side.append(btn('＋ Новое приложение','mbtn go cdnew',cdNew));
  CD.list.forEach(function(a){
    var r=el('button','cdapp'+(CD.cur===a.id?' on':''));
    r.append(appIcon({i:a.icon,bg:UCOL[a.color]||UCOL.blue},36));
    var tx=el('div');tx.append(el('b',null,a.name));var st=cdState(a);tx.append(el('small','cdst '+st[1],st[0]));
    r.append(tx);r.addEventListener('click',function(){cdSave();CD.cur=a.id;cdDraw();});
    side.append(r);
  });
  if(!CD.list.length)side.append(el('p','avhint','У тебя пока нет приложений. Нажми «Новое приложение» и выбери шаблон.'));
  var help=el('details','cdhelp');help.append(el('summary',null,'Как это работает?'));
  help.append(el('p',null,'1. Пиши HTML, CSS и JavaScript в одном окне.'),el('p',null,'2. Нажми ▶ Запустить — справа увидишь, что получилось. Ошибки появятся в консоли.'),el('p',null,'3. Horo.save("ключ", данные) и Horo.load("ключ") сохраняют данные на устройстве. Horo.toast("текст") показывает подсказку.'),el('p',null,'4. Готово? Нажми «Отправить в HoroStore»: письмо с приложением уйдёт администрации. После проверки оно появится в магазине.'),el('p',null,'5. Нашёл ошибку или придумал новое? Исправляй код прямо здесь и нажми «Отправить обновление». Пока админ проверяет, в HoroStore работает старая версия, а после выпуска у всех заменится на новую.'),el('p',null,'Интернет, аккаунт и сообщения приложению недоступны — так безопаснее для всех.'));
  side.append(help);
  wrap.append(side);
  var a=CD.list.filter(function(x){return x.id===CD.cur;})[0];
  var main=el('div','cdmain');
  if(!a){main.append(el('div','osempty','Выбери приложение слева или создай новое.'));wrap.append(main);b.append(wrap);return;}
  var top=el('div','cdtop');
  top.append(btn('‹','ipback cdback',function(){cdSave();CD.cur=null;cdDraw();}));
  var ic=inp('text',a.icon,'✨',8);ic.className='cdicon';ic.title='Значок (эмодзи)';
  var nm=inp('text',a.name,'Название',30);nm.className='cdname';
  var col=el('div','cdcols');
  Object.keys(UCOL).forEach(function(k){var c=el('button','cdcol'+(a.color===k?' on':''));c.style.background=UCOL[k];c.title=k;c.addEventListener('click',function(){a.color=k;CD.dirty=true;col.querySelectorAll('.cdcol').forEach(function(z){z.classList.toggle('on',z===c);});});col.append(c);});
  var st=cdState(a);var stEl=el('span','cdst '+st[1],st[0]);
  top.append(ic,nm,col,stEl);
  main.append(top);
  if(a.status==='rejected'&&a.review_note)main.append(el('p','cdnote','💬 Администрация: '+a.review_note));
  if(cdLive(a)){var lv=el('p','cdlive');main.append(lv);}
  function liveInfo(){
    var s2=cdState(a);stEl.className='cdst '+s2[1];stEl.textContent=s2[0];var sd=document.querySelector('.cdapp.on .cdst');if(sd){sd.className='cdst '+s2[1];sd.textContent=s2[0];}
    if(!lv)return;lv.textContent='';
    if(a.status==='review')lv.append(Lx('⏳ Новая версия на проверке. Пока в HoroStore работает версия ','⏳ The new version is in review. HoroStore still runs version ')+(a.version||1)+'.');
    else if(cdChanged(a)){lv.append(Lx('✏️ Ты изменил приложение. У остальных пока версия ','✏️ You changed the app. Others still have version ')+(a.version||1)+Lx('. Отправь обновление, когда будет готово.','. Send an update when ready.'));
      lv.append(' ',btn(Lx('↺ Вернуть выпущенную','↺ Restore released'),'cdundo',function(){if(!confirm(Lx('Заменить твой код выпущенной версией? Изменения пропадут.','Replace your code with the released version? Changes will be lost.')))return;ta.value=a.pub_code;a.code=a.pub_code;a.price=a.pub_price||0;ps.value=a.price;phint();lines();dirty();run();liveInfo();}));}
    else lv.append(Lx('✅ В HoroStore твоя последняя версия ','✅ HoroStore has your latest version ')+(a.version||1)+Lx('. Меняй код, если хочешь доработать.','. Edit the code to improve it.'));
  }
  var ds=inp('text',a.description,'Короткое описание для HoroStore',300);ds.className='cddesc';
  main.append(ds);
  /* цена в Tubek: 0 — бесплатно; автор получает 70% с каждой покупки */
  var pr=el('div','cdprice');var ps=el('select','cdpsel');
  [0,5,10,15,20,30,50].forEach(function(v){var o=el('option',null,v?v+' 🪙':Lx('Бесплатно','Free'));o.value=v;if((a.price||0)===v)o.selected=true;ps.append(o);});
  var ph=el('small','cdphint');
  function phint(){var v=a.price||0;ph.textContent=(v?Lx('Ты получишь ','You get ')+Math.floor(v*0.7)+Lx(' 🪙 с каждой покупки',' 🪙 per purchase'):Lx('Все смогут загрузить бесплатно','Everyone can get it for free'))+
    (a.status==='published'&&v!==(a.pub_price||0)?Lx('. Новая цена заработает после проверки администрацией.','. The new price applies after review.'):'');}
  ps.addEventListener('change',function(){a.price=+ps.value;phint();dirty();});
  pr.append(el('b',null,Lx('Цена','Price')),ps,ph);phint();main.append(pr);
  var split=el('div','cdsplit');
  var edw=el('div','cdedw');var ln=el('pre','cdln');var ta=inp('textarea',a.code,'');ta.className='cded';ta.spellcheck=false;ta.setAttribute('autocapitalize','off');ta.setAttribute('autocomplete','off');ta.wrap='off';
  function lines(){var n=(ta.value.match(/\n/g)||[]).length+1,s='';for(var i=1;i<=n;i++)s+=i+'\n';ln.textContent=s;}
  ta.addEventListener('scroll',function(){ln.scrollTop=ta.scrollTop;});
  ta.addEventListener('keydown',function(e){
    if(e.key==='Tab'){e.preventDefault();var s=ta.selectionStart;ta.setRangeText('  ',s,ta.selectionEnd,'end');ta.dispatchEvent(new Event('input'));}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();}
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();cdSave(true);}
  });
  edw.append(ln,ta);lines();
  var pv=el('div','cdpv');var pvh=el('div','cdpvh');pvh.append(el('b',null,'Предпросмотр'));
  var frameBox=el('div','cdframe');var con=el('div','cdcon');
  function log(k,m){var l=el('div','cdlog '+k,m);con.append(l);con.scrollTop=con.scrollHeight;}
  function run(){
    a.code=ta.value;frameBox.textContent='';con.textContent='';sandboxClean();
    frameBox.append(sandboxFrame(a.code,'p'+a.id,log));
    log('info','▶ Запущено '+new Date().toLocaleTimeString(dloc()));
  }
  pvh.append(btn('▶ Запустить','mbtn go',run));
  pv.append(pvh,frameBox,con);
  split.append(edw,pv);main.append(split);
  var bar=el('div','cdbar');
  var saved=el('span','cdsaved','Сохранено');
  bar.append(saved,btn('Шаблон…','mbtn',function(){cdTpl(function(k){if(ta.value.trim()&&!confirm('Заменить код шаблоном?'))return;ta.value=CD_TPL[k][1];ta.dispatchEvent(new Event('input'));run();});}),
    btn('📁 '+Lx('В Файлы','To Files'),'mbtn',async function(){a.code=ta.value;var f=await flSaveText({name:a.name+'.html',kind:'code',mime:'text/html',body:a.code,src:'code'});if(f)osToast(Lx('Код сохранён в Файлы','Code saved to Files'));}),
    btn('🗑 Удалить','mbtn',async function(){if(!confirm('Удалить приложение «'+a.name+'» насовсем?'))return;var r=await SB.from('ht_user_apps').delete().eq('id',a.id);if(r.error){alert(r.error.message);return;}CD.list=CD.list.filter(function(x){return x.id!==a.id;});CD.cur=null;cdDraw();}),
    btn(cdLive(a)?'🔄 '+Lx('Отправить обновление','Send update'):'📨 Отправить в HoroStore','mbtn go cdsend',async function(){
      if(a.status==='review'&&!confirm('Приложение уже на проверке. Отправить новую версию?'))return;
      if(!(await cdSave(true)))return;
      if(cdLive(a)){
        if(!cdChanged(a)){osToast(Lx('Изменений нет: в HoroStore уже эта версия','No changes: HoroStore already has this version'));return;}
        cdSendUpdate(a);return;
      }
      openMailCompose({toAdmins:true,subject:'Новое приложение: '+a.name,body:'Здравствуйте! Посмотрите, пожалуйста, моё приложение «'+a.name+'» и выпустите его в HoroStore.\n\n'+(a.description||'')+(a.price?'\n\nЦена: '+a.price+' Tubek':'\n\nБесплатное'),app:a});
    }));
  main.append(bar);
  function dirty(){CD.dirty=true;saved.textContent='Изменено…';clearTimeout(CD.timer);CD.timer=setTimeout(function(){cdSave();},1500);if(lv&&!dirty.t)dirty.t=setTimeout(function(){dirty.t=0;liveInfo();},300);}
  ta.addEventListener('input',function(){a.code=ta.value;lines();dirty();});
  nm.addEventListener('input',function(){a.name=nm.value;dirty();});
  ic.addEventListener('input',function(){a.icon=ic.value;dirty();});
  ds.addEventListener('input',function(){a.description=ds.value;dirty();});
  col.addEventListener('click',dirty);
  CD.saved=saved;liveInfo();
  wrap.append(main);b.append(wrap);
  run();
}
async function cdSave(loud){
  clearTimeout(CD.timer);
  var a=CD.list&&CD.list.filter(function(x){return x.id===CD.cur;})[0];
  if(!a||(!CD.dirty&&!loud))return true;
  if(!a.name.trim()){if(loud)alert('Напиши название приложения');return false;}
  if(isBad(a.name+' '+a.description)){alert('В названии или описании есть недопустимые слова');return false;}
  var up={name:a.name.trim(),icon:a.icon||'✨',color:a.color,description:a.description||'',code:a.code};if(a.price!=null)up.price=a.price;
  var r=await SB.from('ht_user_apps').update(up).eq('id',a.id).select('status,listed,review_note').single();
  if(r.error){if(CD.saved)CD.saved.textContent='Не сохранено';alert(r.error.message);return false;}
  CD.dirty=false;if(CD.saved)CD.saved.textContent='Сохранено';
  return true;
}
function cdTpl(fn){
  osSheet(function(box,close){
    box.append(el('h2',null,'Выбери шаблон'));
    var g=el('div','cdtpls');
    Object.keys(CD_TPL).forEach(function(k){var t=btn(CD_TPL[k][0],'cdtpl',function(){close();fn(k);});g.append(t);});
    var mr=el('div','mrow');mr.append(btn('Отмена','mbtn',close));box.append(g,mr);
  });
}
function cdNew(){
  cdTpl(async function(k){
    var nm=prompt('Как назовём приложение?',CD_TPL[k][0]);if(!nm||!nm.trim())return;
    if(isBad(nm)){alert('В названии есть недопустимые слова');return;}
    var r=await SB.from('ht_user_apps').insert({name:nm.trim().slice(0,30),icon:['✨','🚀','🎯','🧩','🎲','📋'][Math.floor(Math.random()*6)],color:Object.keys(UCOL)[Math.floor(Math.random()*8)],code:CD_TPL[k][1]}).select('*').single();
    if(r.error){alert(r.error.message);return;}
    CD.list.unshift(r.data);CD.cur=r.data.id;cdDraw();
  });
}
