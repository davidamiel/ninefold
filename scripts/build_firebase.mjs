import {build} from 'esbuild';
await build({entryPoints:['src/firebase/client.js'],bundle:true,format:'esm',target:['es2022'],minify:true,outfile:'dist/vendor/firebase-client.js',legalComments:'eof'});
