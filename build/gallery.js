/* ===== Фото: личная медиатека, как «Фото» на iPhone ===== */
var GL={rows:null,tab:'lib',filter:'all',album:null,size:4,sel:null,urls:{},view:-1,list:[]};
var GLB='gallery';
async function glLoad(){
  var r=await SB.from('ht_gallery').select('*').eq('user_id',ME.id).order('taken_at',{ascending:false}).limit(1000);
  if(r.error){GL.err=r.error;GL.rows=[];return;}
  GL.err=null;GL.rows=r.data||[];
  /* «Недавно удалённые» старше 30 дней удаляем насовсем */
  var old=GL.rows.filter(function(x){return x.deleted_at&&Date.now()-new Date(x.deleted_at)>30*864e5;});
  if(old.length)glPurge(old);
}
/* временные ссылки на файлы (хранилище закрытое), по 100 за раз, на час */
async function glUrls(rows){
  var need=rows.filter(function(x){var u=GL.urls[x.path];return !u||u.exp<Date.now()+60000;}).map(function(x){return x.path;});
  for(var i=0;i<need.length;i+=100){
    var r=await SB.storage.from(GLB).createSignedUrls(need.slice(i,i+100),3600);
    if(!r.error&&r.data)r.data.forEach(function(d){if(d.signedUrl)GL.urls[d.path]={u:d.signedUrl,exp:Date.now()+3600e3};});
  }
}
function glUrl(x){return GL.urls[x.path]?GL.urls[x.path].u:'';}
async function openGallery(){
  showPage('p-gallery');
  var b=$('glBody');b.textContent='';
  if(!needSB(b,'Войди в аккаунт, чтобы хранить фото и видео.'))return;
  if(!GL.rows){b.append(el('div','osempty','Загрузка…'));await glLoad();}
  glDraw();
}
function glVisible(){
  var l=GL.rows.filter(function(x){return GL.album==='trash'?!!x.deleted_at:!x.deleted_at;});
  if(GL.album==='fav')l=l.filter(function(x){return x.favorite;});
  else if(GL.album==='video')l=l.filter(function(x){return x.kind==='video';});
  else if(GL.album==='photo')l=l.filter(function(x){return x.kind==='photo';});
  else if(GL.album&&GL.album!=='trash')l=l.filter(function(x){return x.album===GL.album;});
  if(GL.tab==='lib'&&!GL.album){if(GL.filter==='photo')l=l.filter(function(x){return x.kind==='photo';});if(GL.filter==='video')l=l.filter(function(x){return x.kind==='video';});}
  return l;
}
function glDraw(){
  var b=$('glBody');b.textContent='';
  if(GL.err){dbErr(b,GL.err);return;}
  var top=el('div','gltop');
  var title=GL.album?glAlbumName(GL.album):GL.tab==='lib'?'Медиатека':'Альбомы';
  if(GL.album)top.append(btn('‹ Альбомы','ipback',function(){GL.album=null;GL.sel=null;glDraw();}));
  top.append(el('h2','iptitle',title));
  var acts=el('div','glacts');
  if(GL.tab==='lib'||GL.album){
    if(GL.sel){acts.append(btn('Отменить','mbtn',function(){GL.sel=null;glDraw();}));}
    else acts.append(btn('Выбрать','mbtn',function(){GL.sel={};glDraw();}));
  }
  var add=btn('＋','mbtn go glplus');add.title='Добавить фото или видео';
  var fi=el('input');fi.type='file';fi.multiple=true;fi.accept='image/jpeg,image/png,image/webp,image/heic,video/mp4,video/webm,video/quicktime';fi.style.display='none';
  fi.addEventListener('change',function(){glUpload([].slice.call(fi.files));fi.value='';});
  add.addEventListener('click',function(){fi.click();});
  acts.append(add,fi);
  top.append(acts);b.append(top);
  if(GL.tab==='lib'&&!GL.album){
    var seg=el('div','glseg');
    [['all',Lx('Все','All')],['photo','Фото'],['video','Видео']].forEach(function(x){var t=el('button','glsg'+(GL.filter===x[0]?' on':''),x[1]);t.addEventListener('click',function(){GL.filter=x[0];glDraw();});seg.append(t);});
    var zm=el('div','glzoom');[['−',1],['+',-1]].forEach(function(z){zm.append(btn(z[0],'glzb',function(){GL.size=Math.min(8,Math.max(2,GL.size+z[1]));glDraw();}));});
    var bar=el('div','glbar');bar.append(seg,zm);b.append(bar);
  }
  var box=el('div','glbox');b.append(box);
  if(GL.tab==='albums'&&!GL.album)glAlbums(box);
  else glGrid(box);
  /* нижние вкладки, как в «Фото» */
  var tabs=el('div','gltabs');
  [['lib','🖼','Медиатека'],['albums','📚','Альбомы']].forEach(function(t){var x=el('button','gltab'+(GL.tab===t[0]?' on':''));x.append(el('i',null,t[1]),el('span',null,t[2]));x.addEventListener('click',function(){GL.tab=t[0];GL.album=null;GL.sel=null;glDraw();});tabs.append(x);});
  b.append(tabs);
  if(GL.sel)glSelBar(b);
}
function glAlbumName(a){return {fav:'Избранное',video:'Видео',photo:'Фото',trash:'Недавно удалённые'}[a]||a;}
async function glGrid(box){
  var l=glVisible();GL.list=l;
  if(!l.length){box.append(el('div','osempty',GL.album==='trash'?'Здесь пусто. Удалённое хранится 30 дней.':'Здесь пока пусто. Нажми ＋, чтобы добавить фото и видео.'));return;}
  if(GL.album==='trash')box.append(el('p','avhint','Файлы удалятся насовсем через 30 дней после удаления.'));
  await glUrls(l);
  var month='',grid=null;
  l.forEach(function(x,i){
    var m=new Date(x.taken_at).toLocaleDateString(dloc(),{month:'long',year:'numeric'});
    if(m!==month||!grid){month=m;box.append(el('h3','glmon',m.charAt(0).toUpperCase()+m.slice(1)));grid=el('div','glgrid');grid.style.setProperty('--n',GL.size);box.append(grid);}
    var c=el('button','glc'+(GL.sel&&GL.sel[x.id]?' sel':''));
    var u=glUrl(x);
    if(x.kind==='video'){var v=el('video');v.muted=true;v.preload='metadata';v.playsInline=true;if(u)v.src=u+'#t=0.1';c.append(v,el('span','gldur',glDur(x.duration)));}
    else{var im=new Image();im.loading='lazy';im.alt='';if(u)im.src=u;c.append(im);}
    if(x.favorite)c.append(el('span','glfav','♥'));
    if(GL.sel)c.append(el('span','glchk',GL.sel[x.id]?'✓':''));
    c.addEventListener('click',function(){if(GL.sel){if(GL.sel[x.id])delete GL.sel[x.id];else GL.sel[x.id]=1;glDraw();return;}glOpen(i);});
    grid.append(c);
  });
}
function glDur(s){s=Math.round(s||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function glAlbums(box){
  var live=GL.rows.filter(function(x){return !x.deleted_at;});
  var my={};live.forEach(function(x){if(x.album)my[x.album]=(my[x.album]||[]).concat(x);});
  var g=el('div','glalbs');
  function card(key,name,list,icon){
    var c=el('button','glalb');var th=el('div','glath');
    if(list[0]&&list[0].kind==='photo'&&glUrl(list[0])){var im=new Image();im.src=glUrl(list[0]);im.alt='';th.append(im);}else th.append(el('span',null,icon||'🖼'));
    c.append(th,el('b',null,name),el('small',null,String(list.length)));
    c.addEventListener('click',function(){GL.album=key;glDraw();});g.append(c);
  }
  glUrls(live.slice(0,40)).then(function(){
    g.textContent='';
    card('fav','Избранное',live.filter(function(x){return x.favorite;}),'♥');
    Object.keys(my).sort().forEach(function(k){card(k,k,my[k]);});
    box.append(el('h3','glmon','Типы медиафайлов'));
    var t=el('div','glalbs');
    [['video','Видео','🎬'],['photo','Фото','📷']].forEach(function(x){var c=el('button','glrow');c.append(el('i',null,x[2]),el('span',null,x[1]),el('em',null,String(live.filter(function(r){return r.kind===x[0];}).length)));c.addEventListener('click',function(){GL.album=x[0];glDraw();});t.append(c);});
    var tr=el('button','glrow');tr.append(el('i',null,'🗑'),el('span',null,'Недавно удалённые'),el('em',null,String(GL.rows.filter(function(r){return r.deleted_at;}).length)));tr.addEventListener('click',function(){GL.album='trash';glDraw();});t.append(tr);
    box.append(t);
  });
  box.append(el('h3','glmon','Мои альбомы'),g);
}
function glSelBar(b){
  var ids=Object.keys(GL.sel).map(Number),bar=el('div','glselbar');
  bar.append(el('b',null,'Выбрано: '+ids.length));
  if(GL.album==='trash'){
    bar.append(btn('Восстановить','mbtn',function(){glPatch(ids,{deleted_at:null});}),btn('Удалить насовсем','mbtn',function(){if(confirm('Удалить насовсем? Вернуть будет нельзя.'))glPurge(GL.rows.filter(function(x){return ids.indexOf(x.id)>=0;})).then(function(){GL.sel=null;glDraw();});}));
  }else{
    bar.append(btn('♥','mbtn',function(){glPatch(ids,{favorite:true});}),btn('В альбом','mbtn',function(){var a=glAskAlbum();if(a!==null)glPatch(ids,{album:a||null});}),btn('🗑','mbtn',function(){if(confirm('Удалить выбранное? Оно будет 30 дней в «Недавно удалённых».'))glPatch(ids,{deleted_at:new Date().toISOString()});}));
  }
  b.append(bar);
}
function glAskAlbum(){
  var names={};GL.rows.forEach(function(x){if(x.album)names[x.album]=1;});
  var a=prompt('Название альбома'+(Object.keys(names).length?' (есть: '+Object.keys(names).join(', ')+')':'')+'. Пусто — убрать из альбома.','');
  if(a===null)return null;a=a.trim().slice(0,40);
  if(a&&isBad(a)){alert('В названии есть недопустимые слова');return null;}
  return a;
}
async function glPatch(ids,patch){
  if(!ids.length)return;
  var r=await SB.from('ht_gallery').update(patch).in('id',ids).select('id');
  if(r.error){alert(r.error.message);return;}
  GL.rows.forEach(function(x){if(ids.indexOf(x.id)>=0)Object.assign(x,patch);});
  GL.sel=null;glDraw();
}
async function glPurge(rows){
  if(!rows.length)return;
  await SB.storage.from(GLB).remove(rows.map(function(x){return x.path;}));
  var ids=rows.map(function(x){return x.id;});
  await SB.from('ht_gallery').delete().in('id',ids);
  GL.rows=GL.rows.filter(function(x){return ids.indexOf(x.id)<0;});
}
/* ---------- загрузка: фото уменьшаем до 2560 px, видео — как есть, до 50 МБ ---------- */
function glCompress(file){
  return new Promise(function(res){
    var u=URL.createObjectURL(file),im=new Image();
    im.onload=function(){
      var sc=Math.min(1,2560/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');
      c.width=Math.round(im.naturalWidth*sc);c.height=Math.round(im.naturalHeight*sc);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);
      c.toBlob(function(b){res({blob:b,w:c.width,h:c.height});},'image/jpeg',.88);
    };
    im.onerror=function(){URL.revokeObjectURL(u);res(null);};
    im.src=u;
  });
}
function glVidMeta(file){
  return new Promise(function(res){var v=document.createElement('video'),u=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=function(){res({w:v.videoWidth,h:v.videoHeight,d:v.duration});URL.revokeObjectURL(u);};v.onerror=function(){res({});URL.revokeObjectURL(u);};v.src=u;});
}
/* сохранить готовый файл (из Скетча, Видеостудии, редактора) */
async function gallerySaveBlob(blob,kind,meta){
  if(!SB||!ME){alert('Войди в аккаунт, чтобы сохранять в Фото');return null;}
  meta=meta||{};
  var ext=kind==='video'?(/mp4/.test(blob.type)?'mp4':'webm'):'jpg';
  var path=ME.id+'/'+Date.now()+'-'+Math.floor(Math.random()*1e6)+'.'+ext;
  var up=await SB.storage.from(GLB).upload(path,blob,{contentType:blob.type||(kind==='video'?'video/webm':'image/jpeg'),upsert:false});
  if(up.error){alert('Не загрузилось: '+up.error.message);return null;}
  var row={path:path,kind:kind,width:meta.w||null,height:meta.h||null,duration:meta.d||null,size_bytes:blob.size,taken_at:meta.taken||new Date().toISOString(),album:meta.album||null};
  var r=await SB.from('ht_gallery').insert(row).select('*').single();
  if(r.error||!r.data){SB.storage.from(GLB).remove([path]);alert(r.error?r.error.message:'Файл не сохранился');return null;}
  if(GL.rows)GL.rows.unshift(r.data);
  return r.data;
}
async function glUpload(files){
  if(!files.length)return;
  var bar=el('div','glprog');var t=el('span');var p=el('i');bar.append(t,p);$('glBody').append(bar);
  var ok=0;
  for(var i=0;i<files.length;i++){
    var f=files[i];t.textContent='Загружаю '+(i+1)+' из '+files.length+'…';p.style.width=(i/files.length*100)+'%';
    if(/^video\//.test(f.type)){
      if(f.size>50*1048576){alert('«'+f.name+'» больше 50 МБ — такое видео не поместится');continue;}
      var m=await glVidMeta(f);
      if(await gallerySaveBlob(f,'video',{w:m.w,h:m.h,d:m.d,taken:new Date(f.lastModified||Date.now()).toISOString()}))ok++;
    }else{
      var c=await glCompress(f);
      if(!c){alert('«'+f.name+'» не получилось открыть. Попробуй JPG или PNG.');continue;}
      if(await gallerySaveBlob(c.blob,'photo',{w:c.w,h:c.h,taken:new Date(f.lastModified||Date.now()).toISOString()}))ok++;
    }
  }
  GL.rows.sort(function(a,b){return new Date(b.taken_at)-new Date(a.taken_at);});
  osToast('Добавлено: '+ok);glDraw();
}
/* ---------- просмотр на весь экран ---------- */
function glOpen(i){GL.view=i;glShow();document.documentElement.classList.add('glon');}
function glClose(){var v=$('glView');v.classList.remove('show');v.textContent='';document.documentElement.classList.remove('glon');}
function glShow(){
  var x=GL.list[GL.view];if(!x){glClose();return;}
  var v=$('glView');v.textContent='';v.classList.add('show');
  var top=el('div','glvtop');top.append(btn('‹','glvx',glClose));
  var d=new Date(x.taken_at);var tt=el('div','glvt');tt.append(el('b',null,d.toLocaleDateString(dloc(),{day:'numeric',month:'long',year:'numeric'})),el('small',null,d.toLocaleTimeString(dloc(),{hour:'2-digit',minute:'2-digit'})));
  top.append(tt);
  if(x.kind==='photo'&&!x.deleted_at)top.append(btn('Изменить','glvedit',function(){glEdit(x);}));
  var st=el('div','glvst'),u=glUrl(x),media;
  if(x.kind==='video'){media=el('video');media.controls=true;media.playsInline=true;media.autoplay=true;media.src=u;}
  else{media=new Image();media.src=u;media.alt=x.caption||'';}
  st.append(media);
  if(x.caption)st.append(el('p','glcap',x.caption));
  var bot=el('div','glvbot');
  if(x.deleted_at){
    bot.append(btn('Восстановить','mbtn',function(){glPatch([x.id],{deleted_at:null}).then(glClose);}),btn('Удалить насовсем','mbtn',function(){if(confirm('Удалить насовсем?'))glPurge([x]).then(function(){glClose();glDraw();});}));
  }else{
    bot.append(
      btn('⤓','glvb',function(){glDownload(x);}),
      btn(x.favorite?'♥':'♡','glvb'+(x.favorite?' on':''),async function(){await glPatch([x.id],{favorite:!x.favorite});glShow();}),
      btn('ⓘ','glvb',function(){glInfo(x);}),
      btn('🗑','glvb',async function(){await glPatch([x.id],{deleted_at:new Date().toISOString()});GL.list=glVisible();if(GL.view>=GL.list.length)GL.view--;if(GL.view<0)glClose();else glShow();})
    );
  }
  var pr=btn('‹','glnav l',function(){if(GL.view>0){GL.view--;glShow();}}),nx=btn('›','glnav r',function(){if(GL.view<GL.list.length-1){GL.view++;glShow();}});
  v.append(top,st,pr,nx,bot);
  /* свайп влево/вправо — соседнее фото, вниз — закрыть */
  var sx=0,sy=0;
  st.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  st.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))(dx<0?nx:pr).click();else if(dy>110)glClose();});
}
document.addEventListener('keydown',function(e){
  if(!$('glView').classList.contains('show'))return;
  if(e.key==='Escape')glClose();
  if(e.key==='ArrowLeft'&&GL.view>0){GL.view--;glShow();}
  if(e.key==='ArrowRight'&&GL.view<GL.list.length-1){GL.view++;glShow();}
});
async function glDownload(x){
  try{var r=await fetch(glUrl(x));var b=await r.blob();var a=el('a');a.href=URL.createObjectURL(b);a.download='HoroTube-'+x.id+'.'+x.path.split('.').pop();document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},5000);}
  catch(e){alert('Не получилось скачать');}
}
function glInfo(x){
  osSheet(function(box,close){
    box.append(el('h2',null,'Информация'));
    var cap=inp('text',x.caption||'','Добавить подпись',200);
    var alb=inp('text',x.album||'','Без альбома',40);
    box.append(field('Подпись',cap),field('Альбом',alb));
    var g=el('div','setgrp');
    [['Дата',new Date(x.taken_at).toLocaleString(dloc())],[Lx('Тип','Type'),x.kind==='video'?'Видео':'Фото'],['Размер',(x.width?x.width+'×'+x.height+' · ':'')+fmtSize(x.size_bytes)]].concat(x.duration?[['Длина',glDur(x.duration)]]:[]).forEach(function(r){g.append(setLine(r[0],r[1]));});
    box.append(g);
    var row=el('div','mrow');row.append(btn('Отмена','mbtn',close),btn('Сохранить','mbtn go',async function(){
      var c=cap.value.trim(),a=alb.value.trim();if(isBad(c+' '+a)){alert('Есть недопустимые слова');return;}
      await glPatch([x.id],{caption:c||null,album:a||null});close();glShow();
    }));box.append(row);
  });
}
/* ---------- редактор фото: фильтры, поворот, кадрирование ---------- */
var GL_FX={orig:['Оригинал',''],vivid:['Яркий','saturate(1.5) contrast(1.08)'],warm:['Тёплый','sepia(.25) saturate(1.3) hue-rotate(-8deg)'],cool:['Холодный','saturate(1.1) hue-rotate(12deg) brightness(1.03)'],mono:['Ч/Б','grayscale(1) contrast(1.1)','Mono'],noir:['Нуар','grayscale(1) contrast(1.5) brightness(.9)'],sepia:['Сепия','sepia(.8)'],fade:['Винтаж','sepia(.35) contrast(.85) brightness(1.08) saturate(.8)'],drama:['Драма','contrast(1.35) saturate(1.2) brightness(.95)']};
function glEdit(x){
  var st={fx:'orig',rot:0,crop:'free',light:0},im=new Image();
  im.crossOrigin='anonymous';
  var v=$('glView');v.textContent='';
  var top=el('div','glvtop');var c=document.createElement('canvas');c.className='gledc';
  top.append(btn('Отмена','glvx',glShow),el('b','glvt','Изменить'),btn('Готово','glvedit',async function(){
    var out=render(2560);out.toBlob(async function(b){var r=await gallerySaveBlob(b,'photo',{w:out.width,h:out.height});if(r){osToast('Сохранено как новое фото');glClose();glDraw();}},'image/jpeg',.9);
  }));
  var tools=el('div','gledt');
  var fxs=el('div','glfx');
  Object.keys(GL_FX).forEach(function(k){var b=btn(Lx(GL_FX[k][0],GL_FX[k][2]||GL_FX[k][0]),'glfxb'+(st.fx===k?' on':''),function(){st.fx=k;fxs.querySelectorAll('.glfxb').forEach(function(z){z.classList.toggle('on',z===b);});draw();});fxs.append(b);});
  var lr=el('input');lr.type='range';lr.min=-50;lr.max=50;lr.value=0;lr.addEventListener('input',function(){st.light=+lr.value;draw();});
  var row=el('div','gledr');
  row.append(btn('⟲ Повернуть','mbtn',function(){st.rot=(st.rot+270)%360;draw();}));
  [['free','Как есть'],['1','1:1'],['4:3','4:3'],['16:9','16:9'],['9:16','9:16']].forEach(function(o){row.append(btn(o[1],'mbtn glcrop'+(st.crop===o[0]?' on':''),function(e){st.crop=o[0];row.querySelectorAll('.glcrop').forEach(function(z){z.classList.toggle('on',z===e.target);});draw();}));});
  tools.append(fxs,field('☀️ Свет',lr),row);
  v.append(top,c,tools);
  function render(max){
    var w=im.naturalWidth,h=im.naturalHeight,cw=w,ch=h;
    if(st.crop!=='free'){var p=st.crop==='1'?[1,1]:st.crop.split(':').map(Number),r=p[0]/p[1];if(st.rot%180)r=1/r;if(w/h>r){cw=h*r;}else{ch=w/r;}}
    var sc=Math.min(1,max/Math.max(cw,ch)),o=document.createElement('canvas'),rw=Math.round(cw*sc),rh=Math.round(ch*sc);
    if(st.rot%180){o.width=rh;o.height=rw;}else{o.width=rw;o.height=rh;}
    var g=o.getContext('2d');g.filter=(GL_FX[st.fx][1]+' brightness('+(1+st.light/100)+')').trim();
    g.translate(o.width/2,o.height/2);g.rotate(st.rot*Math.PI/180);
    g.drawImage(im,(w-cw)/2,(h-ch)/2,cw,ch,-rw/2,-rh/2,rw,rh);
    return o;
  }
  function draw(){var o=render(1200);c.width=o.width;c.height=o.height;c.getContext('2d').drawImage(o,0,0);}
  im.onload=draw;im.onerror=function(){alert('Фото не открылось для редактирования');glShow();};
  im.src=glUrl(x);
}
/* выбрать файлы из Фото (для Видеостудии): resolve([{row,url}]) */
function galleryPick(kind){
  return new Promise(async function(res){
    if(!SB||!ME){alert('Войди в аккаунт');res([]);return;}
    if(!GL.rows)await glLoad();
    var l=GL.rows.filter(function(x){return !x.deleted_at&&(!kind||x.kind===kind||kind==='any');});
    await glUrls(l.slice(0,120));
    var pick={};
    osSheet(function(box,close){
      box.classList.add('wide');
      box.append(el('h2',null,'Выбери из Фото'));
      var g=el('div','glgrid glpick');g.style.setProperty('--n',5);
      if(!l.length)box.append(el('p','osempty','В Фото пока пусто'));
      l.slice(0,120).forEach(function(x){
        var c=el('button','glc');
        if(x.kind==='video'){var v=el('video');v.muted=true;v.preload='metadata';v.src=glUrl(x)+'#t=0.1';c.append(v,el('span','gldur',glDur(x.duration)));}else{var im=new Image();im.src=glUrl(x);c.append(im);}
        var ck=el('span','glchk','');c.append(ck);
        c.addEventListener('click',function(){if(pick[x.id]){delete pick[x.id];c.classList.remove('sel');ck.textContent='';}else{pick[x.id]=1;c.classList.add('sel');ck.textContent='✓';}});
        g.append(c);
      });
      box.append(g);
      var row=el('div','mrow');row.append(btn('Отмена','mbtn',function(){close();res([]);}),btn('Добавить','mbtn go',function(){close();res(l.filter(function(x){return pick[x.id];}).map(function(x){return {row:x,url:glUrl(x)};}));}));box.append(row);
    });
  });
}
