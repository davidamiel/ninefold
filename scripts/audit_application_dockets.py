"""Discover application dockets within explicit bounded ranges; retain failures.
Run before reconcile_emergency_applications.py. Cache is resumable; delete it for a fresh audit.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import subprocess,json,time,re
from bs4 import BeautifulSoup
P=Path('/tmp/ninefold-orders-audit');D=P/'dockets';D.mkdir(exist_ok=True,parents=True)
def task(cid):
 path=D/(cid+'.html');statusfile=D/(cid+'.status')
 if path.exists() and statusfile.exists() and statusfile.read_text() in ['200','404']: status=statusfile.read_text()
 else:
  time.sleep(.15)
  r=subprocess.run(['curl','-LsS','--retry','2','--max-time','25','-w','%{http_code}','https://www.supremecourt.gov/search.aspx?filename=/docket/docketfiles/html/public/'+cid.lower()+'.html','-o',str(path)],capture_output=True,text=True);status=r.stdout.strip();statusfile.write_text(status)
 if status=='404':return {'id':cid,'status':'not-found'}
 if status!='200':return {'id':cid,'status':'error','http':status}
 s=BeautifulSoup(path.read_bytes(),'html.parser');procs=[]
 for tbl in s.select('table.ProceedingItem'):
  td=tbl.select('td');links=td[1].select_one('.documentlinks')
  if links:links.extract()
  procs.append({'date':td[0].get_text(' ',strip=True),'description':' '.join(td[1].get_text(' ',strip=True).split())})
 if not procs:return {'id':cid,'status':'unrecognized'}
 substantive=[x for x in procs if re.search(r'application.*(?:stay|injunct|bail|vacat|mandate|judgment|recall)',x['description'],re.I) and not re.search(r'application.*(?:extend|extension).*time',x['description'],re.I)]
 return {'id':cid,'status':'found','substantive':bool(substantive),'first':procs[0],'last':procs[-1],'proceedings':procs if substantive else []}
ids=[f'26A{i}' for i in range(1,751)]+[f'25A{i}' for i in range(1,1651)]
results=[]
with ThreadPoolExecutor(max_workers=5) as pool:
 futures={pool.submit(task,cid):cid for cid in ids}
 for f in as_completed(futures):
  results.append(f.result())
  if len(results)%100==0:
   (P/'scan.json').write_text(json.dumps(results));print('scanned',len(results),'substantive',sum(r.get('substantive',False) for r in results),'errors',sum(r['status']=='error' for r in results),flush=True)
(P/'scan.json').write_text(json.dumps(results));print('DONE',len(results),flush=True)
