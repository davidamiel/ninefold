import {test, expect} from '@playwright/test';

// Deterministic network boundaries. The app, media playback, progress-saving
// cadence and pointer/focus handling all run normally. Emulator-backed manual
// verification exercises the real Firebase client separately.
const accountModule = `export async function createAccount(notify) {
  const library={notes:[],saved:[],recents:[],positions:{},audioProgress:{}};
  window.accountHarness={acknowledgements:0,receive(update){Object.assign(library,update);notify({type:'library',...structuredClone(library)})}};
  const user={uid:'interaction-test',displayName:'Reader',email:'reader@example.test'};
  setTimeout(()=>{notify({type:'session',user});accountHarness.receive({})},0);
  return {configured:true,ready:true,user,save(){},loadPublishedContent:async()=>[],
    saveAudioProgress(key,value){setTimeout(()=>{library.audioProgress[key]=value;accountHarness.acknowledgements++;accountHarness.receive({})},150)}};
}`;
function wave(seconds) {
  const rate = 12000, samples = seconds * rate, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(300 * Math.sin(i * 2 * Math.PI * 220 / rate)), 44 + i * 2);
  return buffer;
}
const clip = wave(6), recording = wave(60);
async function recordingResponse(route) {
  // WebKit's media decoder probes the end of a WAV via a byte-range request.
  // Respond like the recording server instead of returning the whole file again.
  const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
  const headers = {'Accept-Ranges':'bytes'};
  if (!range) return route.fulfill({contentType:'audio/wav', headers, body:recording});
  const start = Number(range[1]), end = Math.min(Number(range[2] || recording.length - 1), recording.length - 1);
  if (start > end) return route.fulfill({status:416, headers:{'Content-Range':`bytes */${recording.length}`}});
  return route.fulfill({status:206, contentType:'audio/wav', headers:{...headers, 'Content-Range':`bytes ${start}-${end}/${recording.length}`}, body:recording.subarray(start, end + 1)});
}

const workerModule = `let session;
self.onmessage=async({data})=>{
 if(data.type==='cancel'){session=data.session;return}
 if(['configure','prepare','prioritize','window','cancel-download'].includes(data.type))return;
 session=data.session;const current=session;
 const response=await fetch('./test-voice.wav');const wav=await response.arrayBuffer();
 if(current!==session)return;
 self.postMessage({type:'ready'});self.postMessage({type:'audio',id:data.id,session:current,wav,duration:6},[wav]);
};`;

test.beforeEach(async ({page}) => {
  await page.route('**/account.js', route => route.fulfill({contentType:'application/javascript', body:accountModule}));
  await page.route('**/narration-worker.js', route => route.fulfill({contentType:'application/javascript', body:workerModule}));
  await page.route('**/test-voice.wav', route => route.fulfill({contentType:'audio/wav', body:clip}));
  await page.route('**/media/audio/mp3files/**', recordingResponse);
  await page.goto('/#/reader/25-966?doc=25-966-b19029b6064a');
  await expect(page.locator('.document-title')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-signed-in', 'true');
});

for (const kind of ['document', 'argument']) {
  test(`${kind}: progress sync preserves a pressed button and open settings`, async ({page}) => {
    await page.getByRole('button', {name:'Expand audio controls', exact:true}).click();
    await page.getByRole('button', {name:kind === 'document' ? /^Read document/ : /^Oral argument/}).click();
    await expect(page.locator('.listening-status')).toHaveText(kind === 'document' ? 'Reading aloud' : 'Court recording');
    const reader = await page.locator('.reader-shell').elementHandle();
    const options = await page.getByRole('button', {name:'Audio options', exact:true}).elementHandle();
    const acknowledgements = await page.evaluate(() => window.accountHarness.acknowledgements);
    const box = await options.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Safari does not focus buttons on pointer-down; establish keyboard focus
    // explicitly, then verify asynchronous updates preserve it.
    await options.evaluate(node => node.focus());
    await expect.poll(() => page.evaluate(() => window.accountHarness.acknowledgements), {timeout:10000}).toBeGreaterThan(acknowledgements);
    // A normal locator.click() can retry on a replacement element and hide this bug.
    expect(await reader.evaluate(node => node.isConnected)).toBe(true);
    expect(await options.evaluate(node => node.isConnected)).toBe(true);
    expect(await options.evaluate(node => node === document.activeElement)).toBe(true);
    await page.mouse.up();
    const speed = page.getByLabel('Playback speed', {exact:true});
    await expect(speed).toBeVisible();
    await speed.focus();
    const focused = await speed.elementHandle();
    const next = await page.evaluate(() => window.accountHarness.acknowledgements);
    await expect.poll(() => page.evaluate(() => window.accountHarness.acknowledgements), {timeout:10000}).toBeGreaterThan(next);
    expect(await focused.evaluate(node => node === document.activeElement)).toBe(true);
    await page.getByRole('button', {name:'Pause', exact:true}).click();
    await expect(page.locator('.listening-status')).toHaveText('Paused');
    await page.getByRole('button', {name:'Play', exact:true}).click();
    await expect(page.locator('.listening-status')).toHaveText(kind === 'document' ? 'Reading aloud' : 'Court recording');
  });
}

test('background library updates preserve the reader and update resume choices', async ({page}) => {
  await page.getByRole('button', {name:'Expand audio controls', exact:true}).click();
  const reader = await page.locator('.reader-shell').elementHandle();
  await page.evaluate(() => window.accountHarness.receive({audioProgress:{'audio:document:25-966-b19029b6064a':{seconds:42,savedAt:Date.now()}}}));
  await expect(page.getByRole('button', {name:/^Resume document · 0:42/})).toBeVisible();
  expect(await reader.evaluate(node => node.isConnected)).toBe(true);
  await page.getByRole('button', {name:'Collapse audio controls', exact:true}).click();
  await expect(page.getByRole('region', {name:'Listen', exact:true})).toHaveCount(0);
});


test('opening audio and reloading a previously narrated document never starts the voice engine', async ({page}) => {
  const workers = [];
  page.on('worker', worker => workers.push(worker.url()));
  await page.addInitScript(() => {
    const key = 'court-reader-v1';
    const value = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({...value, narrationUsed: true}));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__court?.state.narrationUsed)).toBe(true);
  await expect(page.locator('.document-title')).toBeVisible();
  await page.getByRole('button', {name:'Expand audio controls', exact:true}).click();
  await expect(page.getByRole('button', {name:/^Read document/})).toBeVisible();
  await page.waitForTimeout(1500);
  expect(workers.filter(url => url.includes('narration-worker'))).toEqual([]);
  await page.getByRole('button', {name:/^Oral argument/}).click();
  await expect(page.locator('.listening-status')).toHaveText('Court recording');
  expect(workers.filter(url => url.includes('narration-worker'))).toEqual([]);
});
