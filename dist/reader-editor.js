import {attachEditorPanel} from './editor-panel.js';
import {formatParagraph} from './reader-format.js';
import {captureReader,renderReaderContent,validateReaderContent} from './reader-content.js';
let opening=false;
export async function openReaderEditor(api){if(opening)return;opening=true;try{return await beginReaderEditor(api);}finally{opening=false;}}
async function beginReaderEditor(api){
 const existing=document.querySelector('.reader-editor-panel');if(existing){existing.dispatchEvent(new Event('editor-resume'));return;}
 const account=api.account;if(!account?.user){api.signIn();return;}if(!await account.isAdmin()){api.toast('This account does not have content administrator access.');return;}
 const id=api.documentId;let draft=api.snapshot(),busy=false,dirty=false,metadataDirty=false;
 // Review the latest publication before editing. A private draft never replaces
 // the reader silently, and entering edit mode never publishes a conversion.
 const published=(await account.loadPublishedContent()).find(r=>r.id===draft.caseId);
 if(published?.value){draft=structuredClone(published.value);api.apply(draft);api.commit?.();}
 draft._basePublishedAt=published?.updatedAt?{seconds:published.updatedAt.seconds,nanoseconds:published.updatedAt.nanoseconds}:null;
 const doc=draft.documents.find(d=>d.id===id);if(!doc)throw Error('This document is no longer in the case.');
 const markup=await api.renderDocument(id);
 const panel=document.createElement('section');panel.className='reader-editor-panel';panel.dataset.documentId=id;panel.dataset.caseId=draft.caseId;panel.setAttribute('role','region');panel.setAttribute('aria-label','Document editor');
 const scroll=document.createElement('div');scroll.className='editor-paper';panel.append(scroll);document.body.append(panel);
 scroll.innerHTML=markup;let article=scroll.querySelector('.document-body');if(!article){article=document.createElement('article');article.className='document-body';article.dataset.document=id;const title=document.createElement('h1');title.className='document-title';title.textContent=doc.title;const text=document.createElement('span');text.className='page-text';article.append(title,text);scroll.replaceChildren(article);}
 const content=document.createElement('div');content.className='reader-edit-content';
 for(const n of [...article.childNodes])if(!n.matches?.('.document-title,.document-margin'))content.append(n);
 article.insertBefore(content,article.querySelector('.document-margin'));content.contentEditable='true';content.setAttribute('role','textbox');content.setAttribute('aria-label','Edit document reading text');content.setAttribute('aria-multiline','true');content.spellcheck=true;
 content.querySelectorAll('details').forEach(n=>n.open=true);
 // Keep existing source markers and citations in their precise positions, while
 // allowing normal text selection, deletion and formatting across the document.
 const baseline=JSON.stringify(captureReader(content));
 const bar=document.createElement('div');bar.className='reader-edit-toolbar';bar.innerHTML=`<header><strong></strong><button data-editor="case-details">Case details & documents</button><button data-editor="minimize">Minimize</button></header>
 <div class="edit-formats"><label><span class="sr-only">Paragraph style</span><select aria-label="Paragraph style"><option value="body">Body text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select></label>
 <button data-editor="bold" title="Bold (Ctrl/⌘ B)" aria-label="Bold"><b>B</b></button><button data-editor="italic" title="Italic (Ctrl/⌘ I)" aria-label="Italic"><i>I</i></button><button data-editor="underline" title="Underline (Ctrl/⌘ U)" aria-label="Underline"><u>U</u></button>
 <button data-editor="outdent" title="Decrease indent (Ctrl/⌘ [)" aria-label="Decrease indent">⇤</button><button data-editor="indent" title="Increase indent (Ctrl/⌘ ])" aria-label="Increase indent">⇥</button>
 <button data-editor="contents">Contents</button><button data-editor="reference" title="References (Ctrl/⌘ K)">References</button><button data-editor="marker">Page marker</button><button data-editor="source">Source PDF</button><button data-editor="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">⌨</button></div>
 <div class="edit-session"><span role="status">Editing document</span><button data-editor="cancel">Close</button><button data-editor="save">Publish changes</button></div>`;
 bar.querySelector('strong').textContent=doc.title;
 if(!api.pdf(id))bar.querySelector('[data-editor=source]').remove();
 scroll.before(bar);
 const sheet=document.createElement('div');sheet.className='editor-fields';sheet.hidden=true;bar.after(sheet);
 const dock=attachEditorPanel(panel,doc.title,()=>content.focus());
 panel.requestClose=async()=>{if(busy)return false;if(dirty&&!confirm('Discard unpublished document changes and switch editors?'))return false;cleanup();return true;};
 const status=message=>bar.querySelector('[role=status]').textContent=message;
 const allRefs=new Map(api.references().filter(r=>r.fromDoc===id).map(r=>[r.key,structuredClone(r)]));
 let source=null,selection=null;const retainedRefs=new Set();
 const style=bar.querySelector('select');
 const remember=()=>{const s=window.getSelection();if(s?.rangeCount&&content.contains(s.anchorNode)&&content.contains(s.focusNode)){
  selection=s.getRangeAt(0).cloneRange();const el=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement;
  const heading=el.closest('.reader-section-heading');style.value=heading?String(Number(heading.getAttribute('aria-level')||2)-1):'body';
 }};
 const change=()=>{dirty=true;status('Unpublished changes');};
 content.addEventListener('input',change);document.addEventListener('selectionchange',remember);
 content.addEventListener('keyup',remember);content.addEventListener('mouseup',remember);
 const restoreSelection=()=>{content.focus();if(selection){const s=window.getSelection();s.removeAllRanges();s.addRange(selection);}};
 function beforeUnload(e){if(dirty){e.preventDefault();e.returnValue='';}}
 window.addEventListener('beforeunload',beforeUnload);
 function cleanup(){window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('selectionchange',remember);dock.remove();document.querySelector('[data-action=edit-case]')?.focus();}
 function hideSheet(){sheet.hidden=true;sheet.replaceChildren();panel.classList.remove('has-editor-fields');restoreSelection();}
 function showFields(html,submit){
  sheet.innerHTML='<form>'+html+'<div class="field-actions"><button type="button">Cancel</button><button type="submit">Apply</button></div></form>';
  sheet.hidden=false;panel.classList.add('has-editor-fields');const form=sheet.firstElementChild;
  form.querySelector('[type=button]').onclick=hideSheet;
  form.onsubmit=e=>{e.preventDefault();try{submit(form);hideSheet();change();}catch(error){status(error.message);}};
  form.querySelector('select,input')?.focus();return form;
 }
 function insert(node){
  if(!selection||!content.contains(selection.commonAncestorContainer))throw Error('Place the cursor in the document first.');
  selection.collapse(false);selection.insertNode(node);selection.setStartAfter(node);selection.collapse(true);
 }
 function references(key){
  const selected=selection?.toString().trim().match(/^\[(\d+)\]$/);
  if(!key&&selected)key=[...allRefs.values()].find(r=>Number(r.number)===Number(selected[1]))?.key;
  sheet.hidden=false;panel.classList.add('has-editor-fields');sheet.replaceChildren();
  const title=document.createElement('h3');title.textContent='References';sheet.append(title);
  const close=document.createElement('button');close.type='button';close.textContent='Close references';close.onclick=hideSheet;sheet.append(close);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','Choose a reference');sheet.append(nav);
  const add=document.createElement('button');add.type='button';add.textContent='+ New reference';add.onclick=()=>references('');nav.append(add);
  for(const ref of allRefs.values()){
   const b=document.createElement('button');b.type='button';b.textContent='['+(ref.number||'•')+'] '+(ref.name||ref.label);
   b.setAttribute('aria-pressed',String(ref.key===key));b.onclick=()=>references(ref.key);nav.append(b);
  }
  const old=allRefs.get(key),form=document.createElement('form');form.className='reference-editor-form';
  form.innerHTML='<label>Short name<input name="name" required></label><label>Full citation<input name="citation" required></label><label>Popup text<textarea name="popupText" rows="4"></textarea></label><label>Sidebar text<textarea name="sidebarText" rows="7"></textarea></label><p>Select text such as [12] in the document, then choose a reference and Link selected text. With a cursor only, a reference marker is inserted there. Empty popup/sidebar text uses the existing source preview.</p><div class="field-actions"><button type="submit">Save reference</button><button type="button" data-link-reference>Link selected text / insert marker</button></div>';
  sheet.append(form);
  form.elements.name.value=old?.name||old?.label||'';
  form.elements.citation.value=old?.canonical||old?.label||'';
  form.elements.popupText.value=old?.popupText||'';
  form.elements.sidebarText.value=old?.sidebarText||'';
  let saved=old;
  const save=()=>{
   if(!form.reportValidity())return null;
   const name=form.elements.name.value.trim(),canonical=form.elements.citation.value.trim();
   if(!saved){const key=id+'|reader|'+crypto.randomUUID(),number=Math.max(0,...[...allRefs.values()].map(r=>Number(r.number)||0))+1;
    saved={key,number,fromDoc:id,type:'case',page:0,offset:0};allRefs.set(key,saved);}
   Object.assign(saved,{name,label:canonical,canonical,popupText:form.elements.popupText.value.trim(),sidebarText:form.elements.sidebarText.value.trim()});
   retainedRefs.add(saved.key);metadataDirty=true;change();return saved;
  };
  form.onsubmit=e=>{e.preventDefault();const ref=save();if(ref){references(ref.key);status('Reference saved in this draft. Link it in the text, then publish changes.');}};
  form.querySelector('[data-link-reference]').onclick=()=>{
   try{
    if(!selection||!content.contains(selection.commonAncestorContainer))throw Error('Select text or place the cursor in the document first.');
    const ref=save();if(!ref)return;
    const node=document.createElement('span');node.className='citation';node.dataset.refKey=ref.key;node.setAttribute('role','button');node.tabIndex=0;node.textContent='['+ref.number+']';
    // Replace selected marker/text; do not leave a second unlinked [12] behind.
    selection.deleteContents();selection.insertNode(node);selection.setStartAfter(node);selection.collapse(true);
    const pageText=node.closest('.page-text'),page=[...content.querySelectorAll('.page-text')].indexOf(pageText);
    const prefix=document.createRange();prefix.selectNodeContents(pageText||content);prefix.setEndBefore(node);
    if(!old)Object.assign(ref,{page:Math.max(0,page),offset:prefix.toString().length});
    change();hideSheet();
   }catch(error){status(error.message);}
  };
  form.elements.name.focus();
 }
 function paragraph(value){try{selection=formatParagraph(content,selection,value);restoreSelection();change();remember();}catch(error){status(error.message);}}
 style.onchange=()=>paragraph(style.value);
 content.addEventListener('click',event=>{const link=event.target.closest('[data-ref-key]');if(link){event.preventDefault();remember();references(link.dataset.refKey);}});
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();if(!sheet.hidden)hideSheet();else dock.minimize();return;}
  if(!(event.metaKey||event.ctrlKey))return;
  const key=event.key.toLowerCase();
  if(key==='s'){event.preventDefault();if(sheet.hidden){bar.querySelector('[data-editor=save]').focus();status('Press Enter to publish these changes.');}return;}
  if(!content.contains(event.target))return;
  if(key==='k'){event.preventDefault();remember();references();return;}
  if(key==='['||key===']'){event.preventDefault();remember();paragraph(key==='['?'outdent':'indent');}
  if(event.altKey&&['0','1','2','3'].includes(event.code.replace('Digit',''))){event.preventDefault();remember();paragraph(event.code==='Digit0'?'body':event.code.slice(-1));}
 });
 function capture(){for(const child of [...content.childNodes]){if(child.nodeType===3&&!child.textContent.trim())continue;if(child.nodeType===1&&(child.matches('.page-text,.page-marker')||child.querySelector('.page-text')))continue;const span=document.createElement('span');span.className='page-text';span.dataset.textDoc=id;child.before(span);span.append(child);}const nodes=captureReader(content),keys=new Set();function visit(n){if(typeof n==='string')return;if(n.attrs['data-ref-key'])keys.add(n.attrs['data-ref-key']);n.children.forEach(visit);}nodes.forEach(visit);const allowed=['key','label','type','canonical','fromDoc','caseName','page','offset','passage','number','name','popupText','sidebarText'];return validateReaderContent({revision:crypto.randomUUID(),nodes,references:[...new Set([...keys,...retainedRefs])].map(k=>allRefs.get(k)).filter(Boolean).map(r=>Object.fromEntries(allowed.filter(k=>typeof r[k]==='string'||typeof r[k]==='number').map(k=>[k,r[k]])))});}
 bar.addEventListener('pointerdown',e=>{if(e.target.closest('[data-editor]')){remember();e.preventDefault();}});
 bar.addEventListener('click',async e=>{const action=e.target.closest('[data-editor]')?.dataset.editor;if(!action||busy)return;
 try{
 if(['bold','italic','underline'].includes(action)){restoreSelection();document.execCommand(action,false);remember();change();return;}
 if(action==='shortcuts'||action==='contents'){
  sheet.hidden=false;panel.classList.add('has-editor-fields');sheet.replaceChildren();
  const close=document.createElement('button');close.textContent='Close';close.onclick=hideSheet;sheet.append(close);
  if(action==='shortcuts'){const list=document.createElement('dl');list.className='editor-shortcuts';
   for(const [command,keys] of [['Bold, italic, underline','Ctrl/⌘ B, I, U'],['Heading 1–3','Ctrl/⌘ Alt 1–3'],['Body text','Ctrl/⌘ Alt 0'],['Decrease or increase indent','Ctrl/⌘ [ or ]'],['References','Ctrl/⌘ K'],['Focus Publish changes','Ctrl/⌘ S'],['Minimize editor or close panel','Esc']]){
    const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=command;detail.textContent=keys;list.append(term,detail);
   }sheet.append(list);
  }else{const headings=content.querySelectorAll('.reader-section-heading');const nav=document.createElement('nav');nav.setAttribute('aria-label','Draft contents');sheet.append(nav);
   if(!headings.length)nav.textContent='Select paragraph text and choose a heading level to add it to Contents.';
   for(const el of headings){const b=document.createElement('button');b.textContent=el.textContent;b.style.paddingInlineStart=(8+12*Math.max(0,Number(el.getAttribute('aria-level')||2)-2))+'px';b.onclick=()=>{selection=document.createRange();selection.selectNodeContents(el);hideSheet();el.scrollIntoView({block:'center'});remember();};nav.append(b);}
  }close.focus();return;
 }
 if(action==='case-details'){if(await panel.requestClose())api.openCaseDetails?.();return;}
 if(action==='minimize'){dock.minimize();return;}
 if(action==='indent'||action==='outdent'){paragraph(action);return;}
 if(action==='reference'){const n=selection?.startContainer;references((n?.nodeType===1?n:n?.parentElement)?.closest('[data-ref-key]')?.dataset.refKey);return;}
 if(action==='marker'){showFields('<label>Source page label<input name="label" required></label>',form=>{const node=document.createElement('span');node.className='page-marker reader-inserted-marker';node.dataset.markerPage=String(content.querySelectorAll('.page-marker').length);node.textContent=form.elements.label.value.trim();insert(node);});return;}
 if(action==='source'){if(source){source.remove();source=null;scroll.classList.remove('reader-edit-source');return;}const url=api.pdf(id);if(!url){status('No source PDF is attached to this document.');return;}source=document.createElement('aside');source.className='reader-edit-pdf';const link=document.createElement('a');link.dataset.openOriginal='';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open original PDF in new tab';const iframe=document.createElement('iframe');iframe.title='Original PDF for comparison';iframe.src=url;iframe.referrerPolicy='no-referrer';iframe.setAttribute('sandbox','allow-scripts allow-downloads');source.append(link,iframe);scroll.after(source);scroll.classList.add('reader-edit-source');return;}
 if(action==='cancel'){
  if(!dirty){cleanup();return;}
  sheet.hidden=false;panel.classList.add('has-editor-fields');sheet.innerHTML='<strong>Discard unpublished changes?</strong><div class="field-actions"><button>Keep editing</button><button>Discard</button></div>';
  const [keep,discard]=sheet.querySelectorAll('button');keep.onclick=hideSheet;discard.onclick=cleanup;keep.focus();return;
 }
 if(action==='save'){
  if(!sheet.hidden){status('Apply or cancel the open form first.');return;}
  if(!dirty||!metadataDirty&&JSON.stringify(captureReader(content))===baseline){cleanup();api.toast('No changes to publish.');return;}
  busy=true;content.contentEditable='false';bar.querySelectorAll('button,select').forEach(n=>n.disabled=true);status('Saving changes…');doc.readerContent=capture();await account.publishContent(draft.caseId,draft);dirty=false;cleanup();api.apply(draft);api.commit?.();api.toast('Document changes saved.');
 }
 }catch(error){status(error.message||'Could not save. Your edits are still here.');}finally{busy=false;if(bar.isConnected){content.contentEditable='true';bar.querySelectorAll('button,select').forEach(n=>n.disabled=false);}}});
 // Plain text paste avoids importing executable or unrelated page markup.
 content.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));change();});
 content.focus();remember();
}
