import {test,expect} from '@playwright/test';
import {sentenceRanges} from '../dist/transcript-timing.js';

for(const fallback of [false,true])test('legal initials stay inside sentences'+(fallback?' without Intl.Segmenter':''),()=>{
 const original=Intl.Segmenter;
 if(fallback)Intl.Segmenter=undefined;
 try{
  const cases=[
   ['Police would talk to the D. A. if he told the truth. The Court disagreed.', ['Police would talk to the D. A. if he told the truth.','The Court disagreed.']],
   ['The F. B. I. investigated. We disagree.', ['The F. B. I. investigated.','We disagree.']],
   ['He lived in the U. S. We disagree.', ['He lived in the U. S.','We disagree.']],
   ['They considered plan D. A new approach followed.', ['They considered plan D.','A new approach followed.']],
   ['We disagree. A. Smith spoke.', ['We disagree.','A. Smith spoke.']],
  ];
  for(const [text,expected] of cases)expect(sentenceRanges(text).map(range=>text.slice(range.start,range.end))).toEqual(expected);
 }finally{Intl.Segmenter=original}
});
