/* ===== Почта: видео и статьи на проверку, отзыв автору ===== */
/* окно с отзывом: текст уже заполнен автоотзывом, админ правит и отправляет */
function mlNote(ok,rv){
  return new Promise(function(done){
    var fin=false;
    osSheet2(function(box,close){
      box.append(el('h2',null,ok?Lx('Отзыв автору','Review for the author'):Lx('Что нужно исправить?','What needs fixing?')));
      var def=rv?(ok?rv.text:Lx('Нужно доработать: ','Needs work: ')+rv.fix):(ok?Lx('Отличная работа!','Great work!'):'');
      var ta=inp('textarea',def,ok?Lx('Комментарий автору (можно пусто)','Comment for the author (optional)'):Lx('Автор получит письмо с этим текстом','The author gets a letter with this text'),2000);ta.className='mlnote';
      box.append(ta);
      if(rv){
        var tg=el('div','mlnotebtns');
        tg.append(btn('🤖 '+Lx('Автоотзыв','Auto review'),'chip',function(){ta.value=rv.text;}),btn('✓ '+Lx('Коротко','Short'),'chip',function(){ta.value=ok?Lx('Отличная работа!','Great work!'):Lx('Нужно доработать: ','Needs work: ')+rv.fix;}),btn('✕ '+Lx('Очистить','Clear'),'chip',function(){ta.value='';ta.focus();}));
        box.append(tg);
      }
      box.append(el('p','avhint',Lx('Автор получит письмо с этим текстом.','The author will get a letter with this text.')));
      var row=el('div','mrow');
      row.append(btn(Lx('Отмена','Cancel'),'mbtn',function(){close();}),btn(ok?'✅ '+Lx('Выпустить','Publish'):'↩️ '+Lx('Вернуть автору','Send back'),'mbtn go',function(){fin=true;var v=ta.value.trim();close();done(v);}));
      box.append(row);
      setTimeout(function(){ta.focus();},60);
    },function(){if(!fin)done(null);});
  });
}
var VST={pending:['На проверке','In review','orange'],approved:['Опубликовано','Published','green'],rejected:['Отклонено','Rejected','red']};
function mlItem(v,m){
  var adm=ME.role==='admin'&&m.to_admins;
  var c=el('div','mlapp mlitem');
  if(m.item_kind==='article'){
    var words=(String(m.item_body||'').match(/\S+/g)||[]).length;
    c.append(el('div','mlitic','📰'));
    var ct=el('div');ct.append(el('b',null,m.item_title||Lx('Статья','Article')),el('small',null,Lx('Статья для Поиска HoroTube · ','Article for HoroTube Search · ')+words+Lx(' слов',' words')+((m.item_tags||[]).length?' · #'+m.item_tags.join(' #'):'')));
    c.append(ct);
    var acts=el('div','mlappa');
    acts.append(btn('📖 '+Lx('Читать','Read'),'mbtn go',function(){artOpenSheet({title:m.item_title,body:m.item_body,tags:m.item_tags,author_id:m.from_id,author_name:mlName(m.from_id)});}));
    c.append(acts);v.append(c);
    if(!m.item_body&&m.from_id===ME.id)return;
    if(adm){
      var rv=revArticle(m.item_title,m.item_body,m.item_tags||[]);
      v.append(revCard(rv,Lx('Автоотзыв о статье','Auto review of the article')));
      var box=el('div','mladm');
      box.append(el('p','avhint',Lx('Проверь статью: факты, грамотность, нет ли обидного и чужого текста. Выпускается ровно та версия, что в этом письме.','Check the article: facts, spelling, nothing offensive or copied. Exactly the version in this letter is published.')));
      box.append(btn('✅ '+Lx('Опубликовать','Publish'),'mbtn go',function(){mlDecide(m,true,rv);}),btn('↩️ '+Lx('Вернуть на доработку','Send back'),'mbtn',function(){mlDecide(m,false,rv);}));
      v.append(box);
    }
    return;
  }
  /* видео */
  c.append(el('div','mlitic','🎬'));
  var vt=el('div');vt.append(el('b',null,m.item_title||Lx('Видео','Video')),el('small',null,Lx('Загрузка…','Loading…')));
  c.append(vt);
  var va=el('div','mlappa');c.append(va);v.append(c);
  var rvSlot=el('div');v.append(rvSlot);
  var admBox=el('div','mladm');if(adm)v.append(admBox);
  SB.from('videos').select('*').eq('id',m.item_id).maybeSingle().then(async function(r){
    var x=r.data;
    if(!x){vt.lastChild.textContent=Lx('Видео удалено','The video was deleted');return;}
    var st=VST[x.status]||VST.pending;
    vt.lastChild.textContent=(x.kind==='short'?Lx('Шортс','Short'):Lx('Видео','Video'))+(x.subject?' · '+x.subject:'')+' · ';
    vt.lastChild.append(el('span','cdst '+st[2],Lx(st[0],st[1])));
    var th=x.cover||(typeof ytThumb==='function'?ytThumb(x.url,x.kind):'');
    if(th&&safeImg(th)){var im=new Image();im.src=th;im.alt='';im.className='mlvth';im.referrerPolicy='no-referrer';c.insertBefore(im,c.firstChild.nextSibling);c.firstChild.remove();}
    va.append(btn('▶ '+Lx('Смотреть','Watch'),'mbtn go',function(){openWatch(x);}));
    if(!adm)return;
    rvSlot.append(el('p','avhint','🤖 '+Lx('Автоотзыв считается…','Auto review in progress…')));
    var rv=await revVideo(x);
    rvSlot.textContent='';rvSlot.append(revCard(rv,Lx('Автоотзыв о видео','Auto review of the video')));
    if(x.status!=='pending')admBox.append(el('p','avhint',Lx('Видео уже ','The video is already ')+Lx(st[0],st[1]).toLowerCase()+Lx('. Можно изменить решение.','. You can change the decision.')));
    admBox.append(btn('✅ '+Lx('Опубликовать','Publish'),'mbtn go',function(){mlDecide(m,true,rv);}),btn('↩️ '+Lx('Отклонить','Reject'),'mbtn',function(){mlDecide(m,false,rv);}));
  });
}
async function mlDecide(m,ok,rv){
  var note=await mlNote(ok,rv);
  if(note===null)return;
  var fn=m.item_kind==='article'?'ht_review_article':'ht_review_video';
  var r=await SB.rpc(fn,{mail:m.id,ok:ok,note:note});
  if(r.error){alert(rus(r.error.message));return;}
  osToast(ok?(m.item_kind==='article'?Lx('Статья опубликована','Article published'):Lx('Видео опубликовано','Video published')):Lx('Автор получит письмо с отзывом','The author will get a letter with the review'));
  if(m.item_kind==='video'&&typeof loadFeed==='function')loadFeed();
  await mlLoad();mlDraw();
}
