"""Derive reading paragraphs and headings from PDF coordinates without rewriting text.
Uses pypdf and cached original documents. Output offsets index immutable raw page text.
"""
import pathlib,json,re,hashlib,collections,concurrent.futures,time,os,statistics,logging
logging.getLogger("pypdf").setLevel(logging.ERROR)
from pypdf import PdfReader
ROOT=pathlib.Path(__file__).resolve().parent.parent
DIST=ROOT/'dist';CACHE=pathlib.Path(os.environ.get('COURT_SOURCE_CACHE',str(ROOT.parent/'term-import/cache')));OUT=DIST/'data/reading-layout.json'
HEADER=re.compile(r'^(?:Page Proof Pending Publication|Cite as:|OCTOBER TERM|Opinion of the Court|Syllabus|Official - Subject to|Heritage Reporting|[0-9]+\s+[A-Z].*\bv\.|[A-Z].*\bv\.\s+[A-Z]|(?:[A-Z][a-z]+|[A-Z]+),?\s+J\.,?\s+(?:concurring|dissenting))',re.I)
def norm(text):return ''.join(c.lower() for c in text if c.isalnum())
def process(d):
 try:
  rawpages=json.loads((DIST/d['textPath']).read_text(encoding='utf-8'))['pages'];reader=PdfReader(CACHE/hashlib.sha256(d['sourceUrl'].encode()).hexdigest());result={}
  for pi,pdf in enumerate(reader.pages):
   if pi>=len(rawpages):break
   raw=rawpages[pi]['text'];letters=[(c.lower(),i) for i,c in enumerate(raw) if c.isalnum()];rawnorm=''.join(c for c,i in letters);offsets=[i for c,i in letters]
   if not rawnorm:continue
   pieces=[]
   def visitor(text,cm,tm,font,size):
    if not text.strip():return
    x=tm[4]*cm[0]+tm[5]*cm[2]+cm[4];y=tm[4]*cm[1]+tm[5]*cm[3]+cm[5]
    for part in text.splitlines():
     if part.strip():pieces.append([x,y,part.strip()])
   pdf.extract_text(visitor_text=visitor)
   # Combine fragments occupying the same physical baseline, retaining PDF text order.
   lines=[]
   for x,y,t in pieces:
    if lines and abs(y-lines[-1][1])<2.1:lines[-1][2]+=' '+t;lines[-1][0]=min(lines[-1][0],x)
    else:lines.append([x,y,t])
   body=[l for l in lines if len(l[2])>35 and not HEADER.match(l[2]) and l[0]>0 and l[1]>0]
   if len(body)<3:
    result[str(pi)]={'paragraphStarts':[],'headings':[],'startsParagraph':False}
    continue
   bins=collections.Counter()
   for x,y,t in body:bins[round(x/3)*3]+=len(t)
   baseline=bins.most_common(1)[0][0]
   cursor=0;paragraphs=[];headings=[];firstbody=None;prev=None
   for idx,(x,y,t) in enumerate(lines):
    physicalPrev=prev;prev=(x,y,t)
    query=norm(t)
    if not query:continue
    pos=rawnorm.find(query[:min(32,len(query))],max(0,cursor-3))
    if pos<0:
     pos=rawnorm.find(query[:min(18,len(query))],max(0,cursor-3))
    if pos<0:continue
    off=offsets[pos];cursor=pos+len(query)
    if HEADER.match(t) or re.fullmatch(r'\W*\d{1,4}\W*',t) or y<=0:continue
    if len(t)>25 and firstbody is None:firstbody=(x,off)
    indented=5<=x-baseline<=44 and len(t)>20 and (physicalPrev is None or abs(x-physicalPrev[0])>4) and bool(re.match(r'[A-Z0-9“‘\"\'(]',t))
    # A genuine paragraph can also begin flush left after a blank physical line.
    gap=physicalPrev is not None and not HEADER.match(physicalPrev[2]) and (physicalPrev[1]-y)>21 and len(t)>35 and abs(x-baseline)<5
    if indented or gap:paragraphs.append(off)
    centered=x-baseline>35
    roman=bool(re.fullmatch(r'(?:[IVXLC]{1,7}|[A-H])\.?',t)) and centered
    title=bool(re.match(r'^(?:[IVXLC]+\.|[A-H]\.)\s+[A-Z]',t)) and len(t)<150
    upper=len(t)>5 and len(t)<120 and t.upper()==t and bool(re.search('[A-Z]{3}',t)) and not re.search(r'\.{3}|\d\s*$',t)
    if roman or (upper and (re.match(r'^(?:[IVXLC]+|[A-H])\.\s',t) or re.match(r'^(?:QUESTIONS?PRESENTED|PARTIESTO|RULE29|CORPORATEDISCLOSURE|DISCLOSURESTATEMENT|TABLEOFCONTENTS|TABLEOFAUTHORITIES|OPINIONSBELOW|JURISDICTION|CONSTITUTIONAL|STATUTORYPROVISIONS|STATEMENT|SUMMARYOFARGUMENT|ARGUMENT|CONCLUSION|APPENDIX)',re.sub(r'[^A-Z0-9]','',t)))):
     if not re.search(r'SUPREME COURT|UNITED STATES|PETITIONER|RESPONDENT|CERTIORARI|NO\.\s*\d',t):headings.append({'offset':off,'text':t})
    prev=(x,y,t)
   result[str(pi)]={'paragraphStarts':sorted(set(paragraphs)),'headings':headings,'startsParagraph':bool(firstbody and firstbody[1] in paragraphs)}
  return d['id'],result,None
 except Exception as e:return d['id'],{},str(e)
def main():
 cat=json.loads((DIST/'data/catalog.json').read_text(encoding='utf-8'));ds={d['id']:d for c in cat['cases'] for d in c['documents'] if d.get('textPath') and d.get('category') in ['Decision','Merits','Certiorari','Amicus','Lower courts','Appendices']}
 priority={'Decision':0,'Merits':1,'Certiorari':2,'Amicus':3,'Lower courts':4,'Appendices':5}
 docs=sorted(ds.values(),key=lambda d:(priority.get(d.get('category'),9),d.get('pageCount',0)))
 result={};started=time.time();errors=[]
 with concurrent.futures.ProcessPoolExecutor(max_workers=8) as ex:
  futures={ex.submit(process,d):d for d in docs}
  for i,f in enumerate(concurrent.futures.as_completed(futures),1):
   id,pages,error=f.result()
   if error:errors.append((id,error))
   else:result[id]=pages
   if i%25==0 or i==len(docs):
    OUT.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(i,'/',len(docs),'docs',sum(len(p) for p in result.values()),'pages',round(time.time()-started,1),'sec','errors',len(errors),flush=True)
 print('Done',len(result),'docs. Errors:',errors[:10],flush=True)

def footnotes_for_document(d):
 try:
  rawpages=json.loads((DIST/d['textPath']).read_text(encoding='utf-8'))['pages'];reader=PdfReader(CACHE/hashlib.sha256(d['sourceUrl'].encode()).hexdigest());result={};prior=False
  for pi,pdf in enumerate(reader.pages):
   if pi>=len(rawpages):break
   raw=rawpages[pi]['text'];letters=[(c.lower(),i) for i,c in enumerate(raw) if c.isalnum()];rn=''.join(c for c,i in letters);offsets=[i for c,i in letters]
   if not rn:continue
   pieces=[]
   def visitor(text,cm,tm,font,size):
    if not text.strip():return
    x=tm[4]*cm[0]+tm[5]*cm[2]+cm[4];y=tm[4]*cm[1]+tm[5]*cm[3]+cm[5]
    f=size*((tm[0]**2+tm[1]**2)**.5)*((cm[0]**2+cm[1]**2)**.5)
    for part in text.splitlines():
     if part.strip():pieces.append([x,y,part.strip(),f])
   pdf.extract_text(visitor_text=visitor);lines=[]
   for x,y,t,f in pieces:
    if lines and abs(y-lines[-1][1])<2.4:
     l=lines[-1];l[3]=(l[3]*len(l[2])+f*len(t))/(len(l[2])+len(t));l[2]+=' '+t;l[0]=min(l[0],x)
    else:lines.append([x,y,t,f])
   height=float(pdf.mediabox.height);eligible=[l for l in lines if l[1]>20 and l[1]<height*.88 and len(l[2])>25 and not HEADER.match(l[2])]
   upper=[l for l in eligible if l[1]>height*.5]
   fonts=collections.Counter()
   for x,y,t,f in upper or eligible:fonts[round(f*2)/2]+=len(t)
   if not fonts:continue
   body=fonts.most_common(1)[0][0]
   if body<6:continue
   mapped=[];cursor=0
   for x,y,t,f in lines:
    q=norm(t)
    if not q:continue
    pos=rn.find(q[:min(32,len(q))],max(0,cursor-3))
    if pos<0:pos=rn.find(q[:min(18,len(q))],max(0,cursor-3))
    if pos<0:continue
    off=offsets[pos];last=offsets[min(len(offsets)-1,pos+len(q)-1)]+1;cursor=pos+len(q)
    if y<=20 or HEADER.match(t) or re.fullmatch(r'\W*\d{1,4}\W*',t):continue
    begin=raw.rfind('\n',0,off)+1
    if re.fullmatch(r'\s*[*†‡\d]*\s*',raw[begin:off]):off=begin
    while last<len(raw) and raw[last] not in '\n' and not raw[last].isalnum():last+=1
    mapped.append({'x':x,'y':y,'text':t,'font':f,'start':off,'end':last})
   large=[i for i,l in enumerate(mapped) if l['font']>=body*.94 and len(l['text'])>20]
   if not large:prior=False;continue
   after=large[-1]+1;tail=[l for l in mapped[after:] if l['font']<=body*.9 and len(l['text'])>3]
   if not tail:prior=False;continue
   first=tail[0];label=re.match(r'^\s*(\d{1,2}|[*†‡])\s*',raw[first['start']:first['end']]);gap=mapped[large[-1]]['y']-first['y']
   # Footnotes form a smaller-font block below body text, usually separated by a gap.
   # A continuing block requires a footnote on the preceding page.
   accepted=first['y']<height*.64 and gap>=8 and (label is not None or prior)
   if accepted:
    result[str(pi)]=[{'start':first['start'],'end':tail[-1]['end'],'label':label.group(1) if label else 'continued'}];prior=True
   else:prior=False
  return d['id'],result,None
 except Exception as e:return d['id'],{},str(e)
def extend_footnotes():
 data=json.loads(OUT.read_text(encoding='utf-8'));cat=json.loads((DIST/'data/catalog.json').read_text(encoding='utf-8'));docs={d['id']:d for c in cat['cases'] for d in c['documents'] if d.get('textPath') and d.get('category')=='Decision'};errors=[];n=0
 with concurrent.futures.ProcessPoolExecutor(max_workers=8) as ex:
  for id,pages,error in ex.map(footnotes_for_document,docs.values()):
   if error:errors.append((id,error));continue
   for pi,footnotes in pages.items():
    data.setdefault(id,{}).setdefault(pi,{'paragraphStarts':[],'headings':[],'startsParagraph':False})['footnotes']=footnotes;n+=len(footnotes)
 OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print('Footnote blocks',n,'decision documents',len(docs),'errors',errors,flush=True)
if __name__=='__main__':
 import sys
 if '--footnotes' in sys.argv:extend_footnotes()
 else:main()

