import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function declaration(name){const line=source.split('\n').find(l=>l.startsWith('function '+name+'(')||l.startsWith('async function '+name+'('));assert.ok(line,name);if(name!=='openDoc')return line;const start=source.indexOf(line);return source.slice(start,source.indexOf('\nfunction ',start+line.length));}
const fields=['tabs','active','split','paneOrder','refs','ref','side','tool','docGroup','pdfDocs','tabCases'];
function setup(){
 const state={route:'library',caseId:'A',workspaceId:'A',tabs:['a'],active:'a',split:null,refs:[],pdfDocs:[],tabCases:{a:'A'},recents:[],workspaces:{B:{tabs:['b'],active:'b',pdfDocs:[],tabCases:{b:'B'}}},notes:[{id:'note',docId:'b',sourceDocId:'b-pdf'}]};
 const docs=new Map([['a',{id:'a',caseId:'A'}],['b',{id:'b',caseId:'B',timedSession:{},pdfSourceId:'b-pdf'}]]);
 const location={hash:'#/reader/A?doc=a'};
 const c=vm.createContext({state,docs,workspaceFields:fields,structuredClone,URLSearchParams,caseMap:new Map([['A',{id:'A',documents:[{id:'a'}]}],['B',{id:'B',documents:[{id:'b'}]}]]),cases:[{id:'A'}],ds:id=>docs.get(id),caseDocuments:c=>c.documents||[],getCase:()=>state.caseId,canonicalDocId:x=>x,rememberReaderReturn(){},storePositions(){},clearPeek(){},render(){},rememberDocumentFormat(){},ensureDoc:async()=>{},renderPDF:async()=>{},nativePDF:()=>false,app:{querySelector:()=>null},CSS:{escape:x=>x},location,termYears:()=>[2026],defaultSitting:()=> 'November Sitting',readerEditing:()=>false,document:{querySelectorAll:s=>s==='.pane'?[{dataset:{pane:'a'},classList:{toggle(){}}},{dataset:{pane:'b'},classList:{toggle(){}}}]:[]},refreshSidebar(){},persist(){},historyReady:true,restoringHistory:false,history:{pushState(a,b,url){location.hash=url}}});
 vm.runInContext(['documentCaseId','contextCase','saveWorkspace','switchWorkspace','openDoc','goNote','locationKey','decodeRoutePart','readLocation','focusReaderPane','syncLocation'].map(declaration).join('\n'),c);return c;
}
test('cross-workspace PDF note chooses its representation after workspace switch',async()=>{
 const c=setup();await vm.runInContext("goNote('note')",c);assert.equal(c.state.active,'b');assert.deepEqual(Array.from(c.state.pdfDocs),['b']);assert.deepEqual(c.state.workspaces.A.pdfDocs,[]);
});
test('cross-workspace transcript note clears saved PDF representation without changing old workspace',async()=>{
 const c=setup();c.state.notes[0].sourceDocId='b';c.state.pdfDocs=['a'];c.state.workspaces.B.pdfDocs=['b'];await vm.runInContext("goNote('note')",c);assert.deepEqual(Array.from(c.state.pdfDocs),[]);assert.deepEqual(c.state.workspaces.A.pdfDocs,['a']);
});
test('same-workspace note follows the same format rule',async()=>{
 const c=setup();vm.runInContext("switchWorkspace('B')",c);await vm.runInContext("goNote('note')",c);assert.deepEqual(Array.from(c.state.pdfDocs),['b']);
});
test('case sitting and area round-trip through history URL',()=>{
 for(const termView of ['sittings','all']){const c=setup();Object.assign(c.state,{route:'cases',termView,termExplicit:true,browseTerm:2026,sitting:'January Sitting',termArea:'Civil rights & procedure',query:''});c.location.hash=vm.runInContext('locationKey()',c);vm.runInContext('readLocation()',c);assert.equal(c.state.sitting,'January Sitting');assert.equal(c.state.termArea,'Civil rights & procedure');assert.equal(c.state.termView,termView);}
});
test('missing filter parameters reset stale filters',()=>{
 const c=setup();Object.assign(c.state,{termArea:'Old area',sitting:'Old sitting'});c.location.hash='#/cases?term=2026';vm.runInContext('readLocation()',c);assert.equal(c.state.termArea,'');assert.equal(c.state.sitting,'November Sitting');
});
test('malformed route escaping never prevents collection navigation',()=>{
 for(const hash of ['#/case/%','#/profile/justices/%E0%A4%A','#/%ZZ']){const c=setup();c.location.hash=hash;assert.doesNotThrow(()=>vm.runInContext('readLocation()',c));}
 const c=setup();assert.equal(vm.runInContext("decodeRoutePart('Civil%20rights')",c),'Civil rights');
});
test('split focus synchronizes workspace and URL and survives route restore',()=>{
 const c=setup();Object.assign(c.state,{route:'reader',active:'a',split:'b',tabs:['a','b']});c.docs.get('b').caseId='A';vm.runInContext("focusReaderPane('b')",c);assert.equal(c.state.active,'b');assert.equal(c.state.workspaces.A.active,'b');assert.equal(new URLSearchParams(c.location.hash.split('?')[1]).get('doc'),'b');vm.runInContext('readLocation()',c);assert.equal(c.state.active,'b');assert.deepEqual(Array.from(c.state.paneOrder),['a','b']);
});

test('shared filing remains in either originating case across open and history restore',()=>{
 for(const origin of ['A','B']){const c=setup();c.caseMap.get('A').documents.push({id:'b'});Object.assign(c.state,{route:'case',caseId:origin});vm.runInContext("openDoc('b')",c);assert.equal(c.state.workspaceId,origin);assert.equal(c.state.tabCases.b,origin);assert.equal(vm.runInContext("contextCase('b').id",c),origin);c.location.hash=vm.runInContext('locationKey()',c);vm.runInContext("switchWorkspace('A');readLocation()",c);assert.equal(c.state.workspaceId,origin);assert.equal(c.state.active,'b');}
});
test('split shared filing preserves existing workspace and companion document',()=>{
 const c=setup();c.caseMap.get('A').documents.push({id:'b'});c.state.route='reader';vm.runInContext("openDoc('b',{split:true})",c);assert.equal(c.state.workspaceId,'A');assert.equal(c.state.active,'a');assert.equal(c.state.split,'b');assert.deepEqual(Array.from(c.state.tabs),['a','b']);assert.equal(vm.runInContext("contextCase('b').id",c),'A');
});
test('unrelated filing and invalid remembered ownership resolve to actual owner',()=>{
 const c=setup();c.state.route='case';c.state.tabCases.b='A';assert.equal(vm.runInContext("contextCase('b').id",c),'B');vm.runInContext("openDoc('b')",c);assert.equal(c.state.workspaceId,'B');c.location.hash='#/reader/A?doc=b';vm.runInContext('readLocation()',c);assert.equal(c.state.workspaceId,'B');assert.equal(c.state.tabCases.b,'B');
});
test('canonical aliases use effective case membership, including authored removals',()=>{
 const c=setup();c.canonicalDocId=id=>id==='legacy-b'?'b':id;c.caseMap.get('A').documents.push({id:'legacy-b'});c.state.route='case';vm.runInContext("openDoc('legacy-b')",c);assert.equal(c.state.active,'b');assert.equal(c.state.workspaceId,'A');c.caseMap.get('A').documents=[{id:'a'}];assert.equal(vm.runInContext("documentCaseId('b','A')",c),'B');
});
test('ownerless authorities remain in chosen workspace while unrelated profile opens use document owner',()=>{
 const c=setup();c.docs.set('authority',{id:'authority'});c.state.route='reader';vm.runInContext("openDoc('authority')",c);assert.equal(c.state.workspaceId,'A');assert.equal(vm.runInContext("contextCase('authority').id",c),'A');c.caseMap.get('A').documents.push({id:'b'});c.state.route='profile';vm.runInContext("openDoc('b')",c);assert.equal(c.state.workspaceId,'B','stale selected case is not an origin on profile pages');
});
test('real consolidated filings preserve each effective member case',()=>{
 const c=setup();const all=['catalog','current-term'].flatMap(name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name+'.json',import.meta.url),'utf8')).cases).map(x=>({...x,id:String(x.id||x.docket)}));c.caseMap=new Map(all.map(x=>[x.id,x]));c.docs=new Map(all.flatMap(x=>x.documents.map(d=>({...d,caseId:x.id}))).map(d=>[d.id,d]));c.ds=id=>c.docs.get(id);c.editedCaseDocuments=new Map();c.opinionSections=JSON.parse(fs.readFileSync(new URL('../dist/data/opinion-sections.json',import.meta.url),'utf8'));vm.runInContext(declaration('caseDocuments'),c);const shared=new Map();for(const cs of all)for(const d of vm.runInContext(`caseDocuments(caseMap.get(${JSON.stringify(cs.id)}))`,c)){if(!c.docs.has(d.id))continue;const members=shared.get(d.id)||new Set();members.add(cs.id);shared.set(d.id,members);}let checked=0;for(const [id,members]of shared){if(members.size<2)continue;for(const origin of members){assert.equal(vm.runInContext(`documentCaseId(${JSON.stringify(id)},${JSON.stringify(origin)})`,c),origin);checked++;}}assert.ok(checked>10,'exercise real consolidated collection, not only synthetic cases');
});
