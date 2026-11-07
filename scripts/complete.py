"""Complete remaining substantive reader corpus; run with network permission.

Writes data/docs and completion-results/status only. Merge after enrich.py to
avoid racing updates to catalog.json. Uses import_term cache and extractor.
"""
import pathlib,json,concurrent.futures as cf,datetime,os,traceback
import import_term as imp
OUT=imp.OUT
catalog=json.loads((OUT/'catalog.json').read_text(encoding='utf-8'))
core={'Certiorari','Merits','Amicus','Decision','Argument','Lower courts'}
unique={d['id']:dict(d) for c in catalog['cases'] for d in c['documents']}
pending=[d for d in unique.values() if d['category'] in core and not d.get('auxiliary') and not d.get('textPath')]
results=[]
(OUT/'pdfs').mkdir(exist_ok=True)
def task(d):
 d=imp.extraction_task(d)
 if d.get('textPath') and d.get('characterCount',0)<100:
  d.pop('textPath',None);d['scanOnly']=True
  raw=imp.get(d['sourceUrl'])
  if len(raw)<24_000_000:
   (OUT/'pdfs'/(d['id']+'.pdf')).write_bytes(raw)
   d['pdfPath']='data/pdfs/'+d['id']+'.pdf'
  d['extractionStatus']='Scan-only; original PDF available'
 return d
def checkpoint():
 status={'total':len(pending),'finished':len(results),'readable':sum(bool(d.get('textPath')) for d in results),'scanOnly':sum(bool(d.get('scanOnly')) for d in results),'errors':list(imp.errors),'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 tmp=OUT/'completion-results.tmp';tmp.write_text(json.dumps(results,ensure_ascii=False),encoding='utf-8');tmp.replace(OUT/'completion-results.json')
 (OUT/'completion-status.json').write_text(json.dumps(status,indent=2),encoding='utf-8')
 return status
print('MISSING CORE',len(pending),flush=True)
with cf.ThreadPoolExecutor(max_workers=6) as ex:
 futures=[ex.submit(task,d) for d in pending]
 for future in cf.as_completed(futures):
  try:results.append(future.result())
  except Exception as e:imp.errors.append({'phase':'complete','error':str(e)})
  if len(results)%10==0:
   status=checkpoint();print('CORE COMPLETE',len(results),'/',len(pending),'scan',status['scanOnly'],'errors',len(status['errors']),flush=True)
status=checkpoint();print('FINISHED',json.dumps(status),flush=True)

