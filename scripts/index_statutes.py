"""Build exact 2024 U.S. Code section references cited in the collection.

Usage: python scripts/index_statutes.py --cache <directory for official title HTML>
"""
import argparse
from collections import Counter, defaultdict
import gzip
import html
import json
from pathlib import Path
import re
import urllib.request


DATA = Path(__file__).resolve().parents[1] / 'dist' / 'data'
DASHES = str.maketrans({ord(c): '-' for c in '\u2010\u2011\u2012\u2013\u2212'})
CITE = re.compile(r'\b([1-9]\d?)\s+U\s*\.?\s*S\s*\.?\s*C\s*\.?\s*(?:\u00a7{1,2}\s*)?'
                  r'(\d+[A-Za-z]*(?:[-\u2010\u2011\u2012\u2013\u2212]\d+[A-Za-z]*)*)(?![A-Za-z])')
HEADING = re.compile(r'\u00a7\s*(\d+[A-Za-z]*(?:-\d+[A-Za-z]*)*)\.\s*(.+)')
DOCUMENT = re.compile(r'<!-- documentid:([^\s]+)')
NEXT_SECTION = re.compile(r'(?:,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)(?:§\s*)?'
                          r'(\d+[A-Za-z]*(?:[-–]\d+[A-Za-z]*)*)(?:\([A-Za-z0-9]+\))*')


def citations():
    counts = Counter()
    for directory in ['docs', 'current-docs']:
        for source in (DATA / directory).glob('*.json'):
            pages = json.loads(source.read_text(encoding='utf-8'))['pages']
            text = '\n'.join(p if isinstance(p, str) else p.get('text', '') for p in pages)
            for cite in CITE.finditer(text):
                title = int(cite[1])
                if title > 54:
                    continue
                numbers = [cite[2]]
                if '§§' in cite[0]:
                    if re.fullmatch(r'\d+–\d+', cite[2]):
                        numbers = cite[2].split('–')
                    offset = cite.end() + re.match(r'(?:\([A-Za-z0-9]+\))*', text[cite.end():cite.end()+80]).end()
                    while link := NEXT_SECTION.match(text, offset):
                        if re.match(r'\s+(?:U\.?\s*S\.?|F\.|S\.\s*Ct\.)', text[link.end():link.end()+20]):
                            break
                        numbers.append(link[1])
                        offset = link.end()
                counts.update((title, n.translate(DASHES)) for n in numbers)
    return counts


def title_source(title, cache):
    path = cache / f'{title}.html'
    if not path.exists():
        package = f'USCODE-2024-title{title}'
        url = f'https://www.govinfo.gov/content/pkg/{package}/html/{package}.htm'
        request = urllib.request.Request(url, headers={'Accept-Encoding': 'gzip'})
        with urllib.request.urlopen(request, timeout=100) as response:
            raw = response.read()
            if response.headers.get('Content-Encoding') == 'gzip':
                raw = gzip.decompress(raw)
            if not raw.strip().endswith(b'</html>'):
                raise ValueError(f'Incomplete document returned from {url}')
            temporary = path.with_suffix('.download')
            temporary.write_bytes(raw)
            temporary.replace(path)
    raw = path.read_text(encoding='utf-8')
    if f'AUTHORITIES-USC-TITLE-ENUM:{title} ' not in raw[:4000] or 'AUTHORITIES-PUBLICATION-YEAR:2024' not in raw[:4000]:
        raise ValueError(f'Unexpected title or edition in {path}')
    return raw


def plain(fragment):
    fragment = re.sub(r'<!--.*?-->', '', fragment, flags=re.S)
    fragment = re.sub(r'</(?:p|h[1-6]|tr)>|<br\b[^>]*>', '\n\n', fragment, flags=re.I)
    fragment = re.sub(r'</t[dh]>', ' | ', fragment, flags=re.I)
    text = html.unescape(re.sub(r'<[^>]+>', '', fragment))
    return '\n\n'.join(x for line in text.splitlines() if (x := ' '.join(line.split())))


def field(record, name):
    match = re.search(r'<!-- field-start:' + name + r' -->(.*?)<!-- field-end:' + name + r' -->', record, re.S)
    return plain(match[1]) if match else ''


def extract_title(title, wanted, cache):
    raw = title_source(title, cache)
    # Scope every lookup to a single GPO document; a repealed or missing section
    # must never consume a later section's text.
    offsets = [m.start() for m in DOCUMENT.finditer(raw)] + [len(raw)]
    metadata, bodies = {}, {}
    for start, end in zip(offsets, offsets[1:]):
        record = raw[start:end]
        if 'class="section-head"' not in record:
            continue
        heading = field(record, 'head')
        numbered = HEADING.fullmatch(heading.translate(DASHES))
        if not numbered or numbered[1] not in wanted or 'field-start:statute' not in record:
            continue
        number = numbered[1]
        name = heading.partition('.')[2].strip()
        text = field(record, 'statute')
        if not text or not name:
            continue
        cite = f'{title} U.S.C. \u00a7 {number}'
        if cite in bodies:
            raise ValueError(f'Duplicate section: {cite}')
        # Match the exact text, retaining the GPO paragraph breaks and numbering.
        preview = text if len(text) <= 450 else text[:450].rsplit(' ', 1)[0].rstrip(' ,;:') + '\u2026'
        metadata[cite] = {
            'kind': 'statute', 'name': name, 'citation': cite, 'edition': '2024 Main Edition',
            'sourceUrl': f'https://www.govinfo.gov/link/uscode/{title}/{number}?type=usc&year=2024&link-type=html',
            'text': preview, 'bodyPath': f'data/statutes/{title}.json',
        }
        bodies[cite] = text
    return metadata, bodies


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    cache = parser.parse_args().cache
    cache.mkdir(parents=True, exist_ok=True)
    counts = citations()
    wanted = defaultdict(set)
    for title, number in counts:
        wanted[title].add(number)
    (DATA / 'statutes').mkdir(exist_ok=True)
    index = {}
    # Per-title processing bounds memory and lets the reader fetch only the title it needs.
    for title in sorted(wanted):
        metadata, bodies = extract_title(title, wanted[title], cache)
        if bodies:
            dump(DATA / 'statutes' / f'{title}.json', bodies)
            index.update(metadata)
    dump(DATA / 'statute-index.json', index)
    hits = sum(count for (t,s),count in counts.items() if f'{t} U.S.C. \u00a7 {s}' in index)
    print(f'{len(index)} exact section matches of {len(counts)} candidates; {hits}/{sum(counts.values())} mentions.')


if __name__ == '__main__':
    main()
