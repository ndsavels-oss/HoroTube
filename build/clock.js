/* ===== Часы: мировое время, будильник, секундомер, таймер ===== */
var CK={tab:'timer',sw:null,laps:[],swT:0};
function ckGet(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}}
function ckSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
/* звук: короткие «бипы» через WebAudio, без файлов */
var _ac=null,_ring=0;
function beep(n){
  try{_ac=_ac||new (window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();
    for(var i=0;i<(n||3);i++){var o=_ac.createOscillator(),g=_ac.createGain(),t=_ac.currentTime+i*0.28;o.type='sine';o.frequency.value=i%2?988:1319;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.25,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.24);o.connect(g);g.connect(_ac.destination);o.start(t);o.stop(t+.25);}
  }catch(e){}
}
/* окно звонка: будильник, таймер, напоминание календаря */
function osAlarm(title,text,snooze,onSnooze){
  $('osRingT').textContent=title;$('osRingP').textContent=text||'';
  $('osRingSn').style.display=snooze?'':'none';
  $('osRing').classList.add('show');
  clearInterval(_ring);beep(4);_ring=setInterval(function(){beep(4);},2000);
  setTimeout(function(){clearInterval(_ring);},60000);
  $('osRingSn').onclick=function(){ckRingOff();if(onSnooze)onSnooze();};
  try{if(window.Notification&&Notification.permission==='granted'&&document.hidden)new Notification(title,{body:text||''});}catch(e){}
}
function ckRingOff(){clearInterval(_ring);$('osRing').classList.remove('show');}
$('osRingOk').addEventListener('click',ckRingOff);
function ckFmt(ms,cs){ms=Math.max(0,ms);var h=Math.floor(ms/3600e3),m=Math.floor(ms%3600e3/60e3),s=Math.floor(ms%60e3/1000),c=Math.floor(ms%1000/10);return (h?h+':'+pad2(m):pad2(m))+':'+pad2(s)+(cs?','+pad2(c):'');}
function openClock(tab){
  if(tab)CK.tab=tab;
  showPage('p-clock');
  ckDraw();
}
function ckDraw(){
  var b=$('ckBody');b.textContent='';
  var tabs=el('div','cktabs');
  [['world','🌍','Мировое время'],['alarm','⏰','Будильник'],['sw','⏱','Секундомер'],['timer','⏲','Таймер']].forEach(function(t){var x=el('button','cktab'+(CK.tab===t[0]?' on':''));x.append(el('i',null,t[1]),el('span',null,t[2]));x.addEventListener('click',function(){CK.tab=t[0];ckDraw();});tabs.append(x);});
  var box=el('div','ckbox');
  b.append(box,tabs);
  ({world:ckWorld,alarm:ckAlarm,sw:ckSw,timer:ckTimer}[CK.tab])(box);
}
var CK_CITIES=[['Рига','Europe/Riga'],['Москва','Europe/Moscow'],['Лондон','Europe/London'],['Нью-Йорк','America/New_York'],['Токио','Asia/Tokyo'],['Дубай','Asia/Dubai'],['Сидней','Australia/Sydney'],['Лос-Анджелес','America/Los_Angeles']];
function ckWorld(box){
  box.append(el('h2','iptitle','Мировое время'));
  var g=el('div','ckworld');
  CK_CITIES.forEach(function(c){
    var r=el('div','ckcity');var f=el('div','aicon aclock ckface');var fc=el('i','face');fc.append(el('i','hh'),el('i','mm'),el('i','ss'));f.append(fc);f.dataset.tz=c[1];
    var t=el('div');t.append(el('b',null,c[0]),el('small','cktz',''));
    var tm=el('span','cktm','');r.append(f,t,tm);r.dataset.tz=c[1];g.append(r);
  });
  box.append(g);ckWorldTick();
}
function ckWorldTick(){
  document.querySelectorAll('.ckcity').forEach(function(r){
    var tz=r.dataset.tz,n=new Date(),s;
    try{s=n.toLocaleTimeString('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}catch(e){return;}
    var p=s.split(':').map(Number);
    r.querySelector('.cktm').textContent=pad2(p[0])+':'+pad2(p[1]);
    var loc=new Date(n.toLocaleString('en-US',{timeZone:tz})),diff=Math.round((loc-new Date(n.toLocaleString('en-US')))/3600e3);
    r.querySelector('.cktz').textContent=(diff===0?'Сегодня, как у тебя':(diff>0?'+':'')+diff+Lx(' ч',' h'));
    var f=r.querySelector('.ckface');f.querySelector('.hh').style.transform='rotate('+((p[0]%12)*30+p[1]/2)+'deg)';f.querySelector('.mm').style.transform='rotate('+(p[1]*6)+'deg)';f.querySelector('.ss').style.transform='rotate('+(p[2]*6)+'deg)';
  });
}
/* будильник */
function ckAlarm(box){
  var al=ckGet('h_alarms',[]);
  var hd=el('div','ckhd');hd.append(el('h2','iptitle','Будильник'),btn('＋','mbtn go',function(){ckAlarmEdit();}));box.append(hd);
  if(!al.length)box.append(el('p','osempty','Будильников нет. Нажми ＋.'));
  al.forEach(function(a,i){
    var r=el('div','ckal'+(a.on?'':' off'));
    var t=el('div');t.append(el('b',null,a.t),el('small',null,(a.label||'Будильник')+(a.days&&a.days.length?' · '+ckDays(a.days):'')));
    t.addEventListener('click',function(){ckAlarmEdit(i);});
    r.append(t,setToggle(a.on,function(v){al[i].on=v;ckSet('h_alarms',al);ckDraw();}));box.append(r);
  });
  box.append(el('p','avhint','Будильник звонит, пока HoroTube открыт в браузере (можно в фоновой вкладке).'));
}
var CK_WD=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
function ckWd(){return LANG==='en'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:CK_WD;}
function ckDays(d){if(d.length===7)return 'каждый день';if(d.join()==='0,1,2,3,4')return 'по будням';return d.map(function(x){return ckWd()[x];}).join(' ');}
function ckAlarmEdit(i){
  var al=ckGet('h_alarms',[]),a=i!=null?al[i]:{t:'07:00',label:'',days:[],on:true};
  osSheet(function(box,close){
    box.append(el('h2',null,i!=null?'Будильник':'Новый будильник'));
    var t=el('input');t.type='time';t.value=a.t;t.className='cktime';
    var lb=inp('text',a.label,'Подпись',40);
    var dw=el('div','ckdw');var days=(a.days||[]).slice();
    ckWd().forEach(function(n,k){var x=btn(n,'ckd'+(days.indexOf(k)>=0?' on':''),function(){var j=days.indexOf(k);if(j>=0)days.splice(j,1);else days.push(k);days.sort();x.classList.toggle('on');});dw.append(x);});
    box.append(t,field('Повтор',dw),field('Подпись',lb));
    var row=el('div','mrow');
    if(i!=null)row.append(btn('Удалить','mbtn',function(){al.splice(i,1);ckSet('h_alarms',al);close();ckDraw();}));
    row.append(btn('Отмена','mbtn',close),btn('Сохранить','mbtn go',function(){
      var x={t:t.value||'07:00',label:lb.value.trim().slice(0,40),days:days,on:true,last:''};
      if(i!=null)al[i]=x;else al.push(x);ckSet('h_alarms',al);close();ckDraw();
      if(window.Notification&&Notification.permission==='default')Notification.requestPermission();
      osToast('Будильник на '+x.t);
    }));
    box.append(row);
  });
}
/* секундомер */
function ckSw(box){
  var s=ckGet('h_sw',{start:0,acc:0,laps:[]});
  var run=!!s.start,now=function(){return s.acc+(s.start?Date.now()-s.start:0);};
  box.append(el('h2','iptitle','Секундомер'));
  var big=el('div','ckbig',ckFmt(now(),true));big.id='ckSwT';box.append(big);
  var row=el('div','ckbtns');
  row.append(btn(run?'Круг':'Сброс','ckb gray',function(){if(run){s.laps.unshift(now());}else{s={start:0,acc:0,laps:[]};}ckSet('h_sw',s);ckDraw();}),
    btn(run?'Стоп':'Старт','ckb '+(run?'red':'green'),function(){if(run){s.acc=now();s.start=0;}else s.start=Date.now();ckSet('h_sw',s);ckDraw();}));
  box.append(row);
  var l=el('div','cklaps');
  s.laps.forEach(function(t,k){var prev=s.laps[k+1]||0;var r=el('div');r.append(el('span',null,'Круг '+(s.laps.length-k)),el('b',null,ckFmt(t-prev,true)));l.append(r);});
  box.append(l);
}
/* таймер */
var CK_PRE=[[1,'1 мин','1 min'],[3,'3 мин','3 min'],[5,'5 мин','5 min'],[10,'10 мин','10 min'],[15,'15 мин','15 min'],[25,'25 мин · учёба','25 min · study'],[45,'45 мин · урок','45 min · lesson'],[60,'1 час','1 hour']];
function ckTimer(box){
  var t=ckGet('h_timer',null);
  box.append(el('h2','iptitle','Таймер'));
  if(t){
    var left=t.paused?t.left:t.end-Date.now();
    var ring=el('div','ckring');ring.innerHTML='<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="bg"/><circle cx="50" cy="50" r="45" class="fg" id="ckArc"/></svg>';
    var big=el('div','ckbig',ckFmt(left));big.id='ckTmT';ring.append(big);
    var lab=el('small','ckend',t.paused?'Пауза':'Закончится в '+calTime(new Date(t.end)));lab.id='ckTmE';ring.append(lab);
    box.append(ring);
    var row=el('div','ckbtns');
    row.append(btn('Отмена','ckb gray',function(){ckSet('h_timer',null);ckDraw();}),
      btn(t.paused?'Дальше':'Пауза','ckb '+(t.paused?'green':'orange'),function(){if(t.paused){t.end=Date.now()+t.left;t.paused=false;}else{t.left=t.end-Date.now();t.paused=true;}ckSet('h_timer',t);ckDraw();}));
    box.append(row);ckTimerTick();
    return;
  }
  var w=el('div','ckpick');
  var h=el('input'),m=el('input'),s=el('input');[h,m,s].forEach(function(x,k){x.type='number';x.min=0;x.max=k?59:23;x.value=k===1?5:0;x.className='cknum';});
  var lab=function(t){return el('span','cku',t);};
  w.append(h,lab(Lx('ч','h')),m,lab(Lx('мин','min')),s,lab(Lx('с','s')));box.append(w);
  var pre=el('div','ckpre');CK_PRE.forEach(function(p){var l=Lx(p[1],p[2]);pre.append(btn(l,'chip',function(){ckStart(p[0]*60000,l);}));});box.append(pre);
  var row2=el('div','ckbtns');row2.append(btn('Старт','ckb green',function(){var ms=((+h.value||0)*3600+(+m.value||0)*60+(+s.value||0))*1000;if(ms<1000){alert('Поставь время');return;}ckStart(ms,'');}));box.append(row2);
}
function ckStart(ms,label){ckSet('h_timer',{end:Date.now()+ms,total:ms,paused:false,left:0,label:label});beep(1);ckDraw();if(window.Notification&&Notification.permission==='default')Notification.requestPermission();}
function ckTimerTick(){
  var t=ckGet('h_timer',null),T=$('ckTmT');
  if(!t||!T)return;
  var left=t.paused?t.left:t.end-Date.now();T.textContent=ckFmt(left);
  var a=$('ckArc');if(a){var L=2*Math.PI*45;a.style.strokeDasharray=L;a.style.strokeDashoffset=L*(1-Math.max(0,left)/t.total);}
}
/* виджет на домашнем экране */
function clkWidget(){
  var w=$('wClock');if(!w)return;
  var t=ckGet('h_timer',null),al=ckGet('h_alarms',[]).filter(function(a){return a.on;});
  w.textContent='';
  if(t){var left=t.paused?t.left:t.end-Date.now();w.append(el('small',null,'ТАЙМЕР'),el('b','wck',ckFmt(left)),el('span',null,t.paused?'пауза':'идёт'));return;}
  var f=el('div','aicon aclock wface');var fc=el('i','face');fc.append(el('i','hh'),el('i','mm'),el('i','ss'));f.append(fc);
  w.append(f,el('span',null,al.length?'⏰ '+al.map(function(a){return a.t;}).sort()[0]:'Будильников нет'));
  clockTick();
}
/* общий тик: секундомер, таймер, будильники */
setInterval(function(){
  var sw=$('ckSwT');if(sw){var s=ckGet('h_sw',{start:0,acc:0});sw.textContent=ckFmt(s.acc+(s.start?Date.now()-s.start:0),true);}
  ckTimerTick();
  if(pageOn('p-clock')&&CK.tab==='world')ckWorldTick();
  var t=ckGet('h_timer',null);
  if(t&&!t.paused&&t.end<=Date.now()){ckSet('h_timer',null);osAlarm('⏲ Время вышло!',t.label||'Таймер',false);if(pageOn('p-clock'))ckDraw();}
  if(pageOn('p-home')&&$('wClock')&&(t||Date.now()%10000<120))clkWidget();
  var n=new Date(),hm=pad2(n.getHours())+':'+pad2(n.getMinutes()),wd=(n.getDay()+6)%7,key=dkey(n)+' '+hm;
  var al=ckGet('h_alarms',[]),ch=false;
  al.forEach(function(a){
    if(!a.on||a.t!==hm||a.last===key)return;
    if(a.days&&a.days.length&&a.days.indexOf(wd)<0)return;
    a.last=key;ch=true;
    if(!a.days||!a.days.length)a.on=false;
    osAlarm('⏰ '+a.t,a.label||'Будильник',true,function(){ckSet('h_timer',{end:Date.now()+5*60000,total:5*60000,paused:false,label:'Повтор будильника'});});
  });
  if(ch)ckSet('h_alarms',al);
},100);
