"""ASR spelling errors must not reject clear short legal sentences."""
import unittest
import json
import subprocess

from align import timing_pairs, tokens, paragraph_alignment, sentence_cue, sentence_ranges, close_cue_gaps, mapped_source_ranges, AlignmentReviewError
from speech_mapping import map_speech


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

    def test_three_digit_section_readings_match_exact_transcribed_number(self):
        for spoken,heard in [('Section two thirty-two', 'Section 232'),
                             ('Section one twenty-two', 'Section 122'),
                             ('Section two oh one', 'Section 201'),
                             ('Section three oh one', 'Section 301'),
                             ('Section three thirty-eight', 'Section 338'),
                             ('Section two hundred thirty-two', 'Section 232')]:
            expected=[word for word,_,_ in tokens(spoken)]
            actual=[word for word,_,_ in tokens(heard)]
            self.assertEqual(len(timing_pairs(expected,actual)),len(expected))
        self.assertNotEqual(len(timing_pairs(['two','thirty','two'],['233'])),3)
        self.assertNotEqual(len(timing_pairs(['two','oh','one'],['210'])),3)
        self.assertNotEqual(len(timing_pairs(['two','thirty','two'],['tariffs'])),3)

    def test_explicit_ieepa_letter_names_match_their_exact_asr_spellings(self):
        expected=['eye','ee','pa']
        for heard in [['i','epa'],['i','e','pa'],['iepa']]:
            self.assertEqual(len(timing_pairs(expected,heard)),3)
        self.assertNotEqual(len(timing_pairs(expected,['epa'])),3)
        self.assertNotIn(3,timing_pairs(expected+['tariffs'],['i','epa','claims']))
        self.assertNotIn(0,timing_pairs(['eye'],['i']))

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
            text='Actual note.'+(' '+prefix.strip() if prefix else '')
            canonical={'kind':'footnote','label':label,'text':text,
                       'segments':[{'page':0,'text':text,'map':list(range(len(text)))}]}
            spoken=f'Footnote {label}: {text} End footnote {label}.'
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

    def test_pronounced_sentence_end_and_entire_name_keep_full_reader_range(self):
        for original, replacement in [('We rely on Article III.', 'We rely on Article three.'),
                                      ('During World War II.', 'During World War two.'),
                                      ('Abouammo.', 'Aboo Ammo.')]:
            canonical={'kind':'paragraph','text':original,
                       'segments':[{'page':2,'text':original,'map':list(range(100,100+len(original)))}]}
            mapped=map_speech(original,pronunciations=[{'from':original,'to':replacement}])
            paragraph={'text':mapped.text,'start':0,'end':20}
            words=[{'text':token,'start':i,'end':i+.5} for i,(token,_,_) in enumerate(tokens(mapped.text))]
            alignment=paragraph_alignment(paragraph,canonical,words,mapped.intervals)
            cue=sentence_cue({'start':0,'end':len(mapped.text)},paragraph,canonical,alignment,0)
            self.assertEqual(cue['ranges'],[{'page':2,'start':100,'end':100+len(original)}])

    def test_pronunciation_across_pdf_pages_retains_both_source_endpoints(self):
        text='Article III.'
        canonical={'kind':'paragraph','text':text,'segments':[
            {'page':2,'text':'Article ','map':list(range(100,108))},
            {'page':3,'text':'III.','map':list(range(200,204))}]}
        mapped=map_speech(text,pronunciations=[{'from':'Article III','to':'Article three'}])
        paragraph={'text':mapped.text,'start':0,'end':10}
        words=[{'text':token,'start':i,'end':i+.5} for i,(token,_,_) in enumerate(tokens(mapped.text))]
        alignment=paragraph_alignment(paragraph,canonical,words,mapped.intervals)
        cue=sentence_cue({'start':0,'end':len(mapped.text)},paragraph,canonical,alignment,0)
        self.assertEqual(cue['ranges'],[{'page':2,'start':100,'end':108},
                                      {'page':3,'start':200,'end':204}])

    def test_transformed_speech_requires_mapping_and_invalid_maps_are_rejected(self):
        canonical={'kind':'paragraph','text':'Article III.'}
        paragraph={'text':'Article three.','start':0,'end':10}
        with self.assertRaisesRegex(ValueError,'requires its prepared speech source mapping'):
            paragraph_alignment(paragraph,canonical,[])
        with self.assertRaisesRegex(ValueError,'length differs'):
            paragraph_alignment(paragraph,canonical,[],[(0,1)])
        with self.assertRaisesRegex(ValueError,'invalid reader interval'):
            paragraph_alignment(paragraph,canonical,[],[(0,99)]*len(paragraph['text']))

    def test_existing_verified_cue_can_refresh_ranges_without_acoustic_work(self):
        text='Article III.'
        canonical={'kind':'footnote','label':'1','text':text,
                   'segments':[{'page':2,'text':text,'map':list(range(100,100+len(text)))}]}
        mapped=map_speech(text,pronunciations=[{'from':'Article III','to':'Article three'}],footnote_label='1')
        end=mapped.text.index(' End footnote')
        self.assertEqual(mapped_source_ranges(canonical,mapped.intervals,0,end),
                         [{'page':2,'start':100,'end':100+len(text)}])
        self.assertEqual(mapped_source_ranges(canonical,mapped.intervals,end+1,len(mapped.text),True),
                         [{'page':2,'start':100+len(text)-1,'end':100+len(text)}])

    def test_sentence_punctuation_edit_after_omitted_citation_does_not_overlap_next_cue(self):
        text='New York v. United States, 505 U.S. 144 (discussing Dole); ante, at 73. But that distinction differs.'
        citations=[]
        for label in [', 505 U.S. 144','ante, at 73.']:
            start=text.index(label)
            citations.append({'start':start,'end':start+len(label)})
        mapped=map_speech(text,citations,pronunciations=[
            {'from':'New York v. United States','to':'New York versus United States'},
            {'from':');  But','to':'). But'}])
        canonical={'kind':'paragraph','text':text,
                   'segments':[{'page':35,'text':text,'map':list(range(700,700+len(text)))}]}
        sentences=sentence_ranges([mapped.text])[0]
        self.assertEqual(len(sentences),2)
        first=mapped_source_ranges(canonical,mapped.intervals,sentences[0]['start'],sentences[0]['end'])
        second=mapped_source_ranges(canonical,mapped.intervals,sentences[1]['start'],sentences[1]['end'])
        self.assertLessEqual(first[-1]['end'],second[0]['start'])
        self.assertEqual(second[0]['start'],700+text.index('But'))


if __name__ == '__main__':
    unittest.main()
