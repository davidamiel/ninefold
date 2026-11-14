"""Align locally generated audio to reviewed reader blocks and PDF coordinates."""
import argparse
import difflib
import hashlib
import json
import re
import subprocess
import unicodedata
from pathlib import Path

from generate import ROOT, load_job, local_path
from speech_mapping import map_speech, source_bounds
from stage import validate_source_seeking


SHORT_PASSAGE_SECONDS = 4
SHORT_CONTEXT_SECONDS = 45
CONTEXT_SECONDS = 12
REPAIR_MODEL = 'small.en'


class AlignmentReviewError(ValueError):
    def __init__(self, block, message):
        super().__init__(message)
        self.block = block


def tokens(text):
    return [(word, match.start(), match.end()) for match in re.finditer(r'[^\W\d_]+|\d+', text)
            for word in number_words(''.join(character for character in unicodedata.normalize('NFKD', match.group().casefold())
                                            if not unicodedata.combining(character)))]


def number_words(value):
    small = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
    tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
    if not value.isdigit() or len(value) > 2:
        return [value]
    number = int(value)
    if number < 20:
        return [small[number]]
    return [tens[number//10]] + ([small[number % 10]] if number % 10 else [])


def pairs(left, right):
    result = {}
    for block in difflib.SequenceMatcher(None, left, right, autojunk=False).get_matching_blocks():
        result.update((block.a+i, block.b+i) for i in range(block.size))
    return result


def spoken_token_spellings(words):
    """Normalize this explicit letter-name pronunciation, preserving indexes."""
    result = list(words)
    for index in range(len(words)-2):
        if words[index:index+3] == ['eye', 'ee', 'pa']:
            result[index:index+2] = ['i', 'e']
    return result


def three_digit_readings(value):
    if not value.isdigit() or len(value) != 3 or value.startswith('0'):
        return []
    first = number_words(value[0])
    tail = int(value[1:])
    cardinal = first+['hundred']+(number_words(str(tail)) if tail else [])
    chunk = first+(['oh']+number_words(str(tail)) if tail < 10 else number_words(str(tail)))
    digits = [number_words(character)[0] for character in value]
    return [cardinal, chunk, digits]


def numeric_join_pairs(left, right):
    """Match a digit token only to an exact reading of that same number."""
    if len(right) == 1 and left in three_digit_readings(right[0])+four_digit_readings(right[0]):
        return dict.fromkeys(range(len(left)), 0)
    return {}


def four_digit_readings(value):
    if not value.isdigit() or len(value) != 4 or value.startswith('0'):
        return []
    return [number_words(value[:2])+number_words(value[2:])]


def timing_pairs(expected, heard):
    """Accept close ASR spellings within an otherwise aligned word sequence."""
    expected, heard = spoken_token_spellings(expected), spoken_token_spellings(heard)
    result = pairs(expected, heard)
    matcher = difflib.SequenceMatcher(None, expected, heard, autojunk=False)
    for tag, a, b, c, d in matcher.get_opcodes():
        if tag != 'replace':
            continue
        left_words, right_words = expected[a:b], heard[c:d]
        joined = exact_join_pairs(left_words, right_words) or numeric_join_pairs(left_words, right_words)
        if joined:
            result.update((a+left, c+right) for left, right in joined.items())
            continue
        if joined_spelling(left_words, right_words):
            result.update((index, c) for index in range(a, b))
            continue
        result.update(close_spellings(expected, heard, a, b, c, d))
    return result


def exact_join_pairs(left, right):
    """Match adjacent abbreviation/possessive joins without changing letters."""
    if not left or not right or max(len(left), len(right)) > 8 or ''.join(left) != ''.join(right):
        return {}
    spans, cursor = [], 0
    for index, word in enumerate(right):
        spans.append((cursor, cursor+len(word), index))
        cursor += len(word)
    result, cursor = {}, 0
    for index, word in enumerate(left):
        match = next((heard for start, end, heard in spans if start <= cursor and cursor+len(word) <= end), None)
        if match is None:
            return {}
        result[index] = match
        cursor += len(word)
    return result


def close_spellings(expected, heard, a, b, c, d):
    if b-a != d-c or b-a > 4:
        return {}
    return {left: right for left, right in zip(range(a, b), range(c, d))
            if min(len(expected[left]), len(heard[right])) >= 4
            and difflib.SequenceMatcher(None, expected[left], heard[right]).ratio() >= .8}


def joined_spelling(left, right):
    if len(right) != 1 or not 1 < len(left) <= 8:
        return False
    joined = ''.join(left)
    if joined == right[0]:
        return True
    return all(len(word) == 1 for word in left) and difflib.SequenceMatcher(None, joined, right[0]).ratio() >= .8


def source_ranges(paragraph, start, end):
    result, cursor = [], 0
    for part in paragraph['segments']:
        left, right = max(start, cursor)-cursor, min(end, cursor+len(part['text']))-cursor
        if right > left:
            result.append({'page': part['page'], 'start': part['map'][left], 'end': part['map'][right-1]+1})
        cursor += len(part['text'])
    return result


def validate_speech_mapping(text, canonical, intervals):
    if len(intervals) != len(text):
        raise ValueError('Speech source mapping length differs from the emitted script')
    for origin in intervals:
        if origin is None:
            continue
        if (not isinstance(origin, (tuple, list)) or len(origin) != 2
                or not all(isinstance(offset, int) for offset in origin)
                or not 0 <= origin[0] < origin[1] <= len(canonical['text'])):
            raise ValueError('Speech source mapping has an invalid reader interval')


def paragraph_alignment(para, canonical, words, speech_mapping=None):
    if speech_mapping is None:
        # Unmodified text and the fixed footnote announcements can be mapped
        # exactly. Transformed speech requires its prepared edit map.
        label = canonical['label'] if canonical['kind'] == 'footnote' else None
        identity = map_speech(canonical['text'], footnote_label=label)
        if identity is None or identity.text != para['text']:
            raise ValueError('Transformed narration requires its prepared speech source mapping')
        speech_mapping = identity.intervals
    validate_speech_mapping(para['text'], canonical, speech_mapping)
    expected = tokens(para['text'])
    heard = [(token, w) for w in words if w['end'] > para['start'] and w['start'] < para['end'] for token, _, _ in tokens(w['text'])]
    timing = timing_pairs([t[0] for t in expected], [t[0] for t in heard])
    return {'expected': expected, 'heard': heard, 'timing': timing, 'speechMapping': speech_mapping}


def sentence_source_bounds(canonical, intervals, sentence, transition):
    if transition:
        return max(0, len(canonical['text'])-1), len(canonical['text'])
    bounds = source_bounds(intervals, sentence['start'], sentence['end'])
    if bounds is None:
        return None
    start, end = bounds
    while end < len(canonical['text']) and canonical['text'][end] in '.!?,;:”’"\')':
        end += 1
    return start, end


def mapped_source_ranges(canonical, intervals, start, end, transition=False):
    """Map a verified speech span to PDF ranges without changing its timing."""
    bounds = sentence_source_bounds(canonical, intervals, {'start': start, 'end': end}, transition)
    return source_ranges(canonical, *bounds) if bounds is not None else []


def sentence_cue(sentence, para, canonical, alignment, block_index):
    text = para['text'][sentence['start']:sentence['end']]
    indexes = [i for i, t in enumerate(alignment['expected']) if sentence['start'] <= t[1] < sentence['end']]
    if not indexes:
        return None  # Closing quotation punctuation has no separately spoken words.
    timed = [alignment['heard'][alignment['timing'][i]][1] for i in indexes if i in alignment['timing']]
    announcement = re.sub(r'^[^\w]*', '', text)
    transition = canonical['kind'] == 'footnote' and announcement == f'End footnote {canonical["label"]}.'
    ranges = mapped_source_ranges(canonical, alignment['speechMapping'], sentence['start'], sentence['end'], transition)
    if not timed or len(timed)/max(1, len(indexes)) < .5 or not ranges:
        raise AlignmentReviewError(block_index, f'Audio sentence needs review: block {block_index}: {text}')
    start_time = para['start'] if sentence['start'] == 0 else max(para['start'], timed[0]['start'])
    end_time = para['end'] if sentence['end'] == len(para['text']) else min(para['end'], timed[-1]['end'])
    cue = {'start': round(start_time, 3), 'end': round(end_time, 3),
           'paragraph': block_index, 'ranges': ranges, 'text': text}
    if transition:
        cue['text'] = announcement
        cue['transition'] = True
    if canonical['kind'] == 'footnote':
        cue['footnote'] = canonical['label']
    return cue


def close_cue_gaps(cues):
    for i, cue in enumerate(cues):
        if i+1 < len(cues):
            cue['end'] = max(cue['end'], cues[i+1]['start'])
        if cue['end'] <= cue['start'] or i and cue['start'] < cues[i-1]['end']:
            previous = cues[i-1] if i and cue['start'] < cues[i-1]['end'] else cue
            raise AlignmentReviewError(previous['paragraph'], f'Overlapping sentence timings require review: {cues[max(0, i-1):i+1]}')


def align(body, narration, report, words):
    if body['version'] != report['version'] or narration['version'] != report['version']:
        raise ValueError('Audio and reviewed text versions differ')
    texts = [p['text'] for p in report['paragraphs']]
    if texts != narration['spokenParagraphs'] or len(texts) != len(narration['spokenBlocks']):
        raise ValueError('Generated narration differs from the reviewed script')
    mappings = narration.get('spokenMappings')
    if not isinstance(mappings, list) or len(mappings) != len(texts):
        raise ValueError('Reprepare narration to include exact speech source mappings')
    sentences = sentence_ranges(texts)
    cues, coverage = [], []
    for pi, (para, ranges) in enumerate(zip(report['paragraphs'], sentences)):
        block_index = narration['spokenBlocks'][pi]
        canonical = body['paragraphs'][block_index]
        alignment = paragraph_alignment(para, canonical, words, mappings[pi])
        matched, expected = len(alignment['timing']), len(alignment['expected'])
        ratio = matched/max(1, expected)
        coverage.append({'paragraph': block_index, 'matchedWords': matched, 'expectedWords': expected, 'coverage': ratio})
        if ratio < .8:
            raise AlignmentReviewError(block_index, f'Audio needs review: block {block_index}, word coverage {ratio:.1%}')
        cues.extend(cue for sentence in ranges if (cue := sentence_cue(sentence, para, canonical, alignment, block_index)))
    close_cue_gaps(cues)
    return {'version': body['version'], 'duration': report['duration'], 'voice': report['voice'],
            'audioSha256': report['audioSha256'], 'cues': cues, 'coverage': coverage}


def sentence_ranges(texts):
    program = "import {sentenceRanges} from './dist/transcript-timing.js';let s='';for await(const p of process.stdin)s+=p;console.log(JSON.stringify(JSON.parse(s).map(sentenceRanges)));"
    ranges = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', program], input=json.dumps(texts).encode(), cwd=ROOT))
    # The browser splitter returns UTF-16 positions; all Python text slices and
    # token positions below use Unicode code points, including mathematical text.
    result = []
    for text, sentences in zip(texts, ranges, strict=True):
        offsets, utf16 = {0: 0}, 0
        for index, character in enumerate(text, 1):
            utf16 += 2 if ord(character) > 0xFFFF else 1
            offsets[utf16] = index
        result.append([{**sentence, 'start': offsets[sentence['start']], 'end': offsets[sentence['end']]}
                       for sentence in sentences])
    return result


def replace_words(words, paragraph, replacement):
    retained = [word for word in words if word['end'] <= paragraph['start'] or word['start'] >= paragraph['end']]
    return sorted(retained+replacement, key=lambda word: word['start'])


def align_with_repairs(body, narration, report, words, refine):
    """Recheck only failed acoustic paragraphs; never supply the expected text."""
    repaired = set()
    while True:
        try:
            return align(body, narration, report, words), words
        except AlignmentReviewError as error:
            if error.block in repaired:
                error.words = words
                raise
            repaired.add(error.block)
            index = narration['spokenBlocks'].index(error.block)
            paragraph = report['paragraphs'][index]
            replacement = refine(paragraph['start'], paragraph['end'])
            words = replace_words(words, paragraph, replacement)


def short_failed_paragraph(narration, report, error, attempted):
    index = narration['spokenBlocks'].index(error.block)
    paragraph = report['paragraphs'][index]
    duration = paragraph['end']-paragraph['start']
    if error.block in attempted or not 0 < duration <= SHORT_PASSAGE_SECONDS:
        raise error
    return paragraph


def align_short_cpu(body, narration, report, error, recognizer, device):
    """Recheck only unresolved short MPS clips, once each, with CPU acoustics."""
    if device != 'mps':
        raise error
    words, attempted, cpu = error.words, set(), None
    while True:
        paragraph = short_failed_paragraph(narration, report, error, attempted)
        if cpu is None:
            print('Rechecking short unclear passage on CPU.', flush=True)
            cpu = Transcriber(recognizer.audio, REPAIR_MODEL, device='cpu')
            cpu.samples = recognizer.samples
        attempted.add(error.block)
        replacement = cpu.contextual_words(paragraph['start'], paragraph['end'])
        words = replace_words(words, paragraph, replacement)
        try:
            result = align(body, narration, report, words)
            validate_source_seeking(result)
            return result, words
        except AlignmentReviewError as next_error:
            error = next_error
            error.words = words


def align_small_model(body, narration, report, words, recognizer, device):
    try:
        return align_with_repairs(body, narration, report, words, recognizer.words)
    except AlignmentReviewError as error:
        try:
            return align_with_repairs(body, narration, report, error.words, recognizer.contextual_words)
        except AlignmentReviewError as contextual_error:
            return align_short_cpu(body, narration, report, contextual_error, recognizer, device)


def align_recording(body, narration, report, words, recognizer, device):
    try:
        return align_with_repairs(body, narration, report, words, recognizer.words)
    except AlignmentReviewError as error:
        print('Rechecking unclear audio with the higher-accuracy local recognizer.', flush=True)
        fallback = Transcriber(recognizer.audio, REPAIR_MODEL, device=device)
        fallback.samples = recognizer.samples
        return align_small_model(body, narration, report, error.words, fallback, device)


def decode_audio(audio):
    import av
    import numpy as np
    resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
    frames = []
    with av.open(str(audio)) as media:
        for frame in media.decode(audio=0):
            frames.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(frame))
    frames.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(None))
    return np.concatenate(frames)


class Transcriber:
    def __init__(self, audio, model_name='base.en', device='cpu'):
        self.audio = audio
        self.model_name = model_name
        self.device = device
        self.model = None
        self.samples = None

    def load(self):
        if self.model is None:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(self.model_name, device=self.device,
                                      compute_type='float16' if self.device == 'mps' else 'int8', cpu_threads=6,
                                      download_root=str(ROOT/'scripts/cache/narration/whisper'), local_files_only=True)
        if self.samples is None:
            self.samples = decode_audio(self.audio)

    def words(self, start=0, end=None):
        self.load()
        samples = self.samples[round(start*16000):round(end*16000) if end is not None else None]
        segments, _ = self.model.transcribe(samples, language='en', beam_size=5, word_timestamps=True,
                                            vad_filter=False, condition_on_previous_text=False)
        return [{'text': w.word, 'start': start+w.start, 'end': start+w.end} for segment in segments for w in segment.words]

    def contextual_words(self, start, end):
        # A very short sentence can lose legal vocabulary when recognized alone.
        # Retain neighboring acoustics, then return only words in this paragraph.
        context = SHORT_CONTEXT_SECONDS if end-start <= SHORT_PASSAGE_SECONDS else CONTEXT_SECONDS
        return [word for word in self.words(max(0, start-context), end+CONTEXT_SECONDS)
                if start <= (word['start']+word['end'])/2 < end]


def save_words(path, words):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(words)+'\n')
    temporary.replace(path)


def recognition_identity(audio_hash, device, recognizer_version):
    policy = {'audioSha256': audio_hash, 'device': device, 'fasterWhisper': recognizer_version,
              'models': ['base.en', REPAIR_MODEL], 'beam': 5, 'vad': False, 'unprompted': True,
              'context': {'shortMaxSeconds': SHORT_PASSAGE_SECONDS, 'precedingShort': SHORT_CONTEXT_SECONDS,
                          'precedingNormal': CONTEXT_SECONDS, 'following': CONTEXT_SECONDS},
              'finalRepair': {'model': REPAIR_MODEL, 'device': 'cpu', 'onlyAfterDevice': 'mps',
                              'computeType': 'int8', 'unprompted': True,
                              'shortMaxSeconds': SHORT_PASSAGE_SECONDS, 'preceding': SHORT_CONTEXT_SECONDS,
                              'following': CONTEXT_SECONDS, 'attemptsPerParagraph': 1}}
    return hashlib.sha256(json.dumps(policy, sort_keys=True).encode()).hexdigest()[:20]


def recognition_words(folder, audio_hash, device, recognizer_version, recognizer):
    cache = local_path(folder/(recognition_identity(audio_hash, device, recognizer_version)+'-words.json'), folder)
    if cache.exists():
        return cache, json.loads(cache.read_text())
    words = recognizer.words()
    save_words(cache, words)
    return cache, words


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--voice', choices=['female', 'male'], required=True)
    parser.add_argument('--device', choices=['cpu', 'mps'], default='cpu')
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
    transcriber = Transcriber(audio, device=args.device)
    cache, words = recognition_words(folder, audio_hash, args.device, version('faster-whisper'), transcriber)
    result, words = align_recording(body, narration, report, words, transcriber, args.device)
    validate_source_seeking(result)
    save_words(cache, words)
    destination = local_path(folder/(args.voice+'-cues.json'), folder)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print('Aligned reviewed recording:', document_id, args.voice, flush=True)


if __name__ == '__main__':
    main()
