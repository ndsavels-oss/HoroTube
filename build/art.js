/* ===== Статьи учеников в Поиске: написать, отправить на проверку, найти и прочитать ===== */
var ART={mine:null,cur:null};
var ART_ST={draft:['Черновик','Draft','gray'],review:['На проверке','In review','orange'],published:['Опубликована','Published','green'],rejected:['Вернули на доработку','Sent back','red']};
function artStLabel(a){
  if(a.status==='review'&&a.pub_body)return [Lx('Обновление на проверке','Update in review'),'orange'];
  if(a.status==='rejected'&&a.pub_body)return [Lx('Обновление вернули','Update returned'),'red'];
  if(a.status==='published'&&a.pub_body&&(a.title!==a.pub_title||a.body!==a.pub_body))return [Lx('Есть неотправленные изменения','Unsent changes'),'blue'];
  var x=ART_ST[a.status]||ART_ST.draft;return [Lx(x[0],x[1]),x[2]];
}
/* разметка статьи: ## заголовок, - список, 1. список, **жирный**, _курсив_, ссылки https:// */
function artInline(p,s){
  var re=/(\*\*[^*\n]+\*\*|_[^_\n]+_|https:\/\/[^\s<>"')]+)/g,last=0,m;
  while((m=re.exec(s))){
    if(m.index>last)p.append(document.createTextNode(s.slice(last,m.index)));
    var t=m[0];
    if(t[0]==='*')p.append(el('b',null,t.slice(2,-2)));
    else if(t[0]==='_')p.append(el('i',null,t.slice(1,-1)));
    else{var a=el('a',null,t.length>60?t.slice(0,57)+'…':t);a.href=t;a.target='_blank';a.rel='noopener noreferrer';p.append(a);}
    last=m.index+t.length;
  }
  if(last<s.length)p.append(document.createTextNode(s.slice(last)));
  return p;
}
function artRender(box,a){
  var art=el('article','artview');
  art.append(el('h1',null,a.title||Lx('Без названия','Untitled')));
  if(a.author_name||a.published_at){
    var by=el('div','artby');
    if(a.author_id){by.append(avatarEl(a.author_id,a.author_name||a.author_nick||'',30));}
    var bt=el('div');
    var nm=el('button','artauth',a.author_name||'');
    if(a.author_id)nm.addEventListener('click',function(){openPortfolio(a.author_id);});
    bt.append(nm,el('small',null,[a.author_nick?'@'+a.author_nick:'',a.published_at?new Date(a.published_at).toLocaleDateString(dloc(),{day:'numeric',month:'long',year:'numeric'}):'',a.views!=null?'👁 '+a.views:''].filter(Boolean).join(' · ')));
    by.append(bt);art.append(by);
  }
  if(a.tags&&a.tags.length){var tg=el('div','arttags');a.tags.forEach(function(t){tg.append(el('span','arttag','#'+t));});art.append(tg);}
  var list=null;
  String(a.body||'').split('\n').forEach(function(line){
    var h=line.match(/^(#{1,3})\s+(.+)$/),li=line.match(/^\s*[-*•]\s+(.+)$/),ol=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(li||ol){var tag=li?'ul':'ol';if(!list||list.tagName.toLowerCase()!==tag){list=el(tag);art.append(list);}list.append(artInline(el('li'),(li||ol)[1]));return;}
    list=null;
    if(h){art.append(artInline(el(h[1].length===1?'h2':h[1].length===2?'h2':'h3'),h[2]));return;}
    if(!line.trim())return;
    art.append(artInline(el('p'),line));
  });
  box.append(art);
  return art;
}
/* ---------- мои статьи ---------- */
async function artLoadMine(){
  var r=await SB.from('ht_articles').select('*').eq('author_id',ME.id).order('updated_at',{ascending:false});
  if(r.error){ART.mine={err:r.error};return;}
  ART.mine=r.data||[];
}
async function openArticles(){
  if(!SB||!ME){openAuth(false);return;}
  if(!pageOn('p-search'))showPage('p-search');
  SR.view='mine';SR.page=null;srDraw();
  await artLoadMine();
  if(SR.view==='mine')srDraw();
}
function artMine(b){
  var w=el('div','artmine');
  var hd=el('div','arthd');
  hd.append(btn('‹ '+Lx('Поиск','Search'),'ipback',function(){SR.view=null;srDraw();}),el('h2',null,Lx('Мои статьи','My articles')),btn('✍️ '+Lx('Новая статья','New article'),'mbtn go',function(){artEdit(null);}));
  w.append(hd);
  if(!ART.mine){w.append(el('p','osempty',Lx('Загрузка…','Loading…')));b.append(w);return;}
  if(ART.mine.err){dbErr(w,ART.mine.err);b.append(w);return;}
  if(!ART.mine.length){
    var e=el('div','artempty');
    e.append(el('div','artbig','📰'),el('h3',null,Lx('Напиши свою первую статью','Write your first article')),el('p',null,Lx('О том, что знаешь и любишь: про динозавров, космос, любимую игру или опыт по химии. После проверки статью найдут все в Поиске.','About what you know and love: dinosaurs, space, a favourite game or a chemistry experiment. After review everyone can find it in Search.')));
    e.append(btn('✍️ '+Lx('Написать статью','Write an article'),'mbtn go',function(){artEdit(null);}));
    w.append(e);b.append(w);return;
  }
  ART.mine.forEach(function(a){
    var st=artStLabel(a);
    var it=el('button','artit');
    var tx=el('div');tx.append(el('b',null,a.title||Lx('Без названия','Untitled')),el('small',null,(String(a.body).match(/\S+/g)||[]).length+Lx(' слов · ',' words · ')+new Date(a.updated_at).toLocaleDateString(dloc(),{day:'numeric',month:'short'})+(a.pub_body?' · 👁 '+a.views:'')));
    if(a.review_note&&(a.status==='rejected'||a.status==='published'))tx.append(el('p','artnote','💬 '+a.review_note.split('\n')[0].slice(0,140)));
    it.append(el('span','artic','📄'),tx,el('span','cdst '+st[1],st[0]));
    it.addEventListener('click',function(){artEdit(a);});
    w.append(it);
  });
  b.append(w);
}
/* ---------- редактор ---------- */
function artEdit(a){
  a=a||{id:null,title:'',body:'',tags:[],status:'draft'};
  ART.cur=a;SR.view='edit';
  var b=$('srBody');b.textContent='';
  var w=el('div','artedit');
  var hd=el('div','arthd');
  var stl=el('span','artsave');
  hd.append(btn('‹ '+Lx('Мои статьи','My articles'),'ipback',async function(){if(dirty&&!(await save(true)))return;SR.view='mine';srDraw();artLoadMine().then(function(){if(SR.view==='mine')srDraw();});}),stl);
  w.append(hd);
  var st=artStLabel(a);
  var info=el('div','artinfo');info.append(el('span','cdst '+st[1],st[0]));
  if(a.pub_body)info.append(btn('👁 '+Lx('Как видят все','Public view'),'mbtn',function(){artOpenSheet({title:a.pub_title,body:a.pub_body,tags:a.pub_tags,author_name:ME.name,author_nick:ME.nick,author_id:ME.id,published_at:a.published_at,views:a.views});}));
  w.append(info);
  if(a.review_note)w.append(el('p','artnote big','💬 '+Lx('Отзыв администрации: ','Review: ')+a.review_note));
  var ti=inp('text',a.title,Lx('Название статьи','Article title'),120);ti.className='artti';
  var tg=inp('text',(a.tags||[]).join(', '),Lx('Теги через запятую: космос, планеты','Tags, comma separated: space, planets'),260);tg.className='arttg';
  var bar=el('div','artbar');
  var ta=inp('textarea',a.body,Lx('Текст статьи…\n\n## Заголовок раздела\nОбычный абзац.\n- пункт списка\n**жирный** и _курсив_','Article text…\n\n## Section heading\nA normal paragraph.\n- list item\n**bold** and _italic_'),30000);ta.className='artta';
  function wrap(pre,post,ph){
    var s=ta.selectionStart,e=ta.selectionEnd,v=ta.value,sel=v.slice(s,e)||ph;
    ta.value=v.slice(0,s)+pre+sel+post+v.slice(e);ta.focus();ta.selectionStart=s+pre.length;ta.selectionEnd=s+pre.length+sel.length;onEdit();
  }
  function line(pre){
    var s=ta.selectionStart,v=ta.value,ls=v.lastIndexOf('\n',s-1)+1;
    ta.value=v.slice(0,ls)+pre+v.slice(ls);ta.focus();ta.selectionStart=ta.selectionEnd=s+pre.length;onEdit();
  }
  [['H',Lx('Заголовок раздела','Section heading'),function(){line('## ');}],['B',Lx('Жирный','Bold'),function(){wrap('**','**',Lx('жирный','bold'));}],['I',Lx('Курсив','Italic'),function(){wrap('_','_',Lx('курсив','italic'));}],['•',Lx('Список','List'),function(){line('- ');}],['1.',Lx('Нумерованный список','Numbered list'),function(){line('1. ');}],['📚',Lx('Источники','Sources'),function(){ta.value=ta.value.replace(/\s*$/,'')+'\n\n## '+Lx('Источники','Sources')+'\n- ';ta.focus();onEdit();}]].forEach(function(x){var k=btn(x[0],'artb',x[2]);k.title=x[1];k.setAttribute('aria-label',x[1]);bar.append(k);});
  var cnt=el('small','artcnt');
  w.append(ti,tg,bar,ta,cnt);
  var rvBox=el('div','artrv');
  var acts=el('div','artacts');
  var send=btn('📨 '+(a.pub_body?Lx('Отправить обновление','Send update'):Lx('Отправить на проверку','Send for review')),'mbtn go',submit);
  acts.append(btn('🤖 '+Lx('Оценить','Rate'),'mbtn',function(){rvBox.textContent='';rvBox.append(revCard(revArticle(ti.value,ta.value,parseTags()),Lx('Что скажет проверка','What the review will say')));rvBox.scrollIntoView({behavior:'smooth',block:'nearest'});}),
    btn('👁 '+Lx('Просмотр','Preview'),'mbtn',function(){artOpenSheet({title:ti.value,body:ta.value,tags:parseTags(),author_name:ME.name,author_nick:ME.nick,author_id:ME.id});}),
    btn('💾 '+Lx('Сохранить','Save'),'mbtn',function(){save(false);}),send);
  if(a.id)acts.append(btn('🗑','mbtn',async function(){
    if(!confirm(a.pub_body?Lx('Удалить статью? Она пропадёт и из Поиска.','Delete the article? It will also disappear from Search.'):Lx('Удалить статью?','Delete the article?')))return;
    var r=await SB.from('ht_articles').delete().eq('id',a.id);if(r.error){alert(r.error.message);return;}
    osToast(Lx('Статья удалена','Article deleted'));SR.view='mine';ART.mine=null;srDraw();await artLoadMine();srDraw();
  }));
  var msg=el('p','bad');
  w.append(acts,msg,rvBox,el('p','avhint',Lx('Статью проверяет администрация. Пока статья на проверке или ты правишь выпущенную, в Поиске видна прежняя версия.','The administration reviews articles. While an article is in review or you edit a published one, Search shows the previous version.')));
  b.append(w);
  var dirty=false,tm=0;
  function parseTags(){return tg.value.split(',').map(function(x){return x.trim().replace(/^#/,'').slice(0,30);}).filter(Boolean).slice(0,8);}
  function count(){var n=(ta.value.match(/\S+/g)||[]).length;cnt.textContent=Lx('Слов: ','Words: ')+n+' · '+Lx('знаков: ','characters: ')+ta.value.length+' / 30000';}
  function onEdit(){dirty=true;stl.textContent=Lx('Есть изменения','Unsaved');count();clearTimeout(tm);tm=setTimeout(function(){if(dirty&&SR.view==='edit'&&ART.cur===a)save(true);},4000);}
  [ti,tg,ta].forEach(function(x){x.addEventListener('input',onEdit);});
  count();
  async function save(quiet){
    msg.textContent='';
    var rec={title:ti.value.trim(),body:ta.value,tags:parseTags()};
    if(!rec.title&&!rec.body.trim()){if(!quiet)msg.textContent=Lx('Статья пустая','The article is empty');return !a.id;}
    if(isBad(rec.title+' '+rec.tags.join(' '))){msg.textContent=Lx('В названии или тегах есть недопустимые слова','The title or tags have forbidden words');return false;}
    var r=a.id?await SB.from('ht_articles').update(rec).eq('id',a.id).select().maybeSingle():await SB.from('ht_articles').insert(rec).select().single();
    if(r.error){msg.textContent=rus(r.error.message);return false;}
    if(r.data)Object.assign(a,r.data);else Object.assign(a,rec);
    dirty=false;stl.textContent=Lx('Сохранено','Saved');
    if(!quiet)osToast(Lx('Статья сохранена','Article saved'));
    return true;
  }
  async function submit(){
    msg.textContent='';
    if(ti.value.trim().length<3){msg.textContent=Lx('Напиши название статьи','Write a title');ti.focus();return;}
    if(ta.value.trim().length<200){msg.textContent=Lx('Статья слишком короткая: нужно хотя бы 200 знаков','The article is too short: at least 200 characters');ta.focus();return;}
    if(isBad(ti.value+' '+ta.value)){msg.textContent=Lx('В статье есть недопустимые слова','The article has forbidden words');return;}
    var rv=revArticle(ti.value,ta.value,parseTags());
    if(rv.score<40&&!confirm(Lx('Автопроверка ставит ','The auto review gives ')+rv.stars+Lx(' из 5. Всё равно отправить? Нажми «Оценить», чтобы увидеть, что улучшить.',' of 5. Send anyway? Tap "Rate" to see what to improve.')))return;
    send.disabled=true;
    try{
      if(!(await save(true)))return;
      var r=await SB.rpc('ht_article_submit',{art:a.id});
      if(r.error){msg.textContent=rus(r.error.message);return;}
      a.status='review';a.review_note=null;
      osToast(Lx('Статья отправлена на проверку','Article sent for review'));
      SR.view='mine';ART.mine=null;srDraw();await artLoadMine();srDraw();
    }finally{send.disabled=false;}
  }
  ta.focus();
}
function artOpenSheet(a){
  osSheet(function(box,close){
    box.classList.add('wide','artsheet');
    artRender(box,a);
    box.append(el('div','mrow'));box.lastChild.append(btn(Lx('Закрыть','Close'),'mbtn',close));
  });
}
/* ---------- поиск: статьи и люди ---------- */
async function artFind(q){
  if(!SB||!ME)return [];
  var r=await SB.rpc('ht_articles_find',{q:q,lim:20});
  return r.error?[]:(r.data||[]);
}
async function artPeople(q){
  if(!SB||!ME)return [];
  var n=q.replace(/^@/,'').trim();
  if(n.length<2||/\s{2,}/.test(n)||n.split(/\s+/).length>3)return [];
  var r=await SB.rpc('ht_find_users',{q:n});
  if(r.error)return [];
  var low=n.toLowerCase();
  return (r.data||[]).sort(function(a,b){return (b.nick.toLowerCase()===low)-(a.nick.toLowerCase()===low);}).slice(0,4);
}
/* карточка как у Google справа: портфолио найденного ученика */
async function artPersonCard(box,u){
  var c=el('div','srperson');
  var top=el('div','srph');
  top.append(avatarEl(u.id,u.name||u.nick,64));
  var t=el('div');t.append(el('b',null,u.name||u.nick),el('small',null,'@'+u.nick+' · '+(ROLES[u.role]||Lx('Ученик','Student'))));
  top.append(t);c.append(top);
  var body=el('div','srpb');c.append(body);
  var go=btn('👤 '+Lx('Открыть портфолио','Open portfolio'),'mbtn go',function(){openPortfolio(u.id);});
  c.append(go);box.append(c);
  var q=await Promise.all([SB.from('ht_portfolio').select('about,dream,skills,hobbies,achievements').eq('user_id',u.id).maybeSingle(),SB.rpc('ht_portfolio_stats',{owner:u.id})]);
  var p=q[0].data,s=(q[1].data||[])[0];
  if(s){var st=el('div','srpst');[[s.videos,Lx('видео','videos')],[s.likes,Lx('лайков','likes')],[s.friends,Lx('друзей','friends')]].forEach(function(x){var d=el('div');d.append(el('b',null,String(x[0]||0)),el('small',null,x[1]));st.append(d);});body.append(st);}
  if(!p){body.append(el('p','mut',Lx('Портфолио пока не заполнено или скрыто.','The portfolio is empty or hidden.')));return;}
  if(p.about)body.append(el('p',null,p.about.length>220?p.about.slice(0,217)+'…':p.about));
  if(p.dream)body.append(el('p','mut','🌟 '+p.dream));
  var chips=(p.skills||[]).concat(p.hobbies||[]).slice(0,8);
  if(chips.length){var w=el('div','pfchips');chips.forEach(function(x){w.append(el('span','pfchip',x));});body.append(w);}
  if((p.achievements||[]).length){var a=p.achievements[0];body.append(el('p','mut',(a.e||'🏆')+' '+(a.t||'')+(p.achievements.length>1?Lx(' и ещё ',' and ')+(p.achievements.length-1):'')));}
}
async function artOpen(id){
  SR.page='load';SR.view=null;srDraw();
  var r=await SB.rpc('ht_article_get',{art:id});
  var a=r.data&&r.data[0];
  SR.page=a?{ht:a}:{err:r.error?rus(r.error.message):Lx('Статья не найдена или её убрали','The article was not found or removed')};
  srDraw();var p=$('p-search');if(p)p.scrollTop=0;
}
