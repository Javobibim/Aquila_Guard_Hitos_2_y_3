(() => {
 'use strict';
 const api=globalThis.AquilaBrowser;
 const el=id=>document.getElementById(id);
 const panel=el('message-tools'),button=el('message-review'),watch=el('message-toggle');
 const status=message=>{el('message-status').textContent=message;};
 function available(tab){
  if(!tab?.id||!tab.url)return false;
  const address=new URL(tab.url);
  return address.origin==='https://mail.google.com'||
   address.origin==='https://messages.google.com'&&address.pathname.startsWith('/web/');
 }
 async function current(){
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  if(!available(tab))throw Error('Abre Gmail o Mensajes web en la pestaña activa.');
  return tab;
 }
 async function watchState(tab){
  try{return (await api.tabs.sendMessage(tab.id,{type:'aquila-message-state'},{frameId:0}))?.active===true;}
  catch{return false;}
 }
 function showState(active){watch.textContent=active?'Pausar avisos en esta pestaña':'Activar avisos en esta pestaña';}
 function render(result,snapshot){
  const box=el('message-result'),title=el('message-title');
  box.dataset.signals=String(result.hasSignals);box.hidden=false;
  title.textContent=result.title;
  el('message-level').dataset.level=result.classification==='reported'?'red':result.hasSignals?'amber':'unknown';
  el('message-level').textContent=result.classification==='reported'?'Riesgo alto':result.hasSignals?'Precaución':'Sin coincidencias';
  const items=result.findings.map(finding=>{
   const li=document.createElement('li'),heading=document.createElement('strong'),detail=document.createElement('span');
   heading.textContent=finding.title;detail.textContent=finding.detail;li.append(heading,detail);return li;
  });
  el('message-reasons').replaceChildren(...items);
  el('message-coverage').textContent=(snapshot.selection?'Se revisó el texto seleccionado. ':'Se revisó el texto y los enlaces visibles del mensaje. ')+
   (snapshot.partial?'La revisión fue parcial. ':'')+result.checkedLinks+' enlace(s). '+result.limitation;
  title.focus();
 }
 async function perform(run){
  button.disabled=watch.disabled=true;
  try{await run(await current());}catch(error){status(error.message||'No se pudo revisar la pestaña.');}
  finally{button.disabled=watch.disabled=false;}
 }
 button.onclick=()=>perform(async tab=>{
  el('message-result').hidden=true;status('Revisando en este dispositivo…');
  await api.scripting.executeScript({target:{tabId:tab.id},files:['message-snapshot.js']});
  const [capture]=await api.scripting.executeScript({target:{tabId:tab.id},
   func:()=>globalThis.AquilaMessageSnapshot.capture(true)});
  const snapshot=capture?.result;
  if(!snapshot)throw Error('No se pudo leer el mensaje. Abre solo un correo, selecciona el texto o pégalo en el revisor de Aquila Guard.');
  const response=await api.runtime.sendMessage({type:'aquila-analyze-visible-message',snapshot});
  if(!response?.ok)throw Error(response?.error||'No se pudo revisar el mensaje.');
  render(response.data,snapshot);status('Revisión local completada.');
 });
 watch.onclick=()=>perform(async tab=>{
  const active=await watchState(tab);
  if(!active)await api.scripting.executeScript({target:{tabId:tab.id},files:['message-snapshot.js','message-watch.js']});
  const response=await api.tabs.sendMessage(tab.id,{type:active?'aquila-message-stop':'aquila-message-start'},{frameId:0});
  showState(response?.active===true);
  status(response?.active?'Avisos activos en esta pestaña. Abre un mensaje para revisarlo.':'Avisos de mensajes pausados.');
 });
 current().then(async tab=>{panel.hidden=false;showState(await watchState(tab));}).catch(()=>{});
})();
