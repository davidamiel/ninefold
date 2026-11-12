// Use the requested relief, not the A-docket number, to describe an application.
export function applicationRelief(c) {
  const filings = (c.proceedings || []).filter(p => /application.*submitted/i.test(p.description));
  const text = filings[0]?.description || (c.documents || []).filter(d => /application/i.test(d.type || d.title)).map(d => d.description || d.title).join(' ');
  if (/stay of execution|execution of (?:the )?(?:sentence|death)/i.test(text)) return 'Stay of execution';
  if (/vacat(?:e|ing|ur)/i.test(text)) return 'Vacate an order';
  if (/stay/i.test(text)) return 'Stay';
  if (/injunct(?:ion|ive)/i.test(text)) return 'Injunction';
  if (/bail/i.test(text)) return 'Bail';
  if (/extension|extend.*time/i.test(text)) return 'Extension of time';
  return 'Other relief';
}

export function applicationEvents(c) {
  const events = (c.proceedings || []).filter(p => p.date && p.description).map(p => ({date:p.date, text:p.description}));
  // Older records sometimes have documents but no docket timeline.
  if (!events.length) for (const d of c.documents || []) if (d.date) events.push({date:d.date,text:d.title,documentId:d.id});
  const seen = new Set();
  return events.filter(e => {const key=e.date+'|'+e.text;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>b.date.localeCompare(a.date));
}

export function applicationState(c) {
  // An administrative stay is interim relief; it alone does not decide a matter.
  return c.decided || /^(decided|dismissed|withdrawn)$/i.test(c.status || '') ? 'decided' : 'pending';
}

export function applicationOutcome(c) {
  if (applicationState(c) === 'pending') return 'Pending';
  return (c.result || 'Decided').replace(/^Application\s+/i,'').replace(/\b\w/g,(ch,i)=>i===0?ch.toUpperCase():ch).trim();
}

export function applicationActivity(c) {
  return [c.decided,c.applicationFiled,...applicationEvents(c).map(e=>e.date)].filter(Boolean).sort().at(-1) || '';
}
