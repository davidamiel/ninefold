"""Stage both reviewed voices, reader text and sentence cues for a site build."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path

from generate import ROOT, load_job, local_path
from prepare import prepare


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')


def asset(path, directory, prefix):
    payload = path.read_bytes()
    name = (prefix+'-' if prefix else '')+hashlib.sha256(payload).hexdigest()[:24]
    relative = f'{directory}/{name}{path.suffix}'
    destination = local_path(ROOT/'dist'/relative, ROOT/'dist'/directory)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return relative


def validate_recording(body, narration, report, cues, audio, voice):
    if hashlib.sha256(audio.read_bytes()).hexdigest() != report['audioSha256']:
        raise ValueError('Generated audio hash mismatch')
    if cues['audioSha256'] != report['audioSha256'] or report['voice'] != {'female': 'af_sky', 'male': 'am_michael'}[voice] or cues['voice'] != report['voice']:
        raise ValueError('Alignment must match the recording and its voice')
    if cues['version'] != body['version'] or report['version'] != body['version'] or cues['duration'] != report['duration']:
        raise ValueError('Reader text, audio and cues must have the same version')
    if len(cues['coverage']) != len(narration['spokenParagraphs']) or any(c['coverage'] < .8 for c in cues['coverage']):
        raise ValueError('Audio alignment needs review')
    if not cues['cues'] or any(not c['ranges'] or c['end'] <= c['start'] for c in cues['cues']):
        raise ValueError('Incomplete sentence cues')


def metadata_aliases(identifier, metadata):
    """Share recordings only when both writing ranges and source text match."""
    sections = json.loads((ROOT/'dist/data/opinion-sections.json').read_text())
    sections.update(json.loads((ROOT/'dist/data/opinion-section-overrides.json').read_text()))
    entries = [item for items in sections.values() for item in items]
    source = next((item for item in entries if item['id'] == identifier), None)
    result = {identifier: metadata}
    if source is None:
        return result
    keys = ('sourceUrl', 'sourceRange', 'opinionType', 'opinionAuthor')
    original_path = local_path(ROOT/'dist'/source['textPath'], ROOT/'dist/data')
    original = [p['text'] for p in json.loads(original_path.read_text())['pages']]
    for target in entries:
        if target['id'] == identifier or any(target.get(key) != source.get(key) for key in keys):
            continue
        target_path = local_path(ROOT/'dist'/target['textPath'], ROOT/'dist/data')
        pages = [p['text'] for p in json.loads(target_path.read_text())['pages']]
        if pages == original and target.get('parentDocumentId'):
            result[target['id']] = {**metadata, 'sourceDocumentId': target['parentDocumentId']}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'work/recordings')
    args = parser.parse_args()
    job, document_id = load_job(args.job)
    if job.get('reviewed') is False:
        raise ValueError('Review this preparation before staging audio')
    body, narration = prepare(job)
    folder = local_path(args.output/document_id, ROOT/'work')
    if json.loads(local_path(folder/'prepared.json', folder).read_text()) != body or json.loads(local_path(folder/'narration.json', folder).read_text()) != narration:
        raise ValueError('Regenerate audio after changing the reviewed job')
    recordings = {}
    # Validate both complete recordings before changing any public assets.
    for voice in ('female', 'male'):
        report = json.loads(local_path(folder/(voice+'.json'), folder).read_text())
        cues = json.loads(local_path(folder/(voice+'-cues.json'), folder).read_text())
        audio = local_path(folder/(voice+'.mp3'), folder)
        validate_recording(body, narration, report, cues, audio, voice)
        recordings[voice] = {'report': report, 'cues': cues, 'audio': audio}
    metadata = {key: job[key] for key in ('title', 'author', 'date', 'sourceUrl', 'sourceDocumentId')}
    metadata.update(job.get('documentInfo', {}))
    metadata.update(version=body['version'], recordings={})
    for voice, item in recordings.items():
        metadata['recordings'][voice] = {
            'url': asset(item['audio'], 'audio', document_id+'-'+voice),
            'duration': item['report']['duration'],
            'cuesPath': asset(local_path(folder/(voice+'-cues.json'), folder), 'data/recordings', document_id+'-'+voice),
        }
    metadata['textPath'] = asset(local_path(folder/'prepared.json', folder), 'data/prepared-text', '')
    inventory = ROOT/'dist/data/prepared-documents.json'
    lock_path = local_path(ROOT/'work/recordings/staging.lock', ROOT/'work')
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        documents = json.loads(inventory.read_text())
        documents.update(metadata_aliases(document_id, metadata))
        # Inventory is replaced last: a reader never sees half of a prepared job.
        temporary = local_path(inventory.with_suffix('.tmp'), ROOT/'dist/data')
        write_json(temporary, documents)
        temporary.replace(inventory)
    print('Staged reviewed reader and both recordings:', document_id)


if __name__ == '__main__':
    main()
