import pathlib,json,re,collections,os,subprocess,sys,datetime
ROOT=pathlib.Path(__file__).parent
OUT=pathlib.Path(os.environ.get('COURT_DATA_DIR',str(ROOT.parent/'dist'/'data')))
p=OUT/'catalog.json';cat=json.loads(p.read_text(encoding='utf-8'))
results={d['id']:d for d in json.loads((OUT/'completion-results.json').read_text(encoding='utf-8'))}
bycase={c['id']:c for c in cat['cases']}
for c in cat['cases']:
 for d in c['documents']:
  if d['id'] in results:d.update(results[d['id']])
 # Explicit see-opinion references on the official granted/noted list establish shared decisions.
 related=re.findall(r'No\.\s*(\d{2}-\d+)',c.get('result') or '')
 c['relatedDockets']=list(dict.fromkeys(x for x in c.get('relatedDockets',[])+related if x!=c['id']))
 for rd in c['relatedDockets']:
  if rd not in bycase:continue
  other=bycase[rd]
  if not any(d['category']=='Decision' for d in c['documents']):
   for d in other['documents']:
    if d['category']=='Decision' and d['type']=='Opinion':c['documents'].append({**d,'sharedFrom':rd})
  if not c.get('officialSummary') and other.get('officialSummary'):
   shared=any(d['category']=='Decision' and any(x['sourceUrl']==d['sourceUrl'] for x in other['documents']) for d in c['documents'])
   if shared:
    c['officialSummary']=other['officialSummary'];c['summarySource']=other['summarySource'];c['sharedDecisionFrom']=rd
  if not c.get('author') and other.get('author'):c['author']=other['author']
 original=c.get('result') or ''
 m=re.match(r'1(.*?);\s*2(.*)',original)
 if m and len(c['relatedDockets'])==1:
  pair=sorted([c['id'],c['relatedDockets'][0]],key=lambda x:tuple(int(n) for n in re.findall(r'\d+',x)))
  c['consolidatedResult']=original;c['result']=m.group(1 if c['id']==pair[0] else 2).strip()
for c in cat['cases']:
 for rd in c['relatedDockets']:
  if rd in bycase and c['id'] not in bycase[rd]['relatedDockets']:bycase[rd]['relatedDockets'].append(c['id'])
p.write_text(json.dumps(cat,ensure_ascii=False),encoding='utf-8')
subprocess.run([sys.executable,str(ROOT/'enrich.py')],check=True,capture_output=True)
en=json.loads((OUT/'enrichment-patch.json').read_text(encoding='utf-8'))
for c in cat['cases']:
 c.update(en['cases'][c['id']])
 for d in c['documents']:
  if d['id'] in en['documents']:d.update(en['documents'][d['id']])
 c['relatedDockets']=list(dict.fromkeys(c['relatedDockets']))
ds=[d for c in cat['cases'] for d in c['documents']];unique={d['id']:d for d in ds}
read=[d for d in unique.values() if d.get('textPath')]
core={'Certiorari','Merits','Amicus','Decision','Argument','Lower courts'}
coreDocs=[d for d in unique.values() if d['category'] in core and not d.get('auxiliary')]
missing=[d for d in coreDocs if not d.get('textPath') and not d.get('scanOnly')]
missingFiles=[d['textPath'] for d in read if not (OUT.parent/d['textPath']).exists()]
cov=cat['coverage'];cov.update({'documents':len(ds),'uniqueDocumentCount':len(unique),'substantiveDocuments':sum(not d.get('auxiliary') for d in ds),'uniqueSubstantiveDocuments':sum(not d.get('auxiliary') for d in unique.values()),'readableDocuments':sum(bool(d.get('textPath')) for d in ds),'uniqueReadableDocumentCount':len(read),'uniqueReadablePages':sum(d.get('pageCount',0) for d in read),'readablePages':sum(d.get('pageCount',0) for d in ds if d.get('textPath')),'coreDocumentCount':len(coreDocs),'coreReadableDocuments':sum(bool(d.get('textPath')) for d in coreDocs),'coreScanOnlyDocuments':sum(bool(d.get('scanOnly')) for d in coreDocs),'coreUnavailableDocuments':len(missing),'casesWithReadableDocuments':sum(any(d.get('textPath') for d in c['documents']) for c in cat['cases']),'readableByCategory':dict(collections.Counter(d['category'] for d in read)),'sourceOnlyDocuments':len(unique)-len(read),'extractionStatus':'Complete for substantive core documents; scan-only originals available'})
cov['advocateCaseCount']=sum(bool(c.get('advocates')) for c in cat['cases']);cov['uniqueAdvocateCount']=len({a['id'] for c in cat['cases'] for a in c.get('advocates',[])})
cov['amicusEntityCount']=len({a['id'] for c in cat['cases'] for a in c.get('amici',[])})
cov['decisionCaseCount']=sum(bool(c.get('decision')) for c in cat['cases']);cov['verifiedVoteCaseCount']=sum(bool(c.get('decision',{}).get('vote')) for c in cat['cases'])
cov['notes']=[x for x in cov.get('notes',[]) if 'selected' not in x.lower()]
cov['notes']+=['All non-auxiliary documents classified Certiorari, Merits, Amicus, Decision, Argument, and Lower courts were processed. Four scan-only documents are provided as original PDFs.','Votes are stated only where the source composition supports a simple tally or expressly unanimous result. Complex or unrecorded votes are left unset; source composition remains available.','Amicus names identify the filing entity or named group as recorded on the docket, not independently verified corporate identities.','Legal-area tags are transparent editorial keyword classifications, with source evidence.']
report={'term':'2025','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coverage':cov,'validation':{'missingTextFiles':missingFiles,'unavailableCoreDocuments':[{'id':d['id'],'title':d['title'],'sourceUrl':d['sourceUrl']} for d in missing],'scanOnlyDocuments':[{'id':d['id'],'title':d['title'],'sourceUrl':d['sourceUrl'],'pdfPath':d.get('pdfPath')} for d in coreDocs if d.get('scanOnly')],'recoveredSourceDocuments':[{'id':d['id'],'oldUrl':d['originalSourceUrl'],'url':d['sourceUrl']} for d in unique.values() if d.get('originalSourceUrl')],'profileSourceMethod':'Advocates: official transcript APPEARANCES. Amici: docket filing labels. Holdings: official Court index/syllabus. Opinions: official authored opening statements and syllabus composition; source pageIndex provided. Areas: labeled editorial keyword classification.','limits':'Automatic PDF extraction is not a manual proofread. Page boundaries retained; line wraps, headers, footnotes, scanned pages, and ligatures may need review. Part-specific joins are qualified. Some per-curiam orders have no published individual vote tally.'},'unknownOrComplexVoteCases':[{'id':c['id'],'name':c['name'],'reason':'Part-specific opinion alignment or no simple tally verified from the source','sourceUrl':c.get('decision',{}).get('compositionSourceUrl') or c['sourceUrl']} for c in cat['cases'] if c.get('decision') and not c['decision'].get('vote')]}
cat['updatedAt']=report['completedAt'];p.write_text(json.dumps(cat,ensure_ascii=False),encoding='utf-8')
for name in ['import-report.json','coverage-report.json']:(OUT/name).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
md=f'''# October Term 2025 collection — expanded core content

{cov['caseCount']} docketed matters, {cov['uniqueDocumentCount']:,} unique linked documents, {len(read):,} extracted reader documents, {cov['uniqueReadablePages']:,} source PDF pages.

## Core coverage

All {len(coreDocs):,} non-auxiliary documents categorized as Certiorari, Merits, Amicus, Decision, Argument, or Lower courts have been processed. {cov['coreReadableDocuments']:,} have extracted text; {cov['coreScanOnlyDocuments']} scan-only originals are supplied as PDFs. {len(missing)} core documents remain unavailable. Administrative filings are retained as source links and excluded from this core completeness claim.

Three stale Court URLs for the Callais post-judgment order were recovered from the Court's revised PDF; original and corrected URLs are retained.

## Relationships and decision information

Official transcript appearances identify {cov['uniqueAdvocateCount']} advocates across all {cov['advocateCaseCount']} argued docket records. {cov['amicusEntityCount']} named amicus entities/groups are connected to their filings. Case and document relationships preserve consolidated matters.

{cov['decisionCaseCount']} cases have sourced decision metadata. {cov['verifiedVoteCaseCount']} have a verified simple tally or an expressly unanimous result. Others retain the source composition and opinion breakdown without an inferred numeric vote. Separate opinions link to their starting source page. Qualified joins are not represented as unqualified joins.

Legal areas use labeled editorial keyword classification from official questions or disposition text, with the matched text and source retained. Amicus names reflect docket-listed filing entities/groups; this is not a separate entity-resolution service.

## Sources and limits

- [Official granted/noted list](https://www.supremecourt.gov/orders/25grantednotedlist.pdf)
- [Opinions of the Court](https://www.supremecourt.gov/opinions/slipopinion/25)
- [Argument transcripts](https://www.supremecourt.gov/oral_arguments/argument_transcript/2025)
- [Argument audio](https://www.supremecourt.gov/oral_arguments/argument_audio/2025)
- Individual official docket pages and PDFs, linked per record.
- Eight statutory sections from the expressly labeled 2024 U.S. Code edition, via GPO.

Text extraction preserves source pages but is not a manual proofread or OCR service. Use the original PDF when a scan, header, footnote, or extraction artifact matters. Consolidated docket numbers are counted separately; the collection includes one case dismissed before the term and additional non-argued opinions, but not every cert denial or miscellaneous order.

## Reproduction

Set COURT_DATA_DIR to dist/data. Run import_term.py, authorities.py, finalize.py, complete.py, recover_sources.py, then merge_complete.py (which invokes enrich.py). Python requires pypdf and lxml. Network is needed only for source retrieval; cached downloads are reused. Do not deploy the raw download cache.
'''
(OUT/'import-report.md').write_text(md,encoding='utf-8')
print(json.dumps(cov,indent=2));print('MISSING',len(missing),'MISSING FILES',len(missingFiles))

