(() => {
 'use strict';
 const api = globalThis.AquilaBrowser;
 const patterns = ['http://*/*','https://*/*'];
 const config = {id:'aquila-url',matches:patterns,js:['intrusive.js','content.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true};
 const el = id => document.getElementById(id);
 let working = false;
 function feedback(message) { el('feedback').textContent = message; }
 let reviewGeneration = 0;
 function clearReview() {
  ++reviewGeneration;
  document.dispatchEvent(new CustomEvent('aquila-result',{detail:null}));
  el('review-result').hidden = true;
  for (const id of ['review-title','review-domain','review-note']) el(id).textContent = '';
  el('review-reasons').replaceChildren();
 }
 function busy(value) { working = value; for (const id of ['enable','disable']) el(id).disabled = value; }
 async function state() {
  const {enabled} = await api.storage.local.get('enabled');
  const granted = await api.permissions.contains({origins:patterns});
  const scripts = await api.scripting.getRegisteredContentScripts({ids:[config.id]});
  const registered = scripts.some(script => script.id === config.id && script.js?.includes('content.js')&&script.js?.includes('intrusive.js'));
  const ready = enabled === true && granted && registered;
  el('state').textContent = ready ? 'Avisos automáticos activados' : enabled ? 'Falta completar la activación' : 'Avisos automáticos pausados';
  el('state').dataset.active = String(ready);
  el('state-detail').textContent = ready ? 'Revisamos direcciones, publicidad invasiva y recargas repetidas en este dispositivo. ON indica activación.' : 'Pulsa Activar mis avisos y acepta el acceso a sitios para revisar direcciones y señales de la página. La revisión manual sigue disponible.';
  const tab = ready ? await currentTab() : null;
  el('tab-risk').hidden = !tab?.id || await api.action.getBadgeText({tabId:tab.id}) !== '!';
  el('enable').hidden = ready; el('disable').hidden = enabled !== true;
  el('diagnostic').textContent = 'Versión ' + api.runtime.getManifest().version + '. Acceso a sitios: ' + (granted ? 'concedido' : 'pendiente') + '. Script actualizado: ' + (registered ? 'sí' : 'no') + '. Motor local con copia de PhishDestroy primary. Historial opcional con Firebase.';
 }
 function renderResult(result) {
  const box = el('review-result'); box.hidden = false; box.dataset.signals = String(result.hasSignals);
  const level = result.classification === 'reported' ? 'red' : result.hasSignals ? 'amber' : result.intel ? 'neutral' : 'unknown';
  let indicator = el('review-signal');
  if (!indicator) {
   indicator = document.createElement('p');indicator.id = 'review-signal';indicator.className = 'risk-signal';
   el('review-title').before(indicator);
  }
  indicator.dataset.level = level;
  const lights = document.createElement('span');lights.className = 'risk-lights';lights.setAttribute('aria-hidden','true');
  for (const color of ['red','amber']) {
   const dot = document.createElement('i');dot.dataset.color = color;lights.append(dot);
  }
  const label = {red:'Dominio reportado',amber:'Precaución',neutral:'Sin señales en lo revisado',unknown:'Solo reglas locales · lista no disponible'}[level];
  indicator.replaceChildren(lights, document.createTextNode(label));
  el('review-title').textContent = result.title;
  el('review-domain').textContent = result.hostname;
  const list = el('review-reasons'); list.replaceChildren();
  for (const finding of result.findings) {
   const li = document.createElement('li');
   const title = document.createElement('strong'); title.textContent = finding.title;
   const detail = document.createElement('span'); detail.textContent = finding.detail;
   li.append(title, detail); list.append(li);
  }
  el('review-note').textContent = (result.assumedHttps ? 'Como no indicaste el protocolo, revisamos la dirección como HTTPS. ' : '') + result.limitation;
  document.dispatchEvent(new CustomEvent('aquila-result',{detail:result}));
  el('link-form').closest('details').open = false;
  el('review-title').setAttribute('tabindex','-1');
  el('review-title').focus({preventScroll:true});
  box.scrollIntoView({block:'nearest'});
 }
 async function review(input) {
  const generation=++reviewGeneration;feedback('Revisando en este dispositivo…');
  try {const response=await api.runtime.sendMessage({type:'aquila-analyze',input});if(generation!==reviewGeneration)return;if(!response?.ok)throw Error(response?.error||'Vuelve a abrir el panel para reintentar.');renderResult(response.data);feedback('Revisión local completada.');}
  catch(error){if(generation===reviewGeneration){clearReview();feedback(error.message);}}
 }
 async function currentTab() { const [tab] = await api.tabs.query({active:true,currentWindow:true}); return tab; }
 el('phone-directory').onclick=()=>{
  const url=new URL('/?modo=telefono#revisar',AquilaConfig.appUrl);
  api.tabs.create({url:url.href}).catch(()=>feedback('No pudimos abrir el directorio en una pestaña.'));
 };
 el('auto-test').onclick=()=>{const url=new URL('prueba-extension.html',AquilaConfig.appUrl);url.searchParams.set('next','https://bancoestado.cl.acceso.example/verificar');api.tabs.create({url:url.href}).catch(()=>feedback('No se pudo abrir la prueba. Comprueba tu conexión.'));};
 el('test').onclick = () => api.tabs.create({url:api.runtime.getURL('test.html')}).catch(() => feedback('No pudimos abrir el ejemplo. Inténtalo otra vez.'));
 el('current').onclick = async () => {
  clearReview(); feedback('');
  try {
   const tab = await currentTab();
   if (!tab?.url || !/^https?:\/\//i.test(tab.url)) { feedback('En esta pestaña el navegador no permite revisar la dirección. Abre una página web y pulsa el icono de Aquila Guard; también puedes pegar el enlace aquí.'); return; }
   review(tab.url);
  } catch { feedback('No pudimos leer esta pestaña. Puedes pegar el enlace para revisarlo.'); }
 };
 el('inspect-page').onclick=async()=>{clearReview();const generation=++reviewGeneration;el('inspect-page').disabled=true;feedback('Examinando metadatos en este dispositivo…');try{const tab=await currentTab();if(!tab?.id||!/^https?:\/\//i.test(tab.url||''))throw Error('Esta pestaña no permite inspección. Abre una página web normal.');const [snapshot]=await api.scripting.executeScript({target:{tabId:tab.id},func:globalThis.AquilaPageSnapshot.capture});if(generation!==reviewGeneration)return;const response=await api.runtime.sendMessage({type:'aquila-analyze-page',input:tab.url,meta:snapshot.result});if(generation!==reviewGeneration)return;if(!response?.ok)throw Error(response?.error||'No se pudo completar la inspección.');renderResult(response.data);feedback('Inspección local completada. No se leyeron valores de los campos.');}catch(e){if(generation===reviewGeneration){clearReview();feedback(e.message);}}finally{el('inspect-page').disabled=false;}};
 el('link-form').onsubmit = event => { event.preventDefault(); feedback(''); review(el('link-input').value); };
 el('clear-link').onclick = () => { el('link-input').value=''; clearReview(); feedback('Enlace borrado de este panel.'); el('link-input').focus(); };
 el('link-input').oninput = () => { clearReview(); feedback(''); };
 el('enable').onclick = async () => {
  if (working) return;
  try {
   // Sin await antes de pedir el permiso: conserva el gesto del clic.
   const requested = api.permissions.request({origins:patterns}); busy(true); feedback('');
   if (!await requested) { feedback('No se concedió el permiso. La revisión manual sigue disponible.'); await state(); return; }
   const existing = await api.scripting.getRegisteredContentScripts({ids:[config.id]});
   if (existing.length) await api.scripting.updateContentScripts([config]); else await api.scripting.registerContentScripts([config]);
   await api.storage.local.set({enabled:true}); await state();
   try {
    const tab = await currentTab();
    if (tab?.id && /^https?:\/\//i.test(tab.url || '')) await api.scripting.executeScript({target:{tabId:tab.id},files:['intrusive.js','content.js']});
   } catch {/* Las páginas restringidas y pestañas descartadas no admiten inyección. */}
   feedback('Listo. Los avisos están activados. Recarga las otras pestañas que ya tenías abiertas para revisarlas.');
  } catch { feedback('No pudimos completar la activación. Pulsa de nuevo Activar mis avisos.'); await state().catch(() => {}); }
  finally { busy(false); }
 };
 el('disable').onclick = async () => {
  if (working) return; busy(true); feedback('');
  try {
   await api.storage.local.set({enabled:false});
   const existing = await api.scripting.getRegisteredContentScripts({ids:[config.id]});
   if (existing.length) await api.scripting.unregisterContentScripts({ids:[config.id]});
   await state(); feedback('Avisos pausados. La revisión manual sigue disponible.');
  } catch { await state().catch(() => {}); feedback('No pudimos comprobar todos los permisos. Consulta Información para soporte o vuelve a intentarlo.'); }
  finally { busy(false); }
 };
 async function refreshState() {
  try { await api.runtime.sendMessage({type:'aquila-status'}); } catch {/* El estado real sigue siendo consultable si el servicio se reinicia. */}
  await state();
 }
 api.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.enabled)state().catch(()=>{});});
 refreshState().catch(() => { el('state').textContent='No pudimos comprobar el estado'; feedback('Cierra y vuelve a abrir Aquila Guard. Puedes reintentar la activación.'); });
})();
