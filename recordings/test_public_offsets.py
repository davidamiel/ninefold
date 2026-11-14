"""Browser exports preserve exact text and raw-source ranges around astral text."""
from copy import deepcopy
import json
import subprocess
import tempfile
from pathlib import Path
import unittest

from public_offsets import public_payload
from stage import public_files, write_json


class PublicOffsets(unittest.TestCase):
    def verify_in_node(self, body, cues, pages, expected_sources):
        program = r"""
        import assert from 'node:assert/strict';
        let input='';for await(const part of process.stdin)input+=part;
        const {body,cues,pages,expected}=JSON.parse(input);
        for(const paragraph of body.paragraphs){
          assert.equal(paragraph.text,paragraph.segments.map(s=>s.text).join(''));
          for(const segment of paragraph.segments){
            assert.equal(segment.map.length,segment.text.length);
            for(const offset of segment.map){
              assert(Number.isInteger(offset)&&offset>=0&&offset<pages[segment.page].text.length);
            }
            for(const citation of segment.citations||[]){
              assert.equal(segment.text.slice(citation.start,citation.end),citation.label);
              if(citation.referenceOffset!==undefined){
                assert.equal(pages[citation.referencePage].text.slice(citation.referenceOffset,
                  citation.referenceOffset+2),'𝑋');
              }
            }
          }
        }
        const actual=cues.cues.flatMap(c=>c.ranges.map(r=>pages[r.page].text.slice(r.start,r.end)));
        assert.deepEqual(actual,expected);
        """
        subprocess.run(['node','--input-type=module','-e',program],
                       input=json.dumps({'body':body,'cues':cues,'pages':pages,'expected':expected_sources}),
                       text=True,check=True,capture_output=True)

    def test_cross_page_references_footnotes_and_astral_prefixes(self):
        pages=[{'text':'𝑃reamble. Alpha 𝛼 cites 𝑋'}, {'text':'😀 1 U.S. 2. A note 𝑦.'}]
        first='Alpha 𝛼 cites 𝑋';second=' 1 U.S. 2.';note='A note 𝑦.'
        a=pages[0]['text'].index(first);b=pages[1]['text'].index(second);n=pages[1]['text'].index(note)
        reference=pages[0]['text'].index('𝑋')
        common={'type':'case','canonical':'𝑋 1 U.S. 2.','fullLabel':'𝑋 1 U.S. 2.',
                'referencePage':0,'referenceOffset':reference}
        body={'version':'same-version','reviewedCitations':True,
              'sectionSources':{'102':'110 Stat. 3009–554'},'paragraphs':[
                  {'kind':'paragraph','text':first+second,'segments':[
                      {'page':0,'text':first,'map':list(range(a,a+len(first))),
                       'citations':[{**common,'start':first.index('𝑋'),'end':len(first),'label':'𝑋','continuation':False}]},
                      {'page':1,'text':second,'map':list(range(b,b+len(second))),
                       'citations':[{**common,'start':0,'end':len(second),'label':second,'continuation':True}]}]},
                  {'kind':'footnote','label':'1','text':note,'segments':[
                      {'page':1,'text':note,'map':list(range(n,n+len(note))),'citations':[]}]}]}
        cues={'version':'same-version','audioSha256':'same-audio','duration':5,'cues':[
            {'start':0,'end':3,'paragraph':0,'ranges':[{'page':0,'start':a,'end':a+len(first)},
                                                   {'page':1,'start':b,'end':b+len(second)}]},
            {'start':3,'end':5,'paragraph':1,'footnote':'1','ranges':[{'page':1,'start':n,'end':n+len(note)}]}]}
        originals=deepcopy((body,cues,pages))
        result,timeline=public_payload(body,cues,pages)
        self.assertEqual((body,cues,pages),originals)
        self.assertEqual(result['version'],body['version'])
        self.assertEqual(timeline['audioSha256'],cues['audioSha256'])
        self.assertEqual([(c['start'],c['end'])for c in timeline['cues']],[(0,3),(3,5)])
        self.assertEqual(result['sectionSources'],body['sectionSources'])
        self.assertEqual(result['paragraphs'][0]['segments'][0]['map'][0],a+1)
        self.verify_in_node(result,timeline,pages,[first,second,note])

    def test_expanding_and_contracting_repairs_keep_raw_source_ranges(self):
        for raw,clean,expected_map in [('𝑋!','𝑋!',[0,1,2]),('𝑋!','x!',[0,2]),('x!','𝑋!',[0,0,1])]:
            with self.subTest(raw=raw,clean=clean):
                pages=[{'text':raw}]
                body={'version':'unchanged','paragraphs':[{'kind':'paragraph','text':clean,'segments':[
                    {'page':0,'text':clean,'map':[0,1],'citations':[
                        {'start':0,'end':1,'label':clean[0],'type':'reference','canonical':'notation'}]}]}]}
                cues={'version':'unchanged','duration':2,'cues':[
                    {'start':0,'end':2,'ranges':[{'page':0,'start':0,'end':2}]}]}
                public,timeline=public_payload(body,cues,pages)
                self.assertEqual(public['paragraphs'][0]['segments'][0]['map'],expected_map)
                self.assertEqual(public['offsetEncoding'],'utf16')
                self.verify_in_node(public,timeline,pages,[raw])

    def test_bmp_exports_are_equal_but_independent_copies(self):
        body={'version':'same','sectionSources':{},'paragraphs':[
            {'kind':'paragraph','text':'Café.','segments':[{'page':0,'text':'Café.','map':[0,1,2,3,4]}]}]}
        cues={'version':'same','cues':[{'start':0,'end':1,'ranges':[{'page':0,'start':0,'end':5}]}]}
        public,timeline=public_payload(body,cues,[{'text':'Café.'}])
        self.assertEqual((public,timeline),(body,cues))
        public['paragraphs'][0]['segments'][0]['map'][0]=4
        timeline['cues'][0]['ranges'][0]['start']=1
        self.assertEqual(body['paragraphs'][0]['segments'][0]['map'][0],0)
        self.assertEqual(cues['cues'][0]['ranges'][0]['start'],0)

    def test_staging_selects_browser_files_and_retains_private_alignment_inputs(self):
        for text in ['Café.','𝑋!']:
            with self.subTest(text=text),tempfile.TemporaryDirectory() as temporary:
                folder=Path(temporary)
                body={'version':'same','paragraphs':[{'kind':'paragraph','text':text,'segments':[
                    {'page':0,'text':text,'map':list(range(len(text)))}]}]}
                cues={'version':'same','cues':[{'start':0,'end':1,
                      'ranges':[{'page':0,'start':0,'end':len(text)}]}]}
                write_json(folder/'prepared.json',body)
                recordings={voice:{'cues':deepcopy(cues)} for voice in ('female','male')}
                for voice in recordings:write_json(folder/(voice+'-cues.json'),cues)
                reader_path=public_files(body,recordings,folder,[{'text':text}])
                published=json.loads(reader_path.read_text())
                self.assertEqual(published['paragraphs'][0]['segments'][0]['map'],
                                 list(range(len(text.encode('utf-16-le'))//2)))
                self.assertEqual(json.loads((folder/'prepared.json').read_text()),body)
                for voice,item in recordings.items():
                    timeline=json.loads(item['cuePath'].read_text())
                    self.assertEqual(timeline['cues'][0]['ranges'][0]['end'],len(text.encode('utf-16-le'))//2)
                    self.assertEqual(json.loads((folder/(voice+'-cues.json')).read_text()),cues)
                if text=='Café.':self.assertEqual(reader_path,folder/'prepared.json')
                else:self.assertNotEqual(reader_path,folder/'prepared.json')

    def test_invalid_or_already_exported_offsets_fail_closed(self):
        body={'paragraphs':[{'text':'x','segments':[{'page':0,'text':'x','map':[0]}]}]}
        cues={'cues':[{'ranges':[{'page':0,'start':0,'end':1}]}]}
        for mutate in [lambda b,c:b.update(offsetEncoding='utf16'),
                       lambda b,c:b['paragraphs'][0]['segments'][0].update(map=[]),
                       lambda b,c:b['paragraphs'][0]['segments'][0].update(map=[-1]),
                       lambda b,c:c['cues'][0]['ranges'][0].update(end=2)]:
            b,c=deepcopy((body,cues));mutate(b,c)
            with self.assertRaises(ValueError):
                public_payload(b,c,[{'text':'x'}])


if __name__=='__main__':
    unittest.main()
