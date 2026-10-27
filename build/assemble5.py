import sys
import os
B=os.path.dirname(os.path.abspath(__file__))+'/'
F=B+'out.html'   # результат assemble4.py
s=open(F).read()
def rd(n):return open(B+n).read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: sys.exit('count %d for: %s'%(n,a[:90]))
    s=s.replace(a,b)
# HoroOS: разметка, стили, приложения
rep('<!-- === ОКНА: НАЧАЛО === -->',rd('os.html')+'\n<!-- === ОКНА: НАЧАЛО === -->')
rep("/* === СТИЛИ: КОНЕЦ === */",rd('os.css')+rd('yt.css')+rd('pay.css')+rd('apps2.css')+rd('gfs.css')+rd('files.css')+rd('art.css')+"/* === СТИЛИ: КОНЕЦ === */")
js='\n'.join(rd(f+'.js') for f in ['os','yt','set','pay','apps2','upd','code','mail','search','gallery','edit','port','cal','clock','mini','files','docs','grp','rev','art','mlrev','gfs'])
rep("/* ===== ЯЗЫК: русский / English ===== */",js+"\nosInit();updInit();\n/* ===== ЯЗЫК: русский / English ===== */")
# showPage: правое окно Split View, полноэкранные приложения
rep("""function curPage(){var p=document.querySelector('.page.show');return p?p.id:'p-feed';}""",
    """function curPage(){var p=document.querySelector('.page.show:not(.side2)');return p?p.id:'p-feed';}""")
rep("""function showPage(id){
  if(id!=='p-watch')$('player').textContent='▶︎';""","""function showPage(id){
  if(window.OS&&OS.toSide){osShowSide(id);return;}
  if($(id).classList.contains('side2'))closeSplit(true);
  if(id!=='p-watch')$('player').textContent='▶︎';""")
rep("""  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('show');});
  $(id).classList.add('show');
  window.scrollTo(0,0);
}""","""  document.querySelectorAll('.page').forEach(function(p){if(!p.classList.contains('side2'))p.classList.remove('show');});
  $(id).classList.add('show');
  window.scrollTo(0,0);$(id).scrollTop=0;
  if(window.OS&&OS.ready)osOnPage(id);
}""")
s=s.replace("curPage()==='p-msg'","pageOn('p-msg')").replace("curPage()!=='p-msg'","!pageOn('p-msg')")
# в HoroOS чаты и так на весь экран
rep("  document.documentElement.classList.add('chatfull');","  if(!document.documentElement.classList.contains('os'))document.documentElement.classList.add('chatfull');")
# вход и выход: сбросить данные приложений
rep("  frPending();\n}","  frPending();\n  osAfterLogin();\n}")
# портфолио из списка друзей и из админки
rep("    var w=el('button','tab on','💬 Написать'),x=el('button','tab','✕');","    var w=el('button','tab on','💬 Написать'),x=el('button','tab','✕'),pf=el('button','tab','🪪');pf.title='Портфолио';pf.addEventListener('click',function(e){e.stopPropagation();OS.pfUid=u.id;openApp('portfolio');});")
rep("    d.append(tx,w,x);","    d.append(tx,w,pf,x);")
rep("    if(u.id!==ME.id)b.push(['Написать',function(){","    b.push(['🪪 Портфолио',function(){OS.pfUid=u.id;openApp('portfolio');}]);\n    if(u.id!==ME.id)b.push(['Написать',function(){")
a="var b=el('button','chip'+(s===subj?' on':''),s);"
assert s.count(a)==1
s=s.replace(a,"var b=el('button','chip'+(s===subj?' on':''),subjEn(s));")
s=s.replace("toLocaleDateString('ru-RU'","toLocaleDateString(dloc()").replace("toLocaleString('ru-RU'","toLocaleString(dloc()")
a="if(l==='en')trTree(document.body);}"
assert s.count(a)==1
s=s.replace(a,"if(l==='en')trTree(document.body);if(window.OS&&OS.ready){drawHome();drawDock();}}")
k=s.index('var DICT=Object.keys(I18N)')
s=s[:k]+open(B+'i18n4.js').read().strip()+'\n'+s[k:]
# старая покупка тарифа (v4) уступает место оплате как на iPhone (pay.js)
rep("async function buyPlan(T,p,btn){","async function buyPlanOld(T,p,btn){")
# 26.10: игры платные и для админа (премиум-плюшки у админа остаются)
rep("function canPlay(){return isPremium()||!!gamesUntil();}","function canPlay(){return !!ME&&(!!ME.premium||!!premUntil()||!!gamesUntil());}")
rep("  if(ME.role==='admin')return 'Тебе Аркада открыта всегда';","  if(ME.role==='admin'&&!ME.premium&&!premUntil())return gamesUntil()?'🎮 Тариф «Игры» до '+gamesUntil().toLocaleDateString(dloc(),{day:'numeric',month:'long'}):'🔑 Админ: всё открыто, кроме игр';")
rep("var g=gamesUntil(),forever=ME.role==='admin'||ME.premium;","var g=gamesUntil(),forever=!!ME.premium;")
# Cube Run на весь экран: высота поля H меняется под экран (dashFit в gfs.js), земля GY = H-50
rep("var c=$('dashC'),x=c.getContext('2d'),GY=210,","var c=$('dashC');if(typeof dashFit==='function')dashFit();var x=c.getContext('2d'),H=c.height,GY=H-50,")
rep("x.createLinearGradient(0,0,0,260)","x.createLinearGradient(0,0,0,H)")
rep("x.fillRect(0,0,720,260)","x.fillRect(0,0,720,H)",2)
rep("x.fillText(tr('Клик или пробел — ещё раз'),360,130)","x.fillText(tr('Клик или пробел — ещё раз'),360,H/2)")
rep("x.fillRect(((i*97-dist*.05)%740+740)%740,(i*53)%150,2,2)","x.fillRect(((i*97-dist*.05)%740+740)%740,(i*53)%(GY-60),2,2)")
rep("x.arc(((i*230-dist*.3)%920+920)%920-100,90,34*pl,0,7)","x.arc(((i*230-dist*.3)%920+920)%920-100,GY-120,34*pl,0,7)")
rep("function loop(){if(!DS.on)return;DS.raf=requestAnimationFrame(loop);","function loop(){if(!DS.on)return;DS.raf=requestAnimationFrame(loop);if(c.height!==H){var dy=c.height-H;H=c.height;GY=H-50;p.y+=dy;co.forEach(function(k){k.y+=dy;});pt.forEach(function(q){q.y+=dy;});}")
# шахматы: ♟ на Apple рисуется цветным эмодзи и не красится — просим текстовый вид
rep("var GLY={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};","var GLY={k:'♚\\uFE0E',q:'♛\\uFE0E',r:'♜\\uFE0E',b:'♝\\uFE0E',n:'♞\\uFE0E',p:'♟\\uFE0E'};")
rep(".chp{font-size:min(7.4vw,46px);line-height:1;font-family:'Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols 2',sans-serif;",".chp{font-size:min(7.4vw,46px);line-height:1;font-family:'Apple Symbols','Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols 2',sans-serif;font-variant-emoji:text;")
# код встроенных приложений: <, > и & экранируем, чтобы ничего не закрыло <script>
import json,glob,os,re,datetime
X={}
for f in sorted(glob.glob(B+'xapps/x_*.html')):
    X[os.path.basename(f)[:-5]]=open(f,encoding='utf8').read()
xj=json.dumps(X,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
rep("var XAPP_CODE=/*XAPPS*/{};","var XAPP_CODE="+xj+";")
VER=open(B+'VERSION').read().strip()
NOTES=open(B+'NOTES.txt',encoding='utf8').read().strip()
rep('<meta charset="UTF-8">','<meta charset="UTF-8">\n<script>'+open(B+'boot.js',encoding='utf8').read().replace('/*HT_VERSION*/',VER).strip()+'</script>')
rep("var HT_VERSION='/*HT_VERSION*/',HT_NOTES=/*HT_NOTES*/'';","var HT_VERSION='"+VER+"',HT_NOTES="+json.dumps(NOTES)+";")
open(F,'w').write(s)
# загрузчик для хостинга: адрес и публичный ключ Supabase берём из сайта
u=re.search(r"SB_URL='([^']+)'",s).group(1);k=re.search(r"SB_KEY='([^']+)'",s).group(1)
open(B+'loader.html','w').write(open(B+'loader.tpl.html',encoding='utf8').read().replace('__SB_URL__',u).replace('__SB_KEY__',k))
print('ok5',len(s),len(X),'apps')
