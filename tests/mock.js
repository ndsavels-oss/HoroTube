/* поддельный Supabase для проверки интерфейса: данные в памяти */
(function(){
  var A='aaaaaaaa-0000-0000-0000-000000000001',B='bbbbbbbb-0000-0000-0000-000000000002';
  var now=function(){return new Date().toISOString();};
  var DB=window.MOCKDB={
    profiles:[{id:A,nick:'anna',name:'Анна',role:'student',premium:false,premium_until:null,tubek:150},{id:B,nick:'boris',name:'Борис',role:'student',premium:true,tubek:5}],
    ht_dm:[{id:1,sender_id:B,recipient_id:A,body:'Привет! Пойдёшь на кружок?',created_at:now(),read_at:null,author_name:'Борис'}],
    ht_dm_blocks:[],ht_chess:[],ht_chess_lobby:[{user_id:B,name:'Борис (@boris)',seen_at:now()}],
    ht_plans:[],ht_app_buys:[],ht_releases:[{id:1,version:'2026.10.20',notes:'• Первая версия через загрузчик',path:'2026.10.20-a.html',size_bytes:700000,revoked:false,created_at:'2026-10-20T10:00:00Z'}],ht_tubek_log:[{user_id:A,source:'chess_ai2',amount:2,created_at:now()}],
    ht_security_log:[{id:1,user_id:B,kind:'profile',detail:'Пытался сам изменить в профиле поле «tubek» на 9999',created_at:now()},{id:2,user_id:B,kind:'cheat_fast',detail:'Слишком частые награды за шахматы (ai3)',created_at:now()}],
    stories:[],videos:[{id:7,title:'Дроби за 5 минут',url:'https://youtu.be/dQw4w9WgXcQ',kind:'video',status:'approved',author_role:'teacher',author_name:'Учитель',author_id:'x',likes:3,views:10,created_at:now()},{id:8,title:'Таблица умножения на 9',url:'https://youtu.be/abcdefghijk',kind:'video',status:'approved',channel_id:3,author_role:'student',author_id:B,author_name:'Борис',likes:5,views:40,created_at:new Date(Date.now()-864e5).toISOString()},{id:9,title:'Задача про поезда',url:'https://youtu.be/abcdefghijz',kind:'video',status:'approved',channel_id:3,author_role:'student',author_id:B,author_name:'Борис',likes:2,views:9,created_at:new Date(Date.now()-3600e3).toISOString()}],comments:[{id:5,video_id:1,body:'Ты тупой нуб, тебя никто не любит',author_id:B,author_name:'Борис',created_at:now()},{id:6,video_id:1,body:'Классное видео!',author_id:B,author_name:'Борис',created_at:now()}],chat:[],announcements:[],reports:[],subscriptions:[{id:1,channel_id:3,user_id:A,created_at:new Date(Date.now()-5*864e5).toISOString()}],channels:[{id:3,owner_id:B,name:'Математика с Борисом',subs:12}],likes:[],confusions:[],reactions:[],video_views:[],ht_mod_notes:[],
    ht_gallery:[],ht_events:[],ht_portfolio:[{user_id:B,about:'Люблю математику и футбол',dream:'Стать инженером',hobbies:['футбол','шахматы'],skills:['монтаж видео'],achievements:[{e:'🏆',t:'Олимпиада по математике',y:'2026'}],color:'green',visibility:'all'}],
    ht_user_apps:[{id:51,author_id:B,name:'Космо-гонка',icon:'🚀',color:'purple',description:'Платная игра Бориса',code:'',status:'published',listed:true,pub_code:'<h1 id=t>Космо-гонка!</h1>',pub_price:10,price:10,installs:2,published_at:'2026-10-24T10:00:00Z'},{id:50,author_id:B,name:'Кликер',icon:'🖱',color:'orange',description:'Жми на кнопку',code:'<button onclick="this.textContent=+this.textContent+1">0</button>',status:'published',listed:true,pub_code:'<h1 id=t>Привет из песочницы</h1><button id=b>+1</button><script>var n=0;Horo.load("n").then(function(v){n=v||0;t.textContent=n;});b.onclick=function(){n++;t.textContent=n;Horo.save("n",n);};try{fetch("https://example.com").catch(function(e){console.log("fetch blocked")});}catch(e){console.log("fetch err")}try{localStorage.setItem("x",1);console.log("LS OK")}catch(e){console.log("LS blocked")}try{console.log("parent "+parent.document.title)}catch(e){console.log("parent blocked")}<\/script>',installs:3,published_at:now()}],
    ht_articles:[{id:70,author_id:B,title:'',body:'',tags:[],status:'published',pub_title:'Как устроены вулканы',pub_body:'Вулкан — это гора, из которой выходит магма.\n\n## Почему вулканы извергаются\nМагма легче окружающих пород и поднимается вверх.\n- лава\n- пепел\n\n## Источники\n- Википедия',pub_tags:['геология'],version:1,views:5,published_at:'2026-10-24T10:00:00Z',updated_at:'2026-10-24T10:00:00Z'}],
    ht_mail:[{id:60,from_id:B,to_id:A,to_admins:false,subject:'Добро пожаловать в Почту',body:'Здесь письма от учителей и администрации.',created_at:now(),read_at:null}]
  };
  window.MOCKFILES={};window.MOCKBLOBS={};
  if(window.MOCK_ADMIN)DB.profiles[0].role='admin';
  var ids=100,log=window.MOCKLOG=[];
  function parseOr(s){
    var groups=[],depth=0,cur='';
    for(var i=0;i<s.length;i++){var c=s[i];if(c==='(')depth++;if(c===')')depth--;if(c===','&&!depth){groups.push(cur);cur='';}else cur+=c;}
    groups.push(cur);
    return groups.map(function(g){
      if(/^and\(/.test(g))return parseOr(g.slice(4,-1)).map(function(x){return x[0];});
      return [g];
    });
  }
  function cond(r,c){var p=c.split('.');var f=p[0],op=p[1],v=p.slice(2).join('.');return op==='eq'?String(r[f])===v:true;}
  function Q(t){this.t=t;this.f=[];this.op='select';this.o=null;this.lim=0;this.one=0;this.head=0;this.cnt=0;}
  Q.prototype.select=function(c,o){if(this.op==='select'||!this.op)this.op='select';this.ret=true;if(o&&o.head)this.head=1;if(o&&o.count)this.cnt=1;return this;};
  ['eq','neq','gt','is','in','lt','gte','contains','match'].forEach(function(k){Q.prototype[k]=function(a,b){this.f.push([k,a,b]);return this;};});
  Q.prototype.or=function(s){var g=parseOr(s);this.f.push(['or',g]);return this;};
  Q.prototype.order=function(c,o){this.o=[c,!(o&&o.ascending===false)];return this;};
  Q.prototype.limit=function(n){this.lim=n;return this;};
  Q.prototype.single=function(){this.one=1;return this;};
  Q.prototype.maybeSingle=function(){this.one=2;return this;};
  Q.prototype.insert=function(r){this.op='insert';this.rows=[].concat(r);return this;};
  Q.prototype.upsert=function(r){this.op='upsert';this.rows=[].concat(r);return this;};
  Q.prototype.update=function(r){this.op='update';this.patch=r;return this;};
  Q.prototype.delete=function(){this.op='delete';return this;};
  Q.prototype.match=function(o){for(var k in o)this.f.push(['eq',k,o[k]]);return this;};
  function test(r,f){
    var k=f[0],a=f[1],b=f[2];
    if(k==='eq')return String(r[a])===String(b);
    if(k==='neq')return String(r[a])!==String(b);
    if(k==='gt')return r[a]>b;
    if(k==='lt')return r[a]<b;
    if(k==='is')return r[a]==b;
    if(k==='in')return b.map(String).indexOf(String(r[a]))>=0;
    if(k==='or')return a.some(function(g){return g.every(function(c){return cond(r,c);});});
    return true;
  }
  Q.prototype.then=function(res,rej){
    var me=this,T=DB[me.t]||(DB[me.t]=[]),out;
    log.push(me.op+' '+me.t);
    var match=function(){return T.filter(function(r){return me.f.every(function(f){return test(r,f);});});};
    if(me.op==='insert'||me.op==='upsert'){
      try{out=me.rows.map(function(r){
        r=Object.assign({},r);
        if(me.t==='ht_chess_lobby'){r.user_id=A;r.name='Анна (@anna)';r.seen_at=now();T=T.filter(function(x){return x.user_id!==A;});DB[me.t]=T;}
        if(me.t==='ht_dm'){r.sender_id=A;r.read_at=null;}
        if(me.t==='ht_files'){r.user_id=A;r.size=r.body!=null?new Blob([r.body]).size:(r.size||0);r.updated_at=now();}
        if(me.t==='ht_group_msgs'){r.sender_id=A;r.author_name='Анна';r.sys=false;}
        if(me.t==='ht_mail'){r.files=r.files||[];}
        if(me.t==='ht_articles'){r.author_id=A;r.status='draft';r.pub_title=null;r.pub_body=null;r.pub_tags=null;r.version=0;r.views=0;r.review_note=null;r.updated_at=now();r.tags=r.tags||[];}
        if(me.t==='videos'&&r.status==='pending'){r.author_id=A;r.author_name='Анна';setTimeout(function(){DB.ht_mail.push({id:++ids,from_id:A,to_id:null,to_admins:true,subject:'🎬 Видео на проверку: «'+r.title+'»',body:'Новое видео ждёт проверки.',item_kind:'video',item_id:r.id,item_title:r.title,files:[],created_at:now(),read_at:null});},0);}
        if(me.t==='ht_chess'){r.created_by=A;r.status='invited';r.moves='';r.ply=0;r.white_name=r.white===A?'Анна':'Борис';r.black_name=r.black===A?'Анна':'Борис';r.updated_at=now();}
        if(me.t==='ht_dm_blocks')r.blocker=A;
        if(me.t==='ht_gallery'||me.t==='ht_events'){r.user_id=A;}
        if(me.t==='ht_gallery'){r.favorite=!!r.favorite;r.deleted_at=null;}
        if(me.t==='ht_user_apps'){r.author_id=A;r.status='draft';r.listed=false;r.pub_code=null;r.installs=0;r.description=r.description||'';}
        if(me.t==='ht_mail'){r.from_id=A;r.read_at=null;if(r.app_id){var ap=DB.ht_user_apps.filter(function(x){return x.id===r.app_id;})[0];r.app_name=ap.name;r.app_icon=ap.icon;r.app_code=ap.code;r.app_price=ap.price||0;r.app_update=!!(ap.listed&&ap.pub_code!=null);if(r.app_update&&ap.code===ap.pub_code&&(ap.price||0)===(ap.pub_price||0))throw {message:'В приложении нет изменений: в HoroStore уже эта версия'};ap.status='review';}}
        if(me.t==='ht_portfolio'){DB.ht_portfolio=DB.ht_portfolio.filter(function(x){return x.user_id!==r.user_id;});T=DB.ht_portfolio;}
        if(r.id==null&&me.t!=='ht_chess_lobby'&&me.t!=='ht_dm_blocks')r.id=++ids;
        if(!r.created_at)r.created_at=now();
        DB[me.t].push(r);return r;
      });}catch(e){if(e&&e.message&&!(e instanceof Error))return Promise.resolve({data:null,error:e}).then(res,rej);throw e;}
    }else if(me.op==='update'){out=match();out.forEach(function(r){Object.assign(r,me.patch,{updated_at:now()});});}
    else if(me.op==='delete'){out=match();DB[me.t]=T.filter(function(r){return out.indexOf(r)<0;});}
    else{
      out=match().slice();
      if(me.o)out.sort(function(x,y){var a=x[me.o[0]],b=y[me.o[0]];return (a>b?1:a<b?-1:0)*(me.o[1]?1:-1);});
      if(me.lim)out=out.slice(0,me.lim);
    }
    out=JSON.parse(JSON.stringify(out));var r={data:out,error:null,count:out.length};
    if(me.head)r.data=null;
    if(me.one){r.data=out[0]||null;if(!out[0]&&me.one===1)r.error={message:'not found'};}
    return Promise.resolve(r).then(res,rej);
  };
  var rpc=function(n,a){
    log.push('rpc '+n);
    var d=null;
    if(n==='ht_dm_threads'){
      var m={};DB.ht_dm.forEach(function(x){if(x.sender_id!==A&&x.recipient_id!==A)return;var p=x.sender_id===A?x.recipient_id:x.sender_id;m[p]=x;});
      d=Object.keys(m).map(function(p){var pr=DB.profiles.filter(function(z){return z.id===p;})[0],x=m[p];
        return {partner_id:p,nick:pr.nick,name:pr.name,role:pr.role,last_body:x.body,last_at:x.created_at,last_from_me:x.sender_id===A,unread:DB.ht_dm.filter(function(z){return z.sender_id===p&&z.recipient_id===A&&!z.read_at;}).length,blocked:false};});
    }else if(n==='ht_dm_read'){DB.ht_dm.forEach(function(x){if(x.recipient_id===A&&x.sender_id===a.partner)x.read_at=now();});}
    else if(n==='ht_find_users'){d=DB.profiles.filter(function(p){return p.id!==A&&(p.nick+p.name).toLowerCase().indexOf(a.q.toLowerCase())>=0;});}
    else if(n==='public_profiles'){d=DB.profiles.filter(function(p){return a.ids.indexOf(p.id)>=0;});}
    else if(n==='top_tubek'){d=[];}
    else if(n==='game_reward'){d=2;}
    else if(n==='ht_chess_reward'){d=3;}
    else if(n==='ht_admin_set_password'){window.PWSET=a;}
    else if(n==='ht_my_friend_code'){d=(a&&a.renew)?'NEWC0DE2':'K7MX4QPA';}
    else if(n==='ht_my_friends'){d=(DB.friends||[]).map(function(id){var p=DB.profiles.filter(function(z){return z.id===id;})[0];return {id:id,nick:p.nick,name:p.name,role:p.role,since:now()};});}
    else if(n==='ht_add_friend'){var c=a.code;if(c==='K7MX4QPA')d={ok:false,error:'Это твой собственный код 🙂'};else if(c!=='B0R1SC0D'&&c!=='BORISQR2')d={ok:false,error:'Такого кода нет. Проверь буквы или попроси друга показать QR ещё раз.'};else{DB.friends=DB.friends||[];var al=DB.friends.indexOf(B)>=0;if(!al){DB.friends.push(B);DB.profiles[0].tubek++;}d={ok:true,already:al,reward:al?0:1,friend:{id:B,nick:'boris',name:'Борис',role:'student'}};}}
    else if(n==='ht_remove_friend'){DB.friends=(DB.friends||[]).filter(function(x){return x!==a.other;});}
    else if(n==='ht_admin_friends'){d=[];}
    else if(n==='ht_portfolio_stats'){d=[{videos:2,likes:7,views:49,friends:1,since:'2026-09-01T10:00:00Z'}];}
    else if(n==='ht_store_apps'){d=DB.ht_user_apps.filter(function(x){return x.listed;}).map(function(x){var p=DB.profiles.filter(function(z){return z.id===x.author_id;})[0];return {id:x.id,name:x.name,icon:x.icon,color:x.color,description:x.description,code:(!x.pub_price||(DB.uown||{})[x.id]||x.author_id===A)?x.pub_code:null,price:x.pub_price||0,owned:!x.pub_price||!!(DB.uown||{})[x.id]||x.author_id===A,author_name:p.name,author_nick:p.nick,installs:x.installs,published_at:x.published_at,version:x.version||1,mine:x.author_id===A};});}
    else if(n==='ht_publish_release'){var id=DB.ht_releases.length+1;DB.ht_releases.unshift({id:id,version:a.p_version,notes:a.p_notes,path:a.p_path,size_bytes:a.p_size,revoked:false,created_at:now()});return Promise.resolve({data:id,error:null});}
    else if(n==='ht_revoke_release'){DB.ht_releases.forEach(function(x){if(x.id===a.p_id)x.revoked=a.p_revoked;});return Promise.resolve({data:true,error:null});}
    else if(n==='ht_buy_app'){var cost={x_sudoku:15,x_2048:10,x_blocks:20,x_pixel:10,x_drums:10,x_mendel:5,x_type:5}[a.item];var pr=DB.profiles[0];if(!cost)return Promise.resolve({data:null,error:{message:'Такого платного приложения нет'}});if(DB.ht_app_buys.some(function(x){return x.app===a.item;}))return Promise.resolve({data:pr.tubek,error:null});if(pr.tubek<cost)return Promise.resolve({data:null,error:{message:'Не хватает Tubek: нужно '+cost+', у тебя '+pr.tubek}});pr.tubek-=cost;DB.ht_app_buys.push({user_id:pr.id,app:a.item,price:cost});DB.ht_tubek_log.unshift({user_id:pr.id,source:'app',ref:a.item,amount:-cost,created_at:now()});return new Promise(function(r){setTimeout(function(){r({data:pr.tubek,error:null});},400);});}
    else if(n==='ht_buy_user_app'){var ap=DB.ht_user_apps.filter(function(x){return x.id===a.app;})[0],pr=DB.profiles[0];DB.uown=DB.uown||{};if(DB.uown[a.app])return Promise.resolve({data:pr.tubek,error:null});if(pr.tubek<ap.pub_price)return Promise.resolve({data:null,error:{message:'Не хватает Tubek'}});pr.tubek-=ap.pub_price;DB.uown[a.app]=1;ap.installs++;DB.ht_tubek_log.unshift({user_id:pr.id,source:'uapp',ref:String(a.app),amount:-ap.pub_price,created_at:now()});return new Promise(function(r){setTimeout(function(){r({data:pr.tubek,error:null});},400);});}
    else if(n==='ht_install_app'){DB.ht_user_apps.forEach(function(x){if(x.id===a.app)x.installs++;});}
    else if(n==='ht_mail_mark'){
      if(a.act==='purge'){DB.ht_mail.forEach(function(x){if(x.from_id===A&&x.from_trash&&(a.m===0||Date.now()-Date.parse(x.from_trash)>30*864e5))x.deleted=1;if(x.to_id===A&&x.to_trash&&(a.m===0||Date.now()-Date.parse(x.to_trash)>30*864e5))x.deleted=1;});}
      DB.ht_mail.forEach(function(x){if(x.id===a.m){if(a.act==='read')x.read_at=now();else if(a.act==='trash'){if(x.from_id===A)x.from_trash=now();else x.to_trash=now();}else if(a.act==='restore'){if(x.from_id===A)x.from_trash=null;else x.to_trash=null;}else if(a.act==='delete')x.deleted=1;}});DB.ht_mail=DB.ht_mail.filter(function(x){return !x.deleted;});}
    else if(n==='ht_group_list'){DB.ht_groups=DB.ht_groups||[];d=DB.ht_groups.filter(function(g){return (DB.ht_group_members||[]).some(function(m){return m.group_id===g.id&&m.user_id===A;});}).map(function(g){var ms=(DB.ht_group_msgs||[]).filter(function(x){return x.group_id===g.id;});var l=ms[ms.length-1]||{};var me=(DB.ht_group_members||[]).filter(function(m){return m.group_id===g.id&&m.user_id===A;})[0];
      return {id:g.id,name:g.name,icon:g.icon,owner_id:g.owner_id,members:(DB.ht_group_members||[]).filter(function(m){return m.group_id===g.id;}).length,last_body:l.body||null,last_at:l.created_at||g.created_at,last_from:l.author_name||null,last_sys:!!l.sys,unread:ms.filter(function(x){return x.id>me.last_read&&x.sender_id!==A&&!x.sys;}).length};});}
    else if(n==='ht_group_create'){DB.ht_groups=DB.ht_groups||[];DB.ht_group_members=DB.ht_group_members||[];DB.ht_group_msgs=DB.ht_group_msgs||[];var gid=++ids;DB.ht_groups.push({id:gid,name:a.p_name,icon:a.p_icon,owner_id:A,created_at:now()});DB.ht_group_members.push({group_id:gid,user_id:A,last_read:0,joined_at:now()});(a.users||[]).forEach(function(u){DB.ht_group_members.push({group_id:gid,user_id:u,last_read:0,joined_at:now()});});DB.ht_group_msgs.push({id:++ids,group_id:gid,body:'Анна создал(а) группу «'+a.p_name+'»',sys:true,created_at:now()});d=gid;}
    else if(n==='ht_group_people'){d=(DB.ht_group_members||[]).filter(function(m){return m.group_id===a.g;}).map(function(m){var p=DB.profiles.filter(function(z){return z.id===m.user_id;})[0]||{};var g=DB.ht_groups.filter(function(z){return z.id===a.g;})[0];return {id:m.user_id,nick:p.nick,name:p.name,role:p.role,owner:g.owner_id===m.user_id,joined_at:m.joined_at};});}
    else if(n==='ht_group_add'){(a.users||[]).forEach(function(u){DB.ht_group_members.push({group_id:a.g,user_id:u,last_read:0,joined_at:now()});});d=(a.users||[]).length;}
    else if(n==='ht_group_remove'){DB.ht_group_members=DB.ht_group_members.filter(function(m){return !(m.group_id===a.g&&m.user_id===a.u);});}
    else if(n==='ht_group_edit'){DB.ht_groups.forEach(function(g){if(g.id===a.g)g.name=a.p_name;});}
    else if(n==='ht_article_submit'){var ar=DB.ht_articles.filter(function(x){return x.id===a.art;})[0];ar.status='review';DB.ht_mail.push({id:++ids,from_id:A,to_id:null,to_admins:true,subject:'📰 Статья на проверку: «'+ar.title+'»',body:'Новая статья для Поиска ждёт проверки.',item_kind:'article',item_id:ar.id,item_title:ar.title,item_body:ar.body,item_tags:ar.tags,files:[],created_at:now(),read_at:null});d=ids;}
    else if(n==='ht_review_article'){var mm=DB.ht_mail.filter(function(x){return x.id===a.mail;})[0];var ar2=DB.ht_articles.filter(function(x){return x.id===mm.item_id;})[0];if(a.ok){ar2.pub_title=mm.item_title;ar2.pub_body=mm.item_body;ar2.pub_tags=mm.item_tags;ar2.status='published';ar2.version++;ar2.published_at=ar2.published_at||now();}else ar2.status='rejected';ar2.review_note=a.note||null;mm.read_at=now();DB.ht_mail.push({id:++ids,from_id:A,to_id:ar2.author_id,to_admins:false,subject:(a.ok?'✅ Статья «':'↩️ Статью «')+mm.item_title+(a.ok?'» опубликована':'» пока не опубликовали'),body:(a.ok?'Админ проверил статью.':'Админ вернул статью.')+(a.note?'\n\nОтзыв: '+a.note:''),files:[],created_at:now(),read_at:null});}
    else if(n==='ht_review_video'){var mv=DB.ht_mail.filter(function(x){return x.id===a.mail;})[0];DB.videos.forEach(function(v){if(v.id===mv.item_id)v.status=a.ok?'approved':'rejected';});mv.read_at=now();window.MOCK_LASTNOTE=a.note;}
    else if(n==='ht_articles_find'){var q=(a.q||'').toLowerCase();d=DB.ht_articles.filter(function(x){if(!x.pub_body)return false;var pr=DB.profiles.filter(function(p){return p.id===x.author_id;})[0]||{};return !q||(x.pub_title+' '+x.pub_body+' '+(x.pub_tags||[]).join(' ')+' '+pr.nick).toLowerCase().indexOf(q)>=0;}).map(function(x){var pr=DB.profiles.filter(function(p){return p.id===x.author_id;})[0]||{};return {id:x.id,title:x.pub_title,excerpt:x.pub_body.replace(/\s+/g,' ').slice(0,220),tags:x.pub_tags||[],author_id:x.author_id,author_name:pr.name,author_nick:pr.nick,views:x.views,published_at:x.published_at,words:x.pub_body.split(/\s+/).length};});}
    else if(n==='ht_article_get'){d=DB.ht_articles.filter(function(x){return x.id===a.art&&x.pub_body;}).map(function(x){var pr=DB.profiles.filter(function(p){return p.id===x.author_id;})[0]||{};x.views++;return {id:x.id,title:x.pub_title,body:x.pub_body,tags:x.pub_tags||[],author_id:x.author_id,author_name:pr.name,author_nick:pr.nick,views:x.views,published_at:x.published_at,version:x.version};});}
    else if(n==='ht_group_read'){var mx=0;(DB.ht_group_msgs||[]).forEach(function(x){if(x.group_id===a.g)mx=Math.max(mx,x.id);});DB.ht_group_members.forEach(function(m){if(m.group_id===a.g&&m.user_id===A)m.last_read=mx;});}
    else if(n==='ht_mail_people'){d=[{id:'cccccccc-0000-0000-0000-000000000003',nick:'teacher',name:'Мария Ивановна',role:'teacher'}];}
    else if(n==='ht_review_app'){var m=DB.ht_mail.filter(function(x){return x.id===a.mail;})[0];var ap=DB.ht_user_apps.filter(function(x){return x.id===m.app_id;})[0];if(a.ok){ap.version=(ap.version||0)+1;ap.pub_price=m.app_price||0;ap.pub_code=m.app_code;ap.listed=true;ap.status='published';ap.published_at=now();}else{ap.status='rejected';ap.review_note=a.note;}DB.ht_mail.push({id:++ids,from_id:A,to_id:ap.author_id,to_admins:false,subject:(a.ok?'✅ «':'↩️ «')+ap.name+(a.ok?'» теперь в HoroStore':'» пока не выпустили'),body:a.note||'',created_at:now(),read_at:null});}
    else if(n==='ht_unlist_app'){DB.ht_user_apps.forEach(function(x){if(x.id===a.app)x.listed=false;});}
    else if(n==='ht_buy_plan'){var cost={games7:30,games30:100,all1:10,all7:50,all30:170}[a.plan+a.days];var pr=DB.profiles[0];if(pr.tubek<cost)return Promise.resolve({data:null,error:{message:'Не хватает Tubek'}});pr.tubek-=cost;var v=new Date(Date.now()+a.days*864e5).toISOString();if(a.plan==='all')pr.premium_until=v;else{DB.ht_plans=[{user_id:A,games_until:v}];}DB.ht_tubek_log.push({user_id:A,source:a.plan+'_'+a.days,amount:-cost,created_at:now()});d=v;}
    return Promise.resolve({data:d,error:null});
  };
  window.supabase={createClient:function(){return {
    from:function(t){return new Q(t);},rpc:rpc,
    auth:{getSession:function(){return Promise.resolve({data:{session:window.MOCK_NOSESS?null:{user:{id:A}}}});},signUp:function(o){window.SIGNUP=o;window.MOCK_NOSESS=false;return Promise.resolve({data:{},error:null});},signInWithPassword:function(){window.MOCK_NOSESS=false;return Promise.resolve({data:{},error:null});},signOut:function(){return Promise.resolve({});},onAuthStateChange:function(){}},
    storage:{from:function(){return {download:function(p){return Promise.resolve(window.MOCKBLOBS[p]?{data:window.MOCKBLOBS[p],error:null}:{data:null,error:{message:'Object not found'}});},
      createSignedUrl:function(p){return Promise.resolve({data:{signedUrl:window.MOCKFILES[p]||null},error:null});},
      upload:function(p,b){if(b&&b.size!=null){window.MOCKFILES[p]=URL.createObjectURL(b);window.MOCKBLOBS[p]=b;}return Promise.resolve({data:{path:p},error:null});},remove:function(ps){(ps||[]).forEach(function(p){delete window.MOCKFILES[p];});return Promise.resolve({});},
      createSignedUrls:function(ps){return Promise.resolve({data:ps.map(function(p){return {path:p,signedUrl:window.MOCKFILES[p]||null};}),error:null});},getPublicUrl:function(p){return {data:{publicUrl:'https://xuqyywongnzuyvqxaimq.supabase.co/storage/v1/object/public/x/'+p}};}};}}
  };}};
  window.MOCK={A:A,B:B};
})();
