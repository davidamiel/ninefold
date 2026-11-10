import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] || 'out');
const output = process.argv[3] || 'pages-preflight.json';
const files = [];
const problems = [];
function walk(directory) {
  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) { problems.push({path: relative, reason: 'symbolic link'}); continue; }
    if (stat.isDirectory()) { walk(absolute); continue; }
    if (!stat.isFile()) { problems.push({path: relative, reason: 'not a regular file'}); continue; }
    if (stat.nlink > 1) problems.push({path: relative, reason: 'hard-linked file'});
    if (!(stat.mode & 0o444)) problems.push({path: relative, reason: 'no read permission bits'});
    files.push({path: relative, bytes: stat.size});
  }
}
walk(root);
for (const required of ['index.html', 'app.js', 'reader-authorities.js']) {
  if (!files.some(file => file.path === required && file.bytes > 0))
    problems.push({path: required, reason: 'missing or empty required file'});
}
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
if (totalBytes > 1_073_741_824)
  problems.push({reason: 'site exceeds the documented 1 GB published-site limit', bytes: totalBytes});
const hashes = {};
for (const name of ['index.html', 'app.js', 'reader-authorities.js']) {
  if (files.some(file => file.path === name))
    hashes[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
}
const manifest = {
  commit: process.env.GITHUB_SHA || null,
  generatedAt: new Date().toISOString(),
  fileCount: files.length,
  totalBytes,
  largestFiles: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 20),
  sha256: hashes,
  problems,
  limitation: 'Local artifact-shape validation; does not establish Pages backend health or successful publication.'
};
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
if (!problems.length) fs.writeFileSync(path.join(root, 'deployment-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
if (problems.length) process.exitCode = 1;
