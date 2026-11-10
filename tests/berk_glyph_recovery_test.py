"""Reproduce bounded source-glyph recovery without changing any file; requires PyMuPDF."""
import fitz,json,hashlib,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1];id='24-440-1bba7e3379d6'
source=root/f'dist/data/pdfs/{id}.pdf';raw=root/f'dist/data/docs/{id}.json'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='c6cb3be49576bc5a61e048844aad9876991d9fad0f8b6c66309ffb8ae3a6149f'
assert hashlib.sha256(raw.read_bytes()).hexdigest()=='7900dfd10bb4592317e58568bac39c2e145c502dede0c1ff92b1f8e2e8112fa1'
pdf=fitz.open(source);d=json.loads(raw.read_text());m=fitz.open(source)
assert '174 /fi 175 /fl' in re.sub(r'\s+',' ',pdf.xref_object(1431))
for font in [88,89,94,96,1433,1437]:
 assert pdf.xref_get_key(font,'Encoding')==('xref','1431 0 R')
for xref in [57,58,59,61,1422,1424]:
 s=m.xref_stream(xref);assert s.count(b'<AE> <0066>')==1 and s.count(b'<AF> <0066>')==1
 m.update_stream(xref,s.replace(b'<AE> <0066>',b'<AE> <E000>').replace(b'<AF> <0066>',b'<AF> <E001>'))
def canon(s):return ''.join(c for c in s if not c.isspace() and c not in '-\xad')
repairs=[];pages=[]
for i,page in enumerate(m):
 assert all(ord(c)<=0xffff for c in d['pages'][i]['text'])
 text=canon(page.get_text()); original=canon(pdf[i].get_text());rawtext=d['pages'][i]['text'];indices=[j for j,c in enumerate(rawtext) if not c.isspace() and c not in '-\xad'];assert text.replace('\ue000','f').replace('\ue001','f')==original==canon(rawtext),(i,'divergent text')
 n=0
 for j,c in enumerate(text):
  if c not in '\ue000\ue001':continue
  start=indices[j];assert rawtext[start]=='f';n+=1
  repairs.append(dict(page=i,start=start,end=start+1,text={'\ue000':'fi','\ue001':'fl'}[c],expectedText='f',sourcePdfPage=i+1,evidence='docs/berk-opinion-glyph-review.md'))
 assert pdf[i].get_pixmap().samples==page.get_pixmap().samples
 pages.append({'sourcePage':i+1,'repairs':n})
assert len(repairs)==224
for path in ['scripts/curated-reader-structure.json','dist/data/reader-structure.json']:
 assert json.loads((root/path).read_text())[id]['repairs']==repairs
print('Verified 224 exact source-encoded glyph repairs across 28 pixel-identical pages.')
