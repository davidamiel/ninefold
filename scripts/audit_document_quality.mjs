// Read-only structural audit. JavaScript string offsets are UTF-16 code units,
// exactly like the reader's saved annotation anchors. No text is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

export function auditDocument(id, pages, structure = {}, layout = {}, evidence = []) {
  const issues = [];
  const issue = (severity, code, location) => issues.push({severity, code, document: id, location});
  const text = page => typeof pages[page] === 'string' ? pages[page] : pages[page]?.text;
  const validPage = page => Number.isInteger(page) && page >= 0 && page < pages.length && typeof text(page) === 'string';
  const point = (page, offset, location) => {
    if (!validPage(page) || !Number.isInteger(offset) || offset < 0 || offset > text(page).length) {
      issue('error', 'invalid-offset', location); return false;
    }
    return true;
  };
  const range = (page, start, end, location, allowEmpty = false) => {
    const a = point(page, start, location + '.start');
    const b = point(page, end, location + '.end');
    if (a && b && (end < start || (!allowEmpty && end === start))) {issue('error', 'empty-or-reversed-range', location); return false;}
    return a && b;
  };
  if (structure.bodyStart) point(structure.bodyStart.page, structure.bodyStart.offset, 'bodyStart');
  for (const kind of ['omitRanges', 'headings', 'repairs', 'footnotes', 'footnoteMarkers']) {
    const entries = structure[kind] || [];
    entries.forEach((r, index) => {
      const location = `${kind}[${index}]`;
      if (!range(r.page, r.start, r.end, location, kind === 'headings')) return;
      if (kind === 'repairs') {
        const replacement = r.text ?? r.replacement;
        if (r.expectedText !== undefined && r.expectedText !== text(r.page).slice(r.start, r.end)) issue('error', 'repair-expected-text-mismatch', location);
        if (typeof replacement !== 'string') issue('error', 'missing-replacement', location);
        const proof = evidence.find(e => e.page === r.page && e.start === r.start && e.end === r.end && e.replacement === replacement);
        if (!proof) issue('warning', 'repair-without-evidence', location);
        else {
          if (proof.original !== text(r.page).slice(r.start, r.end)) issue('error', 'repair-evidence-source-mismatch', location);
          if (!/^https?:\/\//.test(proof.sourceUrl || '') || !proof.sourcePage || !proof.method || !proof.verifiedAt || !/^[a-f0-9]{64}$/.test(proof.sourceSha256 || '')) issue('error', 'incomplete-repair-evidence', location);
        }
        if (entries.slice(0, index).some(other => other.page === r.page && r.start < other.end && other.start < r.end)) issue('error', 'overlapping-repairs', location);
      }
    });
  }
  for (const [pageKey, pageLayout] of Object.entries(layout)) {
    const page = Number(pageKey);
    if (!validPage(page)) {issue('error', 'invalid-layout-page', pageKey); continue;}
    for (const [i, offset] of (pageLayout.paragraphStarts || []).entries()) point(page, offset, `layout.${pageKey}.paragraphStarts[${i}]`);
    for (const [i, heading] of (pageLayout.headings || []).entries()) point(page, heading.offset, `layout.${pageKey}.headings[${i}]`);
    for (const [i, note] of (pageLayout.footnotes || []).entries()) range(page, note.start, note.end, `layout.${pageKey}.footnotes[${i}]`);
  }
  return issues;
}

export function auditCollection(root) {
  const dataRoot = path.join(root, 'data');
  const readJSON = file => JSON.parse((file.endsWith('.gz') ? gunzipSync(fs.readFileSync(file)) : fs.readFileSync(file)).toString('utf8'));
  const resolveJSON = file => fs.existsSync(file) ? file : file + '.gz';
  const read = file => readJSON(resolveJSON(path.join(dataRoot, file)));
  const structures = read('reader-structure.json'), layouts = read('reading-layout.json');
  const evidencePath = resolveJSON(path.join(dataRoot, 'document-correction-evidence.json'));
  const evidence = fs.existsSync(evidencePath) ? readJSON(evidencePath) : {};
  const documents = new Map(), byPath = new Map(), aliases = new Map(), indexed = new Map(), issues = [];
  function collectAliases(value) {
    if (!value || typeof value !== 'object') return;
    if (value.id && (value.textPath || (value.sourceUrl && (value.category || value.extractionStatus)))) indexed.set(value.id, value);
    if (value.id && value.textPath) aliases.set(value.id, value.textPath.replace(/^\.\//, '').replace(/\.json\.gz$/, '.json'));
    for (const child of Object.values(value)) if (child && typeof child === 'object') collectAliases(child);
  }
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.json(?:\.gz)?$/.test(entry.name)) {
        // Match the reader's preference for plain JSON if both copies exist.
        if (file.endsWith('.gz') && fs.existsSync(file.slice(0, -3))) continue;
        const value = readJSON(file);
        if (Array.isArray(value.pages)) {
          const id = path.basename(file).replace(/\.json(?:\.gz)?$/, '');
          if (documents.has(id)) issues.push({severity: 'error', code: 'duplicate-document-id', document: id, location: path.relative(root, file)});
          documents.set(id, value);
          byPath.set(path.relative(root, file).replace(/\.json\.gz$/, '.json'), value);
        } else collectAliases(value);
      }
    }
  }
  visit(dataRoot);
  const fileCount = documents.size;
  for (const [id, file] of aliases) if (!documents.has(id) && byPath.has(file)) documents.set(id, byPath.get(file));
  let repairs = 0;
  for (const [id, data] of documents) {
    repairs += structures[id]?.repairs?.length || 0;
    issues.push(...auditDocument(id, data.pages, structures[id], layouts[id], evidence[id]));
  }
  for (const kind of ['structure', 'layout']) {
    for (const id of Object.keys(kind === 'structure' ? structures : layouts)) {
      if (!documents.has(id)) issues.push({severity: 'warning', code: 'metadata-without-document-file', document: id, location: kind});
    }
  }
  const inventory = [...new Set([...documents.keys(), ...indexed.keys()])].sort().map(id => {
    const data = documents.get(id), record = indexed.get(id) || {};
    const textPath = aliases.get(id) || [...byPath].find(([, value]) => value === data)?.[0] || null;
    const findings = issues.filter(i => i.document === id);
    return {id, textPath, sourceUrl: record.sourceUrl || data?.sourceUrl || null,
      title: record.title || data?.title || null, extractionStatus: record.extractionStatus || null,
      pages: data?.pages.length ?? null,
      reviewHash: createHash('sha256').update(JSON.stringify({data: data || null, record,
        structure: structures[id] || {}, layout: layouts[id] || {}})).digest('hex'),
      structural: data ? (findings.some(i => i.severity === 'error') ? 'failed' : 'passed') : 'not-applicable',
      issues: findings,
      repairEvidenceGaps: findings.filter(i => i.code === 'repair-without-evidence').map(i => ({
        location: i.location,
        fingerprint: (() => {
          const repair = structures[id].repairs[Number(i.location.match(/\d+/)[0])];
          const page = data.pages[repair.page];
          const raw = typeof page === 'string' ? page : page?.text;
          return createHash('sha256').update(JSON.stringify({id, textPath, sourceUrl: record.sourceUrl || data?.sourceUrl || null,
            repair, original: raw?.slice(repair.start, repair.end)})).digest('hex');
        })()
      }))};
  });
  return {inventory, scope: 'All JSON or gzip-packed JSON files with a pages array under data; metadata joins use filename IDs and indexed textPath aliases.',
    limitations: ['Structural checks do not verify every word, citation target, PDF layout, OCR, or document completeness.', 'Missing correction evidence is reported, not treated as proof that a correction is wrong.', 'PDFs and external URLs are not fetched or visually certified by this audit.'],
    documents: fileCount, metadataDocumentIds: documents.size, pages: [...byPath.values()].reduce((n, d) => n + d.pages.length, 0), repairs,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length, issues};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find(a => !a.startsWith('--')) || fileURLToPath(new URL('../dist', import.meta.url)));
  const report = auditCollection(root);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.errors || (args.includes('--strict') && report.warnings) ? 1 : 0;
}
