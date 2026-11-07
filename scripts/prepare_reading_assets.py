import pathlib,json,re,hashlib,urllib.request,concurrent.futures,os
from pypdf import PdfReader,PdfWriter
APP=pathlib.Path(__file__).resolve().parent.parent; DATA=APP/'dist/data'; CACHE=pathlib.Path(os.environ.get('COURT_SOURCE_CACHE',str(APP/'scripts/cache')))
profiles=json.loads((DATA/'profiles.json').read_text(encoding='utf-8'))
(APP/'dist/images').mkdir(exist_ok=True)
def portrait(item):
 name,p=item
 if not p.get('portraitUrl'):return
 try:
  raw=urllib.request.urlopen(urllib.request.Request(p['portraitUrl'],headers={'User-Agent':'Mozilla/5.0'}),timeout=40).read()
  ext='.png' if raw.startswith(b'\x89PNG') else '.jpg';path='images/'+re.sub('[^a-z]+','-',name.lower()).strip('-')+ext
  (APP/'dist'/path).write_bytes(raw);p['portraitPath']=path
 except Exception as e:print('portrait unavailable',name,str(e),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(portrait,profiles.items()))
(DATA/'profiles.json').write_text(json.dumps(profiles,ensure_ascii=False),encoding='utf-8')
cat=json.loads((DATA/'catalog.json').read_text(encoding='utf-8'));result={};pdfcache={}
for c in cat['cases']:
 bydoc={}
 for o in c.get('decision',{}).get('opinions',[]):
  if o.get('documentId'):bydoc.setdefault(o['documentId'],[]).append(o)
 for docid,ops in bydoc.items():
  d=next((d for d in c['documents'] if d['id']==docid and d.get('textPath')),None)
  if not d:continue
  pages=json.loads((APP/'dist'/d['textPath']).read_text(encoding='utf-8'))['pages'];starts=[]
  for o in ops:
   pi=o.get('pageIndex',0)
   if pi>=len(pages):continue
   txt=pages[pi]['text'];surname=o.get('author','').replace(', Jr.','').split()[-1:];surname=surname[0] if surname else ''
   pattern=r'(?im)^\s*(?:(?:JUSTICE|CHIEF JUSTICE)\s+'+re.escape(surname)+r'\b|The Chief Justice\b)'
   matches=list(re.finditer(pattern,txt));off=matches[0].start() if matches else 0
   starts.append((pi,off,o))
  starts.sort(key=lambda x:(x[0],x[1]));unique=[]
  for s in starts:
   if not unique or s[:2]!=unique[-1][:2]:unique.append(s)
  if not unique:continue
  items=[]
  first=unique[0]
  syll=next((i for i,p in enumerate(pages[:first[0]+1]) if re.search(r'\bSyllabus\b',p['text'])),None)
  if syll is not None and (syll<first[0] or first[1]>200):items.append((syll,0,{'type':'Syllabus','author':None}))
  items+=unique
  for ix,(pi,off,o) in enumerate(items):
   endpi,endoff=(items[ix+1][0],items[ix+1][1]) if ix+1<len(items) else (len(pages),0)
   sid=docid+'--'+str(pi)+'-'+str(off);title=o['type']+((' · '+o['author']) if o.get('author') else '')
   section={**d,'id':sid,'parentDocumentId':docid,'title':title,'opinionType':o['type'],'opinionAuthor':o.get('author'),'caseId':c['id'],'sourceRange':{'startPage':pi,'startOffset':off,'endPage':endpi,'endOffset':endoff},'pageCount':endpi-pi+(1 if endoff else 0)}
   path=CACHE/hashlib.sha256(d['sourceUrl'].encode()).hexdigest()
   if path.exists():
    try:
     if docid not in pdfcache:pdfcache[docid]=PdfReader(path)
     reader=pdfcache[docid];writer=PdfWriter()
     for p in range(pi,min(len(reader.pages),endpi+(1 if endoff else 0))):writer.add_page(reader.pages[p])
     pdf='data/pdfs/'+sid+'.pdf';writer.write(APP/'dist'/pdf);section['pdfPath']=pdf
    except Exception as e:print('PDF split',docid,str(e),flush=True)
   result.setdefault(c['id'],[]).append(section)
(DATA/'opinion-sections.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
print('Profiles',len(profiles),'portraits',sum('portraitPath'in p for p in profiles.values()),'opinion sections',sum(len(x) for x in result.values()),flush=True)
