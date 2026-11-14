"""Create reviewed writing PDFs without changing the pinned source files."""
import argparse
import hashlib
import json
from pathlib import Path

from generate import ROOT, local_path
from stage import write_json


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def page_text(page):
    return ' '.join(page.extract_text().split())


def create_slice(item):
    from pypdf import PdfReader, PdfWriter
    source = local_path(ROOT/item['source'], ROOT)
    destination = local_path(ROOT/'dist'/item['destination'], ROOT/'dist/data/pdfs')
    if source == destination or sha256(source) != item['sourceSha256']:
        raise ValueError('The pinned source must remain unchanged')
    original = PdfReader(source)
    start, end = item['start'], item['end']
    if not 0 <= start < end <= len(original.pages):
        raise ValueError('Writing pages leave the reviewed source')
    writer = PdfWriter()
    for page in range(start, end):
        writer.add_page(original.pages[page])
    temporary = destination.with_suffix('.tmp.pdf')
    try:
        with temporary.open('wb') as output:
            writer.write(output)
        checked = PdfReader(temporary)
        if len(checked.pages) != end-start or any(page_text(checked.pages[index]) != page_text(original.pages[page])
                                                  for index, page in enumerate(range(start, end))):
            raise ValueError('Writing PDF changed the original page content')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {**item, 'sha256': sha256(destination)}


def register_slices(slices):
    base = ROOT/'dist/data'
    sections = json.loads((base/'opinion-sections.json').read_text())
    overrides = json.loads((base/'opinion-section-overrides.json').read_text())
    paths = json.loads((base/'pdf-paths.json').read_text())
    by_id = {item['id']: item for item in slices}
    for case, documents in {**sections, **overrides}.items():
        if not any(document['id'] in by_id for document in documents):
            continue
        for document in documents:
            if item := by_id.get(document['id']):
                document.update(pdfPath=item['destination'], pageCount=item['end']-item['start'])
                paths[document['id']] = item['destination']
        overrides[case] = documents
    # Only the source representation changes; raw text offsets and reviewed jobs
    # remain bound to the original files and are never rewritten here.
    for filename, value in [('opinion-section-overrides.json', overrides), ('pdf-paths.json', paths)]:
        destination = base/filename
        temporary = destination.with_suffix('.tmp')
        write_json(temporary, value)
        temporary.replace(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=Path)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    results = [create_slice(item) for item in plan]
    register_slices(results)
    manifest_path = ROOT/'recordings/pdf-slices.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.update({item['id']: item for item in results})
    write_json(manifest_path, manifest)
    print('Verified and registered writing PDFs:', len(results))


if __name__ == '__main__':
    main()
