/* ===== АДМИНКА: все личные переписки и контакты пользователей ===== */
var AD_DM_USER=null;
async function adDms(){
  var body=$('adBody');body.textContent='';
  var r=await SB.from('ht_dm').select('id,sender_id,recipient_id,body,created_at').order('created_at',{ascending:false}).limit(3000);
  var p=await SB.from('profiles').select('id,nick,name,role');
  body.textContent='';
  if(r.error){row('Мессенджер ещё не подключён: выполните all_in_one.sql. ('+r.error.message+')',[]);return;}
  var who={};(p.data||[]).forEach(function(u){who[u.id]=u;});
  function nm(id){var u=who[id];return u?(u.name||u.nick)+' (@'+u.nick+')':'Пользователь';}
  function pu(id){var u=who[id]||{};return {id:id,nick:u.nick,name:u.name||u.nick,role:u.role};}
  body.append(el('p','avhint','Все личные переписки учеников. Ученики видят в мессенджере, что админ может читать переписку. Нажмите на переписку, чтобы открыть её (только чтение).'));
  /* выбор пользователя: показать его контакты */
  var sel=el('select','adsel'),o0=el('option',null,'Все пользователи');o0.value='';sel.append(o0);
  Object.keys(who).map(function(k){return who[k];}).sort(function(a,b){return String(a.nick).localeCompare(b.nick);}).forEach(function(u){var o=el('option',null,nm(u.id));o.value=u.id;sel.append(o);});
  sel.value=AD_DM_USER||'';
  sel.addEventListener('change',function(){AD_DM_USER=sel.value||null;adDms();});
  body.append(sel);
  var pairs={},list=[];
  r.data.forEach(function(m){
    var a=m.sender_id<m.recipient_id?m.sender_id:m.recipient_id,b=a===m.sender_id?m.recipient_id:m.sender_id,k=a+'|'+b;
    if(AD_DM_USER&&a!==AD_DM_USER&&b!==AD_DM_USER)return;
    if(!pairs[k]){pairs[k]={a:a,b:b,n:0,last:m};list.push(pairs[k]);}
    pairs[k].n++;
  });
  if(AD_DM_USER){
    var cnt=list.length;
    body.append(el('h3','ctitle','Контакты: '+nm(AD_DM_USER)+' — '+cnt+' '+plur(cnt,'собеседник','собеседника','собеседников')));
  }else body.append(el('h3','ctitle','Переписок: '+list.length));
  if(!list.length){row(AD_DM_USER?'У этого пользователя нет личных переписок':'Личных переписок пока нет',[]);return;}
  list.forEach(function(x){
    var me=AD_DM_USER,other=me?(x.a===me?x.b:x.a):null;
    var title=me?nm(other):nm(x.a)+' ↔ '+nm(x.b);
    var rw=row(title+' · сообщений: '+x.n+' · '+fmtTime(x.last.created_at),[
      ['Открыть',function(){msgTab='dm';DM.peer=null;DM.ro={a:pu(me||x.a),b:pu(other||x.b)};openMsg(true);}]
    ]);
    rw.append(el('small','wwhy',(x.last.sender_id===(me||x.a)?'':'↩ ')+'«'+String(x.last.body).slice(0,120)+'»'));
  });
}
