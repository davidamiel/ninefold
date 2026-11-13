import fs from 'node:fs';
const root=new URL('../dist/',import.meta.url),base=['index.html','site.webmanifest','brand/ninefold.svg','brand/favicon.svg','brand/icon-maskable-512.png','brand/icon-192.png','brand/icon-512.png','vendor/kokoro/kokoro.web.js','vendor/firebase-client.js','vendor/pdfjs/pdf.mjs','vendor/pdfjs/pdf.worker.mjs','vendor/pdfjs/pdf_viewer.css'];
for(const file of fs.readdirSync(root))if(/\.(?:js|css)$/.test(file)&&file!=='sw.js')base.push(file);
for(const dir of ['fonts']){const absolute=new URL(dir+'/',root);if(fs.existsSync(absolute))for(const file of fs.readdirSync(absolute,{recursive:true}))if(/\.(?:woff2?|ttf|otf)$/.test(file))base.push(dir+'/'+file)}
for(const file of fs.readdirSync(new URL('data/',root)))if(file.endsWith('.json')&&!['reading-layout.json','reader-structure.json','argument-alignment.json'].includes(file))base.push('data/'+file);
base.push('data/reader-assets/index.json','data/reader-assets/arguments.json');
const packedNames=new Set(['reading-layout','catalog','current-term','argument-alignment','reader-structure','brief-precedent-summaries','precedent-index','statute-index','cited-opinions','rules-index'].map(x=>'data/'+x+'.json'));
fs.writeFileSync(new URL('offline-manifest.json',root),JSON.stringify({source:base,packed:base.map(x=>(packedNames.has(x)||x.startsWith('data/reader-assets/'))?x+'.gz':x)})+'\n');
