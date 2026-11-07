import pathlib,json,re,collections,datetime,os
ROOT=pathlib.Path(__file__).parent
OUT=pathlib.Path(os.environ.get('COURT_DATA_DIR',str(ROOT.parent/'dist'/'data')))
p=OUT/'catalog.json'
cat=json.loads(p.read_text(encoding='utf-8'))
authorities=json.loads((OUT/'authorities.json').read_text(encoding='utf-8'))
cat['authorities']=authorities
shared={}
for c in cat['cases']:
 for d in c['documents']:
  if d['category']=='Decision' and c.get('citation'):shared[d['id']]=c['citation']
for c in cat['cases']:
 q=c.get('question')
 if q:
  q=re.split(r'QUESTIONS? PRESENTED\s*:',q,flags=re.I)[-1]
  q=re.split(r'LOWER COURT CASE NUMBER|CERT\. GRANTED',q,flags=re.I)[0].strip()
  q=re.sub(r'\s+',' ',q)
  c['question']=q
  c['questionAttribution']='Questions presented PDF supplied by the Court; text states the question as presented, not an editorial summary.'
 seen=set();dedup=[]
 for d in c['documents']:
  if d['id'] in seen:continue
  seen.add(d['id']);dedup.append(d)
  desc=d.get('description','');title=d['title'];filename=d['sourceUrl'].rsplit('/',1)[-1].lower()
  # Administrative filings remain available but must not masquerade as substantive merits briefs.
  if re.match(r'^(?:Motion|Application|Letter|Response to (?:motion|application)|Reply .*? (?:motion|application))\b',desc,re.I) and d['type']!='Appendix':
   d['category']='Other';d['type']='Motion' if desc.lower().startswith('motion') else 'Application' if desc.lower().startswith('application') else 'Filing'
  if re.search(r'certificate|proof.of.service|cert.of.serv|certificate.of.word',filename,re.I) and d.get('linkLabel') in ['Main Document','Other']:
   d['auxiliary']=True;d['category']='Other';d['type']='Certificate'
  if d['id'] in shared:d['citation']=shared[d['id']]
  if d.get('textPath'):
   path=OUT.parent/d['textPath'];data=json.loads(path.read_text(encoding='utf-8'))
   if d['id'] in shared:data['citation']=shared[d['id']]
   # Printed labels from source-page header/footer, cautiously extracted; PDF number remains stable.
   for page in data['pages']:
    lines=[l.strip() for l in page['text'].splitlines() if l.strip()]
    candidates=lines[:2]+lines[-2:]
    label=next((x for x in candidates if re.fullmatch(r'(?:\d{1,4}[a-z]?|[ivxlcdm]{1,8})',x,re.I)),None)
    if label:page['printedLabel']=label
   ext=data.setdefault('extraction',{})
   ext['replacementCharacterCount']=sum(pg['text'].count('\ufffd') for pg in data['pages'])
   path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
   if d.get('characterCount',1000)<100:
    d.pop('textPath',None);d['extractionStatus']='Image-only or insufficient extracted text; original PDF linked'
 c['documents']=dedup
ds=[d for c in cat['cases'] for d in c['documents']]
unique={d['id']:d for d in ds};read=[d for d in unique.values() if d.get('textPath')]
cov=cat['coverage'];cov.update({'documents':len(ds),'uniqueDocumentCount':len(unique),'substantiveDocuments':sum(not d.get('auxiliary') for d in ds),'uniqueSubstantiveDocuments':sum(not d.get('auxiliary') for d in unique.values()),'readableDocuments':sum(bool(d.get('textPath')) for d in ds),'uniqueReadableDocumentCount':len(read),'uniqueReadablePages':sum(d['pageCount'] for d in read),'readablePages':sum(d.get('pageCount',0) for d in ds if d.get('textPath')),'casesWithReadableDocuments':sum(any(d.get('textPath') for d in c['documents']) for c in cat['cases']),'uniqueAudioRecordings':len({c['audio']['url'] for c in cat['cases'] if c.get('audio',{}).get('url')}),'statuteSections':len(authorities),'extractionStatus':'Complete for selected documents'})
cov['readableByCategory']=dict(collections.Counter(d['category'] for d in read))
cov['sourceOnlyDocuments']=len(unique)-len(read)
cov['notes']=['Docketed matters are counted separately, including consolidated cases that share one argument or opinion.','The 65-entry granted/noted list includes one matter dismissed before October Term 2025.','Sixteen additional matters appear in the Court’s term opinion index.','Administrative proofs and certificates are inventoried but marked auxiliary.','Original PDFs remain linked; selected documents have extracted text.','Statute previews use the explicitly identified 2024 U.S. Code edition, not an asserted case-specific governing version.']
cat['sources'].append({'title':'United States Code, 2024 edition — Government Publishing Office','url':'https://www.govinfo.gov/app/collection/USCODE/2024'})
p.write_text(json.dumps(cat,ensure_ascii=False),encoding='utf-8')
errors=json.loads((ROOT/'coverage.json').read_text(encoding='utf-8')).get('errors',[])
allpaths=[OUT.parent/d['textPath'] for d in read]+[OUT.parent/a['textPath'] for a in authorities]
missing=[str(p) for p in allpaths if not p.exists()]
sparse=[];replacement=[]
for d in read:
 data=json.loads((OUT.parent/d['textPath']).read_text(encoding='utf-8'))
 if data.get('extraction',{}).get('sparsePages'):sparse.append({'id':d['id'],'pages':data['extraction']['sparsePages']})
 if data.get('extraction',{}).get('replacementCharacterCount'):replacement.append(d['id'])
report={'term':'2025','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coverage':cov,'validation':{'catalogCaseIdsUnique':len({c['id'] for c in cat['cases']})==len(cat['cases']),'missingTextFiles':missing,'sourceDomains':sorted({__import__('urllib.parse',fromlist=['urlparse']).urlparse(d['sourceUrl']).netloc for d in ds}),'documentsWithSparsePages':len(sparse),'documentsWithReplacementCharacters':len(replacement),'visualSpotCheck':'Learning Resources petitioner merits brief, PDF page 28, compared against rendered source; substantive text matches. This is not a review of every page.','limits':'Automatic PDF extraction retains page boundaries but may produce headers, footnotes, line wraps, sparse scanned pages, or encoding artifacts. No OCR or manual legal-text correction performed.'},'errors':errors,'sparseDocuments':sparse,'replacementCharacterDocuments':replacement}
(OUT/'coverage-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(cov,indent=2));print('Missing files',len(missing),'Errors',len(errors),'Sparse docs',len(sparse),'Replacement chars docs',len(replacement))
md=f'''# October Term 2025 content import

This is a source-backed prototype collection, not an editorial case digest.

## Coverage

- {cov['caseCount']} docketed matters: {cov['argumentRosterCount']} records on the Court's granted/noted list and {cov['additionalOpinionCases']} additional matters in its opinion index.
- {cov['uniqueDocumentCount']:,} unique document records; {cov['uniqueSubstantiveDocuments']:,} are not marked administrative proofs/certificates.
- {cov['uniqueReadableDocumentCount']:,} unique documents have extracted reader text, covering {cov['uniqueReadablePages']:,} PDF pages.
- {cov['casesWithReadableDocuments']} cases have at least one readable document.
- {cov['uniqueAudioRecordings']} unique official argument recordings, linked from {cov['audioRecordings']} docket records.
- {cov['statuteSections']} statute sections from the expressly identified 2024 U.S. Code edition.

Consolidated dockets remain separate case records and can share documents. The roster includes one matter dismissed before the term began. This collection does not attempt to include every certiorari denial or miscellaneous order.

## Sources

- [Court's granted/noted list](https://www.supremecourt.gov/orders/25grantednotedlist.pdf)
- [Opinions of the Court](https://www.supremecourt.gov/opinions/slipopinion/25)
- [Argument transcripts](https://www.supremecourt.gov/oral_arguments/argument_transcript/2025)
- [Argument audio](https://www.supremecourt.gov/oral_arguments/argument_audio/2025)
- Individual official docket pages and their linked PDFs, recorded on every document.
- [U.S. Code 2024 edition](https://www.govinfo.gov/app/collection/USCODE/2024)

## Extraction and verification

PDF reader text comes from pypdf text extraction; page boundaries are preserved. Source page numbers and cautiously detected printed labels are recorded separately. No generated briefs or opinions are used. Official question-presented text and short opinion-index descriptions are attributed to their sources.

All selected downloads/extractions completed with {len(errors)} recorded errors. All referenced extracted text files exist. {len(sparse)} documents have at least one sparse-text page; some are covers or intentionally blank pages, while others can include scanned material. {len(replacement)} documents contain Unicode replacement characters. The original PDF remains the authoritative fallback. No OCR or full manual proofread was performed.

One substantive Learning Resources brief page was visually compared to its rendered original and the text matched. This spot-check does not certify every extracted page.

Classification uses filing descriptions and dates. Motions/applications are retained under Other; proof and certificate attachments are marked auxiliary. Rare irregular docket descriptions may still require correction.

## Reproduction

Run import_term.py, authorities.py, then finalize.py using Python with pypdf and lxml. Set COURT_DATA_DIR to the target dist/data directory. Download cache is local to the script directory and is not required in deployment. The importer uses bounded parallel workers and reuses cached downloads and extracted documents.
'''
(OUT/'import-report.md').write_text(md,encoding='utf-8')


