export const MODEL_DB='ninefold-voice-model-v1';
let opening;
function database(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open(MODEL_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('assets');r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=null;reject(r.error)}})}
async function transaction(mode,action){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction('assets',mode),r=action(t.objectStore('assets'));t.oncomplete=()=>resolve(r?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}
export async function installModelCache(onStatus=()=>{}){
 const native=globalThis.fetch.bind(globalThis),pending=new Map();
 async function load(url,input,options){
  try{const saved=await transaction('readonly',s=>s.get(url));if(saved){onStatus({saved:true});return saved}}catch{onStatus({unavailable:true})}
  const legacy=await caches.open('transformers-cache').then(c=>c.match(url)).catch(()=>null);
  const response=legacy||await native(input,options);if(response.status!==200)return {response};
  const total=Number(response.headers.get('content-length')),reader=response.body.getReader(),parts=[];let loaded=0;
  for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);loaded+=value.byteLength;onStatus({loaded,total})}
  const blob=new Blob(parts,{type:response.headers.get('content-type')||'application/octet-stream'}),saved={blob,type:blob.type};
  try{await transaction('readwrite',s=>s.put(saved,url));onStatus({saved:true})}catch{onStatus({unavailable:true})}
  return saved;
 }
 globalThis.fetch=async(input,options)=>{
  const url=typeof input==='string'?input:input.url||String(input),method=options?.method||input?.method||'GET';
  if(!/^https:\/\/huggingface.co\/(?:onnx-community\/Kokoro-82M-v1.0-ONNX|hexgrad\/Kokoro-82M)/.test(url)||method!=='GET')return native(input,options);
  if(!pending.has(url))pending.set(url,load(url,input,options).finally(()=>pending.delete(url)));
  const saved=await pending.get(url);
  return saved.response?saved.response.clone():new Response(saved.blob,{headers:{'Content-Type':saved.type,'Content-Length':String(saved.blob.size)}});
 };
}
export async function modelStorageSize(){try{const all=await transaction('readonly',s=>s.getAll());return all.reduce((n,a)=>n+a.blob.size,0)}catch{return 0}}
export async function clearModelStorage(){await transaction('readwrite',s=>s.clear());await caches.delete('transformers-cache')}
