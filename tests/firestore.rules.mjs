import {readFile} from 'node:fs/promises';
import {test,after,before} from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,deleteDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ninefold',firestore:{rules:await readFile('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
const note=db=>doc(db,'users/alice/notes/n1');
const data=()=>({id:'n1',value:{id:'n1',comment:'Private annotation'},updatedAt:serverTimestamp()});
test('anonymous clients cannot read or write personal data',async()=>{const db=env.unauthenticatedContext().firestore();await assertFails(getDoc(note(db)));await assertFails(setDoc(note(db),data()));});
test('an owner can save, read, and delete their note',async()=>{const db=env.authenticatedContext('alice').firestore();await assertSucceeds(setDoc(note(db),data()));await assertSucceeds(getDoc(note(db)));await assertSucceeds(deleteDoc(note(db)));});
test('another signed-in account cannot read or alter the library',async()=>{const db=env.authenticatedContext('bob').firestore();await assertFails(getDoc(note(db)));await assertFails(setDoc(note(db),data()));await assertFails(deleteDoc(note(db)));});
test('unknown collections and malformed writes are denied',async()=>{const db=env.authenticatedContext('alice').firestore();await assertFails(setDoc(doc(db,'users/alice/admin/settings'),data()));await assertFails(setDoc(note(db),{...data(),owner:'bob'}));await assertFails(setDoc(note(db),{id:'n1',value:'invalid',updatedAt:serverTimestamp()}));});
test('saved cases and progress are owner-only too',async()=>{const db=env.authenticatedContext('alice').firestore();for(const name of ['saved','progress'])await assertSucceeds(setDoc(doc(db,`users/alice/${name}/one`),{id:'one',value:{caseId:'25-352'},updatedAt:serverTimestamp()}));});

test('public content is readable but drafts and writes require an explicit boolean contentAdmin claim',async()=>{
 const admin=env.authenticatedContext('editor',{contentAdmin:true}).firestore();
 const entry={id:'25-352',value:{summary:'Reviewed summary'},updatedAt:serverTimestamp()};
 for(const name of ['contentDrafts','publishedContent'])await assertSucceeds(setDoc(doc(admin,name,'25-352'),entry));
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('reader'),env.authenticatedContext('pretender',{admin:true,contentAdmin:'true'}),env.authenticatedContext('revoked',{contentAdmin:false})]){
  const db=context.firestore();
  await assertSucceeds(getDoc(doc(db,'publishedContent','25-352')));
  await assertSucceeds(getDocs(collection(db,'publishedContent')));
  await assertFails(getDocs(collection(db,'contentDrafts')));
  await assertFails(getDoc(doc(db,'contentDrafts','25-352')));
  for(const name of ['contentDrafts','publishedContent']){
   await assertFails(setDoc(doc(db,name,'25-352'),entry));
   await assertFails(deleteDoc(doc(db,name,'25-352')));
  }
 }
 await assertSucceeds(getDoc(doc(admin,'contentDrafts','25-352')));
});
test('content envelopes enforce identity, field bounds and server timestamps, even for administrators',async()=>{
 const db=env.authenticatedContext('editor',{contentAdmin:true}).firestore();
 for(const name of ['contentDrafts','publishedContent']){
  const ref=doc(db,name,'25-352');
  const valid={id:'25-352',value:{summary:'Reviewed'},updatedAt:serverTimestamp()};
  for(const invalid of [{...valid,id:'other'}, {...valid,extra:true}, {...valid,value:[]}, {...valid,value:'text'}, {...valid,value:Object.fromEntries(Array.from({length:501},(_,i)=>['k'+i,i]))}, {...valid,updatedAt:new Date(0)}, {id:'25-352',value:{}}])await assertFails(setDoc(ref,invalid));
  await assertFails(setDoc(doc(db,name,'invalid.case'),{...valid,id:'invalid.case'}));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db,name,'25-352','nested','entry'),valid));
 }
});

test('immutable staged publication chunks become public only while referenced by the current manifest',async()=>{
 const admin=env.authenticatedContext('chunk-editor',{contentAdmin:true}).firestore(),reader=env.unauthenticatedContext().firestore();
 const caseId='chunk-security',chunk=(db,id)=>doc(db,'publishedContentChunks',caseId,'chunks',id),manifest=doc(admin,'publishedContent',caseId);
 await assertSucceeds(setDoc(chunk(admin,'first'),{text:'{"summary":"First"}'}));
 await assertFails(getDoc(chunk(reader,'first')));
 await assertFails(setDoc(chunk(admin,'first'),{text:'Changed'}));
 await assertFails(setDoc(chunk(reader,'malicious'),{text:'Bad'}));
 await assertSucceeds(setDoc(manifest,{id:caseId,format:'chunked-json-v1',chunks:['first'],updatedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(chunk(reader,'first')));
 await assertFails(getDocs(collection(reader,'publishedContentChunks',caseId,'chunks')));
 await assertFails(deleteDoc(chunk(admin,'first')));
 await assertSucceeds(setDoc(chunk(admin,'second'),{text:'{"summary":"Second"}'}));
 await assertFails(getDoc(chunk(reader,'second')));
 await assertSucceeds(setDoc(manifest,{id:caseId,format:'chunked-json-v1',chunks:['second'],updatedAt:serverTimestamp()}));
 await assertFails(getDoc(chunk(reader,'first')));
 await assertSucceeds(getDoc(chunk(reader,'second')));
 await assertSucceeds(deleteDoc(chunk(admin,'first')));
 await assertFails(setDoc(chunk(admin,'oversized'),{text:'x'.repeat(262145)}));
 await assertFails(setDoc(chunk(admin,'extra'),{text:'x',extra:true}));
 await assertFails(setDoc(manifest,{id:caseId,format:'chunked-json-v1',chunks:[],updatedAt:serverTimestamp()}));
 await assertFails(setDoc(manifest,{id:caseId,format:'chunked-json-v1',chunks:Array(1025).fill('second'),updatedAt:serverTimestamp()}));
});
test('private draft chunks never become public and only unreferenced chunks can be cleaned up',async()=>{
 const admin=env.authenticatedContext('draft-editor',{contentAdmin:true}).firestore(),reader=env.authenticatedContext('ordinary').firestore();
 const path=['contentDraftsChunks','draft-security','chunks','one'];
 await assertSucceeds(setDoc(doc(admin,...path),{text:'Private draft'}));
 await assertFails(getDoc(doc(reader,...path)));
 await assertSucceeds(setDoc(doc(admin,'contentDrafts','draft-security'),{id:'draft-security',format:'chunked-json-v1',chunks:['one'],updatedAt:serverTimestamp()}));
 await assertFails(deleteDoc(doc(admin,...path)));
 await assertFails(setDoc(doc(admin,...path),{text:'Mutation'}));
 await assertFails(getDoc(doc(reader,...path)));
});


test('atomic batches cannot reference a chunk and delete it in the same commit',async()=>{
 const admin=env.authenticatedContext('atomic-editor',{contentAdmin:true}).firestore();
 for(const name of ['contentDrafts','publishedContent'])for(const exists of [false,true]){
  const caseId='atomic-'+name+'-'+exists,manifest=doc(admin,name,caseId),chunk=id=>doc(admin,name+'Chunks',caseId,'chunks',id);
  await assertSucceeds(setDoc(chunk('staged'),{text:'Staged content'}));
  if(exists){await assertSucceeds(setDoc(chunk('current'),{text:'Current content'}));await assertSucceeds(setDoc(manifest,{id:caseId,format:'chunked-json-v1',chunks:['current'],updatedAt:serverTimestamp()}));}
  const batch=writeBatch(admin);batch.set(manifest,{id:caseId,format:'chunked-json-v1',chunks:['staged'],updatedAt:serverTimestamp()});batch.delete(chunk('staged'));
  await assertFails(batch.commit());
  const untouched=await assertSucceeds(getDoc(chunk('staged')));if(!untouched.exists())throw Error('Rejected batch deleted staged content');
  const original=await assertSucceeds(getDoc(manifest));if(original.exists()!==exists||(exists&&original.data().chunks[0]!=='current'))throw Error('Rejected batch changed manifest');
 }
});
test('atomic manifest replacement may clean up only chunks absent from the resulting manifest',async()=>{
 const admin=env.authenticatedContext('replacement-editor',{contentAdmin:true}).firestore();
 for(const name of ['contentDrafts','publishedContent']){
  const caseId='replace-'+name,manifest=doc(admin,name,caseId),chunk=id=>doc(admin,name+'Chunks',caseId,'chunks',id);
  for(const id of ['old','next'])await assertSucceeds(setDoc(chunk(id),{text:id}));
  await assertSucceeds(setDoc(manifest,{id:caseId,format:'chunked-json-v1',chunks:['old'],updatedAt:serverTimestamp()}));
  const batch=writeBatch(admin);batch.set(manifest,{id:caseId,format:'chunked-json-v1',chunks:['next'],updatedAt:serverTimestamp()});batch.delete(chunk('old'));
  await assertSucceeds(batch.commit());
  if((await getDoc(chunk('old'))).exists()||!(await getDoc(chunk('next'))).exists())throw Error('Incorrect atomic cleanup result');
 }
});
test('content administrators cannot access another user’s private library',async()=>{
 const owner=env.authenticatedContext('library-owner').firestore(),admin=env.authenticatedContext('library-editor',{contentAdmin:true}).firestore();
 for(const name of ['notes','saved','progress']){
  const path=['users','library-owner',name,'private'],entry={id:'private',value:{text:'Owner only'},updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(owner,...path),entry));
  await assertFails(getDoc(doc(admin,...path)));await assertFails(getDocs(collection(admin,'users','library-owner',name)));
  await assertFails(setDoc(doc(admin,...path),entry));await assertFails(deleteDoc(doc(admin,...path)));
  await assertSucceeds(setDoc(doc(admin,'users','library-editor',name,'own'),{id:'own',value:{text:'Own record'},updatedAt:serverTimestamp()}));
 }
});
test('public chunk membership is scoped to its exact case and never authorizes draft chunks',async()=>{
 const admin=env.authenticatedContext('scope-editor',{contentAdmin:true}).firestore(),reader=env.unauthenticatedContext().firestore();
 for(const caseId of ['scope-a','scope-b'])await assertSucceeds(setDoc(doc(admin,'publishedContentChunks',caseId,'chunks','shared-id'),{text:caseId}));
 await assertSucceeds(setDoc(doc(admin,'contentDraftsChunks','scope-a','chunks','shared-id'),{text:'Private draft'}));
 await assertSucceeds(setDoc(doc(admin,'publishedContent','scope-a'),{id:'scope-a',format:'chunked-json-v1',chunks:['shared-id'],updatedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(reader,'publishedContentChunks','scope-a','chunks','shared-id')));
 await assertFails(getDoc(doc(reader,'publishedContentChunks','scope-b','chunks','shared-id')));
 await assertFails(getDoc(doc(reader,'contentDraftsChunks','scope-a','chunks','shared-id')));
 await assertSucceeds(deleteDoc(doc(admin,'publishedContentChunks','scope-b','chunks','shared-id')));
 await assertFails(deleteDoc(doc(admin,'publishedContentChunks','scope-a','chunks','shared-id')));
});
