"""Import a reproducible inventory of the Court's published OT order documents.
Run with the project's Python environment (beautifulsoup4 and pypdf).
Original PDFs are preserved; extracted pages retain their source page boundaries.
Remove the cache before a new dated audit; cached pages are a reproducible snapshot.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
from datetime import datetime,timezone
from bs4 import BeautifulSoup
from pypdf import PdfReader
import subprocess,json,re,hashlib,io,argparse
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'dist/data';BASE='https://www.supremecourt.gov'
parser=argparse.ArgumentParser();parser.add_argument('--term',type=int,default=2026);parser.add_argument('--cache',default='/tmp/ninefold-orders-audit');args=parser.parse_args();CACHE=Path(args.cache);CACHE.mkdir(exist_ok=True,parents=True);YEAR=args.term;short=str(YEAR)[-2:]
def fetch(url):
 p=CACHE/(hashlib.sha256(url.encode()).hexdigest()+('.pdf' if '.pdf' in url.lower() else '.html'))
 if not p.exists():subprocess.run(['curl','-fLsS','--retry','2','--max-time','60',url,'-o',str(p)],check=True)
 return p.read_bytes()
def dt(text):
 m=re.search(r'\b\d{1,2}/\d{1,2}/\d{2}\b',text)
 return datetime.strptime(m[0],'%m/%d/%y').date().isoformat() if m else None
def norm(s):return ' '.join(s.split())
indexes=[('Court orders',f'{BASE}/orders/ordersofthecourt/{short}'),('Opinions relating to orders',f'{BASE}/opinions/relatingtoorders/{short}'),('Orders by circuit',f'{BASE}/orders/ordersbycircuit/{short}'),('Opinions of the Court',f'{BASE}/opinions/slipopinion/{short}')]
entries={};sources=[]
for kind,url in indexes:
 soup=BeautifulSoup(fetch(url),'html.parser');found=[]
 if kind in ['Court orders','Orders by circuit']:
  for a in soup.select('a[href]'):
   href=urljoin(url,a['href'])
   if not re.search(r'/orders/(?:courtorders/.*\.pdf$|ordersbycircuit/ordercasebycircuit/)',href,re.I):continue
   parent=a.parent
   while parent and not dt(parent.get_text(' ',strip=True)):parent=parent.parent
   date=dt(parent.get_text(' ',strip=True)) if parent else None
   if not date:raise ValueError('Missing date '+href)
   label=norm(a.get_text(' ',strip=True));found.append({'sourceUrl':href,'date':date,'kind':label,'sourceIndex':url})
 else:
  for tr in soup.select('tr'):
   text=norm(tr.get_text(' ',strip=True));date=dt(text)
   if not date:continue
   links=[a for a in tr.select('a[href]') if re.search(r'/opinions/\d+pdf/.*\.pdf',a['href'],re.I)];a=links[0] if links else None
   if not a:continue
   dockets=re.findall(r'\b\d{2}(?:A\d+|[-–]\d+)\b',text)
   if kind=='Opinions of the Court' and not any('A' in d for d in dockets):continue
   found.append({'sourceUrl':urljoin(url,a['href']),'revisionSourceUrl':urljoin(url,links[-1]['href']) if len(links)>1 else None,'date':date,'kind':'Opinion on an application' if kind=='Opinions of the Court' else 'Opinion relating to an order','name':norm(a.get_text(' ',strip=True)),'dockets':dockets,'sourceIndex':url})
 for e in found:entries[e['sourceUrl']]=e
 sources.append({'url':url,'kind':kind,'documents':len(found)})
def extract(e):
 raw=fetch(e['sourceUrl']);reader=PdfReader(io.BytesIO(raw));digest=hashlib.sha256(raw).hexdigest();id='court-order-'+hashlib.sha1(e['sourceUrl'].encode()).hexdigest()[:16]
 pages=[{'number':i+1,'label':str(reader.page_labels[i]),'text':(p.extract_text() or '').replace('\x00','').strip()} for i,p in enumerate(reader.pages)]
 if not any(p['text'] for p in pages):raise ValueError('No readable text: '+e['sourceUrl'])
 text='\n'.join(p['text'] for p in pages);dockets=sorted(set(d.replace('–','-') for d in re.findall(r'\b\d{2}(?:A\s*\d+|[-–]\s*\d+)\b',text)));dockets=[re.sub(r'\s','',d) for d in dockets]
 title=e.get('name') or e['kind'];pdfPath='data/pdfs/'+id+'.pdf';textPath='data/current-docs/'+id+'.json'
 (ROOT/'dist'/pdfPath).write_bytes(raw);(ROOT/'dist'/textPath).write_text(json.dumps({'id':id,'title':title,'sourceUrl':e['sourceUrl'],'pages':pages},ensure_ascii=False)+'\n')
 return {**e,'id':id,'term':YEAR,'title':title,'caseId':'orders-'+str(YEAR),'category':'Other','type':'Order','dockets':dockets,'pdfPath':pdfPath,'textPath':textPath,'pageCount':len(pages),'characterCount':len(text),'sourceSha256':digest,'searchText':norm(text),'extractionStatus':'Extracted'}
circuit={e['date']:e['sourceUrl'] for e in entries.values() if e['kind']=='Orders by Circuit'}
with ThreadPoolExecutor(max_workers=4) as pool:documents=list(pool.map(extract,[e for e in entries.values() if e['kind']!='Orders by Circuit']))
# Circuit lists reorganize the same published order lists; attach as alternate copies.
for d in documents:
 if d['kind']=='Order List' and d['date'] in circuit:d['circuitSourceUrl']=circuit[d['date']]
result={'schema':1,'checkedAt':datetime.now(timezone.utc).isoformat(),'terms':[YEAR],'sources':sources,'documents':sorted(documents,key=lambda d:(d['date'],d['id']),reverse=True)}
(DATA/'court-orders.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'documents':len(documents),'sources':sources,'latest':max(d['date'] for d in documents)},indent=2))
