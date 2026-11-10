import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const base = new URL(process.env.PAGES_BASE_URL || 'https://davidamiel.github.io/ninefold/');
const expectedCommit = process.env.GITHUB_SHA;
assert.match(expectedCommit || '', /^[a-f0-9]{40}$/);
const attempts = [];
async function verify(attempt = 1) {
  try {
    const get = async name => {
      const url = new URL(name, base);
      url.searchParams.set('verify', expectedCommit + '-' + Date.now());
      const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(20000)});
      assert.equal(response.status, 200, name + ' HTTP status');
      return Buffer.from(await response.arrayBuffer());
    };
    const manifest = JSON.parse((await get('deployment-manifest.json')).toString('utf8'));
    assert.equal(manifest.commit, expectedCommit, 'published build commit');
    const files = Object.fromEntries(await Promise.all(
      ['index.html', 'app.js', 'reader-authorities.js'].map(async name => {
        const digest = crypto.createHash('sha256').update(await get(name)).digest('hex');
        assert.equal(digest, manifest.sha256[name], name + ' live SHA256');
        return [name, digest];
      })
    ));
    attempts.push({attempt, status: 'verified', commit: manifest.commit, sha256: files});
    return true;
  } catch (error) {
    attempts.push({attempt, status: 'not-yet-verified', message: error.message});
    if (attempt === 6) return false;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return verify(attempt + 1);
  }
}
const verified = await verify();
const result = {base: base.href, expectedCommit, verified, attempts, checkedAt: new Date().toISOString()};
fs.writeFileSync('pages-live-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log('PAGES_LIVE_VERIFICATION ' + JSON.stringify(result));
assert.ok(verified, 'Live deployment identity did not match the built commit and file hashes.');
