"""Extract reviewed original PDF figures without altering their image bytes."""
import hashlib
import io
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def source_file(relative, expected_hash):
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT) or digest(path.read_bytes()) != expected_hash:
        raise ValueError('Reviewed figure source changed: ' + relative)
    return path


def check_anchor(anchor, source):
    if source['pages'][anchor['page']]['text'][anchor['start']:anchor['end']] != anchor['text']:
        raise ValueError('Figure caption no longer matches its original source')


def extract(document):
    pdf_path = source_file(document['sourcePdfPath'], document['sourcePdfSha256'])
    source_path = source_file(document['sourceTextPath'], document['sourceTextSha256'])
    source = json.loads(source_path.read_text())
    reader = PdfReader(pdf_path)
    figures, assets = [], []
    for reviewed in document['figures']:
        check_anchor(reviewed['captionSource'], source)
        if reviewed['sourcePdfPageIndex'] + document['sourcePdfPageOffset'] != reviewed['sourcePageIndex']:
            raise ValueError('Figure PDF and source page coordinates differ')
        image = reader.pages[reviewed['sourcePdfPageIndex']]['/Resources']['/XObject'][reviewed['imageObjectName']].get_object()
        # Page.images.data passes JPEGs through Pillow and recompresses them.
        # These reviewed DeviceRGB/DCT streams need no PDF-specific transform.
        if image.get('/Filter') != '/DCTDecode' or image.get('/ColorSpace') != '/DeviceRGB' or image.get('/Decode') is not None:
            raise ValueError('Figure requires a separately reviewed PDF image transform')
        payload = image.get_data()
        width, height = image['/Width'], image['/Height']
        if digest(payload) != reviewed['embeddedBytesSha256'] or (width, height) != (reviewed['pixelWidth'], reviewed['pixelHeight']):
            raise ValueError('Reviewed embedded figure image changed')
        path = 'data/opinion-figures/' + digest(payload)[:24] + '.jpg'
        figures.append({'id': reviewed['id'], 'path': path, 'width': width, 'height': height,
                        'alt': reviewed['sourceDerivedDescription'], 'caption': reviewed['captionSource'],
                        'sha256': digest(payload)})
        assets.append((path, payload))
    result = {'sourceDocumentId': document['sourceDocumentId'], 'figures': figures}
    if document.get('appendixHeadingSource'):
        check_anchor(document['appendixHeadingSource'], source)
        result['appendixHeading'] = document['appendixHeadingSource']
        # This appendix extends past the last narration block. PDF extent is
        # deliberately independent of the unchanged reviewed narration range.
        extent = document['requiredOriginalPdfExtent']
        writer = PdfWriter()
        for page in reader.pages[extent['sourcePdfStartPageIndex']:extent['sourcePdfEndPageExclusive']]:
            writer.add_page(page)
        buffer = io.BytesIO()
        writer.write(buffer)
        payload = buffer.getvalue()
        path = 'data/pdfs/' + document['documentId'] + '-figures-' + digest(payload)[:12] + '.pdf'
        result['originalPdf'] = {'path': path, 'sha256': digest(payload), 'pageCount': extent['pageCount'],
                                 'sourceStartPage': extent['sourceStartPageIndex'],
                                 'sourceEndPageInclusive': extent['sourceEndPageIndexInclusive']}
        assets.append((path, payload))
    return result, assets


def main():
    manifest = json.loads((ROOT / 'recordings/figures.json').read_text())
    output, assets = {}, []
    # Validate every pinned source and caption before writing public assets.
    for document in manifest['documents']:
        result, extracted = extract(document)
        output[document['documentId']] = result
        assets.extend(extracted)
    for relative, payload in assets:
        path = ROOT / 'dist' / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    path = ROOT / 'dist/data/opinion-figures.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)
    print('Extracted original figures:', sum(len(value['figures']) for value in output.values()))


if __name__ == '__main__':
    main()
