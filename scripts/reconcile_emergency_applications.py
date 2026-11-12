"""Reconcile a saved official-docket scan with Ninefold's application collection.
The scan records checked IDs, HTTP failures, and dated proceedings; the audit is
bounded evidence, not a claim that the Court publishes a complete live index.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
from datetime import datetime,timezone
from bs4 import BeautifulSoup
from pypdf import PdfReader
import json,re,hashlib,subprocess,io
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'dist/data';CACHE=Path('/tmp/ninefold-orders-audit');BASE='https://www.supremecourt.gov';START='2026-10-05'
def load(n):return json.loads((DATA/(n+'.json')).read_text())
term=load('current-term');catalog=load('catalog');orders=load('court-orders');current={c['id']:c for c in term['cases']};old={c['id']:c for c in catalog['cases']};known={**old,**current};scan=json.loads((CACHE/'scan.json').read_text());checks=[];new=[];updated=[];pending=[];failures=[];jobs=[]
existing={d['sourceUrl']:d for c in known.values() for d in c.get('documents',[]) if d.get('sourceUrl') and (d.get('textPath') or d.get('pdfPath'))}
def norm(s):return ' '.join(s.split())
from application_status import final_state
for row in scan:
 if row['status']!='found' or not row.get('substantive'):continue
 cid=row['id'];s=BeautifulSoup((CACHE/'dockets'/(cid+'.html')).read_bytes(),'html.parser');info={}
 for tr in s.select('#docketinfo tr'):
  td=tr.select('td')
  if len(td)==2:info[td[0].get_text(' ',strip=True).rstrip(':')]=norm(td[1].get_text(' ',strip=True))
 procs=[]
 for tbl in s.select('table.ProceedingItem'):
  td=tbl.select('td');date=datetime.strptime(td[0].get_text(' ',strip=True),'%b %d %Y').date().isoformat();links=[{'label':a.get_text(' ',strip=True),'url':urljoin(BASE,a['href'])} for a in td[1].select('a[href]')];block=td[1].select_one('.documentlinks')
  if block:block.extract()
  procs.append({'date':date,'description':norm(td[1].get_text(' ',strip=True)),'links':links})
 # A posted individual order may precede its entry on the docket page.
 for order in orders['documents']:
  appids=[d for d in order['dockets'] if 'A' in d]
  if appids!=[cid] or order['kind']!='Miscellaneous Order' or order['date']<procs[-1]['date']:continue
  match=re.search(r'\bThe application[\s\S]+',order['searchText'])
  if match and not any(p['description']==match[0] for p in procs):procs.append({'date':order['date'],'description':match[0],'links':[{'label':'Order','url':order['sourceUrl']}],'sourceUrl':order['sourceUrl']})
 status,result,decided=final_state(procs)
 if not any(p['date']>=START for p in procs) and status!='Pending' and cid not in current:continue
 caption=info.get('Title') or (s.select_one('.title').get_text(' ',strip=True) if s.select_one('.title') else None)
 if not caption:raise ValueError('No official caption for '+cid)
 name=re.sub(r',?\s*(?:Applicants?|Petitioners?|Respondents?)(?=\s+v\.|$)','',caption,flags=re.I)
 fresh=cid not in known
 c=known.get(cid,{'id':cid,'docket':cid,'name':name,'fullName':caption,'term':2026,'collection':'Emergency applications','documents':[],'advocates':[],'amici':[],'areas':[],'relatedDockets':re.findall(r'\d{2}-\d+',info.get('Linked with',''))})
 c['sourceUrl']=f'{BASE}/search.aspx?filename=/docket/docketfiles/html/public/{cid.lower()}.html';c['courtBelow']=info.get('Lower Ct',c.get('courtBelow'));c['proceedings']=procs;c['applicationFiled']=procs[0]['date'];c['docketCheckedAt']=datetime.now(timezone.utc).isoformat()
 update={'status':status,'result':result,'decided':decided}
 if cid in old and cid not in current:
  c.setdefault('priorTermOrders',{})['2026']={**c.get('priorTermOrders',{}).get('2026',{}),**update}
 else:c.update(update);current[cid]=c
 if fresh:new.append(cid)
 else:updated.append(cid)
 if status=='Pending':pending.append(cid)
 checks.append({'id':cid,'status':status,'lastActivity':procs[-1]['date'],'sourceUrl':c['sourceUrl']})
 seen={d.get('sourceUrl') for d in c['documents']}
 for proc in procs:
  for link in proc['links']:
   url=link['url'];label=link['label'];desc=proc['description']
   if not re.search(r'\.pdf(?:$|\?)',url,re.I) or url in seen:continue
   if re.search(r'proof of service|certificate(?: of|$)|word count',label,re.I):continue
   seen.add(url);cat='Merits';typ='Filing';title=re.sub(r'\s+filed\.?$','',desc)
   if '/orders/' in url or '/opinions/' in url:cat='Decision';typ='Order';title='Order of the Court'
   elif re.search(r'appendix|appendices|appx',label+' '+url,re.I):cat='Appendices';typ='Appendix';title='Appendix to the Application' if desc.lower().startswith('application') else 'Appendix'
   elif re.search(r'amicus|amici',desc,re.I):cat='Amicus';typ='Amicus brief'
   elif desc.lower().startswith('application'):typ='Application';title=re.sub(r'^Application\s*\([^)]*\)\s*','Application ',desc);title=re.split(r',?\s+submitted to',title,flags=re.I)[0].rstrip('.')
   elif desc.lower().startswith('response'):typ='Response';title='Response to the Application'
   elif desc.lower().startswith('reply'):typ='Reply';title='Reply in Support of the Application'
   else:cat='Other'
   d={'id':cid+'-'+hashlib.sha1(url.encode()).hexdigest()[:12],'caseId':cid,'title':title,'category':cat,'type':typ,'date':proc['date'],'sourceUrl':url,'description':desc,'linkLabel':label}
   jobs.append((c,d))
 # Link complete published order documents that mention this docket, without inventing excerpts.
 for order in orders['documents']:
  if cid not in order['dockets'] or order['sourceUrl'] in seen:continue
  seen.add(order['sourceUrl']);d={k:v for k,v in order.items() if k not in ['searchText','dockets','sourceIndex','circuitSourceUrl','kind','term']};d.update(id=cid+'-'+hashlib.sha1(order['sourceUrl'].encode()).hexdigest()[:12],caseId=cid,category='Decision',title=order['kind']+' · '+order['date'],type='Order');c['documents'].append(d)
def extract(job):
 c,d=job;url=d['sourceUrl']
 if url in existing:
  for k in ['textPath','pdfPath','sourceSha256','pageCount','characterCount','scanOnly','pdfPreferred','extractionStatus']: 
   if k in existing[url]:d[k]=existing[url][k]
  return c,d,None
 path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.pdf')
 try:
  if not path.exists():subprocess.run(['curl','-fLsS','--retry','2','--max-time','45',url,'-o',str(path)],check=True,capture_output=True)
  raw=path.read_bytes();reader=PdfReader(io.BytesIO(raw));pages=[{'number':i+1,'label':str(reader.page_labels[i]),'text':(p.extract_text() or '').replace('\x00','').strip()} for i,p in enumerate(reader.pages)];chars=sum(len(p['text']) for p in pages)
  pdf='data/pdfs/'+d['id']+'.pdf';(ROOT/'dist'/pdf).write_bytes(raw);d.update(pdfPath=pdf,sourceSha256=hashlib.sha256(raw).hexdigest(),pageCount=len(pages),characterCount=chars)
  if chars<80:d.update(scanOnly=True,pdfPreferred=True,extractionStatus='Scan-only PDF')
  else:
   text='data/current-docs/'+d['id']+'.json';(ROOT/'dist'/text).write_text(json.dumps({'id':d['id'],'title':d['title'],'sourceUrl':url,'pages':pages},ensure_ascii=False)+'\n');d.update(textPath=text,extractionStatus='Extracted')
  return c,d,None
 except Exception as e:return c,d,str(e)
with ThreadPoolExecutor(max_workers=4) as pool:
 for c,d,error in pool.map(extract,jobs):
  if error:
   failures.append({'caseId':c['id'],'sourceUrl':d['sourceUrl'],'title':d['title'],'error':error});c['unavailableFilings']=[f for f in c.get('unavailableFilings',[]) if f.get('sourceUrl')!=d['sourceUrl']];c.setdefault('unavailableFilings',[]).append({'title':d['title'],'category':d['category'],'date':d['date'],'sourceUrl':d['sourceUrl'],'availability':'Public link could not be retrieved during reconciliation'})
  else:
   c['documents'].append(d);c['unavailableFilings']=[f for f in c.get('unavailableFilings',[]) if f.get('sourceUrl')!=d['sourceUrl']]
term['cases']=list(current.values());term['updatedAt']=datetime.now(timezone.utc).isoformat()
from refresh_collection_coverage import refresh
refresh(term);refresh(catalog)
for name,data in [('current-term',term),('catalog',catalog)]: (DATA/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
audit={'checkedAt':datetime.now(timezone.utc).isoformat(),'term':2026,'termStart':START,'scanRanges':['26A1–26A750','25A1–25A1650'],'checkedIds':len(scan),'foundDockets':sum(r['status']=='found' for r in scan),'unresolvedDockets':[r for r in scan if r['status'] not in ['found','not-found']],'included':checks,'newDockets':new,'updatedDockets':updated,'pendingDockets':pending,'addedFilingCandidates':len(jobs),'unavailablePublicFiles':failures,'scope':'Substantive applications with activity on or after October 5, 2026, plus unresolved applications carried forward and existing OT26 records. Routine time-extension applications are excluded. Filing imports exclude service and word-count certificates. Discovery is bounded to the recorded docket ranges and published order sources.'}
(DATA/'orders-coverage.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:audit[k] for k in ['newDockets','pendingDockets','addedFilingCandidates']},indent=2));print('unresolved docket pages',len(audit['unresolvedDockets']),'unavailable files',len(failures))
