import fs from 'node:fs';import path from 'node:path';
const root=new URL('../dist/',import.meta.url),base=['index.html','site.webmanifest','brand/ninefold.svg','brand/favicon.svg','brand/icon-maskable-512.png','brand/icon-192.png','brand/icon-512.png','vendor/kokoro/kokoro.web.js','vendor/firebase-client.js','vendor/pdfjs/pdf.mjs','vendor/pdfjs/pdf.worker.mjs','vendor/pdfjs/pdf_viewer.css'];
for(const file of fs.readdirSync(root))if(/\.(?:js|css)$/.test(file)&&file!=='sw.js')base.push(file);
for(const dir of ['fonts']){const absolute=new URL(dir+'/',root);if(fs.existsSync(absolute))for(const file of fs.readdirSync(absolute,{recursive:true}))if(/\.(?:woff2?|ttf|otf)$/.test(file))base.push(dir+'/'+file)}
for(const file of fs.readdirSync(new URL('data/',root)))if(file.endsWith('.json'))base.push('data/'+file);
const packedNames=new Set(['reading-layout','catalog','current-term','argument-alignment','reader-structure','brief-precedent-summaries','precedent-index','statute-index','cited-opinions','rules-index'].map(x=>'data/'+x+'.json'));
fs.writeFileSync(new URL('offline-manifest.json',root),JSON.stringify({source:base,packed:base.map(x=>packedNames.has(x)?x+'.gz':x)})+'\n');
