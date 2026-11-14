"""Mixed-opinion running heads must not hide a separate judicial writing."""
import unittest

from check_coverage import running_author


class OpinionBylines(unittest.TestCase):
    def test_mixed_opinion_and_separate_writing_headers(self):
        self.assertEqual(running_author('998 WEST VIRGINIA v. B. P. J.\nOpinion of Sotomayor, J.\nContinued text'), 'Sotomayor')
        self.assertEqual(running_author('Cite as: 609 U. S. 1\nGORSUCH, J., concurring'), 'Gorsuch')
        self.assertEqual(running_author('Statement of SOTOMAYOR, J.\nOpinion text'), 'Sotomayor')

    def test_citation_continuation_is_not_a_new_author(self):
        self.assertEqual(running_author('SOTOMAYOR, J., dissenting\nKAVANAUGH, J.) (slip op., at 5). Whatever clarity'), 'Sotomayor')
        self.assertIsNone(running_author('KAVANAUGH, J.) (slip op., at 5). Whatever clarity'))


if __name__ == '__main__':
    unittest.main()
