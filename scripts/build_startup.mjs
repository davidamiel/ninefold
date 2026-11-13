import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {homeContent, renderHome, publicHeader} from '../dist/homepage.js';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
const directory = path.join(root, 'data/reader-assets');
fs.mkdirSync(directory, {recursive: true});
const written = new Set();
function write(name, value) {
  written.add(name + '.json');
  fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify(value) + '\n');
  return 'data/reader-assets/' + name + '.json';
}
function asset(value) {
  const name = crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
  return write(name, value);
}
const layout = read('reading-layout'), structure = read('reader-structure');
const documents = {};
for (const id of [...new Set([...Object.keys(layout), ...Object.keys(structure)])].sort()) {
  documents[id] = asset({layout: layout[id], structure: structure[id]});
}
const argumentsIndex = {};
for (const [id, record] of Object.entries(read('argument-alignment'))) {
  argumentsIndex[id] = {...record, sessions: record.sessions.map(({turns, ...session}) => ({...session, turnsPath: asset(turns)}))};
}
write('index', documents);
write('arguments', argumentsIndex);
for (const name of fs.readdirSync(directory)) {
  if (name.endsWith('.json') && !written.has(name)) fs.unlinkSync(path.join(directory, name));
}
const catalog = read('catalog'), term = read('current-term');
const home = homeContent({cases: [...catalog.cases, ...term.cases], term, profiles: read('profiles'), issues: read('case-issues'), areas: read('current-areas'), photo: read('court-photo')});
const index = path.join(root, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const initial = '<!-- HOME_START -->' + publicHeader() + renderHome(home) + '<!-- HOME_END -->';
fs.writeFileSync(index, html.replace(/<!-- HOME_START -->[\s\S]*?<!-- HOME_END -->/, initial));
console.log('Built static homepage and ' + written.size + ' independently loadable reader assets.');
