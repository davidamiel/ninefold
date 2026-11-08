// Match the reporter's first page separately from pinpoint pages. Section suffixes
// identify distinct statutes (e.g. 2000e and 2000e-2); subsections share a source.
export function citationsIn(text, civilRules, delawareAffidavit, shortCase) {
  const found=[];
  function add(pattern,type,identify) {
    for (const match of text.matchAll(pattern)) {
      const start=match.index,end=start+match[0].length;
      if (found.some(r=>start<r.end&&end>r.start)) continue;
      const canonical=identify(match);
      if (canonical) found.push({start,end,label:match[0],type,canonical});
    }
  }
  add(/\b(\d+)\s+U\.?\s*S\.?\s*C\.?(?:\s*§{1,2}\s*|\s+)(\d+[a-zA-Z]*(?:[-–]\d+[a-zA-Z]*)*)(?:\([a-zA-Z0-9]+\))*/g,'statute',
    m=>m[1]+' U.S.C. § '+m[2].replaceAll('–','-'));
  // Carry the printed U.S. Code title through an explicitly plural section list.
  for (const first of [...found]) {
    if (!first.label.includes('§§')) continue;
    const title = first.canonical.split(' ')[0];
    const listStart = first.end;
    const range = first.label.match(/(\d+)[–—](\d+)$/);
    if (range) {
      first.end -= range[2].length + 1;
      first.label = text.slice(first.start, first.end);
      first.canonical = title+' U.S.C. § '+range[1];
      found.push({start:first.end+1,end:listStart,label:range[2],type:'statute',canonical:title+' U.S.C. § '+range[2]});
    }
    const nextSection = /(?:,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)(?:§\s*)?(\d+[a-zA-Z]*(?:[-–]\d+[a-zA-Z]*)*)((?:\([a-zA-Z0-9]+\))*)/gy;
    nextSection.lastIndex = listStart;
    let match;
    while ((match=nextSection.exec(text))) {
      const label=match[1]+match[2], end=nextSection.lastIndex;
      if (/^\s+(?:U\.?\s*S\.?|F\.|S\.\s*Ct\.)/.test(text.slice(end))) break;
      found.push({start:end-label.length,end,label,type:'statute',canonical:title+' U.S.C. § '+match[1].replaceAll('–','-')});
    }
  }
  add(/\b(\d+)\s+U\.?\s*S\.?\s+(\d+)(?:,\s*\d+(?:[–-]\d+)?)?/g,'case',m=>m[1]+' U.S. '+m[2]);
  add(/\b(\d+)\s+F\s*\.\s*(?:(2d|3d|4th|Supp\.?(?:\s*(?:2d|3d))?)\s+)(\d+)(?:,\s*\d+(?:[–-]\d+)?)?/gi,'case',
    m=>m[1]+' F.'+m[2].replace(/\s+/g,' ')+' '+m[3]);
  add(/\b(\d+)\s+S\.\s*Ct\.\s*(\d+)(?:,\s*\d+(?:[–-]\d+)?)?/g,'case',m=>m[1]+' S. Ct. '+m[2]);
  add(/\b(\d+)\s+L\.\s*Ed\.\s*(?:(2d)\s+)?(\d+)(?:,\s*\d+(?:[–-]\d+)?)?/g,'case',m=>m[1]+' L. Ed.'+(m[2]?' '+m[2]:'')+' '+m[3]);
  add(/\b(\d+)\s+Stat\.\s*(\d+)(?:[–-]\d+)?/g,'statute',m=>m[1]+' Stat. '+m[2]);
  add(/\b(\d+)\s+C\.\s*F\.\s*R\.\s*(?:§{1,2}\s*)?(\d+(?:\.\d+)?)(?:\([a-zA-Z0-9]+\))*/g,'statute',m=>m[1]+' C.F.R. § '+m[2]);
  if (shortCase) {
    add(/\b(\d+)\s+(U\.?\s*S\.?|F\s*\.\s*(?:2d|3d|4th)),?\s+at\s+\d+(?:[–-]\d+)?/gi,'case',
      m=>shortCase(m[1],m[2],text.slice(Math.max(0,m.index-120),m.index))||m[0].replace(/\s+/g,' '));
  }
  add(/\bFed(?:eral)?\.?\s*R(?:ules?)?\.?\s*(?:of\s+)?(Civ(?:il)?|App(?:ellate)?|Crim(?:inal)?)\.?\s*P(?:rocedure)?\.?\s*(\d+(?:\.\d+)?)(?:\([a-z0-9]+\))*/gi,'statute',
    m=>'Fed. R. '+({civ:'Civ.',app:'App.',cri:'Crim.'})[m[1].slice(0,3).toLowerCase()]+' P. '+m[2]);
  add(/\bFed(?:eral)?\.?\s*R(?:ules?)?\.?\s*(?:of\s+)?Evid(?:ence)?\.?\s*(\d+)(?:\([a-z0-9]+\))*/gi,'statute',
    m=>'Fed. R. Evid. '+m[1]);
  add(/\b(FRCP|FRAP|FRE)\s+(\d+(?:\.\d+)?)(?:\([a-z0-9]+\))*/g,'statute',
    m=>({FRCP:'Fed. R. Civ. P. ',FRAP:'Fed. R. App. P. ',FRE:'Fed. R. Evid. '})[m[1]]+m[2]);
  if (civilRules) add(/\bRule\s+(\d{1,2}(?:\.\d+)?)(?!\d)(?:\([a-z0-9]+\))*/g,'statute',m=>'Fed. R. Civ. P. '+m[1]);
  if (delawareAffidavit) add(/(?:\b18\s+Del\.?\s+C\.?\s*§?\s*|\bSection\s+|§\s*)6853(?:\([a-z0-9]+\))*/g,'statute',()=>'18 Del. C. § 6853');
  add(/\b((?:Pet\.?\s+)?App\.|J\.?\s*A\.?)\s*(?:at\s+)?(\d+[a-z]?)\b/g,'appendix',m=>m[0].replace(/\s+/g,' '));
  add(/\b(?:CA\s*\d{1,2}\s*[-–]?\s*)?(?:ECF|Dkt\.?|Docket)\s*(?:No\.?\s*)?\d+(?:[-–]\d+)?(?:\s*,?\s*(?:at|p{1,2}\.)\s*\d+(?:[-–]\d+)?)?/gi,'record',m=>m[0].replace(/\s+/g,' '));
  for(const hit of found.filter(x=>x.type==='case')){
    const prefix=text.slice(Math.max(0,hit.start-220),hit.start);
    const name=caseNameBefore(prefix) || (/\bat\s+\d/.test(hit.label)?shortNameBefore(prefix):null);
    if(name){const start=hit.start-name.trailing.length;if(!found.some(x=>x!==hit&&start<x.end&&hit.end>x.start)){hit.start=start;hit.caseName=name.name;hit.label=text.slice(start,hit.end)}}
  }
  return found.sort((a,b)=>a.start-b.start);
}

export function passageAround(text,start,end) {
  // Context belongs to the citing document, not to the cited authority. Keep a
  // complete sentence (including a following standalone citation) when it fits.
  // Never disguise an arbitrary character-window cut as a sentence beginning.
  let paragraphStart=0,paragraphEnd=text.length;
  for(const gap of text.matchAll(/\n\s*\n/g)) {
    if(gap.index+gap[0].length<=start) paragraphStart=gap.index+gap[0].length;
    else if(gap.index>=end) {paragraphEnd=gap.index;break}
  }
  const starts=[paragraphStart];
  const paragraph=text.slice(paragraphStart,paragraphEnd);
  for(const stop of paragraph.matchAll(/[.!?][”’"')\]]*\s+(?=[A-Z0-9“‘"(])/g)) {
    const prefix=paragraph.slice(0,stop.index+1);
    // Legal and ordinary abbreviations do not mark sentence boundaries.
    if(stop[0][0]==='.'&&(/\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|Inc|Corp|Co|Ltd|No|Nos|Art|Sec|Ch|Vol|App|Pet|Resp|Supp|Cir|Dist|Bankr|Fed|Cal|Va|Mass|Conn|Del|Pa|Fla|Tex|Wash|Mich|Wis|Minn|Ill|Ind|Ohio|Rev|Stat|v)\.$/i.test(prefix)||/(?:\b[A-Za-z]\.){2,}$/.test(prefix)||/(?:^|\s)[A-Z]\.$/.test(prefix))) continue;
    starts.push(paragraphStart+stop.index+stop[0].length);
  }
  let sentence=starts.findLastIndex(at=>at<=start);
  // A cite such as "JA92 ¶¶ 6, 8." supports the preceding sentence. Include it,
  // instead of showing only the citation or unrelated earlier fragments.
  if(sentence>0&&/^(?:(?:See(?: also)?|But see|Cf\.|Accord|Compare)\s*)?$/.test(text.slice(starts[sentence],start).trim())) sentence--;
  let left=starts[sentence],right=starts.find(at=>at>=end)??paragraphEnd;
  let clippedLeft=false,clippedRight=false;
  if(start-left>320) {
    left=start-320;
    while(left<start&&/\S/.test(text[left])) left++;
    clippedLeft=true;
  }
  if(right-end>200) {
    right=end+200;
    while(right>end&&/\S/.test(text[right])) right--;
    clippedRight=true;
  }
  const passage=text.slice(left,right).replace(/\s+/g,' ').trim();
  // A page may itself start in the middle of a sentence.
  clippedLeft ||= left===0&&/^[a-z]/.test(passage);
  clippedRight ||= right===text.length&&!/[.!?][”’"')\]]*$/.test(passage);
  return (clippedLeft?'… ':'')+passage+(clippedRight?' …':'');
}

export function excerptOf(text,limit=600) {
  const flat=String(text||'').replace(/\s+/g,' ').trim();
  if(flat.length<=limit) return flat;
  return flat.slice(0,limit).replace(/\s+\S*$/,'')+'…';
}

const namesByDocument=new WeakMap();
// Read the case names printed in this filing's table of authorities. Treat this
// as bibliographic information only; an advocate's description is not a holding.
export function citedNames(data) {
  if(!data) return new Map();
  if(namesByDocument.has(data)) return namesByDocument.get(data);
  const names=new Map();
  let inTable=false;
  for(const page of data.pages.slice(0,45)) {
    const raw=page.text||'',lead=raw.slice(0,180);
    if(/(?:TABLE OF (?:CITED )?AUTHORITIES|Cited Authorities)/i.test(lead)) inTable=true;
    else if(!/\.{3,}/.test(raw)) inTable=false;
    if(!inTable) continue;
    for(const block of raw.split(/\.{2,}[^\n]*\n/)) {
      const clean=block.replace(/^[\s\S]*\n(?:CASES:|Page)\s*\n/i,'').trim();
      for(const item of citationsIn(clean,false,false)) {
        if(item.type!=='case') continue;
        const name=item.caseName||clean.slice(0,item.start).trim().replace(/[,\s]+$/,'').replace(/\s+/g,' ');
        const year=clean.slice(item.end,item.end+85).match(/^[^\n)]{0,70}\b((?:17|18|19|20)\d\d)\)/)?.[1];
        if(name.length>3&&name.length<=180&&/(?:\bv\.\s|^In re\s|^Ex parte\s)/i.test(name)) names.set(item.canonical,{name,year});
        break;
      }
    }
  }
  for(const page of data.pages)for(const hit of citationsIn(page.text||'',false,false))if(hit.type==='case'&&hit.caseName&&!names.has(hit.canonical))names.set(hit.canonical,{name:hit.caseName});
  namesByDocument.set(data,names);
  return names;
}

const shortForms = new WeakMap();
const letters = text => text.toLowerCase().replace(/[^a-z0-9]/g,'');
export function shortCaseIn(data,volume,reporter,prefix) {
  if (!data) return null;
  if (!shortForms.has(data)) {
    const index=new Map();
    for (const [cite,{name}] of citedNames(data)) {
      const match=cite.match(/^(\d+) (.+) \d+$/);
      if (!match) continue;
      const key=match[1]+letters(match[2]);
      if (!index.has(key)) index.set(key,[]);
      index.get(key).push({cite,name});
    }
    shortForms.set(data,index);
  }
  const candidates=shortForms.get(data).get(volume+letters(reporter));
  const name=shortNameBefore(prefix)?.name.replace(/^(?:In re|Ex parte)\s+/,'');
  if (!name || !candidates || /^(?:United States|United|State|City|In re|Appellant|Petitioner|Respondent)$/i.test(name)) return null;
  const words=name.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').trim();
  if (words.length<3) return null;
  const matches=candidates.filter(c=>(' '+c.name.toLowerCase().replace(/[^a-z0-9]+/g,' ')+' ').includes(' '+words+' '));
  return matches.length===1?matches[0].cite:null;
}

function stripSignal(name){return name.replace(/^(?:(?:See|But|Cf\.|Compare|Accord|E\.g\.,|e\.g\.,|citing)\s+)+/,'')}
function caseNameBefore(prefix){
 const word="(?:[\\p{Lu}][\\p{L}0-9’'&.−-]*,?|of|the|and|for|in|ex|rel\\.|[0-9]+)";
 const pattern=new RegExp('((?:(?:In re|Ex parte)\\s+'+word+'(?:\\s+'+word+'){0,9}|'+word+'(?:\\s+'+word+'){0,9}\\s+v\\.\\s+'+word+'(?:\\s+'+word+'){0,9})),\\s*$','u');
 const match=prefix.match(pattern);if(!match)return null;const name=stripSignal(match[1].replace(/\s+/g,' ').trim());const at=match[0].indexOf(name.split(' ')[0]);return {name,trailing:match[0].slice(Math.max(0,at))};
}
function shortNameBefore(prefix){const match=prefix.match(/((?:(?:In re|Ex parte)\s+)?[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*){0,4}),\s*$/u);if(!match)return null;const name=stripSignal(match[1]);return {name,trailing:match[0].slice(match[0].indexOf(name))}}
