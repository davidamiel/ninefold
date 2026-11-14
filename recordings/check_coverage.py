"""Reconcile published OT25 indexes, reviewed jobs and staged reader recordings."""
import argparse
from collections import defaultdict
import json
import re
from urllib.parse import urldefrag

from generate import ROOT
from prepare import prepare


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
    byline = re.compile(r'^(Roberts|Thomas|Alito|Sotomayor|Kagan|Gorsuch|Kavanaugh|Barrett|Jackson)\s*,\s*(?:J\.|C\.\s*J\.)\s*,\s*(dissenting|concurring)', re.I | re.M)
    for path, targets in grouped.items():
        authors = ' '.join(target.get('opinionAuthor') or '' for target in targets).lower()
        seen = set()
        for page, raw in enumerate(read('dist/'+path)['pages']):
            match = byline.search(raw['text'][:200])
            if match and match[1].lower() not in authors and match[1].lower() not in seen:
                seen.add(match[1].lower())
                missing.append({'textPath': path, 'page': page, 'author': match[1]})
    return missing


def reviewed_jobs():
    jobs = {}
    for path in (ROOT/'recordings').rglob('*.json'):
        job = json.loads(path.read_text())
        if isinstance(job, dict) and job.get('documentId') and job.get('reviewed') is True:
            jobs[job['documentId']] = job
    return jobs


def unfinished_writings(plan, inventory):
    jobs, unfinished = reviewed_jobs(), []
    for target in plan['targets']:
        identifier = target['id']
        job = jobs.get(identifier)
        if job is None:
            unfinished.append({'documentId': identifier, 'stage': 'source review'})
            continue
        body, _ = prepare(job)
        staged = inventory.get(identifier, {})
        if staged.get('version') != body['version'] or set(staged.get('recordings', {})) != {'female', 'male'}:
            unfinished.append({'documentId': identifier, 'stage': 'recording and alignment'})
    return unfinished


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    args = parser.parse_args()
    plan, sources = read('recordings/ot25-plan.json'), read('recordings/ot25-sources.json')
    inventory = read('dist/data/prepared-documents.json')
    report = {'uncoveredPublicSources': missing_public_sources(plan, sources),
              'unrepresentedDocuments': plan['unrepresentedDocuments'],
              'unrepresentedWriters': unrepresented_writers(plan),
              'unfinishedWritings': unfinished_writings(plan, inventory)}
    output = ROOT/'work/recordings/ot25-coverage.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    complete = not any(report.values())
    print('OT25 coverage complete.' if complete else f'Outstanding source/review/recording work is listed in {output}.')
    if args.require_complete and not complete:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
