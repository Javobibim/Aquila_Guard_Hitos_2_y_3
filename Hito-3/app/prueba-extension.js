(() => {
 'use strict';
 const state=document.getElementById('test-state');
 let found=false;
 function check(){const host=document.getElementById('aquila-guard-url-warning');if(!found&&host?.shadowRoot?.querySelector('.notice')){found=true;state.textContent='Aviso detectado en esta página. Comprueba que ves la tarjeta de demostración.';}}
 const observer=new MutationObserver(check);observer.observe(document.documentElement,{childList:true,subtree:true});check();
 const timer=setTimeout(()=>{if(!found)state.textContent='Todavía no se detecta el aviso. Sigue los pasos de activación y recarga esta pestaña; no visites un sitio peligroso para probarlo.';},20000);
 addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(timer);},{once:true});
})();
