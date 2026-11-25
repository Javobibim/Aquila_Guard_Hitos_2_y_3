'use strict';
const keyName='aquila-key';
let accessKey='';
try{accessKey=sessionStorage.getItem(keyName)||'';}catch{}
function setAccessKey(value){
 accessKey=value;
 try{
  if(value)sessionStorage.setItem(keyName,value);
  else sessionStorage.removeItem(keyName);
 }catch{}
}
// Acceso local desde el lanzador. El fragmento no viaja en la petición HTTP.
if(location.hash.startsWith('#acceso=')){
 const access=location.hash.slice(8);
 if(/^[A-Za-z0-9_-]{16,128}$/.test(access))setAccessKey(access);
 history.replaceState(null,'','#inicio');
}


// Cliente Hito 2: API en el mismo origen con historial persistente.
const $ = id => document.getElementById(id);
const pages = ['inicio', 'revisar', 'alertas', 'resumen', 'ajustes'];
const types = {
  enlace: {
    label: 'Pega un enlace ficticio',
    help: 'Incluye http:// o https:// y un dominio. Máximo 8192 caracteres para enlaces. No abriremos la dirección.',
    example: 'https://banc0.example/validar',
    neutral: 'https://biblioteca.example/horarios'
  },
  correo: {
    label: 'Pega el contenido de un correo ficticio',
    help: 'Pega el asunto o el texto del correo, no solo una dirección. Hasta 50.000 caracteres para correos.',
    example: 'Asunto: cuenta suspendida. Es urgente, entrega tu clave en https://cuenta.example',
    neutral: 'La biblioteca informa que el taller de lectura comienza el jueves.'
  },
  mensaje: {
    label: 'Pega un mensaje o SMS ficticio',
    help: 'Escribe entre 5 y 10.000 caracteres. Usa datos inventados.',
    example: 'Premio disponible: envía tu clave para recibirlo hoy.',
    neutral: 'El taller de lectura comienza el jueves a las diez.'
  },
  telefono: {
    label: 'Ingresa un teléfono ficticio',
    help: 'Entre 7 y 15 dígitos. Se permiten + al inicio, espacios, paréntesis y guiones. No llamaremos ni consultaremos reportes.',
    example: '+1 202 555 0100',
    neutral: '+1 202 555 0101'
  }
};

// 2. Estado de la pestaña. Recargar elimina esta lista y las preferencias.
const session = []; // Caché de presentación. La fuente persistente es la API.
let currentType = 'enlace';
let timer = null;

// Estas operaciones se comparten para evitar repetir cambios del formulario.
function setBusy(busy) {
  $('analyze').disabled = busy;
  $('scan-input').disabled = busy;
  $('analyze').textContent = busy ? 'Revisando ejemplo…' : 'Revisar y guardar';
}

function cancel() {
  clearTimeout(timer);
  timer = null;
  setBusy(false);
}

function resetFeedback(message = '') {
  $('input-error').textContent = '';
  $('scan-input').removeAttribute('aria-invalid');
  $('result').hidden = true;
  $('status').textContent = message;
  $('clear-status').textContent = '';
}

// 3. Navegación y selección del contenido.
function showPage(focus = true) {
  const requested = location.hash.slice(1);
  const target = pages.includes(requested) ? requested : 'inicio';

  document.querySelectorAll('main>section').forEach(section => {
    section.hidden = section.id !== target;
  });
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + target) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.title = target.charAt(0).toUpperCase() + target.slice(1) + ' | Aquila Guard';
  $('page-title').textContent = {
    inicio: 'Tu orientación digital', revisar: 'Revisa un contenido',
    alertas: 'Centro de alertas', resumen: 'Resumen de tu actividad', ajustes: 'Tus preferencias'
  }[target];
  if (focus) $('h-' + target).focus({ preventScroll: true });
  window.scrollTo(0, 0);
  render();
}

function setType() {
  cancel();
  currentType = document.querySelector('[name=tipo]:checked').value;
  const config = types[currentType];
  $('input-label').textContent = config.label;
  $('input-help').textContent = config.help;
  $('scan-input').value = '';
  const inputModes = { telefono: 'tel', enlace: 'url' };
  $('scan-input').inputMode = inputModes[currentType] || 'text';
  $('scan-input').maxLength = {enlace:8192,correo:50000,mensaje:10000,telefono:32}[currentType];
  resetFeedback();
}

function sample(key) {
  cancel();
  $('scan-input').value = types[currentType][key];
  resetFeedback('Ejemplo ficticio cargado. Puedes editarlo.');
  $('scan-input').focus();
}

// El servidor valida y aplica las reglas. El cliente solo presenta sus respuestas.
async function api(path,method='GET',body,idempotencyKey){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const r=await fetch('/api/v1'+path,{method,signal:controller.signal,headers:{Authorization:'Bearer '+accessKey,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined});
  if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error?.message||'No se pudo conectar al servicio.');}
  return r.status===204?null:await r.json();
 }catch(error){if(error.name==='AbortError')throw Error('El servidor tardó demasiado. Comprueba la ventana Iniciar_Servidor y vuelve a intentar.');if(error.name==='TypeError')throw Error('No hay conexión con el servidor local. Abre Iniciar_Servidor y vuelve a intentar.');throw error;}
 finally{clearTimeout(timeout);}
}

let busy=false,pendingAnalysis=null;
$('scan-input').addEventListener('input',()=>{pendingAnalysis=null;});
function mapItem(a,alert){return {id:a.id,type:a.tipo,text:a.resumen||'Revisión guardada',title:a.titulo,reasons:a.razones,signal:a.con_senales,recommend:a.recomendacion,reviewed:alert?.revisada??false,alertId:alert?.id};}
async function allPages(path){let values=[],offset=0;for(;;){const r=await api(path+'?limit=100&offset='+offset);values.push(...r.data);if(r.data.length<100)break;offset+=100;}return values;}
async function reload(){
 const [a,b]=await Promise.all([allPages('/analisis'),allPages('/alertas')]);
 session.splice(0,session.length,...a.map(x=>mapItem(x,b.find(y=>y.analisis_id===x.id))));render();
}
async function analyze(event){
 event.preventDefault();if(busy)return;
 busy=true;setBusy(true);$('result').hidden=true;$('input-error').textContent='';$('status').textContent='Revisando contenido…';
 try{
  const text=$('scan-input').value.trim(),type=currentType;
  if(pendingAnalysis?.type!==type||pendingAnalysis.text!==text)pendingAnalysis={type,text,key:crypto.randomUUID()};
  const {data:a}=await api('/analisis','POST',{tipo:type,contenido:text},pendingAnalysis.key);
  pendingAnalysis=null;
  let alert;try{alert=(await api('/alertas','POST',{analisis_id:a.id})).data;}catch(e){$('review-status').textContent='El análisis se guardó. No se creó su ficha: '+e.message;}
  const item=mapItem(a,alert);session.unshift(item);showResult(item,type,text);render();
 }catch(e){$('input-error').textContent=e.message;$('status').textContent='No se completó la revisión. Conservamos tu entrada.';}
 finally{busy=false;setBusy(false);}
}
// textContent muestra la entrada como texto: no interpreta HTML del usuario.
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function showResult(result, type, text) {
  $('clear-status').textContent = '';
  $('result-title').textContent = result.title;
  $('result-input').textContent = types[type].label + ': ' + text;
  $('reasons').replaceChildren(...result.reasons.map(reason => element('li', reason)));
  $('recommend').textContent = result.recommend;
  $('result').hidden = false;
  $('status').textContent = 'Resultado de ejemplo disponible.';
  if (!$('revisar').hidden) $('result-title').focus();
}

// 6. Alertas y Resumen siempre se calculan desde la misma lista de sesión.
function createAlert(item, index) {
  const article = document.createElement('article');
  const heading = element('h2', 'Revisión ' + item.id.slice(0,8) + ' · ' + item.title);
  const content = element('p', item.text);
  const status = element('p', item.reviewed ? 'Revisada' : 'Sin revisar');
  const label = item.reviewed
    ? 'Marcar ejemplo ' + item.id + ' sin revisar'
    : 'Marcar ejemplo ' + item.id + ' como revisado';
  const button = element('button', label);
  button.onclick = async () => {
    button.disabled=true;
    try{
      if(!item.alertId)item.alertId=(await api('/alertas','POST',{analisis_id:item.id})).data.id;
      const {data}=await api('/alertas/'+item.alertId,'PATCH',{revisada:!item.reviewed});
      item.reviewed=data.revisada;render();$('review-status').textContent='Estado guardado.';
    }catch(e){$('review-status').textContent=e.message;button.disabled=false;}
  };
  const remove=element('button','Eliminar revisión');
  remove.onclick=async()=>{remove.disabled=true;try{await api('/analisis/'+item.id,'DELETE');await reload();}catch(e){$('review-status').textContent=e.message;remove.disabled=false;}};
  article.append(remove);
  article.append(heading, content, status, button);
  return article;
}

function render() {
  const cards = session.length
    ? session.map(createAlert)
    : [element('p', 'Aún no hay resultados. Comienza en Revisar.')];
  $('alert-list').replaceChildren(...cards);

  const unread = session.filter(item => !item.reviewed).length;
  $('mark').disabled = unread === 0;
  $('total').textContent = session.length;
  $('signals').textContent = session.filter(item => item.signal).length;
  $('unread').textContent = unread;
  renderDashboard(unread);
}

// La portada y sus gráficos usan la misma sesión; no hay métricas inventadas.
function renderDashboard(unread) {
  const counts = {
    total: session.length, signals: session.filter(item => item.signal).length,
    unread, reviewed: session.length - unread
  };
  document.querySelectorAll('[data-count]').forEach(node => {
    node.textContent = counts[node.dataset.count];
  });
  document.querySelectorAll('[data-meter]').forEach(node => {
    node.style.width = (counts.total ? counts[node.dataset.meter] / counts.total * 100 : 0) + '%';
  });
  for (const type of Object.keys(types)) {
    const count = session.filter(item => item.type === type).length;
    document.querySelector('[data-type-count="' + type + '"]').textContent = count;
    document.querySelector('[data-type-bar="' + type + '"]').style.height =
      (counts.total ? count / counts.total * 100 : 0) + '%';
  }
  const recent = session.slice(0, 3).map(item => {
    const row = document.createElement('div');
    row.className = 'activity';
    const number = element('span', String(item.id).padStart(2, '0'));
    number.className = 'ico';
    const body = document.createElement('div');
    body.append(element('b', item.title), element('small', item.text));
    const state = element('span', item.type === 'telefono' ? 'Solo formato' : item.signal ? 'Con señales' : 'Sin patrones');
    state.className = item.signal ? 'risk flagged' : 'risk';
    row.append(number, body, state);
    return row;
  });
  const empty = element('p', 'Aún no hay resultados. Comienza en Revisar.');
  empty.className = 'empty-state';
  $('recent-list').replaceChildren(...(recent.length ? recent : [empty]));
}

async function markAllReviewed(){
 $('mark').disabled=true;
 try{for(const item of session.filter(x=>!x.reviewed)){
  if(!item.alertId)item.alertId=(await api('/alertas','POST',{analisis_id:item.id})).data.id;
  await api('/alertas/'+item.alertId,'PATCH',{revisada:true});
 }await reload();$('review-status').textContent='Fichas marcadas como revisadas.';
 }catch(e){await reload().catch(()=>{});$('review-status').textContent=e.message;}
}
async function clearSession(){
 if(!confirm('¿Eliminar del servidor todas tus revisiones guardadas y sus alertas?'))return;
 $('clear').disabled=true;
 try{for(const item of [...session])await api('/analisis/'+item.id,'DELETE');
  await reload();$('scan-input').value='';resetFeedback();
  for(const id of ['result-title','result-input','reasons','recommend'])$(id).textContent='';
  $('clear-status').textContent='Revisiones eliminadas del servidor.';
 }catch(e){await reload().catch(()=>{});$('clear-status').textContent='No se completó el borrado: '+e.message;}
 finally{$('clear').disabled=false;}
}
// 7. Conectar los controles existentes. No cambia HTML, estilos ni textos.
window.addEventListener('hashchange', showPage);
document.querySelectorAll('[name=tipo]').forEach(input => input.addEventListener('change', setType));
document.querySelectorAll('[data-review-type]').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelector('[name=tipo][value="' + link.dataset.reviewType + '"]').checked = true;
    setType();
  });
});
$('scan-form').addEventListener('submit', analyze);
$('scan-input').oninput = () => { $('clear-status').textContent = ''; };
$('example').onclick = () => sample('example');
$('neutral').onclick = () => sample('neutral');
$('mark').onclick = markAllReviewed;
$('clear').onclick = clearSession;

$('retry').onclick = () => {
  $('result').hidden = true;
  $('scan-input').value = '';
  $('status').textContent = 'Listo para otro ejemplo.';
  $('scan-input').focus();
};
$('tour').onclick = () => {
  $('tour-help').hidden = false;
  $('tour').setAttribute('aria-expanded', 'true');
  $('tour-help').scrollIntoView({ block: 'nearest' });
};
$('tour').setAttribute('aria-expanded', 'false');
$('tour').setAttribute('aria-controls', 'tour-help');
$('large-text').onchange = event => document.documentElement.classList.toggle('large', event.target.checked);
$('privacy').onclick = () => {
  const open = $('privacy-content').hidden;
  $('privacy-content').hidden = !open;
  $('privacy').setAttribute('aria-expanded', String(open));
};

// 8. Inicio: preparar el formulario sin desplazar el foco del navegador.
setType();
showPage(false);

$('connect-form').onsubmit=async event=>{
 event.preventDefault();setAccessKey($('access-key').value);$('access-key').value='';
 try{await reload();$('connection-state').textContent='Conectado. Historial recuperado del servidor.';}
 catch(e){setAccessKey('');$('connection-state').textContent=e.message;}
};
if(accessKey)reload().then(()=>$('connection-state').textContent='Conectado al servidor.').catch(e=>$('connection-state').textContent=e.message);
