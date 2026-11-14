// Figure assets are extracted from pinned original PDFs. Reading never fetches a PDF.
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
let retryCounter = 0;

export function figureParagraphIndex(figure, paragraphs) {
  return paragraphs.findIndex(paragraph => paragraph.segments.some(segment =>
    segment.page === figure.caption.page && segment.map.some(offset => offset >= figure.caption.start && offset < figure.caption.end)));
}

export function readerFigureHTML(figure, captionHTML) {
  if (!/^data\/opinion-figures\/[a-f0-9]{24}\.jpg$/.test(figure.path)) throw Error('Invalid original figure asset');
  const path = escape(figure.path), alt = escape(figure.alt);
  return `<figure class="reader-figure" data-figure="${escape(figure.id)}"><a class="reader-figure-image" href="${path}" target="_blank" rel="noopener noreferrer" aria-label="Open original image: ${alt}"><img src="${path}" alt="${alt}" width="${Number(figure.width)}" height="${Number(figure.height)}" loading="lazy" decoding="async"></a><div class="reader-figure-error" hidden><span>Image could not load.</span><button type="button" class="reader-figure-retry">Retry image</button></div><figcaption>${captionHTML}</figcaption></figure>`;
}

export function installReaderFigureHandlers(container) {
  container.addEventListener('error', event => {
    const image = event.target;
    if (!image.matches?.('.reader-figure img')) return;
    const figure = image.closest('.reader-figure');
    figure.querySelector('.reader-figure-image').hidden = true;
    figure.querySelector('.reader-figure-error').hidden = false;
  }, true);
  container.addEventListener('click', event => {
    const button = event.target.closest?.('.reader-figure-retry');
    if (!button) return;
    const figure = button.closest('.reader-figure'), link = figure.querySelector('.reader-figure-image');
    figure.querySelector('.reader-figure-error').hidden = true;
    link.hidden = false;
    // WebKit can retain a failed image request and defer a hidden lazy image.
    // Explicit retries start immediately with a fresh request; the original
    // link and the content-addressed image bytes remain unchanged.
    const image = link.querySelector('img'), url = new URL(link.href);
    url.searchParams.set('retry', `${Date.now()}-${++retryCounter}`);
    image.loading = 'eager';
    image.src = url.href;
    link.focus({preventScroll: true});
  });
}
