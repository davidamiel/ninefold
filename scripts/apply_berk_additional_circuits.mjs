import fs from 'node:fs';
const path='dist/data/precedent-index.json',index=JSON.parse(fs.readFileSync(path)),report=JSON.parse(fs.readFileSync('reviews/berk-schmigel-abbas-routing.json'));
for(const [key,value]of Object.entries(report.entries)){if(index[key]&&JSON.stringify(index[key])!==JSON.stringify(value))throw new Error('Existing entry '+key);index[key]=value;}
fs.writeFileSync(path,JSON.stringify(index)+'\n');
