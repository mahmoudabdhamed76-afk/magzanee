const fs=require('fs');const {JSDOM}=require('jsdom');
const BASE=process.env.BASE||'http://127.0.0.1:8099';
const HTML=fs.readFileSync('index.html','utf8');
const errs=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const T=(n,f)=>{try{const r=f();console.log((r?'✅':'❌')+' '+n);if(!r)errs.push('FAIL '+n);}catch(e){console.log('💥 '+n+' → '+e.message);errs.push(n+': '+e.message);}};

function device(name){
  const dom=new JSDOM(HTML,{runScripts:'dangerously',pretendToBeVisual:true,url:BASE+'/'});
  const w=dom.window;
  w.navigator.vibrate=()=>{}; w.scrollTo=()=>{};
  w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.fetch=(u,o)=>globalThis.fetch(String(u).startsWith('http')?u:BASE+u,o);
  let online=true;
  Object.defineProperty(w.navigator,'onLine',{get:()=>online,configurable:true});
  dom.virtualConsole.on('jsdomError',e=>{if(!/Not implemented/.test(e.message))errs.push(name+' JSDOM: '+e.message)});
  return { dom, w, ev:c=>w.eval(c), $:s=>w.document.querySelector(s), setOnline:v=>{online=v} };
}

(async()=>{
  const A=device('A'); await sleep(900);
  T('A: البرنامج قام',()=>A.$('#s-home').innerHTML.length>200);
  T('A: السيرفر متشاف',()=>A.ev('SERVER_OK')===true);

  // تسجيل حساب
  A.ev("openSync()"); await sleep(200);
  A.$('[data-m="register"]').click(); await sleep(60);
  A.$('#syName').value='مخزن قويسنا'; A.$('#syUser').value='mahmoud'; A.$('#syPass').value='secret123';
  A.$('#syGo').click(); await sleep(900);
  T('A: الحساب اتعمل والتوكن موجود',()=>!!A.ev('TOKEN') && A.ev('UNAME')==='مخزن قويسنا');

  // بيانات
  A.ev(`S.items.push({id:'i1',name:'ورق حراري 110mm',cat:'thermal',unit:'ورقة',pack:600,cost:2,min:1000,archived:false});
        S.parties.push({id:'p1',name:'مركز النور',kind:'cli',phone:'0100'});
        S.deals.push({id:'d1',partyId:'p1',itemId:'i1',qty:3000,price:3,paid:9000,date:todayISO(),note:''});
        S.moves.push({id:'m1',type:'in',itemId:'i1',storeId:S.stores[0].id,qty:6000,date:todayISO(),at:Date.now()});
        persist();`);
  await A.ev('syncNow(false)'); await sleep(500);
  T('A: البيانات اترفعت',()=>A.ev('PUSHED')>0);

  // جهاز تاني
  const B=device('B'); await sleep(900);
  B.ev("openSync()"); await sleep(200);
  B.$('#syUser').value='mahmoud'; B.$('#syPass').value='secret123';
  B.$('#syGo').click(); await sleep(1200);
  T('B: دخل بنفس الحساب',()=>!!B.ev('TOKEN'));
  T('B: الأصناف وصلت',()=>B.ev("S.items.length")===1 && B.ev("S.items[0].name")==='ورق حراري 110mm');
  T('B: المخازن وصلت',()=>B.ev("S.stores.length")>=1);
  T('B: الحركات وصلت والرصيد مظبوط',()=>B.ev("balance('i1')")===6000);
  T('B: الطلبيات وصلت',()=>B.ev("S.deals.length")===1 && B.ev("dealRemaining(S.deals[0])")===3000);

  // B بيصرف — A لازم يشوف
  B.ev(`S.moves.push({id:'m2',type:'out',itemId:'i1',storeId:S.stores[0].id,qty:1200,partyId:'p1',dealId:'d1',date:todayISO(),at:Date.now()}); persist();`);
  await B.ev('syncNow(false)'); await sleep(300);
  await A.ev('syncNow(false)'); await sleep(300);
  T('A: شاف تسليم B',()=>A.ev("balance('i1')")===4800 && A.ev("dealRemaining(S.deals[0])")===1800);

  // تعديل: الأحدث يكسب
  A.ev(`item('i1').name='ورق حراري سوني UPP-110HG'; persist();`);
  await A.ev('syncNow(false)'); await sleep(300);
  await B.ev('syncNow(false)'); await sleep(300);
  T('B: التعديل وصل (الأحدث يكسب)',()=>B.ev("item('i1').name")==='ورق حراري سوني UPP-110HG');

  // حذف
  B.ev(`S.moves = S.moves.filter(m=>m.id!=='m2'); persist();`);
  await B.ev('syncNow(false)'); await sleep(300);
  await A.ev('syncNow(false)'); await sleep(300);
  T('A: الحذف انتشر',()=>A.ev("S.moves.some(m=>m.id==='m2')")===false && A.ev("balance('i1')")===6000);

  // أوفلاين ثم رجوع
  A.setOnline(false);
  A.ev(`S.items.push({id:'i2',name:'فيلم جاف 14x17',cat:'film',unit:'علبة',cost:900,min:5,archived:false}); persist();`);
  const before=B.ev('S.items.length');
  await A.ev('syncNow(false)'); await sleep(200);
  await B.ev('syncNow(false)'); await sleep(200);
  T('B: مشافش حاجة والـA أوفلاين',()=>B.ev('S.items.length')===before);
  A.setOnline(true);
  await A.ev('syncNow(false)'); await sleep(300);
  await B.ev('syncNow(false)'); await sleep(300);
  T('B: وصله اللي اتعمل أوفلاين',()=>B.ev('S.items.length')===2);

  // المرفقات
  A.ev(`S.moves.push({id:'m3',type:'out',itemId:'i1',storeId:S.stores[0].id,qty:100,date:todayISO(),at:Date.now(),
        file:{name:'اذن.png',type:'image/png',data:'data:image/png;base64,'+'A'.repeat(4000),size:4040}}); persist();`);
  await A.ev('syncNow(false)'); await sleep(400);
  await B.ev('syncNow(false)'); await sleep(400);
  T('B: المرفق وصل كامل',()=>{const f=JSON.parse(B.ev("JSON.stringify(S.moves.find(m=>m.id==='m3').file||null)"));return f&&f.name==='اذن.png'&&f.data.length>4000;});

  // إعدادات
  A.ev(`S.cfg.biz='مؤسسة الإمداد'; S.cfg.covWarn=21; persist();`);
  await A.ev('syncNow(false)'); await sleep(300);
  await B.ev('syncNow(false)'); await sleep(300);
  T('B: الإعدادات اتزامنت',()=>B.ev("S.cfg.biz")==='مؤسسة الإمداد' && B.ev("S.cfg.covWarn")===21);
  T('المظهر بيفضل محلي لكل جهاز',()=>{A.ev("setTheme('dark')");return B.ev("S.cfg.theme")!=='dark';});

  // باسورد غلط
  const C=device('C'); await sleep(900);
  C.ev("openSync()"); await sleep(200);
  C.$('#syUser').value='mahmoud'; C.$('#syPass').value='wrongpass'; C.$('#syGo').click(); await sleep(600);
  T('C: باسورد غلط مرفوض',()=>!C.ev('TOKEN') && C.$('#syMsg').textContent.length>0);

  // اسم مستخدم محجوز
  C.$('[data-m="register"]').click(); await sleep(60);
  C.$('#syName').value='x'; C.$('#syUser').value='mahmoud'; C.$('#syPass').value='another123';
  C.$('#syGo').click(); await sleep(600);
  T('C: اسم المستخدم محجوز',()=>!C.ev('TOKEN') && C.$('#syMsg').textContent.includes('محجوز'));

  console.log('\n'+(errs.length?('❌ مشاكل:\n'+errs.join('\n')):'🎉 كل اختبارات المزامنة نجحت'));
  process.exit(errs.length?1:0);
})();
