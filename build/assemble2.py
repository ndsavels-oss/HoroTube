import sys
B='/tmp/claude-0/-home-claude/1ebcb15d-9505-568f-97a9-abf3f2df7554/scratchpad/build/'
F='/mnt/project-files/horotube/HoroTube.new.html'
s=open(F).read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: sys.exit('count %d for: %s'%(n,a[:80]))
    s=s.replace(a,b)
rep('<section class="main page" id="p-mult">',open(B+'prem.html').read()+'<section class="main page" id="p-mult">')
rep('<button id="pmCoins">🪙 Tubek и премиум</button>','<button id="pmCoins">⭐ Премиум</button>')
rep("$('pmCoins').addEventListener('click',function(){pm.classList.remove('show');setMenu('p-arcade');showPage('p-arcade');drawArcade();});",
    "$('pmCoins').addEventListener('click',function(){pm.classList.remove('show');openPrem();});")
rep("""$('buyBtn').addEventListener('click',async function(){
  if(!ME)return;""","""$('buyBtn').addEventListener('click',function(){openPrem();});
/* старая покупка на 7 дней: теперь все тарифы на странице «Премиум» */
$('buyBtn').addEventListener('x-old',async function(){
  if(!ME)return;""")
rep("  $('buyBtn').textContent=premUntil()?'⭐ Продлить премиум на 7 дней за 50 🪙':'⭐ Премиум на 7 дней за 50 🪙';",
    "  $('buyBtn').textContent=canPlay()?'⭐ Продлить или сменить тариф':'⭐ Тарифы: от 10 🪙';")
rep("""function canPlay(){return !!ME&&(ME.role==='admin'||ME.premium||!!premUntil());}
function isPremium(){return canPlay();}""","""function gamesUntil(){return ME&&ME.games_until&&new Date(ME.games_until)>new Date()?new Date(ME.games_until):null;}
/* isPremium — тариф «Всё сразу» (или от админа); canPlay — можно играть в Аркаду (ещё и тариф «Игры») */
function isPremium(){return !!ME&&(ME.role==='admin'||ME.premium||!!premUntil());}
function canPlay(){return isPremium()||!!gamesUntil();}""")
rep("add.append(p,el('span',null,canPlay()?'Моя история'","add.append(p,el('span',null,isPremium()?'Моя история'")
rep("add.addEventListener('click',function(){if(!canPlay()){alert('Истории","add.addEventListener('click',function(){if(!isPremium()){alert('Истории")
rep("if(!SB||!ME||!canPlay()){m.textContent='Истории","if(!SB||!ME||!isPremium()){m.textContent='Истории")
rep("  ME=p.data;\n","  ME=p.data;\n  await loadPlans();\n")
rep("  if(r.data){ME.tubek=r.data.tubek;ME.premium=r.data.premium;ME.premium_until=r.data.premium_until;tubekUI();}",
    "  if(r.data){ME.tubek=r.data.tubek;ME.premium=r.data.premium;ME.premium_until=r.data.premium_until;await loadPlans();tubekUI();}")
rep("""function premText(){
  if(!ME)return '';""","""/* тариф «Игры» хранится в ht_plans (premium_chess.sql) */
async function loadPlans(){
  if(!SB||!ME)return;
  var r=await SB.from('ht_plans').select('games_until').eq('user_id',ME.id).maybeSingle();
  ME.games_until=r.data?r.data.games_until:null;
}
function premText(){
  if(!ME)return '';
  if(!isPremium()&&gamesUntil())return '🎮 Тариф «Игры» до '+gamesUntil().toLocaleDateString('ru-RU',{day:'numeric',month:'long'});""")
rep("""      <button class="tab" data-t="a">Все видео</button>""","""      <button class="tab" data-t="a">Все видео</button>
      <button class="tab" data-t="w">🕵️ Проверка</button>""")
rep("""  else if(tab==='m')adMod();""","""  else if(tab==='m')adMod();
  else if(tab==='w')adWatch();""")
rep("/* ===== ЯЗЫК: русский / English ===== */",open(B+'prem.js').read()+'\n'+open(B+'watch.js').read()+'\n'+"/* ===== ЯЗЫК: русский / English ===== */")
a=s.index('var DICT=Object.keys(I18N)')
s=s[:a]+open(B+'i18n2.js').read()+s[a:]
open(F,'w').write(s)
print('ok2',len(s))
