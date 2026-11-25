'use strict';
importScripts('shared/config.js','shared/url-rules.js','shared/psl-data.js','shared/advanced.js','shared/engine.js','shared/cloud.js');
const sessionStore={get:async key=>(await chrome.storage.session.get(key))[key],set:async(key,value)=>chrome.storage.session.set({[key]:value}),remove:async key=>chrome.storage.session.remove(key)};
const cloud=AquilaCloud.create(AquilaConfig,sessionStore);
const results=new Map();
let loadingIntel=null;
const intelCacheKey='https://aquila-guard-a3ddd.web.app/data/reputation.json';
const reloadWindowMs=30_000;
const pageKeyEncoder=new TextEncoder();
let reloadQueue=Promise.resolve();
let riskQueue=Promise.resolve();

function queueRisk(task){
 const next=riskQueue.then(task);
 riskQueue=next.catch(()=>{});
 return riskQueue;
}

function markReported(sender){
 const tabId=sender.tab.id;
 return queueRisk(async()=>{
  const tab=await chrome.tabs.get(tabId);
  if(tab.url!==sender.url||tab.pendingUrl||(await chrome.storage.local.get('enabled')).enabled!==true)return;
  await chrome.action.setBadgeBackgroundColor({tabId,color:'#A11932'});
  await chrome.action.setBadgeText({tabId,text:'!'});
 });
}

async function clearRisk(tabId){
 if(await chrome.action.getBadgeText({tabId})!=='!')return;
 const color=await chrome.action.getBadgeBackgroundColor({});
 await chrome.action.setBadgeBackgroundColor({tabId,color});
 await chrome.action.setBadgeText({tabId,text:null});
}

chrome.tabs.onUpdated.addListener((tabId,changes)=>{
 if(changes.status==='loading'||changes.url)queueRisk(()=>clearRisk(tabId));
});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local'||changes.enabled?.newValue!==false)return;
 queueRisk(async()=>{
  const tabs=await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab=>clearRisk(tab.id)));
 });
});

function countReloads(message,sender){
 const started=message.navigationStarted;
 if(!Number.isFinite(started)||started<=0||started>Date.now()+1000||sender.frameId!==0)return 0;
 const tabKey='aquila-reloads-'+sender.tab.id;
 const document=sender.documentId||String(started);
 const task=reloadQueue.then(async()=>{
  const storage=chrome.storage.session;
  const previous=(await storage.get(tabKey))[tabKey];
  if(previous?.document===document)return previous.times.filter(time=>Date.now()-time<=reloadWindowMs).length;
  if(previous&&started<previous.started)return 0;
  // Compara la ruta sin guardar la dirección original ni sus parámetros.
  const address=new URL(sender.url);
  const digest=await crypto.subtle.digest('SHA-256',pageKeyEncoder.encode(address.origin+address.pathname));
  const pageKey=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const samePage=previous?.pageKey===pageKey;
  const repeated=message.navigationType==='reload'||(samePage&&message.navigationType==='navigate');
  const times=repeated
   ? [...(previous?.times||[]).filter(time=>started-time<=reloadWindowMs),started].slice(-3) : [];
  await storage.set({[tabKey]:{document,started,pageKey,times}});
  return times.length;
 });
 reloadQueue=task.catch(()=>{});
 return task.catch(()=>0);
}
chrome.tabs.onRemoved.addListener(tabId=>{
 reloadQueue=reloadQueue.then(()=>chrome.storage.session.remove('aquila-reloads-'+tabId)).catch(()=>{});
});
async function loadIntel(){
 if(AquilaEngine.status().reputation)return;
 if(!loadingIntel)loadingIntel=(async()=>{
  const candidates=[];
  try{const cache=await caches.open('aquila-data-v1');const cached=await cache.match(intelCacheKey);if(cached)candidates.push(await cached.json());}catch{}
  try{const response=await fetch(chrome.runtime.getURL('data/reputation.json'));if(response.ok)candidates.push(await response.json());}catch{}
  candidates.sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt));
  for(const data of candidates){try{AquilaEngine.setReputation(data);return;}catch{}}
  // Conservar el modo de reglas y permitir reintentar la carga en la próxima solicitud.
 })().finally(()=>{loadingIntel=null;});
 return loadingIntel;
}

async function updateIntel(){
 const url=new URL('data/reputation.json',AquilaConfig.appUrl);
 if(url.origin!=='https://aquila-guard-a3ddd.web.app')throw Error('Origen de actualización no válido.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 let response;
 try{response=await fetch(url.href,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});}
 finally{clearTimeout(timer);}
 if(!response.ok)throw Error('No se pudo actualizar. Se mantiene la copia incluida o la última actualización disponible.');
 const data=await response.json();
 if(data.domains?.length<1000||data.domains?.length>1000000||Date.parse(data.fetchedAt)>Date.now()+86400000)throw Error('La actualización no tiene un formato válido.');
 const previous=AquilaEngine.status().reputation;
 if(previous&&Date.parse(data.fetchedAt)<Date.parse(previous.fetchedAt))return previous;
 AquilaEngine.setReputation(data);
 let persisted=false;try{const cache=await caches.open('aquila-data-v1');await cache.put(intelCacheKey,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));persisted=true;}catch{}
 return {...AquilaEngine.status().reputation,persisted};
}
async function handleCloud(message,sender){
 const ownPage=typeof sender.url==='string'&&sender.url.startsWith(chrome.runtime.getURL(''));
 if(message.type==='aquila-analyze-visible-message'){
  const snapshot=message.snapshot;
  const page=typeof sender.url==='string'?new URL(sender.url):null;
  const allowed=sender.tab&&sender.frameId===0&&(
   page?.origin==='https://mail.google.com'&&snapshot?.type==='correo'||
   page?.origin==='https://messages.google.com'&&page.pathname.startsWith('/web/')&&snapshot?.type==='mensaje');
  if(!ownPage&&!allowed)throw Error('Revisión de mensajes no autorizada.');
  if(!['correo','mensaje'].includes(snapshot?.type)||typeof snapshot.input!=='string')throw Error('Mensaje no disponible.');
  await loadIntel();
  const {title,classification,hasSignals,findings,checkedLinks,limitation}=AquilaEngine.analyze(snapshot.type,snapshot.input);
  return {title,classification,hasSignals,findings,checkedLinks,limitation};
 }
 if(message.type==='aquila-analyze-auto'||message.type==='aquila-analyze-ad-hosts'){
  if(!sender.tab||sender.frameId!==0||!/^https?:\/\//i.test(sender.url||''))throw Error('Página no admitida.');
  if((await chrome.storage.local.get('enabled')).enabled!==true)return null;
  await loadIntel();
  if(message.type==='aquila-analyze-ad-hosts'){
   const hosts=AquilaEngine.reportedHosts(message.hosts);
   if(hosts.length)await markReported(sender);
   return hosts;
  }
  const result=AquilaEngine.analyze('enlace',sender.url);
  if(result.classification==='reported')await markReported(sender);
  result.reloads=await countReloads(message,sender);
  return result;
 }
 if(!ownPage)throw Error('Solicitud no permitida.');
 switch(message.type){
  case 'aquila-analyze-page':{
   await loadIntel();const result=AquilaEngine.analyzePage(message.input,message.meta);results.set(result.id,result);if(results.size>20)results.delete(results.keys().next().value);return result;
  }
  case 'aquila-analyze':{
   await loadIntel();const result=AquilaEngine.analyze('enlace',message.input);
   results.set(result.id,result);if(results.size>20)results.delete(results.keys().next().value);return result;
  }
  case 'aquila-cloud-status':await loadIntel();return {session:await cloud.publicSession(),configured:cloud.configured,engine:AquilaEngine.status()};
  case 'aquila-cloud-signin':return cloud.signIn(message.email,message.password,message.signup===true);
  case 'aquila-cloud-signout':await cloud.signOut();results.clear();return true;
  case 'aquila-cloud-reset':await cloud.reset(message.email);return true;
  case 'aquila-cloud-save':{const result=results.get(message.id);if(!result)throw Error('Vuelve a revisar el enlace antes de guardarlo.');return cloud.save(result.id,AquilaEngine.toRecord(result,'extension'));}
  case 'aquila-cloud-list':return cloud.list();
  case 'aquila-cloud-update':await cloud.update(message.id,message.reviewed,message.note);return true;
  case 'aquila-cloud-remove':await cloud.remove(message.id);return true;
  case 'aquila-intel-update':await loadIntel();return updateIntel();
  default:throw Error('Operación no reconocida.');
 }
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id||!/^aquila-(analyze|cloud-|intel-)/.test(message?.type||''))return;
 handleCloud(message,sender).then(data=>sendResponse({ok:true,data}),e=>sendResponse({ok:false,error:e.name==='TimeoutError'?'La actualización tardó demasiado. Conservamos la lista disponible.':e.message||'No pudimos completar la operación.'}));return true;
});
