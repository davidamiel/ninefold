import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {citationsIn,shortCaseIn,citedNames} from '../dist/reader-authorities.js';
const berk=JSON.parse(fs.readFileSync('dist/data/docs/24-440-1bba7e3379d6.json'));
test('Berk named short forms resolve from full citations containing spaced initials and ampersands',()=>{
 assert.equal(shortCaseIn(berk,'559','U. S.','Shady Grove, '),'559 U.S. 393');
 assert.equal(shortCaseIn(berk,'312','U. S.','Sibbach, '),'312 U.S. 1');
 assert.match(citedNames(berk).get('559 U.S. 393').name,/^Shady Grove Orthopedic Associates/);
 for(const [text,expected] of [['See Shady Grove, 559 U. S., at 398.','559 U.S. 393'],['Sibbach, 312 U. S., at 14–16.','312 U.S. 1']]){
  const hits=citationsIn(text,false,false,(v,r,p)=>shortCaseIn(berk,v,r,p));assert.equal(hits.length,1);assert.equal(hits[0].canonical,expected);assert.equal(hits[0].label,text.slice(hits[0].start,hits[0].end));
 }
});
test('case-name recognition preserves ampersands and spaced initials in source ranges',()=>{
 for(const text of ['Sibbach v. Wilson & Co., 312 U. S. 1, 14.','Shady Grove Orthopedic Associates, P . A. v. Allstate Ins. Co., 559 U. S. 393, 398.']){const [hit]=citationsIn(text);assert.equal(hit.start,0);assert.equal(hit.label,text.slice(hit.start,hit.end));}
});
test('unidentified and ambiguous short forms remain unresolved',()=>{
 assert.equal(shortCaseIn(berk,'507','U. S.','See '),null);
 assert.equal(shortCaseIn(berk,'559','U. S.','Unknown, '),null);
 const ambiguous={pages:[{text:'Alpha v. One, 559 U.S. 1. Alpha v. Two, 559 U.S. 100.'}]};
 assert.equal(shortCaseIn(ambiguous,'559','U.S.','Alpha, '),null);
});
