"""Publishing cannot pair a voice or sentence timeline with another recording."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from stage import validate_recording


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


if __name__ == '__main__':
    unittest.main()
