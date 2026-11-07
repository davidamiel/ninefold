import concurrent.futures as cf
import urllib.request, urllib.parse, pathlib, json, re, hashlib, datetime, time, io, logging, os
from lxml import html
from pypdf import PdfReader
logging.getLogger('pypdf').setLevel(logging.ERROR)
ROOT=pathlib.Path(__file__).resolve().parent
OUT=pathlib.Path(os.environ.get('COURT_DATA_DIR',str(ROOT.parent/'dist'/'data')))
CACHE=ROOT/'cache'
for p in [OUT/'docs',CACHE]:p.mkdir(parents=True,exist_ok=True)
BASE='https://www.supremecourt.gov'
ROSTER=BASE+'/orders/25grantednotedlist.pdf'
OPINIONS=BASE+'/opinions/slipopinion/25'
TRANSCRIPTS=BASE+'/oral_arguments/argument_transcript/2025'
AUDIO=BASE+'/oral_arguments/argument_audio/2025'
errors=[]
def norm(s):return re.sub(r'\s+',' ',s).strip().replace('\xa0',' ')
def urljoin(u):return urllib.parse.urljoin(BASE,u)
def get(url):
 key=hashlib.sha256(url.encode()).hexdigest()
 dest=CACHE/key
 if dest.exists():return dest.read_bytes()
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'SupremeCourtReaderResearch/0.1 (public source import)'})
   r=urllib.request.urlopen(req,timeout=45).read();dest.write_bytes(r);return r
  except Exception:
   if attempt==2:raise
   time.sleep(1+attempt)
def tree(url):return html.fromstring(get(url),parser=html.HTMLParser(encoding='utf-8'))
def date(s):
 for f in ['%m/%d/%y','%m/%d/%Y','%b %d %Y','%B %d, %Y']:
  try:return datetime.datetime.strptime(s.strip(),f).date().isoformat()
  except ValueError:pass
 return None
def extract(url):
 reader=PdfReader(io.BytesIO(get(url)))
 labels=reader.page_labels
 pages=[]
 for i,p in enumerate(reader.pages):
  text=p.extract_text(extraction_mode='plain') or ''
  text=text.replace('\x00','').replace('\r','')
  # Preserve paragraph and page boundaries; repair only wrapped hyphenation.
  text=re.sub(r'(?<=[a-z])-\n(?=[a-z])','',text)
  text=re.sub(r'[ \t]+\n','\n',text)
  pages.append({'number':i+1,'label':str(labels[i]) if i<len(labels) else str(i+1),'text':text.strip()})
 return pages
def doc(docket,title,url,category,typ,date_=None,**extras):
 return dict(id=docket+'-'+hashlib.sha1(url.encode()).hexdigest()[:12],caseId=docket,title=title,category=category,type=typ,date=date_,sourceUrl=url,**extras)
def docketurl(d):return BASE+'/search.aspx?filename=/docket/docketfiles/html/public/'+d.lower()+'.html'
def basic(d,name):return dict(id=d,docket=d,name=name,term='2025',argued=None,decided=None,status='Unknown',courtBelow=None,sourceUrl=docketurl(d),documents=[],relatedDockets=[])
def load_roster():
 text='\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(get(ROSTER))).pages)
 (ROOT/'roster-2025.txt').write_text(text,encoding='utf-8')
 pat=r'(?m)^(\d{2}(?:-\d+|A\d+))[^A-Z\n]*\s+(?:CFX|CFY|CSX|CSY|CFH|ATX|STAY)\s+(.+)$'
 matches=list(re.finditer(pat,text));cases={}
 for i,m in enumerate(matches):
  segment=text[m.end():matches[i+1].start() if i+1<len(matches) else len(text)]
  ownsegment=segment
  consolidated=[]
  j=i+1
  while 'Court:' not in segment and j<len(matches):
   consolidated.append(matches[j].group(1));segment+=text[matches[j].end():matches[j+1].start() if j+1<len(matches) else len(text)];j+=1
  continuation=ownsegment.split('Court:')[0] if 'Court:' in ownsegment else ''
  name=norm(m.group(2)+' '+continuation).title().replace(' V. ',' v. ').replace('Usa','USA').replace('Llc','LLC').replace('Fcc','FCC').replace('Sec','SEC').replace('Nj ','NJ ').replace('At&T','AT&T')
  c=basic(m.group(1),name);c['rosterSource']=ROSTER;c['collection']='Cases for argument';c['relatedDockets']=consolidated
  for key,regex in [('argued',r'(?:Argument Date|Reargument Date):\s*(\d+/\d+/\d+)'),('decided',r'Decided:\s*(\d+/\d+/\d+)'),('granted',r'(?:Granted|Noted):\s*(\d+/\d+/\d+)')]:
   found=re.findall(regex,segment);c[key]=date(found[-1]) if found else None
  mm=re.search(r'Court:\s*(.*?)\s+(?:Granted|Noted):',segment,re.S)
  c['courtBelow']=norm(mm.group(1)) if mm else None
  mm=re.search(r'Author:\s*(.*?)(?:Other:|Result:|\n\s*\n)',segment,re.S)
  c['author']=norm(mm.group(1)).replace('J. ','') if mm else None
  mm=re.search(r'Result:\s*(.*?)(?:\n\s*\n|$)',segment,re.S)
  c['result']=norm(mm.group(1)) if mm else None
  if c['decided']:c['status']='Decided'
  elif 'CASE DISMISSED' in segment:c['status']='Dismissed';c['decided']='2025-08-11';c['argued']=None;c['result']='Dismissed pursuant to Rule 46.1 before the term began'
  elif c['argued']:c['status']='Argued'
  cases[c['id']]=c
 for c in cases.values():
  for rd in c['relatedDockets']:
   if rd in cases:cases[rd]['relatedDockets'].append(c['id'])
 return cases
def add_indexes(cases):
 opinions=tree(OPINIONS)
 for tr in opinions.xpath('//tr'):
  tds=tr.xpath('./td')
  if len(tds)<6:continue
  a=tds[3].xpath('.//a[contains(@href,"pdf")]')
  if not a:continue
  d=norm(tds[2].text_content()); name=norm(a[0].text_content())
  if not re.fullmatch(r'\d{2}(?:-\d+|A\d+)',d):continue
  if d not in cases:cases[d]=basic(d,name);cases[d]['collection']='Other opinions of the Court'
  c=cases[d];c['name']=name;c['decided']=date(norm(tds[1].text_content()));c['status']='Decided';c['citation']=norm(tds[5].text_content());c['authorAbbreviation']=norm(tds[4].text_content())
  # Official index provides short disposition descriptions, attributed verbatim.
  if a[0].get('title'):c['officialSummary']=norm(a[0].get('title'));c['summarySource']=OPINIONS
  c['documents'].append(doc(d,'Opinion of the Court',urljoin(a[0].get('href')),'Decision','Opinion',c['decided']))
 trans=tree(TRANSCRIPTS)
 for tr in trans.xpath('//tr'):
  tds=tr.xpath('./td')
  if len(tds)!=2:continue
  a=tds[0].xpath('.//a[contains(@href,"pdf")]')
  if not a:continue
  d=norm(a[0].text_content());spans=tds[0].xpath('./span');name=norm(spans[-1].text_content()) if spans else d
  if d not in cases:cases[d]=basic(d,name);cases[d]['collection']='Cases for argument'
  c=cases[d]
  if len(name)>len(d) and not c.get('citation'):c['name']=name
  c['argued']=date(norm(tds[1].text_content()))
  # Relative source URL is based on /oral_arguments/argument_transcript/, not BASE.
  source=urllib.parse.urljoin(TRANSCRIPTS,a[0].get('href'))
  c['documents'].append(doc(d,'Oral argument transcript',source,'Argument','Transcript',c['argued']))
 audio=tree(AUDIO)
 for a in audio.xpath('//a[contains(@href,"../audio/2025/")]'):
  d=norm(a.text_content())
  if d in cases:cases[d]['audio']={'sourceUrl':urllib.parse.urljoin(AUDIO,a.get('href'))}
 return cases
def classify(desc,label,date_,granted):
 lo=(desc+' '+label).lower()
 if label.lower() in ['proof of service','certificate of word count','certificate of compliance','certificate'] or ('certificate' in label.lower()):return 'Other','Certificate',True
 if 'appendix' in label.lower() or label.lower()=='appendices':return ('Merits' if 'joint appendix' in desc.lower() else 'Lower courts'),'Appendix',False
 if 'amicus' in lo or 'amici' in lo:return 'Amicus','Amicus brief',False
 if 'questions presented' in lo:return 'Certiorari','Questions presented',False
 if 'petition for' in lo and not any(x in lo for x in ['rehearing','motion','response','reply']):return 'Certiorari','Petition',False
 if 'brief' in lo or lo.startswith('reply'):
  if 'opposition' in lo or (date_ and granted and date_<granted):return 'Certiorari','Brief',False
  return 'Merits','Brief',False
 if 'opinion' in lo and 'lower' in lo:return 'Lower courts','Opinion',False
 return 'Other','Filing',False
def titleof(desc,label,typ):
 if typ=='Appendix':return label if label.lower()!='main document' else 'Appendix'
 if label not in ['Main Document','Petition','Other']:return label+' — '+desc[:180]
 s=re.sub(r'\s*\((?:Distributed|Response due).*?\)\.?','',desc,flags=re.I)
 s=re.sub(r'\s+(?:filed\.?|VIDED\.?|\(Distributed\))\s*',' ',s,flags=re.I).strip(' .')
 return s or label
def enrich(c):
 try:
  t=tree(c['sourceUrl'])
  for tr in t.xpath('//tr'):
   tds=tr.xpath('./td')
   if len(tds)<2:continue
   if norm(tds[0].text_content())=='Lower Ct:':c['courtBelow']=norm(tds[1].text_content())
  texts=norm(t.text_content())
  # Prefer official docket caption when short index name is unavailable.
  mm=re.search(r'Title:\s*(.*?)\s+Docketed:',texts)
  if mm:c['fullName']=mm.group(1)
  for a in t.xpath('//a[contains(@href,"/qp/")]'):
   url=urllib.parse.urljoin(c['sourceUrl'],a.get('href'));c['documents'].append(doc(c['id'],'Questions presented',url,'Certiorari','Questions presented'))
  rows=t.xpath('//tr[td[contains(@class,"ProceedingDate")]]')
  proceedings=[]
  for row in rows:
   tds=row.xpath('./td');dt=date(norm(tds[0].text_content()));desc=norm(' '.join(tds[1].xpath('./text()')))
   if not desc:desc=norm(tds[1].text_content()).split('Main Document')[0]
   proceedings.append({'date':dt,'description':desc})
   for a in tds[1].xpath('.//a[@href]'):
    url=urllib.parse.urljoin(c['sourceUrl'],a.get('href'));label=norm(a.text_content())
    if '.pdf' not in url.lower():continue
    category,typ,aux=classify(desc,label,dt,c.get('granted'))
    if any(d['sourceUrl']==url for d in c['documents']):continue
    c['documents'].append(doc(c['id'],titleof(desc,label,typ),url,category,typ,dt,description=desc,linkLabel=label,auxiliary=aux,stage='Certiorari' if dt and c.get('granted') and dt<c['granted'] else 'Merits'))
  c['proceedings']=proceedings
  if c.get('audio'):
   at=tree(c['audio']['sourceUrl'])
   mp3=at.xpath('//source/@src')+at.xpath('//a[contains(@href,".mp3")]/@href')
   if not mp3:mp3=re.findall(r'["\x27]([^"\x27]+\.mp3(?:\?[^"\x27]*)?)["\x27]',get(c['audio']['sourceUrl']).decode('utf-8','replace'))
   if mp3:c['audio']['url']=urllib.parse.urljoin(c['audio']['sourceUrl'],mp3[0])
  c['docketImported']=True
 except Exception as e:
  c['docketImported']=False;c['importError']=str(e);errors.append({'case':c['id'],'phase':'docket','error':str(e)})
 return c
def coverage(cases):
 ds=[d for c in cases.values() for d in c['documents']]
 return {'caseCount':len(cases),'argumentRosterCount':sum(c['collection']=='Cases for argument' for c in cases.values()),'additionalOpinionCases':sum(c['collection']=='Other opinions of the Court' for c in cases.values()),'docketsImported':sum(c.get('docketImported',False) for c in cases.values()),'documents':len(ds),'substantiveDocuments':sum(not d.get('auxiliary') for d in ds),'readableDocuments':sum(bool(d.get('textPath')) for d in ds),'readablePages':sum(d.get('pageCount',0) for d in ds if d.get('textPath')),'casesWithReadableDocuments':sum(any(d.get('textPath') for d in c['documents']) for c in cases.values()),'audioRecordings':sum(bool(c.get('audio',{}).get('url')) for c in cases.values()),'scope':'Union of the official October Term 2025 granted/noted list and Opinions of the Court index; consolidated docket numbers are separate records. Includes one roster matter dismissed before term and non-argued opinions. Does not include every certiorari denial, docket entry, or order issued by the Court.','extractionStatus':'In progress'}
def write(cases,status='In progress'):
 cov=coverage(cases);cov['extractionStatus']=status
 catalog={'term':'2025','label':'October Term 2025','importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coverage':cov,'sources':[{'title':'Granted & Noted List — October Term 2025','url':ROSTER},{'title':'Opinions of the Court — 2025','url':OPINIONS},{'title':'Argument transcripts — 2025','url':TRANSCRIPTS},{'title':'Argument audio — 2025','url':AUDIO}],'cases':sorted(cases.values(),key=lambda c:c['name'])}
 tmp=OUT/'catalog.tmp';tmp.write_text(json.dumps(catalog,ensure_ascii=False),encoding='utf-8');tmp.replace(OUT/'catalog.json')
 (ROOT/'coverage.json').write_text(json.dumps({'coverage':cov,'errors':errors},indent=2,ensure_ascii=False),encoding='utf-8')
def extraction_task(d):
 try:
  target=OUT/'docs'/(d['id']+'.json')
  if target.exists():data=json.loads(target.read_text(encoding='utf-8'));pages=data['pages']
  else:
   pages=extract(d['sourceUrl']);sparse=[p['number'] for p in pages if len(p['text'])<50]
   data={'id':d['id'],'title':d['title'],'sourceUrl':d['sourceUrl'],'pages':pages,'extraction':{'method':'pypdf text extraction','reviewed':False,'sparsePages':sparse,'note':'Page boundaries and source text preserved. Extracted reading text may contain line-wrap, header, footnote, or encoding artifacts; original PDF is authoritative.'}}
   target.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
  d['textPath']='data/docs/'+d['id']+'.json';d['pageCount']=len(pages);d['extractionStatus']='Extracted';d['characterCount']=sum(len(p['text']) for p in pages)
  if d['characterCount']<100:d['extractionStatus']='Sparse text'
 except Exception as e:d['extractionStatus']='Source only';errors.append({'document':d['id'],'phase':'extract','error':str(e)})
 return d
def main():
 cases=add_indexes(load_roster());print('ROSTER',len(cases),flush=True);write(cases)
 with cf.ThreadPoolExecutor(max_workers=5) as ex:
  for i,c in enumerate(ex.map(enrich,cases.values())):
   if i%10==0:print('DOCKETS',i+1,flush=True);write(cases)
 # Share indexed opinion/transcript across related consolidated docket numbers, retaining owning document ids.
 for c in cases.values():
  for rd in c['relatedDockets']:
   if rd not in cases:continue
   other=cases[rd]
   for d in other['documents']:
    if d['category'] in ['Decision','Argument'] and not any(x['sourceUrl']==d['sourceUrl'] for x in c['documents']):c['documents'].append({**d,'sharedFrom':rd})
   if not c.get('audio') and other.get('audio'):c['audio']=other['audio']
 write(cases);print('METADATA',json.dumps(coverage(cases)),flush=True)
 # Prioritize every opinion/transcript, party merits briefs, petitions and appendix samples.
 rich={'24-1287','25-332','25-365','24-539','24-43','24-38'}
 priority=[]
 for c in cases.values():
  for d in c['documents']:
   if d.get('auxiliary'):continue
   score=None
   if d['category']=='Decision':score=1
   elif d['category']=='Argument':score=2
   elif d['type']=='Questions presented':score=0
   elif d['category']=='Merits' and d['type']=='Brief':score=3
   elif d['type']=='Appendix' and c['id'] in rich:score=4
   elif d['type']=='Petition':score=5
   elif d['category']=='Amicus' and c['id'] in rich:score=6
   elif d['type']=='Appendix':score=7
   if score is not None:priority.append((score,d))
 unique={}
 for score,d in sorted(priority,key=lambda x:x[0]):unique.setdefault(d['id'],d)
 print('EXTRACTING',len(unique),flush=True)
 with cf.ThreadPoolExecutor(max_workers=4) as ex:
  for i,d in enumerate(ex.map(extraction_task,unique.values())):
   # Populate official question excerpts from dedicated question PDF, not generated commentary.
   if d['type']=='Questions presented' and d.get('textPath'):
    data=json.loads((OUT.parent/d['textPath']).read_text(encoding='utf-8'))
    txt='\n'.join(p['text'] for p in data['pages'])
    if d['caseId'] in cases:cases[d['caseId']]['question']=txt;cases[d['caseId']]['questionSource']=d['sourceUrl']
   if i%10==0:write(cases);print('EXTRACTED',i+1,'/',len(unique),flush=True)
 # Copy extraction metadata to shared references.
 for c in cases.values():
  for d in c['documents']:
   if d['id'] in unique:d.update({k:v for k,v in unique[d['id']].items() if k in ['textPath','pageCount','extractionStatus','characterCount']})
 write(cases,'Complete for selected documents');print('DONE',json.dumps(coverage(cases)),flush=True)
if __name__=='__main__':main()


