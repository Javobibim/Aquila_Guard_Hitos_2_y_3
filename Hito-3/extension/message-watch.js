(() => {
 'use strict';
 if(globalThis.AquilaMessageWatch)return;
 const api=globalThis.chrome;
 let timer,observer,previous=null,epoch=0,banner=null;
 function remove(){banner?.remove();banner=null;}
 function stop(){++epoch;observer?.disconnect();observer=null;clearTimeout(timer);timer=null;previous=null;remove();}
 function render(data){
  remove();
  if(!data?.hasSignals)return;
  const host=document.createElement('div');
  host.style.cssText='all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647';
  const shadow=host.attachShadow({mode:'closed'}),card=document.createElement('section');
  card.setAttribute('role','alert');
  const high=data.classification==='reported';
  card.style.cssText='box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:16px;background:#fff;color:#112f52;border:2px solid '+(high?'#a11932':'#a86608')+';border-radius:12px;box-shadow:0 8px 24px #152a4544;font:16px/1.4 system-ui';
  const heading=document.createElement('strong');
  heading.textContent=high?'Aquila Guard · Dominio reportado':'Aquila Guard · Precaución en el mensaje';
  const reason=document.createElement('p');
  reason.textContent=(data.findings.find(x=>x.id==='reported')||data.findings[0])?.title||'Revisa antes de actuar.';
  const advice=document.createElement('p');
  advice.textContent='Comprueba la solicitud por un canal oficial antes de responder o abrir enlaces.';
  const close=document.createElement('button');
  close.textContent='Entendido';close.onclick=remove;
  card.append(heading,reason,advice,close);shadow.append(card);document.documentElement.append(host);banner=host;
 }
 async function scan(){
  timer=null;
  if(!observer||document.visibilityState!=='visible')return;
  const watching=observer;
  const snapshot=globalThis.AquilaMessageSnapshot.capture();
  if(!snapshot){if(previous!==null){previous=null;++epoch;remove();}return;}
  const fingerprint=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot.input));
  const key=Array.from(new Uint8Array(fingerprint)).join(',');
  if(observer!==watching||document.hidden||key===previous)return;
  previous=key;remove();
  const current=++epoch;
  try{
   const result=await api.runtime.sendMessage({type:'aquila-analyze-visible-message',snapshot});
   if(observer===watching&&epoch===current&&!document.hidden&&result?.ok&&
    globalThis.AquilaMessageSnapshot.capture()?.input===snapshot.input)render(result.data);
  }catch{}
 }
 function schedule(){if(timer==null)timer=setTimeout(scan,500);}
 function start(){
  if(observer)return;
  observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,
   attributeFilter:['class','hidden','aria-hidden','style']});
  schedule();
 }
 document.addEventListener('visibilitychange',()=>{if(observer){if(document.hidden){++epoch;previous=null;remove();}else schedule();}});
 addEventListener('pagehide',stop);
 api.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==api.runtime.id||!['aquila-message-start','aquila-message-stop','aquila-message-state'].includes(message?.type))return;
  if(message.type==='aquila-message-start')start();
  if(message.type==='aquila-message-stop')stop();
  respond({active:!!observer});
 });
 globalThis.AquilaMessageWatch=true;
})();
