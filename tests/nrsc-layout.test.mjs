import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {captureReader,renderReaderContent} from '../dist/reader-content.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const structures=read('dist/data/reader-structure.json'), curated=read('scripts/curated-reader-structure.json');
const ids=['24-621-7b13c24198cf','24-621-f75392ee825b'];
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name){const a=app.indexOf(`function ${name}(`);return app.slice(a,app.indexOf('\nfunction ',a+1));}
function display(id,page,override={}){
 const data=read(`dist/data/docs/${id}.json`),structure={...structures[id],...override};
 const context=vm.createContext({data,page,id,readingCache:new Map(),displayMaps:new Map(),ds:()=>({category:'Other'}),category:d=>d.category,readerStructure:{[id]:structure},textSourceId:x=>x,derivedStructures:new Map(),layoutPage:()=>({}),tidyFootnoteMarkers:x=>x,extendHeadingMarker:x=>x,state:{notes:[]},docCache:new Map([[id,data]]),citationRanges:()=>[],numberedReading:(text,map,citations)=>({text,map,citations}),esc:x=>x,noteMatches:()=>false});
 for(const name of ['structureFor','lowerBound','normalizeReadingTypography','repairReading','preserveCounselBlocks','tidyHeadingSpace','readingText','verifiedCounselBlocks','counselGridCells','renderText'])vm.runInContext(fn(name),context);
 return vm.runInContext('(()=>{const r=readingText(data.pages[page].text,id,page,data);return {...r,html:renderText(r.text,id,page,r.map)}})()',context);
}
test('NRSC curated structure has exact source evidence and only verified headings',()=>{
 for(const id of ids){
  const s=structures[id],data=read(`dist/data/docs/${id}.json`);assert.deepEqual(s,curated[id]);
  for(const key of ['headings','omitRanges','counselBlocks','paragraphStarts'])for(const r of s[key]){assert.equal(data.pages[r.page].text.slice(r.start,r.end),r.expectedText);assert(fs.existsSync(r.evidence));}
  assert(!s.headings.some(h=>/NRCC\.|MARTINEZ|UPSHAW|BORGERSON|BERRY/.test(h.text)));
  for(const b of s.counselBlocks){const result=display(id,b.page);assert(result.text.includes(b.expectedText));assert.equal(result.text.length,result.map.length);}
 }
});
test('NRSC page 11 separates actual heading and body without splitting NRCC sentence',()=>{
 const r=display(ids[0],10);
 assert.match(r.html,/role="heading" aria-level="3">I\. There Is No Threat Of Enforcement<\/span> A\. The FEC/);
 assert.match(r.text,/against the Vice President, NRSC, or NRCC\.\n\nNor could it/);
 assert.equal(r.text.length,r.map.length);
 for(let i=1;i<r.map.length;i++)assert(r.map[i]>=r.map[i-1]);
});

test('NRSC heading and counsel markup survives editor capture and reload',()=>{
 for(const [id,page] of [[ids[0],10],[ids[0],3],[ids[0],22],[ids[1],2]]){
  const r=display(id,page),root=new JSDOM('<body>'+r.html).window.document.body;
  const nodes=captureReader(root),html=renderReaderContent({revision:'nrsc-test',nodes,references:[]});
  const restored=new JSDOM('<body>'+html).window.document.body;
  assert.deepEqual(captureReader(restored),nodes);assert.equal(restored.textContent,root.textContent);
  assert.equal(restored.querySelectorAll('[role=heading]').length,root.querySelectorAll('[role=heading]').length);
  assert.equal(restored.querySelectorAll('.counsel-block').length,root.querySelectorAll('.counsel-block').length);
 }
});
test('legacy heading breaks remain unchanged and stale pinned headings fail closed',()=>{
 const old=display(ids[0],10,{headingMode:undefined});assert.match(old.text,/NRSC, or\n\nNRCC\./);
 const stale=structures[ids[0]].headings.map(h=>({...h,expectedText:'stale'}));
 assert.doesNotMatch(display(ids[0],10,{headings:stale}).html,/role="heading"/);
});
test('single-column NRSC counsel collapses mobile indentation without changing source text or column grids',()=>{
 const css=fs.readFileSync('dist/reader-refinement.css','utf8');
 assert.match(css,/@media\(max-width:600px\)\{\.document-body \.counsel-block:not\(:has\(\.counsel-cell\)\)\{white-space:pre-line;overflow-wrap:anywhere;overflow-x:visible;/);
 let count=0;
 for(const [id,s] of Object.entries(structures))for(const b of s.counselBlocks||[]){
  if(b.columnBreaks)continue;count++;assert(ids.includes(id));
  const root=new JSDOM('<body>'+display(id,b.page).html).window.document.body;
  const block=root.querySelector('.counsel-block:not(:has(.counsel-cell))');assert(block);
  assert.equal(block.textContent,b.expectedText);assert.equal(block.querySelectorAll('[role=heading]').length,0);
  for(const line of b.expectedText.split('\n'))assert(line.trim().length<=25);
 }
 assert.equal(count,3);
});
