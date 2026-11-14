// All times are seconds in a published recording. Cue ranges retain PDF offsets.
export function cueAt(cues, seconds) {
 let lo=0,hi=cues.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].start<=seconds)lo=mid+1;else hi=mid}
 const cue=cues[lo-1];return cue&&seconds<cue.end?cue:null;
}
export function cueForSource(cues,page,offset){
 const onPage=cues.filter(c=>!c.transition&&c.ranges.some(r=>r.page===page));
 const exact=onPage.find(c=>c.ranges.some(r=>r.page===page&&r.start<=offset&&r.end>offset));
 if(exact)return exact;
 // Notes are heard at their markers, so playback order can differ from PDF
 // offset order. Find the nearest source range instead of the first later cue.
 let nearest=null,distance=Infinity;
 for(const cue of onPage)for(const range of cue.ranges.filter(r=>r.page===page)){
  const gap=offset<range.start?range.start-offset:offset-range.end;
  if(gap<distance){nearest=cue;distance=gap}
 }
 return nearest;
}
export function bufferedSpans(media,duration){
 if(!Number.isFinite(duration)||duration<=0)return [];
 const ranges=[];
 for(let i=0;i<media.buffered.length;i++){const start=Math.max(0,media.buffered.start(i)),end=Math.min(duration,media.buffered.end(i));if(end>start)ranges.push({left:start/duration*100,width:(end-start)/duration*100})}
 return ranges;
}
export function matchingCue(cues,previous){return previous?cues.find(c=>c.paragraph===previous.paragraph&&c.text===previous.text):null}

export function isBuffering(media){
 if(media.paused||media.ended||media.readyState>=3)return false;
 // WebKit can retain HAVE_CURRENT_DATA after a seek while its clock advances
 // through fully buffered audio. Check the actual buffer before reporting a stall.
 const next=Math.min(media.currentTime+.25,Number.isFinite(media.duration)?media.duration:Infinity);
 for(let i=0;i<media.buffered.length;i++)if(media.buffered.start(i)<=media.currentTime&&media.buffered.end(i)>=next)return false;
 return true;
}
