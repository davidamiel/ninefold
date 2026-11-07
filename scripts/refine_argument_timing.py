"""Re-recognize a bounded failed alignment span at higher decoding accuracy."""
import argparse,json,subprocess
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--docket',required=True);p.add_argument('--model',default='small.en');p.add_argument('--start',type=float,required=True);p.add_argument('--end',type=float,required=True);a=p.parse_args()
model=WhisperModel(a.model,device='cpu',compute_type='int8',cpu_threads=2,download_root=str(a.work/'models'))
audio=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-ss',str(a.start),'-i',str(a.work/(a.docket+'.mp3')),'-t',str(a.end-a.start),'-ar','16000','-ac','1','-f','f32le','-']),dtype=np.float32)
segments,_=model.transcribe(audio,word_timestamps=True,beam_size=5,language='en',vad_filter=False,condition_on_previous_text=True,initial_prompt='Supreme Court oral argument. Chief Justice Roberts, Justice Thomas, Justice Alito, Justice Sotomayor, Justice Kagan, Justice Gorsuch, Justice Kavanaugh, Justice Barrett, Justice Jackson.')
words=[]
for s in segments:
 print(s.start+a.start,s.text,flush=True)
 words.extend({'word':w.word,'start':round(float(w.start)+a.start,3),'end':round(float(w.end)+a.start,3),'probability':float(w.probability)} for w in s.words)
p=a.work/(a.docket+'-recognized.json');data=json.loads(p.read_text());low=a.start+2;high=a.end-2
words=[w for w in words if low<=(w['start']+w['end'])/2<high]
data['words']=[w for w in data['words'] if not low<=(w['start']+w['end'])/2<high]+words
data['words'].sort(key=lambda w:(w['start'],w['end']));data.setdefault('refinedSpans',[]).append({'start':low,'end':high,'model':a.model});p.write_text(json.dumps(data,separators=(',',':')))
