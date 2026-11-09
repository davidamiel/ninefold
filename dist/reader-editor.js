import {captureReader,renderReaderContent,validateReaderContent} from './reader-content.js';
let opening=false;
export async function openReaderEditor(api){if(opening)return;opening=true;try{return await beginReaderEditor(api);}finally{opening=false;}}
async function beginReaderEditor(api){
 if(document.querySelector('.reader-editing'))return;
 const account=api.account;if(!account?.user){api.signIn();return;}if(!await account.isAdmin()){api.toast('This account does not have content administrator access.');return;}
 const id=api.documentId;let draft=api.snapshot(),busy=false,dirty=false,metadataDirty=false;
 // Review the latest publication before editing. A private draft never replaces
 // the reader silently, and entering edit mode never publishes a conversion.
 const published=(await account.loadPublishedContent()).find(r=>r.id===draft.caseId);
 if(published?.value){draft=structuredClone(published.value);api.apply(draft);api.commit?.();}
 draft._basePublishedAt=published?.updatedAt?{seconds:published.updatedAt.seconds,nanoseconds:published.updatedAt.nanoseconds}:null;
 const doc=draft.documents.find(d=>d.id===id);if(!doc)throw Error('This document is no longer in the case.');
 await api.renderDocument(id);
 const scroll=[...document.querySelectorAll('.doc-scroll')].find(n=>n.dataset.doc===id);if(!scroll)throw Error('Open this document in the reader first.');
 const original=scroll.innerHTML,position=scroll.scrollTop;
 scroll.innerHTML=await api.renderDocument(id);let article=scroll.querySelector('.document-body');if(!article){article=document.createElement('article');article.className='document-body';article.dataset.document=id;const title=document.createElement('h1');title.className='document-title';title.textContent=doc.title;const text=document.createElement('span');text.className='page-text';article.append(title,text);scroll.replaceChildren(article);}
 const content=document.createElement('div');content.className='reader-edit-content';
 for(const n of [...article.childNodes])if(!n.matches?.('.document-title,.document-margin'))content.append(n);
 article.insertBefore(content,article.querySelector('.document-margin'));content.contentEditable='true';content.setAttribute('role','textbox');content.setAttribute('aria-label','Edit document reading text');content.setAttribute('aria-multiline','true');content.spellcheck=true;
 content.querySelectorAll('details').forEach(n=>n.open=true);
 // Keep existing source markers and citations in their precise positions, while
 // allowing normal text selection, deletion and formatting across the document.
 const baseline=JSON.stringify(captureReader(content));
 const bar=document.createElement('div');bar.className='reader-edit-toolbar';bar.innerHTML='<strong>Editing this document</strong><button data-editor="bold" aria-label="Bold"><b>B</b></button><button data-editor="italic" aria-label="Italic"><i>I</i></button><button data-editor="underline" aria-label="Underline"><u>U</u></button><button data-editor="reference">Add reference</button><button data-editor="edit-reference">Edit reference</button><button data-editor="marker">Page marker</button><button data-editor="source">Show source PDF</button><button data-editor="save">Save changes</button><button data-editor="cancel">Cancel</button><span role="status">Changes update this reader for everyone when saved.</span>';
 scroll.before(bar);scroll.classList.add('reader-editing');document.body.classList.add('reader-editor-open');scroll.scrollTop=position;
 const status=message=>bar.querySelector('[role=status]').textContent=message;
 const allRefs=new Map(api.references().filter(r=>r.fromDoc===id).map(r=>[r.key,structuredClone(r)]));
 let source=null,selection=null;
 const remember=()=>{const s=window.getSelection();if(s?.rangeCount&&content.contains(s.anchorNode)&&content.contains(s.focusNode))selection=s.getRangeAt(0).cloneRange();};
 const change=()=>{dirty=metadataDirty||JSON.stringify(captureReader(content))!==baseline;api.refreshMargins?.();};
 content.addEventListener('input',change);content.addEventListener('keyup',remember);content.addEventListener('mouseup',remember);
 const restoreSelection=()=>{content.focus();if(selection){const s=window.getSelection();s.removeAllRanges();s.addRange(selection);}};
 function beforeUnload(e){if(dirty){e.preventDefault();e.returnValue='';}}
 function guard(e){if(!document.body.contains(bar))return;if(content.contains(e.target)){if(e.type==='click'&&e.target.closest('[data-action],[data-ref-key]'))e.stopPropagation();return;}if(bar.contains(e.target)||source?.contains(e.target))return;if(e.target.closest('button,a,[data-action]')){e.preventDefault();e.stopImmediatePropagation();status('Save or cancel your document changes before leaving editing.');}}
 window.addEventListener('beforeunload',beforeUnload);document.addEventListener('click',guard,true);
 function cleanup(){window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',guard,true);bar.remove();source?.remove();scroll.classList.remove('reader-editing','reader-edit-source');document.body.classList.remove('reader-editor-open');}
 function capture(){for(const child of [...content.childNodes]){if(child.nodeType===3&&!child.textContent.trim())continue;if(child.nodeType===1&&(child.matches('.page-text,.page-marker')||child.querySelector('.page-text')))continue;const span=document.createElement('span');span.className='page-text';span.dataset.textDoc=id;child.before(span);span.append(child);}const nodes=captureReader(content),keys=new Set();function visit(n){if(typeof n==='string')return;if(n.attrs['data-ref-key'])keys.add(n.attrs['data-ref-key']);n.children.forEach(visit);}nodes.forEach(visit);const allowed=['key','label','type','canonical','fromDoc','caseName','page','offset','passage','number','name'];return validateReaderContent({revision:crypto.randomUUID(),nodes,references:[...keys].map(k=>allRefs.get(k)).filter(Boolean).map(r=>Object.fromEntries(allowed.filter(k=>typeof r[k]==='string'||typeof r[k]==='number').map(k=>[k,r[k]])))});}
 bar.addEventListener('pointerdown',e=>{if(e.target.closest('[data-editor]')){remember();e.preventDefault();}});
 bar.addEventListener('click',async e=>{const action=e.target.closest('[data-editor]')?.dataset.editor;if(!action||busy)return;
 try{
 if(['bold','italic','underline'].includes(action)){restoreSelection();document.execCommand(action,false);remember();change();return;}
 if(action==='edit-reference'){restoreSelection();const n=selection?.startContainer,el=(n?.nodeType===1?n:n?.parentElement)?.closest('[data-ref-key]'),ref=allRefs.get(el?.dataset.refKey);if(!ref){status('Place the cursor in a reference number, then choose Edit reference.');return;}const name=prompt('Short reference name',ref.name||ref.label||'');if(name===null)return;const citation=prompt('Full citation',ref.canonical||ref.label||'');if(citation===null)return;ref.name=name;ref.label=citation;ref.canonical=citation;metadataDirty=true;change();return;}
 if(action==='reference'||action==='marker'){restoreSelection();const node=document.createElement('span');if(action==='marker'){const label=prompt('Source page marker');if(label===null)return;node.className='page-marker reader-inserted-marker';node.dataset.markerPage=String(content.querySelectorAll('.page-marker').length);node.textContent=label;}else{const label=prompt('Reference name or citation');if(!label?.trim())return;const key=id+'|reader|'+crypto.randomUUID(),number=Math.max(0,...[...allRefs.values()].map(r=>r.number||0))+1;allRefs.set(key,{key,fromDoc:id,label,canonical:label,name:label,type:'case',number,page:0,offset:0});node.className='citation';node.dataset.refKey=key;node.setAttribute('role','button');node.tabIndex=0;node.textContent='['+number+']';}if(selection){selection.deleteContents();selection.insertNode(node);selection.setStartAfter(node);selection.collapse(true);}else content.append(node);change();return;}
 if(action==='source'){if(source){source.remove();source=null;scroll.classList.remove('reader-edit-source');return;}const url=api.pdf(id);if(!url){status('No source PDF is attached to this document.');return;}source=document.createElement('aside');source.className='reader-edit-pdf';const link=document.createElement('a');link.dataset.openOriginal='';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open original PDF in new tab';const iframe=document.createElement('iframe');iframe.title='Original PDF for comparison';iframe.src=url;iframe.referrerPolicy='no-referrer';iframe.setAttribute('sandbox','allow-scripts allow-downloads');source.append(link,iframe);scroll.after(source);scroll.classList.add('reader-edit-source');return;}
 if(action==='cancel'){if(dirty&&!confirm('Discard your unsaved document changes?'))return;cleanup();scroll.innerHTML=original;api.refreshMargins?.();return;}
 if(action==='save'){
  if(!dirty){cleanup();scroll.innerHTML=original;api.refreshMargins?.();api.toast('No changes to save.');return;}
  if(!confirm('Save these document changes to the public reader for everyone?'))return;
  busy=true;content.contentEditable='false';bar.querySelectorAll('button').forEach(n=>n.disabled=true);status('Saving changes…');doc.readerContent=capture();await account.publishContent(draft.caseId,draft);dirty=false;cleanup();api.apply(draft);api.commit?.();api.toast('Document changes saved.');
 }
 }catch(error){status(error.message||'Could not save. Your edits are still here.');}finally{busy=false;if(bar.isConnected){content.contentEditable='true';bar.querySelectorAll('button').forEach(n=>n.disabled=false);}}});
 // Plain text paste avoids importing executable or unrelated page markup.
 content.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));change();});
 content.focus();api.refreshMargins?.();
}
