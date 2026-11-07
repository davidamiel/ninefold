import json
import import_term as imp
OUT=imp.OUT
p=OUT/'completion-results.json'
items=json.loads(p.read_text(encoding='utf-8'))
for d in items:
 if '25a1197_097c.pdf' not in d['sourceUrl']:continue
 d['originalSourceUrl']=d['sourceUrl']
 d['sourceUrl']='https://www.supremecourt.gov/opinions/25pdf/25a1197_h31i.pdf'+('#page=4' if '#page=4' in d['originalSourceUrl'] else '')
 d['category']='Decision';d['type']='Post-judgment opinion'
 d['title']='Opinion on issuing the judgment forthwith — '+('Jackson dissent' if '#page' in d['sourceUrl'] else 'Alito concurrence')
 d['pageIndex']=3 if '#page' in d['sourceUrl'] else 0
 imp.extraction_task(d)
 print(d['id'],d.get('textPath'),d.get('pageCount'))
p.write_text(json.dumps(items,ensure_ascii=False),encoding='utf-8')
print('Recovered source records; original URLs retained for provenance.')

