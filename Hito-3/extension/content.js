(() => {
 const api=globalThis.browser||globalThis.chrome;
 const marker='aquila-guard-url-warning';
 const campaignTitles={
  'registration-referral':'Registro con seguimiento publicitario',
  'campaign-prelander':'Página intermedia con seguimiento publicitario'
 };
 const version=api.runtime.getManifest().version;
 if(globalThis.AquilaContent?.version===version){globalThis.AquilaContent.refresh();return;}
 let warning=null;
 function clearWarning(){warning?.host.remove();warning=null;}
 function urlReasons(address){try{return globalThis.AquilaRules.analyze(address).findings.map(f=>f.detail);}catch{return [];}}
 function showWarning(reasons,demo=false,hostname='',kind='url'){
  if(!reasons.length||warning?.host.isConnected)return;
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
  const host=document.createElement('div');host.id=marker;host.dataset.aquilaKind=kind;
  host.style.cssText='all:initial!important;position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;width:calc(100vw - 40px)!important;max-width:410px!important;display:block!important;color-scheme:light!important';
  const root=host.attachShadow({mode:'open'});
  const style=node('style','',`
   :host{color-scheme:light}
   *,*::before,*::after{box-sizing:border-box}
   .notice{font:16px/1.55 "Segoe UI",Arial,sans-serif;color:#172f4b;background:#fff;border:1px solid #dce5ef;border-radius:20px;overflow:hidden;box-shadow:0 18px 60px #0a244036,0 3px 12px #0a244014;max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);display:flex;flex-direction:column;animation:appear .2s ease-out}
   .brand{flex:none;display:flex;align-items:center;gap:12px;background:linear-gradient(115deg,#102747,#1d4874);padding:18px 20px;color:#fff}
   .logo{width:46px;height:46px;object-fit:contain;border-radius:13px;flex:none;background:#102747}
   .brand-copy{flex:1;min-width:0}.name{display:block;font-size:17px;font-weight:700;letter-spacing:.15px}.tagline{display:block;font-size:12px;line-height:1.5;color:#c5d6e9;margin-top:1px}
   button{font:inherit;cursor:pointer}.close{align-self:flex-start;border:0;background:#ffffff12;border-radius:9px;width:44px;height:44px;color:#eaf2fa;font-size:22px;line-height:1;display:grid;place-items:center;flex:none}.close:hover{background:#ffffff26}
   .body{padding:22px;overflow-y:auto;min-height:0}.label{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.75px;text-transform:uppercase;color:#8e5609;margin-bottom:12px}.dot{width:7px;height:7px;border-radius:50%;background:#e4a02c;flex:none}
   h2{margin:0 0 12px;font-size:23px;line-height:1.23;font-weight:700;letter-spacing:-.45px;color:#142e4c}p{margin:0}ul{padding-left:20px;margin:0;color:#42536b;font-size:16px;line-height:1.6}li+li{margin-top:8px}li::marker{color:#c48a28}
   .domain{font-family:Consolas,monospace;font-size:15px;overflow-wrap:anywhere;background:#edf3f9;border-radius:8px;padding:9px 11px;margin:0 0 15px}.domain span{display:block;font:12px/1.5 \"Segoe UI\",Arial,sans-serif;color:#546b82;margin-bottom:3px}.advice{margin-top:18px;padding-top:16px;border-top:1px solid #e8edf3;font-size:16px;color:#283f59}.advice b{display:block;color:#173b5c;margin-bottom:3px}
   .demo{margin-top:15px;font-size:12px;line-height:1.5;color:#34638f;background:#edf4fb;border-radius:9px;padding:10px 12px}
   .foot{padding:0 22px 20px;flex:none}.understood{width:100%;min-height:48px;border:0;border-radius:11px;background:#153b62;color:#fff;font-weight:600;font-size:16px;padding:10px 18px}.understood:hover{background:#204f7f}
   .fineprint{margin-top:11px;color:#64758a;font-size:12px;line-height:1.5;text-align:center}
   button:focus-visible{outline:3px solid #2162a8;outline-offset:3px}
   .signals{display:inline-flex;gap:4px;align-items:center;margin-right:4px}.signals i{width:10px;height:10px;border-radius:50%;background:#d8e1ea;border:1px solid #a7b5c4}.signals .active-amber{background:#e4a02c;border-color:#815316}.signals .active-red{background:#d62d41;border-color:#a2192e}.danger .label{color:#a11932}.danger h2{color:#841a2f}
   @keyframes appear{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
   @media(prefers-reduced-motion:reduce){.notice{animation:none}}
   @media(max-width:440px){.brand{padding:15px 16px}.body{padding:18px}.foot{padding:0 18px 18px}h2{font-size:21px}}
  `);
  const adReport=kind==='ad-reported',intrusive=kind==='intrusive'||adReport,login=kind==='login',reload=kind==='reload',survey=kind==='timed-survey';
  const danger=adReport||kind==='reported';
  const dismiss=()=>{if(login)loginDismissed=location.href;else dismissed.add(location.href);clearWarning();};
  const panel=node('section',danger?'notice danger':'notice');panel.setAttribute('role',danger?'alert':'status');panel.setAttribute('aria-label',login?'Recordatorio de inicio de sesión de Aquila Guard':danger?'Riesgo alto en Aquila Guard':intrusive?'Aviso de publicidad invasiva de Aquila Guard':demo?'Aviso de prueba de Aquila Guard':'Aviso de Aquila Guard');
  const brand=node('header','brand');
  const logo=node('img','logo');logo.src=api.runtime.getURL('assets/aquila_guard_logo.png');logo.alt='';logo.width=46;logo.height=46;
  const copy=node('div','brand-copy');copy.append(node('strong','name','Aquila Guard BETA'),node('span','tagline','Una pausa para navegar con cuidado'));
  const close=node('button','close','×');close.type='button';close.setAttribute('aria-label','Cerrar aviso');close.onclick=dismiss;brand.append(logo,copy,close);
  const body=node('div','body'),label=node('div','label'),lights=node('span','signals');
  lights.setAttribute('aria-hidden','true');
  for(const color of ['red','amber','green'])lights.append(node('i',color===(danger?'red':'amber')?'active-'+color:''));
  label.append(lights,node('span','',login?'Recordatorio':danger?'Riesgo alto':demo?'Vista de prueba':'Precaución'));
  const list=node('ul','');for(const reason of reasons)list.append(node('li','',reason));
  const title=login?'Antes de iniciar sesión':adReport?'Un anuncio apunta a un dominio reportado':danger?'Dominio reportado':intrusive?'Precaución: publicidad invasiva':survey?'Encuesta inesperada con límite de tiempo':reload?'Recargas repetidas':demo?'Así te avisamos':campaignTitles[kind]||'Revisa antes de continuar';
  body.append(label,node('h2','',title));if(hostname){const domain=node('p','domain');domain.append(node('span','',login||intrusive||reload?'Página que estás visitando':'Dominio de destino'),node('b','',hostname));body.append(domain);}body.append(list);
  if(!login){
   const advice=node('p','advice');
   const instruction=survey?'Evita responder o entregar datos de pago. Si la encuesta apareció al abrir un anuncio, cierra la pestaña.':intrusive?'No aceptes notificaciones ni instales archivos solo para reproducir un video. Si se abre otra pestaña inesperada, ciérrala.':'No entregues claves. Comprueba la dirección por un canal oficial que ya conozcas.';
   advice.append(node('b','',intrusive?'Evita clics y descargas inesperadas.':'Haz una pausa antes de actuar.'),node('span','',instruction));
   body.append(advice);
  }
  if(demo)body.append(node('p','demo',intrusive?'Demostración del equipo con espacios publicitarios ficticios. No hay anuncios de terceros ni contenido malicioso.':'Esta es una demostración del equipo. Se evalúa un destino escrito en la URL sin navegar a él. Esta página no es el sitio reportado.'));
  const foot=node('footer','foot'),done=node('button','understood','Entendido');done.type='button';done.onclick=dismiss;
  foot.append(done,node('p','fineprint',login?'Recordatorio de seguridad. Puedes seguir usando la página.':'Revisión experimental de la dirección. No confirma fraude ni garantiza seguridad.'));panel.append(brand,body,foot);root.append(style,panel);warning={host,kind};document.documentElement.append(host);root.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();});
 }
 const dismissed=new Set();
 let enabled=false,lastAddress='',timer,inFlight=false,retryAt=0,failures=0;
 let loginDismissed='',loginFocusAddress='';
 let checkGeneration=0;
 let pageObserver,pageDebounce,pageStop,pageInitial,pageChecks=0;
 const privateMessages=['https://mail.google.com','https://messages.google.com'].includes(location.origin);
 function remindAboutLogin(){
  if(!enabled||document.hidden||loginFocusAddress!==location.href||loginDismissed===location.href)return;
  showWarning(['Comprueba que el dominio sea el oficial antes de ingresar tu usuario o contraseña.'],false,location.hostname,'login');
 }
 function stopPageWatch(){pageObserver?.disconnect();pageObserver=null;clearTimeout(pageDebounce);pageDebounce=null;clearTimeout(pageStop);clearTimeout(pageInitial);}
 let inspectingAds=false;
 async function inspectIntrusive(){
  const address=location.href;
  if(privateMessages||!enabled||document.hidden||inspectingAds||['reported','ad-reported'].includes(warning?.kind)||!globalThis.AquilaIntrusive)return;
  const summary=AquilaIntrusive.collect();
  let reported=[];
  if(summary.adHosts?.length){
   inspectingAds=true;
   try{const reply=await api.runtime.sendMessage({type:'aquila-analyze-ad-hosts',hosts:summary.adHosts});if(reply?.ok&&Array.isArray(reply.data))reported=reply.data;}catch{}
   finally{inspectingAds=false;}
  }
  if(!enabled||document.hidden||address!==location.href||(!reported.length&&dismissed.has(address)))return;
  if(['reported','ad-reported'].includes(warning?.kind))return;
  const reasons=AquilaIntrusive.classify(summary);
  const survey=AquilaIntrusive.hasTimedSurvey();
  const kind=reported.length?'ad-reported':survey?'timed-survey':'intrusive';
  if(survey)reasons.unshift('La página afirma que fuiste seleccionado al azar y te da poco tiempo para participar en una encuesta o premio.');
  if(reported.length)reasons.unshift('Un enlace publicitario apunta a '+reported.join(', ')+', en la copia local de PhishDestroy. El destino no se abrió.');
  if(!reasons.length)return;
  if(!reported.length&&warning?.host.isConnected&&warning.kind!=='login'&&(!survey||warning.kind===kind))return;
  clearWarning();
  const demo=kind==='intrusive'&&location.origin==='https://aquila-guard-a3ddd.web.app'&&location.pathname==='/prueba-publicidad.html';
  showWarning(reasons,demo,location.hostname,kind);
  if(reported.length)stopPageWatch();
 }
 function startPageWatch(){
  stopPageWatch();pageChecks=0;
  if(privateMessages||!enabled||!globalThis.AquilaIntrusive)return;
  pageInitial=setTimeout(inspectIntrusive,1200);
  pageObserver=new MutationObserver(records=>{
   if(pageChecks>=30)return;
   if(!records.some(r=>r.type==='attributes'||r.type==='characterData'||r.addedNodes.length||r.removedNodes.length))return;
   // Programación limitada: una página que cambia constantemente no aplaza la revisión.
   if(pageDebounce)return;
   pageDebounce=setTimeout(()=>{pageDebounce=null;pageChecks++;inspectIntrusive();},1000);
  });
  pageObserver.observe(document.documentElement,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['src','title','class','style','hidden','data-ad-slot','data-ad-unit']});
  pageStop=setTimeout(stopPageWatch,90000);
 }
 async function check(force=false){
  if(!enabled||!['http:','https:'].includes(location.protocol)||inFlight)return;
  const address=location.href;
  if(!force&&(address===lastAddress||Date.now()<retryAt))return;
  clearWarning();
  if(dismissed.has(address)){lastAddress=address;return;}
  if(dismissed.size>20)dismissed.clear();
  const generation=++checkGeneration;inFlight=true;
  let timeout;
  try{
   const navigation=globalThis.performance?.getEntriesByType('navigation')[0];
   const response=await Promise.race([api.runtime.sendMessage({type:'aquila-analyze-auto',navigationType:navigation?.type,navigationStarted:globalThis.performance?.timeOrigin}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('La revisión tardó demasiado.')),8000);})]);
   if(!enabled||generation!==checkGeneration||address!==location.href)return;
   if(!response?.ok)throw Error(response?.error||'No se obtuvo respuesta.');
   lastAddress=address;failures=0;retryAt=0;
   const result=response.data;
   const demo=location.origin==='https://aquila-guard-a3ddd.web.app'&&location.pathname==='/prueba-extension.html';
   const reasons=result?.findings.map(f=>f.detail)||[];
   const reload=result?.reloads>=3;
   if(reload)reasons.push('La pestaña volvió a cargar la misma página al menos tres veces en 30 segundos. Puede ser una acción manual, un error o una redirección del sitio.');
   if(reasons.length){
    if(warning?.kind==='login')clearWarning();
    let kind='url';
    if(result.classification==='reported')kind='reported';
    else if(reload)kind='reload';
    else if(result.findings.length===1&&Object.hasOwn(campaignTitles,result.findings[0].id))kind=result.findings[0].id;
    showWarning(reasons,demo,result.hostname,kind);
   }else remindAboutLogin();
   startPageWatch();
  }catch(error){
   if(/context invalidated/i.test(error.message)){enabled=false;clearInterval(timer);stopPageWatch();return;}
   if(enabled&&address===location.href){failures++;retryAt=Date.now()+Math.min(15000,1500*2**Math.min(failures,3));}
  }finally{clearTimeout(timeout);inFlight=false;}
 }

 function watch(){
  clearInterval(timer);
  if(enabled&&['http:','https:'].includes(location.protocol))timer=setInterval(()=>{if(!document.hidden)check();},1500);
 }
 async function refresh(){
  if(!['http:','https:'].includes(location.protocol))return;
  try{enabled=(await api.storage.local.get('enabled')).enabled===true;}catch{enabled=false;}
  if(enabled){watch();check(true);}else{++checkGeneration;clearInterval(timer);stopPageWatch();clearWarning();}
 }
 globalThis.AquilaGuardUrl={urlReasons,showWarning};
 globalThis.AquilaContent={version,refresh};
 document.addEventListener('focusin',event=>{
  if(!enabled||!event.isTrusted)return;
  const isLogin=event.composedPath().some(node=>node.matches?.('input[type="password"], input[autocomplete~="username"]'));
  if(!isLogin)return;
  loginFocusAddress=location.href;
  remindAboutLogin();
 });
 api.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.enabled)refresh();});
 addEventListener('pageshow',refresh);
 addEventListener('pagehide',()=>{clearInterval(timer);stopPageWatch();});
 addEventListener('scroll',()=>{if(enabled&&!pageDebounce){pageDebounce=setTimeout(()=>{pageDebounce=null;inspectIntrusive();},1000);}}, {passive:true});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden||!enabled)return;
  if(lastAddress===location.href)inspectIntrusive();
  else check();
 });
 refresh();
})();
