/* Adaptador REST de Firebase: no requiere código remoto ni claves de servidor. */
(() => {
 'use strict';
 const errors = {
  EMAIL_EXISTS:'Ese correo ya tiene una cuenta. Usa Iniciar sesión.',
  INVALID_LOGIN_CREDENTIALS:'El correo o la contraseña no coinciden.',EMAIL_NOT_FOUND:'El correo o la contraseña no coinciden.',INVALID_PASSWORD:'El correo o la contraseña no coinciden.',
  INVALID_EMAIL:'Revisa el formato del correo.',WEAK_PASSWORD:'Usa una contraseña de al menos 8 caracteres.',
  TOO_MANY_ATTEMPTS_TRY_LATER:'Hubo muchos intentos. Espera un momento antes de reintentar.',
  OPERATION_NOT_ALLOWED:'Falta activar Correo/contraseña en Firebase Authentication.',USER_DISABLED:'Esta cuenta está deshabilitada.',
  PERMISSION_DENIED:'No tienes acceso a esos datos. Comprueba la sesión y las reglas de Firestore.',
  RESOURCE_EXHAUSTED:'Se alcanzó una cuota gratuita. La revisión local sigue disponible.',
  FAILED_PRECONDITION:'La base de datos necesita configuración. Revisa Firestore en Firebase.',
  UNAUTHENTICATED:'Tu sesión venció. Inicia sesión otra vez.'
 };
 const encode = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, typeof v === 'boolean' ? {booleanValue:v} : {stringValue:String(v)}]));
 const decode = doc => ({id:doc.name.split('/').pop(),...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,v.stringValue ?? v.booleanValue ?? v.timestampValue]))});
 function normalizePhone(input) {
  if(typeof input!=='string'||input.length>40||!/^\+?[0-9 ().-]+$/.test(input.trim()))throw Error('Ingresa un teléfono internacional completo.');
  const compact=input.trim().replace(/[ ().-]/g,'').replace(/^00/,'+');
  if(!/^\+[1-9][0-9]{6,14}$/.test(compact))throw Error('Incluye el código internacional, por ejemplo +56 para Chile.');
  return compact;
 }
 async function phoneReportKey(input) {
  const compact=normalizePhone(input);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('aquila-phone-v1:'+compact));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 }
 function create(config, storage, fetcher = globalThis.fetch.bind(globalThis), observeHistoryResponse) {
  const ready = /^[a-z][a-z0-9-]{4,29}$/.test(config.projectId||'') && /^[A-Za-z0-9_-]{15,100}$/.test(config.apiKey||'');
  const project = config.projectId;
  // Los emuladores solo se permiten en una compilación de pruebas y en loopback.
  const emulator = config.testEmulators === true && project === 'demo-aquila-guard';
  const authBase = emulator ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/' : 'https://identitytoolkit.googleapis.com/v1/';
  const refreshBase = emulator ? 'http://127.0.0.1:9099/securetoken.googleapis.com/v1/token' : 'https://securetoken.googleapis.com/v1/token';
  const dbRoot = `projects/${project}/databases/(default)/documents`;
  const dbBase = (emulator ? 'http://127.0.0.1:8085/v1/' : 'https://firestore.googleapis.com/v1/') + dbRoot;
  let revision = 0, refreshPending = null, listPending = null, verificationSentAt = 0, verificationPending = false;
  const sessionKey = 'aquila-cloud-session';
  function requireReady() { if (!ready) throw new Error('Firebase todavía no está configurado. Puedes revisar contenidos sin iniciar sesión.'); }
  async function request(url, options={}, operation) {
   const controller = new AbortController();
   const timer = setTimeout(()=>controller.abort(),10000);
   try {
    const response = await fetcher(url,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(operation)observeHistoryResponse?.(operation,response.status);
    let data; try { data=await response.json(); } catch { throw new Error('El servicio devolvió una respuesta incompleta. Inténtalo otra vez.'); }
    if (!response.ok) {
     const code = String(data?.error?.status || data?.error?.message || '').split(' : ')[0];
     const e = new Error(errors[code] || 'No pudimos completar la operación en Firebase. Inténtalo otra vez.');
     e.code = code; e.status = response.status; throw e;
    }
    return data;
   } catch(e) {
    if (e.name === 'AbortError') throw new Error('El servicio tardó demasiado. La revisión local sigue disponible.');
    if (e.name === 'TypeError') throw new Error('No hay conexión con Firebase. Reintenta cuando tengas internet.');
    throw e;
   } finally { clearTimeout(timer); }
  }
  const post = (url,body,headers={},operation) => request(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)},operation);
  async function getSession() {
   const s = await storage.get(sessionKey);
   return s?.projectId === project ? s : null;
  }
  function verified(s){
   try{
    const claims=JSON.parse(atob(s.idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return claims.email_verified===true;
   }catch{return false;}
  }
  async function publicSession() { const s=await getSession(); return s ? {uid:s.uid,email:s.email,verified:verified(s)} : null; }
  async function signIn(email,password,signup=false) {
   requireReady();
   if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('Usa un correo válido y una contraseña de entre 8 y 128 caracteres.');
   const generation = ++revision;
   const data=await post(authBase+(signup?'accounts:signUp':'accounts:signInWithPassword')+'?key='+encodeURIComponent(config.apiKey),{email:email.trim(),password,returnSecureToken:true});
   if (generation !== revision) throw new Error('El inicio de sesión se canceló.');
   listPending=null;
   await storage.set(sessionKey,{projectId:project,uid:data.localId,email:data.email,idToken:data.idToken,refreshToken:data.refreshToken,expiresAt:Date.now()+Number(data.expiresIn)*1000});
   return publicSession();
  }
  async function signOut() { ++revision;listPending=null;await storage.remove(sessionKey); }
  async function session(force=false) {
   requireReady();
   const generation=revision, s=await getSession();
   if(generation!==revision)throw new Error('La sesión cambió. Vuelve a intentarlo.');
   if (!s) throw new Error('Inicia sesión para guardar o consultar tu historial.');
   if (!force && s.expiresAt > Date.now()+60000) return s;
   if(refreshPending?.generation===generation)return refreshPending.result;
   const result=(async()=>{
     try {
      const data=await request(refreshBase+'?key='+encodeURIComponent(config.apiKey),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:s.refreshToken}).toString()});
      if(generation !== revision) throw new Error('La sesión se cerró.');
      const fresh={...s,idToken:data.id_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Number(data.expires_in)*1000};
      await storage.set(sessionKey,fresh);return fresh;
     } catch(e) { if (generation === revision && ['INVALID_REFRESH_TOKEN','TOKEN_EXPIRED','USER_DISABLED','USER_NOT_FOUND'].includes(e.code)) await signOut(); throw e; }
   })();
   const pending={generation,result};
   refreshPending=pending;
   try{return await result;}finally{if(refreshPending===pending)refreshPending=null;}
  }
  async function sendVerification(){
   if(verificationPending||Date.now()-verificationSentAt<60_000)throw new Error('Espera un minuto antes de pedir otro correo.');
   verificationPending=true;
   try{
    const s=await session();
    if(verified(s))return;
    await post(authBase+'accounts:sendOobCode?key='+encodeURIComponent(config.apiKey),{requestType:'VERIFY_EMAIL',idToken:s.idToken},{'X-Firebase-Locale':'es'});
    verificationSentAt=Date.now();
   }finally{verificationPending=false;}
  }
  async function refreshVerification(){await session(true);return publicSession();}
  async function historySession(){
   const s=await session();
   if(!verified(s))throw new Error('Verifica tu correo en Mi cuenta para usar el historial.');
   return s;
  }
  function docName(s,id) { if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Identificador no válido.');return `${dbRoot}/users/${s.uid}/analyses/${id}`; }
  async function get(id){
   const s=await historySession();
   docName(s,id);
   try{return decode(await request(dbBase+'/users/'+s.uid+'/analyses/'+id,{headers:{Authorization:'Bearer '+s.idToken}},'get'));}
   catch(error){if(error.status===404)return null;throw error;}
  }
  async function lookupPhoneReport(input) {
   const key=await phoneReportKey(input);
   if(!await getSession())throw Error('Inicia sesión en Mi cuenta para consultar reportes de teléfonos.');
   const s=await session();
   if(!verified(s))throw Error('Verifica tu correo en Mi cuenta para consultar reportes de teléfonos.');
   const current=revision,path='/phoneLookupGrants/'+s.uid,headers={Authorization:'Bearer '+s.idToken};
   let grant;
   try{grant=await request(dbBase+path,{headers});}
   catch(error){if(error.status!==404)throw error;}
   const previous=grant?.fields;
   const now=Date.now();
   const newWindow=!previous||now-Date.parse(previous.windowStartedAt.timestampValue)>=86_400_000;
   if(previous&&now-Date.parse(previous.updatedAt.timestampValue)<6000)throw Error('Espera seis segundos entre consultas.');
   const count=newWindow?1:Number(previous.count.integerValue)+1;
   if(count>20)throw Error('Alcanzaste el límite de 20 consultas por cuenta en 24 horas.');
   const fields={key:{stringValue:key},count:{integerValue:String(count)}};
   if(!newWindow)fields.windowStartedAt=previous.windowStartedAt;
   const transform=fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'});
   if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
   await post(dbBase+':commit',{writes:[{
    update:{name:dbRoot+path,fields},
    currentDocument:grant?{updateTime:grant.updateTime}:{exists:false},
    updateTransforms:[transform('updatedAt'),...(newWindow?[transform('windowStartedAt')]:[])]
   }]},headers);
   if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
   let report;
   try{report=decode(await request(dbBase+'/phoneReports/'+key,{headers}));}
   catch(error){if(error.status===404)return null;throw error;}
   if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
   if(!['reviewed','demo'].includes(report.status))throw Error('No se pudo comprobar el estado del reporte.');
   return {status:report.status};
  }
  async function submitPhoneTip(input,category,origin) {
   const key=await phoneReportKey(input);
   if(!['smishing','impersonation','callback'].includes(category)||
      !['caller_id','callback_number','sms_sender'].includes(origin))throw Error('Elige el tipo de intento y dónde viste el número.');
   if(!await getSession())throw Error('Inicia sesión en Mi cuenta para enviar el reporte.');
   const s=await session();
   if(!verified(s))throw Error('Verifica tu correo en Mi cuenta para enviar el reporte.');
   const current=revision,headers={Authorization:'Bearer '+s.idToken};
   const tip='/users/'+s.uid+'/phoneTips/'+key,limit='/phoneTipLimits/'+s.uid;
   const getOptional=async path=>{
    try{return await request(dbBase+path,{headers});}
    catch(error){if(error.status===404)return null;throw error;}
   };
   const existing=await getOptional(tip);
   if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
   if(existing)return {status:decode(existing).status,existing:true};
   const previous=await getOptional(limit);
   if(previous&&Date.now()-Date.parse(previous.fields.updatedAt.timestampValue)<600_000)
    throw Error('Puedes enviar un reporte cada diez minutos.');
   const stamp=fieldPath=>[{fieldPath,setToServerValue:'REQUEST_TIME'}];
   if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
   try{
    await post(dbBase+':commit',{writes:[
     {update:{name:dbRoot+tip,fields:encode({category,origin,status:'pending'})},
      currentDocument:{exists:false},updateTransforms:stamp('createdAt')},
     {update:{name:dbRoot+limit,fields:encode({key})},
      currentDocument:previous?{updateTime:previous.updateTime}:{exists:false},updateTransforms:stamp('updatedAt')},
    ]},headers);
   }catch(error){
    if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
    if(['ALREADY_EXISTS','FAILED_PRECONDITION','PERMISSION_DENIED'].includes(error.code)){
     const duplicate=await getOptional(tip);
     if(duplicate&&current===revision)return {status:decode(duplicate).status,existing:true};
    }
    throw error;
   }
   if(current!==revision)throw Error('La sesión cambió. Vuelve a intentarlo.');
   return {status:'pending',existing:false};
  }
  async function list() {
   const s=await historySession();
   if(listPending?.token===s.idToken)return listPending.result;
   const result=post(dbBase+'/users/'+s.uid+':runQuery',{structuredQuery:{from:[{collectionId:'analyses'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:50}},{Authorization:'Bearer '+s.idToken},'list').then(data=>data.filter(r=>r.document).map(r=>decode(r.document)));
   const pending={token:s.idToken,result};
   listPending=pending;
   try{return await result;}finally{if(listPending===pending)listPending=null;}
  }
  async function save(id,record) {
   const s=await historySession(), name=docName(s,id);
   const body={writes:[{update:{name,fields:encode(record)},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'},{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]};
   try { await post(dbBase+':commit',body,{Authorization:'Bearer '+s.idToken},'create'); }
   catch(e) { if(e.code!=='ALREADY_EXISTS')throw e; }
   listPending=null;return id;
  }
  async function update(id,reviewed,note) {
   if (typeof reviewed !== 'boolean' || typeof note !== 'string' || note.length > 300) throw new Error('La nota admite hasta 300 caracteres.');
   const s=await historySession();
   try{
    await post(dbBase+':commit',{writes:[{update:{name:docName(s,id),fields:encode({reviewed,note})},updateMask:{fieldPaths:['reviewed','note']},currentDocument:{exists:true},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]},{Authorization:'Bearer '+s.idToken},'update');
   }catch(e){if(e.code==='PERMISSION_DENIED')throw new Error('El historial rechazó el cambio. Comprueba que haya cambios y espera unos segundos antes de reintentar.');throw e;}
   listPending=null;
  }
  async function remove(id) {
   const s=await historySession();await post(dbBase+':commit',{writes:[{delete:docName(s,id)}]},{Authorization:'Bearer '+s.idToken},'delete');listPending=null;
  }
  async function reset(email) { requireReady();if(typeof email!=='string'||email.length>254||!email.includes('@'))throw new Error('Escribe tu correo en el formulario.');await post(authBase+'accounts:sendOobCode?key='+encodeURIComponent(config.apiKey),{requestType:'PASSWORD_RESET',email}); }
  return Object.freeze({configured:ready,publicSession,signIn,signOut,sendVerification,refreshVerification,list,get,save,update,remove,reset,lookupPhoneReport,submitPhoneTip});
 }
 globalThis.AquilaCloud=Object.freeze({create,phoneReportKey});
})();
