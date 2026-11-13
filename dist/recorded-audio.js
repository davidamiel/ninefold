// All times are seconds in a published recording. Cue ranges retain PDF offsets.
export function cueAt(cues, seconds) {
 let lo=0,hi=cues.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].start<=seconds)lo=mid+1;else hi=mid}
 const cue=cues[lo-1];return cue&&seconds<cue.end?cue:null;
}
export function cueForSource(cues,page,offset){
 const onPage=cues.filter(c=>c.ranges.some(r=>r.page===page));
 return onPage.find(c=>c.ranges.some(r=>r.page===page&&r.start<=offset&&r.end>offset))||onPage.find(c=>c.ranges.some(r=>r.page===page&&r.end>offset))||onPage.at(-1)||null;
}
export function bufferedSpans(media,duration){
 if(!Number.isFinite(duration)||duration<=0)return [];
 const ranges=[];
 for(let i=0;i<media.buffered.length;i++){const start=Math.max(0,media.buffered.start(i)),end=Math.min(duration,media.buffered.end(i));if(end>start)ranges.push({left:start/duration*100,width:(end-start)/duration*100})}
 return ranges;
}
export function matchingCue(cues,previous){return previous?cues.find(c=>c.paragraph===previous.paragraph&&c.text===previous.text):null}
