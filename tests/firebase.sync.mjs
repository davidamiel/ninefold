import {test} from 'node:test';import assert from 'node:assert/strict';
import {getApp,deleteApp} from 'firebase/app';import {getFirestore,collection,getDocs,terminate,waitForPendingWrites} from 'firebase/firestore';
import {connect} from '../src/firebase/client.js';
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out waiting for account state');}
test('notes sync under the correct account and sign-out clears account state',async()=>{
 const events=[];const api=connect({apiKey:'demo-api-key',projectId:'demo-ninefold',authDomain:'demo-ninefold.firebaseapp.com',appId:'demo'},e=>events.push(e),{emulators:{auth:'http://127.0.0.1:9199'}});
 const db=getFirestore(getApp());
 try{
  await api.emailLogin('alice@example.test','correct-horse-battery',true);await until(()=>api.ready);const firstUid=api.user.uid;
  await api.save({notes:[{id:'n1',comment:'Alice private note'}],saved:['25-352'],positions:{'doc:pdf':{page:3}},recents:['doc']});await waitForPendingWrites(db);
  let notes=await getDocs(collection(db,'users',firstUid,'notes'));assert.equal(notes.size,1);assert.equal(notes.docs[0].data().value.comment,'Alice private note');
  await api.logout();await until(()=>!api.user);assert.equal(api.ready,false);assert(events.some(e=>e.type==='session'&&!e.user));
  await api.emailLogin('bob@example.test','correct-horse-battery',true);await until(()=>api.ready);assert.notEqual(api.user.uid,firstUid);assert.deepEqual(events.filter(e=>e.type==='library').at(-1).notes,[]);
  await api.logout();await until(()=>!api.user);await api.emailLogin('alice@example.test','correct-horse-battery',false);await until(()=>api.ready);
  const restored=events.filter(e=>e.type==='library').at(-1);assert.equal(restored.notes[0].comment,'Alice private note');assert.deepEqual(restored.saved,['25-352']);assert.equal(restored.positions['doc:pdf'].page,3);
 }finally{api.dispose();await terminate(db);await deleteApp(getApp());}
});
