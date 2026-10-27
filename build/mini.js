/* ===== Заметки (хранятся на этом устройстве) ===== */
var NT={cur:null,q:''};
/* заметки свои у каждого аккаунта; старые общие достаются тому, кто первым откроет Заметки */
function ntAll(){var k=osKey('h_notes');if(k!=='h_notes'&&localStorage.getItem(k)==null&&localStorage.getItem('h_notes')!=null){try{localStorage.setItem(k,localStorage.getItem('h_notes'));localStorage.removeItem('h_notes');}catch(e){}}return ckGet(k,[]);}
function ntSave(l){ckSet(osKey('h_notes'),l);}
function openNotes(){showPage('p-notes');ntDraw();}
function ntDraw(){
  var b=$('ntBody');b.textContent='';
  var all=ntAll().sort(function(a,c){return (c.pin-a.pin)||(c.upd-a.upd);});
  var l=el('div','ip2l'),r=el('div','ip2r');
  var hd=el('div','mlhd');hd.append(el('h2','iptitle','Заметки'),btn('✏️','icon-btn',function(){var n={id:Date.now(),body:'',pin:0,upd:Date.now()};var a=ntAll();a.unshift(n);ntSave(a);NT.cur=n.id;ntDraw();b.classList.add('open');setTimeout(function(){var t=b.querySelector('.nted');if(t)t.focus();},50);}));
  l.append(hd);
  var q=inp('search',NT.q,'Поиск');q.className='ntq';q.addEventListener('input',function(){NT.q=q.value;ntList();});l.append(q);
  var list=el('div','ntlist');l.append(list);
  function ntList(){
    list.textContent='';
    var v=all.filter(function(n){return !NT.q||n.body.toLowerCase().indexOf(NT.q.toLowerCase())>=0;});
    if(!v.length)list.append(el('p','osempty','Заметок нет'));
    v.forEach(function(n){
      var lines=n.body.split('\n'),t=(lines[0]||'Новая заметка').slice(0,60),rest=lines.slice(1).join(' ').trim().slice(0,70);
      var it=el('button','ntit'+(NT.cur===n.id?' on':''));
      it.append(el('b',null,(n.pin?'📌 ':'')+t),el('small',null,new Date(n.upd).toLocaleDateString(dloc(),{day:'numeric',month:'short'})+'  '+(rest||'Нет текста')));
      it.addEventListener('click',function(){NT.cur=n.id;ntDraw();b.classList.add('open');});
      list.append(it);
    });
  }
  ntList();
  r.append(btn('‹ Заметки','ipback',function(){b.classList.remove('open');}));
  var n=all.filter(function(x){return x.id===NT.cur;})[0];
  if(!n){r.append(el('div','osempty','Выбери заметку или создай новую'));b.append(l,r);return;}
  var bar=el('div','ntbar');
  bar.append(el('small',null,new Date(n.upd).toLocaleString(dloc(),{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})),
    btn(n.pin?'📌 Открепить':'📌 Закрепить','mbtn',function(){var a=ntAll();a.forEach(function(x){if(x.id===n.id)x.pin=x.pin?0:1;});ntSave(a);ntDraw();}),
    btn('☑︎ Список','mbtn',function(){var t=r.querySelector('.nted');t.setRangeText((t.selectionStart&&t.value[t.selectionStart-1]!=='\n'?'\n':'')+'☐ ',t.selectionStart,t.selectionEnd,'end');t.dispatchEvent(new Event('input'));t.focus();}),
    btn('📁 '+Lx('В Файлы','To Files'),'mbtn',async function(){var t=r.querySelector('.nted').value;var f=await flSaveText({name:(t.split('\n')[0]||Lx('Заметка','Note')).slice(0,60),kind:'note',mime:'text/plain',body:t,src:'notes'});if(f)osToast(Lx('Заметка сохранена в Файлы','Note saved to Files'));}),
    btn('📄','mbtn',async function(){var t=r.querySelector('.nted').value;var f=await flSaveText({name:(t.split('\n')[0]||Lx('Заметка','Note')).slice(0,60),kind:'doc',mime:'text/html',body:docFromText(t),src:'notes'});if(f)openDocs(f.id);}),
    btn('🗑','mbtn',function(){if(!confirm('Удалить заметку?'))return;ntSave(ntAll().filter(function(x){return x.id!==n.id;}));NT.cur=null;b.classList.remove('open');ntDraw();}));
  r.append(bar);
  var ta=inp('textarea',n.body,'Начни писать… Первая строка станет названием.');ta.className='nted';
  ta.addEventListener('input',function(){var a=ntAll();a.forEach(function(x){if(x.id===n.id){x.body=ta.value.slice(0,20000);x.upd=Date.now();}});ntSave(a);});
  ta.addEventListener('blur',function(){ntList();});
  /* тап по ☐ / ☑ в начале строки — отметить */
  ta.addEventListener('click',function(){var p=ta.selectionStart,v=ta.value,s=v.lastIndexOf('\n',p-1)+1;if(p-s<=2&&(v[s]==='☐'||v[s]==='☑')){ta.value=v.slice(0,s)+(v[s]==='☐'?'☑':'☐')+v.slice(s+1);ta.setSelectionRange(p,p);ta.dispatchEvent(new Event('input'));}});
  r.append(ta);
  b.append(l,r);
}

/* ===== Калькулятор (с учётом порядка действий) ===== */
var CC={expr:[],cur:'0',fresh:true,last:''};
function openCalc(){showPage('p-calc');ccDraw();}
function ccNum(s){var n=parseFloat(s);if(!isFinite(n))return 'Ошибка';var r=Math.round(n*1e10)/1e10;var t=String(r);if(t.length>12)t=r.toPrecision(9).replace(/\.?0+(e|$)/,'$1');return t.replace('.',LANG==='en'?'.':',');}
function ccEval(tok){
  var pr={'+':1,'−':1,'×':2,'÷':2},out=[],ops=[];
  tok.forEach(function(t){if(typeof t==='number')out.push(t);else{while(ops.length&&pr[ops[ops.length-1]]>=pr[t])out.push(ops.pop());ops.push(t);}});
  while(ops.length)out.push(ops.pop());
  var st=[];out.forEach(function(t){if(typeof t==='number')st.push(t);else{var b=st.pop(),a=st.pop();st.push(t==='+'?a+b:t==='−'?a-b:t==='×'?a*b:a/b);}});
  return st[0];
}
function ccPress(k){
  var c=CC;
  if(/^[0-9]$/.test(k)){if(c.fresh){c.cur=k;c.fresh=false;}else if(c.cur.replace(/[^0-9]/g,'').length<12)c.cur=c.cur==='0'?k:c.cur+k;}
  else if(k==='.'){if(c.fresh){c.cur='0.';c.fresh=false;}else if(c.cur.indexOf('.')<0)c.cur+='.';}
  else if(k==='AC'){if(c.cur!=='0'&&!c.fresh){c.cur='0';c.fresh=true;}else{c.expr=[];c.cur='0';c.fresh=true;}}
  else if(k==='±'){c.cur=c.cur.charAt(0)==='-'?c.cur.slice(1):(c.cur==='0'?'0':'-'+c.cur);}
  else if(k==='%'){c.cur=String(parseFloat(c.cur)/100);}
  else if('+−×÷'.indexOf(k)>=0){if(c.fresh&&c.expr.length&&typeof c.expr[c.expr.length-1]!=='number')c.expr[c.expr.length-1]=k;else{c.expr.push(parseFloat(c.cur),k);}c.fresh=true;c.last=k;}
  else if(k==='='){if(!c.expr.length)return;c.expr.push(parseFloat(c.cur));var r=ccEval(c.expr);c.hist=(c.hist||[]).concat(c.expr.map(function(t){return typeof t==='number'?ccNum(t):t;}).join(' ')+' = '+ccNum(r)).slice(-20);c.expr=[];c.cur=String(r);c.fresh=true;}
  else if(k==='√'){c.cur=String(Math.sqrt(parseFloat(c.cur)));c.fresh=true;}
  else if(k==='x²'){var v=parseFloat(c.cur);c.cur=String(v*v);c.fresh=true;}
  else if(k==='π'){c.cur=String(Math.PI);c.fresh=true;}
  else if(k==='sin'||k==='cos'||k==='tan'){c.cur=String(Math[k](parseFloat(c.cur)*Math.PI/180));c.fresh=true;}
  else if(k==='1/x'){c.cur=String(1/parseFloat(c.cur));c.fresh=true;}
  else if(k==='⌫'){if(!c.fresh){c.cur=c.cur.length>1?c.cur.slice(0,-1):'0';}}
  ccDraw();
}
function ccDraw(){
  var b=$('ccBody');b.textContent='';
  var w=el('div','ccw');
  var hist=el('div','cchist');(CC.hist||[]).slice(-4).forEach(function(h){hist.append(el('div',null,h));});
  var ex=el('div','ccex',CC.expr.map(function(t){return typeof t==='number'?ccNum(t):t;}).join(' '));
  var d=el('div','ccd',ccNum(CC.cur));if(d.textContent.length>9)d.style.fontSize=Math.max(28,80-(d.textContent.length-9)*6)+'px';
  w.append(hist,ex,d);
  var keys=[['sin','cos','tan','π'],['√','x²','1/x','⌫'],['AC','±','%','÷'],['7','8','9','×'],['4','5','6','−'],['1','2','3','+'],['0','.','=']];
  var g=el('div','ccg');
  keys.forEach(function(row,ri){row.forEach(function(k){
    var cls='cck'+(ri<2?' sci':'')+('÷×−+='.indexOf(k)>=0?' op':'')+(['AC','±','%'].indexOf(k)>=0?' fn':'')+(k==='0'?' zero':'')+(CC.last===k&&CC.fresh&&'÷×−+'.indexOf(k)>=0?' on':'');
    var x=btn(k==='AC'&&!CC.fresh&&CC.cur!=='0'?'C':k==='.'?(LANG==='en'?'.':','):k,cls,function(){ccPress(k);});g.append(x);
  });});
  w.append(g);b.append(w);
}
document.addEventListener('keydown',function(e){
  if(!pageOn('p-calc')||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  var m={'*':'×','/':'÷','-':'−','+':'+','Enter':'=','=':'=','Escape':'AC','Backspace':'⌫',',':'.','.':'.','%':'%'};
  if(/^[0-9]$/.test(e.key))ccPress(e.key);else if(m[e.key]){e.preventDefault();ccPress(m[e.key]);}
});

/* ===== Скетч: рисование пальцем или стилусом ===== */
var PT={col:'#1C1C1E',size:6,tool:'pen',undo:[]};
var PT_COLS=['#1C1C1E','#FFFFFF','#FF3B30','#FF9500','#FFCC00','#34C759','#00C7BE','#007AFF','#5856D6','#AF52DE','#FF2D55','#8E8E93','#A2845E'];
function openPaint(){showPage('p-paint');ptDraw();}
function ptDraw(){
  var b=$('ptBody');b.textContent='';
  var bar=el('div','ptbar');
  [['pen','✏️ Ручка'],['marker','🖍 Маркер'],['eraser','🧽 Ластик']].forEach(function(t){bar.append(btn(t[1],'mbtn pttool'+(PT.tool===t[0]?' on':''),function(){PT.tool=t[0];ptDraw();}));});
  var sz=el('input');sz.type='range';sz.min=1;sz.max=60;sz.value=PT.size;sz.addEventListener('input',function(){PT.size=+sz.value;});
  bar.append(sz,btn('↶','mbtn',function(){var u=PT.undo.pop();if(u)g.putImageData(u,0,0);}),btn('🗑','mbtn',function(){if(confirm('Очистить холст?')){push();g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);}}),
    btn('⤓','mbtn',function(){var a=el('a');a.href=c.toDataURL('image/png');a.download='HoroTube-sketch.png';document.body.append(a);a.click();a.remove();}),
    btn('🌸 В Фото','mbtn go',function(){c.toBlob(async function(bl){var r=await gallerySaveBlob(bl,'photo',{w:c.width,h:c.height});if(r)osToast('Сохранено в Фото');},'image/jpeg',.92);}));
  var cols=el('div','ptcols');
  PT_COLS.forEach(function(k){var x=el('button','ptc'+(PT.col===k?' on':''));x.style.background=k;x.addEventListener('click',function(){PT.col=k;if(PT.tool==='eraser')PT.tool='pen';ptDraw();});cols.append(x);});
  var pick=el('input');pick.type='color';pick.value=PT.col;pick.addEventListener('input',function(){PT.col=pick.value;});cols.append(pick);
  var wrap=el('div','ptwrap');
  var c=document.createElement('canvas');c.className='ptc';
  if(PT.img){c.width=PT.img.width;c.height=PT.img.height;}else{c.width=1600;c.height=1100;}
  var g=c.getContext('2d');
  if(PT.img)g.putImageData(PT.img,0,0);else{g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);}
  wrap.append(c);b.append(bar,cols,wrap);
  function push(){PT.undo.push(g.getImageData(0,0,c.width,c.height));if(PT.undo.length>25)PT.undo.shift();}
  var last=null;
  function pos(e){var r=c.getBoundingClientRect();return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height,e.pressure||0.5];}
  c.addEventListener('pointerdown',function(e){c.setPointerCapture(e.pointerId);push();last=pos(e);dot(last,last);});
  c.addEventListener('pointermove',function(e){if(!last)return;var p=pos(e);dot(last,p);last=p;});
  ['pointerup','pointercancel'].forEach(function(t){c.addEventListener(t,function(){last=null;PT.img=g.getImageData(0,0,c.width,c.height);});});
  function dot(a,p){
    g.globalCompositeOperation='source-over';
    g.strokeStyle=PT.tool==='eraser'?'#fff':PT.col;g.globalAlpha=PT.tool==='marker'?0.35:1;
    g.lineWidth=PT.size*(PT.tool==='marker'?3:1)*(e2(p[2]));g.lineCap=g.lineJoin='round';
    g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(p[0],p[1]);g.stroke();g.globalAlpha=1;
  }
  function e2(pr){return PT.tool==='pen'?0.5+pr:1;}
}

/* ===== Погода: Open-Meteo (бесплатно, без ключа) ===== */
var WT={city:null,data:null};
var WMO={0:['☀️','Ясно'],1:['🌤','Почти ясно'],2:['⛅','Переменная облачность'],3:['☁️','Пасмурно'],45:['🌫','Туман'],48:['🌫','Изморозь'],51:['🌦','Морось'],53:['🌦','Морось'],55:['🌧','Сильная морось'],61:['🌧','Небольшой дождь'],63:['🌧','Дождь'],65:['🌧','Ливень'],66:['🌧','Ледяной дождь'],67:['🌧','Ледяной дождь'],71:['🌨','Небольшой снег'],73:['🌨','Снег'],75:['❄️','Сильный снег'],77:['🌨','Снежная крупа'],80:['🌦','Ливни'],81:['🌧','Ливни'],82:['⛈','Сильные ливни'],85:['🌨','Снегопад'],86:['❄️','Сильный снегопад'],95:['⛈','Гроза'],96:['⛈','Гроза с градом'],99:['⛈','Гроза с градом']};
function wmo(c){return WMO[c]||['🌡','—'];}
function openWeather(){
  showPage('p-weather');
  WT.city=WT.city||ckGet('h_wcity',{name:'Рига',lat:56.9496,lon:24.1052});
  wtLoad();
}
async function wtLoad(){
  var b=$('wtBody');b.textContent='';b.append(el('div','osempty','Загружаю погоду…'));
  try{
    var u='https://api.open-meteo.com/v1/forecast?latitude='+WT.city.lat+'&longitude='+WT.city.lon+'&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=7&wind_speed_unit=ms';
    var r=await fetch(u,{referrerPolicy:'no-referrer'});WT.data=await r.json();
    if(!WT.data.current)throw new Error('нет данных');
  }catch(e){b.textContent='';b.append(el('div','osempty','Нет связи с сервером погоды.'),btn('Повторить','mbtn go',wtLoad));return;}
  wtDraw();
}
function wtDraw(){
  var b=$('wtBody');b.textContent='';var d=WT.data,c=d.current,w=wmo(c.weather_code);
  var sky=el('div','wtsky '+(c.is_day?'day':'night')+(c.weather_code>=51?' rain':c.weather_code>=2?' cloud':''));
  var top=el('div','wttop');
  top.append(btn('📍','mbtn',wtGeo),btn('🔎 Город','mbtn',wtFind));
  sky.append(top,el('h2',null,WT.city.name),el('div','wtt',Math.round(c.temperature_2m)+'°'),el('p',null,w[1]),el('small',null,'Макс. '+Math.round(d.daily.temperature_2m_max[0])+'°, мин. '+Math.round(d.daily.temperature_2m_min[0])+'°'));
  var hr=el('div','wtcard');hr.append(el('small','wtch','ПОЧАСОВОЙ ПРОГНОЗ'));var hs=el('div','wthours');
  var now=new Date(),start=d.hourly.time.findIndex(function(t){return new Date(t)>=new Date(now.getTime()-3600e3);});
  for(var i=Math.max(0,start);i<Math.max(0,start)+24&&i<d.hourly.time.length;i++){var h=el('div','wth');h.append(el('small',null,i===start?'Сейчас':new Date(d.hourly.time[i]).getHours()+':00'),el('i',null,wmo(d.hourly.weather_code[i])[0]),el('b',null,Math.round(d.hourly.temperature_2m[i])+'°'));hs.append(h);}
  hr.append(hs);
  var dy=el('div','wtcard');dy.append(el('small','wtch','НА 7 ДНЕЙ'));
  var mn=Math.min.apply(null,d.daily.temperature_2m_min),mx=Math.max.apply(null,d.daily.temperature_2m_max);
  d.daily.time.forEach(function(t,i){
    var r=el('div','wtd');var nm=i===0?'Сегодня':new Date(t).toLocaleDateString(dloc(),{weekday:'short'});
    var bar=el('div','wtbar');var f=el('i');f.style.left=((d.daily.temperature_2m_min[i]-mn)/(mx-mn||1)*100)+'%';f.style.right=((mx-d.daily.temperature_2m_max[i])/(mx-mn||1)*100)+'%';bar.append(f);
    r.append(el('b',null,nm),el('i',null,wmo(d.daily.weather_code[i])[0]+(d.daily.precipitation_probability_max&&d.daily.precipitation_probability_max[i]>=30?' '+d.daily.precipitation_probability_max[i]+'%':'')),el('span',null,Math.round(d.daily.temperature_2m_min[i])+'°'),bar,el('span',null,Math.round(d.daily.temperature_2m_max[i])+'°'));
    dy.append(r);
  });
  var g=el('div','wtgrid');
  [['ОЩУЩАЕТСЯ',Math.round(c.apparent_temperature)+'°'],['ВЛАЖНОСТЬ',c.relative_humidity_2m+'%'],['ВЕТЕР',Math.round(c.wind_speed_10m)+Lx(' м/с',' m/s')],['ВОСХОД',new Date(d.daily.sunrise[0]).toLocaleTimeString(dloc(),{hour:'2-digit',minute:'2-digit'})],['ЗАКАТ',new Date(d.daily.sunset[0]).toLocaleTimeString(dloc(),{hour:'2-digit',minute:'2-digit'})]].forEach(function(x){var t=el('div','wtcard wtsm');t.append(el('small','wtch',x[0]),el('b',null,x[1]));g.append(t);});
  sky.append(hr,dy,g,el('p','wtsrc','Данные: Open-Meteo.com'));
  b.append(sky);
}
function wtGeo(){
  if(!navigator.geolocation){alert('Браузер не умеет определять место');return;}
  navigator.geolocation.getCurrentPosition(function(p){WT.city={name:'Моё место',lat:+p.coords.latitude.toFixed(3),lon:+p.coords.longitude.toFixed(3)};ckSet('h_wcity',WT.city);wtLoad();},function(){alert('Не получилось узнать место. Выбери город вручную.');});
}
function wtFind(){
  osSheet(function(box,close){
    box.append(el('h2',null,'Город'));var q=inp('search','','Например: Рига');box.append(q);var res=el('div','pfres');box.append(res);var t=0;
    q.addEventListener('input',function(){clearTimeout(t);t=setTimeout(async function(){
      res.textContent='';if(q.value.trim().length<2)return;
      try{var r=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=8&language='+(LANG==='en'?'en':'ru')+'&name='+encodeURIComponent(q.value.trim()));var d=await r.json();
        (d.results||[]).forEach(function(c){var x=el('button','pfu');x.append(el('b',null,c.name),el('small',null,[c.admin1,c.country].filter(Boolean).join(', ')));x.addEventListener('click',function(){WT.city={name:c.name,lat:c.latitude,lon:c.longitude};ckSet('h_wcity',WT.city);close();wtLoad();});res.append(x);});
        if(!res.children.length)res.append(el('p','avhint','Не нашлось'));
      }catch(e){res.append(el('p','bad','Нет связи'));}
    },350);});
    box.append(el('div','mrow'));box.lastChild.append(btn('Закрыть','mbtn',close));setTimeout(function(){q.focus();},50);
  });
}

/* ===== Пианино: WebAudio, клавиатура компьютера, запись мелодии ===== */
var PN={inst:'piano',rec:null,oct:4,keys:{}};
var PN_NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var PN_RU={C:'До',D:'Ре',E:'Ми',F:'Фа',G:'Соль',A:'Ля',B:'Си'};
var PN_KB='awsedftgyhujkolp;';/* как у музыкальных программ: a=до, w=до#, s=ре… */
var PN_SONGS={
  'Ода к радости':'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4. D4- D4_ E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4. C4- C4_',
  'Twinkle Twinkle':'C4 C4 G4 G4 A4 A4 G4_ F4 F4 E4 E4 D4 D4 C4_ G4 G4 F4 F4 E4 E4 D4_ G4 G4 F4 F4 E4 E4 D4_',
  'В лесу родилась ёлочка':'C4 A4 A4 G4 A4 F4 C4 C4 C4 A4 A4 A#4 G4 C5_ C5 D4 D4 A#4 A#4 A4 G4 F4 C4 A4 A4 G4 A4 F4_'
};
function pnFreq(n,o){return 440*Math.pow(2,(PN_NOTES.indexOf(n)+(o-4)*12-9)/12);}
function pnPlay(n,o,dur){
  try{_ac=_ac||new (window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();}catch(e){return;}
  var t=_ac.currentTime,f=pnFreq(n,o),g=_ac.createGain(),out=_ac.createGain();out.gain.value=.22;g.connect(out);out.connect(_ac.destination);
  var parts=PN.inst==='organ'?[[1,'sine',.6],[2,'sine',.3],[4,'sine',.15]]:PN.inst==='synth'?[[1,'sawtooth',.35],[1.005,'square',.15]]:[[1,'triangle',.7],[2,'sine',.2],[3,'sine',.08]];
  parts.forEach(function(p){var o2=_ac.createOscillator(),gg=_ac.createGain();o2.type=p[1];o2.frequency.value=f*p[0];gg.gain.value=p[2];o2.connect(gg);gg.connect(g);o2.start(t);o2.stop(t+(dur||1.6)+.1);});
  var d=dur||(PN.inst==='organ'?0.9:1.6);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+.01);
  if(PN.inst==='organ'){g.gain.setValueAtTime(1,t+d-.05);g.gain.linearRampToValueAtTime(0,t+d);}else g.gain.exponentialRampToValueAtTime(.001,t+d);
  if(PN.rec)PN.rec.push([n+o,performance.now()-PN.recT]);
  var k=document.querySelector('.pnk[data-n="'+n+o+'"]');if(k){k.classList.add('on');setTimeout(function(){k.classList.remove('on');},180);}
}
function openPiano(){showPage('p-piano');pnDraw();}
function pnDraw(){
  var b=$('pnBody');b.textContent='';
  var bar=el('div','pnbar');
  var ins=sel([['piano','🎹 Рояль'],['organ','⛪ Орган'],['synth','🎛 Синтезатор']],PN.inst);ins.addEventListener('change',function(){PN.inst=ins.value;});
  var oc=sel([[3,'Низко'],[4,'Средне'],[5,'Высоко']],PN.oct);oc.addEventListener('change',function(){PN.oct=+oc.value;pnDraw();});
  var rec=btn(PN.rec?'⏹ Стоп':'⏺ Запись','mbtn'+(PN.rec?' go':''),function(){if(PN.rec){ckSet('h_pnrec',PN.rec);PN.rec=null;osToast('Мелодия записана');}else{PN.rec=[];PN.recT=performance.now();}pnDraw();});
  var play=btn('▶︎ Моя мелодия','mbtn',function(){var r=ckGet('h_pnrec',null);if(!r||!r.length){alert('Сначала запиши мелодию');return;}r.forEach(function(x){setTimeout(function(){var m=x[0].match(/^([A-G]#?)(\d)$/);pnPlay(m[1],+m[2]);},x[1]);});});
  var songs=sel([['','🎼 Сыграть песню…']].concat(Object.keys(PN_SONGS).map(function(k){return [k,k];})),'');songs.addEventListener('change',function(){if(songs.value)pnSong(PN_SONGS[songs.value]);songs.value='';});
  bar.append(ins,oc,rec,play,songs);
  var kb=el('div','pnkb');var wi=0;
  for(var o=PN.oct;o<PN.oct+2;o++)PN_NOTES.forEach(function(n,i){
    var black=n.length>1,k=el('button','pnk'+(black?' b':' w'));k.dataset.n=n+o;
    if(!black){k.append(el('span',null,(PN_RU[n]&&LANG!=='en'?PN_RU[n]:n)+(n==='C'?o:'')));wi++;}
    else k.style.left='calc('+(wi*100/14)+'% - '+(100/14/3)+'%)';
    var idx=(o-PN.oct)*12+i;if(idx<PN_KB.length)k.append(el('small',null,PN_KB[idx].toUpperCase()));
    k.addEventListener('pointerdown',function(e){e.preventDefault();pnPlay(n,o);});
    kb.append(k);
  });
  b.append(bar,kb,el('p','avhint','Играй мышкой, пальцами или клавишами A W S E D F T G Y H U J K O L P.'));
}
function pnSong(s){
  var t=0;s.split(' ').forEach(function(x){var m=x.match(/^([A-G]#?)(\d)([._-]?)$/);if(!m)return;var d=m[3]==='_'?700:m[3]==='.'?525:m[3]==='-'?175:350;setTimeout(function(){pnPlay(m[1],+m[2]+(PN.oct-4),d/1000*1.6);},t);t+=d;});
}
document.addEventListener('keydown',function(e){
  if(!pageOn('p-piano')||e.repeat||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  var i=PN_KB.indexOf(e.key.toLowerCase());if(i<0)return;
  pnPlay(PN_NOTES[i%12],PN.oct+Math.floor(i/12));
});
