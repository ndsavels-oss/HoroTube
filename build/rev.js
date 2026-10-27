/* ===== Автоотзыв: правила оценивают статью, приложение (игру) или видео и пишут отзыв для модерации.
   Это не нейросеть: алгоритм смотрит на объём, оформление, грамотность и обидные слова (TOX).
   Решение всегда принимает человек. ===== */
var RV_STOP={'и':1,'в':1,'во':1,'не':1,'что':1,'он':1,'на':1,'я':1,'с':1,'со':1,'как':1,'а':1,'то':1,'все':1,'она':1,'так':1,'его':1,'но':1,'да':1,'ты':1,'к':1,'у':1,'же':1,'вы':1,'за':1,'бы':1,'по':1,'только':1,'ее':1,'её':1,'мне':1,'было':1,'вот':1,'от':1,'меня':1,'еще':1,'ещё':1,'нет':1,'о':1,'из':1,'ему':1,'это':1,'этот':1,'эта':1,'эти':1,'для':1,'или':1,'они':1,'мы':1,'их':1,'есть':1,'был':1,'была':1,'были':1,'при':1,'до':1,'если':1,'когда':1,'который':1,'которые':1,'также':1,'чем':1,'там':1,'тоже':1,'the':1,'a':1,'an':1,'of':1,'to':1,'and':1,'in':1,'is':1,'it':1};
function rvNew(kind){return {kind:kind,score:60,good:[],bad:[],tips:[],warn:[]};}
function rvAdd(r,d,list,txt){r.score+=d;if(list)r[list].push(txt);}
function rvTox(r,text){
  if(typeof TOX==='undefined'||!text)return;
  var t=TOX.score(text);
  if(t.score>=60){rvAdd(r,-45,'bad',Lx('Есть грубые или обидные слова','Rude or offensive words')+(t.hits&&t.hits.length?': '+t.hits.slice(0,3).join(', '):''));r.block=true;}
  else if(t.score>=30){rvAdd(r,-20,'warn',Lx('Есть слова, которые стоит проверить','Some words need a check')+(t.hits&&t.hits.length?': '+t.hits.slice(0,3).join(', '):''));}
}
function rvContacts(r,text){
  if(/(\+?\d[\d\s\-()]{8,}\d)/.test(text))rvAdd(r,-15,'warn',Lx('Похоже на номер телефона','Looks like a phone number'));
  if(/(t\.me\/|wa\.me\/|instagram\.com|tiktok\.com|vk\.com\/(?!video)|discord\.gg)/i.test(text))rvAdd(r,-10,'warn',Lx('Ссылка на соцсеть или мессенджер','Link to a social network or messenger'));
}
function rvFinish(r){
  r.score=Math.max(0,Math.min(100,Math.round(r.score)));
  if(r.block)r.score=Math.min(r.score,25);
  r.stars=r.score>=85?5:r.score>=70?4:r.score>=50?3:r.score>=30?2:1;
  r.verdict=r.block?Lx('Лучше не публиковать','Better not to publish'):r.score>=80?Lx('Можно публиковать','Ready to publish'):r.score>=60?Lx('Хорошо, но есть что улучшить','Good, with room to improve'):r.score>=40?Lx('Нужно доработать','Needs more work'):Lx('Лучше вернуть на доработку','Better to send back');
  var L=[Lx('Автоотзыв: ','Auto review: ')+'★'.repeat(r.stars)+'☆'.repeat(5-r.stars)+' ('+r.score+'/100). '+r.verdict+'.'];
  if(r.good.length)L.push(Lx('Хорошо: ','Good: ')+r.good.join('; ')+'.');
  if(r.bad.length||r.warn.length)L.push(Lx('Исправить: ','To fix: ')+r.bad.concat(r.warn).join('; ')+'.');
  if(r.tips.length)L.push(Lx('Совет: ','Tip: ')+r.tips.slice(0,3).join('; ')+'.');
  r.text=L.join('\n');
  r.fix=(r.bad.concat(r.warn,r.tips).join('; ')||Lx('Посмотри ещё раз и пришли снова','Take another look and send again'))+'.';
  return r;
}
/* ---------- статья ---------- */
function revArticle(title,body,tags){
  var r=rvNew('article');title=String(title||'').trim();body=String(body||'');tags=tags||[];
  var words=body.match(/[A-Za-zА-Яа-яЁё0-9]+(?:[-'][A-Za-zА-Яа-яЁё0-9]+)*/g)||[],n=words.length;
  if(n<80)rvAdd(r,-25,'bad',Lx('Очень коротко: ','Very short: ')+n+Lx(' слов, нужно хотя бы 150',' words, at least 150 needed'));
  else if(n<150)rvAdd(r,-10,'bad',Lx('Коротковато: ','A bit short: ')+n+Lx(' слов',' words'));
  else if(n<=2500)rvAdd(r,n>=300?12:6,'good',Lx('Хороший объём: ','Good length: ')+n+Lx(' слов',' words'));
  else rvAdd(r,0,'tips',Lx('Длинная статья: можно разбить на части','Long article: could be split into parts'));
  /* оформление */
  var lines=body.split('\n'),heads=lines.filter(function(l){return /^#{1,3}\s+\S/.test(l);}).length,lists=lines.filter(function(l){return /^\s*([-*•]|\d+[.)])\s+\S/.test(l);}).length;
  var paras=body.split(/\n\s*\n/).filter(function(p){return p.trim()&&!/^#{1,3}\s/.test(p.trim());});
  if(heads>=2)rvAdd(r,8,'good',Lx('Есть разделы с заголовками','Has sections with headings'));
  else if(n>=250)rvAdd(r,-4,'tips',Lx('Раздели статью на части с заголовками (## Заголовок)','Split the article into sections with headings (## Heading)'));
  if(lists)rvAdd(r,3,'good',Lx('Есть списки','Uses lists'));
  if(paras.length>=3)rvAdd(r,5,null);
  else if(n>=150)rvAdd(r,-6,'bad',Lx('Сплошной текст: раздели на абзацы','A wall of text: split into paragraphs'));
  var longP=paras.filter(function(p){return (p.match(/\S+/g)||[]).length>180;}).length;
  if(longP)rvAdd(r,-4,'tips',Lx('Есть очень длинные абзацы','Some paragraphs are very long'));
  /* предложения и грамотность */
  var plain=body.replace(/^#{1,3}\s+.*$/gm,'').replace(/^\s*([-*•]|\d+[.)])\s+/gm,'');
  var sents=plain.replace(/([.!?…])\s+/g,'$1\n').split(/\n+/).map(function(s){return s.trim();}).filter(function(s){return (s.match(/[A-Za-zА-Яа-яЁё]+/g)||[]).length>=2;});
  if(sents.length){
    var avg=n/sents.length;
    if(avg>28)rvAdd(r,-8,'bad',Lx('Слишком длинные предложения (в среднем ','Sentences are too long (')+Math.round(avg)+Lx(' слов)',' words on average)'));
    else if(avg>=7)rvAdd(r,5,'good',Lx('Предложения читаются легко','Sentences are easy to read'));
    var low=sents.filter(function(s){return /^[a-zа-яё]/.test(s);}).length;
    if(low/sents.length>.3)rvAdd(r,-10,'bad',Lx('Многие предложения начинаются с маленькой буквы','Many sentences start with a lowercase letter'));
    var noEnd=paras.filter(function(p){var t=p.trim();return t.length>40&&!/[.!?…:)»"]$/.test(t)&&!/^\s*([-*•]|\d+[.)])/.test(t);}).length;
    if(noEnd>1)rvAdd(r,-5,'bad',Lx('В конце абзацев не хватает точек','Paragraphs are missing full stops'));
    if(/ ,|,(?=[A-Za-zА-Яа-яЁё])|\s\./.test(plain))rvAdd(r,-3,'tips',Lx('Проверь пробелы у запятых и точек','Check spaces around commas and full stops'));
  }
  if(/([!?])\1{2,}/.test(body))rvAdd(r,-5,'bad',Lx('Много !!! или ???','Too many !!! or ???'));
  var letters=body.replace(/[^A-Za-zА-Яа-яЁё]/g,''),caps=body.replace(/[^A-ZА-ЯЁ]/g,'');
  if(letters.length>50&&caps.length/letters.length>.35)rvAdd(r,-12,'bad',Lx('Слишком много ЗАГЛАВНЫХ букв','Too many CAPITAL letters'));
  var emo=(body.match(/\p{Extended_Pictographic}/gu)||[]).length;
  if(emo>Math.max(6,n/25))rvAdd(r,-5,'tips',Lx('Много эмодзи для статьи','A lot of emoji for an article'));
  /* повторы и словарь */
  var freq={},lw=words.map(function(w){return w.toLowerCase();});
  lw.forEach(function(w){if(w.length>3&&!RV_STOP[w])freq[w]=(freq[w]||0)+1;});
  var top=Object.keys(freq).sort(function(a,b){return freq[b]-freq[a];})[0];
  if(top&&n>=60&&freq[top]/n>.045&&freq[top]>=5)rvAdd(r,-6,'bad',Lx('Слово «','The word "')+top+Lx('» повторяется ','" repeats ')+freq[top]+Lx(' раз',' times'));
  if(n>=100){var uniq=Object.keys(lw.reduce(function(o,w){o[w]=1;return o;},{})).length/n;if(uniq>.55)rvAdd(r,4,'good',Lx('Богатый словарь','Rich vocabulary'));else if(uniq<.3)rvAdd(r,-6,'bad',Lx('Много одинаковых слов','Lots of repeated words'));}
  var seen={},dup=0;plain.replace(/([.!?…])\s+/g,'$1\n').split(/\n+/).forEach(function(x){x=x.trim().toLowerCase();if(x.length<30)return;seen[x]=(seen[x]||0)+1;if(seen[x]===2)dup++;});
  if(dup>=2)rvAdd(r,-12,'bad',Lx('Похоже, куски текста скопированы несколько раз','Parts of the text seem to be copied several times'));
  /* название, теги, источники */
  if(title.length<5)rvAdd(r,-8,'bad',Lx('Название слишком короткое','The title is too short'));
  else if(title.length>80)rvAdd(r,-4,'tips',Lx('Название длинное, сократи','The title is long, shorten it'));
  else rvAdd(r,3,null);
  if(title.length>6&&title===title.toUpperCase()&&/[A-ZА-ЯЁ]/.test(title))rvAdd(r,-5,'bad',Lx('Название написано капсом','The title is in caps'));
  if(!tags.length)rvAdd(r,-2,'tips',Lx('Добавь теги, чтобы статью легче было найти','Add tags so the article is easier to find'));
  else rvAdd(r,2,null);
  if(/источник|литератур|по данным|https?:\/\/|wikipedia|википеди|sources?:/i.test(body))rvAdd(r,6,'good',Lx('Указаны источники','Sources are given'));
  else if(n>=150)rvAdd(r,0,'tips',Lx('Укажи в конце, откуда взяты факты (## Источники)','List where the facts come from at the end (## Sources)'));
  rvTox(r,title+'\n'+body);rvContacts(r,body);
  return rvFinish(r);
}
/* ---------- приложение или игра из Студии кода ---------- */
function revApp(code,name){
  var r=rvNew('app');code=String(code||'');var lc=code.toLowerCase();
  var game=/<canvas|requestanimationframe|score|очк|счёт|счет|game ?over|игра окончена|level|уровень/i.test(code);
  r.game=game;
  if(code.length<300)rvAdd(r,-20,'bad',Lx('Очень маленькое приложение','A very small app'));
  else if(code.length>2500)rvAdd(r,6,'good',Lx('Большая работа: ','A big piece of work: ')+Math.round(code.length/1000)+Lx(' тыс. символов кода','k characters of code'));
  /* синтаксис: компилируем, но не запускаем */
  var scripts=[],m,re=/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;while((m=re.exec(code)))scripts.push(m[1]);
  var bad=0;scripts.forEach(function(s){try{new Function(s);}catch(e){if(e instanceof SyntaxError){bad++;if(bad===1)rvAdd(r,-30,'bad',Lx('Ошибка в коде: ','Code error: ')+e.message);}}});
  if(scripts.length&&!bad)rvAdd(r,5,'good',Lx('Код без синтаксических ошибок','No syntax errors in the code'));
  if(/<meta[^>]+viewport/i.test(code))rvAdd(r,6,'good',Lx('Подстраивается под телефон','Adapts to phones'));
  else rvAdd(r,-4,'tips',Lx('Добавь <meta name="viewport">, чтобы было удобно на телефоне','Add <meta name="viewport"> for phones'));
  var touch=/touchstart|pointerdown|onclick|addEventListener\(\s*['"]click|<button/i.test(code),keys=/keydown|keyup|keypress/i.test(code);
  if(game){
    if(touch&&keys)rvAdd(r,8,'good',Lx('Управление и с клавиатуры, и касанием','Works with keyboard and touch'));
    else if(keys)rvAdd(r,-6,'bad',Lx('Только клавиатура: на телефоне и планшете не поиграть','Keyboard only: cannot play on a phone or tablet'));
    else if(touch)rvAdd(r,3,'good',Lx('Управление касанием и мышью','Touch and mouse controls'));
    if(/score|очк|счёт|счет|points/i.test(code))rvAdd(r,5,'good',Lx('Есть счёт','Has a score'));
    else rvAdd(r,-2,'tips',Lx('Добавь счёт очков','Add a score'));
    if(/level|уровен|сложност|speed\s*[+*]=|скорост/i.test(code))rvAdd(r,5,'good',Lx('Есть уровни или растущая сложность','Has levels or growing difficulty'));
    else rvAdd(r,0,'tips',Lx('Сделай, чтобы со временем становилось сложнее','Make it harder over time'));
    if(/restart|заново|ещё раз|еще раз|again|рестарт|новая игра|play again/i.test(code))rvAdd(r,4,'good',Lx('Можно начать заново','Can restart'));
    else rvAdd(r,-4,'bad',Lx('Нет кнопки «Играть заново»','No "Play again" button'));
    if(/localstorage/i.test(code))rvAdd(r,3,'good',Lx('Сохраняет рекорд или прогресс','Saves a record or progress'));
  }else if(touch)rvAdd(r,4,'good',Lx('Есть кнопки и действия','Has buttons and actions'));
  if(/audiocontext|new audio\(/i.test(code))rvAdd(r,2,'good',Lx('Есть звук','Has sound'));
  if(/<style|style=/i.test(code))rvAdd(r,3,'good',Lx('Есть своё оформление','Has its own styling'));
  else rvAdd(r,-3,'tips',Lx('Добавь стили, чтобы было красивее','Add styles to make it look nicer'));
  if(/\/\/|\/\*|<!--/.test(code)&&code.length>800)rvAdd(r,2,'good',Lx('В коде есть комментарии','The code has comments'));
  /* что не сработает в песочнице или опасно */
  if(/<(script|img|link|iframe)[^>]+(src|href)=["']https?:/i.test(code))rvAdd(r,-6,'bad',Lx('Грузит файлы из интернета: в песочнице HoroStore они не загрузятся','Loads files from the internet: they will not load in the HoroStore sandbox'));
  if(/\beval\s*\(|new\s+Function\s*\(/.test(code))rvAdd(r,-6,'warn',Lx('Использует eval: так лучше не делать','Uses eval: better avoid it'));
  if(/document\.cookie|top\.location|parent\.location|window\.open\(/.test(code))rvAdd(r,-6,'warn',Lx('Пытается выйти из песочницы (cookie, top, window.open)','Tries to leave the sandbox (cookie, top, window.open)'));
  if(/while\s*\(\s*(true|1)\s*\)/.test(code)&&!/break/.test(code))rvAdd(r,-15,'bad',Lx('Бесконечный цикл while(true): приложение зависнет','Infinite while(true) loop: the app will freeze'));
  var alerts=(code.match(/\balert\s*\(/g)||[]).length;if(alerts>3)rvAdd(r,-4,'tips',Lx('Много alert(): лучше показывать сообщения на странице','Many alert() calls: show messages on the page instead'));
  /* видимый текст: обидные слова и контакты */
  var txt=code.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
  var strs=(code.match(/(['"`])(?:(?!\1)[^\\\n]|\\.){3,}\1/g)||[]).join(' ');
  rvTox(r,(name||'')+' '+txt+' '+strs);rvContacts(r,txt+' '+strs);
  if(name&&name.trim().length<3)rvAdd(r,-3,'tips',Lx('Придумай понятное название','Pick a clear name'));
  return rvFinish(r);
}
/* ---------- видео: смотрим описание и сам файл (длину и размер кадра), а не содержание ---------- */
function rvMeta(url){
  return new Promise(function(ok){
    var v=document.createElement('video'),t=setTimeout(function(){ok(null);},8000);
    v.preload='metadata';v.muted=true;
    v.onloadedmetadata=function(){clearTimeout(t);ok({dur:v.duration||0,w:v.videoWidth,h:v.videoHeight});v.removeAttribute('src');v.load();};
    v.onerror=function(){clearTimeout(t);ok(null);};
    v.src=url;
  });
}
async function revVideo(v){
  var r=rvNew('video');v=v||{};var t=String(v.title||'').trim(),short=v.kind==='short';
  var file=typeof VBUCKET!=='undefined'&&/\/storage\/v1\/object\/public\//.test(v.url||'');
  if(t.length<5)rvAdd(r,-12,'bad',Lx('Название слишком короткое','The title is too short'));
  else if(t.length>70)rvAdd(r,-4,'tips',Lx('Название длинное, сократи до 70 символов','The title is long, keep it under 70 characters'));
  else rvAdd(r,6,'good',Lx('Понятная длина названия','Good title length'));
  if(/^(видео|новое видео|мое видео|моё видео|video|test|тест|проба|без названия|\d+|img_?\d+|vid_?\d+)$/i.test(t))rvAdd(r,-12,'bad',Lx('Название ничего не говорит о видео','The title says nothing about the video'));
  if(t.length>6&&t===t.toUpperCase()&&/[A-ZА-ЯЁ]/.test(t))rvAdd(r,-6,'bad',Lx('Название капсом','Title in caps'));
  if(/([!?])\1{2,}/.test(t))rvAdd(r,-4,'bad',Lx('Много !!! в названии','Too many !!! in the title'));
  if(/кликбейт|шок|не кликай|you won.?t believe|до слёз|до слез/i.test(t))rvAdd(r,-5,'warn',Lx('Похоже на кликбейт','Looks like clickbait'));
  if(v.subject&&v.subject!=='Другое')rvAdd(r,4,'good',Lx('Указан предмет: ','Subject given: ')+v.subject);
  if(v.cover)rvAdd(r,3,'good',Lx('Есть обложка','Has a cover'));
  if(file){
    rvAdd(r,4,'good',Lx('Файл загружен в HoroTube и прошёл проверку кадров при загрузке','The file was uploaded and passed the frame check'));
    var mt=await rvMeta(v.url);
    if(mt){
      var d=Math.round(mt.dur);r.meta=mt;
      if(short&&d>90)rvAdd(r,-10,'bad',Lx('Шортс длиннее 90 секунд','The short is longer than 90 seconds'));
      else if(d&&d<8)rvAdd(r,-8,'bad',Lx('Очень короткое видео: ','A very short video: ')+d+Lx(' с',' s'));
      else if(!short&&d>1200)rvAdd(r,-3,'tips',Lx('Длинное видео (больше 20 минут): можно сократить','A long video (over 20 minutes): could be shorter'));
      else if(d)rvAdd(r,5,'good',Lx('Длина: ','Length: ')+Math.floor(d/60)+':'+String(d%60).padStart(2,'0'));
      var lo=Math.min(mt.w,mt.h);
      if(lo&&lo<360)rvAdd(r,-6,'bad',Lx('Низкое качество: ','Low quality: ')+mt.w+'×'+mt.h);
      else if(lo>=720)rvAdd(r,4,'good',Lx('Хорошее качество: ','Good quality: ')+mt.w+'×'+mt.h);
      if(short&&mt.h>mt.w)rvAdd(r,3,'good',Lx('Вертикальный кадр для шортса','Vertical frame for a short'));
      if(short&&mt.w>mt.h)rvAdd(r,-2,'tips',Lx('Шортсы лучше снимать вертикально','Shorts look better vertical'));
    }else rvAdd(r,-5,'warn',Lx('Не удалось открыть файл видео','Could not open the video file'));
  }else{
    rvAdd(r,0,'warn',Lx('Видео по ссылке: алгоритм не видит содержание, обязательно посмотри его сам','A linked video: the algorithm cannot see it, watch it yourself'));
  }
  rvTox(r,t);rvContacts(r,t);
  r.tips.push(Lx('Алгоритм не смотрит картинку и не слушает звук: решение за тобой','The algorithm does not see the picture or hear the sound: the decision is yours'));
  return rvFinish(r);
}
/* ---------- карточка отзыва ---------- */
function revCard(r,title){
  var c=el('div','rvcard rv'+r.stars);
  var hd=el('div','rvhd');
  hd.append(el('span','rvstars','★'.repeat(r.stars)+'☆'.repeat(5-r.stars)),el('b',null,r.verdict),el('small',null,r.score+'/100'));
  c.append(el('div','rvt','🤖 '+(title||Lx('Автоотзыв','Auto review'))),hd);
  var bar=el('div','rvbar'),f=el('i');f.style.width=r.score+'%';bar.append(f);c.append(bar);
  function list(arr,cls,ic){if(!arr.length)return;var u=el('ul','rvl '+cls);arr.forEach(function(x){u.append(el('li',null,ic+' '+x));});c.append(u);}
  list(r.good,'g','✓');list(r.bad,'b','✗');list(r.warn,'w','⚠');list(r.tips,'t','💡');
  return c;
}
