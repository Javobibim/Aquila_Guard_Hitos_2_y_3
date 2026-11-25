/* Análisis local adicional. Cabeceras aportadas no equivalen a verificación de origen. */
(() => {
 'use strict';
 const psl = new Set(globalThis.AquilaPublicSuffixRules || []);
 const brands = [
  {name:'BancoEstado',tokens:['bancoestado'],domains:['bancoestado.cl']},
  {name:'Banco de Chile',tokens:['bancochile'],domains:['bancochile.cl']},
  {name:'Santander',tokens:['santander'],domains:['santander.cl','santander.com']},
  {name:'BCI',tokens:['bci'],domains:['bci.cl']},
  {name:'PayPal',tokens:['paypal'],domains:['paypal.com']},
  {name:'Microsoft',tokens:['microsoft','outlook','office365'],domains:['microsoft.com','outlook.com','office.com','microsoftonline.com']},
  {name:'Google',tokens:['google','gmail'],domains:['google.com','gmail.com']},
  {name:'Apple',tokens:['apple','icloud'],domains:['apple.com','icloud.com']},
  {name:'Mercado Libre',tokens:['mercadolibre','mercadopago'],domains:['mercadolibre.cl','mercadolibre.com','mercadopago.cl','mercadopago.com']}
 ];
 const cleanHost = input => {try{return new URL('https://'+input).hostname.toLowerCase().replace(/\.$/,'');}catch{return '';}};
 function org(host) {
  const h=cleanHost(host);if(!h||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.startsWith('['))return h;
  const labels=h.split('.');let count=1;
  for(let i=0;i<labels.length;i++){
   const suffix=labels.slice(i).join('.');
   if(psl.has('!'+suffix)){count=labels.length-i-1;break;}
   if(psl.has(suffix))count=Math.max(count,labels.length-i);
   if(i>0&&psl.has('*.'+suffix))count=Math.max(count,labels.length-i+1);
  }
  return labels.slice(-Math.min(count+1,labels.length)).join('.');
 }
 const belongs=(h,domains)=>domains.some(d=>h===d||h.endsWith('.'+d));
 function near(a,b){
  if(a===b)return false;if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length){const diff=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff.push(i);return diff.length===1||(diff.length===2&&diff[1]===diff[0]+1&&a[diff[0]]===b[diff[1]]&&a[diff[1]]===b[diff[0]]);}
  const [s,l]=a.length<b.length?[a,b]:[b,a];let i=0,j=0,skip=0;while(i<s.length&&j<l.length){if(s[i]===l[j]){i++;j++;}else{skip++;j++;if(skip>1)return false;}}return true;
 }
 function urlFindings(input){
  const u=new URL(input),host=u.hostname.toLowerCase().replace(/\.$/,''),registered=org(host),label=registered.split('.')[0];
  const findings=[],add=(id,title,detail)=>findings.push({id,title,detail});
  for(const b of brands){
   if(belongs(host,b.domains))continue;
   const labels=host.split(/[.-]/);
   if(b.tokens.some(t=>labels.includes(t)||label===t||new RegExp('^'+t+'(?:secure|seguridad|login|signin|verify|validar|soporte|support|cuenta)$').test(label))){
    add('brand-domain','El dominio usa el nombre de un servicio conocido','El dominio '+host+' menciona '+b.name+', pero no pertenece a los dominios de referencia incluidos para ese servicio. Verifica por su canal oficial.');break;
   }
   if(b.tokens.some(t=>near(label,t))){
    add('brand-typo','Un dominio se parece a otro con una escritura diferente','El nombre '+registered+' se parece al de '+b.name+' con una letra añadida, cambiada, omitida o intercambiada. La similitud es una señal para comprobar, no una prueba de fraude.');break;
   }
  }
  const registrationPath = /(?:^|\/)(?:register|registration|signup|sign-up|registro|registrarse)(?:\/|$)/i.test(u.pathname);
  const hasClickId = Boolean(u.searchParams.get('click_id')?.trim());
  const hasReferral = Boolean(u.searchParams.get('ref_code')?.trim());
  if (registrationPath && hasClickId && hasReferral) {
   add('registration-referral', 'Registro con seguimiento publicitario',
    'La dirección lleva a un registro e incluye identificadores de clic y referido. Comprueba el sitio antes de registrarte, pagar o ingresar datos.');
  }
  const isPrelander = /(?:^|\/)prelanders?(?:\/|$)/i.test(u.pathname);
  if (isPrelander) {
   const campaignFields = new Set();
   for (const [key, value] of u.searchParams) {
    if (/^var_[1-9]\d?$/i.test(key) && value.trim()) campaignFields.add(key.toLowerCase());
    if (campaignFields.size === 2) {
     add('campaign-prelander', 'Página intermedia con seguimiento publicitario',
      'La dirección parece una página intermedia de campaña. Comprueba el destino antes de confirmar, descargar o ingresar datos.');
     break;
    }
   }
  }
  const destinations=[];
  for(const key of ['url','u','q','redirect','redirect_uri','target','destination','continue','next']){
   let v=u.searchParams.get(key);if(!v)continue;
   for(let i=0;i<2&&!/^https?:\/\//i.test(v);i++){try{const decoded=decodeURIComponent(v);if(decoded===v)break;v=decoded;}catch{break;}}
   if(/^https?:\/\//i.test(v)&&v.length<=8192){try{const nested=new URL(v);if(nested.hostname!==host){destinations.push(v);add('embedded-destination','El enlace contiene otra dirección de destino','La URL contiene un posible destino en '+nested.hostname+'. Se analiza el texto de ese destino sin seguir una redirección real.');}}catch{}}
  }
  return {findings,destinations:destinations.slice(0,5),registeredDomain:registered};
 }
 const entities = s => s.replace(/&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[a-f0-9]{1,6});/gi,m=>{
  const map={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
  if(map[m.toLowerCase()])return map[m.toLowerCase()];
  const n=m[2]?.toLowerCase()==='x'?parseInt(m.slice(3,-1),16):parseInt(m.slice(2,-1),10);
  return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
 });
 const visibleHtml = html => html.replace(/<!--[\s\S]*?(?:-->|$)|<(script|style|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ');
 const plain = html => entities(visibleHtml(html).replace(/<(?:[^<>"']|"[^"<]*"|'[^'<]*')*>/g,' ')).replace(/\s+/g,' ');
 function anchorTarget(attributes){
  for(const token of attributes.matchAll(/([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g)){
   if(token[1].toLowerCase()==='href')return token[2]??token[3]??token[4]??'';
  }
  return '';
 }
 const invisible = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/gu;
 const normalizeAddresses = text => text.replace(invisible,'').replace(/\bhxxps?:\/\//gi,m=>m.toLowerCase().startsWith('hxxps')?'https://':'http://').replace(/\[\.\]|\(\.\)/g,'.');
 function headersOf(input){
  const match=input.match(/\r?\n\r?\n/);if(!match)return {headers:{},body:input,raw:false};
  const top=input.slice(0,match.index);
  if(!/^(?:from|de|to|para|subject|asunto|mime-version|received|content-type|content-transfer-encoding|content-disposition|authentication-results):/im.test(top))return {headers:{},body:input,raw:false};
  const headers={};
  for(const line of top.replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/)){
   const p=line.indexOf(':');if(p<1)continue;let key=line.slice(0,p).trim().toLowerCase();
   key=({de:'from',para:'to',asunto:'subject'})[key]||key;
   const value=line.slice(p+1).trim();headers[key]=headers[key]?headers[key]+'\n'+value:value;
  }
  return {headers,body:input.slice(match.index+match[0].length),raw:true};
 }
 function decodeBody(body,headers){
  const encoding=(headers['content-transfer-encoding']||'').toLowerCase(),charset=(headers['content-type']||'').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';
  try{
   if(encoding==='base64'){const decoded=atob(body.replace(/\s/g,''));return new TextDecoder(charset).decode(Uint8Array.from(decoded,c=>c.charCodeAt(0)));}
   if(encoding==='quoted-printable'){
    const bytes=new TextEncoder().encode(body.replace(/=\r?\n/g,''));
    let offset=0;
    for(let i=0;i<bytes.length;i++){
     if(bytes[i]===61){
      const hex=String.fromCharCode(bytes[i+1],bytes[i+2]);
      if(/^[a-f0-9]{2}$/i.test(hex)){bytes[offset++]=parseInt(hex,16);i+=2;continue;}
     }
     bytes[offset++]=bytes[i];
    }
    return new TextDecoder(charset).decode(bytes.subarray(0,offset));
   }
  }catch{return null;}
  return body;
 }
 function mailbox(value){
  const match=(value||'').match(/[a-z0-9.!#$%&'*+/=?^_{}|~-]+@([a-z0-9\u0080-\uffff.-]+\.[a-z\u0080-\uffff]{2,})/i);return match?cleanHost(match[1]):'';
 }
 function displayName(value){
  return (value||'').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,(_,charset,encoding,data)=>{
   try{if(encoding.toLowerCase()==='b')return new TextDecoder(charset).decode(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));return decodeBody(data.replace(/_/g,' '),{'content-transfer-encoding':'quoted-printable','content-type':'text/plain; charset='+charset})||'';}catch{return '';}
  }).replace(/<[^>]*>/g,'').trim();
 }
 function inspectMessage(input,type){
  const findings=[],links=new Set(),add=(id,title,detail)=>{if(!findings.some(f=>f.id===id&&f.detail===detail))findings.push({id,title,detail});};
  const email=type==='correo'?headersOf(input):{headers:{},body:input,raw:false},h=email.headers;
  let examinedParts=0,ignoredAttachments=0,decodeErrors=0,remainingText=50_000;
  const texts=[],htmlParts=[];
  function part(body,headers,depth=0){
   if(depth>3||examinedParts++>=20){decodeErrors++;return;}
   const contentType=headers['content-type']||'text/plain';
   if(/attachment/i.test(headers['content-disposition']||'')||!/^(?:text\/(?:plain|html)|multipart\/)/i.test(contentType)){ignoredAttachments++;return;}
   if(/^multipart\//i.test(contentType)){
    const boundary=contentType.match(/boundary\s*=\s*(?:"([^"]{1,100})"|'([^']{1,100})'|([^;\s]{1,100}))/i);
    if(!boundary){decodeErrors++;return;}
    const token=boundary[1]||boundary[2]||boundary[3];
    const escaped=token.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
    const boundaries=new RegExp('^--'+escaped+'(--)?[ \\t]*(?:\\r?\\n|$)','gm');
    let start=null,closed=false;
    for(const line of body.matchAll(boundaries)){
     if(start!==null){const p=headersOf(body.slice(start,line.index));part(p.body,p.headers,depth+1);}
     if(line[1]){closed=true;break;}
     if(examinedParts>=20){start=null;break;}
     start=line.index+line[0].length;
    }
    if(!closed){decodeErrors++;if(start!==null&&examinedParts<20){const p=headersOf(body.slice(start));part(p.body,p.headers,depth+1);}}
   }else{
    if(remainingText===0||body.length>300_000){decodeErrors++;return;}
    let text=decodeBody(body,headers);if(text===null){decodeErrors++;return;}
    if(text.length>remainingText){text=text.slice(0,remainingText);decodeErrors++;}
    remainingText-=text.length;
    if(/^text\/html/i.test(contentType)||/<(?:html|body|a)\b/i.test(text)){htmlParts.push(text);texts.push(plain(text));}else texts.push(text);
   }
  }
  part(email.body,h);
  const from=mailbox(h.from),reply=mailbox(h['reply-to']),returnPath=mailbox(h['return-path']);
  if((h.from?.match(/@/g)||[]).length>1)add('ambiguous-sender','Se aportan varios remitentes','La cabecera contiene más de una dirección de remitente. Esta revisión no puede determinar cuál representa la identidad real del envío.');
  if(from&&reply&&org(from)!==org(reply))add('reply-mismatch','Responder llevaría a otro dominio','El dominio del remitente es '+from+' y el de respuesta es '+reply+'. Esa diferencia puede tener motivos legítimos; comprueba la solicitud antes de responder.');
  const display=displayName(h.from).toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const b of brands)if(from&&!belongs(from,b.domains)&&b.tokens.some(t=>display.includes(t))){add('sender-brand','El nombre visible y el dominio del remitente no coinciden','El nombre visible menciona '+b.name+', pero el remitente usa '+from+'. El nombre mostrado puede escribirse libremente y no acredita identidad.');break;}
  const auth=h['authentication-results']||'';
  for(const mechanism of ['dmarc','spf','dkim'])if(new RegExp('\\b'+mechanism+'\\s*=\\s*(fail|softfail|permerror)\\b','i').test(auth))add('auth-'+mechanism,'La cabecera aportada indica un problema con '+mechanism.toUpperCase(),'El correo pegado contiene un resultado '+mechanism.toUpperCase()+' adverso. Aquila Guard no verifica criptográficamente esa cabecera ni identifica por sí solo qué servidor la añadió.');
  for(const html of htmlParts){
   for(const m of visibleHtml(html).matchAll(/<a(?=\s|>)([^<>"']*(?:(?:"[^"<]*"|'[^'<]*')[^<>"']*)*)>([\s\S]{0,6000}?)<\/a\s*>/gi)){
    const rawTarget=anchorTarget(m[1]);
    if(!rawTarget||rawTarget.length>8192)continue;
    const target=normalizeAddresses(entities(rawTarget)).trim();
    const href=target.startsWith('//')?'https:'+target:target;
    if(!/^https?:\/\//i.test(href))continue;links.add(href);
    const label=plain(m[2]).trim();
    if(/^(?:https?:\/\/|www\.)/i.test(label)){
     try{const shown=new URL(/^https?:/i.test(label)?label:'https://'+label),real=new URL(href);if(org(shown.hostname)!==org(real.hostname))add('hidden-link','El texto del enlace muestra otro destino','El texto muestra '+shown.hostname+', pero el enlace apunta a '+real.hostname+'. Se comparan las direcciones sin abrirlas.');}catch{}
    }
   }
  }
  let text=[h.subject||'',...texts].join('\n').slice(0,50000);
  if(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u.test(text))add('invisible-characters','Hay caracteres invisibles o de dirección del texto','El contenido incluye caracteres que pueden alterar cómo se muestra una dirección. También pueden aparecer por formato legítimo; revisa el dominio de destino.');
  const normalized=normalizeAddresses(text);
  const intent=normalized.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const request=/\b(envia|envie|entrega|entregue|comparte|comparta|ingresa|ingrese|introduce|introduzca|proporciona|proporcione|confirma|confirme|send|share|enter|provide|confirm)\b/g;
  if(/\b(?:actua|responde|verifica|confirma|paga|ingresa)\b[^.!?\n]{0,40}\b(?:urgente|inmediatamente|ahora mismo)\b|\b(?:tu|su) cuenta (?:esta |sera )?(?:suspendida|bloqueada)\b|\byour account (?:will be |has been )?(?:suspended|locked)\b/.test(intent))add('urgency','Presión para actuar rápido','El mensaje presenta una acción urgente o una amenaza de bloqueo. Comprueba la solicitud por un canal oficial.');
  if(/\b(?:ganaste|has ganado|reclama (?:tu|el) premio|you have won|claim your prize|rentabilidad garantizada)\b/.test(intent))add('prize','Una oferta que conviene comprobar','Comprueba las condiciones y al remitente antes de pagar o entregar datos.');
  for(const match of intent.matchAll(request)){
   const before=intent.slice(Math.max(0,match.index-25),match.index);
   if(/(?:\bno|\bnunca|\bjamas|\bevitar?|\bdebes evitar|\bnever|\bdo not|\bdon't)\s+(?:\w+\s+){0,2}$/.test(before))continue;
   const after=intent.slice(match.index+match[0].length,match.index+match[0].length+100);
   if(/\b(contrasena|clave|pin|otp|codigo de (?:verificacion|seguridad|autenticacion)|token de acceso|password|verification code|security code)\b/.test(after)){add('secrets','El mensaje pide claves o códigos','El texto solicita introducir o compartir una clave o un código. No los envíes por mensaje; comprueba la solicitud desde la aplicación oficial.');break;}
  }
  if(/\b(nueva cuenta|nuevos datos bancarios|cambio de cuenta|cambiamos la cuenta|modific[oó] los datos bancarios)\b/.test(intent)&&/\b(transferencia|transferir|pago|paga|abono|deposito|depositar)\b/.test(intent))add('payment-change','Hay instrucciones de pago con datos bancarios distintos','El mensaje combina un pago con un cambio de cuenta. Confirma el cambio por un teléfono o contacto que ya conocías, especialmente si parece venir de un proveedor habitual.');
  for(const phrase of ['habilitar contenido','habilita el contenido','activar macros','activa las macros','instalar un certificado']){
   const at=intent.indexOf(phrase);
   if(at>=0&&!/(?:\bno|\bnunca|\bjamas|\bevitar?)\s+(?:\w+\s+){0,2}$/.test(intent.slice(Math.max(0,at-20),at)))add('unsafe-instructions','El texto pide habilitar funciones o instalar un certificado','Hay instrucciones para habilitar contenido activo o instalar un certificado. Aquila Guard no inspecciona el adjunto: comprueba el origen antes de realizar esos pasos.');
  }
  for(const m of normalized.matchAll(/https?:\/\/[^\s<>"']{1,8192}/gi))links.add(m[0].replace(/[),.;!?]+$/,''));
  // Una segunda pasada sobre texto sin URLs explícitas evita duplicar destinos o extraer parámetros internos.
  const withoutUrls=normalized.replace(/https?:\/\/[^\s<>"']+/gi,' ');
  for(const m of withoutUrls.matchAll(/(?<![\w@./-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?(?![\w@-])/gi)){
   const candidate=m[0].replace(/[),.;!?]+$/,'');
   try{
    const host=new URL('https://'+candidate).hostname;
    if(host.startsWith('www.')||psl.has(host.split('.').at(-1))||host.endsWith('.example'))links.add('https://'+candidate);
   }catch{}
  }
  if(decodeErrors)add('mail-incomplete','No se pudo interpretar todo el correo','Parte del contenido MIME no pudo decodificarse o superó los límites de esta revisión. No podemos valorar esa parte del mensaje.');
  if(links.size>30)add('link-limit','La revisión de enlaces es parcial','El mensaje contiene más de 30 direcciones distintas. Se revisaron las primeras 30; el resto no pudo valorarse en esta revisión.');
  return {findings,links:[...links].slice(0,30),text:normalized,mail:{hasHeaders:email.raw,fromDomain:from,replyToDomain:reply,returnPathDomain:returnPath,hasAuthenticationResults:!!auth,authenticationVerified:false,examinedParts,ignoredAttachments,decodeErrors}};
 }
 function pageFindings(address,meta){
  if(!meta||typeof meta!=='object'||!Array.isArray(meta.passwordForms)||!Array.isArray(meta.claims)||!Array.isArray(meta.links))throw Error('No se pudo interpretar la información de la página.');
  const host=new URL(address).hostname,findings=[],add=(id,title,detail)=>findings.push({id,title,detail});
  const forms=meta.passwordForms.slice(0,20);
  for(const form of forms){
   if(!form||typeof form.hostname!=='string'||form.hostname.length>253)continue;
   if(form.protocol==='http:')add('password-http','Un formulario de contraseña usa HTTP','Se encontró un formulario de contraseña cuyo destino usa HTTP sin cifrado. No introduzcas datos sensibles hasta comprobar su origen.');
   if(form.hostname&&org(form.hostname)!==org(host))add('password-destination','El formulario declara otro dominio de destino','Un formulario de contraseña tiene destino en '+form.hostname+', distinto del dominio de esta página. Puede existir un acceso externo legítimo; comprueba el destino antes de continuar.');
  }
  if(forms.length||Number(meta.orphanPasswordFields)>0)for(const b of brands)if(!belongs(host,b.domains)&&meta.claims.some(t=>b.tokens.includes(t))){add('page-brand','La página menciona una marca y solicita contraseña desde otro dominio','El título o encabezado menciona '+b.name+' y la página '+host+' contiene campos de contraseña. No coincide con los dominios de referencia incluidos para ese servicio.');break;}
  for(const link of meta.links.slice(0,30))if(typeof link.shownHost==='string'&&typeof link.actualHost==='string'&&link.shownHost.length<=253&&link.actualHost.length<=253&&org(link.shownHost)!==org(link.actualHost))add('page-link-mismatch','Un enlace visible muestra otro dominio','Un enlace muestra '+link.shownHost+', pero apunta a '+link.actualHost+'. Puede utilizar una redirección legítima; comprueba el destino.');
  if(meta.truncated===true)add('page-partial','La inspección de esta página es parcial','La página superó los límites de formularios o enlaces revisados. No se valoraron todos sus elementos.');
  return findings.slice(0,20);
 }
 globalThis.AquilaAdvanced=Object.freeze({org,urlFindings,inspectMessage,pageFindings,publicSuffixRules:psl.size});
})();
