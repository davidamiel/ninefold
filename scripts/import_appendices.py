import pathlib,sys,json,re,concurrent.futures
ROOT=pathlib.Path(__file__).parent;sys.path.insert(0,str(ROOT))
import import_term as imp
path=imp.OUT/'catalog.json';cat=json.loads(path.read_text(encoding='utf-8'))
def actual(d):return not d.get('auxiliary') and re.match(r'^(?:(?:Joint|Supplemental|Supplementary|Corrected)\s+)*(?:Appendix|Appendices)\b',d['title'],re.I)
pending={d['id']:dict(d) for c in cat['cases'] for d in c['documents'] if actual(d) and not d.get('textPath')}
results={}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for d in ex.map(imp.extraction_task,pending.values()):results[d['id']]=d;print('Appendix',len(results),'/',len(pending),bool(d.get('textPath')),flush=True)
for c in cat['cases']:
 for d in c['documents']:
  if d['id'] in results:d.update(results[d['id']])
  if actual(d):
   d['category']='Appendices';d['title']=re.sub(r'\s*\(Statement of costs\s*\)','',d['title'],flags=re.I)
path.write_text(json.dumps(cat,ensure_ascii=False),encoding='utf-8');print('Appendix completion finished',flush=True)
