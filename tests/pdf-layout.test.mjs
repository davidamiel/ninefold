import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePDFLayout} from '../dist/pdf-layout.js';

const page=(width,height,rotation=0)=>({getViewport:({scale})=>({width:width*scale,height:height*scale,scale,rotation})});
const options={width:774,height:555,zoom:'width'};

test('cold PDF geometry is exact for every page before any raster or text work',async()=>{
 const calls=[];
 const pdf={getPage:async n=>{calls.push(n);return page(612,792)}};
 const layout=await preparePDFLayout(pdf,0,106,options);
 assert.equal(layout.length,106);assert.equal(new Set(calls).size,106);
 assert.equal(layout[15].index,15);
 assert.equal(layout[15].viewport.height,1001.6470588235294);
 // A first jump crosses final-height placeholders, never 800px guesses.
 assert(Math.abs(layout.slice(0,15).reduce((sum,p)=>sum+p.viewport.height+22,0)-15*(1001.6470588235294+22))<1e-8);
});

test('mixed and rotated page sizes retain their individual viewports at every zoom',async()=>{
 const pages=[page(612,792),page(792,612,90),page(420,1000)];
 for(const zoom of ['width','page','0.75','1.5','2']){
  const layout=await preparePDFLayout({getPage:async n=>pages[n-1]},0,3,{...options,zoom});
  for(let i=0;i<3;i++){
   const base=pages[i].getViewport({scale:1});
   const scale=zoom==='width'?774/base.width:zoom==='page'?Math.min(774/base.width,519/base.height):Number(zoom);
   assert.deepEqual(layout[i].viewport,pages[i].getViewport({scale}));
  }
 }
});

test('full-filing sections measure only their exact source range',async()=>{
 const calls=[];const layout=await preparePDFLayout({getPage:async n=>{calls.push(n);return page(612,792)}},7,14,options);
 assert.deepEqual(calls,[8,9,10,11,12,13,14]);
 assert.deepEqual(layout.map(p=>p.index),[7,8,9,10,11,12,13]);
});

test('metadata concurrency stays bounded and cancellation schedules no further pages',async()=>{
 let active=0,max=0,current=true;const pending=[],calls=[];
 const promise=preparePDFLayout({getPage:n=>{calls.push(n);active++;max=Math.max(max,active);return new Promise(resolve=>pending.push(()=>{active--;resolve(page(612,792))}))}},0,100,options,()=>current);
 assert.equal(calls.length,6);assert.equal(max,6);
 current=false;pending.forEach(resolve=>resolve());
 assert.equal(await promise,null);assert.equal(calls.length,6);
});

test('metadata completes out of order without changing source order',async()=>{
 const pending=[];
 const promise=preparePDFLayout({getPage:n=>new Promise(resolve=>pending.push(()=>resolve(page(600+n,800))))},0,6,options);
 pending.reverse().forEach(resolve=>resolve());
 const layout=await promise;assert.deepEqual(layout.map(p=>p.index),[0,1,2,3,4,5]);
 assert.equal(layout[0].viewport.height,800*774/601);
});

test('bad metadata rejects cleanly for the native fallback',async()=>{
 await assert.rejects(preparePDFLayout({getPage:async()=>page(0,800)},0,1,options),/Invalid PDF page dimensions/);
 await assert.rejects(preparePDFLayout({getPage:async()=>{throw Error('broken page')}},0,1,options),/broken page/);
 assert.deepEqual(await preparePDFLayout({},0,0,options),[]);
});
