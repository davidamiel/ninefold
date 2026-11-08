import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../dist/polish.css',import.meta.url),'utf8');
function rulesFor(selector){
 return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([,selectors])=>selectors.split(',').some(value=>value.trim()===selector))
  .map(([, ,body])=>body).join(';');
}

test('vote portraits share dimensions in case cards and the reader',()=>{
 assert.match(rulesFor('.vote-face'),/width:34px;height:38px/);
 assert.match(rulesFor('.reader-votes .vote-face'),/width:39px;height:43px/);
 for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  if(selector.includes('.minority')&&selector.includes('.vote-face')){
   assert.doesNotMatch(body,/(?:^|;)(?:width|height|min-width|min-height|max-width|max-height|transform|scale):/,
    'Dissent styling must not override the shared portrait geometry');
  }
 }
});

test('dissent remains gray, with wrapping and extra space between coalitions',()=>{
 assert.match(rulesFor('.minority .vote-face'),/filter:grayscale\(1\);opacity:\.65/);
 assert.match(rulesFor('.vote-portraits'),/flex-wrap:wrap;gap:8px 20px/);
 assert.match(rulesFor('.vote-coalition>div'),/gap:3px/);
 assert.match(rulesFor('.vote-coalition>div'),/flex-wrap:wrap/);
});
