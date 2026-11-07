import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('dist/app.js','utf8');
const css=fs.readFileSync('dist/citation-refinement.css','utf8');
const start=source.indexOf('function renderText(');
assert(start>=0);
const renderer=source.slice(start,source.indexOf('\nfunction ',start+1));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(text,citations,notes=[]) {
  const context=vm.createContext({
    text,esc,state:{notes},docCache:new Map(),
    citationRanges:()=>citations,
    noteMatches:()=>true,
    lowerBound:(_map,offset)=>offset,
    structureFor:()=>({headings:[],footnoteMarkers:[]}),
  });
  vm.runInContext(renderer,context);
  return vm.runInContext('renderText(text,"test-document",0,[])',context);
}

test('long citations render as fragmentable, keyboard-focusable text rather than button boxes',()=>{
  const cite='Mitsubishi Motors Corp. v. Soler Chrysler-Plymouth, Inc., 473 U.S. 614, 633-35';
  const text=`this Court has repeatedly rejected, see, e.g., ${cite} (1985). Making matters worse`;
  const from=text.indexOf(cite);
  const html=render(text,[{start:from,end:from+cite.length,ref:{key:'case|0|citation'}}]);
  assert.match(html,/<span\b[^>]*class="citation"[^>]*role="button"[^>]*tabindex="0"[^>]*data-ref-key="case\|0\|citation"/);
  assert(!/<button\b/.test(html));
  assert.equal(html.replace(/<[^>]*>/g,''),text);
  assert(html.endsWith('</span> (1985). Making matters worse'));
});

test('reference fragments inside annotations preserve every source character and reference key',()=>{
  const text='See 584 U.S. at 524, and App.28a (King, J., dissenting).';
  const first=text.indexOf('584');
  const html=render(text,[
    {start:first,end:text.indexOf(','),ref:{key:'authority|0|1'}},
    {start:text.indexOf('App.'),end:text.indexOf(' (King'),ref:{key:'appendix|0|2'}},
  ],[{id:'note-1',color:'yellow',anchors:[{page:0,start:first+4,end:first+10}]}]);
  assert.equal(html.replace(/<[^>]*>/g,''),text);
  assert.equal((html.match(/data-ref-key="authority\|0\|1"/g)||[]).length,3);
  assert.match(html,/data-ref-key="appendix\|0\|2"/);
  assert.match(html,/<mark class="annotation yellow/);
  assert(!/<button\b/.test(html));
});

test('inline reference text and identifiers remain escaped',()=>{
  const text='A & B < C';
  const html=render(text,[{start:0,end:text.length,ref:{key:'ref"<unsafe>'}}]);
  assert.match(html,/data-ref-key="ref&quot;&lt;unsafe&gt;"/);
  assert.match(html,/>A &amp; B &lt; C<\/span>/);
  assert(!html.includes('<unsafe>'));
});

test('citation styling inherits paragraph typography and preserves visible keyboard focus',()=>{
  const rule=css.match(/\.document-body \.page-text \.citation\s*\{([^}]+)\}/)?.[1];
  assert(rule);
  for(const declaration of ['display: inline','font: inherit','text-align: inherit','vertical-align: baseline','white-space: inherit','overflow-wrap: inherit','padding: 0']) {
    assert(rule.includes(declaration),declaration);
  }
  assert(!/font-weight\s*:|line-height\s*:|height\s*:|overflow\s*:\s*hidden/.test(rule));
  assert.match(css,/\.citation:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  assert.match(fs.readFileSync('dist/index.html','utf8'),/href="citation-refinement\.css"/);
});

test('Enter and Space open inline reference previews without scrolling the reader',()=>{
  const listener=source.split('\n').find(line=>line.includes("document.addEventListener('keydown'")&&line.includes('.citation[role="button"]'));
  assert(listener,'Inline reference keyboard activation is registered');
  let onKey,prevented=0;
  const opened=[];
  const context=vm.createContext({
    document:{addEventListener:(event,callback)=>{assert.equal(event,'keydown');onKey=callback}},
    showPeek:ref=>opened.push(ref),
  });
  vm.runInContext(listener,context);
  const ref={dataset:{refKey:'case|0|citation'}};
  const target={closest:()=>ref};
  for(const key of ['Enter',' '])onKey({key,target,preventDefault(){prevented++}});
  onKey({key:'ArrowDown',target,preventDefault(){prevented++}});
  onKey({key:'Enter',target:{closest:()=>null},preventDefault(){prevented++}});
  assert.equal(prevented,2);
  assert.deepEqual(opened,[ref,ref]);
});
