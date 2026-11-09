import {KokoroTTS,env} from './vendor/kokoro/kokoro.web.js';
env.wasmPaths=new URL('./vendor/kokoro/',import.meta.url).href;
let engine,latestSession,running=false;
const queue=[];
const load=()=>engine??=KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'wasm',progress_callback:progress=>self.postMessage({type:'progress',progress})}).catch(error=>{engine=null;throw error});
async function drain(){
 if(running)return;
 running=true;
 try{
  while(queue.length){
   const data=queue.shift();if(data.session!==latestSession)continue;
   try{
    const tts=await load();if(data.session!==latestSession)continue;
    const sound=await tts.generate(data.text,{voice:data.voice||'af_heart',speed:1});
    if(data.session!==latestSession)continue;
    const wav=sound.toWav();self.postMessage({type:'audio',id:data.id,session:data.session,wav,duration:sound.audio.length/sound.sampling_rate},[wav]);
   }catch(error){if(data.session===latestSession)self.postMessage({type:'error',id:data.id,session:data.session,message:error.message})}
  }
 }finally{running=false}
}
self.onmessage=({data})=>{
 if(data.type==='cancel'){latestSession=data.session;queue.length=0;return}
 if(data.type==='prioritize'){
  if(data.session!==latestSession)return;
  const index=queue.findIndex(item=>item.session===data.session&&item.index===data.index);
  if(index>=0)queue.unshift(...queue.splice(index,1));
  return;
 }
 if(data.session!==latestSession){latestSession=data.session;queue.length=0}
 if(data.priority)queue.unshift(data);else queue.push(data);
 void drain();
};
