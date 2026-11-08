import {compileMarkdown,validateContent} from './content-model.js';
import {normalizePDFURL} from './pdf-source.js';

const forbidden=new Set(['__proto__','prototype','constructor']);
const caseFields=['name','description','questions'];
const docFields=['title','category','pdfUrl','content'];
const own=(v,k)=>Object.hasOwn(v,k);
const copy=v=>structuredClone(v);
function object(v,keys){
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Expected a plain content object.');
 for(const k of Reflect.ownKeys(v))if(typeof k!=='string'||forbidden.has(k)||(keys&&!keys.includes(k))||!('value' in Object.getOwnPropertyDescriptor(v,k)))throw Error('Unknown or unsafe content field: '+String(k));
}
function string(v,label,required=false){if(typeof v!=='string'||(required&&!v.trim()))throw Error('Invalid '+label+'.');}
function id(v){if(typeof v!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(v)||forbidden.has(v))throw Error('Invalid document or case ID.');}
function content(v){
 object(v,['revision','pages','references']);
 if(own(v,'revision'))string(v.revision,'content revision');
 if(!Array.isArray(v.pages)||!Array.isArray(v.references))throw Error('Content needs pages and references.');
 const ids=new Set(),numbers=new Set();
 for(const r of v.references){object(r,['id','number','name','label','canonical','type']);id(r.id);if(!/^[\w-]+$/.test(r.id)||ids.has(r.id)||!Number.isInteger(r.number)||r.number<1||numbers.has(r.number))throw Error('Authorities need unique IDs and numbers.');ids.add(r.id);numbers.add(r.number);string(r.name,'authority name',true);for(const k of ['label','canonical','type'])if(own(r,k))string(r[k],'authority '+k);}
 for(const p of v.pages){object(p,['label','markdown']);string(p.label,'page label');string(p.markdown,'page text');compileMarkdown(p.markdown,v.references);}
}
function fields(v,document=false){
 object(v,document?docFields:caseFields);
 for(const [k,x]of Object.entries(v)){
  if(k==='questions'){if(!Array.isArray(x))throw Error('Invalid questions.');for(const q of x){object(q);if(own(q,'label'))string(q.label,'question label');string(q.text,'question text');}}
  else if(k==='content')content(x);
  else {string(x,k,k==='name'||k==='title'||k==='category');if(k==='pdfUrl')normalizePDFURL(x);}
 }
}
function added(v){object(v,['id',...docFields]);id(v.id);if(!v.id.startsWith('authored-')||v.id==='authored-')throw Error('New documents need authored IDs.');if(!own(v,'title')||!own(v,'category')||!own(v,'content'))throw Error('Added documents need full authored records.');const {id:ignored,...rest}=v;fields(rest,true);}
function equal(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>own(b,k)&&equal(a[k],b[k]));
}
function sameContent(a,b){if(!a||!b)return a===b;const {revision:ar,...av}=a,{revision:br,...bv}=b;return equal(av,bv);}

// Publications only express intentional changes. Imported metadata and future
// collection additions remain outside this contract and are never serialized.
export function validateContentPatch(patch){
 object(patch,['schema','caseId','baseVersion','fields','documents','addedDocuments','removedDocuments']);
 if(patch.schema!==2)throw Error('Expected sparse content schema 2; legacy full snapshots cannot be published.');
 id(patch.caseId);
 if(!own(patch,'baseVersion')||!(patch.baseVersion===null||typeof patch.baseVersion==='string'))throw Error('Invalid imported base version.');
 fields(patch.fields);object(patch.documents);
 if(!Array.isArray(patch.addedDocuments)||!Array.isArray(patch.removedDocuments))throw Error('Invalid document additions or removals.');
 const used=new Set();
 for(const [key,value]of Object.entries(patch.documents)){id(key);fields(value,true);used.add(key);}
 for(const d of patch.addedDocuments){added(d);if(used.has(d.id))throw Error('Duplicate or conflicting document ID.');used.add(d.id);}
 for(const key of patch.removedDocuments){id(key);if(used.has(key))throw Error('Duplicate or conflicting document ID.');used.add(key);}
 if(new TextEncoder().encode(JSON.stringify(patch)).length>64*1024*1024)throw Error('Case patch exceeds the 64 MiB safety limit.');
 return patch;
}

export function createContentPatch(baseSnapshot,editedSnapshot,{contentSeeds=new Map(),baseVersion=null}={}){
 validateContent(baseSnapshot);validateContent(editedSnapshot);
 if(baseSnapshot.caseId!==editedSnapshot.caseId)throw Error('Case ID mismatch.');
 const base=new Map(baseSnapshot.documents.map(d=>[d.id,d])),edited=new Map(editedSnapshot.documents.map(d=>[d.id,d]));
 const patch={schema:2,caseId:baseSnapshot.caseId,baseVersion,fields:{},documents:{},addedDocuments:[],removedDocuments:[]};
 for(const k of caseFields)if(!equal(baseSnapshot[k],editedSnapshot[k]))patch.fields[k]=copy(editedSnapshot[k]);
 for(const d of editedSnapshot.documents){id(d.id);const previous=base.get(d.id);if(!previous){patch.addedDocuments.push(copy(d));continue;}const changed={};
  for(const k of docFields){if(!own(d,k))continue;if(k==='content'){
   if(sameContent(previous.content,d.content))continue;
   if(!previous.content&&contentSeeds.has(d.id)&&sameContent(contentSeeds.get(d.id),d.content))continue;
  }else if(equal(previous[k],d[k])||k==='pdfUrl'&&!previous[k]&&!d[k])continue;
  changed[k]=copy(d[k]);
  }
  if(Object.keys(changed).length)patch.documents[d.id]=changed;
 }
 for(const d of baseSnapshot.documents)if(!edited.has(d.id))patch.removedDocuments.push(d.id);
 return validateContentPatch(patch);
}

export function applyContentPatch(baseSnapshot,patch){
 validateContent(baseSnapshot);validateContentPatch(patch);
 if(baseSnapshot.caseId!==patch.caseId)throw Error('Case ID mismatch.');
 const result=copy(baseSnapshot),removed=new Set(patch.removedDocuments),baseIds=new Set(result.documents.map(d=>d.id));
 for(const d of patch.addedDocuments)if(baseIds.has(d.id))throw Error('Added document cannot overwrite an imported ID.');
 Object.assign(result,copy(patch.fields));
 result.documents=result.documents.filter(d=>!removed.has(d.id)).map(d=>Object.assign(d,copy(patch.documents[d.id]||{})));
 result.documents.push(...copy(patch.addedDocuments));
 // Unknown update/removal IDs can belong to an older import; do not resurrect
// those records, or turn their absence into removal of newly imported records.
 return validateContent(result);
}
