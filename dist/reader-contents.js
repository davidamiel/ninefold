// Use the filing's own contents and confirm its headings against the body.
// Positions are offsets into the original page, the same coordinates as notes.
const contentsTitle = /^(?:table\s+of\s+)?contents(?:\s*[-—–(]?\s*cont(?:inued|['’]d)\)?)?\s*$/i;
const authoritiesTitle = /^(?:table\s+of\s+(?:cited\s+)?authorities|cited\s+authorities)(?:\s*[-—–(]?\s*cont(?:inued|['’]d)\)?)?\s*$/i;
const leader = /(?:[.·…]\s*){2,}\s*\(?[\divxlcm]+[a-z]?\)?\s*$/i;
const pageLabel = /^\(?[\divxlcm]+\)?$/i;
const key = value => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

function linesOf(page) {
  return Array.from(page.text.matchAll(/[^\n]+/g), match => {
    const text = match[0].trim();
    const start = match.index + match[0].indexOf(text);
    return {text, start, end:start + text.length};
  }).filter(line => line.text);
}

function printedSections(pages) {
  const entries = new Map(), omit = new Set();
  let section = '', pending = '';
  for (let page = 0; page < Math.min(pages.length, 60); page++) {
    if (!section && page > 20) break;
    const lines = linesOf(pages[page]);
    const first = lines.slice(0, 4).filter(line => !pageLabel.test(line.text)).slice(0, 2);
    const heading = first.find(line => contentsTitle.test(line.text) || authoritiesTitle.test(line.text));
    if (heading) {
      const next = contentsTitle.test(heading.text) ? 'contents' : 'authorities';
      if (next !== section) pending = '';
      section = next;
    } else if (!(section && lines.some(line => leader.test(line.text)))) {
      if (section) break;
      continue;
    }
    omit.add(page);
    if (section !== 'contents') continue;
    for (const {text} of lines) {
      if (contentsTitle.test(text) || /^pages?(?:\(s\))?\.?$/i.test(text) || pageLabel.test(text)) continue;
      const ending = text.match(leader);
      const phrase = ending ? text.slice(0, ending.index) : text;
      pending = (pending + ' ' + phrase).trim();
      if (ending) {
        if (pending.length >= 4 && pending.length <= 520 && !/^(?:table of |contents\b|authorities\b)/i.test(pending)) {
          entries.set(key(pending), pending);
        }
        pending = '';
      } else if (pending.length > 520) pending = '';
    }
  }
  return {entries, omit};
}

export function briefContents(pages) {
  const {entries, omit} = printedSections(pages);
  const headings = [], prefixes = new Set();
  for (const term of entries.keys()) {
    for (let i = 1; i < term.length; i++) prefixes.add(term.slice(0, i));
  }
  for (let page = 0; entries.size && page < pages.length; page++) {
    if (omit.has(page)) continue;
    const lines = linesOf(pages[page]);
    for (let i = 0; i < lines.length; i++) {
      let candidate = '';
      for (let j = i; j < lines.length && j < i + 12; j++) {
        candidate += key(lines[j].text);
        if (!candidate) break;
        if (entries.has(candidate)) {
          const text = entries.get(candidate);
          headings.push({page, start:lines[i].start, end:lines[j].end, text,
            level:/^[A-H][.)]\s/.test(text) ? 1 : /^\d+[.)]\s/.test(text) ? 2 : 0});
          entries.delete(candidate);
          i = j;
          break;
        }
        if (!prefixes.has(candidate)) break;
      }
    }
  }
  return {headings, omit};
}
