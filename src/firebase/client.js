import {initializeApp} from 'firebase/app';
import {getAuth,getIdTokenResult,onAuthStateChanged,GoogleAuthProvider,connectAuthEmulator,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'firebase/auth';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,onSnapshot,doc,getDocFromServer,getDocsFromServer,setDoc,runTransaction,writeBatch,serverTimestamp,connectFirestoreEmulator,memoryLocalCache} from 'firebase/firestore';
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
   if(loaded.size===3&&(!api.ready||!snap.metadata.hasPendingWrites)){api.ready=true;notify({type:'library',notes:values.notes.map(x=>x.value),saved:values.saved.map(x=>x.id),positions:Object.fromEntries(values.progress.filter(x=>x.id!=='_reading').map(x=>[x.id,x.value])),recents:values.progress.find(x=>x.id==='_reading')?.value.items||[]});}
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
  if(!envelope||envelope.format!=='chunked-json-v1')return envelope;
  if(!Array.isArray(envelope.chunks)||!envelope.chunks.length||envelope.chunks.length>1024)throw contentError('content/incomplete','Invalid content manifest.');
  const pieces=[];
  for(let i=0;i<envelope.chunks.length;i+=10){
   const reads=await Promise.all(envelope.chunks.slice(i,i+10).map(id=>getDocFromServer(chunkRef(name,envelope.id,id))));
   for(const read of reads){if(!read.exists()||typeof read.data().text!=='string')throw contentError('content/incomplete','Content changed or is incomplete. Reload and try again.');pieces.push(read.data().text);}
  }
  return {id:envelope.id,value:JSON.parse(pieces.join('')),updatedAt:envelope.updatedAt};
 };
 const cleanup=async(name,caseId,ids)=>{
  // Rules refuse deletion of any currently referenced chunk, including after an
  // uncertain commit. Cleanup failure never misreports a committed publication.
  try{for(let i=0;i<ids.length;i+=10){const batch=writeBatch(db);for(const id of ids.slice(i,i+10))batch.delete(chunkRef(name,caseId,id));await batch.commit();}}catch(error){notify({type:'content-cleanup-warning',message:'The content operation finished, but unused storage chunks could not be removed. No older version is publicly available.',error});}
 };
 const stage=async(name,caseId,json,check)=>{
  const generation=crypto.randomUUID(),pieces=[];
  for(let start=0;start<json.length;){let end=Math.min(start+65536,json.length);if(end<json.length&&/[\uD800-\uDBFF]/.test(json[end-1]))end--;pieces.push(json.slice(start,end));start=end;}
  if(pieces.length>1024)throw contentError('content/invalid-value','This case exceeds the 1,024 chunk limit.');
  const ids=pieces.map((_,i)=>generation+'_'+i);
  try{for(let i=0;i<pieces.length;i+=10){check();const batch=writeBatch(db);for(let j=i;j<Math.min(i+10,pieces.length);j++)batch.set(chunkRef(name,caseId,ids[j]),{text:pieces[j]});await batch.commit();}check();}
  catch(error){await cleanup(name,caseId,ids);throw error;}
  return {id:caseId,format:'chunked-json-v1',chunks:ids,updatedAt:serverTimestamp()};
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
  const hydrated=[];for(const entry of snap.docs)hydrated.push(await hydrate('publishedContent',entry.data()));
  if(generation!==revision)throw contentError('content/session-changed','Your account changed. Reload the content.');
  publishedVersions.clear();
  for(const entry of snap.docs)publishedVersions.set(entry.id,entry.data().updatedAt);
  publishedLoaded=true;
  return hydrated;
 };
 api.loadPublishedContent=async()=>{
  try{return await readPublishedContent();}catch(first){
   if(first.code==='content/session-changed')throw first;
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
 api.publishContent=async(caseId,value,expectedUpdatedAt)=>{
  const check=await requireAdmin(),ref=contentRef('publishedContent',caseId),json=contentValue(value);
  if(expectedUpdatedAt===undefined&&!publishedVersions.has(caseId)&&!publishedLoaded)throw contentError('content/not-loaded','Load the current content before publishing.');
  const expected=expectedUpdatedAt===undefined?(publishedVersions.get(caseId)||null):expectedUpdatedAt;
  const manifest=await stage('publishedContent',caseId,json,check);let previous;
  try{await runTransaction(db,async transaction=>{
   const current=await transaction.get(ref);check();previous=current.exists()?current.data():null;
   if(!sameVersion(expected,previous?.updatedAt||null))throw contentError('content/conflict','Published content changed. Reload and review before publishing again.');
   transaction.set(ref,manifest);
  });}catch(error){await cleanup('publishedContent',caseId,manifest.chunks);throw error;}
  publishedVersions.clear();publishedLoaded=false;
  await cleanup('publishedContent',caseId,chunkIds(previous));check();
 };
 api.save=async (state,flushProgress=false)=>{
  if(!api.user||!api.ready)return;const uid=api.user.uid;
  const groups={notes:new Map(state.notes.map(n=>[n.id,n])),saved:new Map(state.saved.map(id=>[id,{caseId:id}])),progress:new Map([...Object.entries(state.positions),['_reading',{items:state.recents.slice(0,100)}]])};
  const changes=[];
  for(const [name,items]of Object.entries(groups)){
   if(name==='progress'&&!flushProgress&&Date.now()-progressAt<15000){clearTimeout(progressTimer);progressTimer=setTimeout(()=>{if(api.user?.uid===uid)api.save(state,true);},15000-(Date.now()-progressAt));continue;}
   if(name==='progress')progressAt=Date.now();
   const cache=caches[name]||new Map();
   for(const [id,value]of items){const serialized=JSON.stringify(value);if(serialized!==cache.get(id))changes.push({name,id,value,serialized});}
   for(const id of cache.keys())if(!items.has(id))changes.push({name,id,remove:true});
  }
  for(let i=0;i<changes.length;i+=400){const batch=writeBatch(db),slice=changes.slice(i,i+400);
   for(const c of slice){const ref=doc(db,'users',uid,c.name,encodeURIComponent(c.id));if(c.remove)batch.delete(ref);else batch.set(ref,{id:c.id,value:JSON.parse(c.serialized),updatedAt:serverTimestamp()});}
   // Firestore applies the mutation locally immediately and persists pending writes offline.
   const pending=batch.commit();for(const c of slice){const cache=caches[c.name]||(caches[c.name]=new Map());if(c.remove)cache.delete(c.id);else cache.set(c.id,c.serialized);}pending.catch(error=>{if(api.user?.uid!==uid)return;for(const c of slice)caches[c.name]?.delete(c.id);notify({type:'error',message:'A library change could not be saved. Please keep this tab open and retry.',error});});
  }
 };
 return api;
}
