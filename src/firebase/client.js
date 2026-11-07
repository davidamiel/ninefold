import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,connectAuthEmulator,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from 'firebase/auth';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,onSnapshot,doc,writeBatch,serverTimestamp,connectFirestoreEmulator,memoryLocalCache} from 'firebase/firestore';
export function connect(config,notify,options={}){
 const app=initializeApp(config),auth=getAuth(app),db=initializeFirestore(app,{localCache:options.emulators?memoryLocalCache():persistentLocalCache({tabManager:persistentMultipleTabManager()})});
 if(options.emulators){connectAuthEmulator(auth,options.emulators.auth,{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8188);}
 const api={user:null,ready:false,configured:true};let stops=[],revision=0,caches={},loaded=new Set(),values={},progressAt=0,progressTimer;
 const stopAuth=onAuthStateChanged(auth,user=>{
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
