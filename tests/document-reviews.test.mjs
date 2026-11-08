import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileReviews} from '../scripts/check_document_reviews.mjs';
const doc = {id:'doc', pages:2, textPath:'data/docs/doc.json', structural:'passed', reviewHash:'hash', repairEvidenceGaps:[]};
const audit = inventory => ({inventory, documents:1, pages:2, issues:[], limitations:[]});
const baseline = {legacyRepairFingerprints:[]};
const ledger = reviews => ({version:1, reviews});
const review = {document:'doc', dimension:'source', reviewHash:'hash', pages:[1,2], status:'reviewed', reviewer:'Reviewer', reviewedAt:'2026-11-08', sourceUrl:'https://example.org/source.pdf', sourceSha256:'a'.repeat(64), method:'Rendered page comparison', evidence:'docs/example-review.md'};
test('structural success leaves source and citations unknown', () => {
  const r = reconcileReviews(audit([doc]), ledger([]), baseline);
  assert.equal(r.inventory[0].source,'unknown'); assert.equal(r.inventory[0].citations,'unknown'); assert.equal(r.errors.length,0);
});
test('full source review needs all pages and does not certify citations', () => {
  const r = reconcileReviews(audit([doc]), ledger([review]), baseline);
  assert.equal(r.inventory[0].source,'reviewed'); assert.equal(r.inventory[0].citations,'unknown');
  for (const patch of [{pages:[1]}, {pages:[1,1]}, {sourceSha256:''}, {evidence:'../secret'}, {reviewHash:'old'}]) assert(reconcileReviews(audit([doc]),ledger([{...review,...patch}]), baseline).errors.length);
  assert(reconcileReviews(audit([doc]),ledger([review]), baseline,()=>false).errors.length);
});
test('bounded reviews remain partial and duplicate or orphan reviews fail', () => {
  assert.equal(reconcileReviews(audit([doc]),ledger([{...review,pages:[1],status:'partial'}]),baseline).inventory[0].source,'partial');
  assert(reconcileReviews(audit([doc]),ledger([review,review]),baseline).errors.length);
  assert(reconcileReviews(audit([doc]),ledger([{...review,document:'missing'}]),baseline).errors.length);
});
test('legacy allowances are exact and do not allow new corrections', () => {
  const input = audit([{...doc,repairEvidenceGaps:[{location:'repairs[0]',fingerprint:'old'}]}]);
  assert.equal(reconcileReviews(input,ledger([]),{legacyRepairFingerprints:['old']}).errors.length,0);
  assert(reconcileReviews(input,ledger([]),baseline).errors.length);
  input.issues.push({severity:'error',code:'invalid-offset',document:'doc',location:'x'});
  assert(reconcileReviews(input,ledger([]),{legacyRepairFingerprints:['old']}).errors.length);
});
