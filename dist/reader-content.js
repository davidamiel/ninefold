// Persist only a constrained reader tree, never arbitrary HTML or private annotations.
const tags=new Set(['span','div','p','br','strong','b','em','i','u','sup','sub','h2','h3','h4','section','header','small','details','summary','button','img','footer','a']);
const attrs=new Set(['class','role','aria-level','aria-label','data-page','data-marker-page','data-text-doc','data-map-key','data-ref-key','data-action','data-value','tabindex','src','alt','data-start','data-seek-start','data-turn','data-end','href','rel','target']);
const classes=new Set(['source-page','counsel-block','reader-inserted-marker','page-marker','page-text','reader-section-heading','minor','citation','footnote-anchor','reader-footnotes','footnote-entry','speaker-turn','justice-turn','advocate-turn','speaker-message','speaker-avatar','transcript-face','conversation-header','transcript-credit','transcript-paragraph','turn-time','illustrated-speaker','outline']);
const allowedClass=c=>classes.has(c)||/^editor-indent-[1-4]$/.test(c)||/^counsel-(?:cell|left|right|full|row-(?:[0-9]|[1-5][0-9]|6[0-3]))$/.test(c);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function captureReader(root){
 function node(n){if(n.nodeType===3)return n.data;if(n.nodeType!==1)return null;if(n.matches('.document-title,.document-margin'))return null;
 const children=[...n.childNodes].flatMap(c=>{const v=node(c);return v===null?[]:Array.isArray(v)?v:[v]});if(!tags.has(n.localName)||n.matches('mark'))return children;
 const a={};for(const x of n.attributes){if(!attrs.has(x.name))continue;if(x.name==='class'){const value=x.value.split(/\s+/).filter(allowedClass).join(' ');if(value)a.class=value;}else if(x.name==='data-action'&&!['footnote-preview','transcript-seek','listen'].includes(x.value))continue;else if(x.name==='src'&&(/[:]|^\/\//.test(x.value)||x.value.includes('..')))continue;else if(x.name==='href'&&!/^https?:\/\//.test(x.value))continue;else a[x.name]=x.value;}
 // Browsers may use styled spans for underline / italic formatting.
 let value={tag:n.localName,attrs:a,children};for(const [style,pattern,tag]of [['fontWeight',/bold|[6-9]00/,'strong'],['fontStyle',/italic/,'em'],['textDecoration',/underline/,'u']])if(pattern.test(n.style[style]||''))value={tag,attrs:{},children:[value]};return value;
 }
 return [...root.childNodes].flatMap(n=>{const v=node(n);return v===null?[]:Array.isArray(v)?v:[v]});
}
export function validateReaderContent(value){
 if(!value||Object.keys(value).some(k=>!['revision','nodes','references'].includes(k))||typeof value.revision!=='string'||!Array.isArray(value.nodes)||!Array.isArray(value.references))throw Error('Invalid reader content.');
 let count=0;function check(n,depth=0){if(++count>500000||depth>80)throw Error('Reader content is too complex.');if(typeof n==='string')return;if(!n||!tags.has(n.tag)||!Array.isArray(n.children)||!n.attrs||Object.keys(n).some(k=>!['tag','attrs','children'].includes(k)))throw Error('Invalid reader element.');for(const [k,v]of Object.entries(n.attrs)){if(k==='href'&&!/^https?:\/\//.test(v)||!attrs.has(k)||typeof v!=='string'||k==='class'&&v.split(/\s+/).some(c=>!allowedClass(c))||k==='src'&&(/[:]|^\/\//.test(v)||v.includes('..'))||k==='data-action'&&!['footnote-preview','transcript-seek','listen'].includes(v))throw Error('Unsafe reader attribute.');}n.children.forEach(c=>check(c,depth+1));}value.nodes.forEach(n=>check(n));
 const allowed=new Set(['key','label','type','canonical','fromDoc','caseName','page','offset','passage','number','name']);for(const r of value.references){if(!r||typeof r.key!=='string'||Object.keys(r).some(k=>!allowed.has(k)||!['string','number'].includes(typeof r[k])))throw Error('Invalid reader reference.');}return value;
}
export function renderReaderContent(value){validateReaderContent(value);function html(n){if(typeof n==='string')return esc(n);return '<'+n.tag+Object.entries(n.attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>'+n.children.map(html).join('')+(['br','img'].includes(n.tag)?'':'</'+n.tag+'>');}return value.nodes.map(html).join('');}
export function readerText(value){const text=n=>typeof n==='string'?n:n.children.map(text).join('');return value.nodes.map(text).join('');}

export function readerOutline(content) {
 const headings=[];
 const label=node=>typeof node==='string'?node:node.children.map(label).join('');
 function visit(node){
  if(typeof node==='string')return;
  if(node.attrs.class?.split(' ').includes('reader-section-heading')){
   headings.push({index:headings.length,text:label(node),level:Math.max(0,Number(node.attrs['aria-level']||2)-2)});
  }
  node.children.forEach(visit);
 }
 content.nodes.forEach(visit);
 return headings;
}

// Match the page-text numbering used by the published reader DOM.
export function editedSpeechPages(content) {
 const pages=[];
 const textOf=node=>typeof node==='string'?node:node.children.map(textOf).join('');
 function visit(node,inFootnote=false){
  if(typeof node==='string')return;
  const classes=(node.attrs.class||'').split(' ');
  inFootnote=inFootnote||classes.includes('reader-footnotes')||classes.includes('footnote-entry');
  if(classes.includes('page-text'))pages.push({text:inFootnote?'':textOf(node)});
  for(const child of node.children)visit(child,inFootnote);
 }
 content.nodes.forEach(node=>visit(node));
 return pages;
}
