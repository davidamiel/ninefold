"""ASR spelling errors must not reject clear short legal sentences."""
import unittest

from align import timing_pairs, tokens, paragraph_alignment, sentence_cue, close_cue_gaps, AlignmentReviewError


class WordAlignment(unittest.TestCase):
    def test_overlapping_acoustic_boundaries_identify_the_paragraph_for_rechecking(self):
        cues=[{'start':0,'end':2,'paragraph':7},{'start':1.8,'end':3,'paragraph':7}]
        with self.assertRaises(AlignmentReviewError) as failure:
            close_cue_gaps(cues)
        self.assertEqual(failure.exception.block,7)

    def test_local_transcription_spelling_is_mapped_without_lowering_coverage(self):
        self.assertEqual(timing_pairs(['we', 'granted', 'certiorari'], ['we', 'granted', 'certarari']), {0: 0, 1: 1, 2: 2})

    def test_unrelated_or_missing_speech_is_not_filled_in(self):
        self.assertNotIn(2, timing_pairs(['we', 'granted', 'certiorari'], ['we', 'granted', 'something']))
        self.assertNotIn(2, timing_pairs(['we', 'granted', 'certiorari'], ['we', 'granted']))

    def test_spoken_rule_numbers_match_their_transcribed_digits(self):
        words=lambda text:[word for word,_,_ in tokens(text)]
        self.assertEqual(words('Rule 60(c)(1)'),words('Rule sixty c one'))
        self.assertEqual(words('Section 78 u d 5'),words('Section seventy-eight u d five'))

    def test_accents_preserve_whole_words_and_original_source_offsets(self):
        text='Unión Cuba-Petróleo and Corporación'
        actual=tokens(text)
        self.assertEqual([word for word,_,_ in actual],['union','cuba','petroleo','and','corporacion'])
        self.assertEqual([text[start:end] for _,start,end in actual],['Unión','Cuba','Petróleo','and','Corporación'])
        heard=[word for word,_,_ in tokens('Union Cuba Petroleo and Corporacion')]
        self.assertEqual(len(timing_pairs([word for word,_,_ in actual],heard)),len(actual))

    def test_spelled_statute_codes_match_their_combined_asr_spelling(self):
        expected=[word for word,_,_ in tokens('Section seventy-eight u d seven')]
        heard=[word for word,_,_ in tokens('Section 78 UD7')]
        self.assertEqual(len(timing_pairs(expected,heard)),len(expected))
        self.assertEqual(len(timing_pairs(['f','a','a','a','a'],['faaaa'])),5)

    def test_adjacent_abbreviation_and_possessive_joins_keep_every_letter(self):
        expected=[word for word,_,_ in tokens("the T P S statute's judicial-review bar")]
        heard=[word for word,_,_ in tokens('the TPS statutes judicial review bar')]
        self.assertEqual(len(timing_pairs(expected,heard)),len(expected))
        self.assertNotEqual(len(timing_pairs(expected,['the','tps','claims','judicial','review','bar'])),len(expected))

    def test_closing_announcement_maps_numbered_and_symbol_notes(self):
        for label in ['1', '*', '†']:
            text='Actual note.'
            canonical={'kind':'footnote','label':label,'text':text,
                       'segments':[{'page':0,'text':text,'map':list(range(len(text)))}]}
            spoken=f'Footnote {label}: {text} End footnote {label}.'
            paragraph={'text':spoken,'start':0,'end':10}
            words=[{'text':token,'start':i,'end':i+.5} for i,(token,_,_) in enumerate(tokens(spoken))]
            alignment=paragraph_alignment(paragraph,canonical,words)
            sentence={'start':spoken.index('End footnote'),'end':len(spoken)}
            cue=sentence_cue(sentence,paragraph,canonical,alignment,0)
            self.assertTrue(cue['transition'])
            self.assertEqual(cue['footnote'],label)
            self.assertEqual(cue['ranges'],[{'page':0,'start':len(text)-1,'end':len(text)}])


if __name__ == '__main__':
    unittest.main()
