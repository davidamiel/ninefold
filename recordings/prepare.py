"""Build source-mapped reader text and narration from an explicitly reviewed job."""
import argparse
import hashlib
import json
import re
from pathlib import Path

from generate import ROOT, load_job, local_path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_chars(chars, pattern, replacement):
    text = ''.join(c[0] for c in chars)
    for match in reversed(list(re.finditer(pattern, text))):
        old = chars[match.start():match.end()]
        chars[match.start():match.end()] = [
            (letter, *old[min(i, len(old) - 1)][1:])
            for i, letter in enumerate(replacement(match))
        ]
    return chars


def span_chars(span, source, repairs):
    """Apply reviewed repairs while retaining each character's PDF position."""
    page, start, end = span['page'], span['start'], span['end']
    raw = source['pages'][page]['text']
    if not 0 <= start < end <= len(raw):
        raise ValueError('Invalid source span')
    chars = [(ch, page, i) for i, ch in enumerate(raw[start:end], start)]
    page_repairs = sorted((r for r in repairs if r['page'] == page and start <= r['start'] < r['end'] <= end), key=lambda r: r['start'])
    previous_end = start
    for repair in page_repairs:
        if repair['start'] < previous_end:
            raise ValueError('Reviewed source text repairs overlap')
        previous_end = repair['end']
    for repair in reversed(page_repairs):
        if raw[repair['start']:repair['end']] != repair['expectedText']:
            raise ValueError('A reviewed text repair no longer matches its source')
        a, b = repair['start'] - start, repair['end'] - start
        old = chars[a:b]
        chars[a:b] = [(ch, page, old[min(i, len(old)-1)][2]) for i, ch in enumerate(repair['text'])]
    return chars


def append_span(chars, part, span, separator):
    if not separator:
        while chars and chars[-1][0].isspace():
            chars.pop()
        while part and part[0][0].isspace():
            part.pop(0)
    chars.extend((ch, span['page'], span['start']) for ch in separator)
    chars.extend(part)


def normalize_chars(chars):
    chars = replace_chars(chars, '\u00ad\\s*', lambda _: '')
    # Only reviewed source ranges enter this step; genuine compound hyphens are
    # retained unless the job explicitly records a repair for that line break.
    chars = replace_chars(chars, r'\s+', lambda _: ' ')
    chars = replace_chars(chars, r'(?<=[—-])\s+(?=\w)', lambda _: '')
    while chars and chars[0][0].isspace():
        chars.pop(0)
    while chars and chars[-1][0].isspace():
        chars.pop()
    return chars


def source_segments(chars):
    segments = []
    for ch, page, offset in chars:
        if not segments or segments[-1]['page'] != page:
            segments.append({'page': page, 'text': '', 'map': []})
        segments[-1]['text'] += ch
        segments[-1]['map'].append(offset)
    return segments


def clean_block(block, source, repairs):
    chars = []
    for span_index, span in enumerate(block['spans']):
        part = span_chars(span, source, repairs)
        if not chars:
            chars.extend(part)
            continue
        separator = next((j['separator'] for j in block.get('joins', []) if j['afterSpan'] == span_index-1), '\n')
        append_span(chars, part, span, separator)
    chars = normalize_chars(chars)
    return {'kind': block.get('kind', 'paragraph'), **({'label': block['label']} if 'label' in block else {}),
            **({'citationOnly': True} if block.get('citationOnly') else {}),
            'text': ''.join(c[0] for c in chars), 'segments': source_segments(chars)}


def validate_page_coverage(raw, start, end, spans, page):
    coverage = [0] * len(raw)
    for span in spans:
        if not start <= span['start'] < span['end'] <= end:
            raise ValueError('Source span leaves the reviewed writing')
        for i in range(span['start'], span['end']):
            coverage[i] += 1
    if any(coverage[i] != 1 and not raw[i].isspace() for i in range(start, end)):
        raise ValueError(f'Unreviewed or overlapping source text on page {page + 1}')


def validate_coverage(job, source):
    scope = job['sourceRange']
    spans = [s for block in job['blocks'] for s in block['spans']] + job['excludedSource']
    for page in range(scope['startPage'], scope['endPage'] + 1):
        raw = source['pages'][page]['text']
        start = scope['startOffset'] if page == scope['startPage'] else 0
        end = scope['endOffset'] if page == scope['endPage'] else len(raw)
        validate_page_coverage(raw, start, end, [s for s in spans if s['page'] == page], page)


def reviewed_pdf(path, checksum):
    pdf_path = (ROOT/path).resolve()
    allowed = [ROOT/'dist/data/pdfs', ROOT/'scripts/cache/narration/opinion-pdfs']
    if not any(pdf_path.is_relative_to(folder.resolve()) for folder in allowed):
        raise ValueError('Source PDF is outside the opinion source directories')
    if digest(pdf_path) != checksum:
        raise ValueError('The source changed; review the PDF preparation again')


def reviewed_source(job):
    source_path = local_path(ROOT / job['sourceTextPath'], ROOT / 'dist/data')
    sections = json.loads((ROOT/'dist/data/opinion-sections.json').read_text())
    sections.update(json.loads((ROOT/'dist/data/opinion-section-overrides.json').read_text()))
    descriptor = next((d for rows in sections.values() for d in rows if d['id'] == job['documentId']), None)
    if descriptor and source_path != (ROOT/'dist'/descriptor['textPath']).resolve():
        raise ValueError('Recording coordinates must use the document’s registered source text')
    reviewed_pdf(job['sourcePdfPath'], job['sourcePdfSha256'])
    if revision := job.get('revisionSource'):
        reviewed_pdf(revision['pdfPath'], revision['sha256'])
    if digest(source_path) != job['sourceTextSha256']:
        raise ValueError('The source changed; review the preparation again')
    source = json.loads(source_path.read_text())
    validate_coverage(job, source)
    return source


def reviewed_citations(block, text):
    citations = sorted(block.get('citations', []), key=lambda c: c['start'])
    end = 0
    for citation in citations:
        if not end <= citation['start'] < citation['end'] <= len(text) or text[citation['start']:citation['end']] != citation['text']:
            raise ValueError('Reviewed citation offsets no longer match the clean text')
        end = citation['end']
    return citations


def segment_citations(segment, cursor, citations):
    result = []
    for citation in citations:
        # A source-page boundary may split a citation. Each part keeps the same
        # canonical identity and its own original coordinates.
        a, b = max(cursor, citation['start']), min(cursor + len(segment['text']), citation['end'])
        if b <= a:
            continue
        result.append({**{k: citation[k] for k in ('type', 'canonical')},
                       **({'keepInline': True} if citation.get('keepInline') else {}),
                       'start': a-cursor, 'end': b-cursor,
                       'label': segment['text'][a-cursor:b-cursor]})
    return result


def annotate_citations(paragraph, citations):
    cursor = 0
    for segment in paragraph['segments']:
        segment['citations'] = segment_citations(segment, cursor, citations)
        cursor += len(segment['text'])


def reference_fragments(paragraph, citations):
    """A citation split by a PDF page remains one reader reference."""
    fragments, cursor = [], 0
    for segment in paragraph['segments']:
        fragments.extend((segment, part, cursor+part['start'], cursor+part['end']) for part in segment['citations'])
        cursor += len(segment['text'])
    for citation in citations:
        parts = [(segment, part) for segment, part, start, end in fragments if citation['start'] <= start and end <= citation['end']]
        if len(parts) < 2:
            continue
        origin, first = parts[0]
        for index, (_, part) in enumerate(parts):
            part.update(fullLabel=citation['text'], referencePage=origin['page'], referenceOffset=origin['map'][first['start']], continuation=index > 0)


def pronounce(text, changes, block_index):
    for change in changes:
        if change['from'] not in text:
            raise ValueError(f'Pronunciation no longer matches block {block_index}: {change["from"]}')
    if not changes:
        return text
    replacements = {change['from']: change['to'] for change in changes}
    pattern = '|'.join(re.escape(value) for value in sorted(replacements, key=len, reverse=True))
    return re.sub(pattern, lambda match: replacements[match.group()], text)


def spoken_text(paragraph, block, citations, index):
    if paragraph.get('citationOnly'):
        return None
    text = paragraph['text']
    for citation in reversed(citations):
        if citation.get('omitFromSpeech', True):
            text = text[:citation['start']] + text[citation['end']:]
    text = pronounce(text, block.get('pronunciations', []), index)
    text = ' '.join(text.split())
    for punctuation in ',.;:!?':
        text = text.replace(' '+punctuation, punctuation)
    if paragraph['kind'] == 'heading' or not any(character.isalnum() for character in text):
        return None
    if paragraph['kind'] == 'footnote':
        label = paragraph['label']
        text = f'Footnote {label}: {text} End footnote {label}.'
    return text


def prepare_narration(paragraphs, blocks):
    spoken, spoken_blocks = [], []
    for index, (paragraph, block) in enumerate(zip(paragraphs, blocks)):
        citations = reviewed_citations(block, paragraph['text'])
        annotate_citations(paragraph, citations)
        text = spoken_text(paragraph, block, citations, index)
        if text is None:
            continue
        spoken.append(text)
        spoken_blocks.append(index)
    return spoken, spoken_blocks


def prepare(job):
    source = reviewed_source(job)
    paragraphs = [clean_block(b, source, job.get('repairs', [])) for b in job['blocks']]
    spoken, spoken_blocks = prepare_narration(paragraphs, job['blocks'])
    body = {'paragraphs': paragraphs, 'sectionSources': job.get('sectionSources', {}), 'reviewedCitations': True}
    version = hashlib.sha256(json.dumps({'body': body, 'spoken': spoken}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    body['version'] = version
    # These derived presentation fields do not change text, source coordinates,
    # pronunciation or timings. Keep the existing recording identity intact.
    for paragraph, block in zip(paragraphs, job['blocks']):
        reference_fragments(paragraph, block.get('citations', []))
    narration = {**job, 'version': version, 'spokenParagraphs': spoken, 'spokenBlocks': spoken_blocks}
    return body, narration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'work/recordings')
    args = parser.parse_args()
    job, document_id = load_job(args.job)
    body, narration = prepare(job)
    output = local_path(args.output / document_id, ROOT / 'work')
    output.mkdir(parents=True, exist_ok=True)
    for name, value in [('prepared.json', body), ('narration.json', narration)]:
        local_path(output / name, output).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    local_path(output / 'reader.txt', output).write_text('\n\n'.join(p['text'] for p in body['paragraphs']) + '\n')
    local_path(output / 'spoken.txt', output).write_text('\n\n'.join(narration['spokenParagraphs']) + '\n')
    print('Reviewed reader and narration prepared:', document_id)


if __name__ == '__main__':
    main()
