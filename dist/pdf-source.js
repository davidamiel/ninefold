// Keep the source representation with its URL: a full filing is not a sliced PDF.
export function pdfSources(doc, lookup = () => null) {
  if (!doc) return [];
  const parent = lookup(doc.parentDocumentId), filed = lookup(doc.pdfSourceId);
  const candidates = [
    [doc.pdfPath, !!(doc.parentDocumentId && doc.sourceRange)],
    [parent?.pdfPath, false], [filed?.pdfPath, false],
    [doc.sourceUrl, false], [doc.sourceMirrorUrl, false],
    [parent?.sourceUrl, false], [parent?.sourceMirrorUrl, false],
    [filed?.sourceUrl, false], [filed?.sourceMirrorUrl, false],
  ];
  const seen = new Set();
  return candidates.filter(([url]) => url && /\.pdf(?:$|[?#])/i.test(url) && !seen.has(url) && seen.add(url))
    .map(([url, sliced]) => ({url, sliced}));
}

export function nativePDFURL(source, page = 0, base) {
  try {
    const url = new URL(source, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = `page=${Math.max(0, Math.floor(Number(page) || 0)) + 1}&view=FitH`;
    return url.href;
  } catch { return ''; }
}

export function pdfPageRange(doc, source, count) {
  const first = source.sliced ? 0 : Math.min(count, Math.max(0, doc.sourceRange?.startPage || 0));
  const last = source.sliced ? count : Math.max(first, Math.min(count,
    doc.sourceRange ? doc.sourceRange.endPage + (doc.sourceRange.endOffset ? 1 : 0) : count));
  return {first, last, sourceOffset: source.sliced ? doc.sourceRange.startPage : 0};
}
