"""PDF slicing preserves diagrams and photographs, not just extracted words."""
import io
import unittest

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject
    from pdf_slices import page_fidelity
except ModuleNotFoundError:
    PdfWriter = None


@unittest.skipIf(PdfWriter is None, 'pypdf is required for source fidelity checks')
class DrawingFidelity(unittest.TestCase):
    def page(self):
        writer = PdfWriter()
        page = writer.add_blank_page(width=200, height=300)
        content = DecodedStreamObject()
        content.set_data(b'q 1 0 0 rg 10 10 50 50 re f Q')
        page[NameObject('/Contents')] = content
        image = DecodedStreamObject()
        image.set_data(b'\xff\x00\x00')
        image.update({NameObject('/Type'): NameObject('/XObject'),
                      NameObject('/Subtype'): NameObject('/Image'),
                      NameObject('/Width'): NumberObject(1),
                      NameObject('/Height'): NumberObject(1),
                      NameObject('/ColorSpace'): NameObject('/DeviceRGB'),
                      NameObject('/BitsPerComponent'): NumberObject(8)})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/XObject'):
            DictionaryObject({NameObject('/Photo'): image})})
        return page

    def test_page_copy_preserves_original_graphics_without_text(self):
        original = self.page()
        writer = PdfWriter()
        writer.add_page(original)
        output = io.BytesIO()
        writer.write(output)
        copied = PdfReader(output).pages[0]
        self.assertEqual(page_fidelity(copied), page_fidelity(original))
        self.assertEqual(copied.extract_text(), '')

    def test_image_or_vector_loss_is_detected_even_when_text_is_unchanged(self):
        original, changed = self.page(), self.page()
        changed['/Resources']['/XObject']['/Photo'].set_data(b'\x00\xff\x00')
        self.assertEqual(original.extract_text(), changed.extract_text())
        self.assertNotEqual(page_fidelity(original), page_fidelity(changed))
        changed = self.page()
        changed['/Contents'].set_data(b'')
        self.assertNotEqual(page_fidelity(original), page_fidelity(changed))


if __name__ == '__main__':
    unittest.main()
