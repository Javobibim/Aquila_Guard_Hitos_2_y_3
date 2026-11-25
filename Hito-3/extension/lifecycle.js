'use strict';
importScripts('worker-cloud.js');
const api = globalThis.browser || globalThis.chrome;
const config = {id:'aquila-url', matches:['http://*/*','https://*/*'], js:['intrusive.js','content.js'], runAt:'document_idle', allFrames:false, persistAcrossSessions:true};
let queue = Promise.resolve();
async function badge(ready,error=false){await api.action.setBadgeText({text:error?'?':ready?'ON':'OFF'});await api.action.setBadgeBackgroundColor({color:error?'#A86608':ready?'#1D4874':'#657486'});await api.action.setTitle({title:error?'Aquila Guard: abre el panel para reintentar':ready?'Aquila Guard: avisos de dirección activos; no garantiza seguridad':'Aquila Guard: avisos pausados'});}
async function reconcile() {
 const {enabled} = await api.storage.local.get('enabled');
 const granted = await api.permissions.contains({origins:config.matches});
 const registered = await api.scripting.getRegisteredContentScripts({ids:[config.id]});
 if (enabled === true && granted) {
  if (registered.length) await api.scripting.updateContentScripts([config]);
  else await api.scripting.registerContentScripts([config]);
 } else {
  if (registered.length) await api.scripting.unregisterContentScripts({ids:[config.id]});
  if (enabled === true && !granted) await api.storage.local.set({enabled:false});
 }
 await badge(enabled===true&&granted);
}
function schedule() {
 queue = queue.then(reconcile, reconcile).catch(() => badge(false,true).catch(()=>{}));
 return queue;
}
api.runtime.onInstalled.addListener(async info => {
 if (info.reason === 'install') {
  const saved = await api.storage.local.get('enabled');
  if (typeof saved.enabled !== 'boolean') {
   await api.storage.local.set({enabled:false});
   await api.tabs.create({url:api.runtime.getURL('welcome.html')});
  }
 }
 await schedule();
});
api.runtime.onStartup.addListener(schedule);
api.permissions.onRemoved.addListener(schedule);
api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.enabled) schedule(); });
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
 if (sender.id !== api.runtime.id || message?.type !== 'aquila-status') return;
 schedule().then(() => sendResponse({ok:true}));
 return true;
});
