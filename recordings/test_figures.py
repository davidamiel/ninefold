"""Original image bytes and appendix pages survive figure extraction."""
import hashlib
import io
import json
import unittest

try:
    from extract_figures import ROOT, extract
    from pypdf import PdfReader
except ModuleNotFoundError:
    ROOT = None


@unittest.skipIf(ROOT is None, 'pypdf is required for PDF figure verification')
class OriginalFigures(unittest.TestCase):
    def test_extracted_images_match_reviewed_embedded_bytes_and_captions(self):
        manifest = json.loads((ROOT / 'recordings/figures.json').read_text())
        count = 0
        for document in manifest['documents']:
            public, assets = extract(document)
            payloads = dict(assets)
            source_pdf = PdfReader(ROOT / document['sourcePdfPath'])
            for reviewed, figure in zip(document['figures'], public['figures']):
                count += 1
                payload = payloads[figure['path']]
                self.assertEqual(hashlib.sha256(payload).hexdigest(), reviewed['embeddedBytesSha256'])
                page = source_pdf.pages[reviewed['sourcePdfPageIndex']]
                # No image re-encoding: these are the original JPEG stream bytes.
                self.assertEqual(payload, page['/Resources']['/XObject'][reviewed['imageObjectName']].get_object().get_data())
            self.assertEqual(hashlib.sha256((ROOT / document['sourcePdfPath']).read_bytes()).hexdigest(), document['sourcePdfSha256'])
        self.assertEqual(count, 7)

    def test_klein_pdf_keeps_all_three_appendix_photos_and_excludes_reporter(self):
        document = json.loads((ROOT / 'recordings/figures.json').read_text())['documents'][0]
        public, assets = extract(document)
        pdf = PdfReader(io.BytesIO(dict(assets)[public['originalPdf']['path']]))
        self.assertEqual(len(pdf.pages), 15)
        self.assertEqual([len(pdf.pages[i].images) for i in [12, 13, 14]], [1, 1, 1])
        self.assertIn('App. 444a', pdf.pages[-1].extract_text())
        self.assertNotIn('Reporter', pdf.pages[-1].extract_text())


if __name__ == '__main__':
    unittest.main()
