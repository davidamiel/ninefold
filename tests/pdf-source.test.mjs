import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pdfSources,nativePDFURL,pdfPageRange} from '../dist/pdf-source.js';

test('PDF sources prefer bundled originals and preserve whether each source is sliced',()=>{
 const parent={pdfPath:'data/pdfs/parent.pdf',sourceUrl:'https://example.org/original.pdf'};
 const doc={pdfPath:'data/pdfs/slice.pdf',sourceUrl:parent.sourceUrl,parentDocumentId:'parent',sourceRange:{startPage:7,endPage:14}};
 const sources=pdfSources(doc, id=>id==='parent'?parent:null);
 assert.deepEqual(sources,[{url:doc.pdfPath,sliced:true},{url:parent.pdfPath,sliced:false},{url:doc.sourceUrl,sliced:false}]);
 assert.deepEqual(pdfPageRange(doc,sources[0],7),{first:0,last:7,sourceOffset:7});
 assert.deepEqual(pdfPageRange(doc,sources[2],30),{first:7,last:14,sourceOffset:0});
});

test('PDF sources include filed transcripts and mirrors without duplicate fetches',()=>{
 const filed={pdfPath:'data/pdfs/transcript.pdf',sourceUrl:'https://example.org/original.pdf',sourceMirrorUrl:'https://example.org/mirror.pdf'};
 const sources=pdfSources({pdfSourceId:'filed',sourceUrl:filed.sourceUrl},id=>id==='filed'?filed:null);
 assert.deepEqual(sources.map(x=>x.url),[filed.pdfPath,filed.sourceUrl,filed.sourceMirrorUrl]);
 assert.deepEqual(pdfSources({sourceUrl:'https://example.org/docket.html'}),[]);
});

test('native PDF fragment preserves original source page and only permits HTTP URLs',()=>{
 assert.equal(nativePDFURL('https://example.org/file.pdf#old',7),'https://example.org/file.pdf#page=8&view=FitH');
 assert.equal(nativePDFURL('data/pdfs/file.pdf',0,'https://example.org/ninefold/'),'https://example.org/ninefold/data/pdfs/file.pdf#page=1&view=FitH');
 assert.equal(nativePDFURL('javascript:alert(1)',0),'');
 assert.equal(nativePDFURL('data:application/pdf;base64,eA==',0),'');
 assert.equal(nativePDFURL('https://example.org/file.pdf',NaN),'https://example.org/file.pdf#page=1&view=FitH');
});

const source=fs.readFileSync('dist/app.js','utf8');
function declaration(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const end=source.indexOf('\nasync function ',start+1);return source.slice(start,end<0?undefined:end);}
function fallback(doc,sourcePDF){
 const scroll={innerHTML:'',dataset:{}},esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({ds:()=>doc,state:{positions:{}},location:{href:'https://example.org/app/'},nativePDFURL,esc,button:(s)=>`<button>${s}</button>`,originalPDFLink:()=>'<a data-open-original href="https://example.org/original.pdf">Open original PDF in new tab</a>',refreshSidebar(){},scroll,sourcePDF});
 vm.runInContext(declaration('showNativePDF'),context);vm.runInContext('showNativePDF("doc",scroll,sourcePDF)',context);return scroll;
}
test('native fallback stays in pane with a direct source link and honest limitations',()=>{
 const result=fallback({title:'Judgment',textPath:'doc.json',sourceRange:{startPage:7,endPage:14}},{url:'https://example.org/original.pdf',sliced:false});
 assert.match(result.innerHTML,/<iframe class="native-pdf-frame"/);
 assert.match(result.innerHTML,/page=8&amp;view=FitH/);
 assert.match(result.innerHTML,/full original filing; this section starts on PDF page 8/);
 assert.match(result.innerHTML,/Use Reading view to add highlights and comments/);
 assert.match(result.innerHTML,/data-open-original/);
 assert.equal(result.dataset.nativePDF,'true');
});
test('scan-only fallback offers no unavailable Reading button and offsets local slices',()=>{
 const result=fallback({title:'Scan',scanOnly:true,sourceRange:{startPage:7,endPage:14}},{url:'data/pdfs/slice.pdf',sliced:true});
 assert.doesNotMatch(result.innerHTML,/<button>Reading View/);
 assert.match(result.innerHTML,/page=1&amp;view=FitH/);
 assert.match(result.innerHTML,/Ninefold highlights are unavailable/);
 assert.doesNotMatch(result.innerHTML,/full original filing/);
});
test('PDF contents jumps retain absolute source page indexes',()=>{
 const start=source.indexOf('function jumpHeading('),end=source.indexOf('\n\n',start);
 let page;
 const context=vm.createContext({state:{pdfDocs:['slice']},jumpPage:(id,index)=>{page=index;}});
 vm.runInContext(source.slice(start,end),context);
 vm.runInContext('jumpHeading("slice",12,50)',context);
 assert.equal(page,12);
});
test('saved PDF notes navigate the native viewer to their source page',async()=>{
 const start=source.indexOf('async function goNote('),end=source.indexOf('\n',start);
 let page;
 const context=vm.createContext({state:{notes:[{id:'note',docId:'scan',pdfRects:[{page:8}]}],pdfDocs:['scan']},canonicalDocId:x=>x,ds:()=>({}),openDoc(){},ensureDoc:async()=>{},renderPDF:async()=>{},nativePDF:()=>({}),jumpPage:(id,index)=>{page=index;}});
 vm.runInContext(source.slice(start,end),context);await vm.runInContext('goNote("note")',context);
 assert.equal(page,8);
});

function renderingContext(doc,loadSourcePDF,drawPDFPage=async()=>{}){
 const scroll={isConnected:true,dataset:{},innerHTML:'',querySelectorAll:()=>[]};
 const calls={native:[],observers:[]};
 class Observer{constructor(callback){this.callback=callback;calls.observers.push(this)}observe(){}disconnect(){this.disconnected=true}}
 const context=vm.createContext({doc,scroll,ds:()=>doc,app:{querySelector:()=>scroll},CSS:{escape:x=>x},pdfSources,pdfPageRange,loadSourcePDF,drawPDFPage,IntersectionObserver:Observer,restorePositions(){},esc:x=>x,showNativePDF:(id,target,candidate)=>{calls.native.push(candidate);target.innerHTML='native';return true},filedPDF:d=>d.sourceUrl,console:{warn(){}}});
 const start=source.indexOf('async function renderPDF('),end=source.indexOf('\nasync function drawPDFPage',start);
 vm.runInContext(source.slice(start,end),context);
 return {scroll,calls,render:()=>vm.runInContext('renderPDF("doc")',context)};
}
test('failed slice fetch followed by full original renders only the correct source pages',async()=>{
 const doc={id:'doc',parentDocumentId:'parent',pdfPath:'slice.pdf',sourceUrl:'https://example.org/original.pdf',sourceRange:{startPage:7,endPage:14}};
 const {scroll,calls,render}=renderingContext(doc,async url=>{if(url==='slice.pdf')throw Error('missing');return {numPages:30}});
 await render();
 assert.match(scroll.innerHTML,/data-page="7" data-pdf-page="7"/);
 assert.match(scroll.innerHTML,/data-page="13" data-pdf-page="13"/);
 assert.doesNotMatch(scroll.innerHTML,/data-page="14"/);
 assert.equal(calls.native.length,0);
});
test('a failed cross-origin fetch opens the original in the native fallback',async()=>{
 const doc={id:'doc',sourceUrl:'https://example.org/original.pdf'};
 const {scroll,calls,render}=renderingContext(doc,async()=>{throw Error('Failed to fetch')});
 await render();assert.equal(scroll.innerHTML,'native');assert.equal(calls.native.length,1);
 assert.equal(calls.native[0].url,doc.sourceUrl);
});
test('a stale failed request cannot replace a newer successful render',async()=>{
 let reject,attempt=0;
 const {scroll,calls,render}=renderingContext({id:'doc',sourceUrl:'https://example.org/file.pdf'},()=>++attempt===1?new Promise((_,r)=>{reject=r}):Promise.resolve({numPages:1}));
 const older=render();await render();reject(Error('old failure'));await older;
 assert.match(scroll.innerHTML,/class="pdf-document"/);assert.equal(calls.native.length,0);
});
test('concurrent page failures transition to native fallback only once',async()=>{
 const rejects=[];
 const {calls,render}=renderingContext({id:'doc',sourceUrl:'https://example.org/file.pdf'},async()=>({numPages:2}),()=>new Promise((_,reject)=>rejects.push(reject)));
 await render();calls.observers[0].callback([{isIntersecting:true,target:{dataset:{}}},{isIntersecting:true,target:{dataset:{}}}]);
 rejects[0](Error('canvas failure'));rejects[1](Error('detached page'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.native.length,1);assert.equal(calls.observers[0].disconnected,true);
});
