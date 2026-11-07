"""Offline, conservative source-based people/decision metadata from Court text.
Writes enrichment-patch.json; merge.py applies after complete.py finishes.
"""
import json,pathlib,re,hashlib,collections,os
ROOT=pathlib.Path(__file__).parent
OUT=pathlib.Path(os.environ.get('COURT_DATA_DIR',str(ROOT.parent/'dist'/'data')))
cat=json.loads((OUT/'catalog.json').read_text(encoding='utf-8'))
CANON={'Roberts':'John G. Roberts, Jr.','Thomas':'Clarence Thomas','Alito':'Samuel A. Alito, Jr.','Sotomayor':'Sonia Sotomayor','Kagan':'Elena Kagan','Gorsuch':'Neil M. Gorsuch','Kavanaugh':'Brett M. Kavanaugh','Barrett':'Amy Coney Barrett','Jackson':'Ketanji Brown Jackson'}
SUR='(?:'+'|'.join(CANON)+')'
def norm(s):return re.sub(r'\s+',' ',s).strip()
def canon(s):
 if not s:return None
 if re.search(r'chief justice',s,re.I):return CANON['Roberts']
 if re.search(r'per curiam',s,re.I):return 'Per curiam'
 for k,v in CANON.items():
  if re.search(r'\b'+k+r'\b',s,re.I):return v
 return s
def names(s):return list(dict.fromkeys(canon(m.group(0)) for m in re.finditer(SUR,s,re.I)))
def load(d):return json.loads((OUT.parent/d['textPath']).read_text(encoding='utf-8')) if d.get('textPath') else None
def slug(s):return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def advocates(c):
 ds=[d for d in c['documents'] if d['category']=='Argument' and d.get('textPath')]
 result=[]
 for d in ds:
  data=load(d)
  for pi,p in enumerate(data['pages'][:6]):
   text=p['text']
   if 'APPEARANCES:' not in text:continue
   text=text.split('APPEARANCES:',1)[1].split('Heritage Reporting Corporation')[0]
   lines=[re.sub(r'^\d{1,2}\s+','',l.strip()) for l in text.splitlines() if l.strip() and not re.fullmatch(r'\d{1,3}',l.strip())]
   chunks=[];current=''
   for line in lines:
    # Names are all caps before the first comma; the rest is title/location/role.
    if re.match(r"^(?:GEN\.\s+)?[A-Z][A-Z .’'\-]+,",line):
     if current:chunks.append(current)
     current=line
    else:current+=' '+line
   if current:chunks.append(current)
   for chunk in chunks:
    name=chunk.split(',',1)[0].strip();name=re.sub(r'^GEN\.\s+','',name)
    if not re.fullmatch(r"[A-Z][A-Z .’'\-]+",name) or len(name)<5:continue
    name=name.title()
    # Preserve standard initial rendering and normalize well-supported transcript aliases.
    name=re.sub(r'\b([A-Z])\.',lambda m:m.group(1)+'.',name)
    role=norm(chunk).split(';',1)[1].strip(' .') if ';' in chunk else 'Arguing counsel'
    role=re.sub(r'^(?:on behalf of|for)\s+','',role,flags=re.I)
    result.append({'id':slug(name),'name':name,'role':role,'sourceUrl':d['sourceUrl'],'documentId':d['id'],'pageIndex':pi,'sourceExcerpt':norm(chunk)})
 return list({a['id']:a for a in result}.values())
def amicus_name(d):
 text=d.get('description') or d['title']
 text=re.sub(r'^Brief\s+(?:amici|amicus)\s+curiae\s+(?:of|for)\s+','',text,flags=re.I)
 text=re.sub(r'^Brief\s+(?:of|for)\s+','',text,flags=re.I)
 text=re.split(r'\s+filed\b|\s+in support of\b|\s+supporting\b|\s+as amici?\b',text,flags=re.I)[0]
 text=re.sub(r'\s*\((?:Distributed|as to).*?\)\.?','',text,flags=re.I)
 text=re.sub(r'\s+VIDED\.?','',text,flags=re.I).strip(' .')
 return norm(text)
def amicus_entities(c):
 groups={};docfields={}
 for d in c['documents']:
  if d['category']!='Amicus' or d.get('auxiliary'):continue
  name=amicus_name(d)
  if not name or name.lower().startswith('motion'):continue
  key=slug(name);g=groups.setdefault(key,{'id':key,'name':name,'documentIds':[],'sourceUrl':d['sourceUrl']})
  g['documentIds'].append(d['id']);docfields[d['id']]={'amiciName':name,'amiciId':key}
 return list(groups.values()),docfields
AREAS=[
 ('First Amendment',r'first amendment|freedom of speech|free speech|free exercise|religious exercise|religious freedom|speech restriction'),
 ('Second Amendment',r'second amendment|right to (?:keep|bear)|firearms?'),
 ('Immigration & citizenship',r'immigration|citizenship|removal proceedings|asylum|alien|noncitizen|deport'),
 ('Administrative law',r'administrative procedure act|administrative law|chevron|administrative review|agency interpretation|agency discretion|rulemaking'),
 ('Separation of powers',r'president|presidential|executive power|separation of powers|removal power|appointment'),
 ('Criminal law & procedure',r'criminal|conviction|sentence|sentencing|prosecut|habeas|prison|sixth amendment|fifth amendment|fourth amendment|offenders|atkins v\.|capital punishment|death penalty'),
 ('Search & seizure',r'fourth amendment|search warrant|geofence|probable cause|search and seizure'),
 ('Civil procedure & jurisdiction',r'jurisdiction|federal rule of civil procedure|procedural rules|procedural time limit|removal to federal|removal jurisdiction|diversity|standing|article iii|res judicata'),
 ('Civil rights',r'equal protection|civil rights|discrimination|title ix|section 1983|42 u\.?s\.?c\.?[^a-z]*1983'),
 ('Elections',r'election|ballot|campaign|voting|voter|redistrict|gerrymander'),
 ('Labor & employment',r'employee|employment|pension|labor|retirement|erisa|collective bargaining'),
 ('Intellectual property',r'copyright|patent|trademark|infringement'),
 ('Securities & financial regulation',r'securities|investment company|investment adviser|disgorgement|securities and exchange'),
 ('International & foreign relations',r'foreign|tariff|international|sovereign immunity|cuba|extraterritorial'),
 ('Federalism & sovereign immunity',r'sovereign immunity|eleventh amendment|state immunity|federalism|preempt'),
 ('Arbitration',r'arbitration|federal arbitration act'),
 ('Property & taxation',r'takings clause|tax|forfeit|property rights|just compensation'),
 ('Torts & liability',r'tort|negligence|liability|personal injury|medical malpractice'),
 ('Bankruptcy',r'bankruptcy|bankrupt|creditor|debtor'),
 ('Education',r'higher education act|student loans|education act|school districts'),
]
def areas(c):
 source=c.get('question') or c.get('officialSummary') or ''
 hits=[];evidence=[]
 for label,rx in AREAS:
  m=re.search(rx,source,re.I)
  if m:hits.append(label);evidence.append({'area':label,'matchedText':m.group(0),'sourceUrl':c.get('questionSource') or c.get('summarySource')})
 return hits or ['Other federal questions'],evidence
def decision(c):
 ds=[d for d in c['documents'] if d['category']=='Decision' and d.get('textPath')]
 if not ds:return None
 d=ds[0];data=load(d);pages=data['pages'];clean=[norm(p['text']) for p in pages]
 front=' '.join(clean[:20])
 # Capture the Court's own composition paragraph from the syllabus, preserving qualifiers.
 rx=rf'\b({SUR}),\s*(?:C\.\s*)?J\.,\s*(?:delivered|announced)'
 m=re.search(rx,front,re.I)
 composition=''
 if m:
  tail=front[m.start():]
  stop=re.search(r'\b(?:Justice\s+'+SUR+r'\s+delivered|Chief Justice\s+'+SUR+r'\s+delivered|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+argued the cause|Solicitor General\s+[A-Z][a-z]+\s+argued)',tail)
  composition=tail[:stop.start() if stop else min(len(tail),3500)]
  # Last filed/joined sentence marks end; avoid introducing counsel/body into evidence.
  endings=list(re.finditer(r'(?:joined|took no part|participate|opinions?|judgment|dissenting)[^.;]{0,100}(?:\.|;)',composition,re.I))
  if endings:composition=composition[:endings[-1].end()]
  composition=norm(re.sub(r'Page Proof Pending Publication|\b\d+\s+[A-Z][A-Z .,&’\-]+\s+Syllabus',' ',composition))
 author=canon(c.get('author') or (m.group(1) if m else None))
 if not author and re.search(r'Per Curiam',front,re.I):author='Per curiam'
 # Actual beginning page, not first cover/syllabus page, for each opinion.
 main_page=0
 for i,t in enumerate(clean):
  if re.search(r'(?:Justice\s+'+SUR+r'|Chief Justice\s+'+SUR+r')\s+(?:delivered|announced)',t,re.I):main_page=i;break
  if re.search(r'\bPer Curiam\.',t) and not re.search(r'Syllabus',t[:200]):main_page=i;break
 opinions=[]
 if author:
  main={'author':author,'type':'Opinion of the Court' if author!='Per curiam' else 'Per curiam','joinedBy':[],'sourceUrl':d['sourceUrl'],'documentId':d['id'],'pageIndex':main_page}
  if composition:
   first=composition.split('fled')[0].split('filed')[0]
   joined=re.search(r'in which (.*?)\bjoined\b',first,re.I)
   if joined:main['joinedBy']=[n for n in names(joined.group(1)) if n!=author]
   main['sourceExcerpt']=composition
   if re.search(r'with respect to|except as to|in part',first,re.I):main['joiningScope']='Joins vary by part; see source composition.'
  opinions.append(main)
 seen=set()
 for i,t in enumerate(clean):
  # Require an authored opening statement, not a running header followed by body citations.
  mm=re.search(rf'(?:Chief\s+)?Justice\s+({SUR}),\s*((?:with whom.{{0,450}}?\bjoins?[^.;]{{0,150}}?[,]?\s*)?(?:concurring|dissenting)[^.]*\.)',t,re.I)
  if not mm or 'Syllabus' in t[:200]:continue
  if not re.search(r'\b'+re.escape(mm.group(1))+r',\s*(?:C\.\s*)?J\.',t[:350],re.I) and mm.start()>1200:continue
  who=canon(mm.group(1));typ=mm.group(2)
  typ=re.sub(r'^with whom.*?\bjoins?.*?(?=concurring|dissenting)','',typ,flags=re.I).strip(' ,.')
  if 'concurring' in typ.lower() and 'dissenting' in typ.lower():label='Concurring in part and dissenting in part'
  elif typ.lower().startswith('dissenting'):label='Dissent'
  elif 'judgment' in typ.lower():label='Concurrence in the judgment' if 'part' not in typ.lower() else 'Concurring in part and in the judgment'
  else:label='Concurrence'
  key=who
  if key in seen:continue
  seen.add(key)
  op={'author':who,'type':label,'joinedBy':[],'sourceUrl':d['sourceUrl'],'documentId':d['id'],'pageIndex':i}
  # Exact opening statement often spans a page break: inspect this page and next only.
  opening=mm
  if opening:
   excerpt=norm(opening.group(0));op['sourceExcerpt']=excerpt
   joins=re.search(r'with whom(.*?)\bjoins?\b',excerpt,re.I)
   if joins:op['joinedBy']=[n for n in names(joins.group(1)) if n!=who]
   if re.search(r'in part|as to|except|with respect',excerpt,re.I):op['joiningScope']='See opening statement for part-specific joins.'
  opinions.append(op)
 # Holding stays attributed to Court's official description. Syllabus Held excerpt is fallback.
 holding=c.get('officialSummary')
 if not holding:
  hm=re.search(r'\bHeld:\s*(.*?)(?:\bPp?\.|\b\(a\)|\b1\.|\bNo\.)',front)
  if hm:holding=norm(hm.group(1))[:2000]
 vote=None
 if composition:
  nonparts=set()
  for n in re.finditer(rf'({SUR}),?\s*J\.,\s*took no part',composition,re.I):nonparts.add(canon(n.group(1)))
  if re.search(r'unanimous (?:Court|opinion)',composition,re.I):vote='Unanimous'
  elif opinions and not re.search(r'in part|with respect to|except as to|plurality|in the judgment',composition,re.I):
   majority={author,*opinions[0].get('joinedBy',[])}
   dissenters=set()
   for op in opinions:
    if op['type']=='Dissent':dissenters.update([op['author'],*op['joinedBy']])
   if len(majority)>=5 and len(majority|dissenters|nonparts)==9 and not majority&dissenters:vote=f'{len(majority)}–{len(dissenters)}'
 result={'holding':holding,'sourceUrl':c.get('summarySource') if c.get('officialSummary') else d['sourceUrl'],'holdingAttribution':'Official Court opinion index' if c.get('officialSummary') else 'Court syllabus','opinions':opinions,'compositionText':composition,'compositionSourceUrl':d['sourceUrl'],'metadataMethod':'Conservative extraction from official opinion headers, opening statements, and syllabus. Part-specific joins retained as qualified source text.'}
 if vote:result['vote']=vote;result['voteSourceUrl']=d['sourceUrl']
 return result
patch={};docpatch={}
for c in cat['cases']:
 a=advocates(c);am,dp=amicus_entities(c);ars,evidence=areas(c);de=decision(c)
 result=c.get('result')
 if result:
  result=re.sub(r'(?<!\d)([12])(?=[A-Z])','',result)
  result=result.replace('—see opinion',' — see opinion')
 related=list(dict.fromkeys(c.get('relatedDockets',[])+re.findall(r'No\.\s*(\d{2}-\d+)',c.get('result') or '')))
 related=[x for x in related if x!=c['id']]
 patch[c['id']]={'author':canon(c.get('author')),'relatedDockets':related,'advocates':a,'amici':am,'areas':ars,'areaClassification':{'method':'Editorial keyword classification from the official question presented (or official opinion description when no question is available). Not a Court-assigned taxonomy.','evidence':evidence},'result':result}
 if de:patch[c['id']]['decision']=de
 docpatch.update(dp)
(OUT/'enrichment-patch.json').write_text(json.dumps({'cases':patch,'documents':docpatch},ensure_ascii=False),encoding='utf-8')
report={'cases':len(patch),'withAdvocates':sum(bool(c['advocates']) for c in patch.values()),'uniqueAdvocates':len({a['id'] for c in patch.values() for a in c['advocates']}),'withAmici':sum(bool(c['amici']) for c in patch.values()),'uniqueAmici':len({a['id'] for c in patch.values() for a in c['amici']}),'withDecision':sum(bool(c.get('decision')) for c in patch.values()),'withConfidentVote':sum(bool(c.get('decision',{}).get('vote')) for c in patch.values()),'opinionEntries':sum(len(c.get('decision',{}).get('opinions',[])) for c in patch.values())}
(OUT/'enrichment-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
for id in ['24-1287','24-440','25-365']:
 print(id,json.dumps({k:patch[id][k] for k in ['author','advocates','areas']},ensure_ascii=True));print('OPINIONS',[(o['author'],o['type'],o['pageIndex'],o.get('joinedBy')) for o in patch[id].get('decision',{}).get('opinions',[])])

