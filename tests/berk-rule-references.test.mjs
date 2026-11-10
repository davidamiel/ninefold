import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {citationsIn} from '../dist/reader-authorities.js';
const doc=id=>JSON.parse(fs.readFileSync(new URL('../dist/data/docs/'+id+'.json',import.meta.url),'utf8'));
const hits=text=>citationsIn(text,true,true,()=>null);
test('Supreme Court filing rules retain their court identity in mixed-procedure Berk filings',()=>{
  for(const [id,page,canonical] of [
    ['24-440-f227f4d5f387',5,'Sup. Ct. R. 37.6'],
    ['24-440-ffcc04da2f19',2,'Sup. Ct. R. 29.6'],
    ['24-440-bb809b019e4c',0,'Sup. Ct. R. 30.4'],
    ['24-440-3582972c02be',2,'Sup. Ct. R. 12.6'],
    ['24-440-154c871556f6',2,'Sup. Ct. R. 29.6'],
  ]){
    const text=doc(id).pages[page].text,found=hits(text);
    assert.ok(found.some(h=>h.canonical===canonical),id+' '+canonical);
    assert.ok(!found.some(h=>h.canonical===canonical.replace('Sup. Ct. R.','Fed. R. Civ. P.')));
    for(const h of found)assert.equal(text.slice(h.start,h.end),h.label);
  }
});
test('bare rule numbers do not manufacture district-court authorities',()=>{
  for(const text of ['Local Rule 28.3(d)','Local Rule 12','State Rule 12','this Court’s Rule 12.6','Rule 37.6','Rule 12.10','Rule 37.2']){
    assert.deepEqual(hits(text),[],text);
  }
  assert.ok(!hits(doc('24-440-77b1376e3f1a').pages[178].text).some(h=>h.canonical==='Fed. R. Civ. P. 28.3'));
  assert.ok(!hits(doc('24-440-660786c6b1c6').pages[9].text).some(h=>h.canonical==='Fed. R. Civ. P. 12.10'));
});
test('district-court shorthand and explicit federal citations remain recognized',()=>{
  const text='Rule 12(b)(6), Rule 11(a), Rule 5.1, and Fed. R. Civ. P. 23.1.';
  assert.deepEqual(hits(text).map(h=>h.canonical),['Fed. R. Civ. P. 12','Fed. R. Civ. P. 11','Fed. R. Civ. P. 5.1','Fed. R. Civ. P. 23.1']);
  assert.ok(hits(doc('24-440-660786c6b1c6').pages[9].text).some(h=>h.canonical==='Fed. R. Civ. P. 12'));
});
test('Supreme Court authority metadata supplies historical official PDF pages without fabricated local text',()=>{
  const index=JSON.parse(fs.readFileSync(new URL('../dist/data/rules-index.json',import.meta.url),'utf8'));
  for(const n of ['12.6','29.6','30.4','37.6']){
    const entry=index['Sup. Ct. R. '+n];
    assert.match(entry.sourceUrl,/^https:\/\/www\.supremecourt\.gov\/filingandrules\/2023RulesoftheCourt\.pdf#page=\d+$/);
    assert.equal(entry.text,undefined);assert.equal(entry.textPath,undefined);
  }
});

test('court parenthetical App. years never become joint-appendix links',()=>{
  for(const text of ['(Md. Spec. App. 2015)','(N.M. Ct. App. 1983)','(Ga. App. 2025)','(Ill. App. 2024)','(Ind. Ct. App. 1999)'])assert.ok(!hits(text).some(h=>h.type==='appendix'),text);
  for(const text of ['Pet. App. 2015','App. 2015','JA 92'])assert.equal(hits(text).filter(h=>h.type==='appendix').length,1,text);
  for(const [id,page,label] of [['24-440-8b17249a7236',30,'App. 2015'],['24-440-8b17249a7236',39,'App. 1983'],['24-440-8b17249a7236',41,'App. 2025'],['24-440-8b17249a7236',41,'App. 2024'],['24-440-ef2c47c9b7ca',21,'App. 1999']])assert.ok(!hits(doc(id).pages[page].text).some(h=>h.type==='appendix'&&h.label===label));
});
test('split pinpoint digits stay inside citation spans without changing source quotations',()=>{
  for(const [id,page,tail] of [['24-440-3582972c02be',32,'551 U.S. 89, 9 3'],['24-440-3582972c02be',33,'551 U.S. at 9 3'],['24-440-3341afc79588',11,'518 U.S. 415, 42 7']]){
    const text=doc(id).pages[page].text,found=hits(text).find(h=>h.label.endsWith(tail));assert.ok(found,id+':'+page);
    assert.equal(text.slice(found.start,found.end),found.label);
  }
  assert.equal(hits('551 U.S. 89, 9 and 3 other cases')[0].label,'551 U.S. 89, 9');
  assert.equal(hits('551 U.S. 89, 9 3 other cases')[0].label,'551 U.S. 89, 9');
});
