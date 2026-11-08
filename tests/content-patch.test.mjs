import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContentPatch,applyContentPatch,validateContentPatch} from '../dist/content-patch.js';
const clone=v=>structuredClone(v);
const text=(markdown='Imported text',revision='r1')=>({revision,pages:[{label:'1',markdown}],references:[]});
const base=()=>({schema:1,caseId:'case-1',name:'Case',description:'Holding',questions:[{label:'Question',text:'Why?'}],documents:[{id:'opinion-1',title:'Opinion',category:'Decision'},{id:'transcript-1',title:'Transcript',category:'Argument'}]});
const empty=()=>({schema:2,caseId:'case-1',baseVersion:null,fields:{},documents:{},addedDocuments:[],removedDocuments:[]});

test('opening and saving a case without edits produces an empty sparse publication',()=>{
 assert.deepEqual(createContentPatch(base(),base()),empty());
});
test('importing editable text without changing it is a no-op even after a revision changes',()=>{
 const imported=base(),edited=clone(imported),seed=text();edited.documents[0].content={...clone(seed),revision:'other'};
 assert.deepEqual(createContentPatch(imported,edited,{contentSeeds:new Map([['opinion-1',seed]])}),empty());
});
test('case and document metadata edits do not publish imported text or reader relationships',()=>{
 const imported=base(),edited=clone(imported),seed=text();edited.name='New title';edited.documents[0].title='New opinion title';edited.documents[0].content=clone(seed);
 const patch=createContentPatch(imported,edited,{contentSeeds:new Map([['opinion-1',seed]])});
 assert.deepEqual(patch.fields,{name:'New title'});assert.deepEqual(patch.documents,{'opinion-1':{title:'New opinion title'}});
 for(const field of ['content','independentText','sourceRange','parentDocumentId','timedSession','pdfSourceId'])assert.ok(!Object.hasOwn(patch.documents['opinion-1'],field));
 assert.deepEqual(applyContentPatch(imported,patch),{...imported,name:'New title',documents:[{...imported.documents[0],title:'New opinion title'},imported.documents[1]]});
});
test('intentional text and authority changes are explicit and survive later metadata edits',()=>{
 const imported=base(),edited=clone(imported);edited.documents[0].content=text('Authored **text**');
 const first=createContentPatch(imported,edited),reopened=applyContentPatch(imported,first);reopened.description='New holding';
 const second=createContentPatch(imported,reopened);assert.deepEqual(second.documents,first.documents);assert.deepEqual(second.fields,{description:'New holding'});
 const seed=text();edited.documents[0].content={...seed,references:[{id:'r1',number:1,name:'Authority'}]};
 assert.ok(createContentPatch(imported,edited,{contentSeeds:new Map([['opinion-1',seed]])}).documents['opinion-1'].content);
});
test('unchanged authored content revision does not turn metadata edits into text edits',()=>{
 const imported=base();imported.documents[0].content=text();const edited=clone(imported);edited.documents[0].content.revision='new';edited.documents[0].category='Other';
 assert.deepEqual(createContentPatch(imported,edited).documents,{'opinion-1':{category:'Other'}});
});
test('future imported fields and new documents survive an older sparse publication',()=>{
 const imported=base(),edited=clone(imported);edited.name='Explicit name';edited.documents[0].title='Explicit title';
 const patch=createContentPatch(imported,edited,{baseVersion:'old'}),future=base();future.description='Fresh holding';future.documents[0].category='Other';future.documents.push({id:'new-import',title:'New filing',category:'Merits'});
 const result=applyContentPatch(future,patch);assert.equal(result.name,'Explicit name');assert.equal(result.description,'Fresh holding');assert.equal(result.documents[0].title,'Explicit title');assert.equal(result.documents[0].category,'Other');assert.deepEqual(result.documents[2],future.documents[2]);
});
test('explicit additions and removals persist, without hiding or deleting future imports',()=>{
 const imported=base(),edited=clone(imported),authored={id:'authored-123',title:'Analysis',category:'Other',pdfUrl:'https://example.org/download',content:text('New')};
 edited.documents.shift();edited.documents.push(authored);const patch=createContentPatch(imported,edited);
 assert.deepEqual(patch.removedDocuments,['opinion-1']);assert.deepEqual(patch.addedDocuments,[authored]);
 const future=base();future.documents.push({id:'new-import',title:'Fresh filing',category:'Merits'});
 assert.deepEqual(applyContentPatch(future,patch).documents.map(d=>d.id),['transcript-1','new-import','authored-123']);
 assert.deepEqual(createContentPatch(imported,applyContentPatch(imported,patch)),patch);
});
test('inputs and returned snapshots have no mutable aliases',()=>{
 const imported=base(),edited=clone(imported);edited.documents[0].content=text('Changed');const before=clone(imported),patch=createContentPatch(imported,edited),result=applyContentPatch(imported,patch);
 result.questions[0].text='Result only';result.documents[0].content.pages[0].markdown='Result only';patch.documents['opinion-1'].content.pages[0].markdown='Patch only';
 assert.deepEqual(imported,before);assert.equal(edited.documents[0].content.pages[0].markdown,'Changed');
});
test('strict validation rejects legacy snapshots, unsafe keys, unknown fields, invalid types and URLs',()=>{
 assert.throws(()=>validateContentPatch(base()));
 for(const change of [p=>p.unrecognized=true,p=>p.fields.hidden=true,p=>p.fields.name=3,p=>p.fields.questions=[{label:'Q',text:7}],p=>p.documents.x={content:null},p=>p.documents.x={title:''},p=>p.documents.x={pdfUrl:'javascript:alert(1)'},p=>p.documents.x={pdfUrl:'https://user:secret@example.org/file.pdf'},p=>p.baseVersion={},p=>p.removedDocuments=[false]]){const p=empty();change(p);assert.throws(()=>validateContentPatch(p));}
 const p=empty();p.documents=JSON.parse('{"__proto__":{"title":"bad"}}');assert.throws(()=>validateContentPatch(p));
 for(const key of ['constructor','prototype']){const p=empty();p.documents[key]={title:'bad'};assert.throws(()=>validateContentPatch(p));}
});
test('strict validation rejects malformed authored pages and references',()=>{
 for(const change of [c=>c.hidden=true,c=>c.pages[0].markdown=3,c=>c.pages[0].sourceRange={},c=>c.references=[{id:'r',number:0,name:'Bad'}],c=>c.references=[{id:'r',number:1,name:'One'},{id:'s',number:1,name:'Two'}],c=>c.pages[0].markdown='[@missing]']){const p=empty(),c=text();change(c);p.documents.x={content:c};assert.throws(()=>validateContentPatch(p));}
});
test('duplicate IDs, conflicting operations and attempts to overwrite imported IDs are rejected',()=>{
 const authored={id:'authored-a',title:'Authored',category:'Other',content:text()};
 for(const change of [p=>p.removedDocuments=['x','x'],p=>{p.documents.x={title:'X'};p.removedDocuments=['x'];},p=>p.addedDocuments=[authored,authored],p=>{p.documents['authored-a']={title:'X'};p.addedDocuments=[authored];},p=>p.addedDocuments=[{...authored,id:'imported'}]]){const p=empty();change(p);assert.throws(()=>validateContentPatch(p));}
 const p=empty();p.addedDocuments=[authored];const imported=base();imported.documents.push(clone(authored));assert.throws(()=>applyContentPatch(imported,p),/overwrite/);
});
test('removals refer to actual IDs, not a hidden flag, and absent old imports are not recreated',()=>{
 const p=empty();p.removedDocuments=['already-gone'];p.documents['old-import']={title:'Old edit'};
 assert.deepEqual(applyContentPatch(base(),p),base());
 p.documents['opinion-1']={hidden:true};assert.throws(()=>validateContentPatch(p));
});
test('case mismatch cannot apply or create a patch',()=>{
 const p=empty();p.caseId='different';assert.throws(()=>applyContentPatch(base(),p));const edited=base();edited.caseId='different';assert.throws(()=>createContentPatch(base(),edited));
});
test('64 MiB safety limit is enforced using serialized UTF-8 bytes',()=>{
 const p=empty();p.fields.description='é'.repeat(32*1024*1024);assert.throws(()=>validateContentPatch(p),/64 MiB/);
});
