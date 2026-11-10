import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const id='24-440-660786c6b1c6';
const data=JSON.parse(fs.readFileSync('dist/data/docs/'+id+'.json'));
const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))[id];
const curated=JSON.parse(fs.readFileSync('scripts/curated-reader-structure.json'))[id];
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name){const a=app.indexOf('function '+name+'(');return app.slice(a,app.indexOf('\nfunction ',a+1));}
function read(page,start=0,end=data.pages[page].text.length,includeFootnotes=false){
 const context=vm.createContext({data,page,start,end,includeFootnotes,readingCache:new Map(),displayMaps:new Map(),
 ds:()=>({category:'Decision'}),category:d=>d.category,structureFor:()=>structure,layoutPage:()=>({footnotes:structure.footnotes.filter(f=>f.page===page)}),
 tidyHeadingSpace:x=>x,tidyFootnoteMarkers:x=>x,extendHeadingMarker:x=>x});
 for(const name of ['lowerBound','normalizeReadingTypography','repairReading','preserveCounselBlocks','readingText'])vm.runInContext(fn(name),context);
 return vm.runInContext('readingText(data.pages[page].text,"'+id+'",page,data,start,end,includeFootnotes)',context);
}
test('visually confirmed appendix spacing repairs preserve raw anchors',()=>{
 assert.deepEqual(curated,structure);
 assert.equal(structure.repairs.length,37);
 for(const r of structure.repairs){
  assert.equal(data.pages[r.page].text.slice(r.start,r.end),r.expectedText);
  const result=read(r.page,0,data.pages[r.page].text.length,true);
  assert(result.text.includes(r.text),r.expectedText);
  assert.equal(result.text.length,result.map.length);
  for(let i=1;i<result.map.length;i++)assert(result.map[i]>=result.map[i-1]);
 }
});
test('twelve visually identified appendix footnotes leave prose and remain readable',()=>{
 assert.equal(structure.footnotes.length,12);assert.equal(structure.footnoteMarkers.length,12);
 assert.deepEqual(structure.footnotes.map(f=>f.label),Array.from({length:12},(_,i)=>String(i+1)));
 for(const f of structure.footnotes){
  const raw=data.pages[f.page].text.slice(f.start,f.end);
  assert(raw.startsWith(f.label+' '));
  const note=read(f.page,f.start,f.end,true);
  assert(note.text.length>50);
  const prose=read(f.page);
  const bodyStart=f.start+f.label.length+1;
  assert(!prose.map.some(offset=>offset>=bodyStart&&offset<f.end),'footnote leaked into prose '+f.label);
  const marker=structure.footnoteMarkers.find(m=>m.label===f.label);
  assert.equal(data.pages[marker.page].text.slice(marker.start,marker.end),f.label);
  assert(read(marker.page).map.includes(marker.start),'missing source marker '+f.label);
 }
});
test('opposition cover small-caps extraction is normalized without moving anchors',()=>{
 const cover=JSON.parse(fs.readFileSync('dist/data/docs/24-440-ffcc04da2f19.json')).pages[0].text;
 for(const value of ['John J. Hare','Nathan V. Gin','Elzufon Austin','& Mondell, PA','On Petition for a Writ of Certiorari to the','United States Court of Appeals for the Third Circuit'])assert(cover.includes(value));
 assert.equal(cover.length,660);
});
