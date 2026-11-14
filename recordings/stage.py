"""Stage both reviewed voices, reader text and sentence cues for a site build."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path

from generate import ROOT, load_job, local_path
from prepare import prepare
from public_offsets import public_payload

DATA_DIRECTORY=ROOT/'dist/data'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n')


def asset(path, directory, prefix):
    payload = path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    hosted_path = DATA_DIRECTORY/'recorded-assets.json'
    if directory == 'audio' and hosted_path.exists():
        hosted = json.loads(hosted_path.read_text()).get(digest)
        if hosted and hosted['bytes'] == len(payload):
            return hosted['url']
    name = (prefix+'-' if prefix else '')+digest[:24]
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
    original_path = local_path(ROOT/'dist'/source['textPath'], DATA_DIRECTORY)
    original = [p['text'] for p in json.loads(original_path.read_text())['pages']]
    for target in entries:
        if target['id'] == identifier or any(target.get(key) != source.get(key) for key in keys):
            continue
        target_path = local_path(ROOT/'dist'/target['textPath'], DATA_DIRECTORY)
        pages = [p['text'] for p in json.loads(target_path.read_text())['pages']]
        if pages == original and target.get('parentDocumentId'):
            result[target['id']] = {**metadata, 'sourceDocumentId': target['parentDocumentId'], 'sourceTextPath': target['textPath']}
    return result


def public_files(body, recordings, folder, source_pages):
    """Keep native maps private; export browser coordinates only when needed."""
    reader_path = folder/'prepared.json'
    for voice, item in recordings.items():
        public_body, public_cues = public_payload(body, item['cues'], source_pages)
        if public_body != body:
            reader_path = folder/'public-prepared.json'
            write_json(reader_path, public_body)
        cue_path = folder/(voice+'-cues.json')
        if public_cues != item['cues']:
            cue_path = folder/(voice+'-public-cues.json')
            write_json(cue_path, public_cues)
        item['cuePath'] = cue_path
    return reader_path


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
        raise ValueError('Prepare the current reviewed reader and narration metadata before staging')
    recordings = {}
    # Validate both complete recordings before changing any public assets.
    for voice in ('female', 'male'):
        report = json.loads(local_path(folder/(voice+'.json'), folder).read_text())
        cues = json.loads(local_path(folder/(voice+'-cues.json'), folder).read_text())
        audio = local_path(folder/(voice+'.mp3'), folder)
        validate_recording(body, narration, report, cues, audio, voice)
        recordings[voice] = {'report': report, 'cues': cues, 'audio': audio}
    source = json.loads(local_path(ROOT/job['sourceTextPath'], DATA_DIRECTORY).read_text())
    reader_path = public_files(body, recordings, folder, source['pages'])
    metadata = {key: job[key] for key in ('title', 'author', 'date', 'sourceUrl', 'sourceDocumentId')}
    if job.get('term'):
        metadata['term'] = job['term']
    metadata['sourceTextPath'] = str(Path(job['sourceTextPath']).relative_to('dist'))
    metadata.update(job.get('documentInfo', {}))
    metadata.update(version=body['version'], recordings={})
    for voice, item in recordings.items():
        metadata['recordings'][voice] = {
            'url': asset(item['audio'], 'audio', ''),
            'duration': item['report']['duration'],
            'cuesPath': asset(local_path(item['cuePath'], folder), 'data/recordings', document_id+'-'+voice),
        }
    metadata['textPath'] = asset(local_path(reader_path, folder), 'data/prepared-text', '')
    inventory = ROOT/'dist/data/prepared-documents.json'
    lock_path = local_path(ROOT/'work/recordings/staging.lock', ROOT/'work')
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        documents = json.loads(inventory.read_text())
        documents.update(metadata_aliases(document_id, metadata))
        # Inventory is replaced last: a reader never sees half of a prepared job.
        temporary = local_path(inventory.with_suffix('.tmp'), DATA_DIRECTORY)
        write_json(temporary, documents)
        temporary.replace(inventory)
    print('Staged reviewed reader and both recordings:', document_id)


if __name__ == '__main__':
    main()
