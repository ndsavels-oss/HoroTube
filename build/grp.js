/* ===== Группы в HoroChat (ht_groups, ht_group_members, ht_group_msgs — см. files_groups.sql) ===== */
var GRP={list:null,gt:0};
function grpErr(m){return /ht_group|relation|PGRST20[25]|does not exist|schema cache/i.test(m||'')?Lx('Группы заработают, когда администратор выполнит files_groups.sql в Supabase','Groups will work once the admin runs files_groups.sql in Supabase'):rus(m);}
async function grpList(){
  if(!SB||!ME)return [];
  var r=await SB.rpc('ht_group_list');
  GRP.list=r.error?[]:r.data||[];
  return GRP.list;
}
async function grpUnread(){
  if(!SB||!ME)return 0;
  var r=await SB.rpc('ht_group_list');if(r.error)return 0;
  GRP.list=r.data||[];
  return GRP.list.reduce(function(s,g){return s+(g.unread||0);},0);
}
function grpAva(g,size){var a=el('div','tgav grpav');a.style.width=a.style.height=size+'px';a.style.fontSize=Math.round(size*.5)+'px';a.append(el('span',null,g.icon||'👥'));return a;}
function grpRow(g){
  var d=el('div','tgrow tggrow'+(DM.grp&&DM.grp.id===g.id?' on':''));
  d.append(grpAva(g,48));
  var tx=el('div','tx'),l1=el('div','l1'),l2=el('div','l2');
  l1.append(el('b',null,g.name),el('time',g.unread?'u':null,dmWhen(g.last_at)));
  var pv=el('span');
  if(g.last_body){if(g.last_sys)pv.append(el('i','tgme',g.last_body.slice(0,90)));else{pv.append(el('i','tgme',(g.last_from||'')+': '));pv.append(document.createTextNode(dmPreview(g.last_body).slice(0,90)));}}
  else pv.append(el('i','tgme',Lx('Участников: ','Members: ')+g.members));
  l2.append(pv);if(g.unread)l2.append(el('em','tgn',String(g.unread)));
  tx.append(l1,l2);d.append(tx);
  d.addEventListener('click',function(){DM.grp=g;DM.peer=null;DM.ro=null;DM.chan=null;drawDm();});
  return d;
}
/* выбор людей: ученики — из друзей, учителя и админ — ещё и поиском */
function grpPeople(title,friends,skip,okLabel,cb){
  osSheet2(function(box,close){
    box.append(el('h2',null,title));
    var sel={},list=el('div','grppick');
    function row(u){
      if(skip[u.id]||list.querySelector('[data-id="'+u.id+'"]'))return;
      var r=el('label','grprow');r.dataset.id=u.id;var c=el('input');c.type='checkbox';
      c.addEventListener('change',function(){if(c.checked)sel[u.id]=u;else delete sel[u.id];});
      var tx=el('div','tx');tx.append(el('b',null,dmShort(u)),el('small',null,'@'+(u.nick||'')));
      r.append(c,avatarEl(u.id,u.name||u.nick,36),tx);list.append(r);
    }
    if(isStaff(ME.role)){
      var q=inp('search','',Lx('Найти по нику или имени','Find by nick or name'));q.className='grpq';var deb=0;
      q.addEventListener('input',function(){clearTimeout(deb);deb=setTimeout(async function(){if(q.value.trim().length<2)return;var f=await SB.rpc('ht_find_users',{q:q.value.trim()});(f.data||[]).forEach(row);},350);});
      box.append(q);
    }
    (friends||[]).forEach(row);
    if(!list.children.length)list.append(el('p','avhint',isStaff(ME.role)?Lx('Найди людей поиском','Search for people'):Lx('В группу можно добавлять друзей. Добавь друзей по QR-коду в приложении «Друзья».','You can add friends to a group. Add friends by QR code in the Friends app.')));
    var msg=el('p','bad'),mr=el('div','mrow');
    mr.append(btn(Lx('Отмена','Cancel'),'mbtn',close),btn(okLabel,'mbtn go',async function(){var ids=Object.keys(sel);var e=await cb(ids,box);if(e){msg.textContent=e;return;}close();}));
    box.append(list,msg,mr);
  });
}
function grpCreate(friends){
  if(!ME){openAuth(false);return;}
  osSheet2(function(box,close){
    box.append(el('h2',null,'👥 '+Lx('Новая группа','New group')));
    var icons=['👥','🎒','📚','⚽','🎮','🎨','🎵','🧪','🌍','🚀','🐱','⭐'],ic=icons[0];
    var ir=el('div','grpicons');icons.forEach(function(x){var b=btn(x,'grpic'+(x===ic?' on':''),function(){ic=x;ir.querySelectorAll('.grpic').forEach(function(z){z.classList.toggle('on',z===b);});});ir.append(b);});
    var nm=inp('text','',Lx('Название группы','Group name'),40);nm.className='grpname';
    var msg=el('p','bad'),mr=el('div','mrow');
    mr.append(btn(Lx('Отмена','Cancel'),'mbtn',close),btn(Lx('Дальше','Next'),'mbtn go',function(){
      var n=nm.value.trim();if(!n){msg.textContent=Lx('Напиши название','Enter a name');return;}
      if(isBad(n)){msg.textContent=Lx('В названии есть недопустимые слова','Inappropriate words in the name');return;}
      close();
      grpPeople(Lx('Кого добавить?','Who to add?'),friends,{},Lx('Создать группу','Create group'),async function(ids){
        var r=await SB.rpc('ht_group_create',{p_name:n,p_icon:ic,users:ids});
        if(r.error)return grpErr(r.error.message);
        var gs=await grpList();DM.grp=gs.filter(function(g){return g.id===r.data;})[0]||{id:r.data,name:n,icon:ic,owner_id:ME.id,members:ids.length+1};
        DM.peer=null;DM.ro=null;DM.chan=null;drawDm();osToast(Lx('Группа создана','Group created'));
      });
    }));
    box.append(ir,nm,msg,mr);setTimeout(function(){nm.focus();},50);
  });
}
/* информация о группе: участники, добавить, переименовать, выйти */
async function grpInfo(g){
  var r=await SB.rpc('ht_group_people',{g:g.id});
  if(r.error){alert(grpErr(r.error.message));return;}
  var ppl=r.data||[],own=g.owner_id===ME.id||ME.role==='admin';
  osSheet2(function(box,close){
    var hd=el('div','grphd');hd.append(grpAva(g,64));var t=el('div');t.append(el('h2',null,g.name),el('small',null,Lx('Участников: ','Members: ')+ppl.length+' / 30'));hd.append(t);box.append(hd);
    if(own){
      var acts=el('div','mrow grpacts');
      acts.append(btn('✏️ '+Lx('Переименовать','Rename'),'mbtn',async function(){var n=prompt(Lx('Новое название','New name'),g.name);if(!n||!n.trim())return;var x=await SB.rpc('ht_group_edit',{g:g.id,p_name:n.trim(),p_icon:g.icon});if(x.error){alert(grpErr(x.error.message));return;}g.name=n.trim();close();drawDm();}),
        btn('➕ '+Lx('Добавить','Add'),'mbtn go',async function(){var fr=await loadFriends();var skip={};ppl.forEach(function(p){skip[p.id]=1;});close();
          grpPeople(Lx('Добавить в группу','Add to group'),fr,skip,Lx('Добавить','Add'),async function(ids){if(!ids.length)return Lx('Выбери, кого добавить','Choose who to add');var x=await SB.rpc('ht_group_add',{g:g.id,users:ids});if(x.error)return grpErr(x.error.message);osToast(Lx('Добавлено: ','Added: ')+x.data);drawDm();});}));
      box.append(acts);
    }
    var l=el('div','grppl');
    ppl.forEach(function(p){
      var row=el('div','grprow');var tx=el('div','tx');tx.append(el('b',null,dmShort(p)+(p.owner?' 👑':'')),el('small',null,'@'+(p.nick||'')));
      row.append(avatarEl(p.id,p.name||p.nick,36),tx);
      if(p.id!==ME.id)row.append(btn('💬','mbtn',function(){close();openDm(p);}));
      if(own&&p.id!==ME.id)row.append(btn('✕','mbtn',async function(){if(!confirm(Lx('Убрать ','Remove ')+dmShort(p)+Lx(' из группы?',' from the group?')))return;var x=await SB.rpc('ht_group_remove',{g:g.id,u:p.id});if(x.error){alert(grpErr(x.error.message));return;}row.remove();drawDm();}));
      l.append(row);
    });
    box.append(l);
    var mr=el('div','mrow');
    mr.append(btn(Lx('Закрыть','Close'),'mbtn',close),btn('🚪 '+Lx('Выйти из группы','Leave group'),'mbtn grpleave',async function(){
      if(!confirm(Lx('Выйти из группы «','Leave “')+g.name+Lx('»?','”?')))return;
      var x=await SB.rpc('ht_group_remove',{g:g.id,u:ME.id});if(x.error){alert(grpErr(x.error.message));return;}
      close();DM.grp=null;drawDm();}));
    box.append(el('p','avhint',Lx('🔒 Переписку группы видят участники и администратор школы.','🔒 Group messages are visible to members and the school admin.')),mr);
  });
}
async function grpView(g,C){
  C.textContent='';
  var hd=el('div','tghead'),bk=el('button','tgback','←');
  bk.title=Lx('Все чаты','All chats');bk.setAttribute('aria-label',bk.title);
  bk.addEventListener('click',function(){DM.grp=null;drawDm();});
  var who=el('div','tgwho grpwho');who.append(el('b',null,g.name),el('small',null,Lx('группа · участников: ','group · members: ')+(g.members||'')));
  who.addEventListener('click',function(){grpInfo(g);});
  var info=el('button','tgmenu','ⓘ');info.title=Lx('О группе','Group info');info.addEventListener('click',function(){grpInfo(g);});
  var av=grpAva(g,40);av.addEventListener('click',function(){grpInfo(g);});
  hd.append(bk,av,who,info);
  var box=el('div','tgbox');C.append(hd,box);
  var w=el('div','tgin'),ta=el('textarea'),bt=el('button','tgsend','➤'),m=el('p','bad tgerr');
  ta.rows=1;ta.maxLength=1000;ta.placeholder=Lx('Сообщение в группу','Message to the group');ta.setAttribute('aria-label',ta.placeholder);
  bt.title=Lx('Отправить','Send');
  function grow(){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,130)+'px';}
  ta.addEventListener('input',grow);
  async function send(){
    var t=ta.value.trim();m.textContent='';if(!t)return;
    if(isBad(t)){m.textContent=Lx('В сообщении есть недопустимые слова','Inappropriate words in the message');return;}
    if(hasContact(t)){m.textContent=Lx('В чатах нельзя отправлять телефоны, ссылки и контакты','Phone numbers, links and contacts are not allowed in chats');return;}
    bt.disabled=true;var q=await SB.from('ht_group_msgs').insert({group_id:g.id,body:t});bt.disabled=false;
    if(q.error){m.textContent=grpErr(q.error.message);return;}
    ta.value='';grow();poll();
  }
  bt.addEventListener('click',send);
  ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
  w.append(ta,bt);C.append(m,w);
  var last=0,seen={},lastDay='',lastFrom=null;
  async function poll(){
    clearTimeout(DM.t);
    var r=await SB.from('ht_group_msgs').select('*').eq('group_id',g.id).gt('id',last).order('id',{ascending:true}).limit(300);
    if(curPage()!=='p-msg'||msgTab!=='dm'||!box.isConnected||DM.grp!==g)return;
    if(r.error){box.textContent='';box.append(el('p','bad',grpErr(r.error.message)));return;}
    var near=box.scrollHeight-box.scrollTop-box.clientHeight<120,first=!last;
    await loadPub(r.data.map(function(x){return x.sender_id;}).filter(Boolean));
    r.data.forEach(function(x){
      if(seen[x.id])return;seen[x.id]=1;
      var day=dmDay(x.created_at);
      if(day!==lastDay){box.append(el('div','tgday',day));lastDay=day;lastFrom=null;}
      if(x.sys){box.append(el('div','tgday grpsys',x.body));lastFrom=null;last=Math.max(last,x.id);return;}
      var mine=x.sender_id===ME.id,d=el('div','tgb'+(mine?' own':'')+(lastFrom===x.sender_id?' cont':'')+(first?'':' pop'));
      if(!mine&&lastFrom!==x.sender_id){var nm=el('small','tgfrom grpfrom',x.author_name||((PUB[x.sender_id]||{}).name)||Lx('Участник','Member'));nm.style.color='hsl('+(parseInt(String(x.sender_id).slice(0,6),16)%360)+',65%,42%)';d.append(nm);}
      lastFrom=x.sender_id;
      var vm=String(x.body).match(VTAG),txt=vm?String(x.body).replace(VTAG,''):x.body;
      d.append(el('p',null,txt));
      if(vm){var vb=el('button','tgvid','▶ '+Lx('Смотреть видео','Watch video'));vb.addEventListener('click',function(){openVideoById(vm[1]);});d.append(vb);}
      var tm=el('span','tgt',new Date(x.created_at).toLocaleTimeString(LANG==='en'?'en-GB':'ru-RU',{hour:'2-digit',minute:'2-digit'}));
      if(!mine){
        var rp=el('button','tgrep',REPORTED['gm'+x.id]?'⚑':'⚐');rp.title=Lx('пожаловаться','report');
        rp.addEventListener('click',async function(){
          if(REPORTED['gm'+x.id])return;
          if(!confirm(Lx('Пожаловаться на это сообщение? Его прочитает администратор.','Report this message? The admin will read it.')))return;
          var q=await SB.from('reports').insert({kind:'gm',target_id:x.id,title:('['+g.name+'] '+(x.author_name||'')+': '+x.body).slice(0,300)});
          if(q.error&&!/duplicate|unique/i.test(q.error.message)){alert(q.error.message);return;}
          REPORTED['gm'+x.id]=1;rp.textContent='⚑';
        });
        tm.prepend(rp);
      }
      d.append(tm);box.append(d);last=Math.max(last,x.id);
    });
    if(near||first||r.data.some(function(x){return x.sender_id===ME.id;}))box.scrollTop=box.scrollHeight;
    if(r.data.length&&r.data.some(function(x){return x.sender_id!==ME.id;})){await SB.rpc('ht_group_read',{g:g.id});dmUnread();}
    else if(first){SB.rpc('ht_group_read',{g:g.id});}
    DM.t=setTimeout(poll,document.hidden?15000:4000);
  }
  await poll();
  if(matchMedia('(min-width:761px)').matches)ta.focus();
}
