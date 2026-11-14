"""Reconcile published OT25 indexes, reviewed jobs and staged reader recordings."""
import argparse
from collections import defaultdict
import json
from urllib.parse import urldefrag

from generate import ROOT
from prepare import prepare

JUSTICE_SURNAMES = {'roberts', 'thomas', 'alito', 'sotomayor', 'kagan', 'gorsuch', 'kavanaugh', 'barrett', 'jackson'}


def running_author(text):
    for line in text[:250].splitlines():
        header = line.strip().lower().removeprefix('opinion of ').removeprefix('statement of ')
        surname, _, rest = header.partition(',')
        if surname.strip() not in JUSTICE_SURNAMES:
            continue
        compact = ''.join(rest.split())
        prefix = next((prefix for prefix in ('c.j.', 'j.') if compact.startswith(prefix)), None)
        if prefix is None:
            continue
        tail = compact[len(prefix):]
        if ')' not in tail and (not tail or tail.startswith((',concurring', ',dissenting'))):
            return surname.strip().title()
    return None


def read(path):
    return json.loads((ROOT/path).read_text())


def missing_public_sources(plan, sources):
    urls = {urldefrag(target['sourceUrl'])[0] for target in plan['targets']}
    missing = set()
    for index in sources['indexes']:
        for entry in index['entries']:
            for linked_url in entry['sourceUrls']:
                url = urldefrag(linked_url)[0]
                alias = sources['sourceAliases'].get(url, {}).get('sourceUrl', url)
                if alias not in urls and url not in sources['excludedSources']:
                    missing.add(url)
    return sorted(missing)


def unrepresented_writers(plan):
    """Combined PDFs must expose every distinct author in their running bylines."""
    grouped = defaultdict(list)
    for target in plan['targets']:
        grouped[target['textPath']].append(target)
    missing = []
    for path, targets in grouped.items():
        authors = ' '.join(target.get('opinionAuthor') or '' for target in targets).lower()
        seen = set()
        for page, raw in enumerate(read('dist/'+path)['pages']):
            author = running_author(raw['text'])
            if author and author.lower() not in authors and author.lower() not in seen:
                seen.add(author.lower())
                missing.append({'textPath': path, 'page': page, 'author': author})
    return missing


def reviewed_jobs():
    jobs = {}
    for path in (ROOT/'recordings').rglob('*.json'):
        job = json.loads(path.read_text())
        if isinstance(job, dict) and job.get('documentId') and job.get('reviewed') is True:
            jobs[job['documentId']] = job
    return jobs


def recording_stage(document, version, hosted_urls):
    if document.get('version') != version or set(document.get('recordings', {})) != {'female', 'male'}:
        return 'recording and alignment'
    if any(recording.get('url') not in hosted_urls for recording in document['recordings'].values()):
        return 'media publication'
    return None


def unfinished_writings(plan, inventory, hosted):
    jobs, unfinished = reviewed_jobs(), []
    hosted_urls = {proof['url'] for proof in hosted.values()
                   if proof.get('bytes', 0) > 1000 and type(proof.get('releaseAssetId')) is int}
    for target in plan['targets']:
        identifier = target['id']
        job = jobs.get(identifier)
        if job is None:
            unfinished.append({'documentId': identifier, 'stage': 'source review'})
            continue
        body, _ = prepare(job)
        for writing in [identifier, *target.get('aliases', [])]:
            if stage := recording_stage(inventory.get(writing, {}), body['version'], hosted_urls):
                unfinished.append({'documentId': writing, 'stage': stage})
    return unfinished


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    parser.add_argument('--require-reviewed', action='store_true', help='Require complete source reviews while allowing recordings in progress')
    args = parser.parse_args()
    plan, sources = read('recordings/ot25-plan.json'), read('recordings/ot25-sources.json')
    inventory = read('dist/data/prepared-documents.json')
    report = {'uncoveredPublicSources': missing_public_sources(plan, sources),
              'unrepresentedDocuments': plan['unrepresentedDocuments'],
              'unrepresentedWriters': unrepresented_writers(plan),
              'unfinishedWritings': unfinished_writings(plan, inventory, read('dist/data/recorded-assets.json'))}
    output = ROOT/'work/recordings/ot25-coverage.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    complete = not any(report.values())
    print('OT25 coverage complete.' if complete else f'Outstanding source/review/recording work is listed in {output}.')
    reviews_complete = not any(report[key] for key in ('uncoveredPublicSources', 'unrepresentedDocuments', 'unrepresentedWriters'))
    reviews_complete = reviews_complete and not any(item['stage'] == 'source review' for item in report['unfinishedWritings'])
    if (args.require_complete and not complete) or (args.require_reviewed and not reviews_complete):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
