"""Source-specific, fail-closed font recovery; never rewrites raw document text.

Requires pypdf, fonttools and pymupdf. Run with the exact official PDF and --apply
only after reviewing the generated report. No network requests or publication.
"""
from pathlib import Path
from io import BytesIO
import argparse, difflib, hashlib, json, re
import fitz
from fontTools.ttLib import TTFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

ROOT = Path(__file__).resolve().parents[1]
DOC = '24-1016-dffa73766c90'
SOURCE_HASH = '106009dd595ddabaa805eae20946b77ce3b20f79f70c70928a6ac966e5b474d3'
RAW_HASH = 'b04cf6e40f7aef93fc05a1a72f7b35d0d2be46cccc594e1e24a46cf3536d21cd'
EVIDENCE = 'docs/riseandshine-font-recovery.md'
# These objects are scoped to SOURCE_HASH, not a general PDF heuristic.
FONT_PAIRS = [(452, 435), (459, 436)]
IDENTITY_TABLES = ['hmtx', 'hhea', 'maxp', 'OS/2', 'fpgm', 'prep', 'cvt ']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font_program(font):
    desc = font['/DescendantFonts'][0].get_object() if '/DescendantFonts' in font else font
    return TTFont(BytesIO(desc['/FontDescriptor']['/FontFile2'].get_data()))


def glyph_bytes(font, gid):
    start, end = font['loca'].locations[gid:gid + 2]
    return font.reader['glyf'][start:end]


def recover_pdf(source):
    if sha(source) != SOURCE_HASH:
        raise ValueError('Official source hash does not match; no recovery attempted')
    reader = PdfReader(BytesIO(source))
    fonts = {}
    for page in reader.pages:
        for ref in page['/Resources'].get('/Font', {}).values():
            fonts[ref.idnum] = ref.get_object()
    proofs = []
    for target_id, donor_id in FONT_PAIRS:
        target, donor = fonts[target_id], fonts[donor_id]
        if target.get('/Encoding') != '/Identity-H' or '/ToUnicode' in target:
            raise ValueError('Unexpected target font encoding')
        if target['/DescendantFonts'][0].get_object().get('/CIDToGIDMap') != '/Identity':
            raise ValueError('Non-identity CID-to-GID mapping')
        a, b = font_program(target), font_program(donor)
        for table in IDENTITY_TABLES:
            if a.reader[table] != b.reader[table]:
                raise ValueError(f'Font {target_id} differs from donor in {table}')
        if a['head'].unitsPerEm != b['head'].unitsPerEm:
            raise ValueError('Font unit mismatch')
        shared = []
        for gid in range(a['maxp'].numGlyphs):
            x, y = glyph_bytes(a, gid), glyph_bytes(b, gid)
            if x and y:
                if x != y:
                    raise ValueError(f'Conflicting glyph outline at GID {gid}')
                shared.append(gid)
        if len(shared) < 5:
            raise ValueError('Insufficient shared glyph evidence')
        mapping = {}
        for code, name in b.getBestCmap().items():
            # Prefer standard Unicode, not Windows control aliases or PUA aliases.
            if code < 32 or 127 <= code <= 159 or 0xE000 <= code <= 0xF8FF:
                continue
            gid = b.getGlyphID(name)
            value = {0xFB01: 'fi', 0xFB02: 'fl'}.get(code, chr(code))
            if gid in mapping and mapping[gid] != value:
                raise ValueError(f'Ambiguous Unicode mapping for GID {gid}')
            mapping[gid] = value
        # Every populated source glyph except .notdef must be mapped.
        unknown = [g for g in range(1, a['maxp'].numGlyphs) if glyph_bytes(a, g) and g not in mapping]
        if unknown or mapping.get(3) != ' ' or mapping.get(192) != 'fi':
            raise ValueError(f'Unmapped source glyphs: {unknown}')
        pairs = [f'<{gid:04X}> <{value.encode("utf-16-be").hex().upper()}>' for gid, value in sorted(mapping.items())]
        blocks = ['\n'.join([f'{len(pairs[i:i+100])} beginbfchar', *pairs[i:i+100], 'endbfchar']) for i in range(0, len(pairs), 100)]
        cmap = ('/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n'
                '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n'
                '/CMapName /VerifiedRecovery def\n/CMapType 2 def\n'
                '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' + '\n'.join(blocks) +
                '\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend')
        stream = DecodedStreamObject(); stream.set_data(cmap.encode())
        target[NameObject('/ToUnicode')] = stream
        proofs.append({'targetObject': target_id, 'donorObject': donor_id,
                       'identityTableHashes': {t: sha(a.reader[t]) for t in IDENTITY_TABLES},
                       'identicalSharedGlyphs': shared,
                       'mapping': {str(k): v for k, v in sorted(mapping.items())}})
    writer = PdfWriter(); writer.append_pages_from_reader(reader)
    out = BytesIO(); writer.write(out)
    return out.getvalue(), proofs


def canonical(text, join_ranges=False):
    """Collapse only real whitespace, retaining raw encoded control glyphs."""
    chars, offsets = [], []
    i = 0
    while i < len(text):
        c = text[i]
        if c == '-' and i and text[i - 1].islower():
            m = re.match(r'-[ \t]*\n(?=[a-z])', text[i:])
            if m:
                i += len(m.group()); continue
        if c in ' \t\r\n':
            end = i + 1
            while end < len(text) and text[end] in ' \t\r\n': end += 1
            # Numeric ranges split by physical line boundaries retain their hyphen.
            if chars and not (join_ranges and chars[-1] == '-' and '\n' in text[i:end]):
                chars.append(' '); offsets.append(i)
            i = end; continue
        chars.append(c); offsets.append(i); i += 1
    if chars and chars[-1] == ' ': chars.pop(); offsets.pop()
    # Match the reader's conservative typography normalization so already-fixed
    # punctuation spacing does not generate redundant repair records.
    kept = [i for i, c in enumerate(chars) if c != ' ' or
            (i > 0 and i + 1 < len(chars) and chars[i - 1] not in '“‘([{' and chars[i + 1] not in '.,;:!?%”’])}')]
    return ''.join(chars[i] for i in kept), [offsets[i] for i in kept]


def repairs_for_page(raw, target, page):
    old, offsets = canonical(raw); new, _ = canonical(target, join_ranges=True)
    matcher = difflib.SequenceMatcher(None, old, new, autojunk=False)
    ops = matcher.get_opcodes()
    # Expand by one unchanged character on either side. This gives insertions a
    # nonempty source guard and restores spaces consumed by pre-repair typography.
    spans = []
    for tag, a, b, c, d in ops:
        if tag == 'equal': continue
        if a and c: a -= 1; c -= 1
        if b < len(old) and d < len(new): b += 1; d += 1
        if spans and a <= spans[-1][1]:
            prior = spans.pop(); spans.append((prior[0], max(b, prior[1]), prior[2], max(d, prior[3])))
        else: spans.append((a, b, c, d))
    result = []
    for a, b, c, d in spans:
        start, end = offsets[a], offsets[b - 1] + 1
        result.append({'page': page, 'start': start, 'end': end, 'expectedText': raw[start:end],
                       'text': new[c:d], 'sourcePdfPage': page + 1, 'evidence': EVIDENCE})
    # Verify complete reconstruction before any data can be applied.
    test = raw
    for r in reversed(result): test = test[:r['start']] + r['text'] + test[r['end']:]
    if canonical(test)[0] != new: raise ValueError(f'Round-trip mismatch on page {page}')
    return result, new


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    source = args.pdf.read_bytes(); recovered, font_proofs = recover_pdf(source)
    raw_bytes = (ROOT / f'dist/data/current-docs/{DOC}.json').read_bytes()
    if sha(raw_bytes) != RAW_HASH: raise ValueError('Immutable raw data changed')
    data = json.loads(raw_bytes)
    if any(ord(c) > 0xFFFF for p in data['pages'] for c in p['text']):
        raise ValueError('Non-BMP source needs explicit UTF-16 offset conversion')
    original, fixed = fitz.open(stream=source, filetype='pdf'), fitz.open(stream=recovered, filetype='pdf')
    if len(original) != len(fixed) or len(original) != len(data['pages']): raise ValueError('Page count mismatch')
    repairs, skipped, targets = [], [], {}
    for page, raw_page in enumerate(data['pages']):
        # Verify adding Unicode maps does not alter any rendered page pixels.
        if original[page].get_pixmap(matrix=fitz.Matrix(.5, .5)).samples != fixed[page].get_pixmap(matrix=fitz.Matrix(.5, .5)).samples:
            raise ValueError(f'Visual source changed on page {page}')
        raw = raw_page['text']; baseline = original[page].get_text(); target = fixed[page].get_text()
        # Some legacy pages are OCR replacements, not this PDF's extraction.
        # Never automatically overwrite their extra image text or differing words.
        compact = lambda s: canonical(s)[0].replace(' ', '')
        if compact(raw) != compact(baseline):
            skipped.append(page); continue
        if re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]', target):
            raise ValueError(f'Unrecovered control character on page {page}')
        items, canonical_target = repairs_for_page(raw, target, page)
        repairs.extend(items); targets[str(page)] = canonical_target
    report = {'document': DOC, 'sourceSha256': SOURCE_HASH, 'rawSha256': RAW_HASH,
              'method': 'Verified same-PDF font/glyph identity; Unicode-map recovery; coordinate extraction; immutable-span diff',
              'fontProofs': font_proofs, 'pixelIdenticalPages': len(original),
              'recoveredPages': [int(p) for p in targets], 'skippedDivergentPages': skipped,
              'repairCount': len(repairs), 'repairs': repairs, 'canonicalTargets': targets}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if args.apply:
        manual_path = ROOT / 'scripts/riseandshine-manual-corrections.json'
        manual = json.loads(manual_path.read_text()) if manual_path.exists() else {}
        combined = sorted(repairs + manual.get('repairs', []), key=lambda r: (r['page'], r['start']))
        previous = None
        for item in combined:
            raw = data['pages'][item['page']]['text']
            if raw[item['start']:item['end']] != item['expectedText']:
                raise ValueError('Manual/source repair guard mismatch')
            if previous and previous['page'] == item['page'] and previous['end'] > item['start']:
                raise ValueError('Manual/source repair overlap')
            previous = item
        for name in ['scripts/curated-reader-structure.json', 'dist/data/reader-structure.json']:
            p = ROOT / name; structures = json.loads(p.read_text()); structures[DOC]['repairs'] = combined
            for kind in ['headings', 'footnotes', 'footnoteMarkers']:
                for item in manual.get(kind, []):
                    entries = structures[DOC].setdefault(kind, [])
                    entries[:] = [x for x in entries if not (x['page'] == item['page'] and x['start'] == item['start'])]
                    entries.append(item)
                if kind in structures[DOC]: structures[DOC][kind].sort(key=lambda x: (x['page'], x['start']))
            p.write_text(json.dumps(structures, ensure_ascii=False, separators=(',', ':')))
        p = ROOT / 'dist/data/document-correction-evidence.json'; evidence = json.loads(p.read_text())
        evidence[DOC] = [{'page': r['page'], 'start': r['start'], 'end': r['end'], 'original': r['expectedText'],
                         'replacement': r['text'], 'sourceUrl': data['sourceUrl'], 'sourcePage': r['page'] + 1,
                         'sourceSha256': SOURCE_HASH, 'method': r.get('sourceReview', report['method']) + '; see ' + r['evidence'],
                         'verifiedAt': '2026-11-08'} for r in combined]
        p.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['pixelIdenticalPages', 'skippedDivergentPages', 'repairCount']}))


if __name__ == '__main__': main()
