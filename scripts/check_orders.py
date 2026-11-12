"""Check publication inventory integrity and application-status edge cases."""
from pathlib import Path
import json,hashlib,re
from application_status import final_state
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'dist/data'
def events(*texts):return [{'date':f'2026-11-{i+1:02}','description':t} for i,t in enumerate(texts)]
assert final_state(events('Application (26A1) for a stay, submitted to Justice Kagan.','Application (26A1) denied by Justice Kagan.','Application (26A1) refiled and submitted to Justice Alito.'))[0]=='Pending'
assert final_state(events('Application (26A1) for a stay, submitted to Justice Kagan.','An administrative stay is granted pending further order of the Court.'))[0]=='Pending'
assert final_state(events('The motion to file an appendix under seal is granted. Application (26A1) denied by Justice Kagan.'))[1]=='Application Denied'
assert final_state(events('Order entered by Justice Thomas: Upon consideration of the application, it is ordered that the application for stay is DENIED.'))[1]=='Application Denied'
assert final_state(events('The lower court denied a stay. The application for stay presented to Justice Kagan and by her referred to the Court is granted.'))[1]=='Application Granted'
orders=json.loads((DATA/'court-orders.json').read_text());assert len({d['sourceUrl'] for d in orders['documents']})==len(orders['documents'])
for d in orders['documents']:
 raw=(ROOT/'dist'/d['pdfPath']).read_bytes();assert raw.startswith(b'%PDF-');assert hashlib.sha256(raw).hexdigest()==d['sourceSha256'];pages=json.loads((ROOT/'dist'/d['textPath']).read_text())['pages'];assert len(pages)==d['pageCount'];assert any(p['text'].strip() for p in pages)
for source in orders['sources']:
 if source['kind']=='Orders by circuit':assert source['documents']==sum(bool(d.get('circuitSourceUrl')) for d in orders['documents'])
 else:assert source['documents']==sum(d['sourceIndex']==source['url'] for d in orders['documents'])
current=json.loads((DATA/'current-term.json').read_text());cases={c['id']:c for c in current['cases']};assert len(cases)==len(current['cases']);assert cases['26A661']['result']=='Application Denied';assert cases['26A508']['status']=='Pending';assert cases['26A532']['status']=='Pending'
print('Order inventory, source counts, original PDF hashes, reader payloads, and application status cases passed.')
