/* Motor compartido por la app y la extensión. No visita los enlaces. */
(() => {
 'use strict';
 const urlRules = globalThis.AquilaRules;
 const VERSION = '0.5.0';
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
 function analyze(type, input) {
  if (!['enlace','correo','mensaje','telefono'].includes(type)) throw new Error('Selecciona un tipo de contenido.');
  if (typeof input !== 'string' || !input.trim()) throw new Error('Escribe o pega el contenido que quieres revisar.');
  const text = input.trim();
  if (text.length > (type === 'enlace' ? 8192 : 2000)) throw new Error('El contenido supera el tamaño permitido para esta revisión.');
  let findings = [], hostname = '', assumedHttps = false, protocol = '', checkedLinks = 0;
  const add = (id,title,detail) => { if (!findings.some(f => f.id === id && f.detail === detail) && findings.length < 20) findings.push({id,title,detail}); };
  const checkLink = address => {
   const result = urlRules.analyze(address);
   checkedLinks++;
   hostname ||= result.hostname;
   protocol ||= result.protocol;
   assumedHttps ||= result.assumedHttps;
   if (intel && listed(result.hostname)) add('reported','Dominio incluido en una lista de reportes', result.hostname + ' aparece en PhishDestroy primary, copia del ' + new Date(intel.fetchedAt).toLocaleDateString('es-CL',{timeZone:'America/Santiago'}) + '. Puede haber errores o cambios posteriores: comprueba por un canal oficial.');
   for (const f of result.findings) add(f.id, f.title, f.detail);
  };
  if (type === 'enlace') checkLink(text);
  else if (type === 'telefono') {
   if (!/^\+?[\d\s()-]{7,24}$/.test(text) || (text.match(/\d/g)||[]).length < 7 || (text.match(/\d/g)||[]).length > 15) throw new Error('Usa un número de entre 7 y 15 dígitos, con código de país si lo conoces.');
  } else {
   const patterns = [
    ['urgency',/\b(urgente|inmediatamente|última oportunidad|cuenta suspendida|cuenta bloqueada)\b/iu,'Presión para actuar rápido','El mensaje presiona para actuar rápido. Comprueba la solicitud con la entidad por un canal conocido.'],
    ['secrets',/\b(contraseña|clave|código de verificación|c[oó]digo otp|pin)\b/iu,'Menciona claves o códigos','No compartas contraseñas ni códigos de verificación. Esta palabra puede aparecer también en mensajes legítimos.'],
    ['prize',/\b(ganaste|premio|herencia|rentabilidad garantizada)\b/iu,'Una oferta que conviene comprobar','Comprueba las condiciones y al remitente antes de pagar o entregar datos.']
   ];
   for (const [id,re,title,detail] of patterns) if(re.test(text)) add(id,title,detail);
   const links = [...new Set(text.match(/https?:\/\/[^\s<>"']+/giu)||[])].slice(0,10);
   for (const address of links) { try { checkLink(address.replace(/[),.;!?]+$/,'')); } catch { add('unreadable-link','Hay un enlace incompleto','No pudimos interpretar uno de los enlaces del mensaje. No lo abras hasta comprobarlo.'); } }
  }
  const reported = findings.some(f => f.id === 'reported');
  const classification = type === 'telefono' ? 'format_only' : reported ? 'reported' : findings.length ? 'signals' : 'no_match';
  const title = {reported:'Dominio reportado: haz una pausa',signals:'Encontramos señales para revisar',no_match:'Sin coincidencias en esta revisión',format_only:'Formato revisado; identidad sin comprobar'}[classification];
  const recommendation = type === 'telefono' ? 'No consultamos quién es el dueño ni si el número tiene denuncias. Verifica por un canal oficial.' : 'No entregues claves ni códigos. Usa una dirección oficial que ya conozcas para comprobar la solicitud.';
  return {id:crypto.randomUUID(),type,hostname,protocol,assumedHttps,findings,hasSignals:findings.length>0,classification,title,recommendation,version:VERSION,intel:intel ? {...intel} : null,checkedLinks,
   limitation: (intel ? 'Contrastamos dominios exactos con una copia de reportes; no seguimos redirecciones ni verificamos al remitente.' : 'La lista de reportes no está disponible: solo se aplicaron reglas locales.') + ' No encontrar señales no garantiza seguridad.'};
 }
 function toRecord(result, source) {
  if (!['app','extension'].includes(source)) throw new Error('Origen no válido.');
  return {source,inputType:result.type,hostname:result.hostname || '',preview: result.type === 'enlace' ? result.hostname : 'Revisión de ' + result.type + ' (contenido omitido)',classification:result.classification,hasSignals:result.hasSignals,
   reasons:result.findings.map(f => f.detail).join('\n').slice(0,6000),recommendation:result.recommendation.slice(0,500),ruleVersion:VERSION,intelVersion:result.intel?.fetchedAt || 'no-disponible',reviewed:false,note:''};
 }
 globalThis.AquilaEngine = Object.freeze({version:VERSION,setReputation,status,analyze,toRecord});
})();
