/* Проверка HoroTube в Chromium и WebKit (движок Safari): компьютер и iPhone.
   Supabase подменяется tests/mock.js (данные в памяти), сеть наружу закрыта.
   Запуск: npm i playwright && npx playwright install chromium webkit && node tests/smoke.js */
const {chromium,webkit,devices}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'),SHOTS=path.join(__dirname,'shots');
fs.mkdirSync(SHOTS,{recursive:true});
const only=(process.env.BROWSERS||'chromium,webkit').split(',');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\s+integrity="[^"]+"/g,'');
const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);});
let fails=0;
function check(tag,name,ok,info){console.log((ok?'  ok   ':'  FAIL ')+tag+' '+name+(info?' — '+info:''));if(!ok)fails++;}
async function diag(pg,sel){
  return pg.evaluate(sel=>{
    const o=['html: '+document.documentElement.className,'страница: '+[...document.querySelectorAll('.page.show')].map(x=>x.id).join(',')];
    let e=document.querySelector(sel);
    if(!e)return o.concat('нет '+sel).join(' · ');
    const r=e.getBoundingClientRect();o.push(sel+' '+Math.round(r.x)+','+Math.round(r.y)+' '+Math.round(r.width)+'x'+Math.round(r.height));
    for(;e&&e!==document;e=e.parentElement){const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden'||c.opacity==='0'||e.getBoundingClientRect().width===0){o.push('скрыт из-за: '+e.tagName+'#'+e.id+'.'+String(e.className).replace(/ /g,'.')+' display='+c.display+' vis='+c.visibility+' op='+c.opacity);break;}}
    return o.join(' · ');
  },sel);
}
async function step(tag,name,pg,fn,sel){
  try{await fn();}catch(e){check(tag,name,false,e.message.split('\n')[0]+(sel?' | '+await diag(pg,sel).catch(()=>''):''));return false;}
  return true;
}
async function run(type,dev,tag){
  const br=await (type==='webkit'?webkit:chromium).launch();
  const ctx=await br.newContext(dev);const pg=await ctx.newPage();const errs=[];
  pg.on('pageerror',e=>errs.push(e.message));
  pg.on('dialog',d=>d.accept());
  await pg.route('**/*',r=>{const u=r.request().url();
    if(u.includes('supabase-js'))return r.fulfill({contentType:'application/javascript',body:mock});
    if(u.startsWith('http://127.0.0.1'))return r.continue();
    return r.fulfill({status:404,body:''});});
  await pg.addInitScript('window.MOCK_ADMIN=1');
  await pg.goto('http://127.0.0.1:'+srv.address().port+'/');await pg.waitForTimeout(2500);
  check(tag,'HoroOS запустился',await pg.evaluate(()=>document.documentElement.classList.contains('os')));
  check(tag,'нет красной плашки',!(await pg.evaluate(()=>/HoroTube не запустился/.test(document.body.innerText))));
  await pg.screenshot({path:path.join(SHOTS,tag+'-home.png')});
  const apps=await pg.evaluate(()=>APPS.filter(a=>OS.inst.includes(a.id)).map(a=>a.id));
  for(const id of apps){
    const before=errs.length;
    await pg.evaluate(id=>{try{openApp(id);}catch(e){window.__e=String(e);}},id);await pg.waitForTimeout(500);
    const e=await pg.evaluate(()=>{const x=window.__e;window.__e=null;return x;});
    if(e||errs.length>before)check(tag,'приложение '+id,false,e||errs.slice(before).join(' | '));
    await pg.evaluate(()=>{try{document.querySelectorAll('.ovl.show').forEach(o=>o.classList.remove('show'));document.querySelectorAll('.ovl.os2').forEach(o=>o.remove());if(window.gfsExit)gfsExit();osExit&&osExit();}catch(e){}});
  }
  check(tag,'открыто приложений: '+apps.length,apps.length>10);
  /* Поиск: портфолио по нику и статьи */
  await pg.evaluate(()=>openApp('search'));await pg.waitForTimeout(800);
  if(await step(tag,'поле Поиска',pg,()=>pg.fill('.srin','boris',{timeout:5000}),'.srin')){
    await pg.press('.srin','Enter');await pg.waitForTimeout(1500);
    check(tag,'карточка портфолио в Поиске',/Борис/.test(await pg.textContent('.srperson').catch(()=>'')));
    await pg.fill('.srin','@boris');await pg.press('.srin','Enter');await pg.waitForTimeout(1200);
    check(tag,'статья ученика в Поиске',/вулканы/.test(await pg.textContent('.srhtbox').catch(()=>'')));
  }
  await pg.screenshot({path:path.join(SHOTS,tag+'-search.png')});
  /* Документы */
  await pg.evaluate(()=>openApp('docs'));await pg.waitForTimeout(500);
  await step(tag,'шаблон Документов',pg,()=>pg.click('.dctpl >> nth=2',{timeout:5000}),'.dctpl');await pg.waitForTimeout(600);
  check(tag,'редактор Документов',await pg.evaluate(()=>!!document.querySelector('.dcpage[contenteditable]')));
  await pg.screenshot({path:path.join(SHOTS,tag+'-docs.png')});
  /* шахматы: цвет пешек (Safari) */
  const chess=await pg.evaluate(()=>typeof GLY!=='undefined'&&GLY.p==='♟︎');
  check(tag,'пешки рисуются текстом, не эмодзи',chess);
  check(tag,'ошибок JavaScript нет',errs.length===0,errs.slice(0,5).join(' | '));
  await br.close();
}
srv.listen(0,'127.0.0.1',async()=>{
  try{
    for(const type of only){
      await run(type,{viewport:{width:1280,height:860}},type+'-desktop');
      await run(type,devices['iPhone 13'],type+'-iphone');
    }
  }catch(e){console.log('  FAIL '+e.message);fails++;}
  srv.close();
  console.log(fails?'\n'+fails+' проверок не прошло':'\nВсё прошло');
  process.exit(fails?1:0);
});
