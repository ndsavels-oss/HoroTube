/* ===== Видеостудия: монтаж прямо в браузере =====
   Ролики и фото склеиваются по порядку, у каждого можно обрезать начало и конец.
   Сверху — текст, на всё — фильтр. Экспорт записывает холст (canvas) в реальном времени. */
var ED={clips:[],cur:0,fmt:'16:9',fx:'orig',text:'',tpos:'bottom',tcol:'#ffffff',mute:false,playing:false,rec:null};
function openEditor(){showPage('p-edit');edDraw();}
function edSize(){return ED.fmt==='9:16'?[720,1280]:ED.fmt==='1:1'?[1080,1080]:[1280,720];}
function edLen(c){return Math.max(0.2,c.out-c.in);}
function edTotal(){return ED.clips.reduce(function(s,c){return s+edLen(c);},0);}
function edDraw(){
  var b=$('edBody');b.textContent='';
  var wrap=el('div','edwrap');
  var top=el('div','edtop');
  top.append(el('h2','iptitle','Видеостудия'));
  var fmt=sel([['16:9','16:9 — для HoroTube'],['9:16','9:16 — для Клипов'],['1:1','1:1 — квадрат']],ED.fmt);fmt.addEventListener('change',function(){ED.fmt=fmt.value;edDraw();});
  top.append(fmt);
  var ex=btn('Экспорт','mbtn go',edExport);ex.disabled=!ED.clips.length;top.append(ex);
  wrap.append(top);
  var stage=el('div','edstage');
  var cv=document.createElement('canvas');cv.id='edCv';var sz=edSize();cv.width=sz[0];cv.height=sz[1];stage.append(cv);
  if(!ED.clips.length){var e=el('div','edempty');e.append(el('b',null,'🎬'),el('p',null,'Добавь ролики и фото — они склеятся по порядку.'));stage.append(e);}
  wrap.append(stage);
  var ctl=el('div','edctl');
  var play=btn(ED.playing?'⏸':'▶︎','edplay',function(){ED.playing?edStop():edPlay(cv,false);});
  var tm=el('span','edtime',glDur(0)+' / '+glDur(edTotal()));tm.id='edTime';
  ctl.append(play,tm);wrap.append(ctl);
  /* дорожка с клипами */
  var tl=el('div','edtl');
  ED.clips.forEach(function(c,i){
    var t=el('button','edclip'+(ED.cur===i?' on':''));t.style.flexGrow=String(edLen(c));
    if(c.thumb)t.style.backgroundImage='url("'+c.thumb+'")';
    t.append(el('span',null,(c.kind==='photo'?'📷 ':'🎞 ')+edLen(c).toFixed(1)+Lx(' с',' s')));
    t.addEventListener('click',function(){ED.cur=i;edDraw();});
    tl.append(t);
  });
  var add=el('div','edadd');
  add.append(btn('＋ Из Фото','mbtn',async function(){var l=await galleryPick('any');for(var i=0;i<l.length;i++)await edAdd(l[i].url,l[i].row.kind,l[i].row.duration);edDraw();}));
  var fi=el('input');fi.type='file';fi.multiple=true;fi.accept='video/*,image/*';fi.style.display='none';
  fi.addEventListener('change',async function(){var fs=[].slice.call(fi.files);for(var i=0;i<fs.length;i++)await edAdd(URL.createObjectURL(fs[i]),/^video/.test(fs[i].type)?'video':'photo');fi.value='';edDraw();});
  add.append(btn('＋ С устройства','mbtn',function(){fi.click();}),fi);
  wrap.append(tl,add);
  /* настройки выбранного клипа */
  var c=ED.clips[ED.cur];
  if(c){
    var p=el('div','edpanel');
    p.append(el('h3',null,'Клип '+(ED.cur+1)+' из '+ED.clips.length));
    if(c.kind==='video'){
      var a=el('input'),z=el('input');a.type=z.type='range';a.min=z.min=0;a.max=z.max=c.dur;a.step=z.step=0.1;a.value=c.in;z.value=c.out;
      var lab=el('span','edtrim');function lt(){lab.textContent=Lx('С ','From ')+(+c.in).toFixed(1)+Lx(' до ',' to ')+(+c.out).toFixed(1)+Lx(' с',' s');}lt();
      a.addEventListener('input',function(){c.in=Math.min(+a.value,c.out-0.2);a.value=c.in;lt();edPreviewAt(cv,c,c.in);});
      z.addEventListener('input',function(){c.out=Math.max(+z.value,c.in+0.2);z.value=c.out;lt();edPreviewAt(cv,c,c.out);});
      z.addEventListener('change',edDraw);a.addEventListener('change',edDraw);
      p.append(field('✂️ Начало',a),field('✂️ Конец',z),lab);
    }else{
      var d=el('input');d.type='range';d.min=1;d.max=10;d.step=0.5;d.value=c.out;
      var dl=el('span','edtrim',c.out+Lx(' с',' s'));d.addEventListener('input',function(){c.out=+d.value;dl.textContent=c.out+Lx(' с',' s');});d.addEventListener('change',edDraw);
      p.append(field('⏱ Длительность фото',d),dl);
    }
    var mv=el('div','mrow');
    mv.append(btn('◀ Раньше','mbtn',function(){if(ED.cur>0){ED.clips.splice(ED.cur-1,0,ED.clips.splice(ED.cur,1)[0]);ED.cur--;edDraw();}}),
      btn('Позже ▶','mbtn',function(){if(ED.cur<ED.clips.length-1){ED.clips.splice(ED.cur+1,0,ED.clips.splice(ED.cur,1)[0]);ED.cur++;edDraw();}}),
      btn('🗑 Убрать','mbtn',function(){ED.clips.splice(ED.cur,1);ED.cur=Math.max(0,ED.cur-1);edDraw();}));
    p.append(mv);
    wrap.append(p);
  }
  /* текст, фильтр, звук — на весь ролик */
  var g=el('div','edpanel');
  g.append(el('h3',null,'Весь ролик'));
  var tx=inp('text',ED.text,'Текст поверх видео',60);tx.addEventListener('input',function(){ED.text=tx.value;edFrame(cv);});
  var tp=sel([['top','Сверху'],['center','По центру'],['bottom','Снизу']],ED.tpos);tp.addEventListener('change',function(){ED.tpos=tp.value;edFrame(cv);});
  var tc=el('input');tc.type='color';tc.value=ED.tcol;tc.addEventListener('input',function(){ED.tcol=tc.value;edFrame(cv);});
  var tr=el('div','edrow');tr.append(tx,tp,tc);
  g.append(field('🅰️ Титр',tr));
  var fxs=el('div','glfx');
  Object.keys(GL_FX).forEach(function(k){var x=btn(Lx(GL_FX[k][0],GL_FX[k][2]||GL_FX[k][0]),'glfxb'+(ED.fx===k?' on':''),function(){ED.fx=k;fxs.querySelectorAll('.glfxb').forEach(function(q){q.classList.toggle('on',q===x);});edFrame(cv);});fxs.append(x);});
  g.append(field('🎨 Фильтр',fxs));
  g.append(setLine('🔇 Без звука',setToggle(ED.mute,function(v){ED.mute=v;edDraw();})));
  wrap.append(g);
  b.append(wrap);
  edFrame(cv);
}
/* добавить клип: готовим video или img и миниатюру */
function edAdd(url,kind,dur){
  return new Promise(function(res){
    var c={url:url,kind:kind,in:0,out:3,dur:3};
    if(kind==='photo'){
      var im=new Image();im.crossOrigin='anonymous';
      im.onload=function(){c.el=im;c.thumb=edThumb(im,im.naturalWidth,im.naturalHeight);ED.clips.push(c);res();};
      im.onerror=function(){alert('Фото не открылось');res();};im.src=url;
    }else{
      var v=document.createElement('video');v.crossOrigin='anonymous';v.preload='auto';v.playsInline=true;v.muted=true;
      v.onloadedmetadata=function(){c.dur=isFinite(v.duration)?v.duration:(dur||5);c.out=Math.min(c.dur,60);v.currentTime=Math.min(0.5,c.dur/2);};
      v.onseeked=function(){if(c.thumb)return;c.el=v;c.thumb=edThumb(v,v.videoWidth,v.videoHeight);ED.clips.push(c);res();};
      v.onerror=function(){alert('Видео не открылось. Подойдут MP4 и WebM.');res();};
      v.src=url;
    }
  });
}
function edThumb(src,w,h){try{var c=document.createElement('canvas');c.width=160;c.height=Math.round(160*h/w)||90;c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.6);}catch(e){return '';}}
/* нарисовать кадр: картинка «вписывается» в формат, сверху фильтр и текст */
function edPaint(g,W,H,src,sw,sh){
  g.save();g.fillStyle='#000';g.fillRect(0,0,W,H);
  if(src&&sw){
    g.filter=GL_FX[ED.fx][1]||'none';
    var s=Math.max(W/sw,H/sh),dw=sw*s,dh=sh*s;
    g.drawImage(src,(W-dw)/2,(H-dh)/2,dw,dh);
    g.filter='none';
  }
  if(ED.text){
    var fs=Math.round(Math.min(W,H)*0.075);g.font='800 '+fs+'px Manrope, Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';
    var y=ED.tpos==='top'?H*0.12:ED.tpos==='center'?H/2:H*0.88;
    g.lineWidth=fs*0.16;g.strokeStyle='rgba(0,0,0,.65)';g.lineJoin='round';g.strokeText(ED.text,W/2,y,W*0.9);
    g.fillStyle=ED.tcol;g.fillText(ED.text,W/2,y,W*0.9);
  }
  g.restore();
}
function edFrame(cv){var c=ED.clips[ED.cur];var g=cv.getContext('2d');if(!c){edPaint(g,cv.width,cv.height,null);return;}edPaint(g,cv.width,cv.height,c.el,c.kind==='photo'?c.el.naturalWidth:c.el.videoWidth,c.kind==='photo'?c.el.naturalHeight:c.el.videoHeight);}
function edPreviewAt(cv,c,t){if(c.kind!=='video')return;c.el.currentTime=t;c.el.onseeked=function(){edFrame(cv);};}
/* проигрывание (и запись) по порядку */
function edPlay(cv,record,onEnd){
  if(!ED.clips.length)return;
  ED.playing=true;
  var g=cv.getContext('2d'),i=0,t0=0,acc=0,total=edTotal(),raf=0;
  var actx=null,dest=null;
  if(record&&!ED.mute){try{actx=new (window.AudioContext||window.webkitAudioContext)();dest=actx.createMediaStreamDestination();}catch(e){}}
  function start(k){
    i=k;var c=ED.clips[i];if(!c){finish();return;}
    t0=performance.now();
    if(c.kind==='video'){
      var v=c.el;v.muted=ED.mute||!!record&&!dest;v.currentTime=c.in;
      if(dest&&!c.src){try{c.src=actx.createMediaElementSource(v);}catch(e){}}
      if(dest&&c.src){try{c.src.disconnect();}catch(e){}c.src.connect(dest);v.muted=false;}
      var p=v.play();if(p&&p.catch)p.catch(function(){});
    }
  }
  function loop(){
    if(!ED.playing)return;
    var c=ED.clips[i],el2=(performance.now()-t0)/1000;
    if(c.kind==='video'){
      edPaint(g,cv.width,cv.height,c.el,c.el.videoWidth,c.el.videoHeight);
      if(c.el.currentTime>=c.out||c.el.ended){c.el.pause();acc+=edLen(c);start(i+1);}
    }else{
      edPaint(g,cv.width,cv.height,c.el,c.el.naturalWidth,c.el.naturalHeight);
      if(el2>=edLen(c)){acc+=edLen(c);start(i+1);}
    }
    var now=Math.min(total,acc+(ED.clips[i]?(ED.clips[i].kind==='video'?Math.max(0,ED.clips[i].el.currentTime-ED.clips[i].in):(performance.now()-t0)/1000):0));
    var tm=$('edTime');if(tm)tm.textContent=glDur(now)+' / '+glDur(total);
    if(ED.onProg)ED.onProg(now/total);
    if(ED.playing)raf=requestAnimationFrame(loop);
  }
  function finish(){ED.playing=false;cancelAnimationFrame(raf);ED.clips.forEach(function(c){if(c.kind==='video')c.el.pause();});if(onEnd)onEnd();else edDraw();}
  ED.finish=finish;
  start(0);loop();
  return dest;
}
function edStop(){if(ED.finish)ED.finish();ED.playing=false;}
/* экспорт: запись холста + звука через MediaRecorder */
function edExport(){
  if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){alert('Этот браузер не умеет сохранять видео. Попробуй Chrome, Edge или Safari 17+.');return;}
  var sz=edSize(),cv=document.createElement('canvas');cv.width=sz[0];cv.height=sz[1];
  osSheet(function(box,close){
    box.append(el('h2',null,'Экспорт видео'));
    var pv=el('div','edexpv');cv.className='edexc';pv.append(cv);box.append(pv);
    var pr=el('div','glprog');var pt=el('span','','Готовлю…');var pi=el('i');pr.append(pt,pi);box.append(pr);
    box.append(el('p','avhint','Видео записывается в реальном времени — подожди, пока ролик проиграется до конца.'));
    var row=el('div','mrow');var cancel=btn('Отмена','mbtn',function(){stop=true;edStop();close();});row.append(cancel);box.append(row);
    var stop=false,chunks=[];
    var vs=cv.captureStream(30);
    ED.onProg=function(f){pi.style.width=(f*100).toFixed(1)+'%';pt.textContent='Записываю: '+Math.round(f*100)+'%';};
    var dest=edPlay(cv,true,function(){ED.onProg=null;setTimeout(function(){if(rec.state!=='inactive')rec.stop();},250);});
    var tracks=vs.getVideoTracks();if(dest)tracks=tracks.concat(dest.stream.getAudioTracks());
    var ms=new MediaStream(tracks);
    var mime=['video/mp4;codecs=avc1','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].filter(function(m){return MediaRecorder.isTypeSupported(m);})[0]||'';
    var rec;
    try{rec=new MediaRecorder(ms,mime?{mimeType:mime,videoBitsPerSecond:4e6}:{});}catch(e){alert('Не получилось начать запись: '+e.message);close();return;}
    rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
    rec.onstop=function(){
      if(stop)return;
      var blob=new Blob(chunks,{type:(rec.mimeType||'video/webm').split(';')[0]});
      pt.textContent='Готово! '+fmtSize(blob.size);pi.style.width='100%';
      row.textContent='';
      var url=URL.createObjectURL(blob);
      var v=el('video');v.src=url;v.controls=true;v.playsInline=true;pv.textContent='';pv.append(v);
      row.append(btn('Закрыть','mbtn',function(){close();edDraw();}),
        btn('⤓ Скачать','mbtn',function(){var a=el('a');a.href=url;a.download='HoroTube-montage.'+(/mp4/.test(blob.type)?'mp4':'webm');document.body.append(a);a.click();a.remove();}),
        btn('📁 '+Lx('В Файлы','To Files'),'mbtn',async function(){var f=await flSaveBlob(blob,Lx('Монтаж ','Edit ')+new Date().toLocaleString(dloc(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).replace(/[\/:]/g,'-')+'.'+(/mp4/.test(blob.type)?'mp4':'webm'),'edit');if(f)osToast(Lx('Видео сохранено в Файлы','Video saved to Files'));}),
        btn('🌸 В Фото','mbtn',async function(){if(blob.size>50*1048576){alert('Видео больше 50 МБ — в Фото не поместится. Скачай его.');return;}var r=await gallerySaveBlob(blob,'video',{w:sz[0],h:sz[1],d:edTotal()});if(r)osToast('Сохранено в Фото');}),
        btn('📤 Выложить в HoroTube','mbtn go',function(){
          close();
          var f=new File([blob],'montage.'+(/mp4/.test(blob.type)?'mp4':'webm'),{type:blob.type});
          $('btnUp').click();
          setTimeout(function(){try{var dt=new DataTransfer();dt.items.add(f);$('uM').value='file';upMode();$('uF').files=dt.files;$('uK').value=ED.fmt==='9:16'?'short':'video';}catch(e){alert('Выбери файл вручную: сначала скачай видео.');}},50);
        }));
    };
    rec.start(500);
  });
}
