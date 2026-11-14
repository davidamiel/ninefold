"""Source corrections preserve verified acoustic timing and reject changed scripts."""
import copy
import unittest

from remap_cues import remap_cues
from speech_mapping import map_speech


class CueRefresh(unittest.TestCase):
    def example(self):
        text='Article III applies.'
        speech=map_speech(text,pronunciations=[{'from':'III','to':'three'}])
        body={'version':'same','paragraphs':[{'kind':'paragraph','text':text,
              'segments':[{'page':2,'text':text,'map':list(range(10,10+len(text)))}]}]}
        narration={'version':'same','spokenParagraphs':[speech.text],
                   'spokenBlocks':[0],'spokenMappings':[speech.intervals]}
        report={'version':'same','paragraphs':[{'text':speech.text}]}
        cues={'version':'same','audioSha256':'verified','coverage':[{'coverage':1}],
              'cues':[{'paragraph':0,'text':speech.text,'start':7.1,'end':9.8,'ranges':[]} ]}
        return body,narration,report,cues

    def test_only_ranges_change(self):
        body,narration,report,cues=self.example()
        before=copy.deepcopy(cues)
        result=remap_cues(body,narration,report,cues)
        self.assertEqual(cues,before)
        expected=copy.deepcopy(before)
        expected['cues'][0]['ranges']=[{'page':2,'start':10,'end':30}]
        self.assertEqual(result,expected)

    def test_initialism_fragments_merge_using_the_verified_outer_boundaries(self):
        text='Talk to the D. A. today. We disagree.'
        speech=map_speech(text)
        body={'version':'same','paragraphs':[{'kind':'paragraph','text':text,
              'segments':[{'page':0,'text':text,'map':list(range(len(text)))}]}]}
        narration={'version':'same','spokenParagraphs':[text],'spokenBlocks':[0],
                   'spokenMappings':[speech.intervals]}
        report={'version':'same','paragraphs':[{'text':text}]}
        cues={'version':'same','coverage':[{'coverage':1}],'audioSha256':'verified','cues':[
            {'paragraph':0,'text':'Talk to the D.','start':1,'end':3,'ranges':[]},
            {'paragraph':0,'text':'A. today.','start':3,'end':5,'ranges':[]},
            {'paragraph':0,'text':'We disagree.','start':5,'end':7,'ranges':[]}]}
        result=remap_cues(body,narration,report,cues)
        self.assertEqual([(c['text'],c['start'],c['end']) for c in result['cues']],
                         [('Talk to the D. A. today.',1,5),('We disagree.',5,7)])
        self.assertEqual(result['audioSha256'],cues['audioSha256'])
        self.assertEqual(result['coverage'],cues['coverage'])
        cues['cues'][1]['start']=2.9
        with self.assertRaisesRegex(ValueError,'Overlapping'):
            remap_cues(body,narration,report,cues)

    def test_changed_script_sentence_or_version_cannot_reuse_verified_timings(self):
        for field in ('script','sentence','paragraph','version','sequence'):
            body,narration,report,cues=self.example()
            if field=='script':report['paragraphs'][0]['text']='Other words.'
            elif field=='sentence':cues['cues'][0]['text']='Other words.'
            elif field=='paragraph':cues['cues'][0]['paragraph']=1
            elif field=='version':report['version']='changed'
            else:cues['cues'].append(copy.deepcopy(cues['cues'][0]))
            with self.subTest(field=field),self.assertRaises(ValueError):
                remap_cues(body,narration,report,cues)


if __name__=='__main__':
    unittest.main()
