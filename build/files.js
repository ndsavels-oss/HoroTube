/* ===== Файлы: личное хранилище (таблица ht_files и хранилище ht_files, см. files_groups.sql) =====
   Текст (документы, заметки, код) лежит прямо в таблице, видео и прочее — в закрытом хранилище. */
var FL={list:null,tab:'all',q:'',err:null};
var FLB='ht_files';
var FL_KIND={
  doc:['📄','Документ','Document','linear-gradient(160deg,#4F8BFF,#1E4FD8)'],
  note:['🗒','Заметка','Note','linear-gradient(160deg,#FFE27A,#FFC107)'],
  code:['</>','Код','Code','linear-gradient(160deg,#3A3D5C,#12131F)'],
  video:['🎬','Видео','Video','linear-gradient(160deg,#FF6B6B,#C81D4E)'],
  image:['🖼','Картинка','Image','linear-gradient(160deg,#5BF675,#0CA34A)'],
  other:['📎','Файл','File','linear-gradient(160deg,#B0B0B8,#6E6E78)']
};
/* подписи считаем при отрисовке: при загрузке модуля язык ещё не выбран */
function flKName(k){var x=FL_KIND[k]||FL_KIND.other;return Lx(x[1],x[2]);}
function flTabs(){return [['all',Lx('Все','All')],['doc',Lx('Документы','Documents')],['note',Lx('Заметки','Notes')],['code',Lx('Код','Code')],['video',Lx('Видео','Videos')],['image',Lx('Картинки','Images')],['other',Lx('Другое','Other')]];}
function flKindOf(mime,name){
  mime=mime||'';name=(name||'').toLowerCase();
  if(/^video\//.test(mime))return 'video';
  if(/^image\//.test(mime))return 'image';
  return 'other';
}
function flExt(name,mime){
  var m=String(name||'').toLowerCase().match(/\.([a-z0-9]{1,5})$/);if(m)return m[1];
  var t={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf','text/plain':'txt','text/html':'html'}[mime];
  return t||'bin';
}
function flIcon(k,size){var x=FL_KIND[k]||FL_KIND.other;var i=el('div','flico');i.style.background=x[3];i.style.width=i.style.height=(size||44)+'px';i.append(el('span',null,x[0]));if(k==='code')i.classList.add('code');return i;}
function flWhen(t){return dmWhen(t);}
async function flLoad(){
  if(!SB||!ME)return;
  var r=await SB.from('ht_files').select('id,user_id,name,kind,mime,path,size,src,created_at,updated_at').eq('user_id',ME.id).order('updated_at',{ascending:false}).limit(500);
  FL.err=r.error||null;FL.list=r.error?[]:r.data||[];
}
function flMissing(e){return e&&/ht_files|relation|PGRST20[25]|does not exist|schema cache|bucket/i.test(e.message||'');}
function flErrText(e){return flMissing(e)?Lx('Файлы заработают, когда администратор выполнит files_groups.sql в Supabase','Files will work once the admin runs files_groups.sql in Supabase'):rus(e.message||String(e));}
/* сохранить текст (документ, заметку, код). o: {id?, name, kind, mime, body, src}. Возвращает строку или null */
async function flSaveText(o,quiet){
  if(!SB||!ME){openAuth(false);return null;}
  var name=String(o.name||Lx('Без названия','Untitled')).trim().slice(0,80)||Lx('Без названия','Untitled');
  var row={name:name,body:String(o.body||'')};
  var r=o.id?await SB.from('ht_files').update(row).eq('id',o.id).select('id,user_id,name,kind,mime,path,size,src,created_at,updated_at').single()
           :await SB.from('ht_files').insert(Object.assign(row,{kind:o.kind||'doc',mime:o.mime||'text/html',src:o.src||null})).select('id,user_id,name,kind,mime,path,size,src,created_at,updated_at').single();
  if(r.error||!r.data){if(!quiet)alert(r.error?flErrText(r.error):Lx('Не сохранилось','Not saved'));return null;}
  if(FL.list){FL.list=FL.list.filter(function(f){return f.id!==r.data.id;});FL.list.unshift(r.data);}
  return r.data;
}
/* сохранить видео, картинку или любой файл */
async function flSaveBlob(blob,name,src){
  if(!SB||!ME){openAuth(false);return null;}
  if(blob.size>50*1048576){alert(Lx('Файл больше 50 МБ — в Файлы не поместится','The file is over 50 MB and will not fit'));return null;}
  var mime=blob.type||'application/octet-stream',ext=flExt(name,mime);
  var path=ME.id+'/'+Date.now()+'-'+Math.floor(Math.random()*1e6)+'.'+ext;
  var up=await SB.storage.from(FLB).upload(path,blob,{contentType:mime,upsert:false});
  if(up.error){alert(Lx('Не загрузилось: ','Upload failed: ')+flErrText(up.error));return null;}
  var r=await SB.from('ht_files').insert({name:String(name||('file.'+ext)).slice(0,80),kind:flKindOf(mime,name),mime:mime.slice(0,100),path:path,size:blob.size,src:src||'upload'}).select('id,user_id,name,kind,mime,path,size,src,created_at,updated_at').single();
  if(r.error||!r.data){SB.storage.from(FLB).remove([path]);alert(r.error?flErrText(r.error):Lx('Файл не сохранился','Not saved'));return null;}
  if(FL.list)FL.list.unshift(r.data);
  return r.data;
}
async function flBody(f){if(f.body!=null)return f.body;var r=await SB.from('ht_files').select('body').eq('id',f.id).single();f.body=r.data?r.data.body||'':'';return f.body;}
async function flBlob(f){
  if(!f.path){var b=await flBody(f);return new Blob([f.kind==='doc'?docWordHtml(f.name,b):b],{type:f.kind==='doc'?'application/msword':(f.mime||'text/plain')+';charset=utf-8'});}
  var r=await SB.storage.from(FLB).download(f.path);if(r.error)throw r.error;return r.data;
}
async function flUrl(f){var r=await SB.storage.from(FLB).createSignedUrl(f.path,3600);if(r.error)throw r.error;return r.data.signedUrl;}
function flFileName(f){
  if(f.kind==='doc')return f.name.replace(/\.(doc|html?)$/i,'')+'.doc';
  if(f.kind==='note')return f.name.replace(/\.txt$/i,'')+'.txt';
  if(f.kind==='code')return /\.html?$/i.test(f.name)?f.name:f.name+'.html';
  return /\.[a-z0-9]{1,5}$/i.test(f.name)?f.name:f.name+'.'+flExt('',f.mime);
}
function flDownloadBlob(blob,name){var u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},4000);}
async function flDownload(f){try{flDownloadBlob(await flBlob(f),flFileName(f));}catch(e){alert(Lx('Не скачалось: ','Download failed: ')+flErrText(e));}}
async function flRemove(f){
  if(!confirm(Lx('Удалить «','Delete “')+f.name+Lx('» насовсем?','” forever?')))return false;
  var r=await SB.from('ht_files').delete().eq('id',f.id);
  if(r.error){alert(flErrText(r.error));return false;}
  if(f.path)SB.storage.from(FLB).remove([f.path]);
  FL.list=(FL.list||[]).filter(function(x){return x.id!==f.id;});
  return true;
}

/* ---------- приложение ---------- */
async function openFiles(){
  var p=$('p-files');
  if(!p){p=el('section','main page osapp');p.id='p-files';p.append(el('div','flwrap'));var host=$('p-uapp');host.parentNode.insertBefore(p,host.nextSibling);}
  showPage('p-files');OS.app='files';osRecent('files');osBar();
  var w=p.firstChild;w.textContent='';
  if(!needSB(w,Lx('Войди в аккаунт, чтобы хранить файлы.','Sign in to keep files.')))return;
  w.append(el('div','osempty',Lx('Загрузка…','Loading…')));
  await flLoad();flDraw();
}
function flDraw(){
  var w=document.querySelector('#p-files .flwrap');if(!w)return;w.textContent='';
  if(FL.err){w.append(el('p','bad',flErrText(FL.err)));return;}
  var hd=el('div','flhd');hd.append(el('h2','iptitle',Lx('Файлы','Files')));
  var add=btn('＋','icon-btn flnew',function(e){flAddMenu(add);});add.title=Lx('Создать или загрузить','Create or upload');
  var q=inp('search',FL.q,Lx('Поиск','Search'));q.className='flq';
  q.addEventListener('input',function(){FL.q=q.value;flList(box);});
  hd.append(q,add);w.append(hd);
  var tabs=el('div','fltabs');
  flTabs().forEach(function(t){
    var n=t[0]==='all'?FL.list.length:FL.list.filter(function(f){return f.kind===t[0];}).length;
    if(t[0]!=='all'&&t[0]!==FL.tab&&!n)return;
    var b=btn(t[1]+(n?' '+n:''),'fltab'+(FL.tab===t[0]?' on':''),function(){FL.tab=t[0];flDraw();});tabs.append(b);
  });
  w.append(tabs);
  var used=FL.list.reduce(function(s,f){return s+(f.size||0);},0),max=300*1048576;
  var u=el('div','flused');var bar=el('i');bar.style.width=Math.min(100,used/max*100).toFixed(1)+'%';var tr2=el('span');tr2.append(bar);
  u.append(tr2,el('small',null,fmtSize(used)+Lx(' из 300 МБ',' of 300 MB')));w.append(u);
  var box=el('div','fllist');w.append(box);flList(box);
  w.append(el('p','avhint',Lx('Файлы видишь только ты (и администратор школы). Сюда можно сохранять видео из Видеостудии, заметки, код из Студии кода и документы.','Only you (and the school admin) can see your files. Save videos from Video Studio, notes, code from Code Studio and documents here.')));
}
function flList(box){
  box.textContent='';
  var q=FL.q.trim().toLowerCase();
  var v=FL.list.filter(function(f){return (FL.tab==='all'||f.kind===FL.tab)&&(!q||f.name.toLowerCase().indexOf(q)>=0);});
  if(!v.length){var e=el('div','flempty');e.append(el('b',null,'📁'),el('span',null,FL.list.length?Lx('Ничего не нашлось','Nothing found'):Lx('Пока пусто. Нажми ＋, чтобы создать документ или загрузить файл.','Empty for now. Tap ＋ to create a document or upload a file.')));box.append(e);return;}
  v.forEach(function(f){
    var r=el('div','flrow');r.tabIndex=0;
    r.append(flIcon(f.kind,44));
    var tx=el('div','fltx');tx.append(el('b',null,f.name),el('small',null,flKName(f.kind)+' · '+fmtSize(f.size||0)+' · '+flWhen(f.updated_at)));
    var more=btn('⋯','flmore',function(e){e.stopPropagation();flMenu(f,more);});more.title=Lx('Ещё','More');
    r.append(tx,more);
    r.addEventListener('click',function(){flOpen(f);});
    r.addEventListener('keydown',function(e){if(e.key==='Enter')flOpen(f);});
    box.append(r);
  });
}
function flPop(anchor,items){
  var old=document.querySelector('.flpop');if(old)old.remove();
  var m=el('div','flpop');
  items.forEach(function(it){if(!it)return;var b=btn(it[0],it[2]?'danger':'',function(e){e.stopPropagation();m.remove();it[1]();});m.append(b);});
  document.body.append(m);
  var r=anchor.getBoundingClientRect(),mw=m.offsetWidth,mh=m.offsetHeight;
  m.style.left=Math.max(8,Math.min(innerWidth-mw-8,r.right-mw))+'px';
  m.style.top=(r.bottom+mh+8>innerHeight?Math.max(8,r.top-mh-6):r.bottom+6)+'px';
  setTimeout(function(){document.addEventListener('click',function c(){m.remove();document.removeEventListener('click',c);});},0);
}
function flAddMenu(anchor){
  flPop(anchor,[
    ['📄 '+Lx('Новый документ','New document'),function(){openDocs('new');}],
    ['⤒ '+Lx('Загрузить с устройства','Upload from device'),function(){flPickDevice(true,async function(files){
      for(var i=0;i<files.length;i++){osToast(Lx('Загружаю ','Uploading ')+files[i].name);await flSaveBlob(files[i],files[i].name,'upload');}
      flDraw();})}]
  ]);
}
function flPickDevice(multi,cb){var i=el('input');i.type='file';i.multiple=!!multi;i.style.display='none';document.body.append(i);i.addEventListener('change',function(){var f=[].slice.call(i.files||[]);i.remove();if(f.length)cb(f);});i.click();}
function flMenu(f,anchor){
  flPop(anchor,[
    ['↗ '+Lx('Открыть','Open'),function(){flOpen(f);}],
    ['✏️ '+Lx('Переименовать','Rename'),async function(){var n=prompt(Lx('Новое имя','New name'),f.name);if(!n||!n.trim()||n.trim()===f.name)return;var r=await SB.from('ht_files').update({name:n.trim().slice(0,80)}).eq('id',f.id).select('name,updated_at').single();if(r.error){alert(flErrText(r.error));return;}f.name=r.data.name;f.updated_at=r.data.updated_at;flDraw();}],
    ['⤓ '+Lx('Скачать на устройство','Download'),function(){flDownload(f);}],
    ['✉️ '+Lx('Отправить письмом','Send by mail'),function(){openMailCompose({files:[f]});}],
    f.kind==='code'?['🧩 '+Lx('Открыть в Студии кода','Open in Code Studio'),function(){flToStudio(f);}]:null,
    ['🗑 '+Lx('Удалить','Delete'),async function(){if(await flRemove(f))flDraw();},1]
  ]);
}
async function flOpen(f){
  if(f.kind==='doc'){openDocs(f.id);return;}
  osSheet(async function(box,close){
    box.classList.add('wide','flview');
    var hd=el('div','flvh');hd.append(flIcon(f.kind,36),el('b',null,f.name));box.append(hd);
    var body=el('div','flvb');body.append(el('div','osempty',Lx('Загрузка…','Loading…')));box.append(body);
    var row=el('div','mrow');
    row.append(btn(Lx('Закрыть','Close'),'mbtn',function(){close();sandboxClean();}),btn('⤓ '+Lx('Скачать','Download'),'mbtn',function(){flDownload(f);}),btn('✉️','mbtn',function(){close();openMailCompose({files:[f]});}));
    box.append(row);
    try{
      body.textContent='';
      if(f.kind==='video'){var v=el('video');v.controls=true;v.playsInline=true;v.src=await flUrl(f);body.append(v);}
      else if(f.kind==='image'){var im=el('img');im.alt=f.name;im.src=await flUrl(f);body.append(im);}
      else if(f.kind==='note'){
        var t=inp('textarea',await flBody(f),'');t.className='flnote';t.maxLength=400000;body.append(t);
        row.append(btn('📄 '+Lx('В Документы','To Documents'),'mbtn',async function(){var d=await flSaveText({name:f.name,kind:'doc',mime:'text/html',body:docFromText(t.value),src:'notes'});if(d){close();openDocs(d.id);}}),
          btn(Lx('Сохранить','Save'),'mbtn go',async function(){var r=await flSaveText({id:f.id,name:f.name,body:t.value});if(r){f.body=t.value;f.size=r.size;osToast(Lx('Сохранено','Saved'));flDraw();}}));
      }else if(f.kind==='code'){
        var code=await flBody(f),con=el('div','cdcon'),fr=el('div','flcode');
        var pre=el('pre','mlcode',code);
        fr.append(sandboxFrame(code,'f'+f.id,function(k,m){con.append(el('div','cdlog '+k,m));}));
        body.append(fr,con,pre);
        row.append(btn('🧩 '+Lx('В Студию кода','To Code Studio'),'mbtn go',function(){close();flToStudio(f);}));
      }else{
        var info=el('div','flinfo');info.append(flIcon('other',72),el('b',null,f.name),el('small',null,(f.mime||'')+' · '+fmtSize(f.size||0)));
        info.append(el('p','avhint',Lx('Такой файл здесь не открыть. Скачай его на устройство.','This file cannot be opened here. Download it to your device.')));
        body.append(info);
      }
    }catch(e){body.textContent='';body.append(el('p','bad',flErrText(e)));}
  });
}
async function flToStudio(f){
  var code=await flBody(f);
  var r=await SB.from('ht_user_apps').insert({name:f.name.replace(/\.html?$/i,'').slice(0,30)||'Приложение',icon:'🧩',color:'blue',code:code}).select('*').single();
  if(r.error){alert(rus(r.error.message));return;}
  if(CD.list)CD.list.unshift(r.data);
  openCode(r.data.id);
}
/* выбрать файлы из «Файлов» (для письма) */
async function flPick(max,cb){
  if(!FL.list)await flLoad();
  osSheet2(function(box,close){
    box.append(el('h2',null,Lx('Выбери файлы','Choose files')));
    if(FL.err){box.append(el('p','bad',flErrText(FL.err)));}
    var sel={},list=el('div','fllist flpick');
    if(!FL.list.length)list.append(el('p','osempty',Lx('В Файлах пока пусто','Files is empty')));
    FL.list.forEach(function(f){
      var r=el('label','flrow');var c=el('input');c.type='checkbox';
      c.addEventListener('change',function(){if(c.checked&&Object.keys(sel).length>=max){c.checked=false;osToast(Lx('Не больше ','At most ')+max);return;}if(c.checked)sel[f.id]=f;else delete sel[f.id];});
      var tx=el('div','fltx');tx.append(el('b',null,f.name),el('small',null,flKName(f.kind)+' · '+fmtSize(f.size||0)));
      r.append(c,flIcon(f.kind,36),tx);list.append(r);
    });
    var mr=el('div','mrow');mr.append(btn(Lx('Отмена','Cancel'),'mbtn',close),btn(Lx('Добавить','Add'),'mbtn go',function(){close();cb(Object.keys(sel).map(function(k){return sel[k];}));}));
    box.append(list,mr);
  });
}
/* значки и место в списке приложений: «Файлы» и «Документы» — рядом с Заметками */
ICO.files='<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.2h6.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 10.5h18"/>';
ICO.docs='<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 11h6M9 14.5h6M9 18h4"/>';
(function(){
  function mk(id,ru,en,dru,den,bg,open){var a={id:id,bg:bg,page:'p-'+id,split:1,open:open};
    Object.defineProperty(a,'t',{get:function(){return Lx(ru,en);},enumerable:true});
    Object.defineProperty(a,'d',{get:function(){return Lx(dru,den);},enumerable:true});return a;}
  var at=APPS.findIndex(function(x){return x.id==='notes';});
  APPS.splice(at<0?APPS.length:at,0,
    mk('files','Файлы','Files','Документы, видео, заметки и код в одном месте','Documents, videos, notes and code in one place','linear-gradient(160deg,#5AC8FA,#1F6FFF)',function(){openFiles();}),
    mk('docs','Документы','Documents','Текстовый редактор как Word: заголовки, таблицы, картинки','A word processor like Word: headings, tables, pictures','linear-gradient(160deg,#4F8BFF,#1E3FB8)',function(){openDocs();}));
  if(typeof PAGE_APP!=='undefined'){PAGE_APP['p-files']='files';PAGE_APP['p-docs']='docs';}
  /* новые приложения один раз сами появляются на домашнем экране у каждого аккаунта */
  var ol=osLoadUser;
  function addNew(){['files','docs'].forEach(function(id){var k=osKey('h_new_'+id);try{if(!localStorage.getItem(k)){localStorage.setItem(k,'1');if(OS.inst.indexOf(id)<0)setInstalled(id,true);}}catch(e){}});}
  osLoadUser=function(){ol.apply(this,arguments);addNew();};
  addNew();
})();

/* второй лист поверх первого (например, выбор файла из открытого письма) */
function osSheet2(build,onClose){
  var o=el('div','ovl show os2'),b=el('div','mdl ossheet');o.append(b);document.body.append(o);
  function close(){o.remove();if(onClose)onClose();}
  o.addEventListener('click',function(e){if(e.target===o)close();});
  build(b,close);return close;
}
