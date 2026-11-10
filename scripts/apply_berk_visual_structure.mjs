import fs from 'node:fs';
const id='24-440-660786c6b1c6';
const entry=JSON.parse(fs.readFileSync('reviews/berk-appendix-structure-patch.json'));
for(const path of ['scripts/curated-reader-structure.json','dist/data/reader-structure.json']){
 const structure=JSON.parse(fs.readFileSync(path));structure[id]=entry;fs.writeFileSync(path,JSON.stringify(structure)+'\n');
}
console.log('Applied visually verified Berk appendix structure');

const proof=JSON.parse(fs.readFileSync('reviews/berk-appendix-complete-visual-evidence.json'));
const path='dist/data/document-correction-evidence.json',ledger=JSON.parse(fs.readFileSync(path)),doc=JSON.parse(fs.readFileSync('dist/data/docs/'+id+'.json'));
const corrections=proof.pages.flatMap(p=>p.repairs).map(r=>{if(doc.pages[r.page].text.slice(r.start,r.end)!==r.expectedText)throw new Error('Stale appendix repair');return {page:r.page,start:r.start,end:r.end,original:r.expectedText,replacement:r.text,sourceUrl:proof.sourceUrl,sourcePage:r.page+1,sourceSha256:proof.pdfSha256,method:'Actual official PDF raster comparison; see evidence',verifiedAt:'2026-11-10',evidence:'reviews/berk-appendix-complete-visual-evidence.json'};});
const keys=new Set(corrections.map(r=>[r.page,r.start,r.end].join(':')));
ledger[id]=[...(ledger[id]||[]).filter(r=>!keys.has([r.page,r.start,r.end].join(':'))),...corrections];
fs.writeFileSync(path,JSON.stringify(ledger)+'\n');
