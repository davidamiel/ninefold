"""Generate reviewed recording jobs locally; not part of the website build."""
from pathlib import Path
import argparse,hashlib,json,time
import av,numpy as np,soundfile as sf
from kokoro_onnx import Kokoro

parser=argparse.ArgumentParser()
parser.add_argument('job',type=Path)
parser.add_argument('--voice',choices=['female','male'],required=True)
parser.add_argument('--output',type=Path,default=Path('work/recordings'))
parser.add_argument('--model',type=Path,default=Path('scripts/cache/narration/kokoro-v1.0.onnx'))
parser.add_argument('--voices',type=Path,default=Path('scripts/cache/narration/voices-v1.0.bin'))
args=parser.parse_args()
job=json.loads(args.job.read_text());voice=job['voices'][args.voice]['id']
output=args.output/job['documentId'];output.mkdir(parents=True,exist_ok=True)
tts=Kokoro(str(args.model),str(args.voices));pieces=[];paragraphs=[];offset=0;rate=24000
for index,text in enumerate(job['spokenParagraphs']):
    text=' '.join(text.split())
    cache=output/(hashlib.sha256((voice+'|fp32|1.0|'+text).encode()).hexdigest()+'.wav')
    if cache.exists():samples,rate=sf.read(cache,dtype='float32')
    else:
        samples,rate=tts.create(text,voice=voice,speed=1,lang='en-us',sentence_pause=.18,clause_pause=.07)
        if not np.isfinite(samples).all() or len(samples)<rate*.1:raise ValueError('Invalid generated audio')
        sf.write(cache,samples,rate,subtype='FLOAT')
    samples=samples.copy();fade=min(int(rate*.005),len(samples)//2)
    samples[:fade]*=np.linspace(0,1,fade);samples[-fade:]*=np.linspace(1,0,fade)
    paragraphs.append({'paragraph':index,'start':offset/rate,'end':(offset+len(samples))/rate,'text':text})
    gap=np.zeros(int(rate*.35),dtype='float32');pieces.extend([samples,gap]);offset+=len(samples)+len(gap)
    print(f'{args.voice}: paragraph {index+1}/{len(job["spokenParagraphs"])}',flush=True)
audio=np.concatenate(pieces);peak=np.abs(audio).max()
if peak:audio*=min(1,.89125/peak)
prefix=output/args.voice
sf.write(prefix.with_suffix('.wav'),audio,rate,subtype='PCM_16')
with av.open(str(prefix.with_suffix('.mp3')),'w') as container:
    stream=container.add_stream('libmp3lame',rate=rate);stream.bit_rate=64000;stream.layout='mono'
    for start in range(0,len(audio),1152):
        frame=av.AudioFrame.from_ndarray(audio[start:start+1152][None,:],format='fltp',layout='mono');frame.sample_rate=rate
        for packet in stream.encode(frame):container.mux(packet)
    for packet in stream.encode():container.mux(packet)
prefix.with_suffix('.json').write_text(json.dumps({'voice':voice,'duration':len(audio)/rate,'sampleRate':rate,'paragraphs':paragraphs},indent=2)+'\n')
