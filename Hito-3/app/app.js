(() => {
 'use strict';
 const $=id=>document.getElementById(id),engine=globalThis.AquilaEngine;
 // En navegadores administrados que bloquean el almacenamiento, la sesión
 // puede vivir solo en memoria. La revisión sin cuenta no depende de él.
 const memory=new Map();let temporarySession=false;
 const storage={
  get:async k=>{if(memory.has(k))return memory.get(k);try{const value=sessionStorage.getItem(k);return value?JSON.parse(value):null;}catch{temporarySession=true;return null;}},
  set:async(k,v)=>{memory.set(k,v);try{sessionStorage.setItem(k,JSON.stringify(v));}catch{temporarySession=true;}},
  remove:async k=>{memory.set(k,null);try{sessionStorage.removeItem(k);}catch{temporarySession=true;}}
 };
 const cloud=AquilaCloud.create(AquilaConfig,storage,undefined,recordHistoryResponse);
 let result=null, sampleDomain='', generation=0, authBusy=false, historyBusy=false;
 let pendingMail=null, mailLoad=0, intelLoading=false, firstIntelRequest;
 let phoneRequest=0,phoneBusy=false,phoneTipBusy=false;
 const say=(id,text)=>{$(id).textContent=text;};
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const typeNames={enlace:'Enlaces',correo:'Correos',mensaje:'Mensajes / SMS',telefono:'Teléfonos'};
 function dashboard(items,message){
  say('dashboard-state',message);say('summary-state',message);
  $('recent-list').replaceChildren();$('type-counts').replaceChildren();
  say('count-total',items?String(items.length):'—');
  say('count-signals',items?String(items.filter(x=>x.hasSignals).length):'—');
  say('count-unread',items?String(items.filter(x=>!x.reviewed).length):'—');
  if(!items)return;
  for(const item of items.slice(0,3)){
   const row=node('article',null,'recent-item');
   row.append(node('strong',item.preview),node('p',item.classification==='reported'?'Dominio reportado':item.hasSignals?'Con señales para revisar':'Sin coincidencias'),node('p',new Date(item.createdAt).toLocaleString('es-CL'),'muted'));
   $('recent-list').append(row);
  }
  for(const [type,label] of Object.entries(typeNames)){
   const row=node('div',null,'type-count');row.append(node('span',label),node('strong',String(items.filter(x=>x.inputType===type).length)));$('type-counts').append(row);
  }
 }
 async function loadDashboard(){
  const epoch=generation;
  const s=await cloud.publicSession();if(epoch!==generation)return;
  if(!s?.verified){dashboard(null,s?'Verifica tu correo en Mi cuenta para consultar tus registros.':'Inicia sesión para consultar tus revisiones guardadas.');return;}
  return history();
 }
 for(const link of document.querySelectorAll('[data-review-type]'))link.onclick=()=>{
  $('type').value=link.dataset.reviewType;$('type').dispatchEvent(new Event('change'));
 };
 $('refresh-summary').onclick=loadDashboard;
 $('copy-web-link').onclick=async()=>{
  const url='https://aquila-guard-a3ddd.web.app/';
  try{await navigator.clipboard.writeText(url);say('copy-link-state','Enlace copiado. Puedes enviártelo para abrirlo en otro dispositivo.');}
  catch{say('copy-link-state','Copia esta dirección: '+url);}
 };
 function connectionState(){const offline=navigator.onLine===false;$('network-state').hidden=!offline;say('network-state',offline?'El navegador indica que no hay conexión. Puedes revisar con los recursos ya cargados; la cuenta y el historial necesitan internet.':'');}
 addEventListener('online',connectionState);addEventListener('offline',connectionState);connectionState();
 const historyOperations={list:'Consultar lista · POST runQuery',get:'Consultar registro · GET',create:'Crear · POST commit',update:'Actualizar · POST commit',delete:'Borrar · POST commit'};
 function recordHistoryResponse(operation,status){
  if(!$('history-demo').open)return;
  const log=$('history-api-log');
  log.append(node('li',historyOperations[operation]+' · HTTP '+status));
  if(log.children.length>12)log.firstElementChild.remove();
 }
 $('history-demo-example').onclick=()=>{
  $('type').value='enlace';$('type').dispatchEvent(new Event('change'));
  location.hash='revisar';$('example').click();
 };
 let demoBusy=false;
 const demoKey='aquila-history-demo';
 $('history-demo-run').onclick=async()=>{
  if(demoBusy)return;
  demoBusy=true;$('history-demo-run').disabled=true;$('signout').disabled=true;
  $('history-demo').open=true;$('history-api-log').replaceChildren();
  const epoch=generation;
  const status=text=>say('history-demo-state',text);
  try{
   const owner=await cloud.publicSession();
   if(!owner?.verified){status('Inicia sesión y verifica tu correo en Mi cuenta para ejecutar esta prueba.');location.hash='cuenta';return;}
   const ensureOwner=async()=>{
    if(epoch!==generation||(await cloud.publicSession())?.uid!==owner.uid)throw Error('La sesión cambió. Vuelve a entrar con la cuenta de la prueba.');
   };
   let pending;
   pending=await storage.get(demoKey);
   if(pending?.uid===owner.uid&&/^[a-f0-9-]{36}$/.test(pending.id)){
    status('Limpiando el caso ficticio de la prueba anterior…');
    if(await cloud.get(pending.id)){await ensureOwner();await cloud.remove(pending.id);}
    await storage.remove(demoKey);
   }
   const sample=engine.analyze('enlace','https://bancoestado.cl.acceso.example/prueba');
   await storage.set(demoKey,{uid:owner.uid,id:sample.id});
   status('1/4 · Guardando un caso ficticio en Firebase…');
   await cloud.save(sample.id,engine.toRecord(sample,'app'));
   await ensureOwner();
   status('2/4 · Consultando el registro guardado…');
   const saved=await cloud.get(sample.id);
   if(!saved||saved.id!==sample.id)throw Error('El registro creado no se pudo recuperar.');
   status('3/4 · Preparando la actualización. La regla permite editar después de dos segundos…');
   await new Promise(resolve=>setTimeout(resolve,2200));
   await ensureOwner();
   const note='Prueba de funcionamiento completo';
   await cloud.update(sample.id,true,note);
   await ensureOwner();
   const updated=await cloud.get(sample.id);
   if(updated?.note!==note||updated.reviewed!==true)throw Error('La nota actualizada no se recuperó.');
   status('4/4 · Borrando el caso ficticio y comprobando el borrado…');
   await cloud.remove(sample.id);
   await ensureOwner();
   if(await cloud.get(sample.id))throw Error('El caso ficticio todavía aparece en Firebase.');
   await storage.remove(demoKey);
   status('Prueba completada. Firebase creó, recuperó, actualizó y borró el caso ficticio.');
   await history();
  }catch(error){status('Prueba detenida. '+error.message+' Puedes reintentar con la misma cuenta.');}
  finally{demoBusy=false;$('history-demo-run').disabled=false;$('signout').disabled=false;}
 };
 const intelUrl='data/reputation.json', intelCache='aquila-public-data-v2';
 async function applyIntel(response,offline=false){
  const data=await response.json();
  const status=engine.setReputation(data);
  sampleDomain=data.domains[0];
  const date=new Date(status.fetchedAt).toLocaleString('es-CL');
  say('intel-state',(offline?'Usamos la copia guardada. ':'')+status.count.toLocaleString('es-CL')+' dominios en la copia del '+date+'.');
 }
 async function intel() {
  if(intelLoading)return;
  intelLoading=true;say('intel-state','Cargando la lista de reportes…');$('reload-intel').disabled=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try {
   const response=await fetch(intelUrl,{cache:'no-cache',signal:controller.signal});
   if(!response.ok)throw Error('No se pudo cargar la lista.');
   const copy='caches' in globalThis?response.clone():null;
   try{await applyIntel(response);}catch(error){if(copy)void copy.body?.cancel().catch(()=>{});throw error;}
   if(copy)void caches.open(intelCache).then(cache=>cache.put(intelUrl,copy)).catch(()=>{void copy.body?.cancel().catch(()=>{});});
  }catch{
   if(engine.status().reputation)say('intel-state','No pudimos actualizar. Conservamos la lista cargada en esta pestaña.');
   else {
    try{
     const saved=await (await caches.open(intelCache)).match(intelUrl)
      ||await caches.match(intelUrl,{cacheName:'aquila-public-data-v1'});
     if(!saved)throw Error();
     await applyIntel(saved,true);
    }catch{say('intel-state','Lista no disponible. Puedes usar las reglas locales; no se contrastarán reportes.');}
   }
  }
  finally{clearTimeout(timeout);intelLoading=false;$('reload-intel').disabled=false;if(result&&!result.intel){if(engine.status().reputation)review(false);else $('save').disabled=false;}}
 }
 function ensureIntel(){return firstIntelRequest??=(intel());}
 function resetResult(){
  result=null;$('result').hidden=true;$('result-details').open=false;
  for(const id of ['result-title','result-domain','result-label','recommendation','limitation','coverage-state','save-state','scan-state'])say(id,'');
  $('reasons').replaceChildren();$('save').disabled=false;
 }
 function clearReview(){
  clearMail();resetResult();clearPhone();$('input').value='';
  $('phone-tip-form').reset();$('phone-tip').open=false;$('review-examples').open=false;
 }
 $('clear-review').onclick=()=>{clearReview();$('input').focus();say('scan-state','Revisión limpiada.');};
 function clearMail(){++mailLoad;pendingMail=null;$('mail-file').value='';}
 function clearPhone(){
  ++phoneRequest;
  $('phone-result').replaceChildren();
  $('phone-result').hidden=true;
  say('phone-status','');
  say('phone-tip-status','');
 }
 $('input').oninput=()=>{clearMail();resetResult();clearPhone();};
 $('type').onchange=()=>{
  clearMail();resetResult();clearPhone();$('input').value='';
  const type=$('type').value;
  $('input').maxLength={enlace:8192,correo:50000,mensaje:10000,telefono:40}[type];
  $('mail-file-area').hidden=type!=='correo';
  $('phone-lookup').hidden=type!=='telefono';
 };
 $('phone-demo').onclick=()=>{resetResult();clearPhone();$('input').value='+1 202 555 0147';say('phone-status','Número ficticio cargado. Pulsa Consultar reportes compartidos.');};
 $('phone-query').onclick=async()=>{
  if(phoneBusy||$('type').value!=='telefono')return;
  clearPhone();const request=phoneRequest;
  phoneBusy=true;$('phone-query').disabled=true;say('phone-status','Consultando reportes…');
  try{
   const report=await cloud.lookupPhoneReport($('input').value);
   if(request!==phoneRequest)return;
   const box=$('phone-result');box.hidden=false;
   if(!report){
    box.dataset.level='no_match';
    box.append(node('h3','Sin reporte vigente'),node('p','El directorio tiene cobertura limitada. Comprueba por un canal oficial si tienes dudas.'));
   }else{
    const demo=report.status==='demo';
    box.dataset.level=demo?'no_match':'signals';
    box.append(node('h3',demo?'Caso ficticio de demostración':'Coincidencia con un intento reportado'));
    if(!demo)box.append(node('p','El identificador de llamada puede estar falsificado. La coincidencia no acredita quién llamó.'));
   }
   say('phone-status','Consulta completada.');
  }catch(error){if(request===phoneRequest)say('phone-status',error.message);}
  finally{phoneBusy=false;$('phone-query').disabled=false;}
 };
 $('phone-tip-form').onsubmit=async event=>{
  event.preventDefault();
  if(phoneTipBusy||$('type').value!=='telefono')return;
  const request=phoneRequest;
  phoneTipBusy=true;$('phone-tip-send').disabled=true;
  say('phone-tip-status','Enviando reporte privado…');
  try{
   const sent=await cloud.submitPhoneTip($('input').value,$('phone-tip-category').value,$('phone-tip-origin').value);
   if(request!==phoneRequest)return;
   const message={approved:'Ya revisamos tu reporte y lo vinculamos al directorio.',
    declined:'Tu reporte se revisó y no se incorporó al directorio.'}[sent.status]||
    (sent.existing?'Ya enviaste un reporte para ese número. Sigue pendiente de revisión.':'Reporte recibido. El equipo lo revisará antes de publicar una ficha.');
   say('phone-tip-status',message);
  }catch(error){if(request===phoneRequest)say('phone-tip-status',error.message);}
  finally{phoneTipBusy=false;$('phone-tip-send').disabled=false;}
 };
 function review(focus=true){
  const detailsOpen=$('result-details').open;
  resetResult();
  try{
   result=engine.analyze($('type').value,pendingMail??$('input').value,{mailFile:pendingMail!==null});
   const limited=!result.intel;
   $('save').disabled=intelLoading&&limited;
   const box=$('result');
   box.dataset.signals=String(result.hasSignals);box.dataset.level=result.classification;
   say('result-title',result.title);say('result-domain',result.hostname);
   const listDate=result.intel?new Date(result.intel.fetchedAt):null;
   const stale=listDate&&Date.now()-listDate.getTime()>7*86400000;
   say('result-label',result.type==='telefono'?'Comprobación de formato':limited?'Solo reglas locales · lista aún no disponible':stale?'Lista de reportes de hace más de 7 días':'Revisión en este dispositivo');
   say('recommendation',result.type==='telefono'
    ?'Verifica el número por un canal oficial. Puedes consultar el directorio por separado.'
    :result.recommendation);
   say('limitation',result.type==='telefono'?'La comprobación de formato no acredita la identidad de quien llama.'
    :result.type==='correo'?result.limitation:'No abrimos destinos ni seguimos redirecciones. No encontrar señales no garantiza seguridad.');
   const links=result.checkedLinks===1?'1 enlace revisado':result.checkedLinks+' enlaces revisados';
   const mail=result.type==='correo'?result.mailAnalysis:null;
   say('coverage-state',mail?(mail.hasHeaders?'Se leyeron cabeceras aportadas. ':'No se aportaron cabeceras completas. ')+links+'; '+(mail.ignoredAttachments===1?'1 parte adjunta omitida':mail.ignoredAttachments+' partes adjuntas omitidas')+'. La autenticación no se verificó criptográficamente.'
    :result.type==='telefono'?'Se comprobó el formato del número.':links+'.');
   const reasons=result.findings.map(f=>{const li=node('li');li.append(node('strong',f.title),node('span',f.detail));return li;});
   $('reasons').append(...reasons.slice(0,3));
   if(reasons.length>3){
    const more=node('details');more.append(node('summary','Ver '+(reasons.length-3)+' motivos más'));
    const list=node('ul');list.append(...reasons.slice(3));more.append(list);
    const item=node('li');item.className='more-reasons';item.append(more);$('reasons').append(item);
   }
   $('result-details').open=detailsOpen&&!focus;
   box.hidden=false;
   say('scan-state',intelLoading&&limited?'Revisión local completada. Contrastaremos los reportes cuando termine de cargar la lista.':focus?'':'Revisión actualizada.');
   if(focus)$('result-title').focus();
  }catch(e){say('scan-state',e.message);}
 }
 $('scan-form').onsubmit=event=>{event.preventDefault();ensureIntel();review();};
 $('example').onclick=()=>{
  const type=$('type').value;
  clearReview();
  $('input').value=({
   enlace:'https://bancoestado.cl.acceso.example/verificar',
   mensaje:'URGENTE: confirma tu clave para evitar el bloqueo de tu cuenta.',
   correo:'From: Soporte <avisos@soporte.example>\nSubject: Acción requerida\n\nConfirma tu clave en https://bancoestado.cl.acceso.example/verificar.',
   telefono:'+1 202 555 0147'
  })[type];
  $('input').focus();say('scan-state','Ejemplo ficticio cargado. Pulsa Revisar ahora.');
 };
 $('reported-example').onclick=()=>{resetResult();if(!sampleDomain){say('scan-state','Espera a que termine de cargar la lista de reportes.');return;}$('type').value='enlace';$('type').dispatchEvent(new Event('change'));$('input').value='https://'+sampleDomain;say('scan-state','Demostración con un dominio de la lista descargada. No se abre ni se visita ese sitio. Pulsa Revisar ahora.');};
 $('mail-file').onchange=async()=>{const request=++mailLoad,file=$('mail-file').files[0];pendingMail=null;resetResult();if(!file)return;try{if(file.size>2_097_152)throw Error('El correo supera 2 MB. En Gmail, puedes copiar el texto o las cabeceras para revisar una parte.');const text=await file.text();if(request!==mailLoad)return;if(!text.trim()||text.includes('\u0000'))throw Error('El archivo está vacío o no es un correo de texto.');$('input').value='';pendingMail=text;say('scan-state','Correo cargado localmente. Pulsa Revisar ahora.');}catch(e){if(request===mailLoad)say('scan-state',e.message);}};
 $('email-example').onclick=async()=>{$('type').value='correo';$('type').dispatchEvent(new Event('change'));const request=++mailLoad;try{const response=await fetch('examples/correo-con-senales.eml');if(!response.ok)throw Error();const text=await response.text();if(request!==mailLoad)return;$('input').value=text;say('scan-state','Correo ficticio con señales combinadas. Pulsa Revisar ahora.');}catch{if(request===mailLoad)say('scan-state','No se pudo cargar el ejemplo. Puedes pegar un texto.');}};
 $('save').onclick=async()=>{if(!result)return;const current=result,epoch=generation;$('save').disabled=true;say('save-state','Guardando resumen…');try{await cloud.save(current.id,engine.toRecord(current,'app'));if(result===current&&epoch===generation)say('save-state','Resumen guardado. Lo verás desde otro equipo con la misma cuenta.');}catch(e){if(result===current&&epoch===generation){say('save-state',e.message);$('save').disabled=false;}}};
 async function account(){const epoch=generation,s=await cloud.publicSession();if(epoch!==generation)return;say('account-state',s?'Sesión abierta: '+s.email+(temporarySession?' · Este navegador bloquea el almacenamiento. Al recargar tendrás que iniciar sesión de nuevo.':''):cloud.configured?'Sin sesión. Puedes revisar sin una cuenta.':'Firebase pendiente de configuración. La revisión local está disponible.');say('profile-state',s?s.verified?'Mi cuenta conectada':'Correo pendiente':'Cuenta opcional');$('auth-form').hidden=!!s;$('signout').hidden=!s;$('verify-email').hidden=!s||s.verified;}
 async function auth(signup){if(authBusy)return;authBusy=true;for(const id of ['signin','signup','reset'])$(id).disabled=true;const form=$('auth-form');if(!form.reportValidity()){authBusy=false;for(const id of ['signin','signup','reset'])$(id).disabled=false;return;}say('auth-state',signup?'Creando tu cuenta…':'Iniciando sesión…');try{const session=await cloud.signIn($('email').value,$('password').value,signup);generation++;$('password').value='';await account();say('auth-state',session.verified?'Listo. Puedes consultar tu historial.':'Sesión iniciada. Confirma tu correo para usar el historial.');}catch(e){say('auth-state',e.message);}finally{authBusy=false;for(const id of ['signin','signup','reset'])$(id).disabled=false;}}
 $('auth-form').onsubmit=e=>{e.preventDefault();auth(false);};$('signup').onclick=()=>auth(true);
 async function verifyEmail(refresh){
  const buttons=['send-verification','refresh-verification'].map($);if(buttons[0].disabled)return;
  for(const button of buttons)button.disabled=true;const epoch=generation;
  try{
   if(refresh){const session=await cloud.refreshVerification();if(epoch!==generation)return;await account();if(epoch===generation)say('auth-state',session?.verified?'Correo verificado. Ya puedes usar el historial.':'La cuenta sigue pendiente de verificar. Abre el enlace que recibiste.');}
   else{await cloud.sendVerification();if(epoch===generation)say('auth-state','Correo enviado. Revisa también la carpeta de spam.');}
  }catch(e){if(epoch===generation)say('auth-state',e.message);}
  finally{for(const button of buttons)button.disabled=false;}
 }
 $('send-verification').onclick=()=>verifyEmail(false);$('refresh-verification').onclick=()=>verifyEmail(true);
 $('signout').onclick=async()=>{generation++;clearReview();$('email').value='';$('password').value='';await cloud.signOut();dashboard(null,'Inicia sesión para consultar tus revisiones guardadas.');$('history-list').replaceChildren();$('history-api-log').replaceChildren();$('history-demo').open=false;say('history-state','Sesión cerrada.');say('save-state','');$('save').disabled=false;await account();say('auth-state','Cerraste tu sesión en esta pestaña.');};
 $('reset').onclick=async()=>{try{await cloud.reset($('email').value);say('auth-state','Si el correo corresponde a una cuenta, recibirás las instrucciones. Revisa también la carpeta de spam.');}catch(e){say('auth-state',e.message);}};
 function historyCard(item){
  const card=node('article',null,'card history-item');card.dataset.signals=String(item.hasSignals);card.dataset.id=item.id;
  const head=node('div',null,'heading'),left=node('div');left.append(node('span',item.source==='extension'?'Desde la extensión':'Desde la app','badge'),node('h2',item.preview),node('p',new Date(item.createdAt).toLocaleString('es-CL'),'muted'));head.append(left,node('span',item.classification==='reported'?'Dominio reportado':item.hasSignals?'Con señales':'Sin coincidencias','badge'));
  const reasons=node('p',item.reasons||'No se encontraron coincidencias en esta revisión.','reasons'),note=node('textarea');note.maxLength=300;note.rows=2;note.value=item.note||'';note.id='note-'+item.id;const label=node('label','Tu nota (opcional, hasta 300 caracteres)');label.htmlFor=note.id;
  const checked=node('input');checked.type='checkbox';checked.checked=item.reviewed;checked.id='check-'+item.id;const checkLabel=node('label','Ya revisé este resultado');checkLabel.htmlFor=checked.id;checkLabel.prepend(checked);
  const actions=node('div',null,'actions'),save=node('button','Guardar cambios'),remove=node('button','Eliminar','danger'),status=node('p');status.setAttribute('role','status');
  async function change(task){const epoch=generation;save.disabled=true;remove.disabled=true;status.textContent='Guardando…';say('history-state','Guardando cambios…');try{await task();if(epoch===generation)await history();}catch(e){if(epoch===generation){status.textContent=e.message;say('history-state',e.message);save.disabled=false;remove.disabled=false;}}}
  save.onclick=()=>{if(checked.checked===item.reviewed&&note.value===(item.note||'')){status.textContent='No hay cambios que guardar.';return;}change(()=>cloud.update(item.id,checked.checked,note.value));};remove.onclick=()=>{if(confirm('¿Eliminar esta revisión de tu cuenta?'))change(()=>cloud.remove(item.id));};actions.append(save,remove);card.append(head,reasons,node('p',item.recommendation),label,note,checkLabel,actions,status);return card;
 }
 async function history(){if(historyBusy)return;historyBusy=true;const epoch=generation;$('refresh-history').disabled=true;$('history-list').replaceChildren();dashboard(null,'Consultando tus registros guardados…');say('history-state','Consultando tu historial…');try{const items=await cloud.list();if(epoch!==generation)return;for(const item of items)$('history-list').append(historyCard(item));const message=items.length?items.length+' revisiones guardadas (máximo 50 recientes).':'Aún no guardaste revisiones.';say('history-state',message);dashboard(items,message);}catch(e){if(epoch===generation){say('history-state',e.message);dashboard(null,e.message);}}finally{historyBusy=false;$('refresh-history').disabled=false;if(epoch!==generation&&['inicio','resumen','historial'].includes(location.hash.slice(1)))loadDashboard();}}
 $('refresh-history').onclick=history;
 $('clear-history').onclick=async()=>{if(!confirm('¿Eliminar todas las revisiones guardadas en tu cuenta? Esta acción no se puede deshacer.'))return;const epoch=generation;$('clear-history').disabled=true;try{let n=0;for(let batch=0;batch<20;batch++){if(epoch!==generation)return;const items=await cloud.list();if(epoch!==generation)return;if(!items.length)break;for(const item of items){if(epoch!==generation)return;await cloud.remove(item.id);n++;}if(items.length<50)break;}if(epoch!==generation)return;await history();if(epoch===generation)say('history-state','Se eliminaron '+n+' revisiones. Si quedan más, puedes repetir el borrado.');}catch(e){if(epoch===generation)say('history-state',e.message);}finally{$('clear-history').disabled=false;}};
 function focusMain(target){
  target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start',behavior:'instant'});
 }
 document.querySelector('.skip').onclick=event=>{
  event.preventDefault();focusMain(document.querySelector('.screen:not([hidden])'));
 };
 function route(moveFocus=false){
  const key=['inicio','revisar','historial','resumen','cuenta'].includes(location.hash.slice(1))?location.hash.slice(1):'inicio';
  const screen=$(key);
  for(const section of document.querySelectorAll('.screen'))section.hidden=section!==screen;
  for(const a of document.querySelectorAll('.portal-nav a')){
   if(a.hash==='#'+key)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
  document.body.dataset.screen=key;
  const label=({inicio:'Tu orientación digital',revisar:'Revisar',historial:'Mi historial',resumen:'Resumen',cuenta:'Mi cuenta'})[key];
  document.title=label+' | Aquila Guard';say('page-title',label);
  if(moveFocus)focusMain(screen.querySelector('h1')??screen);
  else scrollTo({top:0,behavior:'instant'});
  if(key==='revisar')ensureIntel();
  if(key==='historial')history();
  if(['inicio','resumen'].includes(key))loadDashboard();
  if(key==='cuenta')account();
 }
 if('serviceWorker' in navigator){
  const wasControlled=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(wasControlled)$('update-notice').hidden=false;});
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(()=>{});
 }
 $('reload-app').onclick=()=>{if(($('input').value||pendingMail)&&!confirm('La recarga descartará el contenido que estás revisando. ¿Continuar?'))return;location.reload();};
 const entry=new URL(location.href);
 if(entry.searchParams.get('modo')==='telefono'&&(!entry.hash||entry.hash==='#revisar')){
  $('type').value='telefono';$('type').dispatchEvent(new Event('change'));
  if(!entry.hash)globalThis.history.replaceState(null,'',entry.pathname+entry.search+'#revisar');
 }
 $('reload-intel').onclick=()=>{if(!intelLoading)firstIntelRequest=intel();};
 addEventListener('hashchange',()=>route(true));route();account();
 const caseId=entry.searchParams.get('caso');
 if(caseId&&/^(?:real-[1-3]|control-1)$/.test(caseId)){(async()=>{try{const request=mailLoad;await ensureIntel();const response=await fetch('data/real-cases.json');if(!response.ok)throw Error();const data=await response.json(),item=[...data.cases,...data.controls].find(x=>x.id===caseId);if(!item)throw Error();if(request!==mailLoad)return;$('type').value='enlace';$('type').dispatchEvent(new Event('change'));$('input').value=item.url;globalThis.history.replaceState(null,'',location.pathname+'#revisar');route();$('scan-form').requestSubmit();}catch{say('scan-state','No se pudo cargar el caso. Vuelve a la página de casos e inténtalo de nuevo.');}})();}

})();
