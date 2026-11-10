import fs from 'node:fs';
const id='24-440-660786c6b1c6';
const entry=JSON.parse(fs.readFileSync('reviews/berk-appendix-structure-patch.json'));
for(const path of ['scripts/curated-reader-structure.json','dist/data/reader-structure.json']){
 const structure=JSON.parse(fs.readFileSync(path));structure[id]=entry;fs.writeFileSync(path,JSON.stringify(structure)+'\n');
}
console.log('Applied visually verified Berk appendix structure');
