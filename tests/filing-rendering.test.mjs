import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {citationsIn} from '../dist/reader-authorities.js';
const app=fs.readFileSync('dist/app.js','utf8');
function fn(n){const a=app.indexOf('function '+n+'(');return app.slice(a,app.indexOf('\nfunction ',a+1));}
function context(id){
 const data=JSON.parse(fs.readFileSync('dist/data/docs/'+id+'.json'));
 const ctx=vm.createContext({id,data,document:{addEventListener(){}},window:{addEventListener(){}},ds:()=>({category:'Other'}),category:d=>d.category,textSourceId:x=>x,readerStructure:JSON.parse(fs.readFileSync('dist/data/reader-structure.json')),derivedStructures:new Map(),layoutPage:()=>({}),readingCache:new Map(),displayMaps:new Map(),docCache:new Map([[id,data]]),state:{notes:[]},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),citationRanges:(text)=>citationsIn(text).map((c,i)=>({...c,ref:{key:'ref-'+i,number:i+1}}))});
 for(const n of ['lowerBound','structureFor','readingText','normalizeReadingTypography','repairReading','tidyHeadingSpace','tidyFootnoteMarkers','extendHeadingMarker','numberedReading','preserveCounselBlocks','verifiedCounselBlocks','renderText'])vm.runInContext(fn(n),ctx);
 return ctx;
}
test('Hecox CONCLUSION excludes preceding reporter and never splits its reference marker',()=>{
 const ctx=context('24-38-d297c2fd12b4');
 const html=vm.runInContext('const r=readingText(data.pages[10].text,id,10,data);renderText(r.text,id,10,r.map)',ctx);
 const dom=new JSDOM(html).window.document;
 assert.equal([...dom.querySelectorAll('.reader-section-heading')].find(h=>h.textContent.includes('CONCLUSION'))?.textContent.trim(),'CONCLUSION');
 for(const c of dom.querySelectorAll('.citation'))assert.match(c.textContent,/^\[\d+\]$/);
 assert.equal(dom.querySelector('.reader-section-heading .citation'),null);
});
test('source-verified counsel blocks retain exact whitespace, source positions and editor-safe styling',()=>{
 const manifest=JSON.parse(fs.readFileSync('dist/data/procedural-filing-provenance.json'));
 for(const d of manifest.documents){const ctx=context(d.id);const result=vm.runInContext(`(()=>{const blocks=readerStructure[id].counselBlocks;return blocks.map(block=>{const r=readingText(data.pages[block.page].text,id,block.page,data),a=lowerBound(r.map,block.start),b=lowerBound(r.map,block.end);return {block,text:r.text.slice(a,b),map:r.map.slice(a,b),html:renderText(r.text,id,block.page,r.map)}})})()`,ctx);
 assert(result.length,d.id);
 for(const r of result){assert.equal(r.text,r.block.expectedText);assert.deepEqual(Array.from(r.map),Array.from({length:r.text.length},(_,i)=>r.block.start+i));const dom=new JSDOM(r.html).window.document;assert.equal(dom.querySelector('.counsel-block')?.textContent,r.text);assert.equal(dom.querySelector('.counsel-block .citation'),null);assert.equal(dom.querySelector('.counsel-block .reader-section-heading'),null);}}
});
test('counsel preservation fails closed when a source guard no longer matches',()=>{
 const ctx=context('24-38-d297c2fd12b4');
 const r=vm.runInContext(`preserveCounselBlocks({text:'A B',map:[0,1,3]},'A  B',[{start:0,end:4,expectedText:'WRONG'}])`,ctx);
 assert.equal(r.text,'A B');
});
