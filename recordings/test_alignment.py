"""ASR spelling errors must not reject clear short legal sentences."""
import unittest
import json
import subprocess

from align import timing_pairs, tokens, paragraph_alignment, sentence_cue, sentence_ranges, close_cue_gaps, AlignmentReviewError


class WordAlignment(unittest.TestCase):
    def test_astral_symbols_keep_sentence_text_and_source_boundaries(self):
        text='A notation 𝑥 appears. Another symbol 𝛼 follows.'
        sentences=sentence_ranges([text])[0]
        self.assertEqual([text[s['start']:s['end']] for s in sentences],
                         ['A notation 𝑥 appears.', 'Another symbol 𝛼 follows.'])
        canonical={'kind':'paragraph','text':text,
                   'segments':[{'page':2,'text':text,'map':list(range(len(text)))}]}
        paragraph={'text':text,'start':0,'end':20}
        words=[{'text':token,'start':i,'end':i+.5} for i,(token,_,_) in enumerate(tokens(text))]
        alignment=paragraph_alignment(paragraph,canonical,words)
        cue=sentence_cue(sentences[1],paragraph,canonical,alignment,0)
        self.assertEqual(cue['text'],'Another symbol 𝛼 follows.')
        self.assertEqual(cue['ranges'],[{'page':2,'start':text.index('Another'),'end':len(text)}])
        self.assertEqual(cue['end'],20)

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

    def test_known_clip_boundaries_include_sentence_prefixes_and_tails(self):
        text='These words begin. These words finish.'
        canonical={'kind':'paragraph','text':text,
                   'segments':[{'page':2,'text':text,'map':list(range(len(text)))}]}
        paragraph={'text':text,'start':10,'end':20}
        # Acoustic transcription can skip a prefix or trail the final word.
        # The complete, verified paragraph clip still supplies those bounds.
        words=[{'text':'words','start':11,'end':12},
               {'text':'begin','start':12,'end':13},
               {'text':'These','start':15,'end':16},
               {'text':'words','start':16,'end':17},
               {'text':'finish','start':17,'end':18}]
        alignment=paragraph_alignment(paragraph,canonical,words)
        first=sentence_cue({'start':0,'end':18},paragraph,canonical,alignment,0)
        second=sentence_cue({'start':19,'end':len(text)},paragraph,canonical,alignment,0)
        self.assertEqual((first['start'],first['end']),(10,13))
        self.assertEqual((second['start'],second['end']),(15,20))
        self.assertEqual(second['ranges'],[{'page':2,'start':19,'end':len(text)}])

    def test_closing_announcement_maps_numbered_and_symbol_notes(self):
        for label, prefix in [('1',''), ('*',''), ('†',''), ('5','”; ')]:
            text='Actual note.'
            canonical={'kind':'footnote','label':label,'text':text,
                       'segments':[{'page':0,'text':text,'map':list(range(len(text)))}]}
            spoken=f'Footnote {label}: {text} {prefix}End footnote {label}.'
            paragraph={'text':spoken,'start':0,'end':10}
            words=[{'text':token,'start':i,'end':i+.5} for i,(token,_,_) in enumerate(tokens(spoken))]
            alignment=paragraph_alignment(paragraph,canonical,words)
            sentence={'start':spoken.index(prefix+'End footnote'),'end':len(spoken)}
            cue=sentence_cue(sentence,paragraph,canonical,alignment,0)
            self.assertTrue(cue['transition'])
            self.assertEqual(cue['footnote'],label)
            self.assertEqual(cue['ranges'],[{'page':0,'start':len(text)-1,'end':len(text)}])

    def test_quoted_note_closes_through_the_actual_sentence_splitter(self):
        text='This is substantive text. ”;'
        canonical={'kind':'footnote','label':'5','text':text,
                   'segments':[{'page':0,'text':text,'map':list(range(len(text)))}]}
        spoken=f'Footnote 5: {text} End footnote 5.'
        program="import{sentenceRanges}from'./dist/transcript-timing.js';console.log(JSON.stringify(sentenceRanges(process.argv[1])));"
        sentences=json.loads(subprocess.check_output(['node','--input-type=module','-e',program,spoken]))
        paragraph={'text':spoken,'start':0,'end':20}
        words=[{'text':token,'start':i,'end':i+.5} for i,(token,_,_) in enumerate(tokens(spoken))]
        alignment=paragraph_alignment(paragraph,canonical,words)
        cue=sentence_cue(sentences[-1],paragraph,canonical,alignment,0)
        self.assertTrue(cue['transition'])
        self.assertEqual(cue['text'],'End footnote 5.')


if __name__ == '__main__':
    unittest.main()
