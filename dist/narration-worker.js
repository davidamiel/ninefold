import {loadVoice,validSpeech} from './voice-backend.js';
import {installModelCache} from './voice-storage.js';
import {spokenText} from './speech-text.js';
import {KokoroTTS,env} from './vendor/kokoro/kokoro.web.js';
await installModelCache(status=>self.postMessage({type:'model-cache',...status}));
env.fetch=globalThis.fetch;
env.modelCacheEnabled=false;
env.wasmPaths=new URL('./vendor/kokoro/',import.meta.url).href;
let engine,latestSession,previewSession,backend,forceCPU=false,running=false;
const queue=[],cancelledDownloads=new Set();
const active=data=>data.preview?data.session===previewSession:data.background?!cancelledDownloads.has(data.session):data.session===latestSession;
const load=()=>engine??=loadVoice({device:navigator,forceCPU,create:options=>KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',options),notify:message=>{if(message.type==='backend')backend=message.device;self.postMessage(message)}}).catch(error=>{engine=null;throw error});
async function synthesize(tts,data){
 try{
  const sound=await tts.generate(spokenText(data.text),{voice:data.voice||'af_heart',speed:1});
  if(!validSpeech(sound.audio))throw new Error('Invalid generated audio');
  return sound;
 }catch(error){
  if(backend!=='webgpu')throw error;
  // A device can initialize WebGPU and still fail during inference. Release the
  // GPU session before loading the fallback, and never cache corrupt output.
  await tts.model.dispose().catch(()=>{});
  forceCPU=true;engine=null;
  return synthesize(await load(),data);
 }
}
async function cachedSpeech(data){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('kokoro-speech-v3|'+data.voice+'|'+data.text));
 const key=new URL('./__voice_cache__/'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),self.location).href;
 const cache=await caches.open('ninefold-speech-v2').catch(()=>null);
 const permanent=data.downloadCache?await caches.open(data.downloadCache):null;
 const hit=await permanent?.match(key).catch(()=>null)||await cache?.match(key).catch(()=>null);
 if(hit){if(permanent&&!await permanent.match(key))await permanent.put(key,hit.clone());return {wav:await hit.arrayBuffer(),duration:Number(hit.headers.get('X-Duration'))}}
 const tts=await load();self.postMessage({type:'ready'});
 await new Promise(resolve=>setTimeout(resolve,0));if(!active(data))return null;
 const sound=await synthesize(tts,data);
 const wav=await sound.toBlob().arrayBuffer(),duration=sound.audio.length/sound.sampling_rate;
 if(!active(data))return null;
 if(permanent)await permanent.put(key,new Response(wav.slice(0),{headers:{'Content-Type':'audio/wav','X-Duration':String(duration)}}));
 if(data.background&&!active(data)){if(data.downloadCache)await caches.delete(data.downloadCache);return null}
 if(cache){try{await cache.put(key,new Response(wav.slice(0),{headers:{'Content-Type':'audio/wav','X-Duration':String(duration)}}));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-128)))await cache.delete(old)}catch{ /* Storage denial must not prevent playback. */ }}
 return {wav,duration};
}
async function drain(){
 if(running)return;
 running=true;
 try{
  while(queue.length){
   // Let cancel/prioritize message tasks run between WASM generations. Awaiting
   // an already-resolved inference promise alone only drains microtasks.
   await new Promise(resolve=>setTimeout(resolve,0));
   if(!queue.length)continue;
   const data=queue.shift();if(!active(data))continue;
   try{
    const clip=await cachedSpeech(data);
    if(!clip||!active(data))continue;
    if(data.preview){self.postMessage({type:'prepared',session:data.session});continue}
    self.postMessage({type:'audio',id:data.id,session:data.session,wav:clip.wav,duration:clip.duration},[clip.wav]);
   }catch(error){if(active(data))self.postMessage({type:'error',id:data.id,session:data.session,message:error.message})}
  }
 }finally{running=false}
}
self.onmessage=({data})=>{
 if(data.type==='configure'){forceCPU ||= data.compact===true;return}
 if(data.type==='prepare'){
  previewSession=data.session;
  for(let i=queue.length-1;i>=0;i--)if(queue[i].preview)queue.splice(i,1);
  for(const text of data.texts)queue.push({text,voice:data.voice,session:data.session,preview:true,background:true});
  void drain();return;
 }

 if(data.type==='cancel-download'){cancelledDownloads.add(data.session);for(let i=queue.length-1;i>=0;i--)if(queue[i].session===data.session)queue.splice(i,1);return}
 if(data.type==='cancel'){latestSession=data.session;for(let i=queue.length-1;i>=0;i--)if(!queue[i].background)queue.splice(i,1);return}
 if(data.type==='window'){
  if(!active(data))return;
  for(let i=queue.length-1;i>=0;i--)if(!queue[i].background&&(queue[i].index<data.start||queue[i].index>data.end)){const item=queue.splice(i,1)[0];self.postMessage({type:'cancelled',id:item.id,message:'Cancelled'})}
  return;
 }
 if(data.type==='prioritize'){
  if(!active(data))return;
  const index=queue.findIndex(item=>item.session===data.session&&item.index===data.index);
  if(index>=0)queue.unshift(...queue.splice(index,1));
  return;
 }
 if(!data.background&&data.session!==latestSession){latestSession=data.session;for(let i=queue.length-1;i>=0;i--)if(!queue[i].background)queue.splice(i,1)}
 if(data.priority)queue.unshift(data);else queue.push(data);
 void drain();
};
