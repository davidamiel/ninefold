"""Interpret explicit application dispositions without treating interim stays as final."""
import re

def final_state(procs):
 state='Pending';result=None;decided=None
 for p in procs:
  text=p['description']
  if re.match(r'Application.*(?:submitted|refiled|renewed)',text,re.I):state='Pending';result=None;decided=None
  match=re.search(r'\bapplications?(?:\s*\([^)]*\))?[^.;]{0,500}?\b(denied|granted|dismissed|withdrawn)\b',text,re.I)
  if match and not re.search(r'\bsubmitted\b',match[0],re.I):
   if re.search(r'administrative stay|interim stay',match[0],re.I):continue
   outcome=match[1].lower();tail=text[match.end():match.end()+30]
   state='Decided';decided=p['date'];result='Application '+('Denied as Moot' if outcome=='denied' and re.match(r' as moot',tail,re.I) else 'Granted in Part' if outcome=='granted' and re.match(r' in part',tail,re.I) else outcome.title())
 return state,result,decided
