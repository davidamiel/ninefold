"""CPU recognition is a bounded final repair, with unchanged strict gates."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from align import (AlignmentReviewError, align_recording, align_short_cpu,
                   recognition_identity, recognition_words)


def failure(block, words):
    error = AlignmentReviewError(block, 'Unclear acoustic words')
    error.words = words
    return error


class ShortCpuFallback(unittest.TestCase):
    def setUp(self):
        self.body = {}
        self.narration = {'spokenBlocks': [9, 10]}
        self.report = {'paragraphs': [{'start': 100, 'end': 102}, {'start': 200, 'end': 210}]}
        self.words = [{'text': 'earlier', 'start': 50, 'end': 51},
                      {'text': 'descend', 'start': 100.5, 'end': 101.5},
                      {'text': 'later', 'start': 205, 'end': 206}]
        self.actual = [{'text': 'dissent', 'start': 100.5, 'end': 101.5}]
        self.result = {'cues': [{'ranges': [{'page': 0, 'start': 20, 'end': 30}]}]}
        self.recognizer = Mock(audio=Path('recording.mp3'), samples=object())

    def run_cpu(self, error, device='mps'):
        return align_short_cpu(self.body, self.narration, self.report, error, self.recognizer, device)

    def test_cpu_runs_only_after_all_existing_recognition_phases_fail(self):
        small, cpu = Mock(), Mock()
        cpu.contextual_words.return_value = self.actual
        errors = [failure(9, self.words) for _ in range(3)]
        with patch('align.align_with_repairs', side_effect=errors) as phases, \
             patch('align.Transcriber', side_effect=[small, cpu]) as factory, \
             patch('align.align', return_value=self.result) as strict:
            result, words = align_recording(self.body, self.narration, self.report,
                                            self.words, self.recognizer, 'mps')
        self.assertIs(result, self.result)
        self.assertEqual([call.args[-1] for call in phases.call_args_list],
                         [self.recognizer.words, small.words, small.contextual_words])
        self.assertEqual([call.kwargs['device'] for call in factory.call_args_list], ['mps', 'cpu'])
        cpu.contextual_words.assert_called_once_with(100, 102)
        cpu.words.assert_not_called()
        self.assertIs(cpu.samples, self.recognizer.samples)
        self.assertEqual(words, [self.words[0], self.actual[0], self.words[2]])
        strict.assert_called_once_with(self.body, self.narration, self.report, words)

    def test_earlier_success_never_constructs_cpu_recognizer(self):
        for completed_phase in range(3):
            phases = [failure(9, self.words) for _ in range(completed_phase)]
            phases.append((self.result, self.words))
            with self.subTest(completed_phase=completed_phase), \
                 patch('align.align_with_repairs', side_effect=phases), \
                 patch('align.Transcriber') as factory:
                actual = align_recording(self.body, self.narration, self.report,
                                         self.words, self.recognizer, 'mps')
                self.assertEqual(actual, (self.result, self.words))
                self.assertTrue(all(call.kwargs['device'] == 'mps' for call in factory.call_args_list))

    def test_cpu_and_long_or_empty_passages_are_ineligible(self):
        for device, duration in [('cpu', 2), ('mps', 4.001), ('mps', 0), ('mps', -1)]:
            self.report['paragraphs'][0]['end'] = 100+duration
            error = failure(9, self.words)
            with self.subTest(device=device, duration=duration), \
                 patch('align.Transcriber') as factory, self.assertRaises(AlignmentReviewError) as caught:
                self.run_cpu(error, device)
            self.assertIs(caught.exception, error)
            factory.assert_not_called()

    def test_exact_four_second_boundary_is_eligible(self):
        self.report['paragraphs'][0]['end'] = 104
        cpu = Mock()
        cpu.contextual_words.return_value = self.actual
        with patch('align.Transcriber', return_value=cpu), patch('align.align', return_value=self.result):
            self.run_cpu(failure(9, self.words))
        cpu.contextual_words.assert_called_once_with(100, 104)

    def test_failed_cpu_recognition_is_not_retried_or_accepted(self):
        cpu = Mock()
        cpu.contextual_words.return_value = self.actual
        still_unclear = failure(9, [])
        error = failure(9, self.words)
        with patch('align.Transcriber', return_value=cpu), \
             patch('align.align', side_effect=still_unclear), self.assertRaises(AlignmentReviewError) as caught:
            self.run_cpu(error)
        self.assertIs(caught.exception, still_unclear)
        cpu.contextual_words.assert_called_once_with(100, 102)
        self.assertEqual(caught.exception.words, [self.words[0], self.actual[0], self.words[2]])

    def test_a_later_long_failure_does_not_trigger_long_cpu_recognition(self):
        cpu = Mock()
        cpu.contextual_words.return_value = self.actual
        error = failure(9, self.words)
        later_error = failure(10, [])
        with patch('align.Transcriber', return_value=cpu), \
             patch('align.align', side_effect=later_error), self.assertRaises(AlignmentReviewError):
            self.run_cpu(error)
        cpu.contextual_words.assert_called_once_with(100, 102)

    def test_source_overlap_is_rejected_after_cpu_recognition(self):
        cpu = Mock()
        cpu.contextual_words.return_value = self.actual
        overlap = {'cues': [{'ranges': [{'page': 0, 'start': 0, 'end': 10}]},
                            {'ranges': [{'page': 0, 'start': 9, 'end': 20}]}]}
        error = failure(9, self.words)
        with patch('align.Transcriber', return_value=cpu), patch('align.align', return_value=overlap), \
             self.assertRaisesRegex(ValueError, 'Source sentence ranges overlap'):
            self.run_cpu(error)


class AcousticCachePolicy(unittest.TestCase):
    def test_short_cpu_repair_settings_are_part_of_cache_identity(self):
        original = recognition_identity('audio', 'mps', 'version')
        for setting, changed in [('SHORT_PASSAGE_SECONDS', 3), ('SHORT_CONTEXT_SECONDS', 40),
                                 ('CONTEXT_SECONDS', 10)]:
            with self.subTest(setting=setting), patch('align.'+setting, changed):
                self.assertNotEqual(original, recognition_identity('audio', 'mps', 'version'))
        self.assertNotEqual(original, recognition_identity('other-audio', 'mps', 'version'))
        self.assertNotEqual(original, recognition_identity('audio', 'cpu', 'version'))
        self.assertNotEqual(original, recognition_identity('audio', 'mps', 'new-version'))

    def test_current_policy_cache_is_reused_without_full_recognition(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            current = folder/(recognition_identity('audio', 'mps', 'version')+'-words.json')
            current.write_text('[{"text":"dissent"}]')
            recognizer = Mock()
            cache, words = recognition_words(folder, 'audio', 'mps', 'version', recognizer)
            self.assertEqual(cache, current.resolve())
            self.assertEqual(words, [{'text': 'dissent'}])
            recognizer.words.assert_not_called()

    def test_initial_recognition_runs_only_when_no_acoustic_cache_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            recognizer = Mock()
            recognizer.words.return_value = [{'text': 'actual', 'start': 1, 'end': 2}]
            cache, words = recognition_words(Path(directory), 'audio', 'mps', 'version', recognizer)
            recognizer.words.assert_called_once_with()
            self.assertEqual(json.loads(cache.read_text()), words)


if __name__ == '__main__':
    unittest.main()
