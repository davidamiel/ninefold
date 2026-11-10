import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/app.js','utf8');
test('secondary playback controls stay outside the fixed-height reader toolbar',()=>{
 const css=fs.readFileSync('dist/ui-refinement.css','utf8');
 assert.match(css,/\.reader-top:has\(\.playback-strip\)\{position:relative;/);
 assert.match(css,/#reader-playback\{position:static;flex:0 0 auto;width:auto;height:44px;min-height:44px/);
 assert.match(css,/\.playback-secondary\{display:none;position:absolute;top:calc\(100% \+ 4px\)/);
 assert.match(css,/max-width:calc\(100vw - 20px\)/);
});

function declaration(name){const start=source.indexOf('function '+name+'(');assert(start>=0);let end=source.indexOf(name==='updateSeek'?'\n':'\nfunction ',start+1);return source.slice(start,end<0?undefined:end)}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,a,v='',cls='',extra='')=>`<button class="${cls}" data-action="${a}" data-value="${esc(v)}" ${extra}>${label}</button>`;
function run(names,values,expr){const ctx=vm.createContext({...values,esc,button});vm.runInContext(names.map(declaration).join('\n'),ctx);return vm.runInContext(expr,ctx)}
test('player separates circular play from visible speed and expandable secondary controls',()=>{
 const html=run(['playbackControls'],{narration:null,audioCase:'test',audio:{paused:true,currentTime:3,playbackRate:1},state:{route:'reader'},playbackExpanded:false,currentTimedDoc:()=>({}),icon:x=>`[${x}]`,skipIcon:x=>x?'forward':'back',time:x=>'0:03'},'playbackControls()');
 assert.match(html,/class="playback-toggle"[^>]*aria-label="Play"[^>]*>\[play\]<\/button>/);
 assert.match(html,/<select class="playback-speed"[^>]*>.*value="1" selected>1×<\/option>/);
 assert.match(html,/id="current-speaker"/);assert.match(html,/aria-expanded="false" aria-controls="playback-secondary"/);
 assert.match(html,/>\[audio\]<\/button>/);assert.match(html,/aria-label="Back 10 seconds"/);assert.match(html,/aria-label="Forward 10 seconds"/);
});
test('argument date is metadata and existing advocates are shown without invented names',()=>{
 const values={date:x=>x,icon:x=>`[${x}]`,personImage:()=>'',entityButton:(t,n)=>n,advocateRole:x=>'For '+x};
 let html=run(['argumentView'],values,`argumentView({argued:'2026-02-03',audio:{url:'x'},id:'c',advocates:[{name:'Actual Advocate',role:'the petitioner'}]},[])`);
 assert.match(html,/<h3>Oral argument<\/h3>/);assert.match(html,/Argued <time datetime="2026-02-03"/);assert(!html.includes('<h2>'));
 assert.match(html,/Argued by/);assert.match(html,/Actual Advocate/);assert.match(html,/For the petitioner/);
 html=run(['argumentView'],values,`argumentView({scheduledArgument:'2026-12-02',advocates:[]},[])`);assert(!html.includes('argument-advocates'));assert.match(html,/Scheduled for/);
});
test('seek mode elapsed label updates with chunk-local media time',()=>{
 const labels={'.playback-time':{},'.seek-close':{},'.playback-seek':{}};
 run(['updateSeek'],{narration:{},narrationAudio:{currentTime:21,duration:40},audio:{},narrationElapsed:()=>81,time:x=>x,document:{activeElement:null,querySelector:x=>labels[x]}},'updateSeek()');
 assert.equal(labels['.seek-close'].textContent,21);assert.equal(labels['.playback-time'].textContent,81);assert.equal(labels['.playback-seek'].value,21);
});
test('stop clears audio identity, speech highlight and speaker state',()=>{
 const highlights=new Map([['spoken',1]]);let removed=0,paused=0;
 const result=run(['clearSpoken','stopArgument'],{audio:{pause(){paused++},removeAttribute(){}},audioCase:'x',audioSession:'y',playbackExpanded:true,lastSpokenKey:'k',CSS:{highlights},document:{querySelectorAll:()=>[{classList:{remove(){removed++}}}]},closeReaderMenu(){},refreshPlayback(){}},'stopArgument();[audioCase,audioSession,playbackExpanded,lastSpokenKey]');
 assert.equal(JSON.stringify(result),'[null,null,false,null]');assert.equal(paused,1);assert.equal(removed,1);assert(!highlights.has('spoken'));
});
test('menus close on repeat click and Escape restores trigger focus',()=>{
 let focus=0,removed=0;const trigger={isConnected:true,setAttribute(){},focus(){focus++},getBoundingClientRect:()=>({left:0,bottom:30})};
 const element={className:'',innerHTML:'',style:{},offsetWidth:100,offsetHeight:100};
 const value=run(['closeReaderMenu','mountMenu'],{readerMenu:element,readerMenuTrigger:trigger,overlays:{querySelector:()=>({remove(){removed++}}),append(){}},document:{createElement:()=>element},innerWidth:390,innerHeight:700,trigger},'const result=mountMenu(trigger,"Hi");mountMenu(trigger,"Hi");closeReaderMenu(true);result');
 assert.equal(value,null);assert.equal(focus,1);assert(removed>=2);assert.match(source,/if\(readerMenu\)\{event.preventDefault\(\);closeReaderMenu\(true\)/);
});
test('Beaird preserves source layout and original links bypass internal interception',()=>{
 assert.match(source,/pdfFirstDocuments=new Set\(\['25-5343-97e702fdb59d--lower-8-14'\]\)/);
 assert.match(source,/link.hasAttribute\('data-open-original'\)/);
 const html=run(['originalPDFLink'],{filedPDF:()=> 'https://www.supremecourt.gov/original.pdf',ds:()=>null,safeUrl:x=>x},'originalPDFLink({})');
 assert.match(html,/data-open-original/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);
 const paths=JSON.parse(fs.readFileSync('dist/data/pdf-paths.json','utf8'));assert(fs.existsSync('dist/'+paths['25-5343-97e702fdb59d']));assert(!paths['25-5343-97e702fdb59d--lower-8-14']);
});
test('PDF-only availability does not claim unverified filings are scans',()=>{
 assert.match(source,/Reading view unavailable for this filing/);
 assert(!source.includes('Reading view unavailable for this scanned filing'));
});
