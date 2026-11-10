function parentElement(node) {return node?.nodeType===1?node:node?.parentElement;}

// Source pages often store several paragraphs in a single text node, with
// inline citation elements between words. Resolve the paragraph in DOM offsets.
function paragraphRange(selection, content) {
  const range=selection.cloneRange();
  const start=parentElement(range.startContainer);
  const scope=start?.closest('p,div:not(.reader-edit-content),.page-text')||content;
  if(!content.contains(scope)||!scope.contains(range.endContainer))throw Error('Choose text within one paragraph.');
  if(!range.collapsed)return range;
  const before=document.createRange();
  before.selectNodeContents(scope);before.setEnd(range.startContainer,range.startOffset);
  const offset=before.toString().length,text=scope.textContent;
  const from=text.lastIndexOf('\n',Math.max(0,offset-1))+1;
  const newline=text.indexOf('\n',offset),to=newline<0?text.length:newline;
  if(to<=from)throw Error('Enter paragraph text first.');
  const walker=document.createTreeWalker(scope,4);
  let at=0,began=false;
  for(let node;node=walker.nextNode();){
    const end=at+node.length;
    if(!began&&from<end){range.setStart(node,from-at);began=true;}
    if(began&&to<=end){range.setEnd(node,to-at);break;}
    at=end;
  }
  return range;
}

export function formatParagraph(content,selection,style) {
  if(!selection||!content.contains(selection.commonAncestorContainer))throw Error('Place the cursor in the paragraph to format.');
  const parent=parentElement(selection.startContainer);
  let block=parent?.closest('.reader-section-heading,[class*="editor-indent-"]');
  if(block&&!block.contains(selection.endContainer))block=null;
  if(!block){
    if(style==='body'||style==='outdent')return selection;
    const range=paragraphRange(selection,content);
    if(!range.toString().trim())throw Error('Choose paragraph text to format.');
    block=document.createElement('span');block.append(range.extractContents());range.insertNode(block);
  }
  if(style==='indent'||style==='outdent'){
    const old=[...block.classList].find(c=>/^editor-indent-[1-4]$/.test(c));
    const depth=Math.max(0,Math.min(4,Number(old?.at(-1)||0)+(style==='indent'?1:-1)));
    if(old)block.classList.remove(old);
    if(depth)block.classList.add('editor-indent-'+depth);
  }else{
    block.classList.toggle('reader-section-heading',style!=='body');
    block.classList.toggle('minor',style==='2'||style==='3');
    if(style==='body'){block.removeAttribute('role');block.removeAttribute('aria-level');}
    else{block.setAttribute('role','heading');block.setAttribute('aria-level',String(Number(style)+1));}
  }
  const range=document.createRange();range.selectNodeContents(block);return range;
}
