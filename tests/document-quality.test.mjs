import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDocument} from '../scripts/audit_document_quality.mjs';

test('audit uses browser UTF-16 offsets and accepts synthetic heading anchors', () => {
  assert.deepEqual(auditDocument('x', [{text: 'A😀B'}], {
    headings: [{page: 0, start: 4, end: 4, text: 'Exhibit'}],
    omitRanges: [{page: 0, start: 1, end: 3}],
  }, {'0': {paragraphStarts: [4]}}), []);
});

test('audit catches invalid pages, offsets, reversed spans and overlapping repairs', () => {
  const issues = auditDocument('x', ['abcdef'], {
    bodyStart: {page: 1, offset: 0},
    omitRanges: [{page: 0, start: 5, end: 2}],
    repairs: [{page: 0, start: 1, end: 3, text: 'b'}, {page: 0, start: 2, end: 4, text: 'c'}],
  }, {'0': {paragraphStarts: [-1, 1.5, 7]}, '4': {}});
  for (const code of ['invalid-offset', 'empty-or-reversed-range', 'overlapping-repairs', 'invalid-layout-page', 'repair-without-evidence']) assert(issues.some(i => i.code === code), code);
});

test('correction evidence must match the immutable source span and replacement', () => {
  const repair = {page: 0, start: 0, end: 4, text: 'office'};
  const proof = {page: 0, start: 0, end: 4, replacement: 'office', original: 'ofce', sourceUrl: 'https://example.org/source.pdf', sourcePage: 1, sourceSha256: 'a'.repeat(64), method: 'Visual comparison with PDF', verifiedAt: '2026-11-08'};
  assert.deepEqual(auditDocument('x', ['ofce'], {repairs: [repair]}, {}, [proof]), []);
  assert(auditDocument('x', ['ofce'], {repairs: [repair]}, {}, [{...proof, original: 'wrong'}]).some(i => i.code === 'repair-evidence-source-mismatch'));
  assert(auditDocument('x', ['ofce'], {repairs: [repair]}, {}, [{...proof, sourceSha256: ''}]).some(i => i.code === 'incomplete-repair-evidence'));
});

test('collection audit follows indexed aliases without modifying files', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const {auditCollection} = await import('../scripts/audit_document_quality.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninefold-audit-'));
  try {
    fs.mkdirSync(path.join(root, 'data', 'docs'), {recursive: true});
    const files = {
      'docs/raw.json': {pages: [{text: 'abcdef'}]},
      'catalog.json': {cases: [{documents: [{id: 'alias', textPath: 'data/docs/raw.json'}, {id: 'external', category: 'Merits', sourceUrl: 'https://example.org/scan.pdf', extractionStatus: 'Scan only'}]}]},
      'reader-structure.json': {alias: {omitRanges: [{page: 0, start: 1, end: 3}]}},
      'reading-layout.json': {alias: {'0': {paragraphStarts: [3]}}},
    };
    for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, 'data', name), JSON.stringify(value));
    const result = auditCollection(root);
    assert.equal(result.documents, 1);
    assert.equal(result.pages, 1);
    assert.equal(result.inventory.length, 3);
    assert.equal(result.inventory.find(d => d.id === 'external').structural, 'not-applicable');
    assert.equal(result.inventory.find(d => d.id === 'alias').textPath, 'data/docs/raw.json');
    assert.equal(result.errors, 0);
    assert.equal(result.warnings, 0);
    for (const [name, value] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(root, 'data', name), 'utf8'), JSON.stringify(value));
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

test('expectedText guard must match the exact source span', () => {
  const issues = auditDocument('x', ['ofce'], {repairs: [{page: 0, start: 0, end: 4, text: 'office', expectedText: 'offce'}]});
  assert(issues.some(i => i.code === 'repair-expected-text-mismatch'));
});

test('packed deployment audit reads gzip metadata, evidence, documents, and aliases', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const {gzipSync} = await import('node:zlib');
  const {auditCollection} = await import('../scripts/audit_document_quality.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninefold-packed-audit-'));
  try {
    fs.mkdirSync(path.join(root, 'data', 'docs'), {recursive: true});
    const files = {
      'docs/raw.json': {pages: [{text: 'ofce'}]},
      'catalog.json': {cases: [{documents: [{id: 'alias', textPath: 'data/docs/raw.json'}]}]},
      'reader-structure.json': {alias: {repairs: [{page: 0, start: 0, end: 4, text: 'office', expectedText: 'ofce'}]}},
      'reading-layout.json': {alias: {'0': {paragraphStarts: [0]}}},
      'document-correction-evidence.json': {alias: [{page: 0, start: 0, end: 4, replacement: 'office', original: 'ofce', sourceUrl: 'https://example.org/source.pdf', sourcePage: 1, sourceSha256: 'a'.repeat(64), method: 'Visual review', verifiedAt: '2026-11-08'}]},
    };
    for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, 'data', name + '.gz'), gzipSync(JSON.stringify(value)));
    const result = auditCollection(root);
    assert.equal(result.documents, 1);
    assert.equal(result.pages, 1);
    assert.equal(result.repairs, 1);
    assert.equal(result.errors, 0);
    assert.equal(result.warnings, 0);
    assert(!fs.existsSync(path.join(root, 'data', 'reader-structure.json')), 'audit must not unpack files to disk');
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

test('legacy evidence fingerprints bind original wording and source identity', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const {auditCollection} = await import('../scripts/audit_document_quality.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ninefold-evidence-'));
  try {
    fs.mkdirSync(path.join(root, 'data', 'docs'), {recursive: true});
    const write = (name, value) => fs.writeFileSync(path.join(root, 'data', name), JSON.stringify(value));
    write('reader-structure.json', {raw: {repairs: [{page:0,start:0,end:4,text:'office'}]}});
    write('reading-layout.json', {});
    write('docs/raw.json', {pages:['ofce'],sourceUrl:'https://example.org/a.pdf'});
    const fingerprint = () => auditCollection(root).inventory.find(d=>d.id==='raw').repairEvidenceGaps[0].fingerprint;
    const original = fingerprint();
    write('docs/raw.json', {pages:['xxxx'],sourceUrl:'https://example.org/a.pdf'});
    assert.notEqual(fingerprint(), original);
    write('docs/raw.json', {pages:['ofce'],sourceUrl:'https://example.org/b.pdf'});
    assert.notEqual(fingerprint(), original);
  } finally {fs.rmSync(root, {recursive:true,force:true});}
});
