/* ===== Портфолио: всё обо мне. Видят: я, учителя и админ всегда; ученики — как я выберу ===== */
var PF={uid:null,data:null,edit:false};
var PF_COL={blue:['#64D2FF','#0A84FF'],purple:['#BF5AF2','#5E5CE6'],pink:['#FF9AD5','#FF2D78'],green:['#5BF675','#0A8F3C'],orange:['#FFB347','#FF6A00'],dark:['#4B4B55','#16161C']};
var PF_VIS={all:'Все ученики',friends:'Только друзья',me:'Только я (и учителя)'};
async function openPortfolio(uid){
  showPage('p-portfolio');
  var b=$('pfBody');b.textContent='';
  if(!needSB(b,'Войди в аккаунт, чтобы вести портфолио.'))return;
  PF.uid=uid||ME.id;PF.edit=false;
  b.append(el('div','osempty','Загрузка…'));
  var q=await Promise.all([
    SB.from('ht_portfolio').select('*').eq('user_id',PF.uid).maybeSingle(),
    SB.rpc('ht_portfolio_stats',{owner:PF.uid}),
    loadPub([PF.uid])
  ]);
  if(PF.uid!==(uid||ME.id))return;/* пока грузили, открыли другое портфолио */
  if(q[0].error){b.textContent='';dbErr(b,q[0].error);return;}
  PF.data=q[0].data;PF.stats=(q[1].data||[])[0]||null;
  pfDraw();
}
function pfDraw(){
  var b=$('pfBody');b.textContent='';
  var mine=PF.uid===ME.id,p=PUB[PF.uid]||{},d=PF.data;
  if(mine)p={name:ME.name,nick:ME.nick,role:ME.role,class:ME.class};
  var top=el('div','pftop');
  top.append(btn('🔎 Найти портфолио','mbtn',pfFind));
  if(!mine)top.append(btn('Моё портфолио','mbtn',function(){openPortfolio(ME.id);}));
  if(mine&&!PF.edit)top.append(btn('✏️ Изменить','mbtn go',function(){PF.edit=true;pfDraw();}));
  b.append(top);
  if(PF.edit){pfForm(b);return;}
  if(!d&&!mine){b.append(el('div','osempty',PF.stats?'Этот ученик ещё не заполнил портфолио или скрыл его.':'Портфолио не найдено.'));return;}
  var col=PF_COL[(d&&d.color)||'blue'];
  var hero=el('div','pfhero');hero.style.background='linear-gradient(135deg,'+col[0]+','+col[1]+')';
  hero.append(avatarEl(PF.uid,p.name||p.nick,104));
  var ht=el('div','pfht');ht.append(el('h1',null,p.name||p.nick||'Ученик'),el('small',null,'@'+(p.nick||'')+' · '+(ROLES[p.role]||'Ученик')+(p.class?' · '+p.class+' класс':'')));
  if(d&&d.dream)ht.append(el('p','pfdream','🌟 Мечта: '+d.dream));
  hero.append(ht);b.append(hero);
  if(PF.stats){
    var s=PF.stats,st=el('div','pfstats');
    [[s.videos,Lx('видео','videos')],[s.likes,Lx('лайков','likes')],[s.views,Lx('просмотров','views')],[s.friends,Lx('друзей','friends')]].forEach(function(x){var c=el('div');c.append(el('b',null,String(x[0]||0)),el('small',null,x[1]));st.append(c);});
    if(s.since){var c=el('div');c.append(el('b',null,new Date(s.since).toLocaleDateString(dloc(),{month:'short',year:'numeric'})),el('small',null,'на HoroTube с'));st.append(c);}
    b.append(st);
  }
  if(!d){b.append(el('div','osempty','Расскажи о себе: увлечения, навыки, достижения. Нажми «Изменить».'));return;}
  var g=el('div','pfgrid');
  if(d.about){var a=el('div','pfcard pfwide');a.append(el('h3',null,'Обо мне'),el('p',null,d.about));g.append(a);}
  if(d.hobbies.length){var h=el('div','pfcard');h.append(el('h3',null,'Увлечения'));var w=el('div','pfchips');d.hobbies.forEach(function(x){w.append(el('span','pfchip',x));});h.append(w);g.append(h);}
  if(d.skills.length){var k=el('div','pfcard');k.append(el('h3',null,'Навыки'));var w2=el('div','pfchips');d.skills.forEach(function(x){w2.append(el('span','pfchip sk',x));});k.append(w2);g.append(k);}
  if(d.achievements.length){
    var ac=el('div','pfcard pfwide');ac.append(el('h3',null,'Достижения'));
    var tl=el('div','pftl');
    d.achievements.slice().sort(function(a,b){return String(b.y||'').localeCompare(String(a.y||''));}).forEach(function(x){var r=el('div','pfach');r.append(el('i',null,x.e||'🏆'),el('b',null,x.t||''),el('small',null,x.y||''));tl.append(r);});
    ac.append(tl);g.append(ac);
  }
  b.append(g);
  if(mine)b.append(el('p','avhint','Кто видит: '+PF_VIS[d.visibility]+'. Учителя и администрация видят портфолио всегда.'));
  if(!mine&&isStaff(ME.role))b.append(el('p','avhint','Вы видите это портфолио как '+(ME.role==='admin'?Lx('администратор','an administrator'):Lx('учитель','a teacher'))+'.'));
}
function pfList(arr){return (arr||[]).join(', ');}
function pfParse(s){return s.split(',').map(function(x){return x.trim();}).filter(Boolean).slice(0,20).map(function(x){return x.slice(0,40);});}
function pfForm(b){
  var d=PF.data||{about:'',dream:'',hobbies:[],skills:[],achievements:[],color:'blue',visibility:'all'};
  var f=el('div','pfform');
  var about=inp('textarea',d.about,'Расскажи о себе: чем занимаешься, что любишь',1000);
  var dream=inp('text',d.dream,'Кем хочешь стать или о чём мечтаешь',200);
  var hob=inp('text',pfList(d.hobbies),'Через запятую: футбол, рисование, шахматы');
  var sk=inp('text',pfList(d.skills),'Через запятую: монтаж видео, английский, Python');
  var col=sel(Object.keys(PF_COL).map(function(k){return [k,{blue:'Голубой',purple:'Фиолетовый',pink:'Розовый',green:'Зелёный',orange:'Оранжевый',dark:'Тёмный'}[k]];}),d.color);
  var vis=sel(Object.keys(PF_VIS).map(function(k){return [k,PF_VIS[k]];}),d.visibility);
  f.append(field('Обо мне',about),field('Мечта',dream),field('Увлечения',hob),field('Навыки',sk),field('Цвет',col),field('Кто видит',vis));
  f.append(el('h3',null,'Достижения'));
  var list=el('div','pfachs');
  var achs=(d.achievements||[]).slice();
  function drawA(){
    list.textContent='';
    achs.forEach(function(a,i){
      var r=el('div','pfar');var e=inp('text',a.e||'🏆','🏆',4);e.className='pfae';var t=inp('text',a.t||'','Что получилось',80);var y=inp('text',a.y||'',Lx('Год','Year'),4);y.className='pfay';
      e.addEventListener('input',function(){a.e=e.value;});t.addEventListener('input',function(){a.t=t.value;});y.addEventListener('input',function(){a.y=y.value;});
      r.append(e,t,y,btn('✕','mbtn',function(){achs.splice(i,1);drawA();}));list.append(r);
    });
  }
  drawA();
  f.append(list,btn('＋ Достижение','mbtn',function(){if(achs.length<30){achs.push({e:'🏆',t:'',y:String(new Date().getFullYear())});drawA();}}));
  var msg=el('p','bad');f.append(msg);
  var row=el('div','mrow');
  row.append(btn('Отмена','mbtn',function(){PF.edit=false;pfDraw();}),btn('Сохранить','mbtn go',async function(){
    var rec={user_id:ME.id,about:about.value.trim(),dream:dream.value.trim(),hobbies:pfParse(hob.value),skills:pfParse(sk.value),
      achievements:achs.filter(function(a){return (a.t||'').trim();}).map(function(a){return {e:(a.e||'🏆').slice(0,4),t:a.t.trim().slice(0,80),y:String(a.y||'').slice(0,4)};}),
      color:col.value,visibility:vis.value};
    var all=[rec.about,rec.dream,rec.hobbies.join(' '),rec.skills.join(' '),rec.achievements.map(function(a){return a.t;}).join(' ')].join(' ');
    if(isBad(all)){msg.textContent='Есть недопустимые слова';return;}
    if(hasContact(all)){msg.textContent='В портфолио нельзя писать телефоны, ссылки и ники в мессенджерах';return;}
    var r=await SB.from('ht_portfolio').upsert(rec).select('*').single();
    if(r.error){msg.textContent=r.error.message;return;}
    PF.data=r.data;PF.edit=false;pfDraw();osToast('Портфолио сохранено');
  }));
  f.append(row);b.append(f);
}
function pfFind(){
  osSheet(function(box,close){
    box.append(el('h2',null,'Найти портфолио'));
    var q=inp('search','','Ник или имя');box.append(q);
    var res=el('div','pfres');box.append(res);
    var t=0;
    q.addEventListener('input',function(){clearTimeout(t);t=setTimeout(async function(){
      var v=q.value.trim();res.textContent='';if(v.length<2)return;
      var r=await SB.rpc('ht_find_users',{q:v});
      if(r.error){res.append(el('p','bad',r.error.message));return;}
      (r.data||[]).forEach(function(u){var x=el('button','pfu');x.append(avatarEl(u.id,u.name||u.nick,36),el('b',null,u.name||u.nick),el('small',null,'@'+u.nick+' · '+(ROLES[u.role]||'')));x.addEventListener('click',function(){close();openPortfolio(u.id);});res.append(x);});
      if(!res.children.length)res.append(el('p','avhint','Никого не нашлось'));
    },300);});
    box.append(el('div','mrow'));box.lastChild.append(btn('Закрыть','mbtn',close));
    setTimeout(function(){q.focus();},50);
  });
}
