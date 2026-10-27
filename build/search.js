/* ===== Horo Поиск: поиск по Википедии ===== */
var SR={q:'',tab:'all',res:null,page:null,hist:[],lang:null,view:null};
function srLang(){return SR.lang||(LANG==='en'?'en':'ru');}
function srApi(params){
  var u=new URL('https://'+srLang()+'.wikipedia.org/w/api.php');
  params.format='json';params.origin='*';params.formatversion='2';
  Object.keys(params).forEach(function(k){u.searchParams.set(k,params[k]);});
  return fetch(u.toString(),{referrerPolicy:'no-referrer'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}
function srLogo(){
  var l=el('div','srlogo');
  var C=['#4285F4','#EA4335','#FBBC05','#4285F4','#34A853','#EA4335'];
  ('Horo '+(LANG==='en'?'Search':'Поиск')).split('').forEach(function(ch,i){var s=el('span','srl',ch);s.style.color=C[i%6];l.append(s);});
  return l;
}
function openSearch(){
  showPage('p-search');
  srDraw();
}
function srBox(big){
  var f=el('form','srform'+(big?' big':''));
  var i=inp('search',SR.q,LANG==='en'?'Wikipedia, HoroTube articles, people':'Википедия, статьи HoroTube, ученики');i.className='srin';i.setAttribute('enterkeyhint','search');i.setAttribute('aria-label','Поиск');
  var go=el('button','srgo');go.type='submit';go.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';go.setAttribute('aria-label','Найти');
  f.append(i,go);
  f.addEventListener('submit',function(e){e.preventDefault();srGo(i.value);});
  return f;
}
function srDraw(){
  var b=$('srBody');b.textContent='';
  if(SR.view==='mine'){artMine(b);return;}
  if(SR.view==='edit'&&ART.cur){artEdit(ART.cur);return;}
  if(!SR.res&&!SR.page){
    var h=el('div','srhome');
    h.append(srLogo(),srBox(true));
    var row=el('div','srbtns');
    row.append(btn('✍️ '+Lx('Написать статью','Write an article'),'mbtn go',function(){if(!SB||!ME){openAuth(false);return;}artEdit(null);}),btn('📰 '+Lx('Мои статьи','My articles'),'mbtn',openArticles),btn('🎲 Мне повезёт','mbtn',srLucky),btn(srLang()==='ru'?'🌐 Искать в English Wikipedia':'🌐 Искать в русской Википедии','mbtn',function(){SR.lang=srLang()==='ru'?'en':'ru';srDraw();}));
    h.append(row);
    if(SR.hist.length){var hh=el('div','srhist');SR.hist.slice(0,8).forEach(function(q){var c=btn('🕘 '+q,'chip',function(){srGo(q);});hh.append(c);});h.append(hh);}
    h.append(el('p','srnote',Lx('Ищет в Википедии, в статьях учеников HoroTube и портфолио. Напиши @ник, чтобы найти ученика.','Searches Wikipedia, HoroTube student articles and portfolios. Type @nick to find a student.')));
    if(SB&&ME)srFresh(h);
    b.append(h);return;
  }
  var top=el('div','srtop');
  var lg=srLogo();lg.classList.add('sm');lg.addEventListener('click',function(){SR.res=null;SR.page=null;SR.view=null;srDraw();});
  top.append(lg,srBox(false));b.append(top);
  if(SR.page){if(SR.page.ht){var aw=el('div','srart srht');aw.append(btn('‹ К результатам','ipback srback',function(){SR.page=null;srDraw();}));artRender(aw,SR.page.ht);b.append(aw);}else srArticle(b);return;}
  var tabs=el('div','srtabs');
  [['all',Lx('Все','All')],['ht','HoroTube'],['people',Lx('Люди','People')],['img','Картинки']].forEach(function(t){var x=el('button','srtab'+(SR.tab===t[0]?' on':''),t[1]);x.addEventListener('click',function(){SR.tab=t[0];srDraw();});tabs.append(x);});
  b.append(tabs);
  var box=el('div','srres');b.append(box);
  if(SR.res==='load'){box.append(el('p','osempty','Ищу…'));return;}
  var ht=SR.res.arts||[],pp=SR.res.people||[];
  if(SR.tab==='people'){
    if(!pp.length){box.append(el('p','osempty',SB&&ME?Lx('Учеников с таким ником или именем не нашлось','No students with this nick or name'):Lx('Войди в аккаунт, чтобы искать учеников','Sign in to search for students')));return;}
    pp.forEach(function(u){artPersonCard(box,u);});return;
  }
  if(SR.tab==='ht'){
    if(!ht.length){box.append(el('p','osempty',Lx('Статей HoroTube не нашлось. Может, напишешь сам?','No HoroTube articles found. Maybe write one?')));box.append(btn('✍️ '+Lx('Написать статью','Write an article'),'mbtn go',function(){artEdit(null);}));return;}
    ht.forEach(function(a){box.append(srHtRow(a));});return;
  }
  if(SR.tab==='all'){
    if(pp.length)artPersonCard(box,pp[0]);
    if(ht.length){var hb=el('div','srhtbox');hb.append(el('h3',null,'📰 '+Lx('Статьи учеников HoroTube','HoroTube student articles')));ht.slice(0,3).forEach(function(a){hb.append(srHtRow(a));});if(ht.length>3)hb.append(btn(Lx('Все статьи HoroTube','All HoroTube articles')+' ('+ht.length+')','mbtn',function(){SR.tab='ht';srDraw();}));box.append(hb);}
  }
  if(SR.res.err){box.append(el('p','osempty',SR.res.err));return;}
  if(!SR.res.list.length){if(!ht.length&&!pp.length)box.append(el('p','osempty','Ничего не нашлось. Попробуй другие слова.'));return;}
  if(SR.res.total)box.append(el('p','srcount','Найдено статей: '+SR.res.total.toLocaleString(dloc())));
  if(SR.tab==='img'){
    var g=el('div','srimgs');
    SR.res.list.filter(function(p){return p.thumbnail;}).forEach(function(p){
      var c=el('button','srimg');var im=new Image();im.referrerPolicy='no-referrer';im.loading='lazy';im.alt=p.title;
      if(safeImg(p.thumbnail.source))im.src=p.thumbnail.source;
      c.append(im,el('span',null,p.title));c.addEventListener('click',function(){srOpen(p.title);});g.append(c);
    });
    if(!g.children.length)g.append(el('p','osempty','Картинок не нашлось'));
    box.append(g);return;
  }
  SR.res.list.forEach(function(p,i){
    var r=el('div','srr');
    var tx=el('div','srrt');
    tx.append(el('small','srurl',srLang()+'.wikipedia.org › '+p.title));
    var a=el('a','srlink',p.title);a.href='#';a.addEventListener('click',function(e){e.preventDefault();srOpen(p.title);});
    tx.append(a,el('p',null,p.extract||''));
    r.append(tx);
    if(p.thumbnail&&safeImg(p.thumbnail.source)){var im=new Image();im.referrerPolicy='no-referrer';im.loading='lazy';im.src=p.thumbnail.source;im.alt='';im.className='srth';r.append(im);}
    box.append(r);
    if(i===0&&p.extract){r.classList.add('srfirst');}
  });
}
async function srGo(q){
  q=String(q||'').trim();if(!q)return;
  if(isBad(q)){alert('Такой запрос искать нельзя');return;}
  SR.q=q;SR.page=null;SR.res='load';SR.view=null;
  SR.hist=[q].concat(SR.hist.filter(function(x){return x!==q;})).slice(0,20);try{localStorage.setItem('h_srh',JSON.stringify(SR.hist));}catch(e){}
  if(!pageOn('p-search'))showPage('p-search');
  srDraw();
  var extra=Promise.all([artFind(q.replace(/^@/,'')),artPeople(q)]).catch(function(){return [[],[]];});
  if(/^@/.test(q)){var ex0=await extra;SR.res={list:[],total:0,arts:ex0[0],people:ex0[1]};if(SR.tab==='img')SR.tab='all';srDraw();return;}
  try{
    var d=await srApi({action:'query',generator:'search',gsrsearch:q,gsrlimit:'20',prop:'pageimages|extracts',exintro:'1',explaintext:'1',exsentences:'2',exlimit:'20',piprop:'thumbnail',pithumbsize:'320',pilimit:'20',list:'search',srsearch:q,srlimit:'1',srinfo:'totalhits'});
    var list=(d.query&&d.query.pages||[]).sort(function(a,b){return a.index-b.index;}).filter(function(p){return !isBad(p.title);});
    SR.res={list:list,total:d.query&&d.query.searchinfo?d.query.searchinfo.totalhits:0};
  }catch(e){SR.res={err:'Нет связи с Википедией. Проверь интернет.',list:[]};}
  var ex=await extra;SR.res.arts=ex[0];SR.res.people=ex[1];
  srDraw();
}
function srHtRow(a){
  var r=el('div','srr srhtr');
  var tx=el('div','srrt');
  tx.append(el('small','srurl','HoroTube › '+(a.author_name||'')+' · @'+(a.author_nick||'')));
  var l=el('a','srlink',a.title);l.href='#';l.addEventListener('click',function(e){e.preventDefault();artOpen(a.id);});
  tx.append(l,el('p',null,(a.published_at?new Date(a.published_at).toLocaleDateString(dloc(),{day:'numeric',month:'short',year:'numeric'})+' — ':'')+String(a.excerpt||'').replace(/(^|\s)#{1,3}\s+/g,'$1').replace(/\*\*|(^|\s)_|_(\s|$)/g,'$1$2').replace(/(^|\s)[-•]\s+/g,'$1')+(String(a.excerpt||'').length>=220?'…':'')));
  var m=el('small','srmeta',(a.words||0)+Lx(' слов',' words')+' · 👁 '+(a.views||0)+((a.tags||[]).length?' · #'+a.tags.slice(0,3).join(' #'):''));tx.append(m);
  r.append(tx);return r;
}
/* на главной Поиска: свежие статьи учеников */
async function srFresh(h){
  var a=await artFind('');if(!a.length||SR.res||SR.page||SR.view)return;
  var w=el('div','srfresh');w.append(el('h3',null,'🆕 '+Lx('Новые статьи учеников','New student articles')));
  a.slice(0,4).forEach(function(x){var c=el('button','srfc');c.append(el('b',null,x.title),el('small',null,(x.author_name||'')+' · 👁 '+(x.views||0)));c.addEventListener('click',function(){artOpen(x.id);});w.append(c);});
  h.append(w);
}
async function srLucky(){
  try{var d=await srApi({action:'query',list:'random',rnnamespace:'0',rnlimit:'1'});srOpen(d.query.random[0].title);}catch(e){alert('Нет связи с Википедией');}
}
async function srOpen(title){
  SR.page='load';SR.ptitle=title;SR.view=null;srDraw();
  try{
    var d=await srApi({action:'query',prop:'extracts|pageimages|info',explaintext:'1',exsectionformat:'wiki',titles:title,redirects:'1',piprop:'thumbnail',pithumbsize:'800',inprop:'url'});
    var p=d.query.pages[0];
    if(p.missing){SR.page={err:'Статья не найдена'};}
    else SR.page=p;
    var m=await srApi({action:'query',list:'search',srsearch:'morelike:'+p.title,srlimit:'6',srnamespace:'0'}).catch(function(){return null;});
    SR.page.more=m&&m.query?m.query.search.map(function(x){return x.title;}).filter(function(t){return !isBad(t);}):[];
  }catch(e){SR.page={err:'Нет связи с Википедией. Проверь интернет.'};}
  srDraw();
  var b=$('p-search');b.scrollTop=0;
}
function srArticle(b){
  var p=SR.page,a=el('article','srart');
  a.append(btn('‹ К результатам','ipback srback',function(){SR.page=null;if(!SR.res)SR.res=null;srDraw();}));
  if(p==='load'){a.append(el('p','osempty','Открываю статью…'));b.append(a);return;}
  if(p.err){a.append(el('p','osempty',p.err));b.append(a);return;}
  a.append(el('h1',null,p.title));
  if(p.thumbnail&&safeImg(p.thumbnail.source)){var im=new Image();im.referrerPolicy='no-referrer';im.src=p.thumbnail.source;im.alt=p.title;im.className='srhero';a.append(im);}
  /* статья приходит простым текстом: == Раздел == превращаем в заголовки */
  var skip=/^(Примечания|Литература|Ссылки|См\. также|Источники|References|External links|See also|Further reading|Notes|Bibliography)$/;
  var hide=false,toc=el('div','srtoc');
  (p.extract||'').split('\n').forEach(function(line){
    var m=line.match(/^(={2,4})\s*(.+?)\s*\1$/);
    if(m){hide=skip.test(m[2]);if(hide)return;var h=el(m[1].length===2?'h2':'h3',null,m[2]);a.append(h);if(m[1].length===2){var t=btn(m[2],'srtocb',function(){h.scrollIntoView({behavior:'smooth'});});toc.append(t);}return;}
    if(hide||!line.trim())return;
    a.append(el('p',null,line));
  });
  if(toc.children.length>1)a.insertBefore(toc,a.querySelector('h2'));
  if(p.more&&p.more.length){var mm=el('div','srmore');mm.append(el('h3',null,'Похожие статьи'));p.more.forEach(function(t){mm.append(btn(t,'chip',function(){srOpen(t);}));});a.append(mm);}
  var src=el('p','srsrc');src.append(document.createTextNode('Источник: Википедия, лицензия CC BY-SA. '));
  var lk=el('a',null,'Открыть на сайте');lk.href=p.fullurl&&/^https:\/\/[a-z]+\.wikipedia\.org\//.test(p.fullurl)?p.fullurl:'https://'+srLang()+'.wikipedia.org';lk.target='_blank';lk.rel='noopener noreferrer';src.append(lk);
  a.append(src);
  b.append(a);
}
try{SR.hist=JSON.parse(localStorage.getItem('h_srh')||'[]');}catch(e){}
