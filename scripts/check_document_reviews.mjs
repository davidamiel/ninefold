// Read-only inventory and evidence ledger gate. No source or citation certification is inferred.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditCollection} from './audit_document_quality.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));

export function reconcileReviews(audit, ledger, baseline, evidenceExists = () => true) {
  const errors = [], records = new Map();
  if (ledger.version !== 1 || !Array.isArray(ledger.reviews)) throw new Error('Unsupported review ledger');
  for (const review of ledger.reviews) {
    const key = `${review.document}:${review.dimension}`;
    if (records.has(key)) errors.push(`Duplicate review: ${key}`);
    records.set(key, review);
    if (!audit.inventory.some(d => d.id === review.document)) errors.push(`Unknown document: ${key}`);
    if (!['source', 'citations'].includes(review.dimension)) errors.push(`Unknown dimension: ${key}`);
  }
  const allowed = new Set(baseline.legacyRepairFingerprints || []);
  const inventory = audit.inventory.map(document => {
    const result = {...document, source: 'unknown', citations: 'unknown'};
    for (const dimension of ['source', 'citations']) {
      const r = records.get(`${document.id}:${dimension}`);
      if (!r) continue;
      if (r.reviewHash !== document.reviewHash) {
        result[dimension] = 'stale'; errors.push(`Stale ${dimension} review: ${document.id}`); continue;
      }
      const validPages = Array.isArray(r.pages) && r.pages.length > 0 && new Set(r.pages).size === r.pages.length && r.pages.every(p => Number.isInteger(p) && p >= 1 && p <= document.pages);
      const valid = validPages && ['partial', 'reviewed'].includes(r.status) && r.reviewer && /^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt || '') && /^https?:\/\//.test(r.sourceUrl || '') && /^[a-f0-9]{64}$/.test(r.sourceSha256 || '') && r.method && /^docs\/[a-zA-Z0-9/_-]+\.md$/.test(r.evidence || '') && evidenceExists(r.evidence);
      if (!valid || (r.status === 'reviewed' && r.pages.length !== document.pages)) {
        errors.push(`Incomplete ${dimension} evidence: ${document.id}`); result[dimension] = 'invalid';
      } else result[dimension] = r.status;
    }
    for (const gap of document.repairEvidenceGaps) if (!allowed.has(gap.fingerprint)) errors.push(`New unproven repair: ${document.id} ${gap.location}`);
    return result;
  });
  const legacyGaps = inventory.reduce((n, d) => n + d.repairEvidenceGaps.length, 0);
  // Errors always fail; legacy allowances cover only exact missing-evidence repairs.
  errors.push(...audit.issues.filter(i => i.severity === 'error' || i.code !== 'repair-without-evidence').map(i => `${i.code}: ${i.document} ${i.location}`));
  const counts = dimension => Object.fromEntries([...new Set(inventory.map(d => d[dimension]))].map(status => [status, inventory.filter(d => d[dimension] === status).length]));
  const queue = inventory.map(d => ({document: d.id, priority: d.structural === 'failed' ? 0 : d.repairEvidenceGaps.length ? 1 : !d.textPath ? 2 : 3,
    reasons: [...(d.structural === 'failed' ? ['structural-error'] : []), ...(d.repairEvidenceGaps.length ? ['legacy-correction-evidence'] : []), ...(!d.textPath ? ['no-extracted-text'] : []), ...(['source', 'citations'].filter(k => d[k] !== 'reviewed').map(k => `${k}-${d[k]}`))]})).filter(d => d.reasons.length).sort((a,b) => a.priority - b.priority || a.document.localeCompare(b.document));
  return {summary: {inventoryIds: inventory.length, extractedFiles: audit.documents, extractedPages: audit.pages,
    structural: counts('structural'), source: counts('source'), citations: counts('citations'), legacyRepairEvidenceGaps: legacyGaps,
    errors: errors.length}, limitations: audit.limitations, errors, queue, inventory};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), root = path.resolve(args[0] || path.join(repo, 'dist'));
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, 'reviews/document-reviews.json')));
  const baseline = JSON.parse(fs.readFileSync(path.join(repo, 'reviews/legacy-repair-baseline.json')));
  const report = reconcileReviews(auditCollection(root), ledger, baseline, p => fs.existsSync(path.join(repo, p)));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.errors.length ? 1 : 0;
}
