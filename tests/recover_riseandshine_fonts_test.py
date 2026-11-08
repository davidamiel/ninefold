"""Maintenance-script tests; run separately with its PDF/font dependencies."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('recovery', Path(__file__).resolve().parents[1] / 'scripts/recover_riseandshine_fonts.py')
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

class RecoveryTests(unittest.TestCase):
    def test_unknown_source_fails_before_pdf_read(self):
        with self.assertRaisesRegex(ValueError, 'source hash'):
            r.recover_pdf(b'not the verified source')

    def test_encoded_controls_are_not_treated_as_whitespace(self):
        self.assertEqual(r.canonical('a\x03b\x0bc\x0cd')[0], 'a\x03b\x0bc\x0cd')

    def test_numeric_and_capitalized_wraps_are_only_joined_in_target(self):
        self.assertEqual(r.canonical('423-\n24; Car-\nFreshner')[0], '423- 24; Car- Freshner')
        self.assertEqual(r.canonical('423-\n24; Car-\nFreshner', join_ranges=True)[0], '423-24; Car-Freshner')

    def test_insertions_have_source_guards_and_round_trip(self):
        raw='A wordwithout a space.'
        repairs, target=r.repairs_for_page(raw, 'A word without a space.', 3)
        self.assertTrue(repairs)
        for x in reversed(repairs):
            self.assertLess(x['start'],x['end'])
            self.assertEqual(raw[x['start']:x['end']],x['expectedText'])
            raw=raw[:x['start']]+x['text']+raw[x['end']:]
        self.assertEqual(r.canonical(raw)[0],target)

    def test_guard_expansion_preserves_pre_normalized_boundary_space(self):
        raw='connection.” ,QW·O\x03,QIR'
        repairs,target=r.repairs_for_page(raw,'connection.” Int’l Info',0)
        self.assertTrue(any(' ' in x['text'] for x in repairs))
        self.assertEqual(target,'connection.” Int’l Info')

if __name__=='__main__': unittest.main()
