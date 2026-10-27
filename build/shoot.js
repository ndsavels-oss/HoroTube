/* ===== HoroBlast: онлайн-шутер (вид сверху). Онлайн — через Supabase Realtime (broadcast + presence),
   без записей в базу. Каждый игрок сам считает попадания по себе и сообщает, кто его сбил.
   Tubek за победы не даём: результат считает браузер, его можно подделать. ===== */
var SH={W:1600,H:1000,on:false,me:null,others:{},bul:[],fx:[],packs:[],ch:null,room:null,bots:[],mode:null,keys:{},mouse:{x:0,y:0,down:false},last:0,sendT:0,out:[],feed:[]};
var SH_WALLS=[[300,200,220,40],[1080,200,220,40],[300,760,220,40],[1080,760,220,40],[740,420,120,160],[140,440,40,120],[1420,440,40,120],[560,560,40,140],[1000,300,40,140]];
var SH_PACKS=[[800,120],[800,880],[90,90],[1510,910]];
var SH_COL=['#FF453A','#0A84FF','#30D158','#FFD60A','#BF5AF2','#FF9F0A','#64D2FF','#FF375F'];
var SH_MAX=6,SH_RATE=100,SH_SPEED=260,SH_BSPEED=820,SH_DMG=20,SH_FIRE=160;
function shWallHit(x,y,r){for(var i=0;i<SH_WALLS.length;i++){var w=SH_WALLS[i];var cx=Math.max(w[0],Math.min(x,w[0]+w[2])),cy=Math.max(w[1],Math.min(y,w[1]+w[3]));if((x-cx)*(x-cx)+(y-cy)*(y-cy)<r*r)return true;}return x<r||y<r||x>SH.W-r||y>SH.H-r;}
function shSpawn(p){for(var k=0;k<40;k++){var x=80+Math.random()*(SH.W-160),y=80+Math.random()*(SH.H-160);if(!shWallHit(x,y,30)){p.x=x;p.y=y;break;}}p.hp=100;p.dead=false;p.inv=Date.now()+1500;}
function shNewMe(){var nick=(ME&&(ME.nick||ME.name))||Lx('Игрок','Player');var c=SH_COL[Math.floor(Math.random()*SH_COL.length)];var p={id:(ME&&ME.id)||'me',nick:String(nick).slice(0,14),col:c,a:0,k:0,d:0,lastShot:0};shSpawn(p);return p;}
/* ---------- страница и лобби ---------- */
function openShoot(){
  var p=$('p-shoot');
  if(!p){p=el('section','main page osapp');p.id='p-shoot';
    p.innerHTML='<div class="shwrap"><canvas id="shCv"></canvas>'+
      '<div class="shhud" id="shHud"><div class="shhp"><i id="shHp"></i></div><b id="shKd"></b><div class="shroom" id="shRoom"></div><button class="shx" id="shLeave">✕</button></div>'+
      '<div class="shboard" id="shBoard"></div><div class="shfeed" id="shFeed"></div><div class="shdead" id="shDead" hidden></div>'+
      '<div class="shjoy l" id="shJl"><i></i></div><div class="shjoy r" id="shJr"><i></i></div>'+
      '<div class="shlobby" id="shLobby"></div></div>';
    var host=$('p-uapp');host.parentNode.insertBefore(p,host.nextSibling);
    shInput();
    $('shLeave').onclick=function(){shStop();shLobby();};
  }
  showPage('p-shoot');OS.app='shoot';osRecent('shoot');osBar();
  if(!SH.on)shLobby();
}
function shLobby(){
  var L=$('shLobby');L.hidden=false;L.textContent='';$('shHud').style.visibility='hidden';
  var c=el('div','shcard');
  c.append(el('div','shlogo','💥'),el('h2',null,'HoroBlast'),el('p','shsub',Lx('Онлайн-шутер для HoroTube. До '+SH_MAX+' игроков в комнате.','Online shooter for HoroTube. Up to '+SH_MAX+' players per room.')));
  var q=el('button','shbtn go',Lx('🌐 Общая арена','🌐 Public arena'));q.onclick=function(){shStart('online','arena');};
  var row=el('div','shrow'),inp=el('input','shin');inp.placeholder=Lx('Код комнаты','Room code');inp.maxLength=6;inp.autocapitalize='characters';
  var j=el('button','shbtn',Lx('Войти','Join'));j.onclick=function(){var v=inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(v.length<3){osToast(Lx('Код — от 3 букв или цифр','Code: at least 3 letters or digits'));return;}shStart('online',v);};
  row.append(inp,j);
  var n=el('button','shbtn',Lx('➕ Своя комната с другом','➕ Private room with a friend'));n.onclick=function(){var s='';for(var i=0;i<4;i++)s+='ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*31)];shStart('online',s);};
  var b=el('button','shbtn alt',Lx('🤖 Тренировка с ботами','🤖 Practice with bots'));b.onclick=function(){shStart('bots');};
  c.append(q,n,row,b,el('p','shtip',('ontouchstart' in window)?Lx('Левый джойстик — бег, правый — прицел и огонь.','Left stick moves, right stick aims and fires.'):Lx('WASD — бег, мышь — прицел, клик — огонь.','WASD to move, mouse to aim, click to fire.')));
  if(!ME)c.append(el('p','shtip warn',Lx('Для онлайна нужно войти в аккаунт.','Sign in to play online.')));
  L.append(c);
}
