"""Mixed-opinion running heads must not hide a separate judicial writing."""
import unittest
from unittest.mock import patch

from check_coverage import running_author, unfinished_writings


class OpinionBylines(unittest.TestCase):
    def test_mixed_opinion_and_separate_writing_headers(self):
        self.assertEqual(running_author('998 WEST VIRGINIA v. B. P. J.\nOpinion of Sotomayor, J.\nContinued text'), 'Sotomayor')
        self.assertEqual(running_author('Cite as: 609 U. S. 1\nGORSUCH, J., concurring'), 'Gorsuch')
        self.assertEqual(running_author('Statement of SOTOMAYOR, J.\nOpinion text'), 'Sotomayor')

    def test_citation_continuation_is_not_a_new_author(self):
        self.assertEqual(running_author('SOTOMAYOR, J., dissenting\nKAVANAUGH, J.) (slip op., at 5). Whatever clarity'), 'Sotomayor')
        self.assertIsNone(running_author('KAVANAUGH, J.) (slip op., at 5). Whatever clarity'))


class CompletePublication(unittest.TestCase):
    def test_local_audio_or_missing_consolidated_case_cannot_complete_the_term(self):
        plan={'targets':[{'id':'court','aliases':['consolidated']}]}
        hosted={'hash':{'url':'https://example.test/verified.mp3','bytes':2000,'releaseAssetId':12}}
        ready={'version':'current','recordings':{voice:{'url':'https://example.test/verified.mp3'}
                                                for voice in ('female','male')}}
        with patch('check_coverage.reviewed_jobs',return_value={'court':{}}), \
             patch('check_coverage.prepare',return_value=({'version':'current'},{})):
            self.assertEqual(unfinished_writings(plan,{'court':ready},hosted),
                             [{'documentId':'consolidated','stage':'recording and alignment'}])
            local={'version':'current','recordings':{voice:{'url':'audio/local.mp3'} for voice in ('female','male')}}
            self.assertEqual(unfinished_writings(plan,{'court':ready,'consolidated':local},hosted),
                             [{'documentId':'consolidated','stage':'media publication'}])
            self.assertEqual(unfinished_writings(plan,{'court':ready,'consolidated':ready},hosted),[])


if __name__ == '__main__':
    unittest.main()
