/* ===== Документы: текстовый редактор как Word. Документы хранятся в «Файлах» (kind = doc) ===== */
var DC={cur:null,timer:0,dirty:false};
/* чистим HTML документа: только безопасные теги и стили (документ могли прислать письмом) */
var DC_TAGS={P:1,DIV:1,BR:1,SPAN:1,B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,SUB:1,SUP:1,H1:1,H2:1,H3:1,H4:1,BLOCKQUOTE:1,UL:1,OL:1,LI:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1,HR:1,IMG:1,A:1,FONT:1,PRE:1,CODE:1,MARK:1};
var DC_DROP={SCRIPT:1,STYLE:1,IFRAME:1,OBJECT:1,EMBED:1,LINK:1,META:1,TITLE:1,HEAD:1,FORM:1,INPUT:1,BUTTON:1,TEXTAREA:1,SELECT:1,SVG:1,MATH:1,VIDEO:1,AUDIO:1,SOURCE:1,BASE:1,TEMPLATE:1,NOSCRIPT:1};
var DC_CSS=/^(color|background-color|font-size|font-family|font-weight|font-style|text-align|text-decoration|text-decoration-line|margin-left|padding-left|line-height|width|border|border-collapse|vertical-align)$/;
function docClean(html){
  var doc=new DOMParser().parseFromString('<body>'+String(html||'')+'</body>','text/html');
  (function walk(n){
    [].slice.call(n.childNodes).forEach(function(c){
      if(c.nodeType===8){c.remove();return;}
      if(c.nodeType!==1)return;
      var t=c.tagName;
      if(DC_DROP[t]){c.remove();return;}
      walk(c);
      if(!DC_TAGS[t]){while(c.firstChild)c.parentNode.insertBefore(c.firstChild,c);c.remove();return;}
      [].slice.call(c.attributes).forEach(function(a){
        var k=a.name.toLowerCase(),v=a.value;
        if(k==='style'){
          var keep=v.split(';').map(function(d){var i=d.indexOf(':');if(i<0)return '';var p=d.slice(0,i).trim().toLowerCase(),x=d.slice(i+1).trim();
            return DC_CSS.test(p)&&!/url\s*\(|expression|javascript:|[<>]/i.test(x)?p+':'+x:'';}).filter(Boolean).join(';');
          if(keep)c.setAttribute('style',keep);else c.removeAttribute('style');
        }else if(t==='IMG'&&k==='src'){if(!/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=\s]+$/i.test(v))c.removeAttribute('src');}
        else if(t==='IMG'&&(k==='width'||k==='height'||k==='alt')){}
        else if(t==='A'&&k==='href'){if(!/^https?:\/\//i.test(v.trim()))c.removeAttribute('href');}
        else if(t==='FONT'&&(k==='color'||k==='face'||k==='size')){if(/[<>"]|javascript:/i.test(v))c.removeAttribute(k);}
        else if((t==='TD'||t==='TH')&&(k==='colspan'||k==='rowspan')){if(!/^\d{1,2}$/.test(v))c.removeAttribute(k);}
        else c.removeAttribute(a.name);
      });
      if(t==='A'){c.setAttribute('target','_blank');c.setAttribute('rel','noopener noreferrer');}
      if(t==='IMG'&&!c.getAttribute('src'))c.remove();
    });
  })(doc.body);
  return doc.body.innerHTML;
}
function docEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function docFromText(t){return String(t||'').split('\n').map(function(l){return '<p>'+(docEsc(l)||'<br>')+'</p>';}).join('');}
function docText(html){var d=new DOMParser().parseFromString('<body>'+docClean(html)+'</body>','text/html');d.body.querySelectorAll('p,div,h1,h2,h3,h4,li,tr,br,blockquote').forEach(function(e){e.append('\n');});return d.body.textContent.replace(/\n{3,}/g,'\n\n').trim();}
/* файл, который открывает Word: HTML с пометками Office */
function docWordHtml(title,html){
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+docEsc(title)+'</title>'+
    '<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;line-height:1.4}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}img{max-width:100%}</style></head><body>'+docClean(html)+'</body></html>';
}
var DC_TPL={
  blank:['Пустой','Blank',''],
  essay:['Сочинение','Essay','<h1>Название сочинения</h1><p><i>Ученик 5Б класса, Имя Фамилия</i></p><h2>Вступление</h2><p>О чём пойдёт речь…</p><h2>Основная часть</h2><p>Главные мысли и примеры…</p><h2>Заключение</h2><p>Вывод…</p>'],
  report:['Доклад','Report','<h1 style="text-align:center">Доклад</h1><p style="text-align:center">Тема: …</p><h2>1. Введение</h2><p>…</p><h2>2. Что я узнал</h2><ul><li>Первый факт</li><li>Второй факт</li></ul><h2>3. Вывод</h2><p>…</p><h3>Источники</h3><ol><li>…</li></ol>'],
  letter:['Письмо','Letter','<p style="text-align:right">'+new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})+'</p><p>Здравствуйте, …!</p><p>Пишу вам, чтобы…</p><p>С уважением,<br>…</p>'],
  table:['Таблица','Table','<h2>Расписание</h2><table style="width:100%;border-collapse:collapse"><tbody><tr><th>День</th><th>1 урок</th><th>2 урок</th><th>3 урок</th></tr><tr><td>Понедельник</td><td></td><td></td><td></td></tr><tr><td>Вторник</td><td></td><td></td><td></td></tr><tr><td>Среда</td><td></td><td></td><td></td></tr></tbody></table><p></p>']
};
async function openDocs(id){
  var p=$('p-docs');
  if(!p){p=el('section','main page osapp');p.id='p-docs';p.append(el('div','dcwrap'));var host=$('p-uapp');host.parentNode.insertBefore(p,host.nextSibling);}
  showPage('p-docs');OS.app='docs';osRecent('docs');osBar();
  var w=p.firstChild;w.textContent='';
  if(!needSB(w,Lx('Войди в аккаунт, чтобы писать документы.','Sign in to write documents.')))return;
  if(id==='new'){dcNew();return;}
  if(id){DC.cur=id;}
  if(!FL.list){w.append(el('div','osempty',Lx('Загрузка…','Loading…')));await flLoad();}
  if(DC.cur&&FL.list.some(function(f){return f.id===DC.cur;}))dcEdit(DC.cur);else{DC.cur=null;dcHome();}
}
function dcHome(){
  var w=document.querySelector('#p-docs .dcwrap');if(!w)return;w.textContent='';
  if(FL.err){w.append(el('p','bad',flErrText(FL.err)));return;}
  w.append(el('h2','iptitle',Lx('Документы','Documents')));
  w.append(el('h3','dch3',Lx('Создать','Create')));
  var tp=el('div','dctpls');
  Object.keys(DC_TPL).forEach(function(k){
    var t=DC_TPL[k],c=el('button','dctpl');var pg=el('div','dcmini');pg.innerHTML=docClean(t[2]||'');
    c.append(pg,el('b',null,Lx(t[0],t[1])));c.addEventListener('click',function(){dcCreate(k);});tp.append(c);
  });
  w.append(tp);
  var docs=FL.list.filter(function(f){return f.kind==='doc';});
  w.append(el('h3','dch3',Lx('Недавние','Recent')));
  if(!docs.length)w.append(el('p','osempty',Lx('Документов пока нет','No documents yet')));
  var l=el('div','fllist');
  docs.forEach(function(f){
    var r=el('div','flrow');r.append(flIcon('doc',40));
    var tx=el('div','fltx');tx.append(el('b',null,f.name),el('small',null,fmtSize(f.size||0)+' · '+flWhen(f.updated_at)));
    var more=btn('⋯','flmore',function(e){e.stopPropagation();flMenu(f,more);});
    r.append(tx,more);r.addEventListener('click',function(){DC.cur=f.id;dcEdit(f.id);});l.append(r);
  });
  w.append(l);
}
function dcNew(){if(!FL.list)flLoad().then(function(){dcCreate('blank');});else dcCreate('blank');}
async function dcCreate(k){
  var t=DC_TPL[k]||DC_TPL.blank;
  var f=await flSaveText({name:k==='blank'?Lx('Новый документ','New document'):Lx(t[0],t[1]),kind:'doc',mime:'text/html',body:t[2]||'<p><br></p>',src:'docs'});
  if(!f)return;DC.cur=f.id;dcEdit(f.id);
}
async function dcEdit(id){
  var w=document.querySelector('#p-docs .dcwrap');if(!w)return;
  var f=FL.list.filter(function(x){return x.id===id;})[0];if(!f){dcHome();return;}
  w.textContent='';w.append(el('div','osempty',Lx('Загрузка…','Loading…')));
  var html=docClean(await flBody(f));
  w.textContent='';
  var top=el('div','dctop');
  var back=btn('‹ '+Lx('Документы','Documents'),'ipback dcback',async function(){await dcSave();DC.cur=null;dcHome();});
  var name=inp('text',f.name,Lx('Название','Title'),80);name.className='dcname';
  var st=el('small','dcst',Lx('Сохранено','Saved'));
  var exp=btn('⤓','icon-btn',function(){dcExport(f,ed,exp);});exp.title=Lx('Скачать, распечатать, отправить','Download, print, send');
  top.append(back,name,st,exp);w.append(top);
  /* панель инструментов */
  var tb=el('div','dctb');
  function cmd(c,v){ed.focus();document.execCommand(c,false,v==null?null:v);changed();state();}
  function tbtn(label,title,fn,cls){var b=el('button','dcb'+(cls?' '+cls:''),label);b.title=title;b.setAttribute('aria-label',title);b.addEventListener('mousedown',function(e){e.preventDefault();});b.addEventListener('click',fn);tb.append(b);return b;}
  function sel(opts,title,fn,cls){var s=el('select','dcsel'+(cls?' '+cls:''));s.title=title;opts.forEach(function(o){var x=el('option',null,o[1]);x.value=o[0];s.append(x);});s.addEventListener('change',function(){fn(s.value);});tb.append(s);return s;}
  function sep(){tb.append(el('i','dcsep'));}
  tbtn('↶',Lx('Отменить','Undo'),function(){cmd('undo');});tbtn('↷',Lx('Повторить','Redo'),function(){cmd('redo');});sep();
  var blk=sel([['p',Lx('Обычный текст','Normal')],['h1',Lx('Заголовок 1','Heading 1')],['h2',Lx('Заголовок 2','Heading 2')],['h3',Lx('Заголовок 3','Heading 3')],['blockquote',Lx('Цитата','Quote')],['pre',Lx('Код','Code')]],Lx('Стиль','Style'),function(v){cmd('formatBlock','<'+v+'>');},'wide');
  var fnt=sel([['Manrope','Manrope'],['Arial','Arial'],['Georgia','Georgia'],['Times New Roman','Times'],['Courier New','Courier'],['Comic Sans MS','Comic']],Lx('Шрифт','Font'),function(v){cmd('fontName',v);});
  var sz=sel([['2','10'],['3','12'],['4','14'],['5','18'],['6','24'],['7','36']],Lx('Размер','Size'),function(v){cmd('fontSize',v);});sz.value='3';sep();
  var bB=tbtn('B',Lx('Жирный','Bold'),function(){cmd('bold');},'b'),bI=tbtn('I',Lx('Курсив','Italic'),function(){cmd('italic');},'i'),bU=tbtn('U',Lx('Подчёркнутый','Underline'),function(){cmd('underline');},'u'),bS=tbtn('S',Lx('Зачёркнутый','Strikethrough'),function(){cmd('strikeThrough');},'s');
  var col=el('label','dcb dccol');col.title=Lx('Цвет текста','Text colour');var ci=el('input');ci.type='color';ci.value='#d70015';col.append(el('span',null,'A'),ci);ci.addEventListener('input',function(){col.firstChild.style.color=ci.value;cmd('foreColor',ci.value);});tb.append(col);
  var hl=el('label','dcb dccol');hl.title=Lx('Выделение цветом','Highlight');var hi=el('input');hi.type='color';hi.value='#fff36b';hl.append(el('span','hl','🖍'),hi);hi.addEventListener('input',function(){cmd('hiliteColor',hi.value);});tb.append(hl);sep();
  tbtn('•',Lx('Маркированный список','Bulleted list'),function(){cmd('insertUnorderedList');});tbtn('1.',Lx('Нумерованный список','Numbered list'),function(){cmd('insertOrderedList');});
  tbtn('⇤',Lx('Уменьшить отступ','Decrease indent'),function(){cmd('outdent');});tbtn('⇥',Lx('Увеличить отступ','Increase indent'),function(){cmd('indent');});sep();
  var al={};[['justifyLeft','⯇','По левому краю','Align left'],['justifyCenter','≡','По центру','Centre'],['justifyRight','⯈','По правому краю','Align right'],['justifyFull','☰','По ширине','Justify']].forEach(function(a){al[a[0]]=tbtn(a[1],Lx(a[2],a[3]),function(){cmd(a[0]);});});sep();
  tbtn('▦',Lx('Таблица','Table'),function(){dcTable(function(r,c){var h='<table style="width:100%;border-collapse:collapse"><tbody>';for(var i=0;i<r;i++){h+='<tr>';for(var j=0;j<c;j++)h+=i===0?'<th><br></th>':'<td><br></td>';h+='</tr>';}cmd('insertHTML',h+'</tbody></table><p><br></p>');});});
  tbtn('🖼',Lx('Картинка','Picture'),function(){var keep=dcRange();flPickDevice(false,function(fs){dcImage(fs[0],function(d){dcRange(keep);cmd('insertHTML','<img src="'+d+'" alt="">');});});});
  tbtn('—',Lx('Линия','Line'),function(){cmd('insertHorizontalRule');});
  tbtn('🔗',Lx('Ссылка','Link'),function(){var u=prompt(Lx('Адрес ссылки (https://…)','Link address (https://…)'),'https://');if(u&&/^https?:\/\/\S+$/i.test(u))cmd('createLink',u);});
  tbtn('⌫',Lx('Очистить формат','Clear formatting'),function(){cmd('removeFormat');cmd('formatBlock','<p>');});
  w.append(tb);
  /* страница */
  var desk=el('div','dcdesk'),ed=el('div','dcpage');
  ed.contentEditable='true';ed.spellcheck=true;ed.innerHTML=html||'<p><br></p>';
  desk.append(ed);w.append(desk);
  var foot=el('div','dcfoot');w.append(foot);
  try{document.execCommand('styleWithCSS',false,false);document.execCommand('defaultParagraphSeparator',false,'p');}catch(e){}
  function count(){var t=ed.innerText.trim(),n=t?t.split(/\s+/).length:0;foot.textContent=Lx('Слов: ','Words: ')+n+' · '+Lx('Знаков: ','Characters: ')+t.length;}
  function state(){
    try{bB.classList.toggle('on',document.queryCommandState('bold'));bI.classList.toggle('on',document.queryCommandState('italic'));bU.classList.toggle('on',document.queryCommandState('underline'));bS.classList.toggle('on',document.queryCommandState('strikeThrough'));
      var b=String(document.queryCommandValue('formatBlock')||'p').toLowerCase().replace(/[<>]/g,'');blk.value=['h1','h2','h3','blockquote','pre'].indexOf(b)>=0?b:'p';
      var s=String(document.queryCommandValue('fontSize')||'3');if(/^[1-7]$/.test(s))sz.value=s;
      Object.keys(al).forEach(function(k){al[k].classList.toggle('on',document.queryCommandState(k));});}catch(e){}
  }
  function changed(){DC.dirty=true;st.textContent=Lx('Изменено…','Edited…');clearTimeout(DC.timer);DC.timer=setTimeout(dcSave,1500);count();}
  ed.addEventListener('input',changed);
  ed.addEventListener('keyup',state);ed.addEventListener('mouseup',state);
  ed.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();dcSave();}
    if(e.key==='Tab'){e.preventDefault();cmd(e.shiftKey?'outdent':'indent');}
  });
  /* вставка из буфера: только чистый HTML */
  ed.addEventListener('paste',function(e){
    var d=e.clipboardData;if(!d)return;
    var img=[].slice.call(d.items||[]).filter(function(i){return /^image\//.test(i.type);})[0];
    if(img){e.preventDefault();dcImage(img.getAsFile(),function(x){cmd('insertHTML','<img src="'+x+'" alt="">');});return;}
    var h=d.getData('text/html'),t=d.getData('text/plain');
    e.preventDefault();cmd('insertHTML',h?docClean(h):docFromText(t));
  });
  name.addEventListener('input',function(){f.name=name.value;changed();});
  DC.ed=ed;DC.f=f;DC.st=st;
  count();
}
async function dcSave(){
  clearTimeout(DC.timer);
  if(!DC.dirty||!DC.f||!DC.ed)return true;
  var body=docClean(DC.ed.innerHTML);
  if(body.length>400000){if(DC.st)DC.st.textContent=Lx('Слишком большой документ (уменьши картинки)','Document too large (shrink pictures)');return false;}
  var r=await flSaveText({id:DC.f.id,name:(DC.f.name||'').trim()||Lx('Без названия','Untitled'),body:body},true);
  if(!r){if(DC.st)DC.st.textContent=Lx('Не сохранено','Not saved');return false;}
  DC.f.body=body;DC.f.size=r.size;DC.f.updated_at=r.updated_at;DC.dirty=false;if(DC.st)DC.st.textContent=Lx('Сохранено','Saved');
  return true;
}
var _dcSel=null;
function dcRange(r){var s=getSelection();if(r){s.removeAllRanges();s.addRange(r);return r;}return s.rangeCount?s.getRangeAt(0).cloneRange():null;}
/* картинка: уменьшаем до 1200 px и сжимаем, чтобы документ не раздувался */
function dcImage(file,cb){
  if(!file||!/^image\//.test(file.type)){alert(Lx('Это не картинка','Not an image'));return;}
  var u=URL.createObjectURL(file),im=new Image();
  im.onload=function(){var k=Math.min(1,1200/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
    var g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);cb(c.toDataURL('image/jpeg',.82));};
  im.onerror=function(){URL.revokeObjectURL(u);alert(Lx('Картинка не открылась','Could not open the picture'));};
  im.src=u;
}
function dcTable(cb){
  var keep=dcRange();
  osSheet(function(box,close){
    box.append(el('h2',null,Lx('Вставить таблицу','Insert table')));
    var g=el('div','dcgrid'),lab=el('p','avhint','1 × 1');
    for(var r=1;r<=8;r++)for(var c=1;c<=8;c++)(function(r,c){var b=el('button');b.addEventListener('mouseenter',function(){lab.textContent=r+' × '+c;g.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',+x.dataset.r<=r&&+x.dataset.c<=c);});});b.dataset.r=r;b.dataset.c=c;b.addEventListener('click',function(){close();dcRange(keep);cb(r,c);});g.append(b);})(r,c);
    var mr=el('div','mrow');mr.append(btn(Lx('Отмена','Cancel'),'mbtn',close));box.append(g,lab,mr);
  });
}
function dcExport(f,ed,anchor){
  dcSave();
  var html=docClean(ed.innerHTML),nm=(f.name||'document').replace(/[\\\/:*?"<>|]+/g,' ').trim()||'document';
  flPop(anchor,[
    ['📘 '+Lx('Скачать для Word (.doc)','Download for Word (.doc)'),function(){flDownloadBlob(new Blob([docWordHtml(nm,html)],{type:'application/msword'}),nm+'.doc');}],
    ['🖨 '+Lx('Печать или PDF','Print or PDF'),function(){dcPrint(nm,html);}],
    ['📄 '+Lx('Скачать текстом (.txt)','Download as text (.txt)'),function(){flDownloadBlob(new Blob([docText(html)],{type:'text/plain;charset=utf-8'}),nm+'.txt');}],
    ['✉️ '+Lx('Отправить письмом','Send by mail'),async function(){await dcSave();openMailCompose({files:[f]});}]
  ]);
}
function dcPrint(nm,html){
  var fr=el('iframe');fr.style.cssText='position:fixed;width:0;height:0;border:0;right:0;bottom:0';document.body.append(fr);
  var d=fr.contentDocument;d.open();d.write(docWordHtml(nm,html).replace('</style>','@page{margin:2cm}</style>'));d.close();
  setTimeout(function(){try{fr.contentWindow.focus();fr.contentWindow.print();}catch(e){flDownloadBlob(new Blob([docWordHtml(nm,html)],{type:'text/html'}),nm+'.html');}setTimeout(function(){fr.remove();},60000);},300);
}
