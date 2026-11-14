import {test,expect} from '@playwright/test';
const documentId='26A560-e0601b5a934c';
const reader='/#/reader/26A560?doc='+documentId;
const accountModule=`export async function createAccount(notify){
 const library={notes:[],saved:[],recents:[],positions:{},audioProgress:{}};
 window.accountHarness={acknowledgements:0,receive(update){Object.assign(library,update);notify({type:'library',...structuredClone(library)})}};
 const user={uid:'recording-test',displayName:'Reader',email:'reader@example.test'};
 setTimeout(()=>{notify({type:'session',user});accountHarness.receive({})},0);
 return {configured:true,ready:true,user,save(){},loadPublishedContent:async()=>[],saveAudioProgress(key,value){setTimeout(()=>{library.audioProgress[key]=value;accountHarness.acknowledgements++;accountHarness.receive({})},150)}};
}`;
const errors=new WeakMap();
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  window.mediaProbe={media:[],events:[]};
  window.Audio=new Proxy(window.Audio,{construct(Target,args){
   const media=new Target(...args);mediaProbe.media.push(media);
   for(const type of ['playing','waiting','canplay','seeked','pause'])media.addEventListener(type,()=>{
    mediaProbe.events.push({type,time:media.currentTime,ready:media.readyState,paused:media.paused});
    if(mediaProbe.events.length>100)mediaProbe.events.shift();
   });return media;
  }});
 });
 const found=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));
 await page.route('**/account.js',route=>route.fulfill({contentType:'application/javascript',body:accountModule}));
 await page.goto(reader);await expect(page.locator('.prepared-paragraph').first()).toBeVisible({timeout:20000});await expect(page.locator('body')).toHaveAttribute('data-signed-in','true');
});
test.afterEach(async({page},testInfo)=>{
 if(testInfo.status!==testInfo.expectedStatus){
  const state=await page.evaluate(()=>({events:mediaProbe.events,media:mediaProbe.media.map(m=>({src:m.currentSrc,time:m.currentTime,paused:m.paused,ready:m.readyState,network:m.networkState,buffered:Array.from({length:m.buffered.length},(_,i)=>[m.buffered.start(i),m.buffered.end(i)])}))}));
  await testInfo.attach('native-media-state',{body:JSON.stringify(state,null,2),contentType:'application/json'});
 }
 expect(errors.get(page)).toEqual([]);
});
async function start(page){await page.getByRole('button',{name:'Audio',exact:true}).click();await page.getByRole('button',{name:'Read document',exact:true}).click();await expect(page.locator('.recording-status')).toHaveText('Reading',{timeout:15000})}
async function seek(page,seconds){await page.locator('.recording-seek').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}))},seconds)}
function withinRow(boxes){return Math.max(...boxes.map(b=>b.y+b.height/2))-Math.min(...boxes.map(b=>b.y+b.height/2))<7}

test('recorded voices keep sentence position, real duration and stable account-synced controls',async({page})=>{
 await start(page);await seek(page,110);await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 const highlighted=await page.evaluate(()=>[...(CSS.highlights.get('document-audio')||[])].map(r=>r.toString()).join(' '));expect(highlighted.length).toBeGreaterThan(10);
 await page.getByLabel('Document voice',{exact:true}).selectOption('male');
 await expect(page.locator('.recording-status')).toHaveText('Paused');await expect(page.locator('.recording-time')).toContainText(/7:(?:09|10)/);
 expect(await page.evaluate(()=>[...(CSS.highlights.get('document-audio')||[])].map(r=>r.toString()).join(' '))).toBe(highlighted);
 await page.getByLabel('Playback speed',{exact:true}).selectOption('1.5');
 await page.getByRole('button',{name:'Play',exact:true}).click();
 const control=await page.getByRole('button',{name:'Audio options',exact:true}).elementHandle();await control.focus();
 const before=await page.evaluate(()=>accountHarness.acknowledgements);
 await expect.poll(()=>page.evaluate(()=>accountHarness.acknowledgements),{timeout:10000}).toBeGreaterThan(before);
 expect(await control.evaluate(el=>el.isConnected&&el===document.activeElement)).toBe(true);
 await expect(page.locator('.audio-options')).toBeVisible();await expect(page.getByLabel('Playback speed',{exact:true})).toHaveValue('1.5');
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.locator('.recording-status')).toHaveText('Paused');
});

test('a rendered Pause action stays paused when native seeking temporarily reports paused',async({page})=>{
 await start(page);await seek(page,110);
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const media=mediaProbe.media[1],play=media.play.bind(media),pause=media.pause.bind(media);
  window.transportRace={playCalls:0,pauseCalls:0};
  media.play=()=>{transportRace.playCalls++;return play()};
  media.pause=()=>{transportRace.pauseCalls++;return pause()};
  Object.defineProperty(media,'paused',{configurable:true,get:()=>true});
 });
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 expect(await page.evaluate(()=>({play:transportRace.playCalls,pause:transportRace.pauseCalls}))).toEqual({play:0,pause:1});
 expect(await page.evaluate(()=>{const media=mediaProbe.media[1];delete media.paused;return media.paused})).toBe(true);
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 await page.getByLabel('Document voice',{exact:true}).selectOption('male');
 await expect(page.locator('.recording-status')).toHaveText('Paused');
 await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>transportRace.playCalls)).toBe(0);
});

test('pausing a pending play ignores its cancellation and prevents late playback',async({page})=>{
 await start(page);await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.evaluate(()=>{
  const media=mediaProbe.media[1],play=media.play.bind(media),pause=media.pause.bind(media);
  window.pendingPlayback={pauseCalls:0};
  media.play=()=>{media.play=play;return new Promise((resolve,reject)=>{pendingPlayback.cancel=()=>reject(new DOMException('Playback was paused','AbortError'))})};
  media.pause=()=>{pendingPlayback.pauseCalls++;return pause()};
 });
 const control=await page.getByRole('button',{name:'Play',exact:true}).elementHandle();
 await control.focus();await control.press('Enter');
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 expect(await control.evaluate(el=>el.isConnected&&el===document.activeElement)).toBe(true);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.evaluate(()=>{pendingPlayback.cancel();mediaProbe.media[1].dispatchEvent(new Event('playing'))});
 await expect(page.locator('.recording-status')).toHaveText('Paused');
 await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry audio',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>pendingPlayback.pauseCalls)).toBeGreaterThanOrEqual(2);
 expect(await page.evaluate(()=>mediaProbe.media[1].paused)).toBe(true);
});

test('native pause updates transport intent before changing voices',async({page})=>{
 await start(page);await page.evaluate(()=>mediaProbe.media[1].pause());
 await expect(page.locator('.recording-status')).toHaveText('Paused');
 await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 await page.getByLabel('Document voice',{exact:true}).selectOption('male');
 await expect(page.locator('.recording-status')).toHaveText('Paused');
 expect(await page.evaluate(()=>mediaProbe.media[1].paused)).toBe(true);
});

test('text seeking resumes paused audio and collapses controls without opening menus',async({page})=>{
 await start(page);await page.getByRole('button',{name:'Pause',exact:true}).click();
 const paragraph=page.locator('.prepared-paragraph').nth(4);await paragraph.scrollIntoViewIfNeeded();
 await paragraph.locator('.page-text').first().click({position:{x:12,y:8}});
 await expect(page.getByRole('button',{name:'Audio',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('.audio-options')).toHaveCount(0);
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 const position=Number(await page.locator('.recording-seek').inputValue());expect(position).toBeGreaterThan(120);
 await expect(page.locator('.recording-status')).toHaveText('Reading',{timeout:15000});
 await expect.poll(async()=>Number(await page.locator('.recording-seek').inputValue()),{timeout:15000}).toBeGreaterThan(position+.2);
});

test('expanded audio stays in one toolbar row at narrow and zoomed widths',async({page})=>{
 await start(page);
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  const controls=[page.getByRole('button',{name:'Pause',exact:true}),page.getByRole('button',{name:'Audio',exact:true}),page.locator('.audio-position'),page.getByRole('button',{name:'Audio options',exact:true})];
  const boxes=await Promise.all(controls.map(c=>c.boundingBox()));expect(boxes.every(Boolean)).toBe(true);expect(withinRow(boxes)).toBe(true);
  for(const box of boxes){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1)}
  expect(await page.locator('.reader-top').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(70);
  const rate=await page.getByLabel('Playback speed',{exact:true}).boundingBox(),time=await page.locator('.recording-time').boundingBox();
  expect(rate.width).toBeLessThanOrEqual(40);expect(rate.height).toBeLessThanOrEqual(30);expect(rate.x).toBeGreaterThan(time.x+time.width);
  await expect(page.getByRole('button',{name:'Downloads',exact:true})).toHaveCount(0);
 }
});

test('document information follows focused split pane and availability matches the current document',async({page})=>{
 await page.goto(reader+'&split=26A560-e4a0d439a311');await expect(page.locator('.prepared-paragraph').first()).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:'Document info',exact:true}).click();await expect(page.locator('.document-information h2')).toHaveText('Opinion of the Court');
 if(page.viewportSize().width<=760)await page.locator('.sidebar [data-action=close-side]').click();
 const other=page.locator('[role=tab][data-value="26A560-e4a0d439a311"]').filter({visible:true}).first();await other.click();
 if(page.viewportSize().width<=760)await page.getByRole('button',{name:'Document info',exact:true}).click();
 await expect(page.locator('.document-information h2')).toHaveText('Response to the Application');await expect(page.locator('.document-audio-status')).toContainText('Audio unavailable');
 await expect(page.locator('.tab.selected').filter({visible:true}).first()).toHaveAttribute('data-tab-id','26A560-e4a0d439a311');
 if(page.viewportSize().width<=760)await page.locator('.sidebar [data-action=close-side]').click();
 const original=page.locator(`[role=tab][data-value="${documentId}"]`).filter({visible:true}).first();await original.focus();await original.press('Enter');
 if(page.viewportSize().width<=760)await page.getByRole('button',{name:'Document info',exact:true}).click();
 await expect(page.locator('.document-information h2')).toHaveText('Opinion of the Court');await expect(page.locator('.document-audio-status')).toContainText('Female and Male');
});

test('account progress offers resume and restart and case tiles expose audio availability',async({page})=>{
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await page.evaluate(id=>accountHarness.receive({audioProgress:{['audio:document:'+id]:{kind:'document',seconds:42,voice:'female',savedAt:Date.now()}}}),documentId);
 await expect(page.getByRole('button',{name:'Resume document · 0:42',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Resume document · 0:42',exact:true}).click();await expect(page.locator('.recording-status')).toHaveText('Reading');
 expect(Number(await page.locator('.recording-seek').inputValue())).toBeGreaterThanOrEqual(42);
 await page.goto('/#/case/26A560');await expect(page.getByRole('img',{name:'Audio available',exact:true})).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:'Application & Responses',exact:true}).click();await expect(page.getByRole('img',{name:'Audio unavailable',exact:true}).first()).toBeVisible();
});

test('account resume restores the saved voice and exact recording position on a fresh device',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('court-reader-v1',JSON.stringify({audioVoice:'female'})));
 await page.reload();await expect(page.locator('.prepared-paragraph').first()).toBeVisible();await expect(page.locator('body')).toHaveAttribute('data-signed-in','true');
 const prepared=await (await page.request.get('/data/prepared-documents.json')).json(),recordings=prepared[documentId].recordings;
 const {cues}=await (await page.request.get('/'+recordings.male.cuesPath)).json(),seconds=110.25;
 const cue=cues.find(c=>c.start<=seconds&&c.end>seconds);
 const progress={kind:'document',docId:documentId,seconds,voice:'male',recording:recordings.male.url,text:cue.text,page:cue.ranges[0].page,sourceStart:cue.ranges[0].start,offset:seconds-cue.start,savedAt:Date.now()};
 await page.evaluate(({id,progress})=>{
  accountHarness.receive({audioProgress:{['audio:document:'+id]:progress}});
  const media=mediaProbe.media[1],play=media.play.bind(media);
  media.play=()=>{window.resumeStart={time:media.currentTime,src:media.querySelector('source')?.getAttribute('src')};return play()};
 },{id:documentId,progress});
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await page.getByRole('button',{name:'Resume document · 1:50',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading');
 expect(await page.evaluate(()=>resumeStart.src)).toBe(recordings.male.url);
 expect(await page.evaluate(()=>resumeStart.time)).toBeCloseTo(seconds,2);
 expect(await page.evaluate(()=>mediaProbe.media[1].currentTime)).toBeGreaterThanOrEqual(seconds);
 expect(Math.abs(await page.evaluate(()=>mediaProbe.media[1].duration)-recordings.male.duration)).toBeLessThan(.15);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 await expect(page.getByLabel('Document voice',{exact:true})).toHaveValue('male');
 await page.evaluate(({id,progress})=>accountHarness.receive({audioProgress:{['audio:document:'+id]:progress}}),{id:documentId,progress});
 await page.getByLabel('Document voice',{exact:true}).selectOption('female');
 await expect(page.locator('.recording-status')).toHaveText('Paused');
 await expect(page.getByLabel('Document voice',{exact:true})).toHaveValue('female');
 expect(await page.evaluate(()=>mediaProbe.media[1].querySelector('source').getAttribute('src'))).toBe(recordings.female.url);
 await page.getByRole('button',{name:'Stop audio',exact:true}).click();
 await page.evaluate(({id,progress})=>accountHarness.receive({audioProgress:{['audio:document:'+id]:progress}}),{id:documentId,progress});
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await page.getByRole('button',{name:'Restart document',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading');
 expect(await page.evaluate(()=>resumeStart.src)).toBe(recordings.female.url);
 expect(await page.evaluate(()=>resumeStart.time)).toBe(0);
});

test('oral arguments retain their transcript tab, speaker portrait and compact controls',async({page})=>{
 // Route a real media container with byte ranges; transcript data and native
 // playback stay real while the Court's external recording server is isolated.
 const rate=12000,seconds=90,samples=rate*seconds,wav=Buffer.alloc(44+samples*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(200*Math.sin(i*.1)),44+i*2);
 await page.route('**/media/audio/mp3files/**',route=>{
  const range=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range||'');
  if(!range)return route.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:wav});
  const start=Number(range[1]),end=Math.min(Number(range[2]||wav.length-1),wav.length-1);
  return route.fulfill({status:206,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${wav.length}`},body:wav.subarray(start,end+1)});
 });
 await page.goto('/#/reader/25-966?doc=25-966-b19029b6064a');await expect(page.locator('.document-title')).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:'Audio',exact:true}).click();await page.getByRole('button',{name:'Oral argument',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Court recording',{timeout:15000});
 await expect(page.locator('[role=tab]').filter({hasText:'Transcript'}).filter({visible:true}).first()).toBeVisible();
 await expect(page.locator('#audio-speaker-portrait img')).toBeVisible();
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.locator('.recording-status')).toHaveText('Paused');
 await page.locator('.conversation-header h2').click();await expect(page.getByRole('button',{name:'Audio',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('#audio-speaker-portrait img')).toBeVisible();
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('button',{name:'Audio',exact:true}).click();await expect(page.locator('.recording-status')).toHaveText('Court recording');
});

test('homepage and reading view load no PDF or unrelated document text',async({page})=>{
 const requests=[];page.on('request',request=>requests.push(new URL(request.url(),page.url()).pathname));
 await page.goto('/');await page.waitForFunction(()=>window.__court);
 expect(requests.filter(path=>/\.pdf$|\/vendor\/pdfjs\/|\/data\/(?:docs|current-docs|prepared-text)\//.test(path))).toEqual([]);
 expect(requests).toContain('/data/content-base-version.json');
 const inventory=await page.request.get(new URL('/data/prepared-documents.json',page.url()).href);const entries=await inventory.json();
 expect(Object.values(entries).every(doc=>!doc.paragraphs&&doc.textPath)).toBe(true);
 await page.goto(reader);await expect(page.locator('.prepared-paragraph').first()).toBeVisible({timeout:20000});
 expect(requests.some(path=>path.includes('/data/prepared-text/'))).toBe(true);
 expect(requests.filter(path=>/\.pdf$|\/vendor\/pdfjs\//.test(path))).toEqual([]);
 await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('button',{name:'PDF',exact:true}).click();
 await expect.poll(()=>requests.filter(path=>path.endsWith('.pdf')).length,{timeout:15000}).toBeGreaterThan(0);
 expect(requests.some(path=>path.includes('/vendor/pdfjs/'))).toBe(true);
});

test('citation previews open from the keyboard and link to the official statute',async({page})=>{
 const citation=page.locator('.prepared-paragraph .citation').first();await citation.focus();await citation.press('Enter');
 await expect(page.locator('.peek')).toBeVisible();
 await expect(page.locator('.peek .peek-heading')).toContainText('110 Stat. 3009–554');
 await expect(page.locator('.peek').getByRole('link',{name:'Official Text',exact:true})).toHaveAttribute('href','https://www.govinfo.gov/content/pkg/STATUTE-110/pdf/STATUTE-110-Pg3009.pdf');
});

test('failed recording requests can be retried without reloading the reader',async({page})=>{
 await page.route('**/audio/*.mp3',route=>route.abort());
 await page.getByRole('button',{name:'Audio',exact:true}).click();await page.getByRole('button',{name:'Read document',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry audio',exact:true})).toBeVisible();
 await page.unroute('**/audio/*.mp3');await page.getByRole('button',{name:'Retry audio',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading',{timeout:15000});
 await expect(page.locator('.prepared-paragraph').first()).toBeVisible();
});

test('old automatic PDF defaults do not fetch PDFs when returning to the reader',async({page})=>{
 await page.evaluate(id=>{
  const key='court-reader-v1',saved=JSON.parse(localStorage.getItem(key)||'{}');
  saved.documentFormats={};saved.pdfDocs=[id];
  for(const workspace of Object.values(saved.workspaces||{}))workspace.pdfDocs=[id];
  localStorage.setItem(key,JSON.stringify(saved));
 },documentId);
 const pdfs=[];page.on('request',request=>{if(/\.pdf(?:\?|$)|\/vendor\/pdfjs\//.test(request.url()))pdfs.push(request.url())});
 await page.reload();await expect(page.locator('.prepared-paragraph').first()).toBeVisible({timeout:20000});
 expect(pdfs).toEqual([]);
});


test('headphones choose a source before playback and transport controls use icons',async({page})=>{
 await expect(page.locator('.audio-play')).toHaveCount(0);
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await expect(page.getByRole('region',{name:'Choose audio'})).toBeVisible();
 await expect(page.locator('.recording-seek')).toHaveCount(0);
 await expect(page.locator('.audio-play')).toHaveCount(0);
 await page.getByRole('button',{name:'Read document',exact:true}).click();
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 for(const name of ['Back 10 seconds','Forward 10 seconds','Return to text','Stop audio','Restart audio']){
  const control=page.getByRole('button',{name,exact:true});await expect(control).toBeVisible();expect((await control.innerText()).trim()).toMatch(/^(?:10)?$/);
 }
 await page.getByRole('button',{name:'Stop audio',exact:true}).click();await expect(page.locator('.audio-play')).toHaveCount(0);
});

test('citations have compact individual margin targets and prose uses display-only hyphenation',async({page})=>{
 const first=page.locator('.prepared-paragraph').first();
 await expect(first).not.toContainText('§102');
 await expect(first).not.toContainText('note following');
 expect(await first.innerText()).not.toMatch(/\[\d+\]\./);
 expect(await first.innerText()).not.toMatch(/, \[\d+\],/);
 await expect(first.locator('.citation')).toHaveCount(3);
 await expect(page.locator('.prepared-paragraph').nth(1)).not.toContainText('Fed. Reg.');
 await expect(page.locator('.prepared-paragraph').nth(1)).not.toContainText('id., at');
 expect(await first.evaluate(el=>getComputedStyle(el).textAlign)).toBe('justify');
 expect(await first.evaluate(el=>getComputedStyle(el).hyphens)).toBe('auto');
 expect(await first.innerText()).not.toContain('\u00ad');
 const selected=page.locator('.tab.selected').filter({visible:true}).first();
 const style=await selected.evaluate(el=>{const s=getComputedStyle(el);return {shadow:s.boxShadow,widths:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth]}});
 expect(style.shadow).toBe('none');expect(new Set(style.widths).size).toBe(1);
 if(page.viewportSize().width>760){
  const references=page.locator('.document-margin .margin-reference');await expect(references.first()).toBeVisible();
  expect(await references.count()).toBeGreaterThan(5);
  for(const button of await references.all()){expect((await button.boundingBox()).width).toBeLessThanOrEqual(38)}
  await expect(page.locator('[data-action="margin-group"]')).toHaveCount(0);
  const keys=await references.evaluateAll(els=>els.slice(0,2).map(el=>el.dataset.refKey));expect(keys[0]).not.toBe(keys[1]);
  await references.nth(1).focus();await references.nth(1).press('Enter');await expect(page.locator('.peek')).toBeVisible();
 }
});
