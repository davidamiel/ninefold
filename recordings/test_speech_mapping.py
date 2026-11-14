"""Explicit speech edits retain source endpoints without fuzzy token matching."""
import unittest

from speech_mapping import map_speech, source_bounds


class SpeechSourceMapping(unittest.TestCase):
    def test_roman_pronunciation_at_sentence_end_keeps_original_label(self):
        for original, replacement in [('Article III', 'Article three'),
                                      ('World War II', 'World War two')]:
            text = f'We rely on {original}.'
            mapped = map_speech(text, pronunciations=[{'from': original, 'to': replacement}])
            self.assertEqual(mapped.text, f'We rely on {replacement}.')
            self.assertEqual(mapped.bounds(0, len(mapped.text)), (0, len(text)))
            at = mapped.text.index(replacement)
            self.assertEqual(mapped.bounds(at, at+len(replacement)),
                             (text.index(original), text.index(original)+len(original)))

    def test_shorter_name_replacement_covers_its_whole_original_range(self):
        mapped = map_speech('Abouammo.', pronunciations=[{'from': 'Abouammo', 'to': 'Aboo'}])
        self.assertEqual(mapped.text, 'Aboo.')
        self.assertEqual(mapped.intervals[:4], [(0, 8)]*4)
        self.assertEqual(mapped.bounds(0, 1), (0, 8))
        self.assertEqual(mapped.bounds(0, 5), (0, 9))

    def test_punctuation_edit_across_sentences_keeps_unchanged_next_word_separate(self):
        text='Discussing Dole);  But that distinction differs.'
        mapped=map_speech(text,pronunciations=[{'from':');  But','to':'). But'}])
        first_end=mapped.text.index('. ')+1
        second_start=mapped.text.index('But')
        self.assertEqual(mapped.text,'Discussing Dole). But that distinction differs.')
        self.assertLessEqual(mapped.bounds(0,first_end)[1],text.index('But'))
        self.assertEqual(mapped.bounds(second_start,len(mapped.text)),(text.index('But'),len(text)))

    def test_multiple_edits_in_name_preserve_exact_unchanged_internal_words(self):
        text='Board of R. Comm’rs v. Oregon R. & Navigation Co.'
        replacement='Board of R. Commissioners versus Oregon R. & Navigation Company'
        mapped=map_speech(text,pronunciations=[{'from':text,'to':replacement}])
        start=mapped.text.index('Oregon')
        self.assertEqual(mapped.bounds(start,start+len('Oregon R.')),
                         (text.index('Oregon'),text.index('Oregon')+len('Oregon R.')))
        self.assertEqual(mapped.bounds(0,len(mapped.text)),(0,len(text)))

    def test_deleted_prefix_and_suffix_still_cover_original_source(self):
        mapped=map_speech('[word]',pronunciations=[{'from':'[word]','to':'word'}])
        self.assertEqual(mapped.text,'word')
        self.assertEqual(mapped.bounds(0,len(mapped.text)),(0,len('[word]')))

    def test_longest_replacements_are_simultaneous_and_do_not_cascade(self):
        changes = [{'from': 'II', 'to': 'two'}, {'from': 'III', 'to': 'three'},
                   {'from': 'two', 'to': 'second'}]
        mapped = map_speech('II, III, two', pronunciations=changes)
        self.assertEqual(mapped.text, 'two, three, second')
        self.assertEqual(mapped.bounds(5, 10), (4, 7))

    def test_citation_omission_keeps_repeated_words_at_their_actual_source(self):
        text = 'We agree. See 1 U.S. 2. We agree.'
        start, end = text.index('See'), text.rindex('We')
        mapped = map_speech(text, citations=[{'start': start, 'end': end}])
        self.assertEqual(mapped.text, 'We agree. We agree.')
        self.assertEqual(mapped.bounds(10, len(mapped.text)), (end, len(text)))

    def test_inline_reference_whitespace_and_punctuation_keep_exact_characters(self):
        text = '\t Section 1519\u2003\n applies \t ,  too .  '
        mapped = map_speech(text, citations=[{'start': 2, 'end': 14, 'omitFromSpeech': False}])
        self.assertEqual(mapped.text, 'Section 1519 applies, too.')
        self.assertEqual(mapped.bounds(0, 12), (text.index('Section'), text.index('Section')+12))
        period = mapped.text.index('.')
        self.assertEqual(mapped.bounds(period, period+1), (text.index('.'), text.index('.')+1))

    def test_footnote_announcements_have_no_source_coordinates(self):
        for label in ['1', '*', '†']:
            mapped = map_speech('Actual note.', footnote_label=label)
            prefix, suffix = f'Footnote {label}: ', f' End footnote {label}.'
            self.assertEqual(mapped.text, prefix+'Actual note.'+suffix)
            self.assertIsNone(mapped.bounds(0, len(prefix)))
            self.assertIsNone(mapped.bounds(len(mapped.text)-len(suffix), len(mapped.text)))
            self.assertEqual(mapped.bounds(0, len(mapped.text)), (0, len('Actual note.')))

    def test_unicode_offsets_are_python_code_points(self):
        text = 'A notation 𝑥 appears.'
        mapped = map_speech(text)
        self.assertEqual(mapped.text, text)
        self.assertEqual(mapped.bounds(text.index('𝑥'), len(text)), (text.index('𝑥'), len(text)))

    def test_invalid_speech_bounds_and_stale_pronunciations_are_rejected(self):
        with self.assertRaises(ValueError):
            source_bounds([(0, 1)], 0, 2)
        with self.assertRaisesRegex(ValueError, 'Pronunciation no longer matches block 7'):
            map_speech('Actual text.', pronunciations=[{'from': 'missing', 'to': 'new'}], index=7)

    def test_empty_or_citation_only_script_does_not_narrate_announcements(self):
        self.assertIsNone(map_speech(' \t . ', footnote_label='1'))
        self.assertIsNone(map_speech('1 U.S. 2', citations=[{'start':0,'end':8}],footnote_label='1'))


if __name__ == '__main__':
    unittest.main()
