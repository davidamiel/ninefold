import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sentenceAtTime,timeAtSentenceOffset} from '../dist/transcript-timing.js';

function timedWords(text, starts = []) {
  return Array.from(text.matchAll(/\S+/gu), (word, i) => [word.index, starts[i] ?? i + 1, (starts[i] ?? i + 1) + 0.2]);
}
function spoken(turn, time) {
  const range = sentenceAtTime(turn, time);
  return range && turn.text.slice(range.start, range.end);
}

test('word timing selects exact source ranges and holds the last word through pauses', () => {
  const text = '  First sentence.  Second sentence!  ';
  const turn = {text, start: 0, end: 12, words: timedWords(text, [1, 2, 8, 9])};
  assert.deepEqual(sentenceAtTime(turn, 0), {start: 2, end: 17});
  assert.equal(spoken(turn, 2.2), 'First sentence.');
  assert.equal(spoken(turn, 7.999), 'First sentence.');
  assert.equal(spoken(turn, 8), 'Second sentence!');
  assert.equal(spoken(turn, 11.999), 'Second sentence!');
  assert.equal(sentenceAtTime(turn, -0.001), null);
  assert.equal(sentenceAtTime(turn, 12), null);
});

test('supports backward seeks, zero-duration anchors, and coincident word starts', () => {
  const text = 'One. Two. Three.';
  const turn = {text, start: 0, end: 10, words: [[0, 0, 0], [5, 3, 3], [10, 3, 4]]};
  assert.equal(spoken(turn, 8), 'Three.');
  assert.equal(spoken(turn, 3), 'Three.');
  assert.equal(spoken(turn, 2.999), 'One.');
  assert.equal(spoken(turn, 0), 'One.');
});

test('word offsets and timing win over contradictory block timing', () => {
  const text = 'One. Two.';
  const turn = {text, start: 0, end: 10, words: [[0, 0, 1], [5, 8, 9]], blocks: [{text, start: 0, end: 1}]};
  assert.equal(spoken(turn, 6), 'One.');
  assert.equal(spoken(turn, 8), 'Two.');
});

test('estimates within timed blocks and holds the previous block during gaps', () => {
  const text = 'First. Second. Third.';
  const turn = {text, start: 0, end: 20, blocks: [
    {text: 'First. Second.', start: 2, end: 10},
    {text: 'Third.', start: 15, end: 18}
  ]};
  assert.equal(spoken(turn, 0), 'First.');
  assert.equal(spoken(turn, 2), 'First.');
  assert.equal(spoken(turn, 8), 'Second.');
  assert.equal(spoken(turn, 14.999), 'Second.');
  assert.equal(spoken(turn, 15), 'Third.');
  assert.equal(spoken(turn, 19.999), 'Third.');
});

test('maps repeated block text sequentially and ignores PDF source-page offsets', () => {
  const text = 'Yes. Yes. No.';
  const turn = {text, start: 0, end: 8, blocks: [
    {text: 'Yes.', start: 0, end: 1, sourceStart: 300, sourceEnd: 304},
    {text: 'Yes.', start: 3, end: 4, sourceStart: 700, sourceEnd: 704},
    {text: 'No.', start: 6, end: 8}
  ]};
  assert.deepEqual(sentenceAtTime(turn, 3), {start: 5, end: 9});
  assert.deepEqual(sentenceAtTime(turn, 6), {start: 10, end: 13});
});

test('falls back to the entire turn when word and block data are absent or unusable', () => {
  const text = 'First. Second.';
  const turn = {text, start: 10, end: 24, words: [null, [-1, 10, 11], [99, 10, 11], [0, NaN, 11], [0, 12, 11]], blocks: [
    {text: 'Missing text.', start: 10, end: 24},
    {text, start: 10, end: 10}
  ]};
  assert.equal(spoken(turn, 10), 'First.');
  assert.equal(spoken(turn, 17), 'Second.');
  assert.equal(spoken(turn, 23.999), 'Second.');
});

test('joins titles, name initials, legal citations, and common abbreviations', () => {
  const text = 'Mr. Chief Justice, Dr. Smith cited John G. Roberts, e.g. in Smith v. Jones, No. 24, 2 U.S. 3. We agree.';
  const turn = {text, start: 0, end: 100, words: timedWords(text)};
  const first = text.slice(0, text.indexOf(' We agree.'));
  for (const word of turn.words) {
    assert.equal(spoken(turn, word[1]), word[0] < first.length ? first : 'We agree.');
  }
});

test('preserves boundaries after No. and sentence-final initialisms', () => {
  const text = 'No. The U.S. Constitution applies in the U.S. We agree.';
  const turn = {text, start: 0, end: 100, words: timedWords(text)};
  assert.equal(spoken(turn, 1), 'No.');
  assert.equal(spoken(turn, 2), 'The U.S. Constitution applies in the U.S.');
  assert.equal(spoken(turn, 10), 'We agree.');
});

test('preserves Unicode source offsets, closing quotes, and unpunctuated final text', () => {
  const text = '  “Café 👩‍⚖️?”  Yes!  Last fragment  ';
  const turn = {text, start: 0, end: text.length};
  assert.deepEqual(sentenceAtTime(turn, 0), {start: 2, end: text.indexOf('  Yes!')});
  assert.equal(spoken(turn, text.indexOf('Yes!')), 'Yes!');
  assert.equal(spoken(turn, text.indexOf('Last')), 'Last fragment');
});

test('does not mutate source records or return mutable cached ranges', () => {
  const text = 'One. Two.';
  const words = Object.freeze([Object.freeze([5, 5, 6]), Object.freeze([0, 0, 1])]);
  const turn = Object.freeze({text, start: 0, end: 10, words});
  const range = sentenceAtTime(turn, 0);
  range.end = 999;
  assert.deepEqual(sentenceAtTime(turn, 0), {start: 0, end: 4});
  assert.equal(spoken(turn, 5), 'Two.');
  assert.equal(words[0][0], 5);
});

test('caches sentence segmentation per turn and rebuilds when text changes', () => {
  const original = Intl.Segmenter;
  let calls = 0;
  try {
    Intl.Segmenter = class extends original {
      constructor(...args) { super(...args); calls++; }
    };
    const turn = {text: 'One. Two.', start: 0, end: 10};
    sentenceAtTime(turn, 1);
    sentenceAtTime(turn, 8);
    assert.equal(calls, 1);
    turn.text = 'Changed.';
    assert.equal(spoken(turn, 8), 'Changed.');
    assert.equal(calls, 2);
  } finally {
    Intl.Segmenter = original;
  }
});

test('regex fallback handles abbreviations, decimals, ellipses, and final fragments', () => {
  const original = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    const text = 'Mr. Chief Justice, the U.S. Constitution says so. It costs 3.14. Really?! “Yes...” Last fragment';
    const turn = {text, start: 0, end: text.length};
    assert.equal(spoken(turn, 0), 'Mr. Chief Justice, the U.S. Constitution says so.');
    assert.equal(spoken(turn, text.indexOf('It costs')), 'It costs 3.14.');
    assert.equal(spoken(turn, text.indexOf('Really')), 'Really?!');
    assert.equal(spoken(turn, text.indexOf('“Yes')), '“Yes...”');
    assert.equal(spoken(turn, text.indexOf('Last')), 'Last fragment');
  } finally {
    Intl.Segmenter = original;
  }
});

test('uses regex fallback when a platform Segmenter throws', () => {
  const original = Intl.Segmenter;
  try {
    Intl.Segmenter = class {constructor() {throw Error('unsupported locale');}};
    assert.equal(spoken({text: 'One. Two.', start: 0, end: 10}, 8), 'Two.');
  } finally {
    Intl.Segmenter = original;
  }
});

test('empty and invalid inputs never produce a highlight', () => {
  for (const turn of [null, {}, {text: '', start: 0, end: 1}, {text: ' \n ', start: 0, end: 1}, {text: 'Text', start: 1, end: 1}, {text: 'Text', start: 2, end: 1}]) {
    assert.equal(sentenceAtTime(turn, 0), null);
  }
  assert.equal(sentenceAtTime({text: 'Text', start: 0, end: 1}, NaN), null);
  assert.equal(sentenceAtTime({text: 'Text', start: 0, end: 1}, Infinity), null);
});

test('seeks later sentences inside one timed block instead of restarting the turn', () => {
 const text='First sentence. Second sentence. Final sentence.';
 const turn={text,start:5,end:105,blocks:[{text,start:5,end:105}]};
 for(const label of ['Final','First','Second']){
  const offset=text.indexOf(label),time=timeAtSentenceOffset(turn,offset+3);
  assert(Math.abs(time-(5+100*offset/text.length))<1e-5);
  assert.equal(sentenceAtTime(turn,time).start,offset);
 }
});
test('real Berk opening final paragraph seeks near its end and highlights that sentence', () => {
 const turn=JSON.parse(fs.readFileSync('dist/data/argument-alignment.json','utf8'))['24-440'].sessions[0].turns[1];
 const offset=turn.text.indexOf('This is a procedural law.');
 const seek=timeAtSentenceOffset(turn,offset+8);
 assert(seek>110&&seek<turn.end);
 assert.equal(sentenceAtTime(turn,seek).start,offset);
});
test('sentence seek uses word anchors, repeated blocks, and safe invalid-input fallbacks', () => {
 const text='Yes. No. Yes.';
 const turn={text,start:0,end:30,blocks:[{text:'Yes.',start:0,end:5},{text:'No.',start:10,end:15},{text:'Yes.',start:20,end:30}]};
 assert(Math.abs(timeAtSentenceOffset(turn,11)-20)<1e-5);
 assert(Math.abs(timeAtSentenceOffset(turn,6)-10)<1e-5);
 assert.equal(timeAtSentenceOffset({...turn,words:[[0,1,2],[5,12,13],[9,22,23]]},11),22);
 for(const bad of [null,{}, {...turn,end:0},{...turn,text:''}])assert.equal(timeAtSentenceOffset(bad,0),null);
 assert.equal(timeAtSentenceOffset(turn,NaN),null);
 assert(timeAtSentenceOffset(turn,-99)>=0);
 assert(timeAtSentenceOffset(turn,999)<30);
});
test('turn interpolation preserves UTF-16 offsets and abbreviation sentence boundaries', () => {
 const text='Mr. Smith agrees. The emoji is \u{1f600}. Final.';
 const turn={text,start:0,end:50};
 for(const offset of [0,text.indexOf('The'),text.indexOf('Final')]){
  const seek=timeAtSentenceOffset(turn,offset+1);
  assert.equal(sentenceAtTime(turn,seek).start,offset);
 }
});
