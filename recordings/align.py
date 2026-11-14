"""Align locally generated audio to reviewed reader blocks and PDF coordinates."""
import argparse
import difflib
import hashlib
import json
import re
import subprocess
from pathlib import Path

from generate import ROOT, load_job, local_path


def tokens(text):
    return [(m.group().lower(), m.start(), m.end()) for m in re.finditer(r'[A-Za-z0-9]+', text)]


def pairs(left, right):
    result = {}
    for block in difflib.SequenceMatcher(None, left, right, autojunk=False).get_matching_blocks():
        result.update((block.a+i, block.b+i) for i in range(block.size))
    return result


def source_ranges(paragraph, start, end):
    result, cursor = [], 0
    for part in paragraph['segments']:
        left, right = max(start, cursor)-cursor, min(end, cursor+len(part['text']))-cursor
        if right > left:
            result.append({'page': part['page'], 'start': part['map'][left], 'end': part['map'][right-1]+1})
        cursor += len(part['text'])
    return result


def paragraph_alignment(para, canonical, words):
    expected = tokens(para['text'])
    heard = [(token, w) for w in words if w['end'] > para['start'] and w['start'] < para['end'] for token, _, _ in tokens(w['text'])]
    timing = pairs([t[0] for t in expected], [t[0] for t in heard])
    source = tokens(canonical['text'])
    mapping = pairs([t[0] for t in expected], [t[0] for t in source])
    return {'expected': expected, 'heard': heard, 'timing': timing, 'source': source, 'mapping': mapping}


def sentence_source_bounds(canonical, source, mapped, transition):
    if transition:
        return max(0, len(canonical['text'])-1), len(canonical['text'])
    start, end = source[min(mapped)][1], source[max(mapped)][2]
    while end < len(canonical['text']) and canonical['text'][end] in '.!?,;:”’"\')':
        end += 1
    return start, end


def sentence_cue(sentence, para, canonical, alignment, block_index):
    text = para['text'][sentence['start']:sentence['end']]
    indexes = [i for i, t in enumerate(alignment['expected']) if sentence['start'] <= t[1] < sentence['end']]
    timed = [alignment['heard'][alignment['timing'][i]][1] for i in indexes if i in alignment['timing']]
    mapped = [alignment['mapping'][i] for i in indexes if i in alignment['mapping']]
    transition = bool(re.fullmatch(r'End footnote \d+\.', text.strip()))
    if not timed or len(timed)/max(1, len(indexes)) < .5 or not mapped and not transition:
        raise ValueError(f'Audio sentence needs review: block {block_index}: {text}')
    start, end = sentence_source_bounds(canonical, alignment['source'], mapped, transition)
    cue = {'start': round(max(para['start'], timed[0]['start']), 3), 'end': round(min(para['end'], timed[-1]['end']), 3),
           'paragraph': block_index, 'ranges': source_ranges(canonical, start, end), 'text': text}
    if transition:
        cue['transition'] = True
    if canonical['kind'] == 'footnote':
        cue['footnote'] = canonical['label']
    return cue


def close_cue_gaps(cues):
    for i, cue in enumerate(cues):
        if i+1 < len(cues):
            cue['end'] = max(cue['end'], cues[i+1]['start'])
        if cue['end'] <= cue['start'] or i and cue['start'] < cues[i-1]['end']:
            raise ValueError('Overlapping sentence timings require review')


def align(body, narration, report, words):
    if body['version'] != report['version'] or narration['version'] != report['version']:
        raise ValueError('Audio and reviewed text versions differ')
    texts = [p['text'] for p in report['paragraphs']]
    if texts != narration['spokenParagraphs'] or len(texts) != len(narration['spokenBlocks']):
        raise ValueError('Generated narration differs from the reviewed script')
    program = "import {sentenceRanges} from './dist/transcript-timing.js';let s='';for await(const p of process.stdin)s+=p;console.log(JSON.stringify(JSON.parse(s).map(sentenceRanges)));"
    sentences = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', program], input=json.dumps(texts).encode(), cwd=ROOT))
    cues, coverage = [], []
    for pi, (para, ranges) in enumerate(zip(report['paragraphs'], sentences)):
        block_index = narration['spokenBlocks'][pi]
        canonical = body['paragraphs'][block_index]
        alignment = paragraph_alignment(para, canonical, words)
        matched, expected = len(alignment['timing']), len(alignment['expected'])
        ratio = matched/max(1, expected)
        coverage.append({'paragraph': block_index, 'matchedWords': matched, 'expectedWords': expected, 'coverage': ratio})
        if ratio < .8:
            raise ValueError(f'Audio needs review: block {block_index}, word coverage {ratio:.1%}')
        cues.extend(sentence_cue(sentence, para, canonical, alignment, block_index) for sentence in ranges)
    close_cue_gaps(cues)
    return {'version': body['version'], 'duration': report['duration'], 'voice': report['voice'],
            'audioSha256': report['audioSha256'], 'cues': cues, 'coverage': coverage}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--voice', choices=['female', 'male'], required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'work/recordings')
    args = parser.parse_args()
    _, document_id = load_job(args.job)
    folder = local_path(args.output/document_id, ROOT/'work')
    audio = local_path(folder/(args.voice+'.mp3'), folder)
    body = json.loads(local_path(folder/'prepared.json', folder).read_text())
    narration = json.loads(local_path(folder/'narration.json', folder).read_text())
    report = json.loads(local_path(folder/(args.voice+'.json'), folder).read_text())
    if report['voice'] != {'female': 'af_sky', 'male': 'am_michael'}[args.voice]:
        raise ValueError('The generated voice does not match the requested slot')
    audio_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
    if audio_hash != report['audioSha256']:
        raise ValueError('Audio changed after generation')
    from importlib.metadata import version
    identity = hashlib.sha256((audio_hash+'|base.en|beam5|'+version('faster-whisper')).encode()).hexdigest()[:20]
    cache = local_path(folder/(identity+'-words.json'), folder)
    if cache.exists():
        words = json.loads(cache.read_text())
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=6,
                             download_root=str(ROOT/'scripts/cache/narration/whisper'), local_files_only=True)
        # Decode explicitly so alignment does not depend on PyAV's changing
        # container metadata keyword arguments in the transcription wrapper.
        import av
        import numpy as np
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        frames = []
        with av.open(str(audio)) as media:
            for frame in media.decode(audio=0):
                frames.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(frame))
        frames.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(None))
        segments, _ = model.transcribe(np.concatenate(frames), language='en', beam_size=5, word_timestamps=True,
                                       vad_filter=True, condition_on_previous_text=False)
        words = [{'text': w.word, 'start': w.start, 'end': w.end} for segment in segments for w in segment.words]
        cache.write_text(json.dumps(words)+'\n')
    result = align(body, narration, report, words)
    destination = local_path(folder/(args.voice+'-cues.json'), folder)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print('Aligned reviewed recording:', document_id, args.voice, flush=True)


if __name__ == '__main__':
    main()
