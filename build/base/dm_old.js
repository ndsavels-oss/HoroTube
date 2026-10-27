/* ===== МЕССЕНДЖЕР: личные сообщения (таблица ht_dm, см. messenger_stories.sql) ===== */
var DM={peer:null,ro:null,last:0,t:0,q:'',found:null,unread:0,timer:0};
function dmName(p){return (p.name||p.nick||'Пользователь')+(p.nick?' (@'+p.nick+')':'')+(isStaff(p.role)?' ✔':'');}
function dmErr(m){return /ht_dm|relation|PGRST20[25]|does not exist|schema cache/i.test(m||'')?'Мессенджер ещё не подключён: администратору нужно выполнить messenger_stories.sql в Supabase.':rus(m);}
async function dmUnread(){
  if(!SB||!ME){DM.unread=0;$('dmDot').style.display='none';return 0;}
  var r=await SB.from('ht_dm').select('id',{count:'exact',head:true}).eq('recipient_id',ME.id).is('read_at',null);
  DM.unread=r.error?0:(r.count||0);
  $('dmDot').style.display=DM.unread?'':'none';
  return DM.unread;
}
function openDm(peer){
  msgTab='dm';DM.peer=peer||null;DM.ro=null;
  openMsg(true);
}
$('btnDm').addEventListener('click',function(){if(!ME){openAuth(false);return;}openDm();});
function dmStop(){clearTimeout(DM.t);DM.t=0;}
async function drawDm(){
  dmStop();
  if(DM.ro)return dmThread(DM.ro.a,DM.ro.b);
  if(DM.peer)return dmThread(ME,DM.peer);
  var b=$('msgBody'),r=await SB.rpc('ht_dm_threads');
  if(msgTab!=='dm'||DM.peer||DM.ro)return;
  b.textContent='';
  var sr=el('div','cform'),inp=el('input','dmq'),go=el('button','tab on','Найти');
  inp.type='search';inp.placeholder='Кому написать? Ник или имя';inp.value=DM.q;inp.setAttribute('aria-label','Поиск собеседника');
  async function find(){
    DM.q=inp.value.trim();
    if(DM.q.length<2){DM.found=null;drawDm();return;}
    var f=await SB.rpc('ht_find_users',{q:DM.q});
    DM.found=f.error?{err:dmErr(f.error.message)}:f.data;
    drawDm();
  }
  go.addEventListener('click',find);
  inp.addEventListener('keydown',function(e){if(e.key==='Enter')find();});
  sr.append(inp,go);b.append(sr);
  if(DM.found){
    if(DM.found.err)b.append(el('p','bad',DM.found.err));
    else if(!DM.found.length)b.append(el('p','empty','Никого не нашли'));
    else DM.found.forEach(function(u){
      var d=el('div','mine',dmName(u));
      d.prepend(avatarEl(u.id,u.name||u.nick,32));
      d.addEventListener('click',function(){DM.found=null;DM.q='';openDm(u);});
      b.append(d);
    });
  }
  if(r.error){b.append(el('p','bad',dmErr(r.error.message)));return;}
  if(!r.data.length)b.append(el('p','empty','Переписок пока нет. Найди одноклассника по нику и напиши ему.'));
  r.data.forEach(function(t){
    var p={id:t.partner_id,nick:t.nick,name:t.name,role:t.role};
    var d=el('div','mine dmrow');
    d.append(avatarEl(p.id,p.name||p.nick,40));
    var tx=el('div','dmtx');
    tx.append(el('b',null,dmName(p)+(t.blocked?' · 🚫':'')),el('small',null,(t.last_from_me?'Вы: ':'')+String(t.last_body).slice(0,80)+' · '+fmtTime(t.last_at)));
    d.append(tx);
    if(t.unread)d.append(el('span','dmn',String(t.unread)));
    d.addEventListener('click',function(){openDm(p);});
    b.append(d);
  });
  b.append(el('p','avhint','Переписку видите только вы двое и администратор школы. Мат, телефоны и ссылки отправить нельзя.'));
  DM.t=setTimeout(function(){if(curPage()==='p-msg'&&msgTab==='dm'&&!DM.peer&&!DM.ro&&document.activeElement!==inp)drawDm();},15000);
}
/* переписка двух людей; ro — админ смотрит чужую переписку (только чтение) */
async function dmThread(a,p){
  var b=$('msgBody'),ro=!!DM.ro;
  b.textContent='';
  var bk=el('button','back','← Все сообщения');
  bk.addEventListener('click',function(){DM.peer=null;DM.ro=null;drawDm();});
  b.append(bk,el('h3','ctitle',ro?dmName(a)+' ↔ '+dmName(p):dmName(p)));
  var box=el('div','chatbox'),ta,m;
  b.append(box);
  if(!ro){
    var bl=await SB.from('ht_dm_blocks').select('blocked').eq('blocker',ME.id).eq('blocked',p.id);
    var blocked=!!(bl.data&&bl.data.length);
    var w=el('div','cform');ta=el('textarea');var bt=el('button','tab on','Отправить');m=el('p','bad');
    ta.maxLength=1000;ta.placeholder=blocked?'Ты заблокировал этого пользователя':'Сообщение...';ta.disabled=blocked;
    bt.disabled=blocked;
    async function send(){
      var t=ta.value.trim();m.textContent='';
      if(!t)return;
      if(isBad(t)){m.textContent='В сообщении есть недопустимые слова';return;}
      if(hasContact(t)){m.textContent='В личных сообщениях нельзя отправлять телефоны, ссылки и контакты';return;}
      bt.disabled=true;
      var q=await SB.from('ht_dm').insert({recipient_id:p.id,body:t});
      bt.disabled=false;
      if(q.error){m.textContent=dmErr(q.error.message);return;}
      ta.value='';poll();
    }
    bt.addEventListener('click',send);
    ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
    w.append(ta,bt);
    var tools=el('div','dmtools'),bb=el('button','tab',blocked?'Разблокировать':'🚫 Заблокировать');
    bb.addEventListener('click',async function(){
      if(!blocked&&!confirm('Заблокировать '+dmName(p)+'? Он не сможет тебе писать.'))return;
      var q=blocked?await SB.from('ht_dm_blocks').delete().eq('blocker',ME.id).eq('blocked',p.id)
                   :await SB.from('ht_dm_blocks').insert({blocked:p.id});
      if(q.error){alert('Не получилось: '+dmErr(q.error.message));return;}
      drawDm();
    });
    tools.append(bb);
    b.append(w,m,tools);
  }else b.append(el('p','avhint','Режим администратора: только чтение.'));
  DM.last=0;
  var seen={};
  async function poll(){
    dmStop();
    var q=SB.from('ht_dm').select('*').or('and(sender_id.eq.'+a.id+',recipient_id.eq.'+p.id+'),and(sender_id.eq.'+p.id+',recipient_id.eq.'+a.id+')')
      .gt('id',DM.last).order('id',{ascending:true}).limit(300);
    var r=await q;
    if(curPage()!=='p-msg'||msgTab!=='dm'||!box.isConnected)return;
    if(r.error){box.textContent='';box.append(el('p','bad',dmErr(r.error.message)));return;}
    if(!DM.last&&!r.data.length)box.append(el('p','empty dm0','Сообщений пока нет. Напиши первым!'));
    var near=box.scrollHeight-box.scrollTop-box.clientHeight<80;
    r.data.forEach(function(x){
      if(seen[x.id])return;seen[x.id]=1;
      var z=box.querySelector('.dm0');if(z)z.remove();
      var mine=x.sender_id===a.id,d=el('div','bub'+(mine?' own':''));
      d.append(el('small',null,(mine?(ro?(a.name||a.nick):'Вы'):(p.name||p.nick))+' · '+fmtTime(x.created_at)+(mine&&!ro&&x.read_at?' · ✓✓':'')),el('p',null,x.body));
      if(!mine&&!ro){
        var rp=el('button','dmrep',REPORTED['dm'+x.id]?'жалоба отправлена':'пожаловаться');
        rp.addEventListener('click',async function(){
          if(REPORTED['dm'+x.id])return;
          if(!confirm('Пожаловаться на это сообщение? Его прочитает администратор.'))return;
          var q=await SB.from('reports').insert({kind:'dm',target_id:x.id,title:String(x.body).slice(0,300)});
          if(q.error&&!/duplicate|unique/i.test(q.error.message)){alert('Не получилось: '+q.error.message);return;}
          REPORTED['dm'+x.id]=1;rp.textContent='жалоба отправлена';
        });
        d.append(rp);
      }
      box.append(d);
      DM.last=Math.max(DM.last,x.id);
    });
    if(near||r.data.length)box.scrollTop=box.scrollHeight;
    if(!ro&&r.data.some(function(x){return x.recipient_id===ME.id&&!x.read_at;})){await SB.rpc('ht_dm_read',{partner:p.id});dmUnread();}
    DM.t=setTimeout(poll,document.hidden?15000:4000);
  }
  await poll();
  if(ta&&!ta.disabled)ta.focus();
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
