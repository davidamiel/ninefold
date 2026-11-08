import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {validateContentPatch} from '../dist/content-patch.js';
const patch=description=>({schema:2,caseId:'25-352',baseVersion:null,fields:{description},documents:{},addedDocuments:[],removedDocuments:[]});

// Exercise the real adapter against an in-memory SDK double without credentials,
// network access, or cloud writes. Firestore authorization has separate emulator tests.
function setup(){
 const rows=new Map(),auth={currentUser:null};let authChanged,tick=0,claims={};
 const snap=ref=>({id:ref.id,exists:()=>rows.has(ref.path),data:()=>rows.get(ref.path)});
 const put=(ref,data)=>rows.set(ref.path,{...data,updatedAt:{seconds:++tick,nanoseconds:0}});
 const events=[];let failChunkReads=0,batchesUntilFailure=0;
 const context={Object,JSON,TextEncoder,Error,Map,Set,Date,setTimeout,clearTimeout,crypto:webcrypto,events,validateContentPatch,
  initializeApp:()=>({}),getAuth:()=>auth,initializeFirestore:()=>({}),memoryLocalCache:()=>({}),persistentLocalCache:()=>({}),persistentMultipleTabManager:()=>({}),
  onAuthStateChanged:(_auth,fn)=>{authChanged=fn;fn(null);return()=>{};},getIdTokenResult:async()=>({claims}),
  onSnapshot:()=>()=>{},collection:(_db,...parts)=>parts.join('/'),doc:(_db,...parts)=>({path:parts.join('/'),id:parts.at(-1)}),
  getDocFromServer:async ref=>{if(ref.path.includes('/chunks/')&&failChunkReads-->0)throw Error('Manifest changed');return snap(ref);},getDocsFromServer:async path=>({docs:[...rows.keys()].filter(key=>key.startsWith(path+'/')&&key.split('/').length===2).map(key=>snap({path:key,id:key.split('/').at(-1)}))}),
  writeBatch:()=>{const changes=[];return {set:(ref,data)=>changes.push(()=>put(ref,data)),delete:ref=>changes.push(()=>rows.delete(ref.path)),commit:async()=>{if(batchesUntilFailure>0&&--batchesUntilFailure===0)throw Error('Upload interrupted');changes.forEach(fn=>fn());}};},
  serverTimestamp:()=>null,setDoc:async(ref,data)=>put(ref,data),runTransaction:async(_db,fn)=>fn({get:async ref=>snap(ref),set:put}),
  signInWithPopup:()=>{},GoogleAuthProvider:function(){},signInWithEmailAndPassword:()=>{},createUserWithEmailAndPassword:()=>{},sendPasswordResetEmail:()=>{},signOut:()=>{},
 };
 const source=readFileSync(new URL('../src/firebase/client.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function connect','function connect');
 vm.runInNewContext(source+'\nglobalThis.api=connect({},event=>events.push(event));',context);
 return {api:context.api,rows,events,failReads(count){failChunkReads=count;},failBatchAfter(count){batchesUntilFailure=count;},login(nextClaims={}){claims=nextClaims;auth.currentUser={uid:'editor'};authChanged(auth.currentUser);}};
}
test('editor API only accepts the exact admin claim and does not grant account users access',async()=>{
 const s=setup();assert.equal(await s.api.isAdmin(),false);
 for(const claims of [{},{admin:true},{contentAdmin:'true'},{contentAdmin:false}]){s.login(claims);assert.equal(await s.api.isAdmin(),false);await assert.rejects(s.api.saveContentDraft('25-352',{}),{code:'permission-denied'});await assert.rejects(s.api.loadContentDraft('25-352'),{code:'permission-denied'});}
 s.login({contentAdmin:true});assert.equal(await s.api.isAdmin(),true);
});
test('drafts stay separate and publishing requires a reviewed baseline',async()=>{
 const s=setup();s.login({contentAdmin:true});
 await assert.rejects(s.api.publishContent('25-352',patch('')),{code:'content/not-loaded'});
 assert.equal(await s.api.loadContentDraft('25-352'),null);
 const draft=await s.api.saveContentDraft('25-352',{summary:'Draft'});assert.equal(draft.value.summary,'Draft');assert.equal(s.rows.has('publishedContent/25-352'),false);
 await s.api.publishContent('25-352',patch('Published'));assert.equal((await s.api.loadPublishedContent())[0].value.fields.description,'Published');
 assert.equal((await s.api.loadContentDraft('25-352')).value.summary,'Draft');
 const publicRows=await s.api.loadPublishedContent();assert.equal(publicRows.length,1);assert.equal(publicRows[0].value.fields.description,'Published');
});
test('stale publish is rejected without overwriting another editor',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();
 s.rows.set('publishedContent/25-352',{id:'25-352',value:{summary:'Other editor'},updatedAt:{seconds:99,nanoseconds:1}});
 await assert.rejects(s.api.publishContent('25-352',patch('Stale')),{code:'content/conflict'});
 assert.equal(s.rows.get('publishedContent/25-352').value.summary,'Other editor');
 await s.api.loadPublishedContent();await s.api.publishContent('25-352',patch('Reviewed again'));
 assert.equal((await s.api.loadPublishedContent())[0].value.fields.description,'Reviewed again');
});
test('invalid IDs and malformed or oversized content fail locally',async()=>{
 const s=setup();s.login({contentAdmin:true});
 for(const id of ['','../case','a/b','x'.repeat(201)])await assert.rejects(s.api.saveContentDraft(id,{}),{code:'content/invalid-id'});
 for(const value of [null,[], 'text',Object.fromEntries(Array.from({length:501},(_,i)=>['k'+i,i])),{summary:'x'.repeat(64*1024*1024+1)}])await assert.rejects(s.api.saveContentDraft('25-352',value),{code:'content/invalid-value'});
 assert.equal(s.rows.size,0);
});

test('multiple long documents round-trip across chunks and superseded sets are removed',async()=>{
 const s=setup();s.login({contentAdmin:true});
 const value={...patch(''),documents:{'doc-one':{content:{pages:[{label:'1',markdown:'A'.repeat(1500000)}],references:[]}},'doc-two':{content:{pages:[{label:'1',markdown:'⚖️😀'.repeat(150000)}],references:[]}}}};
 await s.api.loadContentDraft('25-352');
 const saved=await s.api.saveContentDraft('25-352',value);assert.deepEqual(saved.value,value);
 assert(s.rows.get('contentDrafts/25-352').chunks.length>20);
 await s.api.publishContent('25-352',value);assert.deepEqual((await s.api.loadPublishedContent())[0].value,value);
 const oldChunks=s.rows.get('publishedContent/25-352').chunks;
 await s.api.publishContent('25-352',patch('Replacement'));
 for(const id of oldChunks)assert(!s.rows.has('publishedContentChunks/25-352/chunks/'+id));
 assert.equal((await s.api.loadPublishedContent())[0].value.fields.description,'Replacement');
 const oldDraftChunks=s.rows.get('contentDrafts/25-352').chunks;
 await s.api.saveContentDraft('25-352',{summary:'New draft'});
 for(const id of oldDraftChunks)assert(!s.rows.has('contentDraftsChunks/25-352/chunks/'+id));
});
test('public hydration retries a manifest/chunk read race once without returning partial content',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();await s.api.publishContent('25-352',patch('Stable'));
 s.failReads(1);assert.equal((await s.api.loadPublishedContent())[0].value.fields.description,'Stable');
 s.failReads(2);await assert.rejects(s.api.loadPublishedContent(),{code:'content/load-failed'});
});

test('an interrupted multi-batch upload leaves publication unchanged and removes staged chunks',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();
 await s.api.publishContent('25-352',patch('Original'));await s.api.loadPublishedContent();
 const before=[...s.rows.keys()].sort();s.failBatchAfter(2);
 await assert.rejects(s.api.publishContent('25-352',patch('A'.repeat(1500000))),/Upload interrupted/);
 assert.deepEqual([...s.rows.keys()].sort(),before);
 assert.equal((await s.api.loadPublishedContent())[0].value.fields.description,'Original');
});

test('publication rejects full snapshots and malformed sparse patches before uploading',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();
 for(const value of [{schema:1,caseId:'25-352',documents:[]},{summary:'Old publisher'}, {...patch(''),caseId:'other-case'}, {...patch(''),fields:{docket:'Frozen metadata'}}, {...patch(''),schema:3}]){
  await assert.rejects(s.api.publishContent('25-352',value),{code:'content/invalid-patch'});
  assert.equal(s.rows.size,0);
 }
 await s.api.publishContent('25-352',patch('Only this intentional edit'));
 assert.equal(s.rows.get('publishedContent/25-352').contentSchema,2);
 await s.api.saveContentDraft('25-352',{schema:3,privateDraft:true});
 assert.equal(Object.hasOwn(s.rows.get('contentDrafts/25-352'),'contentSchema'),false);
});
test('beforeCommit failure preserves publication and cleans pending chunks',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();
 await s.api.publishContent('25-352',patch('Original'));await s.api.loadPublishedContent();
 const before=[...s.rows.entries()];let checked=false;
 await assert.rejects(s.api.publishContent('25-352',patch('Unsafe'),undefined,async()=>{checked=true;throw Error('Import changed before commit');}),/Import changed before commit/);
 assert.equal(checked,true);assert.deepEqual([...s.rows.entries()],before);
 assert.equal((await s.api.loadPublishedContent())[0].value.fields.description,'Original');
});
test('legacy inline and chunked publications remain readable without migration',async()=>{
 const s=setup();const value={schema:1,caseId:'legacy-case',documents:[]};
 s.rows.set('publishedContent/legacy-case',{id:'legacy-case',value,updatedAt:{seconds:1,nanoseconds:0}});
 s.rows.set('publishedContent/legacy-chunks',{id:'legacy-chunks',format:'chunked-json-v1',chunks:['old'],updatedAt:{seconds:2,nanoseconds:0}});
 s.rows.set('publishedContentChunks/legacy-chunks/chunks/old',{text:JSON.stringify(value)});
 const before=[...s.rows.entries()],loaded=await s.api.loadPublishedContent();
 assert.equal(loaded.length,2);for(const entry of loaded)assert.equal(entry.value.schema,1);
 assert.deepEqual([...s.rows.entries()],before);
});
