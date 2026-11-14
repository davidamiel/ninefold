"""ASR spelling errors must not reject clear short legal sentences."""
import unittest

from align import timing_pairs, tokens


class WordAlignment(unittest.TestCase):
    def test_local_transcription_spelling_is_mapped_without_lowering_coverage(self):
        self.assertEqual(timing_pairs(['we', 'granted', 'certiorari'], ['we', 'granted', 'certarari']), {0: 0, 1: 1, 2: 2})

    def test_unrelated_or_missing_speech_is_not_filled_in(self):
        self.assertNotIn(2, timing_pairs(['we', 'granted', 'certiorari'], ['we', 'granted', 'something']))
        self.assertNotIn(2, timing_pairs(['we', 'granted', 'certiorari'], ['we', 'granted']))

    def test_spoken_rule_numbers_match_their_transcribed_digits(self):
        words=lambda text:[word for word,_,_ in tokens(text)]
        self.assertEqual(words('Rule 60(c)(1)'),words('Rule sixty c one'))
        self.assertEqual(words('Section 78 u d 5'),words('Section seventy-eight u d five'))

    def test_spelled_statute_codes_match_their_combined_asr_spelling(self):
        expected=[word for word,_,_ in tokens('Section seventy-eight u d seven')]
        heard=[word for word,_,_ in tokens('Section 78 UD7')]
        self.assertEqual(len(timing_pairs(expected,heard)),len(expected))
        self.assertEqual(len(timing_pairs(['f','a','a','a','a'],['faaaa'])),5)


if __name__ == '__main__':
    unittest.main()
