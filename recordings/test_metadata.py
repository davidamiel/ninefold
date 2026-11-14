"""Writing tabs and case cards must refer to the same public judicial writings."""
import unittest
from reconcile_metadata import reconcile


class WritingMetadata(unittest.TestCase):
    def test_later_concurrence_does_not_replace_the_merits_opinion(self):
        source='https://www.supremecourt.gov/opinions/25pdf/'
        court={'id':'court','opinionAuthor':'Samuel A. Alito, Jr.','opinionType':'Opinion of the Court','sourceUrl':source+'merits.pdf','sourceRange':{'startPage':7}}
        concurrence={**court,'id':'concurrence','opinionType':'Concurrence','sourceUrl':source+'order.pdf','sourceRange':{'startPage':0}}
        case={'id':'case','decision':{'opinions':[{'author':'Samuel A. Alito, Jr.','type':'Opinion of the Court','sourceUrl':source+'order.pdf','documentId':'old-parent','pageIndex':0}]}}
        reconcile({'cases':[case]},{'case':[court,concurrence]},{'concurrence':{'joinedBy':['Neil Gorsuch','Brett M. Kavanaugh (except Part II)']}},['Neil M. Gorsuch','Brett M. Kavanaugh'])
        opinions=case['decision']['opinions']
        self.assertEqual([(item['documentId'],item['type']) for item in opinions],[('court','Opinion of the Court'),('concurrence','Concurrence')])
        self.assertEqual(opinions[1]['joinedBy'],['Neil M. Gorsuch','Brett M. Kavanaugh'])
        self.assertEqual(opinions[1]['joiningScope'],{'Brett M. Kavanaugh':'except Part II'})
        self.assertEqual(reconcile({'cases':[case]},{'case':[court,concurrence]},{'concurrence':{'joinedBy':['Neil Gorsuch','Brett M. Kavanaugh (except Part II)']}},['Neil M. Gorsuch','Brett M. Kavanaugh']),[])


if __name__=='__main__':
    unittest.main()
