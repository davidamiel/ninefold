import fs from 'node:fs';
import assert from 'node:assert/strict';
import {citationsIn} from '../dist/reader-authorities.js';
import {cueAt,cueForSource,matchingCue,bufferedSpans,isBuffering} from '../dist/recorded-audio.js';
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const prepared=read('data/prepared-documents.json');
for(const [id,doc] of Object.entries(prepared)){
 const source=read('data/current-docs/'+id+'.json');
 const body=read(doc.textPath);assert.equal(body.version,doc.version);assert(!doc.paragraphs,'startup inventory contains metadata only');
 for(const paragraph of body.paragraphs){
  assert.equal(paragraph.segments.map(s=>s.text).join(''),paragraph.text);
  for(const segment of paragraph.segments){let lastEnd=0;for(const citation of segment.citations||[]){assert(citation.start>=lastEnd&&citation.end>citation.start&&citation.end<=segment.text.length);assert.equal(segment.text.slice(citation.start,citation.end),citation.label.replace(/[.,]$/,''));lastEnd=citation.end}assert.equal(segment.text.length,segment.map.length);assert(segment.map.every((offset,i)=>Number.isInteger(offset)&&offset>=0&&offset<source.pages[segment.page].text.length&&(i===0||offset>=segment.map[i-1])))}
 }
 for(const recording of Object.values(doc.recordings)){
  assert(fs.statSync(new URL(recording.url,root)).size>1000);
  const data=read(recording.cuesPath);assert.equal(data.version,doc.version);assert.equal(data.duration,recording.duration);assert(data.cues.length>20);
  let previous=-1;
  for(const cue of data.cues){
   assert(cue.start>=previous&&cue.end>cue.start&&cue.end<=data.duration);previous=cue.start;
   for(const r of cue.ranges)assert(r.start>=0&&r.end>r.start&&r.end<=source.pages[r.page].text.length);
   assert.equal(cueAt(data.cues,cue.start),cue);assert.equal(cueForSource(data.cues,cue.ranges[0].page,cue.ranges[0].start),cue);
   assert.equal(matchingCue(data.cues,cue),cue);
  }
  assert.match(data.cues.at(-1).text,/Justice Jackson would deny/);
 }
}
assert.deepEqual(bufferedSpans({buffered:{length:2,start:i=>[0,50][i],end:i=>[20,75][i]}},100),[{left:0,width:20},{left:50,width:25}]);
assert.deepEqual(bufferedSpans({buffered:{length:0}},0),[]);
assert.equal(citationsIn('110 Stat. 3009–554')[0].canonical,'110 Stat. 3009–554');

const combined=citationsIn('§102(a), 110 Stat. 3009–554, as amended, note following 8 U. S. C. §1103.');
assert.equal(combined.length,1);assert.equal(combined[0].canonical,'110 Stat. 3009–554');
assert.equal(citationsIn('91 Fed. Reg. 7298 (2026); id., at 40550')[1].canonical,'91 Fed. Reg. 40550');
assert.equal(citationsIn('8 C. F. R. §102.3')[0].canonical,'8 C.F.R. § 102.3');

assert.equal(citationsIn('§102(c)(2)(A)',false,false,null,{'102':'110 Stat. 3009–554','102(c)':'119 Stat. 306'})[0].canonical,'119 Stat. 306');

// Regression: WebKit's limited readiness is not a stall when data covers the seek.
const media={paused:false,ended:false,readyState:2,currentTime:174,duration:378,buffered:{length:1,start:()=>0,end:()=>378}};
assert.equal(isBuffering(media),false);
assert.equal(isBuffering({...media,buffered:{length:1,start:()=>0,end:()=>174}}),true);
assert.equal(isBuffering({...media,paused:true,buffered:{length:0}}),false);
console.log('Recorded audio checks passed: canonical source maps, both voice timelines, sentence seeking and buffered ranges.');
