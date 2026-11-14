import fs from 'node:fs';
import assert from 'node:assert/strict';
import {citationsIn} from '../dist/reader-authorities.js';
import {cueAt,cueForSource,matchingCue,bufferedSpans,isBuffering} from '../dist/recorded-audio.js';
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const prepared=read('data/prepared-documents.json');
const hostedPath=new URL('data/recorded-assets.json',root),hosted=fs.existsSync(hostedPath)?read('data/recorded-assets.json'):{};
for(const [id,doc] of Object.entries(prepared)){
 const source=read(doc.sourceTextPath||'data/'+(doc.sourceDocumentId?'docs/'+doc.sourceDocumentId:'current-docs/'+id)+'.json');
 const body=read(doc.textPath);assert.equal(body.version,doc.version);assert(!doc.paragraphs,'startup inventory contains metadata only');
 for(const paragraph of body.paragraphs){
  assert.equal(paragraph.segments.map(s=>s.text).join(''),paragraph.text);
  for(const segment of paragraph.segments){let lastEnd=0;for(const citation of segment.citations||[]){assert(citation.start>=lastEnd&&citation.end>citation.start&&citation.end<=segment.text.length);assert([citation.label,citation.label.replace(/[.,]$/,'')].includes(segment.text.slice(citation.start,citation.end)));lastEnd=citation.end}assert.equal(segment.text.length,segment.map.length);assert(segment.map.every((offset,i)=>Number.isInteger(offset)&&offset>=0&&offset<source.pages[segment.page].text.length&&(i===0||offset>=segment.map[i-1])))}
 }
 for(const recording of Object.values(doc.recordings)){
  const data=read(recording.cuesPath);assert.equal(data.version,doc.version);assert.equal(data.duration,recording.duration);assert(data.cues.length>0);
  if(recording.url.startsWith('https:')){
   const proof=hosted[data.audioSha256];assert(proof&&proof.url===recording.url&&proof.bytes>1000&&Number.isInteger(proof.releaseAssetId));
   assert.match(recording.url,new RegExp(String.raw`^https://github\.com/davidamiel/ninefold/releases/download/recorded-audio-ot\d{2}/${data.audioSha256.slice(0,24)}\.mp3$`));
  }else assert(fs.statSync(new URL(recording.url,root)).size>1000);
  let previous=-1;
  for(const cue of data.cues){
   assert(cue.start>=previous&&cue.end>cue.start&&cue.end<=data.duration);previous=cue.start;
   for(const r of cue.ranges)assert(r.start>=0&&r.end>r.start&&r.end<=source.pages[r.page].text.length);
   assert.equal(cueAt(data.cues,cue.start),cue);if(!cue.transition)assert.equal(cueForSource(data.cues,cue.ranges[0].page,cue.ranges[0].start),cue);
   assert.equal(matchingCue(data.cues,cue),cue);
  }
  if(id==='26A560-e0601b5a934c')assert.match(data.cues.at(-1).text,/Justice Jackson would deny/);
  if(body.reviewedCitations){
   const notes=body.paragraphs.filter(p=>p.kind==='footnote'&&!p.citationOnly);
   for(const note of notes){assert(data.cues.some(c=>c.footnote===note.label&&c.text.startsWith('Footnote '+note.label+':')));assert(data.cues.some(c=>c.footnote===note.label&&c.text.endsWith('End footnote '+note.label+'.')))}
  }
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

// Interleaved note audio must not capture a click in the main-text source gap.
const bodyBefore={ranges:[{page:0,start:0,end:10}]},note={ranges:[{page:0,start:100,end:120}]},bodyAfter={ranges:[{page:0,start:20,end:30}]};
assert.equal(cueForSource([bodyBefore,note,bodyAfter],0,18),bodyAfter);
