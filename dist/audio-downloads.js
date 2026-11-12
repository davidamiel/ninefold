const INDEX='ninefold-audio-downloads-v1';
const entryURL=id=>new URL('__downloads__/'+encodeURIComponent(id),import.meta.url).href;
export async function listDownloads(){const cache=await caches.open(INDEX),keys=await cache.keys();return Promise.all(keys.map(async key=>(await cache.match(key)).json()))}
export async function findDownload(docId,voice){return (await listDownloads()).find(d=>d.docId===docId&&d.voice===voice)}
export async function deleteDownload(id){const index=await caches.open(INDEX),response=await index.match(entryURL(id));if(response){const item=await response.json();await caches.delete(item.cache);await index.delete(entryURL(id))}}
export async function saveDownload(record){const cache=await caches.open(INDEX);await cache.put(entryURL(record.id),new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}))}
export async function prepareOfflineShell(){
 if(!('serviceWorker'in navigator))throw Error('Offline listening is unavailable in this browser.');
 await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
 const persistent=await navigator.storage?.persist?.().catch(()=>false);
 const manifest=await (await fetch('./offline-manifest.json',{cache:'no-store'})).json();
 const files=document.documentElement.dataset.packedText==='true'?manifest.packed:manifest.source;
 // Commit a complete shell at once so a failed refresh cannot break existing downloads.
 const name='ninefold-offline-shell-'+crypto.randomUUID(),cache=await caches.open(name),index=await caches.open('ninefold-offline-index-v1'),key=new URL('__offline_shell__',import.meta.url),old=await index.match(key).then(r=>r?.text());
 try{
  for(let i=0;i<files.length;i+=4)await Promise.all(files.slice(i,i+4).map(async file=>{const url=new URL(file,import.meta.url),r=await fetch(url,{cache:'reload'});if(!r.ok)throw Error('Could not save the app for offline use.');await cache.put(url,r)}));
  await index.put(key,new Response(name));
 }catch(error){await caches.delete(name);throw error}
 if(old&&old!==name)await caches.delete(old);
 return !!persistent;
}
export async function cacheDocument(path){if(!path||path==='inline')return;const packed=document.documentElement.dataset.packedText==='true'&&/^data\/(docs|current-docs|statutes)\/.+\.json$/.test(path);const url=new URL(path+(packed?'.gz':''),import.meta.url),r=await fetch(url);if(!r.ok)throw Error('The document could not be saved offline.');await (await caches.open('ninefold-offline-documents-v1')).put(url,r)}
