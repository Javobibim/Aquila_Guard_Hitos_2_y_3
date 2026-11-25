/* Solo recursos públicos del mismo origen. Nunca autentica ni guarda historiales. */
const CACHE='aquila-static-__BUILD_ID__';
const ASSETS=__ASSETS__;
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('aquila-static-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'&&url.pathname==='/instalar.html'){
  event.respondWith((async()=>{
   try {
    const response=await fetch(request,{cache:'no-cache'});
    if(response.status<500)return response;
   } catch {}
   const saved=await (await caches.open(CACHE)).match('instalar.html');
   return saved||Response.error();
  })());
  return;
 }
 if(request.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html')){event.respondWith(caches.open(CACHE).then(c=>c.match('index.html')).then(r=>r||fetch(request)));return;}
 if(!url.search&&ASSETS.includes(url.pathname.slice(1)))event.respondWith(caches.open(CACHE).then(c=>c.match(url.pathname)).then(r=>r||fetch(request)));
});
