import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/app.js','utf8');
function declaration(name){
 const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
 assert(start>=0,name);
 const tail=source.slice(start),next=tail.slice(1).search(/\n(?:function |async function |let |const |document\.)/);
 return next<0?tail:tail.slice(0,next+1);
}
function setup(raw,{timed=false,editor=false,range,markers=[],headings=[],citations=[]}={}){
 const doc={type:'Statute',timedSession:timed?{}:null,editorContent:editor,sourceRange:range};
 const data={pages:[{text:raw}]},structure={headings,footnoteMarkers:markers};
 const context=vm.createContext({
  Intl,Map,Array,Number,Math,Set,displayMaps:new Map(),readingCache:new Map(),
  ds:()=>doc,docCache:new Map([['doc',data]]),structureFor:()=>structure,
  verifiedCounselBlocks:()=>[],counselGridCells:()=>[],citationRanges:()=>citations,
  state:{notes:[]},esc:s=>s,extendHeadingMarker:h=>h,
 });
 for(const name of ['lowerBound','numberedReading','readingText','renderText','conversationText','maskSpokenCitations','skipSpokenCitations','narrationChunks','narrationDisplayRange'])vm.runInContext(declaration(name),context);
 const el={dataset:{textDoc:'doc'}};
 return {context,el,doc,data,render(text=raw,map=Array.from({length:raw.length},(_,i)=>i)){
  context.displayMaps.set('doc:0',map);
  const html=context.renderText(text,'doc',0,map);
  return {text:html.replace(/<[^>]*>/g,''),map:context.displayMaps.get('doc:0')};
 }};
}
test('real citation rendering and speech chunking retain separate coordinate maps, cold and cached',()=>{
 const raw='See 410 U.S. 113, 120 (1973).\n\nThe rule protects substantive rights.';
 const h=setup(raw,{citations:[{start:raw.indexOf('410'),end:raw.indexOf('.\n'),ref:{number:1,key:'case'}}]});
 const rendered=h.render();assert.equal(rendered.text,'See [1].\n\nThe rule protects substantive rights.');
 for(let i=0;i<2;i++){
  const chunks=h.context.narrationChunks('doc'),second=chunks.find(c=>c.text.startsWith('The'));
  assert.strictEqual(h.context.displayMaps.get('doc:0'),rendered.map,'rendered map identity must survive both reading-cache paths');
  assert.equal(second.sourceStart,raw.indexOf('The'));
  const range=h.context.narrationDisplayRange(h.el,second);
  assert.equal(range.start,10);assert.equal(rendered.text.slice(range.start,range.end),second.text);
 }
 // Resolve against the latest render, not stale offsets captured at generation.
 const chunks=h.context.narrationChunks('doc');h.context.displayMaps.set('doc:0',Array.from({length:raw.length},(_,i)=>i));
 const range=h.context.narrationDisplayRange(h.el,chunks[1]);assert.equal(range.start,raw.indexOf('The'));
});
test('timed transcript paragraph insertions map spoken source ranges into final rendering',()=>{
 const raw=('A sentence with enough ordinary words to create a substantial opening paragraph. ').repeat(7)+'Final sentence remains selected.';
 const h=setup(raw,{timed:true}),reading=h.context.conversationText({text:raw}),rendered=h.render(reading.text,reading.map);
 assert(rendered.text.includes('\n\n'));
 const before=rendered.map,chunks=h.context.narrationChunks('doc');
 assert.strictEqual(h.context.displayMaps.get('doc:0'),before);
 for(const chunk of chunks){const range=h.context.narrationDisplayRange(h.el,chunk);assert(range);assert.equal(rendered.text.slice(range.start,range.end).replace(/\s+/g,' ').trim(),chunk.text);}
});
test('UTF-16 offsets and masked footnotes remain aligned after astral characters',()=>{
 const raw='An emoji \u{1f600} precedes marker 9 and prose.\n\nSecond sentence survives.';
 const marker=raw.indexOf('9'),h=setup(raw,{timed:true,markers:[{page:0,start:marker,end:marker+1,label:'9'}]}),rendered=h.render();
 const chunks=h.context.narrationChunks('doc');assert(!chunks[0].text.includes('9'));
 assert(chunks[0].text.includes('and prose.'));assert.equal(chunks[1].sourceStart,raw.indexOf('Second'));
 const range=h.context.narrationDisplayRange(h.el,chunks[1]);assert.equal(rendered.text.slice(range.start,range.end),'Second sentence survives.');
});
test('source ranges, editor reading and heading splits do not replace rendered maps',()=>{
 const raw='Excluded. Heading Body text. Trailing excluded.',start=raw.indexOf('Heading'),end=raw.indexOf(' Trailing');
 for(const editor of [false,true]){
  const h=setup(raw,{editor,range:{startPage:0,startOffset:start,endPage:0,endOffset:end},headings:[{page:0,start,end:start+7}]}),map=Array.from({length:end-start},(_,i)=>start+i),rendered=h.render(raw.slice(start,end),map);
  const chunks=h.context.narrationChunks('doc');assert.strictEqual(h.context.displayMaps.get('doc:0'),rendered.map);
  assert.deepEqual(Array.from(chunks,c=>c.text),['Heading','Body text.']);
  for(const chunk of chunks){const r=h.context.narrationDisplayRange(h.el,chunk);assert.equal(rendered.text.slice(r.start,r.end),chunk.text);}
 }
});
test('missing or fully omitted rendered ranges never receive raw reading offsets',()=>{
 const h=setup('Valid prose.');assert.equal(h.context.narrationDisplayRange(h.el,{page:0,sourceStart:0,sourceEnd:4}),null);
 h.context.displayMaps.set('doc:0',[20,21]);assert.equal(h.context.narrationDisplayRange(h.el,{page:0,sourceStart:0,sourceEnd:4}),null);
});

test('actual playback maps a generated source chunk to the latest rendered range',async()=>{
 const raw='See 410 U.S. 113, 120 (1973).\n\nThe rule protects substantive rights.';
 const h=setup(raw,{citations:[{start:raw.indexOf('410'),end:raw.indexOf('.\n'),ref:{number:1,key:'case'}}]}),rendered=h.render();
 const chunks=h.context.narrationChunks('doc'),n={id:'doc',chunks,index:0,paused:false},ranges=[];
 h.el.closest=()=>null;
 Object.assign(h.context,{narration:n,app:{querySelectorAll:()=>[h.el]},CSS:{escape:s=>s,highlights:new Map()},Highlight:class{constructor(...ranges){this.ranges=ranges}},state:{},narrationAudio:{pause(){},async play(){}},refreshPlayback(){},generateChunk:async()=>({url:'blob:test',duration:2}),textRange:(_el,start,end)=>{const range={start,end};ranges.push(range);return range},stopNarration(){throw Error('unexpected stop')},toast(){},console});
 vm.runInContext(declaration('playNarrationChunk'),h.context);
 await h.context.playNarrationChunk(n,1);
 const highlights=h.context.CSS.highlights.get('narration').ranges;assert.equal(highlights.length,1);assert.equal(highlights[0].start,10);
 assert.equal(rendered.text.slice(highlights[0].start,highlights[0].end),chunks[1].text);
 assert.equal(ranges[0].start,10);
});
test('real untimed transcript keeps citation maps per fragment and highlights later or spanning fragments',async()=>{
 const raw='MR. ALPHA: First opening words.\n\nJUSTICE BETA: See 410 U.S. 113, 120 (1973). Later words remain visible.';
 const h=setup(raw),c=h.context;
 Object.assign(c,{contextCase:()=>({advocates:[],argued:'2025-01-01'}),profiles:{},titleCaseLabel:s=>s,date:s=>s,portrait:()=>'',button:()=>'',icon:()=>''});
 c.citationRanges=text=>{const start=text.indexOf('410');return start<0?[]:[{start,end:text.indexOf(').',start)+1,ref:{number:1,key:'case'}}]};
 for(const name of ['officialTranscriptTurns','untimedTranscriptHTML'])vm.runInContext(declaration(name),c);
 const turns=c.officialTranscriptTurns('doc',h.data),parts=Array.from(turns,t=>Array.from(t.parts)).flat();
 assert.equal(parts.length,2);
 const html=c.untimedTranscriptHTML('doc',h.data);
 const elements=parts.map(part=>{
  const rendered=c.numberedReading(part.text,part.map,c.citationRanges(part.text));
  assert(html.includes('data-map-key="'+part.key+'"'));
  assert.deepEqual(Array.from(c.displayMaps.get(part.key)),Array.from(rendered.map),'each actual fragment render must update its own key');
  return {dataset:{textDoc:'doc',mapKey:part.key},text:rendered.text,closest:()=>null};
 });
 assert(elements[1].text.includes('[1]'));
 const maps=parts.map(p=>c.displayMaps.get(p.key)),chunks=c.narrationChunks('doc');
 parts.forEach((p,i)=>assert.strictEqual(c.displayMaps.get(p.key),maps[i]));
 Object.assign(c,{app:{querySelectorAll:()=>elements},CSS:{escape:s=>s,highlights:new Map()},Highlight:class{constructor(...ranges){this.ranges=ranges}},state:{},narrationAudio:{pause(){},async play(){}},refreshPlayback(){},generateChunk:async()=>({url:'blob:test',duration:2}),textRange:(el,start,end)=>({el,start,end}),stopNarration(){throw Error('unexpected stop')},toast(){},console});
 vm.runInContext(declaration('playNarrationChunk'),c);
 const later=chunks.find(ch=>ch.sourceStart>=raw.indexOf('JUSTICE'));
 assert(later);let n={id:'doc',chunks:[later],paused:false};c.narration=n;
 await c.playNarrationChunk(n,0);
 let ranges=c.CSS.highlights.get('narration').ranges;
 assert.equal(ranges.length,1);assert.strictEqual(ranges[0].el,elements[1]);
 assert.equal(elements[1].text.slice(ranges[0].start,ranges[0].end),elements[1].text);
 n={id:'doc',chunks:[{page:0,sourceStart:0,sourceEnd:raw.length,text:raw}],paused:false};c.narration=n;
 await c.playNarrationChunk(n,0);ranges=c.CSS.highlights.get('narration').ranges;
 assert.equal(ranges.length,2);assert.strictEqual(ranges[0].el,elements[0]);assert.strictEqual(ranges[1].el,elements[1]);
});
