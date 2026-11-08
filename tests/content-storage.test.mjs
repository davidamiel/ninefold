import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

// Exercise the real adapter against an in-memory SDK double without credentials,
// network access, or cloud writes. Firestore authorization has separate emulator tests.
function setup(){
 const rows=new Map(),auth={currentUser:null};let authChanged,tick=0,claims={};
 const snap=ref=>({id:ref.id,exists:()=>rows.has(ref.path),data:()=>rows.get(ref.path)});
 const put=(ref,data)=>rows.set(ref.path,{...data,updatedAt:{seconds:++tick,nanoseconds:0}});
 const events=[];let failChunkReads=0,batchesUntilFailure=0;
 const context={Object,JSON,TextEncoder,Error,Map,Set,Date,setTimeout,clearTimeout,crypto:webcrypto,events,
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
 await assert.rejects(s.api.publishContent('25-352',{}),{code:'content/not-loaded'});
 assert.equal(await s.api.loadContentDraft('25-352'),null);
 const draft=await s.api.saveContentDraft('25-352',{summary:'Draft'});assert.equal(draft.value.summary,'Draft');assert.equal(s.rows.has('publishedContent/25-352'),false);
 await s.api.publishContent('25-352',{summary:'Published'});assert.equal((await s.api.loadPublishedContent())[0].value.summary,'Published');
 assert.equal((await s.api.loadContentDraft('25-352')).value.summary,'Draft');
 const publicRows=await s.api.loadPublishedContent();assert.equal(publicRows.length,1);assert.equal(publicRows[0].value.summary,'Published');
});
test('stale publish is rejected without overwriting another editor',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();
 s.rows.set('publishedContent/25-352',{id:'25-352',value:{summary:'Other editor'},updatedAt:{seconds:99,nanoseconds:1}});
 await assert.rejects(s.api.publishContent('25-352',{summary:'Stale'}),{code:'content/conflict'});
 assert.equal(s.rows.get('publishedContent/25-352').value.summary,'Other editor');
 await s.api.loadPublishedContent();await s.api.publishContent('25-352',{summary:'Reviewed again'});
 assert.equal((await s.api.loadPublishedContent())[0].value.summary,'Reviewed again');
});
test('invalid IDs and malformed or oversized content fail locally',async()=>{
 const s=setup();s.login({contentAdmin:true});
 for(const id of ['','../case','a/b','x'.repeat(201)])await assert.rejects(s.api.saveContentDraft(id,{}),{code:'content/invalid-id'});
 for(const value of [null,[], 'text',Object.fromEntries(Array.from({length:501},(_,i)=>['k'+i,i])),{summary:'x'.repeat(64*1024*1024+1)}])await assert.rejects(s.api.saveContentDraft('25-352',value),{code:'content/invalid-value'});
 assert.equal(s.rows.size,0);
});

test('multiple long documents round-trip across chunks and superseded sets are removed',async()=>{
 const s=setup();s.login({contentAdmin:true});
 const value={documents:[{text:'A'.repeat(1500000)},{text:'⚖️😀'.repeat(150000)}]};
 await s.api.loadContentDraft('25-352');
 const saved=await s.api.saveContentDraft('25-352',value);assert.deepEqual(saved.value,value);
 assert(s.rows.get('contentDrafts/25-352').chunks.length>20);
 await s.api.publishContent('25-352',value);assert.deepEqual((await s.api.loadPublishedContent())[0].value,value);
 const oldChunks=s.rows.get('publishedContent/25-352').chunks;
 await s.api.publishContent('25-352',{summary:'Replacement'});
 for(const id of oldChunks)assert(!s.rows.has('publishedContentChunks/25-352/chunks/'+id));
 assert.equal((await s.api.loadPublishedContent())[0].value.summary,'Replacement');
 const oldDraftChunks=s.rows.get('contentDrafts/25-352').chunks;
 await s.api.saveContentDraft('25-352',{summary:'New draft'});
 for(const id of oldDraftChunks)assert(!s.rows.has('contentDraftsChunks/25-352/chunks/'+id));
});
test('public hydration retries a manifest/chunk read race once without returning partial content',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();await s.api.publishContent('25-352',{summary:'Stable'});
 s.failReads(1);assert.equal((await s.api.loadPublishedContent())[0].value.summary,'Stable');
 s.failReads(2);await assert.rejects(s.api.loadPublishedContent(),{code:'content/load-failed'});
});

test('an interrupted multi-batch upload leaves publication unchanged and removes staged chunks',async()=>{
 const s=setup();s.login({contentAdmin:true});await s.api.loadPublishedContent();
 await s.api.publishContent('25-352',{summary:'Original'});await s.api.loadPublishedContent();
 const before=[...s.rows.keys()].sort();s.failBatchAfter(2);
 await assert.rejects(s.api.publishContent('25-352',{documents:[{text:'A'.repeat(1500000)}]}),/Upload interrupted/);
 assert.deepEqual([...s.rows.keys()].sort(),before);
 assert.equal((await s.api.loadPublishedContent())[0].value.summary,'Original');
});
