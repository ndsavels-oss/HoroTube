/* ===== Оплата за Tubek как на iPhone: лист снизу, кнопка «Оплатить», настоящий Face ID, галочка ===== */
/* Face ID / Touch ID через ключ доступа (WebAuthn): телефон сам проверяет лицо или палец.
   Ключ создаётся при первой оплате и хранится в iCloud-связке; его id — в localStorage. */
var PK={ok:null};
function pkCheck(){
  if(PK.ok!==null)return;
  var inFrame=true;try{inFrame=window.top!==window.self;}catch(e){}
  if(inFrame||!window.PublicKeyCredential||!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable||!window.isSecureContext){PK.ok=false;return;}
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(v){PK.ok=!!v;},function(){PK.ok=false;});
}
function pkName(){var u=navigator.userAgent;return /iPhone/.test(u)?'Face ID':/iPad|Macintosh/.test(u)?'Touch ID / Face ID':Lx('отпечаток или PIN','fingerprint or PIN');}
function pkKey(){return 'h_pk_'+(ME?ME.id:'');}
function b64e(buf){var s='',b=new Uint8Array(buf);for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64d(t){var s=atob(t.replace(/-/g,'+').replace(/_/g,'/')),b=new Uint8Array(s.length);for(var i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
/* вызывать прямо в обработчике нажатия: Safari показывает Face ID только по жесту */
function pkAsk(){
  var ch=crypto.getRandomValues(new Uint8Array(32)),id=null;
  try{id=localStorage.getItem(pkKey());}catch(e){}
  if(id)return navigator.credentials.get({publicKey:{challenge:ch,rpId:location.hostname,allowCredentials:[{type:'public-key',id:b64d(id)}],userVerification:'required',timeout:60000}});
  return navigator.credentials.create({publicKey:{rp:{name:'HoroTube',id:location.hostname},
    user:{id:new TextEncoder().encode(ME.id).slice(0,64),name:'@'+(ME.nick||'horotube'),displayName:'HoroTube @'+(ME.nick||'')},
    challenge:ch,pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
    authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},attestation:'none',timeout:60000}})
    .then(function(c){try{localStorage.setItem(pkKey(),b64e(c.rawId));}catch(e){}return c;});
}
/* o: {name, sub, price, icon (элемент значка), title, run: async () => текст ошибки или null} → Promise<boolean> */
function osPay(o){
  return new Promise(function(done){
    var ov=el('div','payov'),box=el('div','paybox'),bal=(ME&&ME.tubek)||0,short=o.price-bal;
    var hd=el('div','payhd');hd.append(el('b',null,o.title||'HoroStore'));
    var x=el('button','payx','✕');x.setAttribute('aria-label','Отмена');hd.append(x);
    var it=el('div','payit');var tx=el('div');tx.append(el('b',null,o.name),el('small',null,o.sub||''));it.append(o.icon,tx);
    var rows=el('div','payrows');
    function row(k,v,cls){var r=el('div','payrow'+(cls?' '+cls:''));r.append(el('span',null,k),el('b',null,v));rows.append(r);}
    row(Lx('Аккаунт','Account'),ME?'@'+ME.nick:'—');
    row(Lx('Баланс','Balance'),bal+' 🪙');
    row(Lx('Цена','Price'),o.price+' 🪙','big');
    var st=el('div','payst'),msg=el('p','paymsg');
    pkCheck();
    var pay=el('button','paybtn',Lx('Оплатить ','Pay ')+o.price+' 🪙');
    var hint=el('p','payhint');
    function hintTx(){var has=null;try{has=localStorage.getItem(pkKey());}catch(e){}hint.textContent=PK.ok?Lx('Подтвердишь: ','You confirm with ')+pkName()+(has?'':Lx('. В первый раз телефон предложит сохранить ключ HoroTube — нажми «Продолжить».','. The first time your phone offers to save a HoroTube passkey: tap Continue.')):'';}
    hintTx();setTimeout(hintTx,300);
    box.append(hd,it,rows,msg,pay,hint,st);ov.append(box);
    if(short>0){
      pay.disabled=true;msg.className='paymsg bad';
      msg.textContent=Lx('Не хватает ','You need ')+short+Lx(' 🪙. Забирай ежедневный бонус и играй в шахматы.',' more 🪙. Claim the daily bonus and play chess.');
      hint.hidden=true;
      var how=btn(Lx('Как заработать Tubek','How to earn Tubek'),'mbtn',function(){close(false);openSettings('tubek');});box.insertBefore(how,st);
    }
    document.body.append(ov);
    requestAnimationFrame(function(){ov.classList.add('show');});
    function close(ok){ov.classList.remove('show');ov.classList.add('hide');setTimeout(function(){ov.remove();},380);done(ok);}
    x.addEventListener('click',function(){if(!box.classList.contains('busy'))close(false);});
    ov.addEventListener('click',function(e){if(e.target===ov&&!box.classList.contains('busy'))close(false);});
    var FACE='<svg class="payface" viewBox="0 0 60 60"><path d="M6 18V10a4 4 0 0 1 4-4h8M42 6h8a4 4 0 0 1 4 4v8M54 42v8a4 4 0 0 1-4 4h-8M18 54h-8a4 4 0 0 1-4-4v-8"/><path d="M22 22v4M38 22v4M30 24v10h-3M23 40c4 4 10 4 14 0"/></svg>';
    /* одно нажатие на «Оплатить» — и сразу системный Face ID */
    pay.addEventListener('click',function(){
      if(pay.disabled)return;
      if(!PK.ok){go(false);return;}
      var ask;try{ask=pkAsk();}catch(e){ask=Promise.reject(e);}
      box.classList.add('busy');pay.disabled=true;x.disabled=true;hint.hidden=true;msg.textContent='';msg.className='paymsg';
      st.innerHTML=FACE;st.append(el('b',null,pkName()));box.classList.add('scan');
      ask.then(function(){go(true);},function(e){
        box.classList.remove('busy','scan');pay.disabled=false;x.disabled=false;hint.hidden=false;
        msg.className='paymsg bad';
        msg.textContent=e&&e.name==='NotAllowedError'?Lx('Оплата отменена: ','Payment cancelled: ')+pkName()+Lx(' не подтверждён.',' was not confirmed.'):Lx('Не получилось проверить: ','Could not verify: ')+(e&&e.message||e);
        /* ключ могли удалить в «Пароли» — дадим создать заново */
        if(!msg.nextSibling||!msg.nextSibling.classList||!msg.nextSibling.classList.contains('payreset')){
          var rs=btn(Lx('Face ID не появился? Создать ключ заново','No Face ID prompt? Create the key again'),'payreset',function(){try{localStorage.removeItem(pkKey());}catch(er){}rs.remove();hintTx();msg.textContent='';});
          box.insertBefore(rs,pay);
        }
      });
    });
    async function go(real){
      box.classList.add('busy');pay.disabled=true;x.disabled=true;hint.hidden=true;
      if(!real){
        /* устройства без Face ID и отпечатка: только короткая анимация */
        st.innerHTML=FACE;st.append(el('b',null,Lx('Подтверждение','Confirming')));box.classList.add('scan');
        await new Promise(function(r){setTimeout(r,700);});
      }
      box.classList.remove('scan');box.classList.add('proc');
      st.innerHTML='<svg class="payring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24"/></svg>';st.append(el('b',null,Lx('Оплата…','Processing…')));
      var err=null;
      try{err=await o.run();}catch(e){err=e.message||String(e);}
      box.classList.remove('proc');
      if(err){
        box.classList.add('fail');
        st.innerHTML='<svg class="payok" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24"/><path d="M22 22l16 16M38 22L22 38"/></svg>';
        st.append(el('b',null,Lx('Не получилось','Failed')));msg.className='paymsg bad';msg.textContent=err;
        x.disabled=false;box.classList.remove('busy');
        return;
      }
      box.classList.add('ok');
      st.innerHTML='<svg class="payok" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24"/><path d="M19 31l7 7 15-16"/></svg>';
      st.append(el('b',null,Lx('Готово','Done')));
      if(navigator.vibrate)try{navigator.vibrate([10,60,20]);}catch(e){}
      if(o.confetti)payConfetti(box);
      setTimeout(function(){close(true);},1500);
    }
  });
}
/* золотые звёздочки после покупки премиума */
function payConfetti(box){
  for(var i=0;i<26;i++){
    var s=el('i','paystar',i%3?'✦':'⭐');
    s.style.setProperty('--dx',(Math.random()*360-180)+'px');s.style.setProperty('--dy',(-Math.random()*260-60)+'px');s.style.setProperty('--r',(Math.random()*540-270)+'deg');
    s.style.animationDelay=(Math.random()*.25)+'s';box.append(s);
  }
}
function payIcon(emoji,bg){var a={bg:bg,i:emoji};return appIcon(a,64);}
/* тарифы из «Премиума» теперь оплачиваются через этот лист */
async function buyPlan(T,p){
  if(!ME){openAuth(false);return;}
  var m=$('prMsg');if(m)m.textContent='';
  if(ME.premium){osToast(Lx('У тебя уже бессрочный премиум','You already have permanent premium'));return;}
  var ok=await osPay({title:Lx('Премиум','Premium'),name:T.t,sub:daysText(p.d)+(p.n?' · '+p.n:''),price:p.c,confetti:T.id==='all',
    icon:payIcon(T.id==='all'?'⭐':'🎮',T.id==='all'?'linear-gradient(160deg,#FFE259,#FFA751)':'linear-gradient(160deg,#7B5CFA,#3A1C9E)'),
    run:async function(){var r=await SB.rpc('ht_buy_plan',{plan:T.id,days:p.d});return r.error?rus(r.error.message):null;}});
  if(!ok)return;
  await refreshTubek();headerAv();
  if(pageOn('p-prem'))drawPrem();
  if(pageOn('p-settings'))openSettings();
  drawWidgets();
}
/* ---------- платные приложения HoroStore ---------- */
OS.owned={};
function ownKey(){return 'h_owned_'+(ME?ME.id:'');}
function ownCache(){OS.owned={};try{(JSON.parse(localStorage.getItem(ownKey())||'[]')||[]).forEach(function(k){OS.owned[k]=1;});}catch(e){}}
async function ownLoad(){
  ownCache();
  if(!SB||!ME)return;
  var r=await SB.from('ht_app_buys').select('app').eq('user_id',ME.id);
  if(r.error)return;
  OS.owned={};(r.data||[]).forEach(function(x){OS.owned[x.app]=1;});
  try{localStorage.setItem(ownKey(),JSON.stringify(Object.keys(OS.owned)));}catch(e){}
  if(pageOn('p-home'))drawHome(true);
}
function appOwned(a){if(a.user)return !a.price||!!(a.raw&&(a.raw.owned||a.raw.mine));return !a.price||!!OS.owned[a.id];}
async function buyApp(a){
  if(!ME){openAuth(false);return false;}
  var ok=await osPay({name:a.t,sub:a.d,price:a.price,icon:appIcon(a,64),
    run:async function(){var r=a.user?await SB.rpc('ht_buy_user_app',{app:a.uid}):await SB.rpc('ht_buy_app',{item:a.id});if(r.error)return dbMissing(r.error)?Lx('Покупки заработают, когда администратор выполнит apps.sql','Purchases will work once the admin runs apps.sql'):rus(r.error.message);return null;}});
  if(!ok)return false;
  if(a.user){if(a.raw)a.raw.owned=true;}
  else{OS.owned[a.id]=1;try{localStorage.setItem(ownKey(),JSON.stringify(Object.keys(OS.owned)));}catch(e){}}
  await refreshTubek();headerAv();drawWidgets();
  return true;
}
/* ---------- раздел «Tubek и Премиум» в Настройках ---------- */
async function setTubek(r){
  if(!ME){r.append(el('p','osempty','Войди, чтобы копить Tubek.'),btn('Войти','mbtn go',function(){openAuth(false);}));return;}
  var card=el('div','tubcard');
  var g=typeof gamesUntil==='function'?gamesUntil():null;
  card.append(el('small',null,'TUBEK'),el('b',null,(ME.tubek||0)+' 🪙'),el('span',null,isPremium()?premText():g?'🎮 Игры до '+g.toLocaleDateString(dloc(),{day:'numeric',month:'long'}):'Премиума нет'));
  var bonus=btn('🎁 Ежедневный бонус +3 🪙','tubbonus',function(){var d=$('dailyBtn');if(d)d.click();setTimeout(async function(){await refreshTubek();openSettings('tubek');},900);});
  card.append(bonus);r.append(card);
  r.append(el('h3','seth','Тарифы'));
  TIERS.forEach(function(T){
    setGroup(r,T.plans.map(function(p){
      var on=T.id==='all'?premUntil():g;
      return setLine(T.t+' · '+daysText(p.d),p.c+' 🪙  ›',function(){buyPlan(T,p);});
    }));
  });
  r.append(el('p','avhint','Всё покупается только за Tubek. Если тариф уже идёт, новые дни добавляются к нему.'));
  var paid=APPS.filter(function(a){return a.price&&OS.owned[a.id];});
  r.append(el('h3','seth','Мои покупки'));
  if(!paid.length)setGroup(r,[setLine('Платных приложений пока нет','HoroStore ›',function(){openApp('store');})]);
  else setGroup(r,paid.map(function(a){var x=setLine(a.t,'›',function(){openApp(a.id);});x.prepend(appIcon(a,30));return x;}));
  r.append(el('h3','seth','Как заработать Tubek'));
  setGroup(r,['🎁 Ежедневный бонус: +3 🪙','📚 Каждый новый урок учителя: +2 🪙','🎬 Твоё видео одобрили: +10 🪙','♟ За шахматы всего до 20 🪙 в день','🤝 Новый друг по QR-коду: +1 🪙'].map(function(t){return setLine(t,null);}));
  r.append(el('h3','seth','История Tubek'));
  var hist=el('div','setgrp');r.append(hist);
  var q=await SB.from('ht_tubek_log').select('source,amount,ref,created_at').eq('user_id',ME.id).order('created_at',{ascending:false}).limit(20);
  if(q.error){hist.append(setLine('История появится, когда администратор выполнит premium_chess.sql',null));return;}
  if(!q.data.length){hist.append(setLine('Пока пусто',null));return;}
  q.data.forEach(function(x){
    var name=x.source==='app'?Lx('Покупка: ','Purchase: ')+((appById(x.ref)||{}).t||x.ref):x.source==='uapp'?Lx('Покупка приложения ученика','Bought a student app'):x.source==='uapp_sale'?Lx('Твоё приложение купили','Someone bought your app'):(LOGN[x.source]||x.source);
    var l=setLine(name,null);var v=el('b',x.amount>0?'tubplus':'tubminus',(x.amount>0?'+':'')+x.amount+' 🪙');
    l.append(el('small','tubtime',fmtTime(x.created_at)),v);hist.append(l);
  });
}
