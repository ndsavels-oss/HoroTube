import sys
import os
B=os.path.dirname(os.path.abspath(__file__))+'/'
SRC=B+'base/HoroTube.v4.html'   # сборка до друзей (24.10, после assemble3)
F=B+'out.html'
N=B+'base/'
s=open(SRC).read()
def rd(n):return open(B+n).read()
def rep(a,b,cnt=1):
    global s
    n=s.count(a)
    if n!=cnt: sys.exit('count %d for: %s'%(n,a[:80]))
    s=s.replace(a,b)
# меню: «Друзья»
rep('<a href="#" data-page="p-msg"><em>💬</em><span>Сообщения <b id="msgBadge"></b></span></a>',
    '<a href="#" data-page="p-msg"><em>💬</em><span>Сообщения <b id="msgBadge"></b></span></a>\n  <a href="#" data-page="p-friends"><em>🤝</em><span>Друзья</span></a>')
rep("    if(p==='p-msg')openMsg();\n","    if(p==='p-msg'){msgTab='dm';DM.peer=null;DM.ro=null;openMsg();}\n    if(p==='p-friends')openFriends();\n")
# страница друзей и окно «Поделиться»
rep('<section class="main page" id="p-mine">',rd('fr.html')+'\n<section class="main page" id="p-mine">')
rep('<!-- === ОКНА: КОНЕЦ === -->',rd('sh.html')+'<!-- === ОКНА: КОНЕЦ === -->')
rep('      <button class="tab" id="wRep"></button>','      <button class="tab" id="wShare">📤 Поделиться</button>\n      <button class="tab" id="wRep"></button>')
# мессенджер в стиле Telegram / WhatsApp
dm=open(B+'base/dm_old.js').read()
rep(dm,rd('dm2.js'))
# QR-генератор, друзья, «Поделиться»
rep("/* ===== ЯЗЫК: русский / English ===== */",open(N+'qr.inline.js').read()+"\n"+rd('friends.js')+"\n/* ===== ЯЗЫК: русский / English ===== */")
# проверка оскорблений: новый словарь
i=s.index('var TOX=(function(){');j=s.index('\nvar SEC_KIND')
s=s[:i]+rd('tox.js').rstrip()+'\n'+s[j:]
rep("cheat_fast:['Слишком частые награды за игры',10]};","cheat_fast:['Слишком частые награды за игры',10],friend_guess:['Пытался подобрать чужой код друга',20]};")
# выход и вход
rep("  msgTab='ann';chatUser=null;REPORTED={};DM.peer=null;DM.ro=null;dmStop();","  msgTab='ann';chatUser=null;REPORTED={};DM.peer=null;DM.ro=null;dmStop();FR.code='';FR.list=null;if(typeof stopScan==='function')stopScan();")
rep("  if(curPage()==='p-watch')loadComments();\n}","  if(curPage()==='p-watch')loadComments();\n  if(curPage()==='p-friends')openFriends();\n  frPending();\n}")
rep("  stopGames();\n","  stopGames();\n  if(id!=='p-friends'&&window.FR&&FR.stream)stopScan();\n")
# приглашение по QR без аккаунта: сразу регистрация
rep('    <h2 id="aTitle">Вход</h2>\n','    <h2 id="aTitle">Вход</h2>\n    <p id="aInv" class="frinv" style="display:none"></p>\n')
rep("  loadMe().then(function(e){refreshUI();if(!ME)openAuth(false,e);});","  loadMe().then(function(e){window._booted=true;refreshUI();if(!ME){if(frGet())frInvite();else openAuth(false,e);}});")
# админ: друзья пользователя в «Контактах»
rep("    body.append(el('h3','ctitle','Контакты: '+nm(AD_DM_USER)+' — '+cnt+' '+plur(cnt,'собеседник','собеседника','собеседников')));",
    "    body.append(el('h3','ctitle','Контакты: '+nm(AD_DM_USER)+' — '+cnt+' '+plur(cnt,'собеседник','собеседника','собеседников')));\n    var fq=await SB.rpc('ht_admin_friends',{target:AD_DM_USER});\n    if(!fq.error)body.append(el('p','avhint','🤝 Друзья ('+fq.data.length+'): '+(fq.data.map(function(f){return (f.name||f.nick)+' (@'+f.nick+')';}).join(', ')||'нет')));")
# стили друзей и мессенджера (раньше мобильных, чтобы мобильные их перекрывали)
rep("/* === СТИЛИ: КОНЕЦ === */",rd('fr.css')+"/* === СТИЛИ: КОНЕЦ === */")
# мобильный вид
rep('<meta name="viewport" content="width=device-width, initial-scale=1">','<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
rep("/* ===== ЯЗЫК: русский / English ===== */",rd('phone.js')+"\n/* ===== ЯЗЫК: русский / English ===== */")
rep("/* === СТИЛИ: КОНЕЦ === */",rd('phone.css')+"/* === СТИЛИ: КОНЕЦ === */")
# стекло, капсулы, полноэкранные чаты, живые иконки
rep('  <button id="pmDark">🌙 Тёмная тема</button>\n','  <button id="pmDark">🌙 Тёмная тема</button>\n  <button id="pmGlass">🫧 Стекло: вкл</button>\n')
rep("/* ===== ЯЗЫК: русский / English ===== */",rd('glass.js')+"\n/* ===== ЯЗЫК: русский / English ===== */")
rep("/* === СТИЛИ: КОНЕЦ === */",rd('glass.css')+"/* === СТИЛИ: КОНЕЦ === */")
rep("  if(id!=='p-friends'&&window.FR&&FR.stream)stopScan();\n","  if(id!=='p-friends'&&window.FR&&FR.stream)stopScan();\n  document.documentElement.classList.remove('chatfull','drawer');\n")
rep("  if(msgTab!=='dm')dmStop();\n","  if(msgTab!=='dm'){dmStop();document.documentElement.classList.remove('chatfull');}\n")
rep("if(msgTab==='dm'){DM.peer=null;DM.ro=null;}openMsg();","if(msgTab==='dm'){DM.peer=null;DM.ro=null;DM.chan=null;}openMsg();")
rep("    if(p==='p-msg'){msgTab='dm';DM.peer=null;DM.ro=null;openMsg();}","    if(p==='p-msg'){msgTab='dm';DM.peer=null;DM.ro=null;DM.chan=null;openMsg();}")
# английский
k=s.index('var DICT=Object.keys(I18N)')
s=s[:k]+rd('i18n3.js').strip()+'\n'+s[k:]
open(F,'w').write(s)
print('ok4',len(s))
