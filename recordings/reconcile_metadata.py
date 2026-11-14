"""Reconcile OT25 writing tabs with case attribution and reviewed joinders."""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urldefrag

from generate import ROOT
from stage import write_json


def reviewed_metadata():
    result = {}
    for path in (ROOT/'recordings').rglob('*.json'):
        value = json.loads(path.read_text())
        if isinstance(value, dict) and value.get('reviewed') is True and value.get('documentId'):
            result[value['documentId']] = value.get('documentInfo', {})
    return result


def original_opinion(document, opinions):
    exact = next((opinion for opinion in opinions if opinion.get('documentId') == document['id']), None)
    if exact is not None:
        return exact
    source = urldefrag(document['sourceUrl'])[0]
    candidates = [opinion for opinion in opinions if urldefrag(opinion.get('sourceUrl', ''))[0] == source
                  and opinion.get('author') == document.get('opinionAuthor')]
    return next((opinion for opinion in candidates if opinion.get('pageIndex') == document['sourceRange']['startPage']),
                next((opinion for opinion in candidates if opinion.get('type') == document.get('opinionType')), {}))


def justice_name(value, justice_names):
    plain = value.partition('(')[0].strip().removesuffix(', Jr.').removesuffix(' Jr.')
    words = plain.split()
    if not words:
        raise ValueError('A reviewed justice name is required')
    matches = [name for name in justice_names
               if name.removesuffix(', Jr.').split()[-1] == words[-1]
               and (len(words) == 1 or name.split()[0] == words[0])]
    if len(matches) != 1:
        raise ValueError('Unrecognized reviewed justice name: '+value)
    return matches[0]


def attribution(document, opinions, metadata, justice_names):
    result = copy.deepcopy(original_opinion(document, opinions))
    result.update(type=document['opinionType'], author=document.get('opinionAuthor') or 'Per Curiam',
                  documentId=document['id'], pageIndex=document['sourceRange']['startPage'], sourceUrl=document['sourceUrl'])
    result.setdefault('joinedBy', [])
    if 'joinedBy' in metadata:
        names, scopes = [], {}
        for value in metadata['joinedBy']:
            name = justice_name(value, justice_names)
            names.append(name)
            if '(' in value:
                scopes[name] = value.partition('(')[2].removesuffix(')')
        result['joinedBy'] = names
        if scopes:
            result['joiningScope'] = {**(result.get('joiningScope') if isinstance(result.get('joiningScope'), dict) else {}), **scopes}
    if metadata.get('participation'):
        result['participation'] = metadata['participation']
    if isinstance(metadata.get('joiningScope'), dict):
        result['joiningScope'] = {justice_name(name, justice_names): scope for name, scope in metadata['joiningScope'].items()}
    return result


def reconcile(catalog, sections, metadata, justice_names):
    changed = []
    for case in catalog['cases']:
        writings = [document for document in sections.get(case['id'], [])
                    if '/opinions/25pdf/' in document.get('sourceUrl', '')
                    and document.get('opinionType') not in ('Syllabus', 'Order of the Court')]
        if not writings:
            continue
        decision = case.setdefault('decision', {})
        opinions = decision.get('opinions', [])
        updated = [attribution(document, opinions, metadata.get(document['id'], {}), justice_names) for document in writings]
        updated += [opinion for opinion in opinions if '/opinions/25pdf/' not in opinion.get('sourceUrl', '')
                    and opinion.get('documentId') not in {document['id'] for document in writings}]
        if updated != opinions:
            decision['opinions'] = updated
            changed.append(case['id'])
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    base = ROOT/'dist/data'
    catalog_path = base/'catalog.json'
    catalog = json.loads(catalog_path.read_text())
    sections = json.loads((base/'opinion-sections.json').read_text())
    sections.update(json.loads((base/'opinion-section-overrides.json').read_text()))
    profiles = json.loads((base/'profiles.json').read_text())
    names = [name for name, profile in profiles.items() if profile.get('type') == 'justice']
    changed = reconcile(catalog, sections, reviewed_metadata(), names)
    if args.apply:
        temporary = catalog_path.with_suffix('.tmp')
        write_json(temporary, catalog)
        temporary.replace(catalog_path)
    print('Updated case writing metadata:' if args.apply else 'Case metadata changes pending:', ', '.join(changed) or 'none')


if __name__ == '__main__':
    main()
