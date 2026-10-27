/* ===== Почта: письма учителям и администрации (не мессенджер) ===== */
var ML={box:'in',list:[],cur:null,unread:0,people:null};
function mlBoxes(){var b=[['in','📥','Входящие'],['sent','📤','Отправленные']];if(ME&&ME.role==='admin')b.push(['adm','🏫','Администрация'],['apps','📦',Lx('На проверку','To review')]);b.push(['trash','🗑','Корзина']);return b;}
/* корзина: у отправителя и получателя своя отметка */
function mlTrashed(m){return m.from_id===ME.id?!!m.from_trash:!!m.to_trash;}
async function mlLoad(){
  if(!SB||!ME)return;
  var r=await SB.from('ht_mail').select('*').order('created_at',{ascending:false}).limit(300);
  if(r.error){ML.err=r.error;ML.list=[];return;}
  ML.err=null;ML.list=r.data||[];
  /* то, что пролежало в корзине больше 30 дней, удаляем насовсем (раз за сеанс) */
  if(!ML.purged&&ML.list.some(function(m){var t=m.from_id===ME.id?m.from_trash:m.to_trash;return t&&Date.now()-tms(t)>30*864e5;})){ML.purged=1;SB.rpc('ht_mail_mark',{m:-1,act:'purge'}).then(function(){mlLoad();});}
  await loadPub(ML.list.map(function(m){return m.from_id;}).concat(ML.list.map(function(m){return m.to_id;})));
  mlCount();
}
function mlMine(m){return m.to_id===ME.id||(m.to_admins&&ME.role==='admin'&&m.from_id!==ME.id);}
function mlCount(){
  ML.unread=ML.list.filter(function(m){return mlMine(m)&&!m.read_at&&!mlTrashed(m);}).length;
  if(window.drawDock)drawDock();
  if(pageOn('p-home'))drawHome();
}
function mlName(id){var p=PUB[id];return id===(ME&&ME.id)?Lx('Я','Me'):p?(p.name||p.nick):'Пользователь';}
function mlIn(m){
  if(ML.box==='trash')return mlTrashed(m);
  if(mlTrashed(m))return false;
  if(ML.box==='in')return m.to_id===ME.id;
  if(ML.box==='sent')return m.from_id===ME.id;
  if(ML.box==='adm')return m.to_admins;
  if(ML.box==='apps')return m.to_admins&&(m.app_id||m.item_kind);
}
async function openMail(){
  showPage('p-mail');
  var b=$('mlBody');b.textContent='';
  if(!needSB(b,'Войди в аккаунт, чтобы пользоваться Почтой.'))return;
  b.append(el('div','osempty','Загрузка…'));
  await mlLoad();
  mlDraw();
}
function mlDraw(){
  var b=$('mlBody');b.textContent='';if(!ML.cur)b.classList.remove('open');
  if(ML.err){dbErr(b,ML.err);return;}
  var l=el('div','ip2l mll'),r=el('div','ip2r mlr');
  var hd=el('div','mlhd');hd.append(el('h2','iptitle','Почта'),btn('✏️','icon-btn mlnew',function(){openMailCompose({});}));hd.lastChild.title='Новое письмо';
  l.append(hd);
  var bx=el('div','mlboxes');
  mlBoxes().forEach(function(x){
    var n=ML.list.filter(function(m){var o=ML.box;ML.box=x[0];var ok=mlIn(m)&&!m.read_at&&mlMine(m);ML.box=o;return ok;}).length;
    var t=el('button','mlbox'+(ML.box===x[0]?' on':''));t.append(el('i',null,x[1]),el('span',null,x[2]));if(n)t.append(el('em',null,String(n)));
    t.addEventListener('click',function(){ML.box=x[0];ML.cur=null;mlDraw();});bx.append(t);
  });
  l.append(bx);
  var list=ML.list.filter(mlIn);
  if(ML.box==='trash'&&list.length){var et=el('div','mltrh');et.append(el('small',null,Lx('Письма удаляются насовсем через 30 дней','Letters are deleted forever after 30 days')),
    btn(Lx('Очистить','Empty'),'mbtn',async function(){if(!confirm(Lx('Удалить все письма из корзины насовсем?','Delete all letters in the trash forever?')))return;var x=await SB.rpc('ht_mail_mark',{m:0,act:'purge'});if(x.error){alert(x.error.message);return;}ML.cur=null;await mlLoad();mlDraw();}));l.append(et);}
  if(!list.length)l.append(el('p','osempty',ML.box==='in'?'Писем пока нет.':ML.box==='trash'?Lx('Корзина пуста','The trash is empty'):'Здесь пусто.'));
  list.forEach(function(m){
    var it=el('button','mlit'+(ML.cur===m.id?' on':'')+(!m.read_at&&mlMine(m)?' new':''));
    var who=ML.box==='sent'?(m.to_admins?'Администрации':mlName(m.to_id)):mlName(m.from_id);
    var top=el('div','mltop');top.append(el('b',null,who),el('small',null,dmWhen(m.created_at)));
    it.append(top,el('div','mlsub',(m.app_id?'📦 ':'')+((m.files||[]).length?'📎 ':'')+m.subject),el('div','mlprev',m.body.replace(/\s+/g,' ').slice(0,90)));
    it.addEventListener('click',function(){ML.cur=m.id;mlDraw();$('mlBody').classList.add('open');mlRead(m);});
    l.append(it);
  });
  var m=ML.list.filter(function(x){return x.id===ML.cur;})[0];
  r.append(btn('‹ Почта','ipback',function(){$('mlBody').classList.remove('open');}));
  if(!m)r.append(el('div','osempty','Выбери письмо'));
  else mlView(r,m);
  b.append(l,r);
}
async function mlRead(m){
  if(m.read_at||!mlMine(m))return;
  m.read_at=new Date().toISOString();mlCount();
  await SB.rpc('ht_mail_mark',{m:m.id,act:'read'});
}
function mlView(r,m){
  var v=el('div','mlview');
  var h=el('div','mlvh');
  h.append(avatarEl(m.from_id,mlName(m.from_id),44));
  var t=el('div');t.append(el('b',null,mlName(m.from_id)),el('small',null,'Кому: '+(m.to_admins?'Администрация HoroTube':mlName(m.to_id))+' · '+new Date(m.created_at).toLocaleString(dloc(),{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})));
  h.append(t);v.append(h,el('h2','mlsubj',m.subject),el('div','mltext',m.body));
  if((m.files||[]).length)v.append(mlFiles(m));
  if(m.app_code!=null){
    var c=el('div','mlapp');
    c.append(appIcon({i:m.app_icon||'✨',bg:UCOL.blue},52));
    var ct=el('div');ct.append(el('b',null,m.app_name||'Приложение'),el('small',null,(m.app_update?'🔄 '+Lx('Обновление выпущенного приложения','Update of a released app'):Lx('Новое приложение для HoroStore','New app for HoroStore'))+' · '+fmtSize(m.app_code.length)+' · '+(m.app_price?m.app_price+' 🪙':Lx('бесплатное','free'))));c.append(ct);
    var pv=btn('▶ Посмотреть','mbtn go',function(){mlPreview(m);});
    var cd=btn(Lx('Код','Code'),'mbtn',function(){osSheet(function(box,close){box.classList.add('wide');box.append(el('h2',null,m.app_name),el('pre','mlcode',m.app_code),el('div','mrow'));box.lastChild.append(btn('Закрыть','mbtn',close));});});
    var acts=el('div','mlappa');acts.append(pv,cd);c.append(acts);
    v.append(c);
    if(ME.role==='admin'&&m.to_admins){
      var adm=el('div','mladm');
      adm.append(el('p','avhint','Проверь приложение: что показывает, нет ли обидного. Код работает в песочнице без доступа к аккаунтам и интернету. Выпускается ровно та версия, что в этом письме.'));
      if(m.app_update)adm.append(el('p','avhint',Lx('Это обновление: после выпуска оно заменит текущую версию у всех, кто загрузил приложение. Если вернёшь на доработку, в HoroStore останется прежняя версия.','This is an update: once released it replaces the current version for everyone. If returned, HoroStore keeps the old version.')));
      adm.append(btn(m.app_update?'✅ '+Lx('Выпустить обновление','Release update'):'✅ Выпустить в HoroStore','mbtn go',function(){mlReview(m,true,adm.rv);}),btn('↩️ Вернуть на доработку','mbtn',function(){mlReview(m,false,adm.rv);}));
      var arv=revApp(m.app_code,m.app_name);adm.rv=arv;v.append(revCard(arv,arv.game?Lx('Автоотзыв об игре','Auto review of the game'):Lx('Автоотзыв о приложении','Auto review of the app')));
      v.append(adm);
    }
  }
  if(m.item_kind)mlItem(v,m);
  var acts2=el('div','mlacts');
  var canReply=m.from_id!==ME.id;
  if(canReply)acts2.append(btn('↩️ Ответить','mbtn',function(){openMailCompose({to:m.from_id,subject:/^Re: /.test(m.subject)?m.subject:'Re: '+m.subject,reply:m.id,quote:m});}));
  if(mlTrashed(m)){
    acts2.append(btn('↩︎ '+Lx('Вернуть из корзины','Restore'),'mbtn go',async function(){var x=await SB.rpc('ht_mail_mark',{m:m.id,act:'restore'});if(x.error){alert(x.error.message);return;}await mlLoad();ML.cur=null;mlDraw();osToast(Lx('Письмо вернулось','Letter restored'));}));
    acts2.append(btn('🗑 '+Lx('Удалить насовсем','Delete forever'),'mbtn',async function(){if(!confirm(Lx('Удалить письмо насовсем?','Delete the letter forever?')))return;var x=await SB.rpc('ht_mail_mark',{m:m.id,act:'delete'});if(x.error){alert(x.error.message);return;}ML.list=ML.list.filter(function(z){return z.id!==m.id;});ML.cur=null;mlCount();mlDraw();}));
  }else acts2.append(btn('🗑 Удалить','mbtn',async function(){var x=await SB.rpc('ht_mail_mark',{m:m.id,act:'trash'});if(x.error){alert(x.error.message);return;}await mlLoad();ML.cur=null;mlDraw();osToast(Lx('Письмо в корзине','Letter moved to trash'));}));
  v.append(acts2);
  r.append(v);
}
function mlPreview(m){
  osSheet(function(box,close){
    box.classList.add('wide');
    box.append(el('h2',null,(m.app_icon||'✨')+' '+(m.app_name||'Приложение')));
    var con=el('div','cdcon');
    var fr=el('div','mlpvf');fr.append(sandboxFrame(m.app_code,'r'+m.id,function(k,t){con.append(el('div','cdlog '+k,t));}));
    box.append(fr,con,el('div','mrow'));box.lastChild.append(btn('Закрыть','mbtn',function(){close();sandboxClean();}));
  });
}
async function mlReview(m,ok,rv){
  var note=await mlNote(ok,rv);
  if(note===null)return;
  var r=await SB.rpc('ht_review_app',{mail:m.id,ok:ok,note:note});
  if(r.error){alert(r.error.message);return;}
  osToast(ok?(m.app_update?Lx('Обновление выпущено','Update released'):'Приложение выпущено в HoroStore'):'Автор получит письмо с комментарием');
  STORE.list=null;await mlLoad();mlDraw();
}
async function openMailCompose(o){
  if(!SB||!ME){openAuth(false);return;}
  if(!ML.people){var p=await SB.rpc('ht_mail_people');ML.people=p.error?[]:p.data||[];}
  osSheet(function(box,close){
    box.classList.add('mlcomp');
    var hd=el('div','mlch');hd.append(btn('Отмена','mbtn',close),el('b',null,'Новое письмо'));
    var send=btn('Отправить','mbtn go');hd.append(send);box.append(hd);
    var to=el('select','mlto');
    var adm=el('option',null,'🏫 Администрация HoroTube');adm.value='admins';to.append(adm);
    ML.people.forEach(function(p){var x=el('option',null,(p.role==='admin'?'🔑 ':p.role==='teacher'?'🎓 ':'')+p.name+' (@'+p.nick+')');x.value=p.id;to.append(x);});
    if(o.to&&!ML.people.some(function(p){return p.id===o.to;})){var x=el('option',null,mlName(o.to));x.value=o.to;to.append(x);}
    to.value=o.to||'admins';if(o.app)to.disabled=true;
    var sub=inp('text',o.subject||'','Тема',120);sub.className='mlsubin';
    var body=inp('textarea',(o.body||'')+(o.quote?'\n\n— '+mlName(o.quote.from_id)+' писал(а):\n> '+o.quote.body.split('\n').join('\n> '):''),'Текст письма',5000);body.className='mlbody';
    box.append(field('Кому:',to),field('Тема:',sub));
    if(o.app){var ch=el('div','mlatt');ch.append(appIcon({i:o.app.icon,bg:UCOL[o.app.color]||UCOL.blue},32),el('b',null,o.app.name),el('small',null,'приложение будет приложено к письму'));box.append(ch);}
    box.append(body);
    /* вложения: с устройства, из «Файлов» или новый документ */
    var att=[],ab=el('div','mlatts'),ad=btn('📎 '+Lx('Прикрепить','Attach'),'mbtn mlattb',function(){flPop(ad,[
      ['⤒ '+Lx('С устройства','From device'),function(){flPickDevice(true,function(fs){fs.forEach(function(f){addAtt({file:f,name:f.name,size:f.size,type:f.type});});});}],
      ['📁 '+Lx('Из Файлов','From Files'),function(){flPick(5-att.length,function(l){l.forEach(function(f){addAtt({fl:f,name:flFileName(f),size:f.size});});});}],
      ['📄 '+Lx('Создать документ','Create a document'),function(){mlNewDoc(function(f){addAtt({fl:f,name:flFileName(f),size:f.size});});}]
    ]);});
    function addAtt(x){
      if(att.length>=5){osToast(Lx('Не больше 5 файлов','At most 5 files'));return;}
      if(x.size>25*1048576){alert('«'+x.name+'» '+Lx('больше 25 МБ — к письму не приложить','is over 25 MB and cannot be attached'));return;}
      att.push(x);drawAtt();
    }
    function drawAtt(){ab.textContent='';att.forEach(function(x,i){var c=el('span','mlchip');c.append(el('b',null,'📎 '+x.name),el('small',null,fmtSize(x.size||0)));var rm=el('button',null,'✕');rm.title=Lx('Убрать','Remove');rm.addEventListener('click',function(){att.splice(i,1);drawAtt();});c.append(rm);ab.append(c);});}
    (o.files||[]).forEach(function(f){addAtt({fl:f,name:flFileName(f),size:f.size});});
    if(!o.app)box.append(ad,ab);
    var msg=el('p','bad');box.append(msg);
    if(ME.role==='student')box.append(el('p','avhint','Почтой можно писать учителям и администрации. Друзьям пиши в HoroChat.'));
    send.addEventListener('click',async function(){
      msg.textContent='';
      var s=sub.value.trim(),t=body.value.trim();
      if(!s){msg.textContent='Напиши тему письма';return;}
      if(isBad(s+' '+t)){msg.textContent='В письме есть недопустимые слова';return;}
      var row={subject:s,body:t};
      if(to.value==='admins'){row.to_admins=true;row.to_id=null;}else{row.to_admins=false;row.to_id=to.value;}
      if(o.app)row.app_id=o.app.id;
      if(o.reply)row.reply_to=o.reply;
      send.disabled=true;
      if(att.length){
        msg.textContent=Lx('Загружаю вложения…','Uploading attachments…');
        try{row.files=await mlUpload(att);}catch(e){send.disabled=false;msg.textContent=Lx('Вложение не загрузилось: ','Attachment upload failed: ')+(e.message||e);return;}
        msg.textContent='';
      }
      var r=await SB.from('ht_mail').insert(row).select('id').single();
      send.disabled=false;
      if((r.error||!r.data)&&row.files)SB.storage.from('ht_mail_files').remove(row.files.map(function(x){return x.path;}));
      if(r.error||!r.data){msg.textContent=r.error?r.error.message:'Письмо не отправлено';return;}
      close();osToast('Письмо отправлено');
      if(o.app){o.app.status='review';o.app.review_note=null;if(pageOn('p-code'))cdDraw();}
      await mlLoad();if(pageOn('p-mail'))mlDraw();
    });
  });
}
/* непрочитанные письма — значок на иконке, проверяем раз в минуту */
setInterval(function(){if(SB&&ME&&!document.hidden)mlLoad().then(function(){if(pageOn('p-mail')&&!$('osSheet').classList.contains('show'))mlDraw();});},60000);

/* ---------- вложения ---------- */
async function mlUpload(att){
  var out=[];
  for(var i=0;i<att.length;i++){
    var x=att[i],blob=x.file||await flBlob(x.fl),type=blob.type||x.type||'application/octet-stream';
    var path=ME.id+'/'+Date.now()+'-'+Math.floor(Math.random()*1e6)+'.'+flExt(x.name,type);
    var up=await SB.storage.from('ht_mail_files').upload(path,blob,{contentType:type,upsert:false});
    if(up.error){if(out.length)SB.storage.from('ht_mail_files').remove(out.map(function(z){return z.path;}));throw new Error(flMissing(up.error)?Lx('нужно выполнить apps.sql в Supabase','the admin needs to run apps.sql in Supabase'):up.error.message);}
    out.push({path:path,name:x.name.slice(0,100),size:blob.size,type:type.split(';')[0]});
  }
  return out;
}
function mlFiles(m){
  var w=el('div','mlfiles');
  (m.files||[]).forEach(function(x){
    var k=/^video\//.test(x.type)?'video':/^image\//.test(x.type)?'image':/msword|\.doc$/i.test(x.type+' '+x.name)?'doc':/^text\/plain/.test(x.type)?'note':/^text\/html/.test(x.type)?'code':'other';
    var c=el('div','mlfile');c.append(flIcon(k,40));
    var tx=el('div','fltx');tx.append(el('b',null,x.name),el('small',null,fmtSize(x.size||0)));c.append(tx);
    async function blob(){var r=await SB.storage.from('ht_mail_files').download(x.path);if(r.error)throw r.error;return r.data;}
    c.append(btn('↗','mbtn',async function(){try{
        if(k==='doc'||k==='note'){var t=await (await blob()).text();var html=k==='doc'?docClean((t.match(/<body[^>]*>([\s\S]*)<\/body>/i)||[0,t])[1]):docFromText(t);
          osSheet(function(b2,close){b2.classList.add('wide');b2.append(el('h2',null,x.name));var pg=el('div','dcpage dcro');pg.innerHTML=html;b2.append(pg,el('div','mrow'));b2.lastChild.append(btn(Lx('Закрыть','Close'),'mbtn',close));});return;}
        var r=await SB.storage.from('ht_mail_files').createSignedUrl(x.path,3600);if(r.error)throw r.error;
        if(k==='video'||k==='image'){osSheet(function(b2,close){b2.classList.add('wide','flview');b2.append(el('h2',null,x.name));var e=el(k==='video'?'video':'img');e.src=r.data.signedUrl;if(k==='video'){e.controls=true;e.playsInline=true;}var bb=el('div','flvb');bb.append(e);b2.append(bb,el('div','mrow'));b2.lastChild.append(btn(Lx('Закрыть','Close'),'mbtn',close));});}
        else{flDownloadBlob(await blob(),x.name);}
      }catch(e){alert(flErrText(e));}}),
      btn('📁','mbtn',async function(){try{var b=await blob(),f;
        if(k==='doc'){var t=await b.text();f=await flSaveText({name:x.name.replace(/\.doc$/i,''),kind:'doc',mime:'text/html',body:docClean((t.match(/<body[^>]*>([\s\S]*)<\/body>/i)||[0,t])[1]),src:'mail'});}
        else if(k==='note')f=await flSaveText({name:x.name,kind:'note',mime:'text/plain',body:await b.text(),src:'mail'});
        else if(k==='code')f=await flSaveText({name:x.name,kind:'code',mime:'text/html',body:await b.text(),src:'mail'});
        else f=await flSaveBlob(b,x.name,'mail');
        if(f)osToast(Lx('Сохранено в Файлы','Saved to Files'));}catch(e){alert(flErrText(e));}}),
      btn('⤓','mbtn',async function(){try{flDownloadBlob(await blob(),x.name);}catch(e){alert(flErrText(e));}}));
    c.children[2].title=Lx('Открыть','Open');c.children[3].title=Lx('Сохранить в Файлы','Save to Files');c.children[4].title=Lx('Скачать','Download');
    w.append(c);
  });
  return w;
}
/* «Создать документ» прямо из письма: маленький редактор, документ сохраняется и в Файлы */
function mlNewDoc(cb){
  osSheet2(function(box,close){
    box.classList.add('wide');
    box.append(el('h2',null,'📄 '+Lx('Новый документ','New document')));
    var nm=inp('text',Lx('Документ','Document'),Lx('Название','Title'),80);nm.className='dcname';
    var tb=el('div','dctb mini'),pg=el('div','dcpage dcmail');pg.contentEditable='true';pg.innerHTML='<p><br></p>';
    [['B','bold'],['I','italic'],['U','underline'],['•','insertUnorderedList'],['1.','insertOrderedList'],['H','formatBlock','<h2>'],['¶','formatBlock','<p>']].forEach(function(x){var b=el('button','dcb',x[0]);b.addEventListener('mousedown',function(e){e.preventDefault();});b.addEventListener('click',function(){pg.focus();document.execCommand(x[1],false,x[2]||null);});tb.append(b);});
    pg.addEventListener('paste',function(e){var d=e.clipboardData;if(!d)return;e.preventDefault();var h=d.getData('text/html');document.execCommand('insertHTML',false,h?docClean(h):docFromText(d.getData('text/plain')));});
    var mr=el('div','mrow');
    mr.append(btn(Lx('Отмена','Cancel'),'mbtn',close),btn(Lx('Прикрепить','Attach'),'mbtn go',async function(){
      var f=await flSaveText({name:nm.value.trim()||Lx('Документ','Document'),kind:'doc',mime:'text/html',body:docClean(pg.innerHTML),src:'mail'});
      if(!f)return;close();cb(f);}));
    box.append(nm,tb,pg,mr);setTimeout(function(){pg.focus();},50);
  });
}
