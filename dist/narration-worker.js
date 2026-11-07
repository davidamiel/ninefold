import {KokoroTTS,env} from './vendor/kokoro/kokoro.web.js';
env.wasmPaths=new URL('./vendor/kokoro/',import.meta.url).href;
let engine,queue=Promise.resolve(),latestSession;
const load=()=>engine??=KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'wasm',progress_callback:progress=>self.postMessage({type:'progress',progress})}).catch(error=>{engine=null;throw error});
self.onmessage=({data})=>{
 if(data.type==='cancel'){latestSession=data.session;return}
 latestSession=data.session;
 queue=queue.catch(()=>{}).then(async()=>{
  if(data.session!==latestSession)return;
  try{const tts=await load();if(data.session!==latestSession)return;const sound=await tts.generate(data.text,{voice:data.voice||'af_heart',speed:1});if(data.session!==latestSession)return;const wav=sound.toWav();self.postMessage({type:'audio',id:data.id,session:data.session,wav,duration:sound.audio.length/sound.sampling_rate},[wav])}
  catch(error){self.postMessage({type:'error',id:data.id,session:data.session,message:error.message})}
 });
};
