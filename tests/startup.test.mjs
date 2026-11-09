import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('dist/app.js','utf8');

test('startup sees initialized collection and reader state',()=>{
 const noop=()=>{};
 const element={addEventListener:noop,style:{setProperty:noop},classList:{add:noop,remove:noop}};
 let starts=0;
 const context=vm.createContext({
  document:{querySelector:()=>element,querySelectorAll:()=>[],addEventListener:noop,body:element},
  window:{addEventListener:noop,matchMedia:()=>({addEventListener:noop,matches:true})},
  localStorage:{getItem:()=>null},
  Audio:class{addEventListener(){}},
  MutationObserver:class{observe(){}},
  pdfjsLib:{GlobalWorkerOptions:{}},
  onStartup(state){
   starts++;
   assert.equal(state.loadedContentBase,null);
   assert.equal(state.importedCaseContent.size,0);
   assert.equal(state.appliedContentPatches.size,0);
   for(const key of ['readingLayout','argumentAlignment','pdfPaths','readerStructure','referenceSummaries'])
    assert.equal(Object.keys(state[key]).length,0);
  }
 });
 // Execute module setup in its real order, probing state at the startup call.
 // Import implementations and network/rendering are outside this ordering test.
 assert.equal((source.match(/^init\(\);$/gm)||[]).length,1);
 const setup=source.replace(/^import .+;\r?\n/gm,'')
  .replace(/^init\(\);$/m,'onStartup({loadedContentBase,importedCaseContent,appliedContentPatches,readingLayout,argumentAlignment,pdfPaths,readerStructure,referenceSummaries});');
 vm.runInContext(setup,context);
 assert.equal(starts,1);
});
