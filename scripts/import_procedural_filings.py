"""Import hash-pinned procedural filings from a named review manifest.
Usage: python scripts/import_procedural_filings.py /path/to/verified/pdf/cache [manifest-name.json]
No network access or fuzzy classification; existing text is never overwritten.
"""
import hashlib
import json
import pathlib
import sys
import subprocess
import pypdf
from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'dist/data'

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

def main(cache, manifest_name="procedural-filing-provenance.json"):
    assert manifest_name in {"procedural-filing-provenance.json", "nrsc-filing-provenance.json"}, "Unknown review manifest"
    assert pypdf.__version__ == "6.21.4", "Use pypdf 6.21.4 for reproducible page labels"
    version = subprocess.run(["pdftotext", "-v"], capture_output=True, text=True, check=True)
    assert "pdftotext version 25.03.0" in version.stderr, "Use Poppler 25.03.0 for reproducible source offsets"
    manifest = json.loads((DATA / manifest_name).read_text())
    catalog_path = DATA / 'catalog.json'
    catalog = json.loads(catalog_path.read_text())
    records = [d for c in catalog['cases'] for d in c['documents']]
    pending = []
    added = 0
    for source in manifest['documents']:
        matches = [d for d in records if d['id'] == source['id']]
        assert len(matches) == 1 and matches[0]['sourceUrl'] == source['sourceUrl']
        pdf = cache / (source['id'] + '.pdf')
        assert hashlib.sha256(pdf.read_bytes()).hexdigest() == source['sourceSha256'], source['id']
        reader = PdfReader(pdf)
        output = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', str(pdf), '-'],
                                capture_output=True, text=True, check=True).stdout
        texts = output.split('\f')
        assert texts.pop() == '', 'Unexpected PDF page terminator'
        assert len(texts) == len(reader.pages), 'Missing extracted source pages'
        pages = [{'number': i + 1, 'label': str(reader.page_labels[i]), 'text': text}
                 for i, text in enumerate(texts)]
        assert len(pages) == source['pageCount']
        assert all('\ufffd' not in p['text'] and '\x00' not in p['text'] for p in pages)
        path = 'data/docs/' + source['id'] + '.json'
        content = {'id': source['id'], 'title': matches[0]['title'], 'sourceUrl': source['sourceUrl'],
                   'pages': pages, 'extraction': {
                       'method': 'Poppler pdftotext 25.03.0 -layout -enc UTF-8; unmodified source-page text; pypdf 6.21.4 page labels',
                       'reviewed': False, 'sourceSha256': source['sourceSha256'],
                       'sparsePages': [p['number'] for p in pages if len(p['text'].strip()) < 50],
                       'note': 'Bounded source identity and sample-page review only. Original PDF remains authoritative. Signatures, typography, tables and footnote placement require the original.'}}
        target = ROOT / 'dist' / path
        if target.exists():
            assert json.loads(target.read_text()) == content, 'Refusing to replace existing reader text: ' + source['id']
        assert all(not d.get('textPath') or d['textPath'] == path for d in matches)
        added += int(not matches[0].get('textPath'))
        pending.append((target, content, matches, path))
    # Validate every source before making any change.
    for target, content, matches, path in pending:
        write(target, content)
        for d in matches:
            d.update(textPath=path, pageCount=len(content['pages']),
                     characterCount=sum(len(p['text']) for p in content['pages']), extractionStatus='Extracted')
    # Preserve the aggregate, which also includes supplemental records and aliases.
    catalog['coverage']['readableDocuments'] += added
    catalog['coverage']['uniqueReadableDocumentCount'] += added
    by_category = catalog['coverage']['readableByCategory']
    by_category['Other'] = by_category.get('Other', 0) + added
    write(catalog_path, catalog)
    report_path = DATA / 'coverage-report.json'
    report = json.loads(report_path.read_text())
    report['terms']['2025'] = catalog['coverage']
    report['coverage']['configuredTextAssets'] += added
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Imported', len(pending), 'hash-verified procedural filings; full transcription and citation review remain incomplete.')

if __name__ == '__main__':
    main(pathlib.Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else "procedural-filing-provenance.json")
