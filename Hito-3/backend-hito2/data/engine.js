/* Motor compartido por la app y la extensión. No visita los enlaces. */
(() => {
 'use strict';
 const urlRules = globalThis.AquilaRules;
 const VERSION = '0.6.10';
 let domains = new Set(), intel = null;
 function setReputation(data) {
  if (!data || data.format !== 1 || !Array.isArray(data.domains) || data.domains.length < 1 || data.domains.length > 1000000 || data.source !== 'PhishDestroy primary' || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('La lista de reportes no tiene un formato válido.');
  if (data.domains.some(d => typeof d !== 'string' || d.length > 253 || !/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/.test(d))) throw new Error('La lista contiene un dominio no válido.');
  domains = new Set(data.domains);
  intel = {source:data.source, fetchedAt:data.fetchedAt, count:domains.size};
  return {...intel};
 }
 function status() { return {version:VERSION, reputation:intel ? {...intel} : null}; }
 function listed(hostname) {
  // No se hereda la reputación de un dominio a todos sus subdominios: evita
  // atribuir reportes de un cliente a otras personas en alojamientos compartidos.
  return domains.has(hostname) || (hostname.startsWith('www.') && domains.has(hostname.slice(4)));
 }
 function analyze(type, input, {mailFile=false}={}) {
  if (!['enlace','correo','mensaje','telefono'].includes(type)) throw new Error('Selecciona un tipo de contenido.');
  if (typeof input !== 'string' || !input.trim()) throw new Error('Escribe o pega el contenido que quieres revisar.');
  const text = input.trim();
  if (text.length > (type === 'enlace' ? 8192 : type === 'correo' ? (mailFile ? 2_097_152 : 50_000) : 10000)) throw new Error('El contenido supera el tamaño permitido para esta revisión.');
  let findings = [], hostname = '', assumedHttps = false, protocol = '', checkedLinks = 0, mailAnalysis=null;
  const seenLinks=new Set();
  const add = (id,title,detail) => {
   if (findings.some(f => f.id === id && f.detail === detail)) return;
   if (findings.length === 20) {
    const lowerRisk = findings.findLastIndex(f => f.id !== 'reported');
    if (id !== 'reported' || lowerRisk < 0) return;
    findings.splice(lowerRisk,1);
   }
   findings.push({id,title,detail});
  };
  const checkLink = address => {
   if(seenLinks.has(address)||seenLinks.size>=30)return;seenLinks.add(address);
   const result = urlRules.analyze(address);
   checkedLinks++;
   hostname ||= result.hostname;
   protocol ||= result.protocol;
   assumedHttps ||= result.assumedHttps;
   if (intel && listed(result.hostname)) add('reported','Dominio incluido en una lista de reportes', result.hostname + ' aparece en PhishDestroy primary, copia del ' + new Date(intel.fetchedAt).toLocaleDateString('es-CL',{timeZone:'America/Santiago'}) + '. Puede haber errores o cambios posteriores: comprueba por un canal oficial.');
   for (const f of result.findings) add(f.id, f.title, f.detail);
   if(globalThis.AquilaAdvanced){const advanced=AquilaAdvanced.urlFindings(result.address);for(const f of advanced.findings)add(f.id,f.title,f.detail);for(const nested of advanced.destinations)checkLink(nested);}
  };
  if (type === 'enlace') checkLink(text);
  else if (type === 'telefono') {
   if (!/^\+?[\d\s()-]{7,24}$/.test(text) || (text.match(/\d/g)||[]).length < 7 || (text.match(/\d/g)||[]).length > 15) throw new Error('Usa un número de entre 7 y 15 dígitos, con código de país si lo conoces.');
  } else {
   const inspected=globalThis.AquilaAdvanced?.inspectMessage(text,type);
   if(inspected){mailAnalysis=inspected.mail;for(const f of inspected.findings)add(f.id,f.title,f.detail);}
   if(intel&&type==='correo'&&mailAnalysis){
    for(const [label,host] of [['remitente',mailAnalysis.fromDomain],['respuesta',mailAnalysis.replyToDomain],['retorno',mailAnalysis.returnPathDomain]]){
     if(host&&listed(host))add('reported','Dominio de correo incluido en reportes',host+' figura en PhishDestroy primary y aparece en la dirección de '+label+' del texto aportado.');
    }
   }
   const scanned=inspected?.text||text;
   const patterns = [
    ['urgency',/\b(urgente|inmediatamente|última oportunidad|cuenta suspendida|cuenta bloqueada)\b/iu,'Presión para actuar rápido','El mensaje presiona para actuar rápido. Comprueba la solicitud con la entidad por un canal conocido.'],
    ['secrets',/\b(contraseña|clave|código de verificación|c[oó]digo otp|pin)\b/iu,'Menciona claves o códigos','No compartas contraseñas ni códigos de verificación. Esta palabra puede aparecer también en mensajes legítimos.'],
    ['prize',/\b(ganaste|premio|herencia|rentabilidad garantizada)\b/iu,'Una oferta que conviene comprobar','Comprueba las condiciones y al remitente antes de pagar o entregar datos.']
   ];
   if(!inspected)for (const [id,re,title,detail] of patterns) if(re.test(scanned.normalize('NFKC'))) add(id,title,detail);
   const links = inspected?.links || [...new Set(text.match(/https?:\/\/[^\s<>"']+/giu)||[])].slice(0,10);
   for (const address of links) { try { checkLink(address.replace(/[),.;!?]+$/,'')); } catch { add('unreadable-link','Hay un enlace incompleto','No pudimos interpretar uno de los enlaces del mensaje. No lo abras hasta comprobarlo.'); } }
  }
  const reported = findings.some(f => f.id === 'reported');
  const classification = type === 'telefono' ? 'format_only' : reported ? 'reported' : findings.length ? 'signals' : 'no_match';
  const title = {reported:'Dominio reportado: haz una pausa',signals:'Encontramos señales para revisar',no_match:'Sin coincidencias en esta revisión',format_only:'Formato revisado; identidad sin comprobar'}[classification];
  const recommendation = type === 'telefono' ? 'No consultamos quién es el dueño ni si el número tiene denuncias. Verifica por un canal oficial.' : 'No entregues claves ni códigos. Usa una dirección oficial que ya conozcas para comprobar la solicitud.';
  return {id:crypto.randomUUID(),type,hostname,protocol,assumedHttps,findings,hasSignals:findings.length>0,classification,title,recommendation,version:VERSION,intel:intel ? {...intel} : null,checkedLinks,mailAnalysis,
   limitation: (intel ? 'Contrastamos una copia de reportes y señales locales. No abrimos sitios ni seguimos redirecciones reales. Las cabeceras aportadas no se validan criptográficamente; no se analizan imágenes, adjuntos ni códigos QR.' : 'La lista de reportes no está disponible: solo se aplicaron reglas locales.') + ' No encontrar señales no garantiza seguridad.'};
 }
 function toRecord(result, source) {
  if (!['app','extension'].includes(source)) throw new Error('Origen no válido.');
  return {source,inputType:result.type,hostname:result.hostname || '',preview: result.type === 'enlace' ? result.hostname : 'Revisión de ' + result.type + ' (contenido omitido)',classification:result.classification,hasSignals:result.hasSignals,
   reasons:result.findings.map(f => f.detail).join('\n').slice(0,6000),recommendation:result.recommendation.slice(0,500),ruleVersion:VERSION,intelVersion:result.intel?.fetchedAt || 'no-disponible',reviewed:false,note:''};
 }
 function analyzePage(address,meta){
  const r=analyze('enlace',address);
  for(const f of AquilaAdvanced.pageFindings(address,meta))if(r.findings.length<20&&!r.findings.some(x=>x.id===f.id&&x.detail===f.detail))r.findings.push(f);
  for(const host of [...new Set(meta.links.slice(0,30).map(l=>l.actualHost).filter(h=>typeof h==='string'&&/^[a-z0-9.-]{1,253}$/i.test(h)))])if(listed(host)&&r.findings.length<20)r.findings.push({id:'page-reported-link',title:'La página contiene un enlace a un dominio reportado',detail:'Un enlace revisado apunta a '+host+', incluido en la copia de PhishDestroy primary. No se abrió ese destino.'});
  r.hasSignals=r.findings.length>0;r.classification=r.findings.some(f=>['reported','page-reported-link'].includes(f.id))?'reported':r.hasSignals?'signals':'no_match';
  r.title=r.classification==='reported'?'Encontramos una coincidencia con reportes':r.hasSignals?'Encontramos señales para revisar':'Sin coincidencias en esta inspección';
  r.pageAnalysis={passwordForms:Math.min(meta.passwordForms.length,20),linksCompared:Math.min(meta.links.length,30),fieldValuesRead:false};
  r.limitation+=' La inspección manual lee metadatos de formularios y enlaces; no lee valores de campos ni observa envíos por JavaScript. Los marcos de otros orígenes no se inspeccionan.';
  return r;
 }
 function reportedHosts(hosts){
  if(!Array.isArray(hosts))return [];
  return [...new Set(hosts.slice(0,20).filter(host=>typeof host==='string'&&host.length<=253&&/^[a-z0-9.-]+$/.test(host)&&listed(host)))];
 }
 globalThis.AquilaEngine = Object.freeze({version:VERSION,setReputation,status,analyze,analyzePage,toRecord,reportedHosts});
})();
