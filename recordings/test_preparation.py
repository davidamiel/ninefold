"""Source fidelity and in-place footnote ordering for reviewed preparation jobs."""
import copy
import json
import unittest
from unittest.mock import patch

from generate import ROOT
from prepare import prepare, validate_coverage, span_chars, annotate_citations, reference_fragments, spoken_text


class ReviewedPreparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.job = json.loads((ROOT/'recordings/abouammo.json').read_text())
        cls.source = json.loads((ROOT/cls.job['sourceTextPath']).read_text())

    def test_prepared_metadata_round_trips_through_json_before_staging(self):
        body,narration=prepare(self.job)
        self.assertTrue(json.loads(json.dumps(body)) == body, 'Reader metadata must round-trip through JSON')
        self.assertTrue(json.loads(json.dumps(narration)) == narration, 'Narration mappings must round-trip through JSON')

    def test_cross_page_footnote_is_complete_and_returns_to_the_body(self):
        body, narration = prepare(self.job)
        note = next(p for p in body['paragraphs'] if p.get('label') == '1')
        self.assertEqual({p['page'] for p in note['segments']}, {4, 5})
        self.assertIn('contemplation of any such matter', note['text'])
        spoken = narration['spokenParagraphs']
        index = next(i for i, p in enumerate(spoken) if p.startswith('Footnote 1:'))
        self.assertTrue(spoken[index-1].endswith('federal investigation.'))
        self.assertTrue(spoken[index].endswith('End footnote 1.'))
        self.assertTrue(spoken[index+1].startswith('The indictment alleged'))
        self.assertIn('“alteration, destruction, mutilation”', spoken[index])

    def test_quotations_and_explanations_survive_citation_omission(self):
        _, narration = prepare(self.job)
        text = '\n'.join(narration['spokenParagraphs'])
        self.assertNotIn('122 F. 4th', text)
        self.assertNotIn('(quoting )', text)
        self.assertIn('“the location of the act or acts constituting”', text)
        self.assertIn('using that test when “there is an absence”', text)
        self.assertIn('Nothing we say today is meant to address', text)

    def test_unreviewed_source_words_and_overlapping_spans_are_rejected(self):
        job = copy.deepcopy(self.job)
        job['blocks'][0]['spans'][0]['start'] += 4
        with self.assertRaisesRegex(ValueError, 'Unreviewed'):
            validate_coverage(job, self.source)
        job = copy.deepcopy(self.job)
        job['blocks'].append(copy.deepcopy(job['blocks'][0]))
        with self.assertRaisesRegex(ValueError, 'overlapping'):
            validate_coverage(job, self.source)

    def test_stale_source_or_citation_review_is_rejected(self):
        job = copy.deepcopy(self.job)
        job['sourcePdfSha256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'source changed'):
            prepare(job)

    def test_authorized_revision_source_is_also_checksum_bound(self):
        job = copy.deepcopy(self.job)
        job['revisionSource'] = {'pdfPath': job['sourcePdfPath'], 'sha256': '0'*64}
        with self.assertRaisesRegex(ValueError, 'source changed'):
            prepare(job)

    def test_overlapping_repairs_cannot_corrupt_a_joined_word(self):
        source={'pages':[{'text':'beneft pay-'}]}
        repairs=[{'page':0,'start':0,'end':6,'expectedText':'beneft','text':'benefit'},
                 {'page':0,'start':0,'end':10,'expectedText':'beneft pay-','text':'benefit pay'}]
        with self.assertRaisesRegex(ValueError,'repairs overlap'):
            span_chars({'page':0,'start':0,'end':10},source,repairs)
        job = copy.deepcopy(self.job)
        next(b for b in job['blocks'] if b.get('citations'))['citations'][0]['start'] += 1
        with self.assertRaisesRegex(ValueError, 'citation offsets'):
            prepare(job)

    def test_reference_presentation_does_not_change_recording_identity(self):
        body, narration = prepare(self.job)
        with patch('prepare.reference_fragments'):
            original, original_narration = prepare(self.job)
        self.assertEqual(body['version'], original['version'])
        self.assertEqual(narration['spokenParagraphs'], original_narration['spokenParagraphs'])


class ReaderReferences(unittest.TestCase):
    @staticmethod
    def paragraph(text, split=None):
        cuts = [0, len(text)] if split is None else [0, split, len(text)]
        return {'kind': 'paragraph', 'text': text, 'segments': [
            {'page': page, 'text': text[a:b], 'map': list(range(a, b))}
            for page, (a, b) in enumerate(zip(cuts, cuts[1:]))]}

    @staticmethod
    def citation(text, label, canonical, inline=False, start=0):
        at = text.index(label, start)
        return {'start': at, 'end': at+len(label), 'text': label, 'type': 'case',
                'canonical': canonical, **({'keepInline': True} if inline else {})}

    def test_inline_name_and_metadata_have_one_reference_without_extra_markers(self):
        text = 'See Smith v. State, 1 U. S. 2 (2000) (emphasis added).'
        citations = [self.citation(text, 'See ', '1 U.S. 2'),
                     self.citation(text, 'Smith v. State', '1 U.S. 2', True),
                     self.citation(text, ', 1 U. S. 2 (2000)', '1 U.S. 2'),
                     self.citation(text, '(emphasis added)', 'Editorial citation notation')]
        paragraph = self.paragraph(text)
        annotate_citations(paragraph, citations)
        reference_fragments(paragraph, citations)
        signal, name, locator, byline = paragraph['segments'][0]['citations']
        self.assertTrue(signal['suppressReference'])
        self.assertTrue(byline['suppressReference'])
        self.assertFalse(name['continuation'])
        self.assertTrue(locator['continuation'])
        self.assertEqual(name['fullLabel'], 'Smith v. State, 1 U. S. 2 (2000)')
        self.assertEqual(name['referenceOffset'], locator['referenceOffset'])
        self.assertEqual(paragraph['text'], text)

    def test_page_break_keeps_every_word_of_inline_case_name(self):
        text = 'Smith v. State, 1 U. S. 2 (2000)'
        citations = [self.citation(text, 'Smith v. State', '1 U.S. 2', True),
                     self.citation(text, ', 1 U. S. 2 (2000)', '1 U.S. 2')]
        paragraph = self.paragraph(text, len('Smith v. '))
        annotate_citations(paragraph, citations)
        reference_fragments(paragraph, citations)
        parts = [part for segment in paragraph['segments'] for part in segment['citations']]
        self.assertEqual(''.join(part['label'] for part in parts if part.get('keepInline')), 'Smith v. State')
        self.assertTrue(all(not part['continuation'] for part in parts if part.get('keepInline')))
        self.assertTrue(parts[-1]['continuation'])
        self.assertEqual({part['referenceOffset'] for part in parts}, {0})

    def test_distinct_authorities_and_separate_pinpoints_remain_separate(self):
        text = '1 U. S. 2; 3 U. S. 4; 1 U. S. 2, 5'
        citations = [self.citation(text, '1 U. S. 2', '1 U.S. 2'),
                     self.citation(text, '; ', 'Citation punctuation'),
                     self.citation(text, '3 U. S. 4', '3 U.S. 4'),
                     self.citation(text, '1 U. S. 2, 5', '1 U.S. 2', start=10)]
        paragraph = self.paragraph(text)
        annotate_citations(paragraph, citations)
        reference_fragments(paragraph, citations)
        sources = [part for part in paragraph['segments'][0]['citations'] if not part.get('suppressReference')]
        self.assertEqual(len(sources), 3)
        self.assertTrue(all(not part.get('continuation') for part in sources))

    def test_plain_citation_across_pages_has_one_marker(self):
        text = 'Smith v. State, 1 U. S. 2 (2000)'
        citations = [self.citation(text, text, '1 U.S. 2')]
        paragraph = self.paragraph(text, 16)
        annotate_citations(paragraph, citations)
        reference_fragments(paragraph, citations)
        first, second = [part for segment in paragraph['segments'] for part in segment['citations']]
        self.assertFalse(first['continuation'])
        self.assertTrue(second['continuation'])
        self.assertEqual(first['fullLabel'], second['fullLabel'])
        self.assertEqual(first['referencePage'], second['referencePage'])

    def test_english_headings_are_read_but_outline_labels_are_silent(self):
        for text in ['IV', 'A', '1', 'II–A–2', '1(a)', 'I.A.1']:
            with self.subTest(text=text):
                self.assertIsNone(spoken_text({'kind': 'heading', 'text': text}, {}, [], 0))
        self.assertIsNone(spoken_text({'kind': 'heading', 'text': 'III'},
                                     {'pronunciations': [{'from': 'III', 'to': 'Three'}]}, [], 0))
        for text in ['1. First Gingles Precondition', '2. Second and Third Gingles Preconditions',
                     '3. Totality of Circumstances', 'Introduction', 'Civil Rights']:
            with self.subTest(text=text):
                self.assertEqual(spoken_text({'kind': 'heading', 'text': text}, {}, [], 0), text)

    def test_consecutive_distinct_pinpoints_of_same_authority_remain_separate(self):
        text = '1 U. S. 2, 5; 1 U. S. 2, 8'
        citations = [self.citation(text, '1 U. S. 2, 5', '1 U.S. 2'),
                     self.citation(text, '; ', 'Citation punctuation'),
                     self.citation(text, '1 U. S. 2, 8', '1 U.S. 2')]
        paragraph = self.paragraph(text)
        annotate_citations(paragraph, citations)
        reference_fragments(paragraph, citations)
        sources = [part for part in paragraph['segments'][0]['citations'] if not part.get('suppressReference')]
        self.assertEqual(len(sources), 2)
        self.assertTrue(all(not part.get('continuation') for part in sources))
        self.assertNotEqual(sources[0]['start'], sources[1]['start'])


if __name__ == '__main__':
    unittest.main()
