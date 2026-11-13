import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk(path.join(dist,'data')).filter(f=>f.endsWith('.json')&&!f.includes(path.sep+'reader-assets'+path.sep)&&path.basename(f)!=='content-base-version.json');
for(const name of ['app.js','reader-authorities.js','reader-contents.js','content-model.js'])files.push(path.join(dist,name));
const hash=crypto.createHash('sha256');for(const file of files.sort()){hash.update(path.relative(dist,file).split(path.sep).join('/'));hash.update('\0');hash.update(fs.readFileSync(file));hash.update('\0');}
fs.writeFileSync(path.join(dist,'data/content-base-version.json'),JSON.stringify({schema:1,version:hash.digest('hex')})+'\n');
