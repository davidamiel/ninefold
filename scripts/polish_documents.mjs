// Derive presentation metadata without changing source text or annotation offsets.
import fs from 'node:fs';
import {briefContents} from '../dist/reader-contents.js';
const root=new URL('../dist/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const catalog=read('data/catalog.json'),current=read('data/current-term.json'),index=read('data/current-text-index.json');
const structures=JSON.parse(fs.readFileSync(new URL('../scripts/curated-reader-structure.json',root),'utf8')),supp=read('data/record-supplement.json');
const docs=new Map([...catalog.cases,...current.cases].flatMap(c=>[...c.documents,...(supp[c.id]||[])]).map(d=>[d.id,{...d,...index[d.id]}]));
for(const group of ['opinion-sections','opinion-section-overrides'])for(const list of Object.values(read('data/'+group+'.json')))for(const d of list)if(d.independentText)docs.set(d.id,d);
for(const d of catalog.authorities||[])docs.set(d.id,d);
for(const d of Object.values(read('data/cited-opinions.json')))docs.set(d.id||d.textPath.split('/').at(-1).replace('.json',''),{...d,id:d.id||d.textPath.split('/').at(-1).replace('.json',''),category:'Authority'});
const reject=/^(?:MR\.|MS\.|MRS\.|JUSTICE\b|CHIEF JUSTICE\b|APPEARANCES\b|IN THE SUPREME COURT|SUPREME COURT OF|UNITED STATES OF AMERICA|No\.|Respectfully submitted|Counsel\b|Attorney\b|APPENDIX TO|CERTIFICATE OF|TABLE OF|C O N T E N T S|P R O C E E D I N G S)/i;
const section=/^(?:(?:[IVXLC]+\.|[A-Z]\.|\d+\.)\s+\S|INTRODUCTION\b|QUESTIONS? PRESENTED\b|STATEMENT\b|SUMMARY OF (?:THE )?ARGUMENT\b|ARGUMENT\b|CONCLUSION\b|JURISDICTION\b|OPINIONS? BELOW\b|CONSTITUTIONAL\b|STATUTORY\b|INTEREST OF\b|REASONS FOR\b|BACKGROUND\b|DISCUSSION\b|STANDARD OF REVIEW\b|ORDER\b)/i;
const report={documents:0,preserved:0,headings:0,omittedPages:0,missing:[]};
for(const d of docs.values()){
 if(!d.textPath||d.textPath==='inline'||(d.parentDocumentId&&!d.independentText))continue;
 let data;try{data=read(d.textPath.replace(/^\.\//,''))}catch{report.missing.push(d.id);continue}
 if(!data.pages)continue;report.documents++;
 const pages=data.pages.map(p=>typeof p==='string'?{text:p}:p);
 if(structures[d.id]){structures[d.id].headings=(structures[d.id].headings||[]).filter(h=>!reject.test(h.text)||(typeof h.expectedText==='string'&&pages[h.page]?.text.slice(h.start,h.end)===h.expectedText));report.preserved++;continue}
 const printed=briefContents(pages),result={bodyStart:{page:0,offset:0},omitRanges:[],headings:[],repairs:[]};
 let inFront=false;
 for(let page=0;page<pages.length;page++){
  const raw=pages[page].text,lines=[...raw.matchAll(/[^\n]+/g)].map(m=>({text:m[0].trim(),start:m.index+m[0].search(/\S|$/),end:m.index+m[0].length})).filter(l=>l.text),lead=lines.slice(0,6).map(l=>l.text).join(' ');
  const bodyLine=lines.find(l=>/^(?:BY THE COURT:|PER CURIAM[.:]?|(?:I{1,3}|IV|V|VI{1,3}|IX|X)\.\s+[A-Z]|INTRODUCTION|ARGUMENT|INTEREST OF|SUMMARY OF|QUESTIONS? PRESENTED|(?:Justice|JUSTICE) .{0,70}delivered)/.test(l.text));
  const publisher=/Reporter[’']s Note|The attached opinion has been revised/.test(lead);
  const toc=printed.omit.has(page)||/\bTABLE OF (?:CONTENTS|AUTHORITIES|CITED AUTHORITIES)\b/i.test(lead)||(/^[ivxlcdm]+$/i.test(pages[page].label||'')&&/\.{3,}/.test(raw));
  const hasProse=lines.some((l,i)=>lines.slice(i,i+3).length===3&&lines.slice(i,i+3).every(x=>x.text.length>45&&(x.text.match(/[a-z]/g)||[]).length>x.text.length*.55));
  const cover=!hasProse&&page===0&&d.category!=='Lower courts'&&!bodyLine&&(/ON (?:PETITION|WRIT)|SUPREME COURT|No\.\s*\d{2}[-–]/i.test(raw))&&!/Justice\s+\w+\s+delivered|PER CURIAM|The application.*(?:granted|denied)/i.test(raw)&&!lines.some(l=>/^(?:INTRODUCTION|ARGUMENT|OPINION|ORDER)$/.test(l.text));
  if(page===0&&bodyLine&&bodyLine.start>0&&d.category==='Lower courts')result.bodyStart={page:0,offset:bodyLine.end};
  if(toc||cover||publisher){result.omitRanges.push({page,start:0,end:raw.length,reason:publisher?'Publisher note':toc?'Printed contents or authorities':'Cover'});report.omittedPages++;continue}
  const confirmed=printed.headings.filter(h=>h.page===page&&!reject.test(h.text));
  result.headings.push(...confirmed);
  if(d.category==='Argument')continue;
  let signature=lines.findIndex(l=>/^(?:Respectfully submitted|Counsel of Record|CERTIFICATE OF (?:SERVICE|COMPLIANCE))\b/i.test(l.text));
  for(let i=0;i<lines.length;i++){
   const l=lines[i];if(signature>=0&&i>=signature)break;
   if(reject.test(l.text)||l.text.length>160||!(section.test(l.text)||/^(?:I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3})$/.test(l.text))||confirmed.some(h=>l.start>=h.start&&l.start<h.end))continue;
   if(!/^(?:I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3})(?:\.\s+[A-Z]|$)/.test(l.text)&&(l.text!==l.text.toUpperCase()||!/[A-Z]{3}/.test(l.text)))continue;
   let end=l.end,text=l.text;
   while(i+1<lines.length&&text.length<240&&/^[A-Z][A-Z ,’'():;—–\-]+$/.test(lines[i+1].text)&&!section.test(lines[i+1].text)&&!reject.test(lines[i+1].text)){text+=' '+lines[++i].text;end=lines[i].end}
   result.headings.push({page,start:l.start,end,text,level:/^[A-Z]\.\s/.test(text)?1:0});
  }
 }
 for(let page=0;page<pages.length;page++){if(result.omitRanges.some(r=>r.page===page&&r.start===0&&r.end===pages[page].text.length))result.bodyStart={page:page+1,offset:0};else break}
 // Never blank a one-page order or an entire document.
 if(result.bodyStart.page>=pages.length){result.bodyStart={page:0,offset:0};result.omitRanges=[]}
 result.headings.sort((a,b)=>a.page-b.page||a.start-b.start);report.headings+=result.headings.length;structures[d.id]=result;
}
fs.writeFileSync(new URL('data/reader-structure.json',root),JSON.stringify(structures));fs.writeFileSync(new URL('data/reading-cleanup-report.json',root),JSON.stringify(report,null,2));console.log(report);
