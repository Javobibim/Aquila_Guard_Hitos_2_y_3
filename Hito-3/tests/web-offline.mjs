import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {dirname,extname,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(pathToFileURL(process.env.AQUILA_PLAYWRIGHT||resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);
const root=resolve(import.meta.dirname,'../dist/app');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'};
const feed=JSON.stringify({format:1,source:'PhishDestroy primary',fetchedAt:new Date().toISOString(),domains:['reported-aquila.example']});
let mode='valid';
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/data/reputation.json'){
  res.writeHead(mode==='unavailable'?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(mode==='valid'?feed:'{}');
  return;
 }
 const file=resolve(root,pathname==='/'?'index.html':'.'+pathname);
 if(!file.startsWith(root+sep)){res.writeHead(404).end();return;}
 try{
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});
  res.end(bytes);
 }catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const url='http://127.0.0.1:'+server.address().port+'/#revisar';
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.AQUILA_CHROMIUM||resolve(import.meta.dirname,'../../browser-runtime/chromium-1234/chrome-win64/chrome.exe')});
 const context=await browser.newContext();
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.waitForFunction(async()=>Boolean(await caches.match('data/reputation.json',{cacheName:'aquila-public-data-v2'})));
 async function reviewReported(){
  await page.locator('#input').fill('https://reported-aquila.example/');
  await page.locator('#analyze').click();
  await page.locator('#result-title').filter({hasText:'Dominio reportado'}).waitFor();
 }
 await reviewReported();
 mode='invalid';
 await page.locator('#reload-intel').click();
 await page.locator('#intel-state').filter({hasText:'Conservamos la lista'}).waitFor();
 assert.equal(await page.evaluate(async()=>(await (await caches.match('data/reputation.json',{cacheName:'aquila-public-data-v2'})).json()).domains[0]),'reported-aquila.example');
 mode='unavailable';
 await context.setOffline(true);
 await page.reload();
 await page.locator('#intel-state').filter({hasText:'Usamos la copia guardada'}).waitFor();
 await reviewReported();
 await context.setOffline(false);
 mode='valid';
 await page.locator('#reload-intel').click();
 await page.locator('#intel-state').filter({hasText:/^1 dominios/}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: lista inválida, revisión sin red y recuperación de conexión con service worker');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
