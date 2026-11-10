import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/app.js','utf8');
function render(expanded,paused=false){
 const context=vm.createContext({playbackExpanded:expanded,state:{narrationSpeed:1.25,route:'reader'},esc:x=>x,ds:()=>({}),documentLabel:()=> 'Opinion',icon:x=>x,
 button:(label,action,value='',cls='',extra='')=>'<button class="'+cls+'" data-action="'+action+'" data-value="'+value+'" '+extra+'>'+label+'</button>'});
 vm.runInContext(source.slice(source.indexOf('function narrationIdentity('),source.indexOf('function playbackControls(')),context);
 return context.devicePlaybackControls({id:'opinion',index:0,chunks:Array(111),paused});
}
test('device narration does not expose synthesis passage counts',()=>{
 for(const expanded of [false,true]){
  const html=render(expanded);
  assert.doesNotMatch(html,/1\s*\/\s*111|Passage 1 of 111/);
  assert.match(html,/aria-label="Previous passage"/);
  assert.match(html,/aria-label="Next passage"/);
  assert.match(html,/aria-label="Stop audio"/);
  assert.match(html,/value="1.25" selected>1.25×/);
  assert.match(html,new RegExp('aria-expanded="'+expanded+'"'));
 }
});
test('device play and pause remain distinct from expansion and speed',()=>{
 assert.match(render(false,true),/data-action="playback-toggle"[^>]*aria-label="Play"/);
 assert.match(render(false,false),/data-action="playback-toggle"[^>]*aria-label="Pause"/);
 assert.match(render(false),/data-action="playback-expand"[^>]*aria-label="Expand audio controls"/);
});
