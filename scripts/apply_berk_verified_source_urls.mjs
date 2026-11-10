import fs from 'node:fs';
const path='dist/data/precedent-index.json',index=JSON.parse(fs.readFileSync(path));
const changes=JSON.parse(fs.readFileSync('reviews/berk-verified-source-url-changes.json'));
for(const r of changes){if(!index[r.citation])throw new Error('Missing '+r.citation);if(index[r.citation].sourceUrl!==r.oldSourceUrl&&index[r.citation].sourceUrl!==r.newSourceUrl)throw new Error('Changed '+r.citation);index[r.citation].sourceUrl=r.newSourceUrl;}
fs.writeFileSync(path,JSON.stringify(index)+'\n');console.log('Applied '+changes.length+' verified official PDF routes');
