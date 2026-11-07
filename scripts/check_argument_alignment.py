"""Verify official text integrity and timestamp invariants after alignment."""
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--official',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1]
records=json.loads((root/'dist/data/argument-alignment.json').read_text());total=0
for source in json.loads(a.official.read_text()):
 session=records[source['caseId']]['sessions'][0];assert session['timingMethod']=='speech-aligned'
 assert session['audioUrl']==source['audio']['url'];assert len(session['audioSha256'])==64
 turns=session['turns'];assert len(turns)==len(source['turns']);duration=session['alignmentQuality']['duration'];previous=0
 assert turns[0]['start']<5 and duration-turns[-1]['end']<15
 for actual,expected in zip(turns,source['turns']):
  assert actual['speaker']==expected['speaker']
  assert actual['text']==' '.join(p['text'].strip() for p in expected['parts'] if p['text'].strip()),'ASR altered official wording'
  assert previous<=actual['start']<=actual['end']<=duration+.1;previous=actual['end']
  assert not re.search(r'Official - Subject to Final Review|Heritage Reporting Corporation|Sheet \d+|ORAL ARGUMENT OF|ON BEHALF OF',actual['text'])
  offset=-1;clock=actual['start']
  for at,start,end in actual['words']:
   assert offset<at<len(actual['text']) and actual['text'][at].isalnum();offset=at
   assert clock<=start<=end<=actual['end'];clock=end;total+=1
  for b in actual['blocks']:
   assert actual['start']<=b['start']<=b['end']<=actual['end']
   assert b['sourceStart']<b['sourceEnd'] and b['sourcePage']>=0
 assert 'case is submitted' in turns[-1]['text'].lower()
 print('PASS',source['caseId'],len(turns),'turns; exact official wording; bounded monotonic word timestamps')
print('Verified',total,'word timing entries')
