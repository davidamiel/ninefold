"""Generate reviewed recording jobs locally; not part of the website build."""
from pathlib import Path
import argparse,hashlib,json,re,tempfile

ROOT=Path(__file__).resolve().parents[1]
JSON_SUFFIX='.json'
MODEL_DIRECTORY=ROOT/'scripts/cache/narration'

def local_path(value,root):
    """Resolve symlinks before enforcing the allowed recording directory."""
    path=Path(value).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Recording path is outside its permitted directory')
    return path

def load_job(value,root=ROOT/'recordings'):
    path=local_path(value,root)
    if path.suffix!=JSON_SUFFIX:
        raise ValueError('A reviewed JSON job is required')
    job=json.loads(path.read_text())
    if not isinstance(job,dict):
        raise ValueError('A reviewed job object is required')
    document_id=job.get('documentId')
    if not isinstance(document_id,str) or re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,119}',document_id) is None:
        raise ValueError('Invalid recording document identifier')
    return job,document_id


def save_clip(samples, rate, cache):
    import soundfile as sf
    with tempfile.NamedTemporaryFile(dir=cache.parent, suffix='.tmp.wav', delete=False) as file:
        temporary=local_path(file.name,cache.parent)
    try:
        sf.write(temporary,samples,rate,subtype='FLOAT')
        temporary.replace(cache)
    finally:
        temporary.unlink(missing_ok=True)


def read_report(path):
    try:
        report=json.loads(path.read_text())
    except (OSError,json.JSONDecodeError):
        return {}
    return report if isinstance(report,dict) else {}


def save_report(path, report):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(report,indent=2)+'\n')
    temporary.replace(path)


def reusable_recording(report, generator, script_hash, voice, audio):
    return (report.get('generator') == generator and report.get('scriptSha256') == script_hash
            and report.get('voice') == voice
            and report.get('audioSha256') == hashlib.sha256(audio.read_bytes()).hexdigest())

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('job',type=Path)
    parser.add_argument('--voice',choices=['female','male'],required=True)
    parser.add_argument('--output',type=Path,default=Path('work/recordings'))
    parser.add_argument('--model',type=Path,default=Path('scripts/cache/narration/kokoro-v1.0.onnx'))
    parser.add_argument('--voices',type=Path,default=Path('scripts/cache/narration/voices-v1.0.bin'))
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--engine',choices=['onnx','mlx'],default='onnx')
    parser.add_argument('--mlx-model',type=Path,default=Path('scripts/cache/narration/mlx-kokoro'))
    args=parser.parse_args()
    job,document_id=load_job(args.job);gender={'female':'female','male':'male'}[args.voice]
    if job.get('reviewed') is False:raise ValueError('Review this preparation before generating audio')
    voice={'female':'af_sky','male':'am_michael'}[gender]
    output_root=local_path(args.output,ROOT/'work')
    output=local_path(output_root/document_id,output_root)
    model=local_path(args.model,MODEL_DIRECTORY)
    voices=local_path(args.voices,MODEL_DIRECTORY)
    output.mkdir(parents=True,exist_ok=True)
    clips=local_path(output_root/'clips',output_root)
    clips.mkdir(parents=True,exist_ok=True)
    if 'blocks' in job:
        from prepare import prepare
        body,job=prepare(job)
        local_path(output/'prepared.json',output).write_text(json.dumps(body,ensure_ascii=False,indent=2)+'\n')
        local_path(output/'narration.json',output).write_text(json.dumps(job,ensure_ascii=False,indent=2)+'\n')
    # Cache identity includes the actual local model and runtime, so changing
    # either cannot silently reuse audio made by a different generator.
    from importlib.metadata import version
    if args.engine=='mlx':
        import mlx_backend
        mlx_model=local_path(args.mlx_model,MODEL_DIRECTORY)
        fingerprint=mlx_backend.fingerprint(mlx_model)
    else:
        fingerprint=hashlib.sha256(model.read_bytes()+voices.read_bytes()+version('kokoro-onnx').encode()+version('onnxruntime').encode()+b'pause:.18,.07;rate:1').hexdigest()
    import av,numpy as np,soundfile as sf
    report_path=local_path(output/(gender+JSON_SUFFIX),output)
    mp3_path=local_path(output/(gender+'.mp3'),output)
    script_hash=hashlib.sha256(json.dumps(job['spokenParagraphs'],ensure_ascii=False).encode()).hexdigest()
    if args.resume and report_path.exists() and mp3_path.exists():
        report=read_report(report_path)
        if reusable_recording(report,fingerprint,script_hash,voice,mp3_path):
            # Source/citation maps can change while the complete spoken script
            # remains identical. Keep verified audio; alignment rebuilds cues
            # against the new source maps before staging accepts this version.
            if report.get('version')!=job.get('version'):
                report['version']=job.get('version')
                save_report(report_path,report)
            print('Reusing validated recording:',document_id,gender,flush=True)
            raise SystemExit(0)
    if args.engine=='mlx':
        tts=mlx_backend.load(mlx_model)
    else:
        from kokoro_onnx import Kokoro
        tts=Kokoro(str(model),str(voices))
    pieces=[];paragraphs=[];offset=0;rate=24000
    for index,text in enumerate(job['spokenParagraphs']):
        text=' '.join(text.split())
        clip_name=hashlib.sha256((voice+'|'+fingerprint+'|'+text).encode()).hexdigest()+'.wav'
        cache=local_path(clips/clip_name,clips)
        legacy=local_path(output/clip_name,output)
        cached=cache if cache.exists() else legacy
        samples=None
        if cached.exists():
            try:
                candidate,cached_rate=sf.read(cached,dtype='float32')
                if cached_rate==24000 and candidate.ndim==1 and np.isfinite(candidate).all() and len(candidate)>=cached_rate*.1:
                    samples,rate=candidate,cached_rate
                    if cached!=cache:save_clip(samples,rate,cache)
            except (OSError,RuntimeError,ValueError):
                pass  # An interrupted cache file is regenerated below.
        if samples is None:
            if args.engine=='mlx':samples,rate=mlx_backend.create(tts,text,voice)
            else:samples,rate=tts.create(text,voice=voice,speed=1,lang='en-us',sentence_pause=.18,clause_pause=.07)
            if rate!=24000 or samples.ndim!=1 or not np.isfinite(samples).all() or len(samples)<rate*.1:raise ValueError('Invalid generated audio')
            save_clip(samples,rate,cache)
        samples=samples.copy();fade=min(int(rate*.005),len(samples)//2)
        samples[:fade]*=np.linspace(0,1,fade);samples[-fade:]*=np.linspace(1,0,fade)
        paragraphs.append({'paragraph':index,'start':offset/rate,'end':(offset+len(samples))/rate,'text':text})
        gap=np.zeros(int(rate*.35),dtype='float32');pieces.extend([samples,gap]);offset+=len(samples)+len(gap)
        print(f'{args.voice}: paragraph {index+1}/{len(job["spokenParagraphs"])}',flush=True)
    audio=np.concatenate(pieces);peak=np.abs(audio).max()
    if peak:audio*=min(1,.89125/peak)
    mp3_path=local_path(output/(gender+'.mp3'),output)
    report_path=local_path(output/(gender+JSON_SUFFIX),output)
    with av.open(str(mp3_path),'w') as container:
        stream=container.add_stream('libmp3lame',rate=rate);stream.bit_rate=64000;stream.layout='mono'
        for start in range(0,len(audio),1152):
            frame=av.AudioFrame.from_ndarray(audio[start:start+1152][None,:],format='fltp',layout='mono');frame.sample_rate=rate
            for packet in stream.encode(frame):container.mux(packet)
        for packet in stream.encode():container.mux(packet)
    with av.open(str(mp3_path)) as media:
        decoded=np.concatenate([frame.to_ndarray().reshape(-1) for frame in media.decode(audio=0)])
    peak=float(np.abs(decoded).max());rms=float(np.sqrt(np.mean(decoded**2)))
    if not np.isfinite(decoded).all() or peak>=1 or rms<.005 or abs(len(decoded)-len(audio))/rate>.1:
        raise ValueError('Encoded recording failed the audio integrity check')
    save_report(report_path,{'voice':voice,'version':job.get('version'),'generator':fingerprint,'scriptSha256':script_hash,'audioSha256':hashlib.sha256(mp3_path.read_bytes()).hexdigest(),'decodedPeak':peak,'decodedRms':rms,'duration':len(audio)/rate,'sampleRate':rate,'paragraphs':paragraphs})
