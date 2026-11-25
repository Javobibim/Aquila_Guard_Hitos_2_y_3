import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(pathToFileURL(process.env.AQUILA_PLAYWRIGHT||resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);
const root=resolve(import.meta.dirname,'..');
const executablePath=process.env.AQUILA_CHROMIUM||resolve(root,'../browser-runtime/chromium-1234/chrome-win64/chrome.exe');
const work=await mkdtemp(join(root,'tmp/desktop-messages-'));
const extension=join(work,'extension');
await cp(join(root,'dist/extension'),extension,{recursive:true});
const manifestPath=join(extension,'manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
// Synthetic browser fixtures cannot click the toolbar. Grant the two fixture origins in this test copy only.
manifest.host_permissions.push('https://mail.google.com/*','https://messages.google.com/*');
await writeFile(manifestPath,JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(join(work,'profile'),{executablePath,headless:true,
 args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const page=context.pages()[0]||await context.newPage();
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const report=JSON.parse(await readFile(join(root,'data/reputation.json'),'utf8')).domains[0];
 const gmail='https://mail.google.com/mail/u/0/';
 const messages='https://messages.google.com/web/conversations/3';
 const directory='https://aquila-guard-a3ddd.web.app/?modo=telefono#revisar';
 const capturedRequests=[];
 context.on('request',request=>capturedRequests.push(request.url()));
 await context.route('https://**/*',async route=>{
  const url=route.request().url().split('#')[0];
  const html=url===gmail?
   `<div role="main"><div class="a3s" hidden>UNRELATED_PRIVATE_MESSAGE</div>
   <div class="a3s"><p>Tu cuenta está bloqueada. Ingresa tu clave.</p>
   <a href="https://${report}/test">www.bancoestado.cl</a>
   <blockquote class="gmail_quote">QUOTED_PRIVATE_MESSAGE</blockquote></div></div>`:
   url===messages?`<mws-conversation-container style="display:block">
   <mws-message-wrapper style="display:block" is-incoming="true"><mws-text-message-part>OLD_PRIVATE_SMS</mws-text-message-part></mws-message-wrapper>
   <mws-message-wrapper style="display:block" is-incoming="true"><mws-text-message-part>Ingresa tu clave inmediatamente en https://bancoestado.cl.acceso.example/verificar</mws-text-message-part></mws-message-wrapper>
   </mws-conversation-container>`:
   url===directory.split('#')[0]?'<main>Directorio de prueba</main>':null;
  if(html)await route.fulfill({contentType:'text/html',body:html});
  else await route.abort();
 });
 async function inject(url){
  await page.goto(url);
  await page.bringToFront();
  return worker.evaluate(async address=>{
   const [tab]=await chrome.tabs.query({url:address});
   await chrome.scripting.executeScript({target:{tabId:tab.id},files:['message-snapshot.js','message-watch.js']});
   return tab.id;
  },url);
 }
 async function capture(id){
  return worker.evaluate(async tabId=>(await chrome.scripting.executeScript({
   target:{tabId},func:()=>globalThis.AquilaMessageSnapshot.capture()
  }))[0].result,id);
 }
 const gmailTab=await inject(gmail);
 const email=await capture(gmailTab);
 assert.equal(email.type,'correo');
 assert.match(email.input,new RegExp(report.replace(/\./g,'\\.')));
 assert.doesNotMatch(email.input,/PRIVATE_MESSAGE/);
 const inspected=await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>
  chrome.runtime.sendMessage({type:'aquila-analyze-visible-message',snapshot:globalThis.AquilaMessageSnapshot.capture()})
 }),gmailTab);
 assert.equal(inspected[0].result.data.classification,'reported');
 assert.ok(inspected[0].result.data.findings.some(item=>item.id==='hidden-link'));
 await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'aquila-message-start'}),gmailTab);
 await page.locator('html > div').waitFor({state:'visible'});
 await page.locator('.a3s:visible').evaluate(node=>{node.textContent='Reunión a las diez.';});
 await page.locator('html > div').waitFor({state:'detached'});
 await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'aquila-message-stop'}),gmailTab);
 await page.locator('.a3s:visible').evaluate(node=>{node.textContent='Tu cuenta está bloqueada. Ingresa tu clave.';});
 await page.waitForTimeout(900);
 assert.equal(await page.locator('html > div').count(),0);
 const smsTab=await inject(messages);
 const sms=await capture(smsTab);
 assert.equal(sms.type,'mensaje');
 assert.doesNotMatch(sms.input,/OLD_PRIVATE_SMS/);
 await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'aquila-message-start'}),smsTab);
 await page.locator('html > div').waitFor({state:'visible'});
 await page.goto(pathToFileURL(join(root,'dist/windows/review.html')).href);
 await page.locator('#example').click();
 await page.locator('button[type=submit]').click();
 assert.equal(await page.locator('#result').getAttribute('data-risk'),'signals');
 await page.locator('#file').setInputFiles(join(root,'app/examples/correo-con-senales.eml'));
 await page.locator('button[type=submit]').click();
 await page.locator('#result').waitFor({state:'visible'});
 assert.match(await page.locator('#reasons').innerText(),/DMARC/);
 await page.locator('#type').selectOption('mensaje');
 await page.locator('#input').fill('Nos vemos a las ocho.');
 await page.locator('button[type=submit]').click();
 assert.equal(await page.locator('#result').getAttribute('data-risk'),'no_match');
 await page.locator('#coverage-details summary').click();
 assert.doesNotMatch(await page.locator('#coverage').innerText(),/cabeceras|adjunt/i);
 await page.locator('#clear').click();
 assert.equal(await page.locator('#input').inputValue(),'');
 assert.equal(await page.locator('#title').textContent(),'');
 assert.equal(await page.locator('#result').isVisible(),false);
 assert.equal(await page.getByRole('link',{name:'Consultar o reportar teléfono (en línea)'}).getAttribute('href'),directory);
 assert.ok(capturedRequests.every(url=>!url.startsWith('https://')||[gmail,messages].includes(url)),capturedRequests.join('\n'));
 const popup=await context.newPage();
 await popup.goto(new URL('popup.html',worker.url()).href);
 const opened=context.waitForEvent('page');
 await popup.locator('#phone-directory').click();
 const directoryTab=await opened;
 await directoryTab.waitForURL(directory);
 console.log('PASS: Gmail y SMS sintéticos, pausa, revisor Windows sin red y acceso al directorio.');
}finally{await context.close();}
