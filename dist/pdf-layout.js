// Resolve page geometry before navigation, without fetching text or rasterizing pages.
// PDF.js caches these page objects, so lazy painting reuses the same metadata.
export async function preparePDFLayout(pdf, first, last, {width, height, zoom = 'width'}, current = () => true) {
  const layout = new Array(last - first);
  let next = first;
  async function worker() {
    while (current() && next < last) {
      const index = next++;
      const page = await pdf.getPage(index + 1);
      if (!current()) return;
      const base = page.getViewport({scale: 1});
      const scale = zoom === 'width' ? width / base.width
        : zoom === 'page' ? Math.min(width / base.width, Math.max(1, height - 36) / base.height)
        : Number(zoom);
      const viewport = page.getViewport({scale});
      if (![viewport.width, viewport.height, viewport.scale].every(n => Number.isFinite(n) && n > 0)) {
        throw new Error('Invalid PDF page dimensions');
      }
      layout[index - first] = {index, viewport};
    }
  }
  await Promise.all(Array.from({length: Math.min(6, layout.length)}, worker));
  return current() ? layout : null;
}
