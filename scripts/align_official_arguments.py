"""Align official speech text to word timestamps from the exact Court recording.
Never replace filed wording with ASR. Keep recognition cache outside deployment.
Reject records with poor coverage; retain per-block confidence and source spans.
"""
import argparse,hashlib,json,re,bisect
from pathlib import Path
from rapidfuzz.distance import Levenshtein
TOKEN=re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)?")
def tokens(text):
 return [(m.group().lower().replace('’','').replace("'",''),m.start(),m.end()) for m in TOKEN.finditer(text)]
def align(case,recognized):
 turns=[];official=[];ranges=[]
 for t in case['turns']:
  blocks=[]
  for part in t['parts']:
   text=part['text'].strip()
   if not text:continue
   block={'text':text,'sourcePage':part['page'],'sourceStart':part['map'][0],'sourceEnd':part['map'][-1]+1}
   start=len(official);official.extend(x[0] for x in tokens(text));ranges.append((start,len(official),block));blocks.append(block)
  if blocks:turns.append({'speaker':t['speaker'],'text':' '.join(b['text'] for b in blocks),'blocks':blocks})
 heard=[];word_times=[]
 for word in recognized['words']:
  for token,_,_ in tokens(word['word']):
   heard.append(token);word_times.append((word['start'],word['end']))
 matches={}
 for op in Levenshtein.opcodes(official,heard):
  if op.tag=='equal':
   for offset in range(op.src_end-op.src_start):matches[op.src_start+offset]=word_times[op.dest_start+offset]
 anchors=sorted(matches);coverage=len(matches)/len(official)
 if coverage<.84:raise ValueError(f"{case['caseId']}: insufficient word coverage {coverage:.3f}")
 def time_at(i,end=False):
  if i in matches:return matches[i][1 if end else 0]
  pos=bisect.bisect_left(anchors,i);left=anchors[pos-1] if pos else None;right=anchors[pos] if pos<len(anchors) else None
  if left is None:return max(0,matches[right][0]-(right-i)*.22)
  if right is None:return min(recognized['duration'],matches[left][1]+(i-left)*.22)
  lo,hi=matches[left][1],matches[right][0]
  return lo+(hi-lo)*(i-left-(0 if end else 1))/(right-left)
 gaps=[]
 for left,right in zip(anchors,anchors[1:]):
  if right-left>1:gaps.append({'words':right-left-1,'seconds':round(matches[right][0]-matches[left][1],2),'atWord':left,'audioStart':round(matches[left][1],2),'audioEnd':round(matches[right][0],2),'text':' '.join(official[left:right+1])})
 previous=0
 for start,end,block in ranges:
  mapped=[i for i in range(start,end) if i in matches];ratio=len(mapped)/max(1,end-start)
  block['start']=round(max(previous,time_at(start)),2)
  block['end']=round(max(block['start'],time_at(end-1,True)),2)
  block['alignmentConfidence']=round(ratio,3)
  previous=block['end']
 word_index=0
 for t in turns:
  t['start']=t['blocks'][0]['start'];t['end']=t['blocks'][-1]['end'];t['words']=[]
  last=t['start']
  for _,offset,_ in tokens(t['text']):
   start=round(max(last,min(t['end'],time_at(word_index))),2);end=round(max(start,min(t['end'],time_at(word_index,True))),2)
   t['words'].append([offset,start,end]);last=end;word_index+=1
 # Long gaps indicate omitted source or recognition failure, not usable alignment.
 long_gaps=[g for g in gaps if g['words']>18 and g['seconds']>8]
 if long_gaps:raise ValueError(f"{case['caseId']}: unaligned passages: {long_gaps[:4]}")
 report={'docket':case['caseId'],'words':len(official),'matchedWords':len(matches),'coverage':round(coverage,4),'turns':len(turns),'blocks':len(ranges),'duration':recognized['duration'],'largestGaps':sorted(gaps,key=lambda x:x['seconds'],reverse=True)[:8],'lowConfidenceBlocks':sum(b['alignmentConfidence']<.6 for _,_,b in ranges)}
 return turns,report

def main():
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--publish-data',action='store_true');a=p.parse_args();repo=Path(__file__).resolve().parents[1]
 records=json.loads((repo/'dist/data/argument-alignment.json').read_text());reports=[]
 for case in json.loads((a.work/'official-turns.json').read_text()):
  source=a.work/(case['caseId']+'-recognized.json')
  if not source.exists():continue
  recognized=json.loads(source.read_text());audio_hash=hashlib.sha256((a.work/(case['caseId']+'.mp3')).read_bytes()).hexdigest()
  if recognized.get('audioSha256')!=audio_hash:raise ValueError('Recognition cache does not match recording: '+case['caseId'])
  turns,report=align(case,recognized);reports.append(report);print(json.dumps(report),flush=True)
  session={'id':'official-'+case['caseId'],'title':'Oral Argument','audioUrl':case['audio']['url'],'sourceUrl':case['audio']['sourceUrl'],'turns':turns,'timingMethod':'speech-aligned','alignmentModel':'faster-whisper/'+recognized['model'],'audioSha256':audio_hash,'refinedSpans':recognized.get('refinedSpans',[]),'alignmentQuality':{k:v for k,v in report.items() if k!='largestGaps'}}
  records[case['caseId']]={'caseSourceUrl':case['audio']['sourceUrl'],'attribution':'Official Supreme Court transcript and recording; machine-aligned timing','attributionUrl':case['sourceUrl'],'timingMethod':'speech-aligned','adaptationNote':'Filed wording and speaker labels preserved. Word-level speech recognition supplies timing anchors; short unmatched spans are interpolated between audio anchors. Timing is approximate.','sessions':[session]}
 (a.work/'alignment-report.json').write_text(json.dumps(reports,indent=2))
 if a.publish_data:
  if len(reports)!=len(json.loads((a.work/'official-turns.json').read_text())):raise ValueError('All requested recordings must pass before publication')
  (repo/'dist/data/argument-alignment.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')))
  (repo/'dist/data/official-alignment-report.json').write_text(json.dumps(reports,indent=2))
if __name__=='__main__':main()
