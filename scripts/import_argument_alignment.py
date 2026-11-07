import json,ssl,urllib.request,concurrent.futures,time,html,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'
ctx=ssl.create_default_context()
if hasattr(ssl,'enum_certificates'):
 for store in ('ROOT','CA'):
  for cert,encoding,trust in ssl.enum_certificates(store):
   if encoding=='x509_asn':
    try:ctx.load_verify_locations(cadata=ssl.DER_cert_to_PEM_cert(cert))
    except ssl.SSLError:pass

def fetch(url):
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Curia research reader (Oyez transcript import)'})
   with urllib.request.urlopen(req,context=ctx,timeout=25) as r:return json.load(r)
  except Exception:
   if attempt==2:raise
   time.sleep(1+attempt)

def one(c):
 key=str(c['id']);url=f"https://api.oyez.org/cases/{c.get('term','2025')}/{key}"
 try:
  case=fetch(url);sessions=[]
  if not isinstance(case,dict):raise ValueError('No individual Oyez case record at this docket URL')
  for media in case.get('oral_argument_audio') or []:
   if media.get('unavailable') or not media.get('href'):continue
   raw=fetch(media['href']);audio=next((m['href'] for m in raw.get('media_file',[]) if m.get('mime')=='audio/mpeg'),None)
   if not audio:continue
   turns=[]
   for section_index,section in enumerate((raw.get('transcript') or {}).get('sections',[])):
    for turn in section.get('turns',[]):
     start,end=turn.get('start'),turn.get('stop')
     if not isinstance(start,(int,float)) or not isinstance(end,(int,float)) or end<start:continue
     blocks=[{'start':b.get('start'),'end':b.get('stop'),'text':html.unescape(b.get('text','')).strip()} for b in turn.get('text_blocks',[]) if b.get('text')]
     text=' '.join(b['text'] for b in blocks)
     if not text:continue
     speaker=turn.get('speaker') or {}
     turns.append({'start':start,'end':end,'speaker':speaker.get('name','Unidentified speaker'),'speakerUrl':speaker.get('href'),'text':text,'blocks':blocks,'section':section_index})
   if turns:sessions.append({'id':str(raw['id']),'title':raw.get('title') or media.get('title'),'audioUrl':audio,'sourceUrl':media['href'],'turns':turns})
  return key,{'caseSourceUrl':url,'attribution':'Transcript and timing: Oyez','licenseUrl':'https://creativecommons.org/licenses/by-nc/4.0/','licenseSourceUrl':'https://www.oyez.org/license','adaptationNote':'Speaker turns and timing from Oyez; HTML entities decoded and edge whitespace trimmed for display.','attributionUrl':'https://www.oyez.org/cases/'+str(c.get('term','2025'))+'/'+key,'sessions':sessions},None
 except Exception as e:return key,None,str(e)

catalog=json.loads((DIST/'data/catalog.json').read_text(encoding='utf-8'))
catalog['cases'] += json.loads((DIST/'data/current-term.json').read_text(encoding='utf-8')).get('cases',[])
selected_ids=set(sys.argv[1:] or ['--all'])
selected=[c for c in catalog['cases'] if c.get('argued') and ('--all' in selected_ids or str(c['id']) in selected_ids)]
out=json.loads((DIST/'data/argument-alignment.json').read_text(encoding='utf-8'));errors={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for key,item,error in pool.map(one,selected):
  if error:errors[key]=error;print('Unavailable',key,error,flush=True)
  elif item['sessions']:
   if out.get(key,{}).get('timingMethod')=='speech-aligned':print('Retained stable official transcript alignment',key,flush=True)
   else:out[key]=item;print('Imported',key,sum(len(s['turns']) for s in item['sessions']),flush=True)
  else:print('No timed session',key,flush=True)
# A consolidated docket can share the exact session already referenced by its companion.
byid={str(c['id']):c for c in catalog['cases']}
for c in selected:
 key=str(c['id'])
 if key in out:continue
 for other in c.get('relatedDockets',[]):
  other=str(other)
  if other in out and byid.get(other,{}).get('argued')==c.get('argued'):
   # Require Oyez itself to identify the companion docket before reusing its media.
   try:
    source=fetch(out[other]['caseSourceUrl'])
    extras=source.get('additional_docket_numbers') or []
    official_shared=c.get('audio',{}).get('url')==byid.get(other,{}).get('audio',{}).get('url') and any('consolidat' in p.get('description','').lower() and other in p.get('description','') for p in c.get('proceedings',[]))
    if key not in json.dumps(extras) and not official_shared:continue
    out[key]={**out[other],'sharedSessionFrom':other};print('Consolidated',key,other,flush=True);break
   except Exception:pass
(DIST/'data/argument-alignment.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('SUMMARY',json.dumps({'arguedCases':len(selected),'alignedCases':len(out),'sessions':sum(len(x['sessions']) for x in out.values()),'turns':sum(len(s['turns']) for x in out.values() for s in x['sessions']),'missing':[c['id'] for c in selected if c['id'] not in out],'errors':errors}),flush=True)
