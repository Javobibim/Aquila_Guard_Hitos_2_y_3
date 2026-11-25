(() => {
 'use strict';
 let installEvent=null;
 const button=document.getElementById('install-app'),state=document.getElementById('install-state');
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;button.hidden=false;});
 button.onclick=async()=>{if(!installEvent)return;await installEvent.prompt();const choice=await installEvent.userChoice;state.textContent=choice.outcome==='accepted'?'Instalación solicitada. Busca Aquila Guard entre tus aplicaciones.':'Puedes seguir usando la web o instalarla después.';installEvent=null;button.hidden=true;};
 addEventListener('appinstalled',()=>{state.textContent='Aquila Guard se añadió a tus aplicaciones.';button.hidden=true;});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(()=>{state.textContent='Puedes usar la web. La preparación para usarla sin conexión no se completó.';});
})();
