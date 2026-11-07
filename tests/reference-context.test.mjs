import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {passageAround,citationsIn} from '../dist/reader-authorities.js';

const documentId='25-1408-9aa9716b9025';
const source=JSON.parse(fs.readFileSync(`dist/data/current-docs/${documentId}.json`,'utf8'));
const sourcePage=source.pages[15].text;
const expected='In late 2020, Respondents Rhea Ann Brown and Gregory Kevin Maze were approved for Apple Card credit card accounts. JA92 ¶¶ 6, 8.';
const context=(text,cite)=>passageAround(text,text.indexOf(cite),text.indexOf(cite)+cite.length);

test('Goldman JA92 context begins at its supporting sentence, not an arbitrary preceding fragment',()=>{
  const text=sourcePage.replace(/\s+/g,' ');
  assert.equal(context(text,'JA92'),expected);
  assert.equal(source.pages[15].text,sourcePage,'Source text and citation offsets remain immutable');
});

test('context respects real paragraphs and preserves legal paragraph markers',()=>{
  const text='An unrelated paragraph.\n\n'+expected+' Each agreed to the Apple Customer Agreement.';
  assert.equal(context(text,'JA92'),expected);
  assert.equal(citationsIn(text).find(c=>c.type==='appendix').label,'JA92');
  assert.equal((context(text,'JA92').match(/¶/g)||[]).length,2);
});

test('Goldman petition page 4 retains the paragraph breaks visible in source PDF page 16',()=>{
  const layout=JSON.parse(fs.readFileSync('dist/data/reading-layout.json','utf8'))[documentId]['15'];
  assert.deepEqual(layout.paragraphStarts.map(at=>sourcePage.slice(at).split('\n')[0]),[
    'This Court’s guidance on the applicability of the',
    '1.  Petitioner GS Bank is a New York-chartered',
    'In late 2020, Respondents Rhea Ann Brown and',
    '2.   In June 2023, Brown filed for Chapter 13',
  ]);
});

test('legal abbreviations do not create sentence fragments',()=>{
  const text='Prior sentence. The decision in Brown v. Goldman Sachs Bank USA, Inc. followed No. 23-70426 in the W.D. Va. court. JA110. Next sentence.';
  assert.equal(context(text,'JA110'),'The decision in Brown v. Goldman Sachs Bank USA, Inc. followed No. 23-70426 in the W.D. Va. court. JA110.');
});

test('long contexts use word boundaries and visible ellipses without losing the citation',()=>{
  const text='This '+('long supporting phrase '.repeat(35))+'supports JA92 '+('and more record context '.repeat(25))+'at the end. Next sentence.';
  const result=context(text,'JA92');
  assert.match(result,/^… /);
  assert.match(result,/ …$/);
  assert(result.includes('JA92'));
  assert(result.length<550);
  assert(!result.startsWith('… upporting'));
});

test('page continuations visibly disclose incomplete sentences',()=>{
  assert.equal(context('with the record at JA92 and additional material','JA92'),'… with the record at JA92 and additional material …');
});

test('a standalone citation with a signal retains the sentence it supports',()=>{
  const text='Earlier material. The parties consented to arbitration. See JA115 & n.3. Next sentence.';
  assert.equal(context(text,'JA115'),'The parties consented to arbitration. See JA115 & n.3.');
});
