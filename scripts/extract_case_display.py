import pathlib,json,re
ROOT=pathlib.Path(__file__).resolve().parent;DIST=ROOT.parent/'dist'
cat=json.loads((DIST/'data/catalog.json').read_text(encoding='utf-8'));byid={c['id']:c for c in cat['cases']}
def clean(s):
 s=re.sub(r'(?<=[a-z])-\s*\n\s*(?=[a-z])','',s)
 return re.sub(r'\s+',' ',s).strip()
HEAD=re.compile(r'(?im)^\s*(?:(?:COUNTERSTATEMENT|STATEMENT)\s+OF\s+(?:THE\s+)?)?QUESTIONS?\s+(?:PRESENTED|FOR\s+REVIEW)\s*:?[ \t]*$')
STOP=re.compile(r'(?m)^\s*(?:(?:PARTIES|PARTY)\s+TO\s+THE\s+PROCEEDINGS?|DISCLOSURE\s+STATEMENT|CORPORATE\s+DISCLOSURE|RULE\s+29\.6|TABLE\s+OF\s+(?:CONTENTS|AUTHORITIES)|(?:ADDITIONAL\s+)?RELATED\s+(?:CASES|PROCEEDINGS?)|IN\s+THE\s+SUPREME\s+COURT|OPINIONS?\s+BELOW|JURISDICTION|CONSTITUTIONAL\s+AND\s+STATUTORY|STATEMENT\s+OF\s+(?:THE\s+)?CASE|INTRODUCTION|STATEMENT|LIST\s+OF\s+PARTIES|PARTIES\s+AND\s+RELATED)[^\n]*$')
def extract(d):
 if not d.get('textPath'):return None
 data=json.loads((DIST/d['textPath']).read_text(encoding='utf-8'));pages=data['pages']
 for pi,p in enumerate(pages[:12]):
  text=p['text'];m=HEAD.search(text)
  if not m or m.start()>300:continue
  tail=text[m.end():]
  if re.search(r'\.{4}|\u2026{2}',tail[:180]):continue
  chunks=[tail];ended=False
  for more in pages[pi+1:pi+4]:
   if STOP.search('\n'.join(chunks)):ended=True;break
   chunks.append(more['text'])
  combined='\n'.join(chunks);end=STOP.search(combined)
  if not end:continue
  combined=combined[:end.start()]
  combined=re.sub(r'(?im)^\s*[-–—(]?\s*[ivxlcdm]{1,8}\s*[-–—)]?\s*$','',combined)
  combined=re.sub(r'(?im)^\s*\d{1,3}\s*$','',combined)
  body=clean(combined)
  if 70<len(body)<5500 and not re.search(r'\.{4}|TABLE OF CONTENTS',body):return {'text':body,'sourcePageIndex':pi,'documentId':d['id'],'sourceUrl':d['sourceUrl'],'sourceTitle':d['title']}
 return None
out={};counts={}
for c in cat['cases']:
 emergency=bool(re.fullmatch(r'\d{2}A\d+',c['id'],re.I));original='Orig' in c['id'] or 'Orig' in c.get('docket','')
 result=(c.get('result') or '').strip();holding=c.get('decision',{}).get('holding') or c.get('officialSummary') or ''
 record={'docketType':'application' if emergency else 'original' if original else 'merits','questions':[]}
 citation=c.get('citation');shared=c.get('sharedDecisionFrom')
 if not citation and shared:citation=byid.get(shared,{}).get('citation')
 record['reporterCitation']=citation if citation and re.fullmatch(r'\d+\s+U\.?\s*S\.?\s+\d+',citation) else None
 if citation and not record['reporterCitation']:record['publicationMarker']=citation
 if record['reporterCitation']:record['citationSourceUrl']=c.get('summarySource') or byid.get(shared,{}).get('summarySource')
 if result:
  record['outcomeLabel']=result.title().replace(' And ',' and ')
  if result=='AFFIRMED':record['outcomeDetail']='The lower-court judgment was affirmed.'
  elif result=='REVERSED AND REMANDED':record['outcomeDetail']='The lower-court judgment was reversed and the case returned for further proceedings.'
  elif result=='VACATED AND REMANDED':record['outcomeDetail']='The lower-court judgment was set aside and the case returned for further proceedings.'
 elif emergency:
  if re.search(r'(?:applications?[^.]{0,400}(?:are|is) granted|grants[^.]{0,140}application)',holding,re.I):record['outcomeLabel']='Stay granted' if re.search(r'grant[^.]{0,130}application.{0,20}stay|application.{0,30}for (?:a )?stay',holding,re.I) else 'Application granted'
  elif re.search(r'application[^.]{0,450}is denied',holding,re.I):record['outcomeLabel']='Stay denied' if 'stay' in holding.lower() else 'Application denied'
  elif re.search(r'\bstayed\b',holding):record['outcomeLabel']='Stay granted'
  elif c.get('decided'):record['outcomeLabel']='Application resolved'
  else:record['outcomeLabel']='Application pending'
 else:record['outcomeLabel']='Decided' if c.get('decided') else 'Argued' if c.get('argued') else 'Granted' if c.get('granted') else 'Pending'
 record['outcomeSourceUrl']=c.get('sourceUrl') if result else c.get('summarySource')
 if emergency:
  record['requestedRelief']=next((p['description'] for p in c.get('proceedings',[]) if re.search(r'^Application.*submitted',p['description'],re.I)),None)
  record['outcomeDetail']=holding
  if c['id']=='26A308':record['outcomeLabel']='Stay granted';record['beneficiaryText']='Interim relief granted to the Government.'
  if c['id']=='25A312':record['outcomeLabel']='Stay denied';record['beneficiaryText']='The Government’s request for interim relief was denied.'
  if c['id']=='25A810':record['outcomeLabel']='Application granted in part';record['beneficiaryText']='Interim relief granted to the parent applicants.'
  if c['id']=='26A124':record['outcomeLabel']='Stay granted';record['beneficiaryText']='Interim relief granted to the Government in No. 26A124.'
 else:
  candidates=[]
  for d in c['documents']:
   if d.get('auxiliary') or d.get('category') not in ['Merits','Certiorari'] or d.get('type')=='Questions presented' or re.search(r'\breply\b',d['title'],re.I):continue
   title=d['title'];role='respondent' if re.search(r'\brespondent|opposition',title,re.I) else 'petitioner' if re.search(r'\bpetitioner|petition for',title,re.I) else None
   if not role:continue
   q=extract(d)
   if not q:continue
   label=re.sub(r'^Brief (?:of|for) (?:the )?(?:petitioners?|respondents?)\s*','',title,flags=re.I)
   label=re.sub(r'\s+(?:in opposition|filed)\.?$','',label,flags=re.I)
   q.update({'partyRole':role,'partyName':label if label!=title else role.title(),'label':role.title(),'stage':'Merits' if d['category']=='Merits' else 'Certiorari'})
   candidates.append(q)
  # Prefer merits-stage formulations; retain separate named respondents within that stage.
  for role in ['petitioner','respondent']:
   qs=[q for q in candidates if q['partyRole']==role];merits=[q for q in qs if q['stage']=='Merits'];qs=merits or qs
   seen=set()
   for q in qs:
    if q['text'] not in seen:record['questions'].append(q);seen.add(q['text'])
  if not record['questions'] and c.get('question'):
   record['questions']=[{'partyRole':'court','partyName':'Court publication','label':'Questions Presented','text':c['question'],'sourceUrl':c.get('questionSource'),'documentId':next((d['id'] for d in c['documents'] if d.get('type')=='Questions presented'),None),'stage':'Court publication'}]
 out[c['id']]=record
# Preserve reviewed, docket-specific outcome roles across source re-imports.
reviewed_path=DIST/'data/case-outcomes.json'
if reviewed_path.exists():
 for case_id,fields in json.loads(reviewed_path.read_text(encoding='utf-8')).items():
  if case_id in out:out[case_id].update(fields)
(DIST/'data/case-display.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print('Cases',len(out),'party questions',sum(len(v['questions']) for v in out.values()),'both sides',sum({'petitioner','respondent'}<=set(q['partyRole'] for q in v['questions']) for v in out.values()))
print('Applications',[k for k,v in out.items() if v['docketType']=='application'])
