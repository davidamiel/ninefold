import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name){const a=app.indexOf(`function ${name}(`);return app.slice(a,app.indexOf('\nfunction ',a+1));}
function read(pages,page=0,layout={},structure={}) {
 const data={pages:pages.map(p=>typeof p==='string'?{text:p}:p)};
 const context=vm.createContext({data,page,readingCache:new Map(),displayMaps:new Map(),runningLineCache:new WeakMap(),
  ds:()=>({category:'Decision'}),category:d=>d.category,structureFor:()=>({bodyStart:{page:0,offset:0},omitRanges:[],headings:[],repairs:[],...structure}),
  layoutPage:()=>layout,tidyHeadingSpace:x=>x,tidyFootnoteMarkers:x=>x,extendHeadingMarker:x=>x});
 for(const name of ['normalizedMargin','runningLines','lowerBound','normalizeReadingTypography','repairReading','preserveCounselBlocks','readingText'])vm.runInContext(fn(name),context);
 const result=vm.runInContext('readingText(data.pages[page].text,"fixture",page,data)',context);
 assert.equal(result.text.length,result.map.length);
 for(let i=0;i<result.map.length;i++){assert(result.map[i]>=0&&result.map[i]<data.pages[page].text.length);if(i)assert(result.map[i]>=result.map[i-1]);}
 return result;
}
test('Jackson page header does not interrupt the continuing law-review citation',()=>{
 const data=JSON.parse(fs.readFileSync('dist/data/docs/24-1287-2059f0a43b72.json'));
 const layout=JSON.parse(fs.readFileSync('dist/data/reading-layout.json'))['24-1287-2059f0a43b72']['83'];
 const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))['24-1287-2059f0a43b72'];
 const result=read(data.pages,83,layout,structure);
 assert(result.text.startsWith('968–969 (2013);'));
 assert(!result.text.includes('Opinion of Jackson'));
 assert(result.text.includes('at 344, n. 11 (opinion of Kavanaugh'));
 assert.equal(data.pages[83].text.slice(result.map[0],result.map[0]+7),'968–969');
});
test('repetition alone never deletes substantive prose or citations',()=>{
 const result=read(Array(4).fill('The judgment is affirmed.\n42 U.S.C. § 1983\nBody text continues here.'));
 assert(result.text.includes('The judgment is affirmed.'));
 assert(result.text.includes('42 U.S.C. § 1983'));
});
test('verified numeric section headings survive while printed folios are omitted',()=>{
 assert.equal(read([{label:'10',text:'2\nA new section.'}]).text,'A new section.');
 assert.equal(read([{label:'2',text:'2\nA new section.'}]).text,'A new section.');
 assert.equal(read([{label:'2',text:'2\nA new section.'}],0,{}, {headings:[{page:0,start:0,end:1}]}).text,'2\n\nA new section.');
});
test('PDF paragraph starts survive line reflow',()=>{
 const raw='A long sentence continues\nthrough the physical line.\nThe next paragraph.';
 const result=read([raw],0,{paragraphStarts:[raw.indexOf('The next')]});
 assert.equal(result.text,'A long sentence continues through the physical line.\n\nThe next paragraph.');
});
test('presentation ligatures expand without changing source anchors',()=>{
 const raw='ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ';const result=read([raw]);
 assert.equal(result.text,'ff fi fl ffi ffl st st');
 assert.equal(result.map[0],0);assert.equal(result.map[1],0);
 assert.equal(result.map.at(-1),raw.length-1);
});
test('evidence-backed repairs fail closed when raw source wording changes',()=>{
 const repairs=[{page:0,start:0,end:6,text:'official',expectedText:'offcial'}];
 // Exact source range is seven characters; a stale range must not apply.
 assert.equal(read(['offcial'],0,{}, {repairs}).text,'offcial');
 repairs[0].end=7;
 assert.equal(read(['offcial'],0,{}, {repairs}).text,'official');
 assert.equal(read(['officer'],0,{}, {repairs}).text,'officer');
});
test('empty Statement of Costs and empty sections offer the original PDF instead of a blank reader',()=>{
 const data=JSON.parse(fs.readFileSync('dist/data/docs/24-781-e9554703de88.json'));
 const context=vm.createContext({data,ds:()=>({sourceUrl:data.sourceUrl}),filedPDF:d=>d.sourceUrl,button:(text)=>`<button>${text}</button>`});
 vm.runInContext(fn('hasSourceText')+fn('documentHTML'),context);
 assert.equal(vm.runInContext('hasSourceText(data)',context),false);
 const html=vm.runInContext('documentHTML("costs",data)',context);
 assert.match(html,/Reading text unavailable/);assert.match(html,/<button>Open PDF<\/button>/);
 context.data={pages:[{text:'outside'}, {text:'inside'}]};
 assert.equal(vm.runInContext('hasSourceText(data,{startPage:1,startOffset:0,endPage:1,endOffset:0})',context),false);
 assert.equal(vm.runInContext('hasSourceText(data,{startPage:1,startOffset:0,endPage:1,endOffset:6})',context),true);
});

test('cross-page citation continuations do not inherit false paragraph gaps',()=>{
 const context=vm.createContext({});vm.runInContext(fn('pageJoin'),context);
 assert.equal(vm.runInContext("pageJoin('65 Stan. L. Rev. 901, 965–966,','968–969 (2013); see also',true)",context),' ');
 assert.equal(vm.runInContext("pageJoin('A completed sentence.','A new paragraph.',true)",context),'\n\n');
});
test('repair offset maps use UTF-16 code units for non-BMP replacements',()=>{
 const result=read(['XX'],0,{}, {repairs:[{page:0,start:0,end:2,text:'😀',expectedText:'XX'}]});
 assert.equal(result.text,'😀');assert.equal(result.map.length,2);
});

test('Landor multiline running headers are omitted only at verified source ranges',()=>{
 const id='23-1197-47c01f9ff679';
 const data=JSON.parse(fs.readFileSync(`dist/data/docs/${id}.json`));
 const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))[id];
 const omissions=structure.omitRanges.filter(r=>r.evidence==='docs/landor-header-review.md');
 assert.equal(omissions.length,24);
 for(const r of omissions){
  assert.equal(data.pages[r.page].text.slice(r.start,r.end),r.expectedText);
  const result=read(data.pages,r.page,{},structure);
  assert(!result.text.startsWith('PUBLIC SAFETY'));
  assert(!result.text.includes('LANDOR v. LOUISIANA DEPT. OF CORRECTIONS AND'));
 }
 assert(read(['PUBLIC SAFETY\nSubstantive text follows.']).text.startsWith('PUBLIC SAFETY'));
});
test('Landor briefs use printed folios, not physical PDF ordinals',()=>{
 for(const [id,page] of [['23-1197-2ff7db93d400',9],['23-1197-391b7f603342',8]]){
  const data=JSON.parse(fs.readFileSync(`dist/data/docs/${id}.json`));
  assert(data.pages[page].text.startsWith('2\n'));
  assert(!read(data.pages,page).text.startsWith('2'));
 }
});
test('source-guarded header omissions fail closed on changed text',()=>{
 const structure={omitRanges:[{page:0,start:0,end:13,expectedText:'PUBLIC SAFETY'}]};
 assert.equal(read(['PUBLIC SAFETY\nBody text.'],0,{},structure).text,'Body text.');
 assert(read(['PUBLIC POLICY\nBody text.'],0,{},structure).text.startsWith('PUBLIC POLICY'));
});
