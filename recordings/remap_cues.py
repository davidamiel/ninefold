"""Refresh source ranges in verified cues without changing audio or timestamps."""
import argparse
import copy
import json
import re

from align import mapped_source_ranges, sentence_ranges, tokens, validate_speech_mapping
from generate import ROOT, load_job, local_path
from prepare import prepare
from stage import validate_recording


def expected_sentences(body, narration):
    sentences = sentence_ranges(narration['spokenParagraphs'])
    for index, ranges in enumerate(sentences):
        text = narration['spokenParagraphs'][index]
        block = narration['spokenBlocks'][index]
        canonical = body['paragraphs'][block]
        intervals = narration['spokenMappings'][index]
        validate_speech_mapping(text, canonical, intervals)
        for sentence in ranges:
            spoken = text[sentence['start']:sentence['end']]
            if not tokens(spoken):
                continue
            announcement = re.sub(r'^[^\w]*', '', spoken)
            transition = canonical['kind'] == 'footnote' and announcement == f'End footnote {canonical["label"]}.'
            source = mapped_source_ranges(canonical, intervals, sentence['start'], sentence['end'], transition)
            if not source:
                raise ValueError('The sentence has no reviewed source range')
            yield block, announcement if transition else spoken, transition, source


def matching_cue_group(existing, cursor, block, text, transition):
    """Only coalesce exact adjacent fragments; never invent/split a timing."""
    group, offset = [], 0
    while offset < len(text):
        if cursor >= len(existing):
            raise ValueError('The verified cue sequence is incomplete')
        cue = existing[cursor]
        if (cue['paragraph'] != block or bool(cue.get('transition')) != transition
                or not cue['text'] or not text.startswith(cue['text'], offset)):
            raise ValueError('The verified cue does not match its exact reviewed sentence')
        if group and cue['start'] < group[-1]['end']:
            raise ValueError('Overlapping acoustic timings cannot be coalesced')
        group.append(cue)
        cursor += 1
        offset += len(cue['text'])
        while offset < len(text) and text[offset].isspace():
            offset += 1
    return group, cursor


def remap_cues(body, narration, report, cues):
    if any(value['version'] != body['version'] for value in (narration, report, cues)):
        raise ValueError('Cue refresh requires the current verified recording version')
    if [paragraph['text'] for paragraph in report['paragraphs']] != narration['spokenParagraphs']:
        raise ValueError('The complete recorded script differs from the reviewed narration')
    refreshed = copy.deepcopy(cues)
    refreshed['cues'] = []
    cursor = 0
    for block, text, transition, source in expected_sentences(body, narration):
        group, cursor = matching_cue_group(cues['cues'], cursor, block, text, transition)
        merged = copy.deepcopy(group[0])
        merged.update(text=text, end=group[-1]['end'], ranges=source)
        refreshed['cues'].append(merged)
    if cursor != len(cues['cues']):
        raise ValueError('The verified cue sequence differs from the reviewed sentences')
    return refreshed


def write_atomic(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job')
    args = parser.parse_args()
    job, identifier = load_job(args.job)
    if job.get('reviewed') is not True:
        raise ValueError('A reviewed job is required')
    body, narration = prepare(job)
    folder = local_path(ROOT/'work/recordings'/identifier, ROOT/'work')
    updates = {}
    for voice in ('female', 'male'):
        report = json.loads((folder/(voice+'.json')).read_text())
        cues = json.loads((folder/(voice+'-cues.json')).read_text())
        audio = folder/(voice+'.mp3')
        validate_recording(body, narration, report, cues, audio, voice)
        refreshed = remap_cues(body, narration, report, cues)
        validate_recording(body, narration, report, refreshed, audio, voice)
        updates[voice+'-cues.json'] = refreshed
    updates.update({'prepared.json': body, 'narration.json': narration})
    for name, value in updates.items():
        write_atomic(local_path(folder/name, folder), value)
    print('Refreshed source ranges; verified audio and acoustic timings are unchanged:', identifier)


if __name__ == '__main__':
    main()
