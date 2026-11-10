import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const base = 'https://davidamiel.github.io/ninefold/';
const expected = JSON.parse(fs.readFileSync('dist/data/docs/cap-us-464-16.json'));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const versionResponse = await fetch(base + 'data/content-base-version.json', {cache:'no-store'});
assert.equal(versionResponse.status,200);
const version = (await versionResponse.json()).version;
const results=[];
for (const query of ['base='+version,'verify='+Date.now()]) {
 const url=base+'data/docs/cap-us-464-16.json.gz?'+query;
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 const bytes=Buffer.from(await response.arrayBuffer());
 const result={url,status:response.status,contentType:response.headers.get('content-type'),contentEncoding:response.headers.get('content-encoding'),bytes:bytes.length};
 assert.equal(response.status,200,JSON.stringify(result));
 const json=JSON.parse((bytes[0]===31&&bytes[1]===139?zlib.gunzipSync(bytes):bytes).toString('utf8'));
 Object.assign(result,{pages:json.pages.length,canonicalSha256:digest(json),expectedCanonicalSha256:digest(expected)});
 results.push(result);
 assert.equal(result.canonicalSha256,result.expectedCanonicalSha256);
}
fs.writeFileSync('russello-live-response.json',JSON.stringify(results,null,2)+'\n');
console.log('RUSSELLO_LIVE_RESPONSE '+JSON.stringify(results));
