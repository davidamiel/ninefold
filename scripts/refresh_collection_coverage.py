"""Recount imported reader material after a collection update; no completeness claim."""
from collections import Counter
from pathlib import Path
import json
DATA=Path(__file__).resolve().parents[1]/'dist/data'
def read(name):return json.loads((DATA/(name+'.json')).read_text())
def refresh(data):
 index=read('current-text-index');supplements=read('record-supplement');sections={**read('opinion-sections'),**read('opinion-section-overrides')};docs=[];core=[];with_reader=0
 for c in data['cases']:
  base={d['id']:{**d,**index.get(d['id'],{})} for d in c['documents']}
  for d in supplements.get(c['id'],[]):base[d['id']]={**base.get(d['id'],{}),**d}
  for d in sections.get(c['id'],[]):base[d['id']]=d
  replaced={d['parentDocumentId'] for d in sections.get(c['id'],[]) if d.get('parentDocumentId')}
  material=[d for d in base.values() if d.get('filedFor',c['id'])==c['id'] and d['id'] not in replaced]
  docs.extend(material);with_reader+=any(d.get('textPath') or d.get('pdfPath') for d in material)
  core.extend(d for d in material if d.get('category')!='Other' and d.get('title','').lower().strip('. ')!='questions presented' and (not d.get('auxiliary') or d['category']=='Lower courts'))
 readable=[d for d in docs if d.get('textPath') or d.get('pdfPath')];cov=data.setdefault('coverage',{})
 cov.pop('selectedAdditionalEmergencyApplications',None)
 cov.update(caseCount=len(data['cases']),applicationDocketCount=sum('A' in c['docket'] for c in data['cases']),documents=len(docs),uniqueDocumentCount=len({d['id'] for d in docs}),readableDocuments=len(readable),uniqueReadableDocumentCount=len({d['id'] for d in readable}),casesWithReaderMaterials=with_reader,coreDocumentRecords=len(core),uniqueCoreDocumentCount=len({d['id'] for d in core}),coreReadableDocuments=sum(bool(d.get('textPath')) for d in core),coreScanOnlyDocuments=sum(bool(d.get('scanOnly') and d.get('pdfPath')) for d in core),knownUnavailableFilings=sum(len(c.get('unavailableFilings',[])) for c in data['cases']),readableByCategory=dict(Counter(d['category'] for d in readable)))
 cov['scope']='Imported merits cases and reconciled application dockets; published OT26 order documents are indexed separately. See orders-coverage.json for bounded discovery and unresolved access failures.'
 cov['extractionStatus']='Imported reader payloads checked separately by check_term_reader.py; missing public files are recorded in unavailableFilings. Import coverage is not complete.'
 cov['notes']=[n for n in cov.get('notes',[]) if not n.startswith(('Scope is','Some known filings'))]
 return data
if __name__=='__main__':
 for name in ['current-term','catalog']:(DATA/(name+'.json')).write_text(json.dumps(refresh(read(name)),ensure_ascii=False,separators=(',',':'))+'\n')
