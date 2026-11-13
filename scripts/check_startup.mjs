import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = name => JSON.parse(fs.readFileSync(new URL('../dist/' + name, import.meta.url), 'utf8'));
const index = read('data/reader-assets/index.json');
const restoredLayout = {}, restoredStructure = {};
for (const [id, path] of Object.entries(index)) {
  const asset = read(path);
  if (asset.layout) restoredLayout[id] = asset.layout;
  if (asset.structure) restoredStructure[id] = asset.structure;
}
assert.deepEqual(restoredLayout, read('data/reading-layout.json'), 'lazy layout assets preserve every source mapping');
assert.deepEqual(restoredStructure, read('data/reader-structure.json'), 'lazy structure assets preserve headings, footnotes and repairs');
const argumentsIndex = read('data/reader-assets/arguments.json');
const reconstructed = Object.fromEntries(Object.entries(argumentsIndex).map(([id, record]) => [id, {
  ...record,
  sessions: record.sessions.map(({turnsPath, ...session}) => ({...session, turns: read(turnsPath)})),
}]));
assert.deepEqual(reconstructed, read('data/argument-alignment.json'), 'lazy transcripts preserve every turn and sentence timing');
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
assert(html.includes('<h1>The Supreme Court, in Context</h1>'));
assert(html.includes('Recent Court Activity') && html.includes('Current Court'));
assert(!html.includes('Loading the court collection'));
console.log('Startup checks passed: complete static homepage and lossless lazy reader assets.');
