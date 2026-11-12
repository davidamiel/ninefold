import {validateContentPatch} from '../../dist/content-patch.js';
import {initializeApp} from 'firebase/app';
import {getAuth,getIdTokenResult,onAuthStateChanged,GoogleAuthProvider,connectAuthEmulator,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'firebase/auth';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,onSnapshot,doc,getDocFromServer,getDocsFromServer,runTransaction,writeBatch,serverTimestamp,connectFirestoreEmulator,memoryLocalCache} from 'firebase/firestore';

// Keep Firestore requests bounded and batches ordered, including cleanup after failure.
function inBatches(items, size, visit) {
 const batches = [];
 for (let start = 0; start < items.length; start += size) {
  batches.push(items.slice(start, start + size));
 }
 return batches.reduce((pending, batch) => pending.then(() => visit(batch)), Promise.resolve());
}

export function connect(config,notify,options={}){
 const app=initializeApp(config),auth=getAuth(app),db=initializeFirestore(app,{localCache:options.emulators?memoryLocalCache():persistentLocalCache({tabManager:persistentMultipleTabManager()})});
 if(options.emulators){connectAuthEmulator(auth,options.emulators.auth,{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8188);}
 const publishedVersions=new Map();let publishedLoaded=false;
 const api={user:null,ready:false,configured:true};let stops=[],revision=0,caches={},loaded=new Set(),values={},progressAt=0,progressTimer;
 const stopAuth=onAuthStateChanged(auth,user=>{
  publishedVersions.clear();publishedLoaded=false;
  revision++;clearTimeout(progressTimer);progressAt=0;stops.forEach(stop=>stop());stops=[];loaded=new Set();caches={};values={};api.ready=false;api.user=user;
  notify({type:'session',user});if(!user)return;
  const generation=revision;
  for(const name of ['notes','saved','progress'])stops.push(onSnapshot(collection(db,'users',user.uid,name),snap=>{
   if(generation!==revision)return;
   values[name]=snap.docs.map(d=>d.data());caches[name]=new Map(values[name].map(x=>[x.id,JSON.stringify(x.value)]));loaded.add(name);
   if(loaded.size===3&&(!api.ready||!snap.metadata.hasPendingWrites)){api.ready=true;notify({type:'library',notes:values.notes.map(x=>x.value),saved:values.saved.map(x=>x.id),positions:Object.fromEntries(values.progress.filter(x=>x.id!=='_reading'&&!x.id.startsWith('audio:')).map(x=>[x.id,x.value])),audioProgress:Object.fromEntries(values.progress.filter(x=>x.id.startsWith('audio:')).map(x=>[x.id,x.value])),recents:values.progress.find(x=>x.id==='_reading')?.value.items||[]});}
  },error=>{api.ready=false;notify({type:'error',message:'Your library could not sync. Check your connection and try again.',error});}));
 });
 api.dispose=()=>{clearTimeout(progressTimer);stopAuth();stops.forEach(stop=>stop());};
 api.login=()=>signInWithPopup(auth,new GoogleAuthProvider());
 api.emailLogin=(email,password,create)=>create?createUserWithEmailAndPassword(auth,email,password):signInWithEmailAndPassword(auth,email,password);
 api.reset=email=>sendPasswordResetEmail(auth,email);api.logout=()=>signOut(auth);
 // Editor operations deliberately use server reads: a cached success must never imply
 // a draft was saved or content was published while offline. Rules remain authoritative.
 const contentError=(code,message)=>Object.assign(new Error(message),{code});
 const contentRef=(name,id)=>{
  if(typeof id!=='string'||!id.length||id.length>200||!/^[-a-zA-Z0-9_]+$/.test(id))throw contentError('content/invalid-id','Invalid case ID.');
  return doc(db,name,id);
 };
 const contentValue=value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length>500)throw contentError('content/invalid-value','Content must be a map with at most 500 fields.');
  const json=JSON.stringify(value);
  if(new TextEncoder().encode(json).length>64*1024*1024)throw contentError('content/invalid-value','A case may contain at most 64 MiB of JSON. Split unusually large imports into smaller documents.');
  return json;
 };
 const chunkRef=(name,caseId,id)=>doc(db,name+'Chunks',caseId,'chunks',id);
 const chunkIds=envelope=>envelope?.format==='chunked-json-v1'?envelope.chunks:[];
 const hydrate=async(name,envelope)=>{
  if(envelope?.format!=='chunked-json-v1')return envelope;
  if(!Array.isArray(envelope.chunks)||!envelope.chunks.length||envelope.chunks.length>1024)throw contentError('content/incomplete','Invalid content manifest.');
  const pieces=[];
  await inBatches(envelope.chunks, 10, async ids => {
   const reads = await Promise.all(ids.map(id => getDocFromServer(chunkRef(name, envelope.id, id))));
   for (const read of reads) {
    if (!read.exists() || typeof read.data().text !== 'string') {
     throw contentError('content/incomplete', 'Content changed or is incomplete. Reload and try again.');
    }
    pieces.push(read.data().text);
   }
  });
  return {id:envelope.id,value:JSON.parse(pieces.join('')),updatedAt:envelope.updatedAt};
 };
 const cleanup=async(name,caseId,ids)=>{
  // Rules refuse deletion of any currently referenced chunk, including after an
  // uncertain commit. Cleanup failure never misreports a committed publication.
  try {
   await inBatches(ids, 10, async group => {
    const batch = writeBatch(db);
    for (const id of group) {
     batch.delete(chunkRef(name, caseId, id));
    }
    await batch.commit();
   });
  } catch (error) {
   notify({type:'content-cleanup-warning',message:'The content operation finished, but unused storage chunks could not be removed. No older version is publicly available.',error});
  }
 };
 const stage=async(name,caseId,json,check)=>{
  const generation=crypto.randomUUID(),pieces=[];
  for (let start = 0; start < json.length;) {
   let end = Math.min(start + 65536, json.length);
   if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) {
    end--;
   }
   pieces.push(json.slice(start, end));
   start = end;
  }
  if(pieces.length>1024)throw contentError('content/invalid-value','This case exceeds the 1,024 chunk limit.');
  const ids=pieces.map((_,i)=>generation+'_'+i);
  try {
   await inBatches(ids.map((id, index) => ({id, text: pieces[index]})), 10, async group => {
    check();
    const batch = writeBatch(db);
    for (const piece of group) {
     batch.set(chunkRef(name, caseId, piece.id), {text: piece.text});
    }
    await batch.commit();
   });
   check();
  }
  catch(error){await cleanup(name,caseId,ids);throw error;}
  return {id:caseId,format:'chunked-json-v1',chunks:ids,updatedAt:serverTimestamp(),...(name==='publishedContent'?{contentSchema:2}:{})};
 };
 const sameVersion=(a,b)=>a===null?b===null:!!b&&a.seconds===b.seconds&&a.nanoseconds===b.nanoseconds;
 api.isAdmin=async()=>{
  const user=auth.currentUser,generation=revision;if(!user)return false;
  const token=await getIdTokenResult(user,true);
  return generation===revision&&auth.currentUser===user&&token.claims.contentAdmin===true;
 };
 const requireAdmin=async()=>{
  const generation=revision;
  if(!await api.isAdmin())throw contentError('permission-denied','Content administrator access is required.');
  return ()=>{if(generation!==revision)throw contentError('content/session-changed','Your account changed. Reopen the editor.');};
 };
 const readPublishedContent=async()=>{
  const generation=revision,snap=await getDocsFromServer(collection(db,'publishedContent'));
  if(generation!==revision)throw contentError('content/session-changed','Your account changed. Reload the content.');
  const hydrated = [];
  await inBatches(snap.docs, 1, async entries => {
   hydrated.push(await hydrate('publishedContent', entries[0].data()));
  });
  if(generation!==revision)throw contentError('content/session-changed','Your account changed. Reload the content.');
  publishedVersions.clear();
  for(const entry of snap.docs)publishedVersions.set(entry.id,entry.data().updatedAt);
  publishedLoaded=true;
  return hydrated;
 };
 api.loadPublishedContent=async()=>{
  try{return await readPublishedContent();}catch(error_){
   if(error_.code==='content/session-changed')throw error_;
   // A manifest swap can revoke old chunk reads during hydration. Re-read once,
   // and never return partially assembled cases from either attempt.
   try{return await readPublishedContent();}catch(error){throw contentError('content/load-failed','Published content could not be loaded completely. Reload and try again.');}
  }
 };
 api.loadContentDraft=async caseId=>{
  const check=await requireAdmin(),ref=contentRef('contentDrafts',caseId),publishedRef=contentRef('publishedContent',caseId);
  const [draft,published]=await Promise.all([getDocFromServer(ref),getDocFromServer(publishedRef)]);check();
  publishedVersions.set(caseId,published.exists()?published.data().updatedAt:null);
  const result=draft.exists()?await hydrate('contentDrafts',draft.data()):null;check();return result;
 };
 api.saveContentDraft=async(caseId,value)=>{
  const check=await requireAdmin(),ref=contentRef('contentDrafts',caseId),json=contentValue(value);
  const manifest=await stage('contentDrafts',caseId,json,check);let previous;
  try{await runTransaction(db,async transaction=>{const old=await transaction.get(ref);check();previous=old.exists()?old.data():null;transaction.set(ref,manifest);});}
  catch(error){await cleanup('contentDrafts',caseId,manifest.chunks);throw error;}
  await cleanup('contentDrafts',caseId,chunkIds(previous));check();
  const saved=await getDocFromServer(ref),result=await hydrate('contentDrafts',saved.data());check();return result;
 };
 api.publishContent=async(caseId,value,expectedUpdatedAt,beforeCommit)=>{
  const check=await requireAdmin(),ref=contentRef('publishedContent',caseId);
  try{validateContentPatch(value);if(value.caseId!==caseId)throw new Error('Case ID mismatch.');}
  catch(error){throw contentError('content/invalid-patch',error.message);}
  const json=contentValue(value);
  if(expectedUpdatedAt===undefined&&!publishedVersions.has(caseId)&&!publishedLoaded)throw contentError('content/not-loaded','Load the current content before publishing.');
  const expected=expectedUpdatedAt===undefined?(publishedVersions.get(caseId)||null):expectedUpdatedAt;
  const manifest=await stage('publishedContent',caseId,json,check);let previous;
  try{await runTransaction(db,async transaction=>{
   const current=await transaction.get(ref);check();previous=current.exists()?current.data():null;
   if(!sameVersion(expected,previous?.updatedAt||null))throw contentError('content/conflict','Published content changed. Reload and review before publishing again.');
   if (beforeCommit) {
    await beforeCommit();
   }
   check();
   transaction.set(ref, manifest);
  });}catch(error){await cleanup('publishedContent',caseId,manifest.chunks);throw error;}
  publishedVersions.clear();publishedLoaded=false;
  await cleanup('publishedContent',caseId,chunkIds(previous));check();
 };
 const deferProgress = (state, flushProgress, uid) => {
  const elapsed = Date.now() - progressAt;
  if (flushProgress || elapsed >= 15000) {
   progressAt = Date.now();
   return false;
  }
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
   if (api.user?.uid === uid) {
    api.save(state, true);
   }
  }, 15000 - elapsed);
  return true;
 };
 const collectChanges = (name, items) => {
  const cache = caches[name] || new Map();
  const changes = [];
  for (const [id, value] of items) {
   const serialized = JSON.stringify(value);
   if (serialized !== cache.get(id)) {
    changes.push({name, id, serialized});
   }
  }
  for (const id of cache.keys()) {
   if(name==='progress'&&id.startsWith('audio:'))continue;
   if (!items.has(id)) {
    changes.push({name, id, remove: true});
   }
  }
  return changes;
 };
 const rememberChanges = changes => {
  for (const change of changes) {
   const cache = caches[change.name] || (caches[change.name] = new Map());
   if (change.remove) {
    cache.delete(change.id);
   } else {
    cache.set(change.id, change.serialized);
   }
  }
 };
 const reportSaveFailure = (uid, changes, error) => {
  if (api.user?.uid !== uid) {
   return;
  }
  for (const change of changes) {
   caches[change.name]?.delete(change.id);
  }
  notify({type:'error',message:'A library change could not be saved. Please keep this tab open and retry.',error});
 };
 const queueSave = (uid, changes) => {
  const batch = writeBatch(db);
  for (const change of changes) {
   const ref = doc(db, 'users', uid, change.name, encodeURIComponent(change.id));
   if (change.remove) {
    batch.delete(ref);
   } else {
    batch.set(ref, {id: change.id, value: JSON.parse(change.serialized), updatedAt: serverTimestamp()});
   }
  }
  // Queue locally without waiting for connectivity; Firestore persists pending writes.
  const pending = batch.commit();
  rememberChanges(changes);
  pending.catch(error => reportSaveFailure(uid, changes, error));
 };
 api.saveAudioProgress=(id,value)=>{
  if(!api.user||!api.ready||!id.startsWith('audio:'))return;
  queueSave(api.user.uid,[{name:'progress',id,serialized:JSON.stringify(value)}]);
 };
 api.save = async (state, flushProgress = false) => {
  if (!api.user || !api.ready) {
   return;
  }
  const uid = api.user.uid;
  const changes = [
   ...collectChanges('notes', new Map(state.notes.map(note => [note.id, note]))),
   ...collectChanges('saved', new Map(state.saved.map(id => [id, {caseId: id}])))
  ];
  if (!deferProgress(state, flushProgress, uid)) {
   const progress = new Map([
    ...Object.entries(state.positions),
    ['_reading', {items: state.recents.slice(0, 100)}]
   ]);
   changes.push(...collectChanges('progress', progress));
  }
  for (let start = 0; start < changes.length; start += 400) {
   queueSave(uid, changes.slice(start, start + 400));
  }
 };
 return api;
}
