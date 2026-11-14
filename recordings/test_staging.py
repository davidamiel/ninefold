"""Publishing cannot pair a voice or sentence timeline with another recording."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from stage import validate_recording, validate_source_seeking


class RecordingStaging(unittest.TestCase):
    def test_mismatched_voice_audio_or_alignment_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            audio = Path(folder)/'female.mp3'
            audio.write_bytes(b'encoded recording fixture')
            report = {'audioSha256': hashlib.sha256(audio.read_bytes()).hexdigest(), 'voice': 'af_sky', 'version': 'reviewed', 'duration': 10}
            cues = {**report, 'coverage': [{'coverage': 1}], 'cues': [{'start': 0, 'end': 10, 'ranges': [{'page': 0, 'start': 0, 'end': 5}]}]}
            body, narration = {'version': 'reviewed'}, {'spokenParagraphs': ['Words']}
            validate_recording(body, narration, report, cues, audio, 'female')
            for key, value in [('voice', 'am_michael'), ('audioSha256', 'old audio'), ('version', 'old text'), ('coverage', [])]:
                changed = copy.deepcopy(cues)
                changed[key] = value
                with self.subTest(key=key), self.assertRaises(ValueError):
                    validate_recording(body, narration, report, changed, audio, 'female')
            with self.assertRaisesRegex(ValueError, 'voice'):
                validate_recording(body, narration, report, cues, audio, 'male')
            audio.write_bytes(b'another recording')
            with self.assertRaisesRegex(ValueError, 'hash'):
                validate_recording(body, narration, report, cues, audio, 'female')


class SourceSeeking(unittest.TestCase):
    def test_overlaps_are_rejected_but_same_sentence_and_note_transitions_are_allowed(self):
        first={'ranges':[{'page':0,'start':1,'end':10},{'page':0,'start':8,'end':12}]}
        next_sentence={'ranges':[{'page':0,'start':12,'end':20}]}
        closing_note={'transition':True,'ranges':[{'page':0,'start':19,'end':20}]}
        validate_source_seeking({'cues':[first,next_sentence,closing_note]})
        next_sentence['ranges'][0]['start']=11
        with self.assertRaisesRegex(ValueError,'overlap'):
            validate_source_seeking({'cues':[first,next_sentence,closing_note]})


if __name__ == '__main__':
    unittest.main()
