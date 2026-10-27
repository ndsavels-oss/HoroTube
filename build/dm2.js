/* ===== МЕССЕНДЖЕР: личные сообщения (таблица ht_dm, см. messenger_stories.sql) =====
   Вид как в Telegram и WhatsApp: слева список чатов и друзья, справа переписка.
   На телефоне видно что-то одно: список или открытый чат. */
var DM={peer:null,ro:null,chan:null,grp:null,last:0,t:0,lt:0,q:'',found:null,unread:0};
function dmName(p){return (p.name||p.nick||'Пользователь')+(p.nick?' (@'+p.nick+')':'')+(isStaff(p.role)?' ✔':'');}
function dmShort(p){return (p.name||p.nick||'Пользователь')+(isStaff(p.role)?' ✔':'');}
function dmErr(m){return /ht_dm|relation|PGRST20[25]|does not exist|schema cache/i.test(m||'')?'Мессенджер ещё не подключён: администратору нужно выполнить messenger_stories.sql в Supabase.':rus(m);}
async function dmUnread(){
  if(!SB||!ME){DM.unread=0;$('dmDot').style.display='none';return 0;}
  var r=await SB.from('ht_dm').select('id',{count:'exact',head:true}).eq('recipient_id',ME.id).is('read_at',null);
  DM.unread=r.error?0:(r.count||0);
  if(typeof grpUnread==='function')DM.unread+=await grpUnread();
  $('dmDot').style.display=DM.unread?'':'none';
  return DM.unread;
}
function openDm(peer){
  msgTab='dm';DM.peer=peer||null;DM.ro=null;DM.chan=null;DM.grp=null;
  openMsg(true);
}
$('btnDm').addEventListener('click',function(){if(!ME){openAuth(false);return;}openDm();});
function dmStop(){clearTimeout(DM.t);DM.t=0;clearTimeout(DM.lt);DM.lt=0;}
/* время в списке: сегодня — часы, на этой неделе — день, иначе дата */
function dmWhen(t){
  var d=new Date(t),n=new Date(),en=LANG==='en';
  if(d.toDateString()===n.toDateString())return d.toLocaleTimeString(en?'en-GB':'ru-RU',{hour:'2-digit',minute:'2-digit'});
  if(n-d<6*864e5)return d.toLocaleDateString(en?'en-GB':'ru-RU',{weekday:'short'});
  return d.toLocaleDateString(en?'en-GB':'ru-RU',{day:'numeric',month:'short'});
}
function dmDay(t){
  var d=new Date(t),n=new Date(),y=new Date(n-864e5);
  if(d.toDateString()===n.toDateString())return LANG==='en'?'Today':'Сегодня';
  if(d.toDateString()===y.toDateString())return LANG==='en'?'Yesterday':'Вчера';
  return d.toLocaleDateString(LANG==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',year:d.getFullYear()===n.getFullYear()?undefined:'numeric'});
}
function dmPreview(b){var m=String(b).match(VTAG);return m?'📺 '+String(b).replace(VTAG,'').replace(/^📺\s*/,''):String(b);}
async function drawDm(){
  dmStop();
  var b=$('msgBody'),wrap=b.querySelector('.tg');
  if(!wrap){b.textContent='';wrap=el('div','tg');wrap.append(el('div','tgl'),el('div','tgc'));b.append(wrap);}
  var open=!!(DM.peer||DM.ro||DM.chan||DM.grp);
  wrap.classList.toggle('open',open);
  document.documentElement.classList.add('chatfull');
  dmList(wrap.firstChild);
  var C=wrap.lastChild;
  if(DM.grp)return grpView(DM.grp,C);
  if(DM.chan)return dmChanView(DM.chan,C);
  if(DM.ro)return dmThread(DM.ro.a,DM.ro.b,C);
  if(DM.peer)return dmThread(ME,DM.peer,C);
  C.textContent='';
  var e=el('div','tgnone');e.append(el('b',null,'💬'),el('span',null,'Выбери чат или друга, чтобы начать переписку'));
  C.append(e);
}
/* левая колонка: поиск, друзья, чаты */
async function dmList(L){
  clearTimeout(DM.lt);
  var res=await Promise.all([SB.rpc('ht_dm_threads'),loadFriends(),dmChans(),grpList()]),r=res[0],fr=res[1]||[],chs=res[2]||[],gs=res[3]||[];
  if(msgTab!=='dm'||!L.isConnected)return;
  var keepFocus=document.activeElement&&document.activeElement.classList.contains('tgq');
  if(keepFocus)return void(DM.lt=setTimeout(function(){dmList(L);},15000));
  L.textContent='';
  /* шапка: меню (☰) и разделы сообщений */
  var top=el('div','tgtop'),mn=el('button','tgburger','☰');mn.title='Меню';mn.setAttribute('aria-label','Меню');
  mn.addEventListener('click',function(e){e.stopPropagation();drawerOpen();});
  top.append(mn,el('b',null,'Чаты'));
  var seg=el('div','tgseg');
  [['ann','📣'],['new','🆕'],['chat',ME&&ME.role==='admin'?'🛟':'🛟']].forEach(function(x){
    var t=el('button',null,x[1]);t.title={ann:'Объявления',new:'Новые видео',chat:ME&&ME.role==='admin'?'Чаты':'Чат с админом'}[x[0]];t.setAttribute('aria-label',t.title);
    t.addEventListener('click',function(){msgTab=x[0];document.documentElement.classList.remove('chatfull');openMsg();});
    seg.append(t);
  });
  top.append(seg);L.append(top);
  var sr=el('div','tgsrch'),inp=el('input','tgq');
  inp.type='search';inp.placeholder='🔍 Поиск: ник или имя';inp.value=DM.q;inp.setAttribute('aria-label','Поиск собеседника');
  var deb=0;
  inp.addEventListener('input',function(){clearTimeout(deb);deb=setTimeout(find,350);});
  inp.addEventListener('keydown',function(e){if(e.key==='Enter'){clearTimeout(deb);find();}});
  async function find(){
    DM.q=inp.value.trim();
    if(DM.q.length<2){DM.found=null;inp.blur();dmList(L);return;}
    var f=await SB.rpc('ht_find_users',{q:DM.q});
    DM.found=f.error?{err:dmErr(f.error.message)}:f.data;
    drawFound();
  }
  sr.append(inp);L.append(sr);
  var fbox=el('div','tgfound');L.append(fbox);
  function drawFound(){
    fbox.textContent='';
    if(!DM.found)return;
    if(DM.found.err){fbox.append(el('p','bad',DM.found.err));return;}
    if(!DM.found.length){fbox.append(el('p','empty','Никого не нашли'));return;}
    DM.found.forEach(function(u){
      var d=el('div','tgrow');
      d.append(avatarEl(u.id,u.name||u.nick,44));
      var tx=el('div','tx'),l1=el('div','l1');l1.append(el('b',null,dmShort(u)));
      var l2=el('div','l2');l2.append(el('span',null,'@'+u.nick));
      tx.append(l1,l2);d.append(tx);
      d.addEventListener('click',function(){DM.found=null;DM.q='';openDm(u);});
      fbox.append(d);
    });
  }
  drawFound();
  /* друзья — сразу в чате, как «истории» в Telegram */
  var strip=el('div','tgfr'),add=el('div','tgfi');
  var plus=el('span','tgadd','+');add.append(plus,el('small',null,'Друзья'));add.title='Добавить друга по QR-коду';
  add.addEventListener('click',function(){openFriends();});
  strip.append(add);
  fr.forEach(function(u){
    var d=el('div','tgfi'+(DM.peer&&DM.peer.id===u.id?' on':''));
    var av=avatarEl(u.id,u.name||u.nick,50);d.append(av,el('small',null,u.name||u.nick));
    d.title=dmName(u);
    d.addEventListener('click',function(){openDm(u);});
    strip.append(d);
  });
  L.append(strip);
  var rows=el('div','tgrows');L.append(rows);
  var ng=el('button','tgnewg');ng.append(el('span',null,'👥'),el('b',null,Lx('Новая группа','New group')));ng.addEventListener('click',function(){grpCreate(fr);});rows.append(ng);
  if(r.error){rows.append(el('p','bad',dmErr(r.error.message)));return;}
  if(!r.data.length&&!chs.length&&!gs.length)rows.append(el('p','empty',fr.length?'Нажми на друга сверху, чтобы написать ему.':'Переписок пока нет. Найди одноклассника по нику или добавь друга по QR-коду.'));
  var cur=DM.ro||DM.chan||DM.grp?null:DM.peer;
  /* чаты и каналы вперемешку, сверху самое свежее — как в Telegram */
  var items=r.data.map(function(t){return {t:t.last_at,d:t};}).concat(chs.map(function(c){return {t:c.last?(c.last.published_at||c.last.created_at):SUBS[c.ch.id],c:c};})).concat(gs.map(function(g){return {t:g.last_at,g:g};}));
  items.sort(function(a,b){return tms(b.t)-tms(a.t);});
  items.forEach(function(it){
    if(it.c)return rows.append(dmChanRow(it.c));
    if(it.g)return rows.append(grpRow(it.g));
    var t=it.d;
    var p={id:t.partner_id,nick:t.nick,name:t.name,role:t.role};
    var d=el('div','tgrow'+(cur&&cur.id===p.id?' on':''));
    d.append(avatarEl(p.id,p.name||p.nick,48));
    var tx=el('div','tx'),l1=el('div','l1'),l2=el('div','l2');
    l1.append(el('b',null,dmShort(p)+(t.blocked?' 🚫':'')),el('time',t.unread?'u':null,dmWhen(t.last_at)));
    var pv=el('span');
    if(t.last_from_me)pv.append(el('i','tgme','Вы: '));
    pv.append(document.createTextNode(dmPreview(t.last_body).slice(0,90)));
    l2.append(pv);
    if(t.unread)l2.append(el('em','tgn',String(t.unread)));
    tx.append(l1,l2);d.append(tx);
    d.addEventListener('click',function(){openDm(p);});
    rows.append(d);
  });
  if(!chs.length)rows.append(el('p','avhint tgnote','📢 Подпишись на каналы в разделе «Каналы»: их новые видео будут приходить сюда.'));
  rows.append(el('p','avhint tgnote','🔒 Переписку видите только вы двое и администратор школы. Мат, телефоны и ссылки отправить нельзя.'));
  DM.lt=setTimeout(function(){if(curPage()==='p-msg'&&msgTab==='dm')dmList(L);},15000);
}
/* ---------- каналы в чатах: подписки как каналы в Telegram ---------- */
function chSeen(id){try{return localStorage.getItem('ht-chseen-'+id)||'';}catch(e){return '';}}
function chSetSeen(id){try{localStorage.setItem('ht-chseen-'+id,new Date().toISOString());}catch(e){}}
async function dmChans(){
  var ids=Object.keys(SUBS||{});
  if(!SB||!ME||!ids.length)return [];
  var q=await Promise.all([SB.from('channels').select('*').in('id',ids),
    SB.from('videos').select('*').in('channel_id',ids).eq('status','approved').order('created_at',{ascending:false}).limit(300)]);
  var by={};(q[1].data||[]).forEach(function(v){(by[v.channel_id]=by[v.channel_id]||[]).push(v);});
  return (q[0].data||[]).map(function(c){
    var vs=by[c.id]||[],seen=chSeen(c.id)||SUBS[c.id];
    return {ch:c,vids:vs,last:vs[0],unread:vs.filter(function(v){return tms(v.published_at||v.created_at)>tms(seen);}).length};
  });
}
function dmChanRow(c){
  var d=el('div','tgrow tgchrow'+(DM.chan&&DM.chan.ch.id===c.ch.id?' on':''));
  d.append(avatarEl(c.ch.owner_id,c.ch.name,48));
  var tx=el('div','tx'),l1=el('div','l1'),l2=el('div','l2');
  l1.append(el('b',null,'📢 '+c.ch.name),el('time',c.unread?'u':null,c.last?dmWhen(c.last.published_at||c.last.created_at):''));
  l2.append(el('span',null,c.last?'🎬 '+c.last.title:'Пока нет видео'));
  if(c.unread)l2.append(el('em','tgn',String(c.unread)));
  tx.append(l1,l2);d.append(tx);
  d.addEventListener('click',function(){DM.chan=c;DM.peer=null;DM.ro=null;DM.grp=null;drawDm();});
  return d;
}
function dmChanView(c,C){
  var ch=c.ch;
  C.textContent='';
  var hd=el('div','tghead'),bk=el('button','tgback','←');
  bk.title='Все чаты';bk.setAttribute('aria-label','Все чаты');
  bk.addEventListener('click',function(){DM.chan=null;DM.grp=null;drawDm();});
  var who=el('div','tgwho');
  who.append(el('b',null,'📢 '+ch.name),el('small',null,'канал · '+subLabel(ch.subs)));
  var go=el('button','tgmenu','↗');go.title='Открыть канал';go.setAttribute('aria-label','Открыть канал');
  go.addEventListener('click',function(){document.documentElement.classList.remove('chatfull');openChannel(ch.id);});
  hd.append(bk,avatarEl(ch.owner_id,ch.name,40),who,go);
  var box=el('div','tgbox');
  C.append(hd,box);
  if(!c.vids.length){var z=el('div','tgnone');z.append(el('b',null,'📢'),el('span',null,'В канале пока нет видео'));box.append(z);}
  var lastDay='',seen=chSeen(ch.id)||SUBS[ch.id],mark=false;
  c.vids.slice(0,60).reverse().forEach(function(v){
    var t=v.published_at||v.created_at,day=dmDay(t);
    if(!mark&&tms(t)>tms(seen)&&c.unread){box.append(el('div','tgday tgunread','Новые видео'));mark=true;}
    if(day!==lastDay){box.append(el('div','tgday',day));lastDay=day;}
    var p=el('div','tgb tgpost'),th=el('div','tgthumb');
    th.style.backgroundImage='linear-gradient(135deg,var(--blue),#7B5CFA)';
    th.append(el('span',null,v.kind==='short'?'⚡':'▶'));
    setThumb(th,v.cover||ytThumb(v.url,v.kind),false);
    p.append(th,el('b',null,v.title),el('span','tgt','👁 '+(v.views||0)+' · 👍 '+(v.likes||0)+' · '+new Date(t).toLocaleTimeString(LANG==='en'?'en-GB':'ru-RU',{hour:'2-digit',minute:'2-digit'})));
    p.addEventListener('click',function(){openWatch(v);});
    box.append(p);
  });
  var bar=el('div','tgin tgchbar'),o=el('button','tgchbtn','📺 Открыть канал'),u=el('button','tgchbtn tgunsub','🔕 Отписаться');
  o.addEventListener('click',function(){document.documentElement.classList.remove('chatfull');openChannel(ch.id);});
  u.addEventListener('click',async function(){
    if(!confirm('Отписаться от канала «'+ch.name+'»?'))return;
    var q=await SB.from('subscriptions').delete().eq('channel_id',ch.id).eq('user_id',ME.id);
    if(q.error){alert('Не получилось: '+q.error.message);return;}
    delete SUBS[ch.id];DM.chan=null;DM.grp=null;drawDm();
  });
  bar.append(o,u);C.append(bar);
  box.scrollTop=box.scrollHeight;
  chSetSeen(ch.id);
}
/* переписка двух людей; ro — админ смотрит чужую переписку (только чтение) */
async function dmThread(a,p,C){
  var ro=!!DM.ro;
  C.textContent='';
  /* шапка чата */
  var hd=el('div','tghead'),bk=el('button','tgback','←');
  bk.title='Все чаты';bk.setAttribute('aria-label','Все чаты');
  bk.addEventListener('click',function(){DM.peer=null;DM.ro=null;DM.chan=null;DM.grp=null;drawDm();});
  var who=el('div','tgwho'),fr=(FR.list||[]).some(function(u){return u.id===p.id;});
  who.append(el('b',null,ro?dmShort(a)+' ↔ '+dmShort(p):dmShort(p)),el('small',null,ro?'режим администратора: только чтение':(p.nick?'@'+p.nick:'')+(fr?' · 🤝 в друзьях':'')));
  hd.append(bk,avatarEl(p.id,p.name||p.nick,40),who);
  var box=el('div','tgbox');
  C.append(hd,box);
  var ta,bt,m;
  if(!ro){
    var bl=await SB.from('ht_dm_blocks').select('blocked').eq('blocker',ME.id).eq('blocked',p.id);
    var blocked=!!(bl.data&&bl.data.length);
    var menu=el('button','tgmenu','⋮'),dd=el('div','tgdd');
    menu.title='⋮';menu.setAttribute('aria-label','Меню');
    var bb=el('button',null,blocked?'✅ Разблокировать':'🚫 Заблокировать');
    bb.addEventListener('click',async function(){
      dd.classList.remove('show');
      if(!blocked&&!confirm('Заблокировать '+dmName(p)+'? Он не сможет тебе писать.'))return;
      var q=blocked?await SB.from('ht_dm_blocks').delete().eq('blocker',ME.id).eq('blocked',p.id)
                   :await SB.from('ht_dm_blocks').insert({blocked:p.id});
      if(q.error){alert('Не получилось: '+dmErr(q.error.message));return;}
      drawDm();
    });
    dd.append(bb);
    menu.addEventListener('click',function(e){e.stopPropagation();dd.classList.toggle('show');});
    document.addEventListener('click',function(){dd.classList.remove('show');},{once:true});
    hd.append(menu,dd);
    var w=el('div','tgin');ta=el('textarea');bt=el('button','tgsend','➤');m=el('p','bad tgerr');
    ta.rows=1;ta.maxLength=1000;ta.placeholder=blocked?'Ты заблокировал этого пользователя':'Сообщение';ta.disabled=blocked;ta.setAttribute('aria-label','Сообщение');
    bt.disabled=blocked;bt.title='Отправить';bt.setAttribute('aria-label','Отправить');
    function grow(){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,130)+'px';}
    ta.addEventListener('input',grow);
    async function send(){
      var t=ta.value.trim();m.textContent='';
      if(!t)return;
      if(isBad(t)){m.textContent='В сообщении есть недопустимые слова';return;}
      if(hasContact(t)){m.textContent='В личных сообщениях нельзя отправлять телефоны, ссылки и контакты';return;}
      bt.disabled=true;
      var q=await SB.from('ht_dm').insert({recipient_id:p.id,body:t});
      bt.disabled=false;
      if(q.error){m.textContent=dmErr(q.error.message);return;}
      ta.value='';grow();poll();
    }
    bt.addEventListener('click',send);
    ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
    w.append(ta,bt);
    C.append(m,w);
  }
  DM.last=0;
  var seen={},lastDay='',lastFrom=null;
  async function poll(){
    clearTimeout(DM.t);
    var r=await SB.from('ht_dm').select('*').or('and(sender_id.eq.'+a.id+',recipient_id.eq.'+p.id+'),and(sender_id.eq.'+p.id+',recipient_id.eq.'+a.id+')')
      .gt('id',DM.last).order('id',{ascending:true}).limit(300);
    if(curPage()!=='p-msg'||msgTab!=='dm'||!box.isConnected)return;
    if(r.error){box.textContent='';box.append(el('p','bad',dmErr(r.error.message)));return;}
    if(!DM.last&&!r.data.length){var z=el('div','tgnone dm0');z.append(el('b',null,'👋'),el('span',null,'Сообщений пока нет. Напиши первым!'));box.append(z);}
    var near=box.scrollHeight-box.scrollTop-box.clientHeight<120,first=!DM.last;
    r.data.forEach(function(x){
      if(seen[x.id])return;seen[x.id]=1;
      var z=box.querySelector('.dm0');if(z)z.remove();
      var day=dmDay(x.created_at);
      if(day!==lastDay){box.append(el('div','tgday',day));lastDay=day;lastFrom=null;}
      var mine=x.sender_id===a.id,d=el('div','tgb'+(mine?' own':'')+(lastFrom===x.sender_id?' cont':'')+(first?'':' pop'));
      lastFrom=x.sender_id;
      if(ro&&!d.classList.contains('cont'))d.append(el('small','tgfrom',mine?(a.name||a.nick):(p.name||p.nick)));
      var vm=String(x.body).match(VTAG),txt=vm?String(x.body).replace(VTAG,''):x.body;
      d.append(el('p',null,txt));
      if(vm){
        var vb=el('button','tgvid','▶ Смотреть видео');
        vb.addEventListener('click',function(){openVideoById(vm[1]);});
        d.append(vb);
      }
      var tm=el('span','tgt',new Date(x.created_at).toLocaleTimeString(LANG==='en'?'en-GB':'ru-RU',{hour:'2-digit',minute:'2-digit'}));
      if(mine&&!ro){var ck=el('i','tgck'+(x.read_at?' rd':''),x.read_at?'✓✓':'✓');ck.dataset.id=x.id;tm.append(ck);}
      if(!mine&&!ro){
        var rp=el('button','tgrep',REPORTED['dm'+x.id]?'⚑':'⚐');
        rp.title=REPORTED['dm'+x.id]?'жалоба отправлена':'пожаловаться';
        rp.addEventListener('click',async function(){
          if(REPORTED['dm'+x.id])return;
          if(!confirm('Пожаловаться на это сообщение? Его прочитает администратор.'))return;
          var q=await SB.from('reports').insert({kind:'dm',target_id:x.id,title:String(x.body).slice(0,300)});
          if(q.error&&!/duplicate|unique/i.test(q.error.message)){alert('Не получилось: '+q.error.message);return;}
          REPORTED['dm'+x.id]=1;rp.textContent='⚑';rp.title='жалоба отправлена';
        });
        tm.prepend(rp);
      }
      d.append(tm);
      box.append(d);
      DM.last=Math.max(DM.last,x.id);
    });
    if(near||first||r.data.some(function(x){return x.sender_id===a.id;}))box.scrollTop=box.scrollHeight;
    if(!ro&&r.data.some(function(x){return x.recipient_id===ME.id&&!x.read_at;})){await SB.rpc('ht_dm_read',{partner:p.id});dmUnread();}
    /* галочки «прочитано» у моих сообщений */
    if(!ro){
      var un=[].slice.call(box.querySelectorAll('.tgck:not(.rd)')).map(function(i){return +i.dataset.id;});
      if(un.length){
        var rd=await SB.from('ht_dm').select('id,read_at').in('id',un.slice(-50));
        (rd.data||[]).forEach(function(y){if(!y.read_at)return;var i=box.querySelector('.tgck[data-id="'+y.id+'"]');if(i){i.textContent='✓✓';i.classList.add('rd');}});
      }
    }
    DM.t=setTimeout(poll,document.hidden?15000:4000);
  }
  await poll();
  if(ta&&!ta.disabled&&matchMedia('(min-width:761px)').matches)ta.focus();
}
/* админ: открыть переписку по id сообщения (из жалобы или автопроверки) */
async function dmOpenById(id){
  var q=await SB.from('ht_dm').select('*').eq('id',id).single();
  if(!q.data){alert('Сообщение уже удалено');return;}
  await loadPub([q.data.sender_id,q.data.recipient_id]);
  var nm=function(u){var x=PUB[u]||{};return {id:u,nick:x.nick,name:x.name||x.nick||(u===q.data.sender_id?q.data.author_name:'Получатель')};};
  msgTab='dm';DM.peer=null;DM.ro={a:nm(q.data.sender_id),b:nm(q.data.recipient_id)};
  openMsg(true);
}
