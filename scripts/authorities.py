import pathlib,urllib.request,json,re,os
from lxml import html
ROOT=pathlib.Path(__file__).resolve().parent
OUT=pathlib.Path(os.environ.get('COURT_DATA_DIR',str(ROOT.parent/'dist'/'data')))
items=[
 (5,'706','Scope of review','partI-chap7'),
 (50,'1702','Presidential authorities','chap35'),
 (50,'1701','Unusual and extraordinary threat; declaration of national emergency','chap35'),
 (15,'41','Federal Trade Commission established; membership; vacancies; seal','chap2-subchapI'),
 (42,'1983','Civil action for deprivation of rights','chap21-subchapI'),
 (28,'1331','Federal question','partIV-chap85'),
 (28,'1254','Courts of appeals; certiorari; certified questions','partIV-chap81'),
 (18,'922','Unlawful acts','partI-chap44'),
]
records=[]
for title,section,heading,path in items:
 url=f'https://www.govinfo.gov/content/pkg/USCODE-2024-title{title}/html/USCODE-2024-title{title}-{path}-sec{section}.htm'
 try:
  raw=urllib.request.urlopen(url,timeout=30).read();t=html.fromstring(raw,parser=html.HTMLParser(encoding='utf-8'))
  # govinfo source is UTF-8; retain all section text and editorial notes with version attribution.
  body=t.xpath('//body')[0] if t.xpath('//body') else t
  pieces=[];started=False
  for element in body:
   if not isinstance(element.tag,str):continue
   if element.get('class')=='section-head':started=True
   if started and element.get('class')=='note-head':break
   if started and element.text_content().strip():pieces.append(element.text_content().strip())
   if started and element.get('class')=='source-credit':break
  txt='\n\n'.join(pieces);txt=re.sub(r'\n[ \t]+','\n',txt);txt=re.sub(r'\n{3,}','\n\n',txt).strip()
  id=f'usc-2024-{title}-{section}'
  r={'id':id,'title':f'{title} U.S.C. § {section} — {heading}','type':'Statute','referenceKey':f'{title}U.S.C.§{section}','sourceUrl':url,'edition':'2024 edition','textPath':f'data/docs/{id}.json','pageCount':1}
  data={**r,'pages':[{'number':1,'label':'Section '+section,'text':txt}],'extraction':{'method':'Official GPO HTML text','reviewed':False,'note':'2024 U.S. Code edition; statutory section and source credit, excluding editorial notes and executive orders. This is a versioned reference, not a claim that this edition governs every case.'}}
  (OUT/'docs'/f'{id}.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');records.append(r)
  print(id,len(txt))
 except Exception as e:print('FAILED',url,e)
(OUT/'authorities.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8')


