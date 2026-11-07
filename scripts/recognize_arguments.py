"""Recognize local official recordings as timing evidence, never replacement text.
Run in a venv with faster-whisper; output stays outside the published site.
"""
import argparse,json,subprocess,time,urllib.request,hashlib
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--model',default='base.en');a=p.parse_args()
model=WhisperModel(a.model,device='cpu',compute_type='int8',cpu_threads=4,download_root=str(a.work/'models'))
for case in json.loads((a.work/'official-turns.json').read_text()):
 docket=case['caseId'];out=a.work/(docket+'-recognized.json')
 if out.exists():
  cached=json.loads(out.read_text());cached_mp3=a.work/(docket+'.mp3')
  if cached_mp3.exists() and cached.get('audioSha256')==hashlib.sha256(cached_mp3.read_bytes()).hexdigest():continue
  raise ValueError('Recognition cache is missing its matching recording checksum: '+docket)
 mp3=a.work/(docket+'.mp3')
 if not mp3.exists():urllib.request.urlretrieve(case['audio']['url'],mp3)
 audio=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(mp3),'-ar','16000','-ac','1','-f','f32le','-']),dtype=np.float32)
 print('START',docket,'seconds',len(audio)/16000,flush=True);beg=time.time()
 segments,info=model.transcribe(audio,word_timestamps=True,beam_size=1,language='en',vad_filter=True,condition_on_previous_text=False)
 words=[];last=0
 for s in segments:
  words.extend({'word':w.word,'start':float(w.start),'end':float(w.end),'probability':float(w.probability)} for w in s.words)
  if s.end-last>600:print('PROGRESS',docket,round(s.end),'elapsed',round(time.time()-beg),flush=True);last=s.end
 out.write_text(json.dumps({'model':a.model,'audioSha256':hashlib.sha256(mp3.read_bytes()).hexdigest(),'duration':info.duration,'words':words},separators=(',',':')))
 print('DONE',docket,len(words),'words elapsed',round(time.time()-beg),flush=True)
