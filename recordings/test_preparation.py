"""Source fidelity and in-place footnote ordering for reviewed preparation jobs."""
import copy
import json
import unittest

from generate import ROOT
from prepare import prepare, validate_coverage


class ReviewedPreparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.job = json.loads((ROOT/'recordings/abouammo.json').read_text())
        cls.source = json.loads((ROOT/cls.job['sourceTextPath']).read_text())

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
        job = copy.deepcopy(self.job)
        next(b for b in job['blocks'] if b.get('citations'))['citations'][0]['start'] += 1
        with self.assertRaisesRegex(ValueError, 'citation offsets'):
            prepare(job)


if __name__ == '__main__':
    unittest.main()
