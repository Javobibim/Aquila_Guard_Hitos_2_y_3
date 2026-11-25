/* Observaciones locales de publicidad. No determina fraude ni lee valores de campos. */
(() => {
 'use strict';
 const adNetworks=['doubleclick.net','googlesyndication.com','googleadservices.com','popads.net','popcash.net','exoclick.com','exosrv.com','adcash.com','adsterra.com','propellerads.com','hilltopads.net','clickadu.com'];
 const isAdHost=host=>adNetworks.some(domain=>host===domain||host.endsWith('.'+domain));
 function classify(summary){
  const ads=Math.max(0,Number(summary?.adAreas)||0),cover=Math.max(0,Number(summary?.coveringAds)||0);
  const loaded=Math.max(ads,Number(summary?.renderedAds)||0);
  if(ads<4&&loaded<6&&!cover&&!summary?.popupScript)return [];
  const reasons=[];
  if(ads>=4)reasons.push('Se observaron '+Math.min(ads,400)+' espacios publicitarios en pantalla.');
  else if(loaded>=6)reasons.push('La página muestra '+Math.min(loaded,400)+' espacios publicitarios a lo largo de su contenido.');
  if(cover>=1)reasons.push('Un espacio publicitario cubre una parte importante de la pantalla.');
  if(summary?.popupScript)reasons.push('La página carga un componente asociado a ventanas publicitarias. Si se abre una pestaña inesperada, comprueba el destino antes de continuar.');
  reasons.push('La publicidad invasiva puede provocar clics involuntarios. No confirma phishing ni significa que todos los anuncios sean peligrosos.');
  return reasons;
 }
 function collect(doc=globalThis.document){
  const win=doc.defaultView,w=win.innerWidth,h=win.innerHeight,areas=new Set(),rects=[],adHosts=new Set();
  if(!w||!h)return {adAreas:0,coveringAds:0,partial:false};
  const selector='iframe[src],iframe[title],[data-ad-slot],ins.adsbygoogle,[id^="google_ads_iframe"],[data-ad-unit]';
  let examined=0,partial=false;
  for(const el of doc.querySelectorAll(selector)){
   if(++examined>400){partial=true;break;}
   let ad=el.matches('[data-ad-slot],ins.adsbygoogle,[id^="google_ads_iframe"],[data-ad-unit]');
   if(!ad&&el.tagName==='IFRAME'){
    try{ad=isAdHost(new URL(el.getAttribute('src')||'',doc.baseURI).hostname);}catch{}
    if(!ad)ad=/\b(advertisement|advertising|publicidad|anuncio)\b/i.test((el.getAttribute('title')||'').slice(0,160));
   }
   if(!ad||[...areas].some(parent=>parent.contains(el)))continue;
   const style=win.getComputedStyle(el),r=el.getBoundingClientRect();
   if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||r.width<30||r.height<30)continue;
   if(el.checkVisibility&&!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
   areas.add(el);
   for(const link of Array.from(el.querySelectorAll('a[href]')).slice(0,12)){
    if(adHosts.size>=20)break;
    try{const url=new URL(link.getAttribute('href'),doc.baseURI);if(/^https?:$/.test(url.protocol))adHosts.add(url.hostname.replace(/\.$/,''));}catch{}
   }
   const width=Math.min(w,r.right)-Math.max(0,r.left),height=Math.min(h,r.bottom)-Math.max(0,r.top);
   if(width<30||height<30)continue;
   rects.push({el,visibleArea:width*height});
  }
  let coveringAds=0;
  for(const {el,visibleArea} of rects){
   if(visibleArea/(w*h)<0.30)continue;
   let ancestor=el,fixed=false;
   for(let depth=0;ancestor&&depth<5;depth++,ancestor=ancestor.parentElement){const p=win.getComputedStyle(ancestor).position;if(p==='fixed'||p==='sticky'){fixed=true;break;}}
   if(fixed)coveringAds++;
  }
  const popupScript=Array.from(doc.querySelectorAll('script[src]')).slice(0,150).some(script=>{
   try{const url=new URL(script.getAttribute('src'),doc.baseURI);return /^https?:$/.test(url.protocol)&&/(?:^|\/)(?:popa|popunder|popads)(?:[.-]min)?\.js$/i.test(url.pathname);}catch{return false;}
  });
  return {adAreas:rects.length,renderedAds:areas.size,coveringAds,popupScript,adHosts:[...adHosts],partial};
 }
 function hasTimedSurvey(doc=globalThis.document){
  if(!doc.body)return false;
  const walker=doc.createTreeWalker(doc.body,4); // NodeFilter.SHOW_TEXT
  const visible=[];
  let remaining=8000;
  for(let count=0;count<300&&remaining>0;count++){
   const node=walker.nextNode();
   if(!node)break;
   const fragment=node.data.slice(0,remaining).trim();
   if(!fragment)continue;
   const parent=node.parentElement;
   if(!parent||parent.closest('script,style,noscript,textarea,template,[hidden]'))continue;
   if(!parent.getClientRects().length||doc.defaultView.getComputedStyle(parent).visibility!=='visible')continue;
   if(parent.checkVisibility&&!parent.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
   visible.push(fragment);
   remaining-=fragment.length+1;
  }
  const text=visible.join(' ').replace(/\s+/g,' ').toLowerCase();
  const selection=/\b(?:(?:has sido|ha sido|fuiste|fue|resultaste) (?:seleccionad[oa]|elegid[oa]) (?:al azar|aleatoriamente)|you (?:have been|were) (?:randomly selected|chosen at random))\b/u;
  const surveyOrReward=/\b(?:encuesta|cuestionario|premio|bono|bonus|survey|prize|reward)\b/u;
  const shortDeadline=/\b(?:(?:solo|sólo|solamente) (?:tienes|tiene|quedan|restan) \d{1,2} (?:minutos?|segundos?)|(?:you )?only have \d{1,2} (?:minutes?|seconds?)|(?:tiempo restante|time remaining)\s*:?\s*\d{1,2}:\d{2})\b/u;
  return selection.test(text)&&surveyOrReward.test(text)&&shortDeadline.test(text);
 }
 globalThis.AquilaIntrusive=Object.freeze({classify,collect,hasTimedSurvey});
})();
