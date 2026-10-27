/* ===== Календарь: личное расписание с повторами и напоминаниями ===== */
var CALC={blue:'#0A84FF',red:'#FF453A',green:'#30D158',orange:'#FF9F0A',purple:'#BF5AF2',pink:'#FF375F',gray:'#8E8E93'};
var CAL_REP={none:'Не повторять',daily:'Каждый день',weekdays:'По будням',weekly:'Каждую неделю',monthly:'Каждый месяц',yearly:'Каждый год'};
var CAL_REM={'':'Без напоминания','0':'В момент события','5':'За 5 минут','10':'За 10 минут','15':'За 15 минут','30':'За 30 минут','60':'За 1 час','1440':'За 1 день'};
var CAL={ev:null,month:null,day:null,loaded:0};
function dkey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function sod(d){var x=new Date(d);x.setHours(0,0,0,0);return x;}
async function calLoad(force){
  if(!SB||!ME)return [];
  if(CAL.ev&&!force&&Date.now()-CAL.loaded<120000)return CAL.ev;
  var r=await SB.from('ht_events').select('*').eq('user_id',ME.id).order('start_at').limit(1000);
  if(r.error){CAL.err=r.error;CAL.ev=[];return [];}
  CAL.err=null;CAL.ev=r.data||[];CAL.loaded=Date.now();
  return CAL.ev;
}
/* все повторы события в интервале [a,b) */
function calOcc(e,a,b){
  var s=new Date(e.start_at),len=e.end_at?new Date(e.end_at)-s:3600e3,out=[];
  if(e.repeat==='none'){if(s<b&&+s+len>a)out.push(s);return out;}
  var d=new Date(s),n=0;
  /* перематываем ближе к a, чтобы не перебирать годы */
  if(e.repeat==='daily'||e.repeat==='weekdays'){var skip=Math.floor((a-s)/864e5)-1;if(skip>0)d.setDate(d.getDate()+skip);}
  if(e.repeat==='weekly'){var sw=Math.floor((a-s)/(7*864e5))-1;if(sw>0)d.setDate(d.getDate()+sw*7);}
  while(d<b&&n++<800){
    if(+d+len>a&&!(e.repeat==='weekdays'&&(d.getDay()===0||d.getDay()===6)))out.push(new Date(d));
    if(e.repeat==='daily'||e.repeat==='weekdays')d.setDate(d.getDate()+1);
    else if(e.repeat==='weekly')d.setDate(d.getDate()+7);
    else if(e.repeat==='monthly')d.setMonth(d.getMonth()+1);
    else if(e.repeat==='yearly')d.setFullYear(d.getFullYear()+1);
    else break;
  }
  return out;
}
function calDay(day){
  var a=sod(day),b=new Date(+a+864e5),l=[];
  (CAL.ev||[]).forEach(function(e){calOcc(e,a,b).forEach(function(t){l.push({e:e,t:t});});});
  return l.sort(function(x,y){return (y.e.all_day-x.e.all_day)||(x.t-y.t);});
}
function calTime(d){return d.toLocaleTimeString(dloc(),{hour:'2-digit',minute:'2-digit'});}
/* ближайшие события для виджета */
async function calUpcoming(n){
  await calLoad();
  var now=new Date(),l=[];
  (CAL.ev||[]).forEach(function(e){calOcc(e,sod(now),new Date(+now+14*864e5)).forEach(function(t){var end=e.end_at?+t+(new Date(e.end_at)-new Date(e.start_at)):+t+3600e3;if(end>now||e.all_day&&dkey(t)===dkey(now))l.push({e:e,t:t});});});
  l.sort(function(a,b){return a.t-b.t;});
  return l.slice(0,n).map(function(x){var today=dkey(x.t)===dkey(now);return {title:x.e.title,color:x.e.color,all_day:x.e.all_day,when:(today?'':x.t.toLocaleDateString(dloc(),{weekday:'short',day:'numeric'})+' · ')+(x.e.all_day?'весь день':calTime(x.t))};});
}
async function openCal(){
  showPage('p-cal');
  var b=$('caBody');b.textContent='';
  if(!needSB(b,'Войди в аккаунт, чтобы вести своё расписание.'))return;
  if(!CAL.month){CAL.month=new Date();CAL.month.setDate(1);CAL.day=sod(new Date());}
  await calLoad(true);
  if(CAL.err){dbErr(b,CAL.err);return;}
  calDraw();
}
function calDraw(){
  var b=$('caBody');b.textContent='';
  var wrap=el('div','cawrap');
  var m=el('div','camonth');
  var hd=el('div','cahd');
  var ttl=CAL.month.toLocaleDateString(dloc(),{month:'long',year:'numeric'});
  hd.append(el('h2','iptitle',ttl.charAt(0).toUpperCase()+ttl.slice(1)));
  var nav=el('div','canav');
  nav.append(btn('‹','mbtn',function(){CAL.month.setMonth(CAL.month.getMonth()-1);calDraw();}),btn('Сегодня','mbtn',function(){CAL.month=new Date();CAL.month.setDate(1);CAL.day=sod(new Date());calDraw();}),btn('›','mbtn',function(){CAL.month.setMonth(CAL.month.getMonth()+1);calDraw();}),btn('＋','mbtn go',function(){calEdit(null,CAL.day);}));
  hd.append(nav);m.append(hd);
  var wd=el('div','cawd');
  for(var k=0;k<7;k++){var x=new Date(2024,0,1+k);wd.append(el('span',null,x.toLocaleDateString(dloc(),{weekday:'short'})));}
  m.append(wd);
  var g=el('div','cagrid');
  var first=new Date(CAL.month),off=(first.getDay()+6)%7,start=new Date(first);start.setDate(1-off);
  var today=dkey(new Date());
  for(var i=0;i<42;i++){
    var d=new Date(start);d.setDate(start.getDate()+i);
    var c=el('button','caday'+(d.getMonth()!==CAL.month.getMonth()?' out':'')+(dkey(d)===today?' today':'')+(CAL.day&&dkey(d)===dkey(CAL.day)?' on':''));
    c.append(el('b',null,String(d.getDate())));
    var evs=calDay(d),dots=el('div','cadots');
    evs.slice(0,3).forEach(function(x){var t=el('span','cachip',x.e.title);t.style.setProperty('--c',CALC[x.e.color]);dots.append(t);});
    if(evs.length>3)dots.append(el('small',null,'+'+(evs.length-3)));
    c.append(dots);
    (function(d){c.addEventListener('click',function(){CAL.day=sod(d);calDraw();b.querySelector('.cawrap').classList.add('open');});c.addEventListener('dblclick',function(){calEdit(null,d);});})(d);
    g.append(c);
  }
  m.append(g);
  var side=el('div','caside');
  side.append(btn('‹ Месяц','ipback',function(){b.querySelector('.cawrap').classList.remove('open');}));
  var dt=CAL.day.toLocaleDateString(dloc(),{weekday:'long',day:'numeric',month:'long'});
  side.append(el('h3','cadt',dt.charAt(0).toUpperCase()+dt.slice(1)));
  var l=calDay(CAL.day);
  if(!l.length)side.append(el('p','osempty','Событий нет'));
  l.forEach(function(x){
    var r=el('button','caev');r.style.setProperty('--c',CALC[x.e.color]);
    var end=x.e.end_at?new Date(+x.t+(new Date(x.e.end_at)-new Date(x.e.start_at))):null;
    r.append(el('small',null,x.e.all_day?'весь день':calTime(x.t)+(end?' – '+calTime(end):'')),el('b',null,x.e.title));
    if(x.e.notes)r.append(el('p',null,x.e.notes));
    if(x.e.repeat!=='none')r.append(el('em',null,'🔁 '+CAL_REP[x.e.repeat]));
    r.addEventListener('click',function(){calEdit(x.e);});
    side.append(r);
  });
  side.append(btn('＋ Новое событие','mbtn go',function(){calEdit(null,CAL.day);}));
  wrap.append(m,side);b.append(wrap);
}
function pad2(n){return String(n).padStart(2,'0');}
function calEdit(e,day){
  osSheet(function(box,close){
    var s=e?new Date(e.start_at):new Date(day||new Date());
    if(!e){var now=new Date();s.setHours(now.getHours()+1,0,0,0);}
    var en=e&&e.end_at?new Date(e.end_at):new Date(+s+3600e3);
    box.append(el('h2',null,e?'Событие':'Новое событие'));
    var t=inp('text',e?e.title:'','Название',100);
    var ad=el('input');ad.type='checkbox';ad.checked=e?e.all_day:false;
    var dd=el('input');dd.type='date';dd.value=dkey(s);
    var ts=el('input');ts.type='time';ts.value=pad2(s.getHours())+':'+pad2(s.getMinutes());
    var te=el('input');te.type='time';te.value=pad2(en.getHours())+':'+pad2(en.getMinutes());
    var rp=sel(Object.keys(CAL_REP).map(function(k){return [k,CAL_REP[k]];}),e?e.repeat:'none');
    var rm=sel(Object.keys(CAL_REM).map(function(k){return [k,CAL_REM[k]];}),e&&e.remind_min!=null?String(e.remind_min):'');
    var cl=el('div','cacols');var color=e?e.color:'blue';
    Object.keys(CALC).forEach(function(k){var c=el('button','cacol'+(color===k?' on':''));c.style.background=CALC[k];c.title=k;c.addEventListener('click',function(){color=k;cl.querySelectorAll('.cacol').forEach(function(z){z.classList.toggle('on',z===c);});});cl.append(c);});
    var nt=inp('textarea',e?e.notes||'':'','Заметки',500);
    var times=el('div','edrow');times.append(ts,el('span',null,'–'),te);
    var adl=el('label','cachk');adl.append(ad,el('span',null,'Весь день'));
    ad.addEventListener('change',function(){times.style.display=ad.checked?'none':'';});times.style.display=ad.checked?'none':'';
    box.append(t,adl,field('Дата',dd),field('Время',times),field('Повтор',rp),field('Напомнить',rm),field('Цвет',cl),nt);
    var msg=el('p','bad');box.append(msg);
    var row=el('div','mrow');
    if(e)row.append(btn('Удалить','mbtn',async function(){if(!confirm('Удалить событие'+(e.repeat!=='none'?' и все его повторы':'')+'?'))return;var r=await SB.from('ht_events').delete().eq('id',e.id);if(r.error){alert(r.error.message);return;}CAL.ev=CAL.ev.filter(function(x){return x.id!==e.id;});close();calDraw();}));
    row.append(btn('Отмена','mbtn',close),btn('Сохранить','mbtn go',async function(){
      var title=t.value.trim();if(!title){msg.textContent='Напиши название';return;}
      var p=dd.value.split('-').map(Number);if(p.length<3||!p[0]){msg.textContent='Выбери дату';return;}
      var st=new Date(p[0],p[1]-1,p[2]),fin;
      if(ad.checked){fin=null;}
      else{var a=ts.value.split(':'),z=te.value.split(':');st.setHours(+a[0]||0,+a[1]||0);fin=new Date(p[0],p[1]-1,p[2],+z[0]||0,+z[1]||0);if(fin<st)fin=new Date(+st+3600e3);}
      var rec={title:title,notes:nt.value.trim()||null,start_at:st.toISOString(),end_at:fin?fin.toISOString():null,all_day:ad.checked,color:color,repeat:rp.value,remind_min:rm.value===''?null:+rm.value};
      var r=e?await SB.from('ht_events').update(rec).eq('id',e.id).select('*').single():await SB.from('ht_events').insert(rec).select('*').single();
      if(r.error||!r.data){msg.textContent=r.error?r.error.message:'Не сохранилось';return;}
      if(e)Object.assign(e,r.data);else CAL.ev.push(r.data);
      CAL.day=sod(st);CAL.month=new Date(st);CAL.month.setDate(1);
      close();calDraw();
      if(rec.remind_min!=null&&window.Notification&&Notification.permission==='default')Notification.requestPermission();
    }));
    box.append(row);
    if(!e)setTimeout(function(){t.focus();},50);
  });
}
/* напоминания: проверяем каждые 20 секунд, пока сайт открыт */
var CAL_FIRED={};try{CAL_FIRED=JSON.parse(localStorage.getItem('h_calf')||'{}');}catch(e){}
setInterval(async function(){
  if(!SB||!ME)return;
  await calLoad();
  var now=Date.now();
  (CAL.ev||[]).forEach(function(e){
    if(e.remind_min==null)return;
    calOcc(e,new Date(now-864e5),new Date(now+2*864e5)).forEach(function(t){
      var at=+t-e.remind_min*60000,k=e.id+'@'+(+t);
      if(at<=now&&now-at<10*60000&&!CAL_FIRED[k]){
        CAL_FIRED[k]=now;try{localStorage.setItem('h_calf',JSON.stringify(CAL_FIRED));}catch(er){}
        osAlarm('📅 '+e.title,e.all_day?'Сегодня':calTime(t)+(e.notes?' · '+e.notes:''),false);
      }
    });
  });
},20000);
