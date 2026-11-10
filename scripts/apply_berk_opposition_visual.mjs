import fs from 'node:fs';
const id='24-440-ffcc04da2f19';
const entry=JSON.parse(fs.readFileSync('reviews/berk-opposition-structure-patch.json'));
const proof=JSON.parse(fs.readFileSync('reviews/berk-opposition-visual-evidence.json'));
const doc=JSON.parse(fs.readFileSync('dist/data/docs/'+id+'.json'));
for(const r of entry.repairs)if(doc.pages[r.page].text.slice(r.start,r.end)!==r.expectedText)throw new Error('Stale opposition repair '+r.page+':'+r.start);
for(const path of ['scripts/curated-reader-structure.json','dist/data/reader-structure.json']){
 const structure=JSON.parse(fs.readFileSync(path));structure[id]=entry;fs.writeFileSync(path,JSON.stringify(structure)+'\n');
}
const path='dist/data/document-correction-evidence.json',ledger=JSON.parse(fs.readFileSync(path));
const keys=new Set(proof.corrections.map(r=>[r.page,r.start,r.end].join(':')));
ledger[id]=[...(ledger[id]||[]).filter(r=>!keys.has([r.page,r.start,r.end].join(':'))),...proof.corrections];
fs.writeFileSync(path,JSON.stringify(ledger)+'\n');
console.log('Applied opposition visual structure and registered 12 source-bound corrections');
