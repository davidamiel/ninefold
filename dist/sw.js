const INDEX='ninefold-offline-index-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Explicit downloads populate this cache. Do not cache auth requests, writes,
// arbitrary cross-origin responses, or every document a person browses.
self.addEventListener('fetch',event=>{
 const r=event.request,url=new URL(r.url);if(r.method!=='GET'||url.origin!==self.location.origin)return;
 const key=new URL(url);key.search='';key.hash='';
 event.respondWith((async()=>{
  const index=await caches.open(INDEX),name=await index.match(new URL('./__offline_shell__',self.location)).then(r=>r?.text());
  const cache=name?await caches.open(name):null,saved=await cache?.match(r.mode==='navigate'?new URL('./index.html',self.location):key)||await (await caches.open('ninefold-offline-documents-v1')).match(key);
  try{return await fetch(r)}catch(error){if(saved)return saved;throw error}
 })());
});
