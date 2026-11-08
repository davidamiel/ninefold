import {createContentPatch,applyContentPatch,validateContentPatch} from './content-patch.js';
const copy=value=>structuredClone(value);
// The UI can work with a complete form; only explicit changes cross the storage boundary.
export function createEditorSession({account,base,baseVersion,checkBase,applyPatch}){
 const contentSeeds=new Map();let reviewed=false;
 const patchFor=value=>createContentPatch(base,value,{contentSeeds,baseVersion});
 const full=patch=>applyContentPatch(base,validateContentPatch(patch));
 const scoped={user:account.user,isAdmin:()=>account.isAdmin(),
  async loadPublishedContent(){reviewed=false;const records=await account.loadPublishedContent();const result=records.filter(r=>r.id===base.caseId).map(r=>r.value?.schema===1?{...r,value:copy(base),ignoredReason:'An older whole-case publication was not applied. Review the current imported case before publishing replacement edits.'}:{...r,value:full(r.value)});reviewed=true;return result;},
  async loadContentDraft(id){const record=await account.loadContentDraft(id);if(!record)return null;const saved=record.value;
   if(saved?.schema!==3||saved.caseId!==base.caseId)return {id,ignoredReason:'An older whole-case draft was not loaded. Start from the current case; that older draft cannot safely be published.'};
   if(saved.baseVersion!==baseVersion)return {id,ignoredReason:'The imported collection changed since this draft was saved. The current case is open; that older draft was not applied.'};
   return {...record,value:{...full(saved.patch),_basePublishedAt:saved._basePublishedAt??null}};
  },
  async saveContentDraft(id,value){const saved={schema:3,caseId:id,baseVersion,patch:patchFor(value),_basePublishedAt:value._basePublishedAt??null};await account.saveContentDraft(id,saved);return {id,value:copy(value)};},
  async publishContent(id,value){if(!reviewed)throw Error('Reload and review current published content before publishing.');await checkBase();const patch=patchFor(value);return account.publishContent(id,patch,undefined,checkBase);}
 };
 return {account:scoped,patchFor,apply:value=>applyPatch(patchFor(value)),rememberImport(id,content){contentSeeds.set(id,copy(content));return content;}};
}
