/* ===== ПРЕМИУМ: тарифы за Tubek (premium_chess.sql), история начислений ===== */
var TIERS=[
  {id:'games',t:'🎮 Игры',d:'Только Аркада: все игры и шахматы',plans:[{d:7,c:30},{d:30,c:100,n:'≈3 🪙 в день'}]},
  {id:'all',t:'⭐ Всё сразу',d:'Аркада + истории, реакции, статус, темы и золотая рамка',plans:[{d:1,c:10,n:'попробовать'},{d:7,c:50},{d:30,c:170,n:'выгоднее всего'}]}
];
var LOGN={chess_ai1:'Шахматы: победа (Новичок)',chess_ai2:'Шахматы: победа (Любитель)',chess_ai3:'Шахматы: победа (Сильный)',chess_m1:'Шахматы: мат в 1 ход',chess_m2:'Шахматы: мат в 2 хода',chess_ending:'Шахматы: эндшпиль',chess_online_win:'Онлайн-шахматы: победа',chess_online_draw:'Онлайн-шахматы: ничья',games_7:'🎮 Игры на 7 дней',games_30:'🎮 Игры на 30 дней',all_1:'⭐ Всё сразу на 1 день',all_7:'⭐ Всё сразу на 7 дней',all_30:'⭐ Всё сразу на 30 дней',premium_1:'Премиум на 1 день',premium_7:'Премиум на 7 дней',premium_30:'Премиум на 30 дней'};
function daysText(n){return n+' '+plur(n,'день','дня','дней');}
function openPrem(){
  if(!ME){openAuth(false);return;}
  setMenu('');showPage('p-prem');drawPrem();
}
async function drawPrem(){
  await refreshTubek();
  var st=$('prState');st.textContent='';
  var g=gamesUntil(),forever=ME.role==='admin'||ME.premium;
  st.append(el('b',null,isPremium()?premText():g?'🎮 Игры до '+g.toLocaleDateString(dloc(),{day:'numeric',month:'long'}):'Премиума нет'));
  if(isPremium()&&g&&g>(premUntil()||0))st.append(el('small',null,'🎮 Игры до '+g.toLocaleDateString(dloc(),{day:'numeric',month:'long'})));
  st.append(el('span',null,'🪙 Баланс: '+(ME.tubek||0)));
  var box=$('prPlans');box.textContent='';$('prMsg').textContent='';
  TIERS.forEach(function(T){
    var sec=el('div','prtier'+(T.id==='all'?' best':''));
    sec.append(el('h3',null,T.t),el('p','avhint',T.d));
    var row=el('div','prplans');
    T.plans.forEach(function(p){
      var d=el('div','prplan');
      d.append(el('b',null,daysText(p.d)),el('strong',null,p.c+' 🪙'),el('small',null,p.n||' '));
      var on=T.id==='all'?premUntil():g;
      var b=el('button','tab on',forever?'Уже навсегда':on?'Продлить':'Купить');
      b.disabled=forever;
      b.addEventListener('click',function(){buyPlan(T,p,b);});
      d.append(b);row.append(d);
    });
    sec.append(row);box.append(sec);
  });
  var lg=$('prLog');lg.textContent='';
  var r=await SB.from('ht_tubek_log').select('source,amount,created_at').eq('user_id',ME.id).order('created_at',{ascending:false}).limit(15);
  if(r.error){lg.append(el('p','empty','История появится, когда администратор выполнит premium_chess.sql'));return;}
  if(!r.data.length){lg.append(el('p','empty','Пока пусто. Сыграй в шахматы или купи тариф, и здесь появится запись.'));return;}
  r.data.forEach(function(x){
    var d=el('div','prlog');
    d.append(el('span',null,LOGN[x.source]||x.source),el('small',null,fmtTime(x.created_at)),el('b',x.amount>0?'plus':'minus',(x.amount>0?'+':'')+x.amount+' 🪙'));
    lg.append(d);
  });
}
async function buyPlan(T,p,btn){
  var m=$('prMsg');m.textContent='';
  if((ME.tubek||0)<p.c){m.textContent='Не хватает Tubek: нужно '+p.c+' 🪙, у тебя '+(ME.tubek||0)+'. Забирай ежедневный бонус и играй в шахматы!';return;}
  if(!confirm('Потратить '+p.c+' 🪙 на тариф «'+T.t+'» на '+daysText(p.d)+'?'))return;
  btn.disabled=true;
  var r=await SB.rpc('ht_buy_plan',{plan:T.id,days:p.d});
  /* premium_chess.sql ещё не выполнен: «Всё сразу» на 7 дней можно купить старой функцией */
  if(r.error&&(r.error.code==='PGRST202'||/ht_buy_plan/.test(r.error.message))){
    if(!(T.id==='all'&&p.d===7)){btn.disabled=false;m.textContent='Этот тариф заработает, когда администратор выполнит premium_chess.sql. Пока можно купить «Всё сразу» на 7 дней.';return;}
    r=await SB.rpc('buy_premium');
    if(!r.error&&(r.data===null||r.data===undefined))r.error={message:'Не хватает Tubek'};
  }
  btn.disabled=false;
  if(r.error){m.textContent='Не получилось: '+rus(r.error.message);return;}
  await refreshTubek();headerAv();drawPrem();
  alert('Готово! Тариф «'+T.t+'» включён');
}
