/* ===== Встроенные приложения HoroStore (25.10): каждое работает в песочнице, как приложения учеников.
   Код приложений лежит в XAPP_CODE (собирается из папки xapps), данные — через Horo.save/load. ===== */
var XAPP_CODE=/*XAPPS*/{};
var XBASE=':root{--bg:#F2F2F7;--card:#fff;--ink:#1c1c1e;--mut:#8e8e93;--acc:#0A84FF;--line:#E5E5EA;color-scheme:light}'+
  'html.dk{--bg:#000;--card:#1C1C1E;--ink:#F2F2F7;--mut:#98989F;--line:#38383A;color-scheme:dark}'+
  'body{background:var(--bg);color:var(--ink);margin:0;padding:16px;-webkit-tap-highlight-color:transparent}'+
  'h1,h2,h3{margin:.3em 0}button,select,input,textarea{font:inherit;color:var(--ink);border-radius:10px;border:1px solid var(--line);background:var(--card);padding:8px 14px}'+
  'button{cursor:pointer;border:0;background:var(--line);transition:transform .12s,filter .12s}button:active{transform:scale(.95)}'+
  'button.p{background:var(--acc);color:#fff;font-weight:600}button.big{font-size:18px;padding:12px 22px}'+
  '.card{background:var(--card);border-radius:16px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}'+
  '.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mut{color:var(--mut)}.c{text-align:center;max-width:720px;margin:0 auto}[hidden]{display:none!important}';
function xappDoc(id){
  var dark=/^(dark|space|night)$/.test(document.documentElement.getAttribute('data-theme')||'');
  return '<style>'+XBASE+'</style><script>var HL='+JSON.stringify(LANG==='en'?'en-GB':'ru-RU')+';function L(r,e){return HL.indexOf("en")===0?e:r;}'+
    (dark?'document.documentElement.classList.add("dk");':'')+'<\/script>'+(XAPP_CODE[id]||'<p>Нет кода</p>');
}
/* id, рус., англ., описание рус., англ., фон, цена (Tubek) или 0, игра */
var XAPPS=[
 ['x_slides','Презентации','Slides','Слайды как в PowerPoint: темы, переходы, показ','Slides like PowerPoint: themes, transitions, presenting','linear-gradient(160deg,#FF8A5B,#D24726)',0],
 ['x_sheets','Таблицы','Sheets','Таблицы как в Excel: формулы, листы, диаграммы','Spreadsheets like Excel: formulas, sheets, charts','linear-gradient(160deg,#3BC47A,#1D6F42)',0],
 ['qr','QR-код','QR Code','Сделай QR-код из ссылки или текста','Make a QR code from a link or text','linear-gradient(160deg,#3A3A3C,#000)',0],
 ['x_conv','Конвертер','Converter','Длина, вес, температура, время и другое','Length, weight, temperature, time and more','linear-gradient(160deg,#FFB340,#FF7A00)',0],
 ['x_metro','Метроном','Metronome','Метроном для музыки: темп и размер','Metronome: tempo and time signature','linear-gradient(160deg,#5E5CE6,#2B2A8C)',0],
 ['x_focus','Фокус','Focus','Таймер «помидор» для уроков и домашки','Pomodoro timer for homework','linear-gradient(160deg,#FF6961,#C9302C)',0],
 ['x_habit','Привычки','Habits','Отмечай полезные привычки каждый день','Track good habits every day','linear-gradient(160deg,#34C759,#0E8A3A)',0],
 ['x_cards','Карточки','Flashcards','Учи слова и формулы по карточкам','Learn words and formulas with flashcards','linear-gradient(160deg,#64D2FF,#0A84FF)',0],
 ['x_snake','Змейка','Snake','Классическая змейка','Classic snake game','linear-gradient(160deg,#30D158,#0B6E2E)',0,1],
 ['x_mines','Сапёр','Minesweeper','Найди все мины','Find all the mines','linear-gradient(160deg,#8E8E93,#3A3A3C)',0,1],
 ['x_ttt','Крестики-нолики','Tic-Tac-Toe','Против друга или компьютера','Against a friend or the computer','linear-gradient(160deg,#FF9F0A,#FF375F)',0,1],
 ['x_15','Пятнашки','15 Puzzle','Расставь плитки по порядку','Put the tiles in order','linear-gradient(160deg,#BF5AF2,#6E2BB8)',0,1],
 ['x_dice','Жребий','Dice & Coin','Кубики, монетка и случайные числа','Dice, coin and random numbers','linear-gradient(160deg,#FFD60A,#FF9F0A)',0],
 ['x_color','Палитра','Palette','Подбирай цвета и палитры','Pick colours and palettes','linear-gradient(160deg,#FF2D55,#AF52DE)',0],
 ['x_react','Реакция','Reaction','Проверь скорость реакции','Test your reaction time','linear-gradient(160deg,#FF453A,#B3261E)',0,1],
 ['x_cipher','Шифры','Ciphers','Шифр Цезаря, Морзе и другие','Caesar, Morse and other ciphers','linear-gradient(160deg,#2C2C2E,#1C3A2B)',0],
 ['x_grade','Средний балл','Grade Average','Посчитай средний балл по предметам','Work out your grade average','linear-gradient(160deg,#5AC8FA,#007AFF)',0],
 ['x_diary','Дневник','Journal','Личный дневник с настроением','Private journal with moods','linear-gradient(160deg,#FFCC80,#E8890C)',0],
 ['x_interval','Интервалы','Interval Timer','Таймер для тренировок','Workout interval timer','linear-gradient(160deg,#FF9500,#FF2D55)',0],
 ['x_sudoku','Судоку','Sudoku','Три уровня, заметки и подсказки','Three levels, notes and hints','linear-gradient(160deg,#6E8BFF,#2F3FBF)',15,1],
 ['x_2048','2048','2048','Соединяй плитки до 2048','Join tiles to reach 2048','linear-gradient(160deg,#EDC850,#F2B179)',10,1],
 ['x_blocks','Блоки','Blocks','Собирай линии из падающих фигур','Clear lines with falling blocks','linear-gradient(160deg,#7B5CFA,#1B1464)',20,1],
 ['x_pixel','Пиксели','Pixel Art','Рисуй пиксель-арт и сохраняй в Фото','Draw pixel art and save it to Photos','linear-gradient(160deg,#FF6B9A,#FFB86B)',10],
 ['x_drums','Ритм','Beat Pad','Барабаны и свой бит','Drum pads and your own beat','linear-gradient(160deg,#1C1C1E,#5E5CE6)',10],
 ['x_mendel','Таблица Менделеева','Periodic Table','Все 118 элементов и викторина','All 118 elements and a quiz','linear-gradient(160deg,#9FE2D8,#2A9D8F)',5],
 ['x_type','Слепая печать','Typing','Тренажёр печати: скорость и точность','Typing trainer: speed and accuracy','linear-gradient(160deg,#A2845E,#5C4425)',5]
];
Object.assign(ICO,{
  x_slides:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/><path d="M7 12l3-3 2 2 4-4" />',
  x_sheets:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 4v16"/>',
  qr:'<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v.1M14.5 20.5h6v-3"/>',
  x_conv:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  x_metro:'<path d="M9 3h6l4 18H5z"/><path d="M12 16 16 6"/>',
  x_focus:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2.5h4"/>',
  x_habit:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 3 3 5.5-6.5"/>',
  x_cards:'<rect x="6" y="3" width="13" height="16" rx="2" transform="rotate(8 12 11)"/><rect x="4" y="5" width="13" height="16" rx="2" fill="#fff" fill-opacity=".25"/>',
  x_snake:'<path d="M4 18c3 0 3-4 6-4s3 4 6 4 3-6 0-8-6-2-6-5 4-2 6-2"/><circle cx="16.5" cy="3" r=".8" fill="#fff"/>',
  x_mines:'<circle cx="12" cy="13" r="6" fill="#fff"/><path d="M12 3v4M12 19v2M4 13H2M22 13h-2M5.5 6.5 7 8M18.5 6.5 17 8"/>',
  x_ttt:'<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  x_15:'<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/>',
  x_dice:'<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="#fff"/><circle cx="15" cy="15" r="1.2" fill="#fff"/><circle cx="12" cy="12" r="1.2" fill="#fff"/>',
  x_color:'<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.6-1.4.4-2.8 1.9-2.8H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10z"/><circle cx="8" cy="11" r="1.4" fill="#fff"/><circle cx="12" cy="7.5" r="1.4" fill="#fff"/>',
  x_react:'<path d="M13 2 5 13.5h6L10 22l9-12h-6z"/>',
  x_cipher:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4" fill="#fff"/>',
  x_grade:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  x_diary:'<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M6 3v18M9.5 8h6M9.5 11.5h6"/>',
  x_interval:'<circle cx="12" cy="13" r="8"/><path d="M12 13V8M12 13l4 2M9 2.5h6"/>',
  x_sudoku:'<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  x_2048:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" font-weight="800" fill="#fff" stroke="none" font-family="Arial">2048</text>',
  x_blocks:'<path d="M4 20h5v-5H4zM9 20h5v-5H9zM9 15h5v-5H9zM14 20h5v-5h-5z" fill="#fff" fill-opacity=".3"/><path d="M12 3h5v5h-5z" fill="#fff"/>',
  x_pixel:'<path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8z" fill="#fff" stroke="none"/>',
  x_drums:'<ellipse cx="12" cy="9" rx="8" ry="3.5"/><path d="M4 9v7c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V9M7 3l4 5M17 3l-4 5"/>',
  x_mendel:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="#fff" fill-opacity=".3"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="#fff" fill-opacity=".3"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M5.5 9V5.5h3"/>',
  x_type:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>'
});
/* добавляем в список приложений перед Админ-центром; название и описание — на текущем языке */
(function(){
  var list=XAPPS.map(function(x){
    var a={id:x[0],bg:x[5],page:x[0]==='qr'?'p-xqr':'p-uapp',store:1,builtin:1,open:function(){runBuiltin(x[0]);}};
    if(x[6])a.price=x[6];if(x[7])a.game=1;
    Object.defineProperty(a,'t',{get:function(){return Lx(x[1],x[2]);},enumerable:true});
    Object.defineProperty(a,'d',{get:function(){return Lx(x[3],x[4]);},enumerable:true});
    return a;
  });
  var at=APPS.findIndex(function(a){return a.id==='admin';});
  APPS.splice.apply(APPS,[at<0?APPS.length:at,0].concat(list));
})();
async function runBuiltin(id){
  var a=appById(id);if(!a)return;
  if(a.price&&!appOwned(a)){if(!ME){osToast(Lx('Войди в аккаунт, чтобы купить приложение','Sign in to buy this app'));return;}if(!await buyApp(a))return;}
  if(id==='qr'){openQr();return;}
  showPage('p-uapp');
  var b=$('uaBody');b.textContent='';sandboxClean();
  b.append(sandboxFrame(xappDoc(id),id,null,true));
  OS.app=id;osRecent(id);osBar();
}
/* ---------- QR-код: родное приложение (библиотека qrcode уже есть на сайте) ---------- */
function openQr(){
  var p=$('p-xqr');
  if(!p){
    p=el('section','main page osapp');p.id='p-xqr';
    var w=el('div','xqr'),inp=el('textarea','xqrin'),cv=el('canvas','xqrcv'),row=el('div','xqrrow'),cols=el('div','xqrcol');
    inp.id='xqrIn';inp.placeholder=Lx('Ссылка или любой текст','A link or any text');inp.maxLength=600;cv.id='xqrCv';
    var C=[['#000000','#FFFFFF'],['#0A3D91','#E8F1FF'],['#6B21A8','#F5EEFF'],['#B91C1C','#FFF1F1'],['#14532D','#ECFDF3']];
    C.forEach(function(c,i){var b=el('button','xqrdot');b.style.background='linear-gradient(135deg,'+c[0]+' 50%,'+c[1]+' 50%)';b.onclick=function(){OS.qrc=i;drawQrX();cols.querySelectorAll('.xqrdot').forEach(function(x,k){x.classList.toggle('on',k===i);});};if(!i)b.classList.add('on');cols.append(b);});
    OS.qrC=C;OS.qrc=0;
    var sv=el('button','xqrbtn',Lx('🌸 Сохранить в Фото','🌸 Save to Photos')),sh=el('button','xqrbtn alt',Lx('📤 Отправить в чат','📤 Send to chat'));
    sv.onclick=async function(){var c=$('xqrCv');if(!$('xqrIn').value.trim())return;c.toBlob(async function(bl){var r=await gallerySaveBlob(bl,'photo',{w:c.width,h:c.height});if(r)osToast(Lx('QR-код сохранён в Фото','QR code saved to Photos'));},'image/jpeg',.95);};
    sh.onclick=function(){var t=$('xqrIn').value.trim();if(!t)return;try{navigator.clipboard.writeText(t);}catch(e){}openApp('msg');osToast(Lx('Текст скопирован — вставь его в чат','Text copied, paste it in a chat'));};
    row.append(sv,sh);
    w.append(el('h2',null,Lx('QR-код','QR Code')),inp,cols,cv,row,el('p','xqrtip',Lx('Наведи камеру телефона на код, чтобы открыть ссылку.','Point a phone camera at the code to open the link.')));
    p.append(w);
    var host=$('p-uapp');host.parentNode.insertBefore(p,host.nextSibling);
    inp.addEventListener('input',drawQrX);inp.value=location.origin+location.pathname;
  }
  showPage('p-xqr');drawQrX();
  OS.app='qr';osRecent('qr');osBar();
}
function drawQrX(){
  var t=$('xqrIn').value.trim(),cv=$('xqrCv'),x=cv.getContext('2d'),c=OS.qrC[OS.qrc||0];
  if(!t){cv.width=cv.height=280;x.fillStyle='#F2F2F7';x.fillRect(0,0,280,280);return;}
  if(qrcode.stringToBytesFuncs&&qrcode.stringToBytesFuncs['UTF-8'])qrcode.stringToBytes=qrcode.stringToBytesFuncs['UTF-8'];
  var q;try{q=qrcode(0,'M');q.addData(t);q.make();}catch(e){osToast(Lx('Текст слишком длинный для QR-кода','Text is too long for a QR code'));return;}
  var n=q.getModuleCount(),s=Math.max(4,Math.floor(560/(n+8)));cv.width=cv.height=s*(n+8);
  x.fillStyle=c[1];x.fillRect(0,0,cv.width,cv.height);x.fillStyle=c[0];
  for(var r=0;r<n;r++)for(var k=0;k<n;k++)if(q.isDark(r,k))x.fillRect((k+4)*s,(r+4)*s,s,s);
}
/* фото из встроенного приложения (Пиксели) → в галерею; png превращаем в jpg на белом фоне */
function xappPhoto(dataUrl){
  if(!ME){osToast(Lx('Войди в аккаунт, чтобы сохранять в Фото','Sign in to save to Photos'));return;}
  var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=im.width;c.height=im.height;var g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0);
    c.toBlob(async function(bl){if(!bl)return;var r=await gallerySaveBlob(bl,'photo',{w:c.width,h:c.height});if(r)osToast(Lx('Сохранено в Фото 🌸','Saved to Photos 🌸'));},'image/jpeg',.95);};
  im.src=dataUrl;
}
