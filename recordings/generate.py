"""Generate reviewed recording jobs locally; not part of the website build."""
from pathlib import Path
import argparse,hashlib,json,re

ROOT=Path(__file__).resolve().parents[1]

def local_path(value,root):
    """Resolve symlinks before enforcing the allowed recording directory."""
    path=Path(value).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Recording path is outside its permitted directory')
    return path

def load_job(value,root=ROOT/'recordings'):
    path=local_path(value,root)
    if path.suffix!='.json':
        raise ValueError('A reviewed JSON job is required')
    job=json.loads(path.read_text())
    if not isinstance(job,dict):
        raise ValueError('A reviewed job object is required')
    document_id=job.get('documentId')
    if not isinstance(document_id,str) or re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,119}',document_id) is None:
        raise ValueError('Invalid recording document identifier')
    return job,document_id

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('job',type=Path)
    parser.add_argument('--voice',choices=['female','male'],required=True)
    parser.add_argument('--output',type=Path,default=Path('work/recordings'))
    parser.add_argument('--model',type=Path,default=Path('scripts/cache/narration/kokoro-v1.0.onnx'))
    parser.add_argument('--voices',type=Path,default=Path('scripts/cache/narration/voices-v1.0.bin'))
    args=parser.parse_args()
    job,document_id=load_job(args.job);gender={'female':'female','male':'male'}[args.voice]
    voice={'female':'af_sky','male':'am_michael'}[gender]
    output_root=local_path(args.output,ROOT/'work')
    output=local_path(output_root/document_id,output_root)
    model=local_path(args.model,ROOT/'scripts/cache/narration')
    voices=local_path(args.voices,ROOT/'scripts/cache/narration')
    output.mkdir(parents=True,exist_ok=True)
    import av,numpy as np,soundfile as sf
    from kokoro_onnx import Kokoro
    tts=Kokoro(str(model),str(voices));pieces=[];paragraphs=[];offset=0;rate=24000
    for index,text in enumerate(job['spokenParagraphs']):
        text=' '.join(text.split())
        cache=local_path(output/(hashlib.sha256((voice+'|fp32|1.0|'+text).encode()).hexdigest()+'.wav'),output)
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
    wav_path=local_path(output/(gender+'.wav'),output)
    mp3_path=local_path(output/(gender+'.mp3'),output)
    report_path=local_path(output/(gender+'.json'),output)
    sf.write(wav_path,audio,rate,subtype='PCM_16')
    with av.open(str(mp3_path),'w') as container:
        stream=container.add_stream('libmp3lame',rate=rate);stream.bit_rate=64000;stream.layout='mono'
        for start in range(0,len(audio),1152):
            frame=av.AudioFrame.from_ndarray(audio[start:start+1152][None,:],format='fltp',layout='mono');frame.sample_rate=rate
            for packet in stream.encode(frame):container.mux(packet)
        for packet in stream.encode():container.mux(packet)
    report_path.write_text(json.dumps({'voice':voice,'duration':len(audio)/rate,'sampleRate':rate,'paragraphs':paragraphs},indent=2)+'\n')
