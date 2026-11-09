// Timings and offsets refer to the original turn text, never its reading layout.
// Turns are immutable data records; replacing text/word/block arrays rebuilds the cache.
const turnCache = new WeakMap();
const sentenceStarters = /^(?:I|We|You|He|She|It|They|This|That|These|Those|The|A|An|But|And|So|Yes|No|However|Therefore|Next|Then)\b/;

function joinsSentence(before, after) {
  const ending = before.replace(/["'”’»\)\]\}]+$/u, '');
  if (/(?:^|\s)(?:Mr|Mrs|Ms|Mx|Dr|Prof|Hon|Rev|Gen|Gov|Sen|Rep|Capt|Col|Lt|Sgt|St)\.$/i.test(ending)) return true;
  if (/\b(?:e\.g|i\.e|a\.k\.a|cf|viz|v|vs)\.$/i.test(ending)) return true;
  if (/\b(?:No|Nos|Art|Sec|Ch|Fig|Vol|pp?|Ct)\.$/i.test(ending) && /^(?:\d|§|[IVX]+\b)/.test(after)) return true;
  if (/\b(?:Inc|Ltd|Co|Corp|Jr|Sr|etc)\.$/i.test(ending) && /^[\p{Ll},;]/u.test(after)) return true;
  // Preserve names, initialisms, and legal citations without swallowing a clear
  // new sentence such as “in the U.S. We disagree.”
  if (/(?:\b[A-Za-z]\.){2,}$/.test(ending) && !sentenceStarters.test(after)) return true;
  return /(?:^|\s)[A-HJ-Z]\.$/.test(ending) && /^\p{Lu}/u.test(after) && !sentenceStarters.test(after);
}

function fallbackSegments(text) {
  const ranges = [];
  const endings = /[.!?]+["'”’»\)\]\}]*(?=\s|$)/gu;
  let start = 0;
  for (const match of text.matchAll(endings)) {
    const end = match.index + match[0].length;
    ranges.push({start, end});
    start = end;
  }
  if (start < text.length) ranges.push({start, end: text.length});
  return ranges;
}

function sentenceRanges(text) {
  let ranges;
  try {
    if (typeof globalThis.Intl?.Segmenter === 'function') {
      ranges = Array.from(new Intl.Segmenter('en', {granularity: 'sentence'}).segment(text),
        part => ({start: part.index, end: part.index + part.segment.length}));
    }
  } catch {
    // Some older WebViews expose Segmenter but cannot construct/use it.
  }
  ranges ||= fallbackSegments(text);
  const sentences = [];
  for (const range of ranges) {
    while (range.start < range.end && /\s/u.test(text[range.start])) range.start++;
    while (range.end > range.start && /\s/u.test(text[range.end - 1])) range.end--;
    if (range.start === range.end) continue;
    const previous = sentences[sentences.length - 1];
    if (previous && joinsSentence(text.slice(previous.start, previous.end), text.slice(range.start, range.end))) {
      previous.end = range.end;
    } else {
      sentences.push(range);
    }
  }
  return sentences;
}

function prepareTurn(turn) {
  const cached = turnCache.get(turn);
  if (cached && cached.text === turn.text && cached.sourceWords === turn.words && cached.sourceBlocks === turn.blocks) return cached;
  const text = turn.text;
  const words = [];
  for (const word of Array.isArray(turn.words) ? turn.words : []) {
    if (!Array.isArray(word)) continue;
    const [offset, start, end] = word;
    if (!Number.isInteger(offset) || offset < 0 || offset >= text.length || !Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    words.push({offset, start});
  }
  words.sort((a, b) => a.start - b.start || a.offset - b.offset);
  const blocks = [];
  let cursor = 0;
  for (const block of Array.isArray(turn.blocks) ? turn.blocks : []) {
    if (!block || typeof block.text !== 'string' || !block.text.length) continue;
    // Sequential lookup matters: a speaker can say “Yes.” several times.
    // sourceStart/sourceEnd in official blocks are PDF-page offsets, not turn offsets.
    const offset = text.indexOf(block.text, cursor);
    if (offset < 0) continue;
    cursor = offset + block.text.length;
    if (!Number.isFinite(block.start) || !Number.isFinite(block.end) || block.end <= block.start) continue;
    blocks.push({offset, length: block.text.length, start: block.start, end: block.end});
  }
  blocks.sort((a, b) => a.start - b.start || a.offset - b.offset);
  const prepared = {text, sourceWords: turn.words, sourceBlocks: turn.blocks, sentences: sentenceRanges(text), words, blocks};
  turnCache.set(turn, prepared);
  return prepared;
}

// Last start <= value; unlike nearest-time lookup, this never advances early
// through a pause. Also used for the sorted source sentence boundaries.
function lastStarted(items, value) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (items[mid].start <= value) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

function estimatedOffset(start, end, offset, length, time) {
  const progress = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return offset + Math.min(length - 1, Math.floor(progress * length));
}

/**
 * Return the current sentence's half-open source text range, or null outside
 * the turn's [start, end) interval / for unusable input. Word timing wins; the
 * previous word stays current until the next word starts. Otherwise estimate
 * progress within the latest timed block, then across the whole turn.
 * Sentence whitespace is excluded; punctuation and original offsets are kept.
 */
export function sentenceAtTime(turn, time) {
  if (!turn || typeof turn !== 'object' || typeof turn.text !== 'string' || !turn.text.length || !Number.isFinite(time)) return null;
  if (!Number.isFinite(turn.start) || !Number.isFinite(turn.end) || turn.end <= turn.start || time < turn.start || time >= turn.end) return null;
  const {sentences, words, blocks} = prepareTurn(turn);
  if (!sentences.length) return null;
  let offset;
  if (words.length) {
    offset = words[lastStarted(words, time)].offset;
  } else if (blocks.length) {
    const block = blocks[lastStarted(blocks, time)];
    offset = estimatedOffset(block.start, block.end, block.offset, block.length, time);
  } else {
    offset = estimatedOffset(turn.start, turn.end, 0, turn.text.length, time);
  }
  const sentence = sentences[lastStarted(sentences, offset)];
  // Do not expose the cached range to mutation by callers.
  return {start: sentence.start, end: sentence.end};
}

/** Seek to the sentence containing a source offset. Block/turn estimates use
 * the same character interpolation as sentenceAtTime; word anchors win. */
export function timeAtSentenceOffset(turn, offset) {
  if (!turn || typeof turn.text !== 'string' || !turn.text.length || !Number.isFinite(offset) || !Number.isFinite(turn.start) || !Number.isFinite(turn.end) || turn.end <= turn.start) return null;
  const {sentences, words, blocks} = prepareTurn(turn);
  if (!sentences.length) return null;
  const source = Math.max(0, Math.min(turn.text.length - 1, offset));
  const sentence = sentences[lastStarted(sentences, source)];
  const start = sentence.start;
  const word = words.find(w => w.offset >= start && w.offset < sentence.end);
  let time;
  if (word) time = word.start;
  else {
    const block = blocks.find(b => start >= b.offset && start < b.offset + b.length);
    const anchor = block || {start: turn.start, end: turn.end, offset: 0, length: turn.text.length};
    // A tiny fraction of one character avoids a floating-point roundoff into
    // the previous sentence when the player updates at this exact seek time.
    time = anchor.start + (anchor.end - anchor.start) * (start - anchor.offset + 1e-7) / anchor.length;
  }
  return Math.max(turn.start, Math.min(turn.end - 1e-6, time));
}

/** Return a sentence directly in source coordinates, without timing estimates. */
export function sentenceAtOffset(turn, offset) {
  if (!turn || typeof turn.text !== 'string' || !turn.text.length || !Number.isFinite(offset)) return null;
  const {sentences} = prepareTurn(turn);
  if (!sentences.length) return null;
  const source = Math.max(0, Math.min(turn.text.length - 1, offset));
  const sentence = sentences[lastStarted(sentences, source)];
  return {start: sentence.start, end: sentence.end};
}
