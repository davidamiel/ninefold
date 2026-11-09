import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {auditDocument} from '../scripts/audit_document_quality.mjs';
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const curated=load('scripts/curated-reader-structure.json');
const generated=load('dist/data/reader-structure.json');
const ledger=load('dist/data/document-correction-evidence.json');
for (const [id,count] of [['24-440-f0bb42099b11',13],['25-5146-2ec91392fbac',89]]) {
 test(`${id}: all legacy repairs have exact guards and source-bound evidence`,()=>{
  const doc=load(`dist/data/docs/${id}.json`);
  assert.equal(curated[id].repairs.length,count);
  assert.deepEqual(generated[id].repairs,curated[id].repairs);
  assert.equal(ledger[id].length,count);
  const hash=createHash('sha256').update(fs.readFileSync(`dist/data/pdfs/${id}.pdf`)).digest('hex');
  for(const r of curated[id].repairs){
   assert.equal(r.expectedText,doc.pages[r.page].text.slice(r.start,r.end));
   const e=ledger[id].find(e=>e.page===r.page&&e.start===r.start&&e.end===r.end);
   assert(e);assert.equal(e.original,r.expectedText);assert.equal(e.replacement,r.text);
   assert.equal(e.sourceUrl,doc.sourceUrl);assert.equal(e.sourceSha256,hash);
   assert.equal(e.sourcePage,r.page+1);assert.equal(e.artifactPage,r.page+1);
   assert(fs.existsSync(e.sourceArtifact));
  }
  assert.deepEqual(auditDocument(id,doc.pages,generated[id],{},ledger[id]),[]);
 });
}
test('meaningful compound hyphens and nonligature words remain narrowly scoped',()=>{
 const repairs=curated['25-5146-2ec91392fbac'].repairs;
 assert(repairs.some(r=>r.page===8&&r.expectedText==='conductfocused'&&r.text==='conduct-focused'));
 assert(repairs.some(r=>r.page===10&&r.expectedText==='ofjustice'&&r.text==='of-justice'));
 assert.equal(repairs.filter(r=>r.expectedText==='few'&&r.text==='flew').length,2);
 const berk=curated['24-440-f0bb42099b11'].repairs;
 assert(berk.some(r=>r.expectedText==='a n\ninordinate'&&r.text==='an\ninordinate'));
});
test('resolved legacy debt has no remaining allowance and missing or changed proof fails the gate',async()=>{
 const {reconcileReviews}=await import('../scripts/check_document_reviews.mjs');
 const baseline=load('reviews/legacy-repair-baseline.json');
 assert.deepEqual(baseline.legacyRepairFingerprints,[]);
 const id='24-440-f0bb42099b11';const doc=load(`dist/data/docs/${id}.json`);
 for(const proof of [ledger[id].slice(1),ledger[id].map((e,i)=>i?e:{...e,replacement:'unsupported'})]) {
  const issues=auditDocument(id,doc.pages,generated[id],{},proof);
  assert(issues.some(i=>i.code==='repair-without-evidence'));
  const report=reconcileReviews({inventory:[{id,pages:doc.pages.length,repairEvidenceGaps:[{fingerprint:'missing',location:'repairs[0]'}]}],issues,documents:1,pages:doc.pages.length},{version:1,reviews:[]},baseline);
  assert(report.errors.some(e=>e.startsWith('New unproven repair:')));
 }
});
