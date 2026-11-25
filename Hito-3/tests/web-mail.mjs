import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(pathToFileURL(process.env.AQUILA_PLAYWRIGHT||resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);
const root=resolve(import.meta.dirname,'..');
const app=resolve(root,'dist/app');
const origin='https://aquila-web-test.example';
const reputation=await readFile(resolve(app,'data/reputation.json'),'utf8');
const reported=JSON.parse(reputation).domains[0];
const mime={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',eml:'text/plain',png:'image/png'};
const browser=await chromium.launch({
 executablePath:process.env.AQUILA_CHROMIUM||resolve(root,'../browser-runtime/chromium-1234/chrome-win64/chrome.exe')
});
try {
 const page=await browser.newPage({viewport:{width:393,height:852},serviceWorkers:'block'});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let releaseIntel,releaseExample;
 const intelGate=new Promise(resolve=>{releaseIntel=resolve;});
 const exampleGate=new Promise(resolve=>{releaseExample=resolve;});
 const email='pruebas@example.test';
 const token=verified=>'e30.'+Buffer.from(JSON.stringify({email_verified:verified})).toString('base64url')+'.test';
 let confirmed=false,verificationMessages=0;
 const stored=new Map();
 let phoneGrant=null,phoneFailure=false,phoneTip=null,reviewedPhone=false;
 const cors={'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'authorization, content-type, x-firebase-locale'};
 const handler=async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS'&&['identitytoolkit.googleapis.com','securetoken.googleapis.com','firestore.googleapis.com'].includes(url.hostname))return route.fulfill({status:204,headers:cors});
  if(url.hostname==='identitytoolkit.googleapis.com'){
   if(url.pathname.endsWith(':signInWithPassword'))return route.fulfill({headers:cors,json:{localId:'test',email,idToken:token(false),refreshToken:'refresh',expiresIn:'3600'}});
   if(url.pathname.endsWith(':sendOobCode')){
    verificationMessages++;
    assert.deepEqual(route.request().postDataJSON(),{requestType:'VERIFY_EMAIL',idToken:token(false)});
    return route.fulfill({headers:cors,json:{email}});
   }
  }
  if(url.hostname==='securetoken.googleapis.com')return route.fulfill({headers:cors,json:{id_token:token(confirmed),refresh_token:'refresh',expires_in:'3600'}});
  if(url.hostname==='firestore.googleapis.com'&&url.pathname.endsWith(':runQuery')){
   assert.equal(route.request().headers().authorization,'Bearer '+token(true));
   return route.fulfill({headers:cors,json:[...stored].map(([name,fields])=>({document:{name,fields}}))});
  }
  if(url.hostname==='firestore.googleapis.com'&&url.pathname.endsWith(':commit')){
   assert.equal(route.request().headers().authorization,'Bearer '+token(true));
   const [write]=route.request().postDataJSON().writes;
   if(write.update?.name.includes('/phoneTips/')){
    const [tip,rate]=route.request().postDataJSON().writes;
    assert.ok(!route.request().postData().includes('12025550148'));
    assert.equal(tip.update.fields.origin.stringValue,'caller_id');
    assert.equal(tip.update.fields.status.stringValue,'pending');
    assert.match(rate.update.name,/\/phoneTipLimits\/test$/);
    phoneTip={name:tip.update.name,fields:tip.update.fields};
    return route.fulfill({headers:cors,json:{writeResults:[]}});
   }
   if(write.update?.name.includes('/phoneLookupGrants/')){
    const body=route.request().postData();
    assert.ok(!body.includes('12025550147'));
    assert.match(write.update.fields.key.stringValue,/^[a-f0-9]{64}$/);
    phoneGrant={...write.update.fields,updatedAt:{timestampValue:new Date(Date.now()-10_000).toISOString()},
     windowStartedAt:{timestampValue:new Date(Date.now()-10_000).toISOString()}};
    return route.fulfill({headers:cors,json:{writeResults:[]}});
   }
   if(write.delete)stored.delete(write.delete);
   else{
    const before=stored.get(write.update.name)||{};
    const stamp={timestampValue:new Date().toISOString()};
    stored.set(write.update.name,{...before,...write.update.fields,...Object.fromEntries(write.updateTransforms.map(t=>[t.fieldPath,stamp]))});
   }
   return route.fulfill({headers:cors,json:{writeResults:[]}});
  }
  if(url.hostname==='firestore.googleapis.com'&&route.request().method()==='GET'){
   assert.equal(route.request().headers().authorization,'Bearer '+token(true));
   const name=url.pathname.slice('/v1/'.length);
   if(name===phoneTip?.name)return route.fulfill({headers:cors,json:phoneTip});
   if(name.includes('/phoneLookupGrants/')&&phoneGrant){
    return route.fulfill({headers:cors,json:{name,fields:phoneGrant,updateTime:new Date().toISOString()}});
   }
   if(name.includes('/phoneReports/')){
    if(phoneFailure)return route.fulfill({status:403,headers:cors,json:{error:{status:'PERMISSION_DENIED'}}});
    if(name.endsWith('/6176c00a0067fcdf714d96f386f6ce284f82399572008853b9a833640c2d7cc5')){
     return route.fulfill({headers:cors,json:{name,fields:{status:{stringValue:'demo'}}}});
    }
    if(reviewedPhone)return route.fulfill({headers:cors,json:{name,fields:{status:{stringValue:'reviewed'}}}});
   }
   return stored.has(name)?route.fulfill({headers:cors,json:{name,fields:stored.get(name)}}):route.fulfill({status:404,headers:cors,json:{error:{status:'NOT_FOUND'}}});
  }
  if(url.origin!==origin)return route.abort();
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(file==='data/reputation.json'){await intelGate;return route.fulfill({contentType:mime.json,body:reputation});}
  if(file==='examples/correo-con-senales.eml')await exampleGate;
  try{return await route.fulfill({contentType:mime[file.split('.').at(-1)],body:await readFile(resolve(app,file))});}
  catch{return route.fulfill({status:404,body:''});}
 };
 await page.route('**/*',handler);
 await page.goto(origin+'/?modo=telefono#revisar',{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#type').inputValue(),'telefono');
 assert.equal(await page.locator('#phone-lookup').isVisible(),true);
 await page.locator('#phone-demo').click();
 await page.locator('#phone-query').click();
 await page.locator('#phone-status').filter({hasText:'Inicia sesión'}).waitFor();
 await page.locator('#type').selectOption('correo');
 const body=[
  'From: Biblioteca <avisos@biblioteca.example>',
  'Content-Type: multipart/mixed; boundary="fixture"',
  '',
  '--fixture',
  'Content-Type: text/html',
  '',
  '<a href="https://'+reported+'/revisar">Ver aviso</a>',
  '--fixture',
  'Content-Type: application/octet-stream',
  'Content-Disposition: attachment',
  '',
  'A'.repeat(61_000),
  '--fixture--'
 ].join('\r\n');
 await page.locator('#mail-file').setInputFiles({name:'correo-de-prueba.eml',mimeType:'message/rfc822',buffer:Buffer.from(body)});
 await page.locator('#scan-state').filter({hasText:'Correo cargado localmente'}).waitFor();
 await page.locator('#analyze').click();
 await page.locator('#scan-state').filter({hasText:'Contrastaremos los reportes'}).waitFor();
 assert.equal(await page.locator('#save').isEnabled(),false);
 releaseIntel();
 await page.locator('#result-title').filter({hasText:'Dominio reportado'}).waitFor();
 assert.equal(await page.locator('#save').isEnabled(),true);
 await page.locator('#result-details summary').click();
 assert.match(await page.locator('#coverage-state').innerText(),/1 enlace revisado; 1 parte adjunta omitida/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),393);

 await page.locator('#review-examples summary').click();
 await page.locator('#email-example').click();
 await page.locator('#input').fill('Never share your verification code.');
 const example=page.waitForResponse(response=>response.url().endsWith('correo-con-senales.eml'));
 releaseExample();
 await example;
 await page.locator('#analyze').click();
 await page.locator('#result-title').filter({hasText:'Sin coincidencias'}).waitFor();
 assert.equal(await page.locator('#input').inputValue(),'Never share your verification code.');
 await page.goto(origin+'/#cuenta');
 await page.locator('#email').fill(email);
 await page.locator('#password').fill('clave-ficticia-para-prueba');
 await page.locator('#signin').click();
 await page.locator('#verify-email').waitFor();
 await page.locator('#send-verification').click();
 await page.locator('#auth-state').filter({hasText:'Correo enviado'}).waitFor();
 assert.equal(verificationMessages,1);
 confirmed=true;
 await page.locator('#refresh-verification').click();
 await page.locator('#auth-state').filter({hasText:'Correo verificado'}).waitFor();
 await page.locator('#verify-email').waitFor({state:'hidden'});
 await page.goto(origin+'/#revisar');
 await page.locator('#type').selectOption('telefono');
 await page.locator('#phone-demo').click();
 await page.locator('#phone-query').click();
 await page.locator('#phone-result').filter({hasText:'Caso ficticio de demostración'}).waitFor();
 await page.locator('#input').fill('+1 202 555 0148');
 await page.locator('#phone-query').click();
 await page.locator('#phone-result').filter({hasText:'Sin reporte vigente'}).waitFor();
 phoneFailure=true;
 await page.locator('#phone-query').click();
 await page.locator('#phone-status').filter({hasText:'No tienes acceso'}).waitFor();
 assert.equal(await page.locator('#phone-result').isVisible(),false);
 await page.locator('#phone-tip summary').click();
 await page.locator('#phone-tip-category').selectOption('impersonation');
 await page.locator('#phone-tip-origin').selectOption('caller_id');
 await page.locator('#phone-tip-send').click();
 await page.locator('#phone-tip-status').filter({hasText:'Reporte recibido'}).waitFor();
 await page.locator('#phone-tip-send').click();
 await page.locator('#phone-tip-status').filter({hasText:'pendiente de revisión'}).waitFor();
 phoneFailure=false;
 await page.locator('#phone-query').click();
 await page.locator('#phone-result').filter({hasText:'Sin reporte vigente'}).waitFor();
 reviewedPhone=true;
 await page.locator('#phone-query').click();
 await page.locator('#phone-result').filter({hasText:'Coincidencia con un intento reportado'}).waitFor();
 assert.doesNotMatch(await page.locator('#phone-result').innerText(),/555|fecha|fuente|remitente/i);
 assert.equal(stored.size,0);
 await page.getByRole('link',{name:'Mi historial'}).click();
 await page.locator('#history-state').filter({hasText:'Aún no guardaste revisiones'}).waitFor();
 await page.locator('#history-demo summary').click();
 await page.locator('#history-demo-example').click();
 await page.locator('#analyze').click();
 await page.locator('#save').click();
 await page.locator('#save-state').filter({hasText:'Resumen guardado'}).waitFor();
 await page.getByRole('link',{name:'Mi historial'}).click();
 await page.locator('.history-item').waitFor();
 await page.locator('.history-item textarea').fill('Nota ficticia para la demo');
 await page.getByRole('button',{name:'Guardar cambios'}).click();
 await page.locator('#history-state').filter({hasText:'1 revisiones'}).waitFor();
 assert.equal(await page.locator('.history-item textarea').inputValue(),'Nota ficticia para la demo');
 await page.getByRole('link',{name:'Resumen',exact:true}).click();
 await page.locator('#summary-state').filter({hasText:'1 revisiones'}).waitFor();
 assert.equal(await page.locator('#count-total').innerText(),'1');
 assert.equal(await page.locator('#count-signals').innerText(),'1');
 assert.match(await page.locator('#type-counts').innerText(),/Enlaces\s+1/);
 await page.getByRole('link',{name:'Mi historial',exact:true}).click();
 await page.locator('.history-item').waitFor();
 let log=await page.locator('#history-api-log').innerText();
 for(const label of ['Crear','Consultar lista','Actualizar'])assert.ok(log.includes(label+' · POST'));
 assert.ok(log.includes('HTTP 200'));
 await page.reload();
 await page.locator('.history-item').waitFor();
 assert.equal(await page.locator('.history-item textarea').inputValue(),'Nota ficticia para la demo');
 await page.locator('#history-demo summary').click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Eliminar',exact:true}).click();
 await page.locator('#history-state').filter({hasText:'Aún no guardaste revisiones'}).waitFor();
 log=await page.locator('#history-api-log').innerText();
 for(const label of ['Consultar lista','Borrar'])assert.ok(log.includes(label+' · POST'));
 assert.ok(log.includes('HTTP 200'));
 await page.locator('#history-demo-run').click();
 await page.locator('#history-demo-state').filter({hasText:'Prueba completada'}).waitFor({timeout:12000});
 assert.equal(stored.size,0);
 assert.equal(await page.locator('.history-item').count(),0);
 assert.match(await page.locator('#history-api-log').innerText(),/Consultar registro · GET · HTTP 404/);
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:'Inicio',exact:true}).click();
 await page.locator('#dashboard-state').filter({hasText:'Aún no guardaste'}).waitFor();
 await page.screenshot({path:resolve(root,'test-results/portal-desktop.png'),fullPage:true});
 await page.setViewportSize({width:393,height:852});
 await page.screenshot({path:resolve(root,'test-results/portal-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),393);
 await page.goto(origin+'/?caso=real-1',{waitUntil:'domcontentloaded'});
 await page.locator('#result').waitFor();
 assert.equal(await page.locator('#revisar').isVisible(),true);
 assert.equal(await page.locator('#result').getAttribute('data-level'),'reported');
 const restricted=await browser.newPage({viewport:{width:393,height:852},serviceWorkers:'block'});
 restricted.on('pageerror',error=>errors.push(error.message));
 await restricted.addInitScript(()=>{for(const name of ['getItem','setItem','removeItem'])Storage.prototype[name]=()=>{throw new DOMException('Blocked by policy','SecurityError');};});
 await restricted.route('**/*',handler);
 await restricted.goto(origin,{waitUntil:'domcontentloaded'});
 await restricted.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('Blocked');}}}));
 await restricted.locator('#copy-web-link').click();
 await restricted.locator('#copy-link-state').filter({hasText:'Copia esta dirección: https://aquila-guard-a3ddd.web.app/'}).waitFor();
 await restricted.locator('[data-review-type="correo"]').click();
 assert.equal(await restricted.locator('#type').inputValue(),'correo');
 await restricted.locator('#input').fill('Urgente: confirma tu clave en http://banc0.example');
 await restricted.locator('#analyze').click();
 await restricted.locator('#result').waitFor();
 await restricted.getByRole('link',{name:'Mi cuenta',exact:true}).click();
 await restricted.locator('#email').fill(email);
 await restricted.locator('#password').fill('clave-ficticia-para-prueba');
 await restricted.locator('#signin').click();
 await restricted.locator('#account-state').filter({hasText:'Al recargar tendrás que iniciar sesión de nuevo'}).waitFor();
 await restricted.locator('#refresh-verification').click();
 await restricted.locator('#auth-state').filter({hasText:'Correo verificado'}).waitFor();
 await restricted.getByRole('link',{name:'Mi historial',exact:true}).click();
 await restricted.locator('#history-demo summary').click();
 await restricted.locator('#history-demo-run').click();
 await restricted.locator('#history-demo-state').filter({hasText:'Prueba completada'}).waitFor({timeout:12000});
 assert.equal(stored.size,0);
 await restricted.getByRole('link',{name:'Mi cuenta',exact:true}).click();
 await restricted.locator('#signout').click();
 await restricted.locator('#signin').waitFor();
 assert.equal(await restricted.locator('#count-total').innerText(),'—');
 assert.equal(await restricted.locator('.history-item').count(),0);
 await restricted.locator('.portal-nav a[href="#revisar"]').click();
 assert.equal(await restricted.locator('#input').inputValue(),'');
 assert.equal(await restricted.locator('#result').isVisible(),false);
 assert.equal(await restricted.locator('#result-title').textContent(),'');
 assert.equal(await restricted.locator('#mail-file').inputValue(),'');
 await restricted.locator('#type').selectOption('mensaje');
 await restricted.locator('#input').fill('URGENTE: confirma tu clave para evitar el bloqueo.');
 await restricted.locator('#analyze').click();
 await restricted.locator('#result').waitFor();
 assert.equal(await restricted.locator('#result-title').evaluate(el=>el===document.activeElement),true);
 assert.doesNotMatch(await restricted.locator('#coverage-state').textContent(),/cabeceras|adjunt/i);
 await restricted.locator('.skip').focus();
 await restricted.keyboard.press('Enter');
 assert.equal(new URL(restricted.url()).hash,'#revisar');
 assert.equal(await restricted.locator('#revisar').evaluate(el=>el===document.activeElement),true);
 await restricted.locator('#clear-review').click();
 assert.equal(await restricted.locator('#input').inputValue(),'');
 assert.equal(await restricted.locator('#result').isVisible(),false);
 await restricted.reload();
 await restricted.getByRole('link',{name:'Mi cuenta',exact:true}).click();
 await restricted.locator('#signin').waitFor();
 await restricted.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: correo .eml, consulta telefónica, historial CRUD y almacenamiento bloqueado (Firebase simulado; service workers bloqueados)');
}finally{
 await browser.close();
}
