/* ===== АДМИНКА: «Проверка» — подозрительные сообщения без мата и подозрительные пользователи ===== */
/* Это не нейросеть, а набор правил: ищем оскорбления, угрозы, травлю и опасные просьбы.
   Мат сюда не попадает: его не пропускает сам сервер. Решение всегда принимает человек. */
var TOX=(function(){
  /* корни слов: [корень, вес, категория]; ^ — с начала слова */
  var ROOTS=[
    ['^туп(ой|ая|ое|ые|ого|ому|ым|ица|ень|ни|ит)',25,'ins'],['^глуп',20,'ins'],['^бездар',25,'ins'],['^неудачни',25,'ins'],['^лузер',25,'ins'],
    ['^нуб',10,'ins'],['^позор',15,'ins'],['^жирн',25,'ins'],['^жирух',30,'ins'],['^толст(ый|ая|уха|як|як)',20,'ins'],['^никчемн',30,'ins'],
    ['^ничтожеств',35,'ins'],['^клоун',20,'ins'],['^чучел',25,'ins'],['^свинь',25,'ins'],['^свинья',25,'ins'],['^корова$',25,'ins'],['^овц(а|ы)$',20,'ins'],
    ['^обезьян',30,'ins'],['^крыс(а|ы|ой)$',20,'ins'],['^тормоз$',15,'ins'],['^псих',20,'ins'],['^ненормальн',20,'ins'],['^убог',30,'ins'],
    ['^жалк',20,'ins'],['^мерзк',25,'ins'],['^противн',15,'ins'],['^вонюч',25,'ins'],['^очкарик',20,'ins'],['^ботан',10,'ins'],['^слабак',15,'ins'],
    ['^сопляк',20,'ins'],['^малявк',15,'ins'],['^деревенщ',20,'ins'],['^нищеб',30,'ins'],['^нищий',20,'ins'],['^бомж',25,'ins'],['^днище',20,'ins'],
    ['^кринж',8,'ins'],['^отстой',8,'ins'],['^мусор$',15,'ins'],['^ничто$',15,'ins'],['^гадк',15,'ins'],['^гад(ина)?$',20,'ins'],['^стрем(ный|ная)',15,'ins'],
    ['^страшил',25,'ins'],['^уродлив',30,'ins'],['^тупорог',30,'ins'],['^безмозгл',35,'ins'],['^неадекват',20,'ins'],['^шестерк',25,'ins'],['^подлиз',20,'ins'],
    ['^stupid',25,'ins'],['^loser',25,'ins'],['^ugly',25,'ins'],['^fat$',20,'ins'],['^dumb',25,'ins'],['^noob',10,'ins'],['^trash',15,'ins'],['^pathetic',25,'ins'],
    ['^clown',15,'ins'],['^freak',20,'ins'],['^weirdo',15,'ins'],['^idiot',30,'ins'],['^moron',30,'ins'],['^cringe',8,'ins'],
    ['^нерусск',35,'hate'],['^понаехал',35,'hate'],['^черномаз',50,'hate'],['^узкоглаз',45,'hate'],['^цыган(ч|ва)',30,'hate'],
    ['^убью',55,'thr'],['^прибью',50,'thr'],['^побью',45,'thr'],['^изобью',50,'thr'],['^урою',45,'thr'],['^зарежу',70,'thr'],['^закопаю',45,'thr'],
    ['^порву',30,'thr'],['^сломаю',30,'thr'],['^отомщу',35,'thr'],['^накажу',15,'thr'],['^выпились',80,'self'],['^вскройся',80,'self'],['^kys$',80,'self']
  ];
  /* фразы проверяются по всему тексту */
  var PHR=[
    [/заткни(сь|тесь)|закрой (рот|пасть)|завали (рот|пасть)|shut up/,30,'agr'],[/отвали|проваливай|(вали|иди|убирайся) отсюда|go away/,25,'agr'],
    [/никому (ты )?не нуж(ен|на|ны)|тебя (никто|ни кто) не (любит|любят|ждет)|nobody likes you/,45,'bul'],[/(все|вас|весь класс) (тебя )?ненавид/,45,'bul'],
    [/лучше бы (тебя|ты) не (было|родил)|зачем ты (вообще )?родил/,60,'bul'],[/ты (просто )?никто|кто ты такой|ты ноль/,30,'bul'],
    [/твоя (мамка|мать|мама) /,25,'ins'],[/(над тобой|с тебя) (все )?(смеются|ржут|угарают)/,35,'bul'],
    [/(тебе|те) (конец|хана|крышка|не жить)|ты (еще )?пожалеешь|you('| wi)ll regret/,50,'thr'],[/(найду|поймаю|встречу|дождусь|достану) тебя|тебя (найду|поймаю|достану|дождусь)/,45,'thr'],
    [/после (школы|уроков) (ты|тебе|тебя|поговорим|разберемся|выйди)|выйдем поговорим|разберемся (после|за)/,45,'thr'],
    [/ноги (тебе )?(переломаю|сломаю)|(в|по) (морду|лицо|щи) (дам|получишь|дать)|kill you|beat you/,55,'thr'],
    [/убей себя|убить себя|прыгни с (крыши|окна)|kill yourself|иди умри/,80,'self'],
    [/(расскажу|покажу|скажу) (всем|всему классу|учител)|все узнают|опозорю|(выложу|солью|скину) (твое|твои|твою|твой)? ?(фото|видео|скрин|переписк)/,45,'bul'],
    [/сколько тебе лет/,20,'grm'],[/где ты живешь|твой адрес|(какой|скажи) (у тебя )?адрес|в какой ты школе/,30,'grm'],
    [/(пришли|скинь|отправь|покажи) (мне )?(свое |свои |твое |твои )?(фото|фотку|фотки|селфи|себя)|send (me )?(a )?(pic|photo|nudes)/,45,'grm'],
    [/давай встретимся/,20,'grm'],[/(ты|вы) (одна|один|одни) дома|приходи (одна|один)|встретимся (вдвоем|без)|без (родителей|взрослых)/,45,'grm'],
    [/(не говори|не рассказывай|никому не говори|никому не рассказывай) (родителям|маме|папе|никому|учител)|это (наш|наш с тобой) секрет/,60,'grm'],
    [/(напиши|пиши|добавь|давай) (мне )?(в|во) (телег|телеграм|тг|вотсап|ватсап|whatsapp|инст|дискорд|discord|вк|снап)/,35,'grm'],
    [/(дам|подарю|переведу|скину) (тебе )?(денег|деньги|робукс|вбакс|tubek|тубек)/,30,'grm']
  ];
  var CAT={ins:'оскорбление',agr:'грубость',bul:'травля',thr:'угроза',self:'подталкивание к вреду себе',hate:'унижение по национальности',grm:'опасная просьба незнакомца',shout:'крик'};
  var RX=ROOTS.map(function(r){return [new RegExp(r[0]),r[1],r[2]];});
  var LAT={a:'а',c:'с',e:'е',o:'о',p:'р',x:'х',y:'у',k:'к',m:'м',t:'т','0':'о','3':'з'};
  var YOU=/(^| )(ты|тебя|тебе|тобой|твой|твоя|твое|твои|твоего|твою|вы|вас|вам|you|your|u)( |$)|@[a-z0-9_]{3,}/;
  function norm(t){
    t=String(t||'').toLowerCase().replace(/ё/g,'е');
    return t.split(/\s+/).map(function(w){
      return /[а-я]/.test(w)?w.replace(/[aceopxykmt03]/g,function(c){return LAT[c];}):w;
    }).join(' ').replace(/(.)\1{2,}/g,'$1$1').replace(/[^a-zа-я0-9@_ ]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function score(text){
    var raw=String(text||''),n=norm(raw),toks=n.split(' '),sc=0,cats={},hits=[];
    var you=YOU.test(' '+n+' ');
    function add(w,c,h){sc+=w;cats[c]=1;if(h&&hits.indexOf(h)<0)hits.push(h);}
    for(var i=0;i<toks.length;i++){
      var w=toks[i].replace(/(.)\1+/g,'$1$1');
      if(w.length<3&&w!=='ты')continue;
      if(toks[i-1]==='не'||toks[i-1]==='not')continue;   /* «ты не тупой» — не оскорбление */
      for(var j=0;j<RX.length;j++){
        if(RX[j][0].test(w)){
          var wt=RX[j][1];
          /* обидное слово, обращённое к человеку, весит больше, чем ругань в адрес видео */
          if(RX[j][2]==='ins')wt=Math.round(wt*(you?1.5:0.6));
          if(RX[j][2]==='thr'&&!you)wt=Math.round(wt*0.4);   /* «убью этот уровень» — не угроза */
          add(wt,RX[j][2],toks[i]);break;
        }
      }
    }
    PHR.forEach(function(p){var m=n.match(p[0]);if(m)add(p[1],p[2],m[0]);});
    var letters=raw.replace(/[^A-Za-zА-Яа-яЁё]/g,''),up=raw.replace(/[^A-ZА-ЯЁ]/g,'');
    if(letters.length>=8&&up.length/letters.length>.7&&sc>0)add(10,'shout','КАПС');
    if(/🖕/.test(raw))add(35,'ins','🖕');
    if(/🤡|💩|🤮|🐷|🐖|🤢/.test(raw)&&you)add(30,'ins','эмодзи-насмешка');
    sc=Math.min(100,sc);
    return {score:sc,cats:Object.keys(cats).map(function(c){return CAT[c];}),hits:hits};
  }
  return {score:score,norm:norm,CAT:CAT};
})();

var SEC_KIND={profile:['Пытался накрутить себе Tubek, премиум или роль',40],spoof:['Подделывал автора записи',25],video:['Обходил проверку видео',20],
  story:['Обходил правила историй',20],chess:['Жульничал в онлайн-шахматах',15],cheat:['Пытался получить Tubek обманом',30],cheat_fast:['Слишком частые награды за игры',10]};
function wOk(k){try{return localStorage.getItem('ht-ok-'+k)==='1';}catch(e){return false;}}
function wSetOk(k){try{localStorage.setItem('ht-ok-'+k,'1');}catch(e){}}
async function adWatch(){
  var body=$('adBody');body.textContent='';
  body.append(el('p','avhint','Алгоритм ищет оскорбления без мата, угрозы, травлю и опасные просьбы взрослых (фото, адрес, «никому не говори»), а также попытки жульничать и взламывать сайт. Это правила, а не нейросеть: шутки между друзьями он может принять за оскорбление, а тонкую издёвку пропустить. Решение принимаете вы.'));
  body.append(el('p','empty','Собираю данные за 30 дней…'));
  var since=new Date(Date.now()-30*864e5).toISOString();
  async function get(t,cols,f){var q=SB.from(t).select(cols).gt('created_at',since).order('created_at',{ascending:false}).limit(1000);if(f)q=f(q);var r=await q;return r.error?[]:r.data;}
  var res=await Promise.all([
    get('comments','id,body,author_id,author_name,video_id,created_at'),
    get('chat','id,body,author_id,author_name,user_id,created_at'),
    get('ht_dm','id,body,sender_id,recipient_id,author_name,created_at'),
    get('stories','id,text,user_id,author_name,path,created_at'),
    get('ht_security_log','id,user_id,kind,detail,created_at'),
    get('reports','kind,target_id,created_at'),
    get('ht_dm_blocks','blocker,blocked,created_at'),
    get('ht_chess','id,white,black,white_name,black_name,result,reason,ply,status,created_at',function(q){return q.eq('status','finished');}),
    SB.from('profiles').select('id,nick,name,role,banned').then(function(r){return r.data||[];})
  ]);
  var C=res[0],CH=res[1],DMS=res[2],ST=res[3],SEC=res[4],REP=res[5],BL=res[6],GM=res[7],PR=res[8];
  var who={};PR.forEach(function(p){who[p.id]=p;});
  function nm(id,fb){var p=who[id];return p?(p.name||p.nick)+' (@'+p.nick+')':(fb||'Пользователь');}
  /* 1. все тексты одним списком */
  var items=[];
  C.forEach(function(x){items.push({k:'comment',id:x.id,text:x.body,uid:x.author_id,name:x.author_name,at:x.created_at,where:'комментарий к видео'});});
  CH.forEach(function(x){if(x.author_id!==ME.id)items.push({k:'chat',id:x.id,text:x.body,uid:x.author_id,name:x.author_name,at:x.created_at,where:'чат с админом'});});
  DMS.forEach(function(x){items.push({k:'dm',id:x.id,text:x.body,uid:x.sender_id,name:x.author_name,to:x.recipient_id,at:x.created_at,where:'личное сообщение → '+nm(x.recipient_id)});});
  ST.forEach(function(x){if(x.text)items.push({k:'story',id:x.id,text:x.text,uid:x.user_id,name:x.author_name,path:x.path,at:x.created_at,where:'история'});});
  var flagged=[];
  items.forEach(function(it){var s=TOX.score(it.text);it.s=s;if(s.score>=30&&!wOk(it.k+it.id))flagged.push(it);});
  flagged.sort(function(a,b){return b.s.score-a.s.score;});
  /* 2. подозрительные пользователи */
  var U={};
  function u(id){return U[id]||(U[id]={id:id,sc:0,why:[]});}
  function why(id,pts,t){if(!id||(who[id]&&who[id].role==='admin'))return;var x=u(id);x.sc+=pts;x.why.push(t);}
  var secBy={};
  SEC.forEach(function(e){var k=e.user_id+'|'+e.kind;(secBy[k]=secBy[k]||{uid:e.user_id,kind:e.kind,n:0,last:e.detail}).n++;});
  Object.keys(secBy).forEach(function(k){var g=secBy[k],d=SEC_KIND[g.kind]||[g.kind,15];why(g.uid,Math.min(80,d[1]*g.n),'🚨 '+d[0]+(g.n>1?' ('+g.n+' раз)':'')+': '+g.last);});
  var tox={};
  items.forEach(function(it){if(it.s.score>=30){var t=tox[it.uid]||(tox[it.uid]={n:0,hi:0,c:{}});t.n++;if(it.s.score>=60)t.hi++;it.s.cats.forEach(function(c){t.c[c]=1;});}});
  Object.keys(tox).forEach(function(id){var t=tox[id];why(id,Math.min(60,t.n*8+t.hi*12),'💬 Подозрительных сообщений: '+t.n+(t.hi?' (из них серьёзных: '+t.hi+')':'')+' — '+Object.keys(t.c).join(', '));});
  var byKey={};items.forEach(function(it){byKey[it.k+'|'+it.id]=it;});
  var rep={};REP.forEach(function(r){var it=byKey[r.kind+'|'+r.target_id];if(it)rep[it.uid]=(rep[it.uid]||0)+1;});
  Object.keys(rep).forEach(function(id){why(id,Math.min(40,rep[id]*10),'⚠️ Жалоб на его сообщения: '+rep[id]);});
  var bl={};BL.forEach(function(b){(bl[b.blocked]=bl[b.blocked]||{})[b.blocker]=1;});
  Object.keys(bl).forEach(function(id){var n=Object.keys(bl[id]).length;why(id,Math.min(45,n*15),'🚫 Его заблокировали в личке: '+n+' '+plur(n,'человек','человека','человек'));});
  /* пишет в личку многим людям за сутки — спам или чужой взрослый */
  var dmTo={};DMS.forEach(function(x){if(Date.now()-new Date(x.created_at)<864e5)(dmTo[x.sender_id]=dmTo[x.sender_id]||{})[x.recipient_id]=1;});
  Object.keys(dmTo).forEach(function(id){var n=Object.keys(dmTo[id]).length;if(n>=8)why(id,20,'📨 За сутки написал в личку '+n+' разным людям');});
  /* онлайн-шахматы: один и тот же игрок много раз быстро сдаётся одному сопернику — накрутка Tubek */
  var pair={};
  GM.forEach(function(g){if(g.reason!=='resign'||g.ply>40)return;var win=g.result==='1-0'?g.white:g.black,lose=win===g.white?g.black:g.white,k=win+'|'+lose;(pair[k]=pair[k]||{win:win,lose:lose,n:0}).n++;});
  Object.keys(pair).forEach(function(k){var p=pair[k];if(p.n>=3){
    why(p.win,25,'♟ Подозрение на накрутку Tubek: '+nm(p.lose)+' сдавался ему '+p.n+' раз в коротких партиях');
    why(p.lose,15,'♟ Подозрение на накрутку Tubek: сдавался '+p.n+' раз игроку '+nm(p.win));
  }});
  var users=Object.keys(U).map(function(k){return U[k];}).filter(function(x){return x.sc>=20;}).sort(function(a,b){return b.sc-a.sc;});
  /* вывод */
  body.querySelector('.empty').remove();
  body.append(el('h3','ctitle','🕵️ Подозрительные пользователи'));
  if(!users.length)body.append(el('p','empty','Подозрительных пользователей не найдено'));
  users.slice(0,30).forEach(function(x){
    var p=who[x.id]||{},lvl=x.sc>=60?'🔴':x.sc>=35?'🟠':'🟡';
    var r=row(lvl+' '+nm(x.id)+(p.banned?' · забанен':'')+' · риск '+Math.min(100,x.sc)+'/100',[
      [p.banned?'Разбанить':'Забанить',function(){if(!p.banned&&!confirm('Забанить '+nm(x.id)+'?'))return;upd(x.id,{banned:!p.banned});}],
      ['Написать',function(){chatUser={id:x.id,name:nm(x.id)};msgTab='chat';openMsg(true);}]
    ]);
    var ul=el('ul','wwhy');x.why.forEach(function(t){ul.append(el('li',null,t));});r.append(ul);
  });
  if(SEC.length)body.append(row('',[['Очистить журнал взлома',async function(){if(!confirm('Очистить журнал попыток взлома и жульничества?'))return;await SB.from('ht_security_log').delete().gt('id',0);adDraw();}]]));
  body.append(el('h3','ctitle','💬 Подозрительные сообщения без мата'));
  if(!flagged.length)body.append(el('p','empty','Ничего подозрительного. Проверено сообщений: '+items.length));
  flagged.slice(0,100).forEach(function(it){
    var b=[];
    if(it.k==='comment')b.push(['Удалить',async function(){if(!confirm('Удалить этот комментарий?'))return;await SB.from('comments').delete().eq('id',it.id);adDraw();}]);
    if(it.k==='dm'){b.push(['Открыть переписку',function(){dmOpenById(it.id);}]);b.push(['Удалить',async function(){if(!confirm('Удалить это сообщение?'))return;await SB.from('ht_dm').delete().eq('id',it.id);adDraw();}]);}
    if(it.k==='chat')b.push(['Открыть чат',function(){chatUser={id:it.uid,name:nm(it.uid,it.name)};msgTab='chat';openMsg(true);}]);
    if(it.k==='story')b.push(['Удалить историю',async function(){if(!confirm('Удалить эту историю?'))return;await SB.from('stories').delete().eq('id',it.id);if(it.path)SB.storage.from('stories').remove([it.path]);adDraw();}]);
    b.push(['Всё в порядке',function(){wSetOk(it.k+it.id);adDraw();}]);
    var r=row((it.s.score>=60?'🔴 ':'🟠 ')+nm(it.uid,it.name)+' · '+it.where+' · '+fmtTime(it.at)+': «'+it.text+'»',b);
    r.append(el('small','wwhy','Почему: '+it.s.cats.join(', ')+' ('+it.s.hits.join(', ')+') · '+it.s.score+'/100'));
  });
}
