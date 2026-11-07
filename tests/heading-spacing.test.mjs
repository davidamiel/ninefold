import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('dist/app.js','utf8');
const start=app.indexOf('function tidyHeadingSpace('),end=app.indexOf('\nfunction ',start+1);
const context=vm.createContext({lowerBound:(map,n)=>{const i=map.findIndex(v=>v>=n);return i<0?map.length:i}});
vm.runInContext(app.slice(start,end),context);
function tidy(text,headings){context.value={text,map:Array.from(text,(_,i)=>i)};context.headings=headings;return vm.runInContext('tidyHeadingSpace(value,headings)',context)}
test('adjacent headings collapse shared whitespace once without losing the next initial',()=>{
 const text='STATEMENT OF THE CASE\nA. Factual Background\n1. Petitioner';
 const second=text.indexOf('A.'),body=text.indexOf('1.');
 const result=tidy(text,[{start:0,end:20},{start:second,end:body-1}]);
 assert.equal(result.text,'STATEMENT OF THE CASE A. Factual Background 1. Petitioner');
 for(let i=0;i<result.text.length;i++)if(!/\s/.test(result.text[i]))assert.equal(result.text[i],text[result.map[i]]);
});
test('duplicate and reordered heading metadata does not consume source characters',()=>{
 const text='TOP\n\nA. Subheading\n\nBody';
 const headings=[{start:5,end:18},{start:0,end:3},{start:5,end:18}];
 const result=tidy(text,headings);
 assert.equal(result.text,'TOP A. Subheading Body');assert.equal(result.map.length,result.text.length);
 assert.equal(result.map[result.text.indexOf('A.')],5);
});
test('Goldman consecutive source headings retain A. Factual Background and source offsets',()=>{
 const data=JSON.parse(fs.readFileSync('dist/data/current-docs/25-1408-9aa9716b9025.json','utf8'));
 const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json','utf8'))['25-1408-9aa9716b9025'];
 const raw=data.pages[15].text,result=tidy(raw,structure.headings.filter(h=>h.page===15));
 assert(result.text.includes('STATEMENT OF THE CASE A. Factual Background'));
 assert.equal(result.map[result.text.indexOf('A. Factual Background')],425);
});
