import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const config={projectId:'demo-aquila-guard',apiKey:'public-test-key-1234',testEmulators:true};
async function client(responder){const map=new Map(),calls=[];const store={get:async k=>map.get(k),set:async(k,v)=>map.set(k,v),remove:async k=>map.delete(k)};const ctx=vm.createContext({fetch,AbortController,URLSearchParams,setTimeout,clearTimeout,atob,crypto,TextEncoder});vm.runInContext(await readFile(new URL('../shared/cloud.js',import.meta.url),'utf8'),ctx);const c=ctx.AquilaCloud.create(config,store,async(url,opts)=>{calls.push({url,opts});return responder(url,opts);});return {c,calls,map,ctx};}
const token=verified=>'e30.'+Buffer.from(JSON.stringify({email_verified:verified})).toString('base64url')+'.test';
const auth=(verified=true)=>Response.json({localId:'owner',email:'owner@example.test',idToken:token(verified),refreshToken:'refresh',expiresIn:'3600'});
test('consulta internacional exacta, sin transmitir el número ni guardar en historial',async()=>{
 const {c,calls,ctx}=await client((url)=>{
  if(url.includes('signInWithPassword'))return auth();
  if(url.includes('phoneLookupGrants'))return Response.json({error:{status:'NOT_FOUND'}},{status:404});
  if(url.endsWith(':commit'))return Response.json({writeResults:[]});
  return Response.json({name:url,fields:{status:{stringValue:'demo'}}});
 });
 const key=await ctx.AquilaCloud.phoneReportKey('+1 (202) 555-0147');
 assert.equal(await ctx.AquilaCloud.phoneReportKey('00 1 202 555 0147'),key);
 await assert.rejects(c.lookupPhoneReport('2025550147'),/código internacional/);
 await assert.rejects(c.lookupPhoneReport('+12025550147'),/Inicia sesión/);
 await c.signIn('owner@example.test','password123');
 assert.equal(JSON.stringify(await c.lookupPhoneReport('+12025550147')),'{"status":"demo"}');
 assert.ok(calls.at(-1).url.endsWith('/phoneReports/'+key));
 const write=JSON.parse(calls.at(-2).opts.body).writes[0];
 assert.equal(write.update.fields.key.stringValue,key);
 assert.deepEqual(write.updateTransforms.map(x=>x.fieldPath),['updatedAt','windowStartedAt']);
 assert.ok(!JSON.stringify(calls).includes('12025550147'));
 assert.ok(calls.every(x=>!x.url.includes('/analyses')));
});
test('teléfonos requiere correo verificado y maneja falta de ficha distinta de error de red',async()=>{
 let emailVerified=false,reportStatus=404;
 const {c,calls}=await client(url=>{
  if(url.includes('signInWithPassword'))return auth(emailVerified);
  if(url.includes('phoneLookupGrants'))return Response.json({error:{status:'NOT_FOUND'}},{status:404});
  if(url.endsWith(':commit'))return Response.json({writeResults:[]});
  if(reportStatus===404)return Response.json({error:{status:'NOT_FOUND'}},{status:404});
  throw new TypeError('offline');
 });
 await c.signIn('owner@example.test','password123');
 await assert.rejects(c.lookupPhoneReport('+12025550147'),/Verifica tu correo/);
 assert.equal(calls.length,1);
 emailVerified=true;await c.signIn('owner@example.test','password123');
 assert.equal(await c.lookupPhoneReport('+12025550147'),null);
 reportStatus=0;
 await assert.rejects(c.lookupPhoneReport('+12025550147'),/conexión/);
});
test('reporte telefónico privado con alta atómica, deduplicación y límites',async()=>{
 let saved=null,limited=false,verified=true;
 const {c,calls}=await client((url,opts)=>{
  if(url.includes('signInWithPassword'))return auth(verified);
  if(url.includes('/phoneTips/'))return saved?Response.json(saved):Response.json({error:{status:'NOT_FOUND'}},{status:404});
  if(url.includes('/phoneTipLimits/'))return limited?
   Response.json({fields:{updatedAt:{timestampValue:new Date().toISOString()}}}):
   Response.json({error:{status:'NOT_FOUND'}},{status:404});
  const [tip,rate]=JSON.parse(opts.body).writes;
  assert.match(tip.update.name,/\/users\/owner\/phoneTips\/[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(tip.update.fields,'number'),false);
  assert.equal(tip.update.fields.status.stringValue,'pending');
  assert.equal(tip.update.fields.origin.stringValue,'caller_id');
  assert.equal(rate.update.fields.key.stringValue,tip.update.name.split('/').at(-1));
  assert.equal(rate.update.name.endsWith('/phoneTipLimits/owner'),true);
  assert.equal(rate.updateTransforms[0].fieldPath,'updatedAt');
  assert.equal(tip.updateTransforms[0].fieldPath,'createdAt');
  saved={name:tip.update.name,fields:tip.update.fields};
  return Response.json({writeResults:[]});
 });
 await assert.rejects(c.submitPhoneTip('+12025550148','impersonation','caller_id'),/Inicia sesión/);
 await c.signIn('owner@example.test','password123');
 await assert.rejects(c.submitPhoneTip('+12025550148','fraude confirmado','caller_id'),/Elige el tipo/);
 assert.equal((await c.submitPhoneTip('+1 202 555 0148','impersonation','caller_id')).existing,false);
 saved.fields.status.stringValue='approved';
 assert.equal((await c.submitPhoneTip('0012025550148','impersonation','caller_id')).status,'approved');
 saved=null;limited=true;
 await assert.rejects(c.submitPhoneTip('+12025550149','smishing','sms_sender'),/diez minutos/);
 verified=false;await c.signIn('owner@example.test','password123');
 await assert.rejects(c.submitPhoneTip('+12025550149','smishing','sms_sender'),/Verifica tu correo/);
 assert.equal(calls.filter(call=>call.url.endsWith(':commit')).length,1);
 assert.ok(calls.every(call=>!call.url.includes('/phoneReports/')&&!call.url.includes('/analyses/')));
 assert.ok(!JSON.stringify(calls).includes('12025550148'));
});
test('configuración pendiente deja historial cerrado',async()=>{const {ctx}=await client(auth);const c=ctx.AquilaCloud.create({projectId:'aquila-guard-a3ddd',apiKey:''},{get:async()=>null});assert.equal(c.configured,false);await assert.rejects(c.list(),/todavía/);});
test('errores de login y caídas de red tienen mensajes útiles',async()=>{let mode='login';const {c}=await client(()=>{if(mode==='network')throw new TypeError('fetch failed');return Response.json({error:{message:'INVALID_LOGIN_CREDENTIALS'}},{status:400});});await assert.rejects(c.signIn('x@example.test','password123'),/no coinciden/);mode='network';await assert.rejects(c.signIn('x@example.test','password123'),/conexión/);});
test('sesión no conserva la contraseña; guardar usa token y fecha de servidor',async()=>{const {c,calls,map}=await client(url=>url.includes('accounts:')?auth():Response.json({writeResults:[]}));await c.signIn('owner@example.test','NoGuardar123');assert.ok(!JSON.stringify([...map.values()]).includes('NoGuardar123'));await c.save('uuid',{source:'app',hostname:'example.com'});const req=calls.at(-1);assert.equal(req.opts.headers.Authorization,'Bearer '+token(true));const body=JSON.parse(req.opts.body);assert.equal(body.writes[0].currentDocument.exists,false);assert.equal(body.writes[0].updateTransforms[0].setToServerValue,'REQUEST_TIME');await c.signOut();assert.equal(await c.publicSession(),null);await assert.rejects(c.list(),/Inicia sesión/);});
test('múltiples solicitudes renuevan una vez y no reviven la sesión cerrada',async()=>{let refreshCount=0,release;const {c,map}=await client(url=>{if(url.includes('accounts:'))return auth();if(url.includes('securetoken')){refreshCount++;return new Promise(r=>release=()=>r(Response.json({id_token:'fresh',refresh_token:'fresh-refresh',expires_in:'3600'})));}return Response.json([]);});await c.signIn('owner@example.test','password123');map.get('aquila-cloud-session').expiresAt=0;const a=c.list(),b=c.list();await new Promise(r=>setTimeout(r,10));await c.signOut();release();await assert.rejects(a,/cerró/);await assert.rejects(b,/cerró/);assert.equal(refreshCount,1);assert.equal(await c.publicSession(),null);});
test('reintento de creación duplicada es idempotente y notas se validan',async()=>{const {c}=await client(url=>url.includes('accounts:')?auth():Response.json({error:{status:'ALREADY_EXISTS'}},{status:409}));await c.signIn('owner@example.test','password123');assert.equal(await c.save('uuid',{}),'uuid');await assert.rejects(c.update('uuid',true,'x'.repeat(301)),/300/);await assert.rejects(c.remove('../otro'),/Identificador/);});

test('bloquea historial sin verificación, solicita un correo y actualiza el estado',async()=>{
 const {c,calls}=await client((url,opts)=>{
  if(url.includes('signInWithPassword'))return auth(false);
  if(url.includes('sendOobCode')){assert.deepEqual(JSON.parse(opts.body),{requestType:'VERIFY_EMAIL',idToken:token(false)});return Response.json({email:'owner@example.test'});}
  if(url.includes('securetoken'))return Response.json({id_token:token(true),refresh_token:'renewed',expires_in:'3600'});
  return Response.json([]);
 });
 assert.equal((await c.signIn('owner@example.test','password123')).verified,false);
 await assert.rejects(c.list(),/Verifica tu correo/);
 assert.equal(calls.length,1);
 await c.sendVerification();
 await assert.rejects(c.sendVerification(),/un minuto/);
 assert.equal((await c.refreshVerification()).verified,true);
 assert.equal((await c.list()).length,0);
});

test('reutiliza la misma consulta de historial si el cliente pide varias a la vez',async()=>{
 let queryCount=0,finish;
 const {c}=await client((url,options)=>{
  if(url.includes('signInWithPassword'))return auth();
  assert.equal(options.headers.Authorization,'Bearer '+token(true));
  queryCount++;return new Promise(resolve=>{finish=()=>resolve(Response.json([]));});
 });
 await c.signIn('owner@example.test','password123');
 const pending=Promise.all([c.list(),c.list(),c.list()]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(queryCount,1);finish();
 for(const list of await pending)assert.equal(list.length,0);
});
test('cambiar de cuenta permite renovar la nueva sesión mientras termina la anterior',async()=>{
 let finishOld;
 const {c}=await client((url,options)=>{
  if(url.includes('signInWithPassword')){
   const {email}=JSON.parse(options.body);
   return Response.json({localId:email==='owner@example.test'?'owner':'guest',email,idToken:token(false),refreshToken:email,expiresIn:'3600'});
  }
  const refreshToken=new URLSearchParams(options.body).get('refresh_token');
  const refreshed=()=>Response.json({id_token:token(true),refresh_token:refreshToken,expires_in:'3600'});
  if(refreshToken==='owner@example.test')return new Promise(resolve=>{finishOld=()=>resolve(refreshed());});
  return refreshed();
 });
 await c.signIn('owner@example.test','password123');
 const pending=assert.rejects(c.refreshVerification(),/La sesión se cerró/);
 await new Promise(resolve=>setImmediate(resolve));
 try{
  await c.signOut();
  await c.signIn('guest@example.test','password123');
  assert.equal((await c.refreshVerification()).verified,true);
 }finally{finishOld();await pending;}
 assert.equal((await c.publicSession()).uid,'guest');
});
test('la demostración expone solo la operación y el estado HTTP recibido',async()=>{
 const {ctx}=await client(auth),store=new Map(),observed=[];
 const cloud=ctx.AquilaCloud.create(config,{
  get:async key=>store.get(key),set:async(key,value)=>store.set(key,value),remove:async key=>store.delete(key)
 },async url=>url.includes('signInWithPassword')?auth():url.endsWith(':runQuery')?Response.json([]):Response.json({writeResults:[]}),
 (operation,status)=>observed.push([operation,status]));
 await cloud.signIn('owner@example.test','NoCompartir123');
 await cloud.save('sample',{source:'app',hostname:'example.com'});
 await cloud.list();
 await cloud.update('sample',true,'Revisión ficticia');
 await cloud.remove('sample');
 assert.deepEqual(observed,[['create',200],['list',200],['update',200],['delete',200]]);
 assert.ok(!JSON.stringify(observed).includes('NoCompartir'));
});
test('lectura por ID distingue un registro existente de un borrado',async()=>{
 let exists=true;
 const {c}=await client(url=>{
  if(url.includes('signInWithPassword'))return auth();
  return exists?Response.json({name:'projects/demo/users/owner/analyses/sample',fields:{note:{stringValue:'Ficticio'}}}):Response.json({error:{status:'NOT_FOUND'}},{status:404});
 });
 await c.signIn('owner@example.test','password123');
 assert.equal((await c.get('sample')).note,'Ficticio');
 exists=false;
 assert.equal(await c.get('sample'),null);
 await assert.rejects(c.get('../other'),/Identificador/);
});
