import {normalizePDFURL} from './pdf-source.js';
// Authored text is independent of PDF offsets. Only this deliberately small Markdown
// subset is interpreted; arbitrary HTML and links remain literal text.
export function compileMarkdown(source, references=[]){
 let text='',marks=[],citations=[];
 function parse(input){let i=0;while(i<input.length){if(input[i]==='\\'&&i+1<input.length&&/[\\*<\[]/.test(input[i+1])){text+=input[i+1];i+=2;continue;}const token=input.startsWith('[@',i)?/^\[@([\w-]+)\]/.exec(input.slice(i)):null;if(token){const ref=references.find(r=>r.id===token[1]);if(!ref)throw Error('Unknown authority: '+token[1]);const start=text.length;text+='['+ref.number+']';citations.push({start,end:text.length,ref});i+=token[0].length;continue;}
 let consumed=false;for(const [open,close,tags]of [['***','***',['strong','em']],['**','**',['strong']],['*','*',['em']],['<u>','</u>',['u']]]){if(!input.startsWith(open,i))continue;const end=input.indexOf(close,i+open.length);if(end<=i+open.length)continue;const start=text.length;parse(input.slice(i+open.length,end));for(const tag of tags)marks.push({start,end:text.length,tag});i=end+close.length;consumed=true;break;}if(!consumed)text+=input[i++];}}
 parse(String(source));return {text,marks,citations};
}
export function validateContent(value){
 if(value?.schema!==1||typeof value.caseId!=='string'||!value.name?.trim())throw Error('Case title is required.');
 if(!Array.isArray(value.documents)||!Array.isArray(value.questions))throw Error('Invalid case content.');
 const ids=new Set();for(const d of value.documents){if(!d.id||ids.has(d.id)||!d.title?.trim())throw Error('Documents need unique IDs and titles.');ids.add(d.id);normalizePDFURL(d.pdfUrl);
 if(!d.content)continue;const refs=d.content.references||[],numbers=new Set(),keys=new Set();for(const r of refs){if(!/^[\w-]+$/.test(r.id)||keys.has(r.id)||!Number.isInteger(r.number)||r.number<1||numbers.has(r.number)||!r.name?.trim())throw Error('Authorities need unique IDs, numbers, and names.');keys.add(r.id);numbers.add(r.number);}
 for(const p of d.content.pages){if(typeof p.markdown!=='string')throw Error('Invalid page text.');compileMarkdown(p.markdown,refs);}}
 if(new TextEncoder().encode(JSON.stringify(value)).length>64*1024*1024)throw Error('Case draft exceeds the 64 MiB safety limit.');return value;
}
export function compileDocument(content){return {edited:true,revision:content.revision,pages:content.pages.map((p,i)=>({...compileMarkdown(p.markdown,content.references),label:p.label,number:i+1}))};}

export const escapeMarkdown=text=>text.replace(/[\\*<\[]/g,'\\$&');
