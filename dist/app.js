import {createContentPatch,applyContentPatch,validateContentPatch} from './content-patch.js';
import {createEditorSession} from './editor-session.js';
import {openCaseEditor} from './case-editor.js';
import {compileDocument,validateContent,escapeMarkdown} from './content-model.js';
import {sentenceAtTime} from './transcript-timing.js';
import {briefContents} from './reader-contents.js';
import {pdfSources,nativePDFURL,pdfPageRange,normalizePDFURL} from './pdf-source.js';
import {preparePDFLayout} from './pdf-layout.js';
import {citationsIn,passageAround,excerptOf,citedNames,shortCaseIn} from './reader-authorities.js';
import * as pdfjsLib from './vendor/pdfjs/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.mjs';
const app=document.querySelector('#app'),overlays=document.querySelector('#overlays');
const paths={book:'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7',back:'M15 5l-7 7 7 7 M8 12h13',arrow:'M9 5l7 7-7 7 M3 12h13',external:'M14 3h7v7 M21 3l-11 11 M10 3H4v17h17v-6',close:'M6 6l12 12 M18 6L6 18',plus:'M12 5v14 M5 12h14',file:'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8',files:'M7 5h12v16H7z M4 17V2h12',list:'M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1',note:'M4 3h16v13l-5 5H4z M15 21v-5h5 M8 7h8 M8 11h6',info:'M12 8h.01 M12 11v6 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',view:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',audio:'M3 14v-3a9 9 0 0 1 18 0v3 M3 12h4v8H3z M17 12h4v8h-4z',save:'M6 3h12v19l-6-4-6 4z',search:'M21 21l-6-6 M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',split:'M3 4h18v16H3z M12 4v16',sidebar:'M3 4h18v16H3z M16 4v16',play:'M7 3l14 9-14 9z',pause:'M7 4v16 M17 4v16',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',check:'M4 12l5 5L20 6',float:'M3 9V3h12 M3 15v6h6 M9 9h12v12H9z',highlight:'M4 17L15 6l5 5-11 11H4z M15 6l2-2 5 5-2 2 M2 22h10',calendar:'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.file}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>{try{const x=new URL(u,location.href);return ['http:','https:'].includes(x.protocol)?x.href:'#'}catch{return '#'}};
const button=(label,a,v='',cls='',extra='')=>`<button class="${cls}" data-action="${a}" data-value="${esc(v)}" ${extra}>${label}</button>`;
const external=(url,label='Source')=>`<a class="external" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const date=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const shortdate=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
let account=null,appReady=false,applyingAccount=false;
const signedIn=()=>!!account?.user;
paths.minimize='M4 9h5V4 M9 9L3 3 M20 15h-5v5 M15 15l6 6';paths.chevron='m6 9 6 6 6-6';
paths.library='M4 3h4v18H4z M10 3h4v18h-4z M17 3l4 17-4 1-4-17';paths.account='M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3';
const STORAGE='court-reader-v1';
let persisted={};try{persisted=JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{}
const state={route:'home',caseId:null,workspaces:{},workspaceId:null,pageMarkers:false,marginNotes:true,profileTerm:'all',participation:'all',tabs:[],active:null,split:null,side:false,tool:'info',group:'All',query:'',sort:'name',docQuery:'',docGroup:'All',includeAdmin:false,tabCases:{},calendarLimit:14,refs:[],ref:null,notes:[],saved:[],recents:[],positions:{},textSize:17,focusedNote:null,month:'all',...persisted,notes:[],saved:[],recents:[],positions:{}};
let catalog,cases=[],caseMap=new Map(),docs=new Map(),docCache=new Map(),docPending=new Map(),selection=null,toastTimer,renderGeneration=0,audioCase=null,sourceFailed=false;
const audio=new Audio();audio.preload='none';
const validGroups=['All','Certiorari','Merits','Amicus','Argument','Decision','Lower courts','Appendices','Other'];
let profiles={},opinionSections={},justiceQuotes={},justiceSignatures={},historyReady=false,restoringHistory=false;const quoteChoices=new Map();
const workspaceFields=['tabs','active','split','paneOrder','refs','ref','side','tool','docGroup','pdfDocs','tabCases'];
function persist(){if(signedIn()&&!applyingAccount)account.save(state);const {notes,saved,recents,positions,...publicState}=state;try{localStorage.setItem(STORAGE,JSON.stringify(publicState))}catch{toast('Storage is full. Export your notes from My library.')}}
function toast(t){clearTimeout(toastTimer);const box=document.querySelector('#toast');box.className='toast';box.textContent=t;toastTimer=setTimeout(()=>{box.className='';box.textContent=''},3500)}
function category(d){if(d.editorCategory)return d.category;if(!d.auxiliary&&/^(?:(?:Joint|Supplemental|Supplementary|Corrected)\s+)*(?:Appendix|Appendices)\b/i.test(d.title))return 'Appendices';return d.category||'Other'}
function getCase(){return caseMap.get(state.caseId)||cases[0]}
function ds(id){return docs.get(id)}
function contextCase(id){return caseMap.get(ds(id)?.caseId)||caseMap.get(state.tabCases[id])||getCase()}
function counts(){const filingDocs=[...new Map(cases.flatMap(c=>c.documents).map(d=>[d.id,d])).values()];return {cases:cases.length,docs:filingDocs.length,text:filingDocs.filter(d=>d.textPath).length,argued:cases.filter(c=>c.argued).length,decided:cases.filter(c=>c.decided).length}}
function status(c){return c.status||(c.decided?'Decided':c.argued?'Argued':'On docket')}
function capturePosition(el){const page=visiblePage(el),node=el.querySelector(`.source-page[data-page="${page}"]`),r=node?.getBoundingClientRect();return {scroll:el.scrollTop,page,ratio:r?Math.max(0,(el.getBoundingClientRect().top-r.top)/Math.max(1,r.height)):0}}
function storePositions(){document.querySelectorAll('.doc-scroll').forEach(el=>{if(el.dataset.doc&&!el.dataset.nativePDF)state.positions[positionKey(el)]=capturePosition(el)})}
function visiblePage(el){const r=el.getBoundingClientRect();return [...el.querySelectorAll('.source-page')].find(p=>p.getBoundingClientRect().bottom>r.top+60)?.dataset.page||'0'}
function restorePositions(target){(target?[target]:document.querySelectorAll('.doc-scroll')).forEach(el=>{const pos=state.positions[positionKey(el)];if(!pos)return;const node=el.querySelector(`.source-page[data-page="${pos.page}"]`);const top=pos.scroll===0?0:node&&pos.ratio!==undefined?el.scrollTop+node.getBoundingClientRect().top-el.getBoundingClientRect().top+pos.ratio*node.getBoundingClientRect().height:pos.scroll||0;el.scrollTo({top,behavior:'instant'})})}
function header(){return `<header class="app-header"><button class="brand" data-action="route" data-value="home"><img class="brand-symbol" src="brand/ninefold.svg" alt="">Ninefold</button><nav class="app-nav" aria-label="Main navigation">${[['home','Home'],['cases','Cases'],['justices','Justices'],['applications','Orders']].map(([id,t])=>button(t,'route',id,(state.route===id || id==='justices' && state.route==='profile' && state.profileType==='justices' || id==='cases' && ['case','reader'].includes(state.route) && !isApplication(getCase()) || id==='applications' && ['case','reader'].includes(state.route) && isApplication(getCase()))?'active':'')).join('')}<details class="explore-menu ${['areas','amici','advocates','about'].includes(state.route)||state.route==='profile'&&state.profileType!=='justices'?'active':''}"><summary><span>Explore</span><svg class="explore-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div>${[['areas','Areas of Law'],['advocates','Advocates'],['amici','Amici'],['about','About Ninefold']].map(([id,t])=>button(t,'route',id)).join('')}</div></details></nav><details class="mobile-menu"><summary aria-label="Main menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary><nav aria-label="Mobile navigation">${[['home','Home'],['cases','Cases'],['justices','Justices'],['applications','Orders']].map(([id,t])=>button(t,'route',id,(state.route===id || id==='justices' && state.route==='profile' && state.profileType==='justices' || id==='cases' && ['case','reader'].includes(state.route) && !isApplication(getCase()) || id==='applications' && ['case','reader'].includes(state.route) && isApplication(getCase()))?'active':'')).join('')}<details class="explore-menu ${['areas','amici','advocates','about'].includes(state.route)||state.route==='profile'&&state.profileType!=='justices'?'active':''}"><summary><span>Explore</span><svg class="explore-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div>${[['areas','Areas of Law'],['advocates','Advocates'],['amici','Amici'],['about','About Ninefold']].map(([id,t])=>button(t,'route',id)).join('')}</div></details></nav></details>${state.route!=='reader'&&(audioCase||narration)?`<div id="global-playback">${playbackControls()}</div>`:''}<div class="nav-account">${button(icon('search'),'global-search','','nav-icon',`aria-label="Search" title="Search"`)}${signedIn()?`<details class="account-menu"><summary aria-label="Account">${icon('account')}</summary><div><strong>${esc(account.user.displayName||account.user.email||'Account')}</strong>${button('My Library','route','library','listbutton')}${button('Sign Out','account-signout','','listbutton')}</div></details>`:button(icon('account'),'account-signin','','nav-icon',`aria-label="Sign In / Create Account"`) }</div></header>`}

function caseLink(c){return button(esc(c.name),'case',c.id,'case-link')}
function metrics(){const n=counts();return `<div class="metrics"><div class="metric"><strong>${n.cases}</strong><span>Docketed matters</span></div><div class="metric"><strong>${n.docs.toLocaleString()}</strong><span>Indexed documents</span></div><div class="metric"><strong>${n.text.toLocaleString()}</strong><span>Reader documents</span></div><div class="metric"><strong>${n.argued}</strong><span>With argument dates</span></div></div>`}
function termPage(){return casesPage()}
const termSittings=[['October Sitting','2025-10-06','2025-10-15'],['November Sitting','2025-11-03','2025-11-12'],['December Sitting','2025-12-01','2025-12-10'],['January Sitting','2026-01-12','2026-01-21'],['February Sitting','2026-02-23','2026-03-04'],['March Sitting','2026-03-23','2026-04-01'],['April Sitting','2026-04-20','2026-04-29']].map(([name,start,end])=>({name,start,end,sourceUrl:'https://www.supremecourt.gov/oral_arguments/argument_audio/2025'}));
function termYears(emergency=false) {
  const years = cases.filter(c=>isApplication(c)===emergency).flatMap(c=>[Number(c.term),...Object.keys(c.priorTermOrders||{}).map(Number)]);
  return [...new Set(years.filter(y=>Number.isInteger(y)&&y>0))].sort((a,b)=>b-a);
}
function sittingForTerm(year){return Number(year)===Number(currentTerm.term)?(currentTerm.sittings||[]).map(s=>({...s,name:s.name.replace(/ Sitting$/,'')+' Sitting'})):termSittings}
function defaultSitting(year){const sessions=sittingForTerm(year),asOf=currentTerm.asOf||new Date().toISOString().slice(0,10);return (Number(year)===Number(currentTerm.term)?sessions.find(x=>asOf>=x.start&&asOf<=x.end)||sessions.find(x=>x.start>asOf)||sessions.at(-1):sessions[0])?.name||'Awaiting Scheduling'}
function openTerm(year,explicit=true){state.browseTerm=termYears().includes(Number(year))?Number(year):termYears()[0];state.termExplicit=explicit;state.termChooserOpen=false;state.sitting=defaultSitting(state.browseTerm);state.termView='sittings';state.query='';state.termArea='';state.argumentMonth='';route('cases')}
function termDropdown(year,emergency=false){return `<select id="term-dropdown" aria-label="October term">${(emergency?['all',...termYears(true)]:termYears()).map(key=>`<option value="${key}" ${String(key)===String(year)?'selected':''}>${key==='all'?'All Terms':'OT '+key}</option>`).join('')}</select>`}
function termChooser(year,emergency){const bench=termBenches[year]?.names||[];return `<section class="term-chooser ${state.courtExpanded?'court-expanded':''}" aria-label="Term and Court composition">${termDropdown(year,emergency)}${bench.length?`${button('Court '+icon('chevron'),'court-toggle','','court-toggle',`aria-expanded="${!!state.courtExpanded}" aria-controls="chooser-bench"`)}<div class="chooser-bench" id="chooser-bench"><div class="archive-bench" aria-label="Justices of October Term ${year}">${bench.map(n=>button(`${portrait(n,'archive-portrait')}<span>${esc(n)}</span>`,'entity','justices|'+n,'bench-person')).join('')}</div></div>`:''}</section>`}

function setTermChooser(open,focus=false) {
  state.termChooserOpen=open;
  render();
  if(focus) app.querySelector(open?'#term-search':'.term-picker')?.focus({preventScroll:true});
}
function chooseTerm(value) {
  if(state.route==='applications') {
    state.applicationTerm=value==='all'?'all':Number(value);
    state.applicationStatus='';
  } else {
    state.termView=value==='all'?'all':'sittings';
    state.termExplicit=value!=='all';
    if(state.termExplicit) state.browseTerm=Number(value);
    state.termArea='';
    state.argumentMonth='';
  }
  setTermChooser(state.route!=='applications'&&state.termView!=='all',false);
}
document.addEventListener('input',event=>{
  if(event.target.id!=='term-search') return;
  const panel=event.target.closest('.term-chooser'),query=event.target.value.trim().toLowerCase();
  for(const option of panel.querySelectorAll('[data-action="choose-term"]'))
    option.hidden=!option.textContent.toLowerCase().includes(query);
  panel.querySelector('.year-empty').hidden=!!panel.querySelector('.year-results button:not([hidden])');
});
document.addEventListener('keydown',event=>{
  if(!state.termChooserOpen||!event.target.closest('.term-picker,.term-chooser')) return;
  if(event.key==='Escape') {event.preventDefault();setTermChooser(false,true)}
  if(event.target.id==='term-search'&&['ArrowDown','Enter'].includes(event.key)) {
    const first=app.querySelector('.year-results button:not([hidden])');
    if(first) {event.preventDefault();if(event.key==='Enter') first.click();else first.focus()}
  }
});

function aboutPage() {
  const portraits = Object.values(profiles).filter(p=>p.portraitPath && p.portraitCredit);
  return `<main class="main about-page"><header><h1>About Ninefold</h1><p>Ninefold brings together the cases, arguments, and decisions of the Supreme Court of the United States. Follow a case from the petition to the judgment, read opposing briefs together, and trace the authorities they cite.</p></header>
    <section><h2>The Collection</h2><p>Cases are organized by October term. The case record brings together filings, orders, opinions and oral arguments from the Court. Each case links to its official docket. Open a document to read it, follow references, or annotate a passage.</p>
    <div class="source-links"><a href="#/cases?view=terms">Browse Terms</a><a href="#/justices">Explore Justices</a></div></section>
    <section class="about-credits"><h2>Credits</h2><p>${external(courtPhoto.sourceUrl,'U.S. Supreme Court exterior')} · ${esc(courtPhoto.creator)}, public domain.</p>
    <p>${external(collectionPhoto.sourceUrl,'U.S. Supreme Court courtroom')} · ${esc(collectionPhoto.credit)}.</p><h3>Portraits</h3><ul>${portraits.map(p=>`<li>${external(p.portraitSourceUrl||p.portraitUrl,p.name)} · ${p.portraitLicenseUrl?esc(p.portraitArtist||p.portraitCredit)+' · '+external(p.portraitLicenseUrl,p.portraitLicense||'License'):esc(p.portraitCredit)}${p.portraitNote?' · '+esc(p.portraitNote):''}</li>`).join('')}</ul>
    <p>Advocate directory and transcript portraits are AI-generated ink illustrations adapted from the credited photographs. Amici use an original AI-generated illustration of legal briefs; it is decorative artwork, not an organization’s logo.</p><h3>Signatures</h3><ul>${Object.entries(justiceSignatures).map(([name,s])=>`<li>${external(s.sourceUrl,name)} · ${esc(s.license||s.sourceTitle)}</li>`).join('')}</ul>
    <h3>Authorities</h3><p>Precedent records draw on U.S. Reports in the ${external('https://www.loc.gov/collections/united-states-reports/','Library of Congress')} and the Court’s published opinions. Additional opinion texts come from Harvard Law School’s ${external('https://case.law/','Caselaw Access Project')}. Statutory text comes from the ${external('https://www.govinfo.gov/app/collection/uscode/2024','2024 edition of the United States Code')}. Federal rule references use the December 1, 2025 editions published by the Government Publishing Office. Each reference links to its source.</p>
    <h3>Oral Arguments</h3><p>Argument recordings and transcripts come from the Supreme Court of the United States. Speaker timing for selected arguments comes from ${external('https://www.oyez.org/','Oyez')}.</p></section></main>`;
}

let featuredCaseIndex = 0;
function featuredCaseCard() {
  const roster = (currentTerm.cases||[]).filter(c => caseIssues[c.id] && c.status !== 'Dismissed');
  if (!roster.length) return '';
  const item = roster[featuredCaseIndex % roster.length];
  return `<header><h2>Cases This Term</h2><div class="carousel-controls">${button(icon('back'),'feature-step','-1','','aria-label="Previous case"')}${button(icon('arrow'),'feature-step','1','','aria-label="Next case"')}</div></header>
    <div class="feature-content" aria-live="polite"><span class="feature-topic">${esc(caseAreas(item).join(' · '))}</span><a class="feature-case" href="#/case/${esc(item.id)}">${esc(item.name)}</a>
    <p>${esc(caseIssues[item.id].text)}</p><span class="feature-open" aria-hidden="true">Open Case ${icon('arrow')}</span></div>`;
}

function recentCourtActivity() {
  const events = [];
  for (const c of cases) {
    for (const [day,label] of [[c.granted,'Review Granted'],[c.argued,'Oral Argument'],[c.decided,isApplication(c)?'Order Issued':c.status==='Dismissed'?'Dismissed':'Decision Issued']]) {
      if (day && day <= currentTerm.asOf) events.push({date:day,label,c});
    }
  }
  const seen = new Set();
  return events.sort((a,b)=>b.date.localeCompare(a.date)||a.c.name.localeCompare(b.c.name)).filter(e=>{
    if (seen.has(e.c.id)) return false;
    seen.add(e.c.id); return true;
  }).slice(0,4);
}
function casesPage() {
  const emergency = state.route === 'applications';
  const allTerms = !emergency && state.termView === 'all';
  const year = Number(state.browseTerm || currentTerm.term || catalog.term);
  const scope = emergency ? (state.applicationTerm || 'all') : allTerms ? 'all' : year;
  const sessions = sittingForTerm(year);
  const pool = cases.filter(c=>isApplication(c)===emergency)
    .filter(c=>scope==='all' || Number(c.term)===Number(scope) || emergency && c.priorTermOrders?.[scope])
    .map(c=>emergency && c.priorTermOrders?.[scope] ? {...c,...c.priorTermOrders[scope]} : c);
  const argDate = c => c.argued || c.scheduledArgument || '';
  const statusFor = c => emergency ? caseDisplay[c.id]?.outcomeLabel || outcomeLabel(c)
    : c.status === 'Dismissed' ? 'Dismissed' : c.decided ? 'Decided' : c.argued ? 'Argued' : c.scheduledArgument ? 'Scheduled' : c.status || 'Granted';
  const areas = [...new Set(pool.flatMap(caseAreas))].sort();
  const months = [...new Set(pool.map(argDate).filter(Boolean).map(day=>day.slice(0,7)))].sort();
  const query = state.query.trim().toLowerCase();
  const matches = pool.filter(c => (c.name+' '+displayDocket(c.docket)+' '+c.docket).toLowerCase().includes(query) &&
    (emergency ? !state.applicationStatus || statusFor(c) === state.applicationStatus :
    (!state.termArea || caseAreas(c).includes(state.termArea)) && (!state.argumentMonth || argDate(c).startsWith(state.argumentMonth))));
  const options = (values, selected, text = v=>v) => values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(text(v))}</option>`).join('');
  const row = c => {
    const issue = caseIssues[c.id]?.text;
    const day = c.decided || (c.proceedings || [])[0]?.date;
    return `<a class="case-register-row" href="#/case/${encodeURIComponent(c.id)}">
      <span class="register-entry"><span class="register-case-name">${esc(c.name)}</span>${issue?`<span class="register-issue">${esc(issue)}</span>`:''}</span>
      <span class="register-meta">${emergency?`<time datetime="${esc(day||'')}">${day?date(day):''}</time>`:''}<span class="register-docket">No. ${esc(displayDocket(c.docket))}</span></span></a>`;

  };
  const sortName = (a,b)=>a.name.localeCompare(b.name);
  let body = '';
  if (!emergency && !allTerms) {
    const grouped = new Map([...sessions.map(s=>s.name), 'Awaiting Scheduling','Other Cases'].map(key=>[key,[]]));
    for (const c of matches) {
      const day = argDate(c);
      const group = sessions.find(s => day && day >= s.start && day <= s.end)?.name || (c.status==='Dismissed'||c.decided?'Other Cases':'Awaiting Scheduling');
      grouped.get(group).push(c);
    }
    for (const [title, entries] of grouped) {
      if (!entries.length) continue;
      entries.sort((a,b)=>argDate(a).localeCompare(argDate(b))||sortName(a,b));
      const session = sessions.find(s=>s.name===title);
      body += `<section class="register-sitting"><header><h2>${esc(title)}</h2>${session?`<small>${shortdate(session.start)} – ${date(session.end)}</small>`:''}</header><div class="case-register">${entries.map(row).join('')}</div></section>`;
    }
  } else if (matches.length) {
    matches.sort(emergency && state.applicationSort!=='name' ? (a,b)=>(b.decided||'').localeCompare(a.decided||'')||sortName(a,b) : sortName);
    body = `<div class="case-register">${matches.map(row).join('')}</div>`;
  }
  const picker=button((scope==='all'?'All Terms':'October Term '+scope)+'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>','term-picker','','term-picker',`aria-expanded="${!!state.termChooserOpen}"${state.termChooserOpen?' aria-controls="term-chooser"':''}`);
  return `<main class="main term-page ${emergency?'emergency-register':''}"><header class="collection-title"><h1>${emergency?'Orders':'Cases'}</h1>${emergency?'<p class="collection-description">Emergency applications</p>':''}</header>
    <div class="register-controls"><input id="case-search" type="search" placeholder="${emergency?'Find an application or docket number':'Find a case or docket number'}" aria-label="Search by name or docket number" value="${esc(state.query)}">
    ${!emergency?`<div class="browse-mode segmented" aria-label="Browse cases">${button('By Term','browse-mode','term',!allTerms?'active':'')}${button('All Cases','browse-mode','all',allTerms?'active':'')}</div>`:''}${emergency?termDropdown(scope,true):''}
    ${emergency?`<select id="application-status" aria-label="Application status"><option value="">All Statuses</option>${options([...new Set(pool.map(statusFor))].sort(),state.applicationStatus)}</select><select id="application-sort" aria-label="Sort applications">${options(['decided','name'],state.applicationSort,k=>k==='name'?'Case Name':'Decision Date')}</select>`:
    `${areas.length?`<select id="term-area" aria-label="Area of law"><option value="">All Areas of Law</option>${options(areas,state.termArea)}</select>`:''}
    ${allTerms?`<select id="argument-month" aria-label="Argument month"><option value="">Any Argument Date</option>${options(months,state.argumentMonth,m=>new Date(m+'-15T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'}))}</select>`:''}`}
    </div>${!emergency&&!allTerms?termChooser(scope,false):''}<div class="register-scroll">${body||'<p class="empty">No cases match these filters.</p>'}</div></main>`;
}
function docRow(d){const amicus=category(d)==='Amicus',name=amicus?amiciName(d):d.title.replace(/\s*VIDED\.?\s*$/i,'').replace(/\s+filed\.?$/i,''),profile=amicus?amicusIdentity(name):null;return `<article class="docrow ${profile?'with-profile':''}"><button class="doc-main" data-action="open" data-value="${esc(d.id)}"><span class="doc-title">${esc(name)}</span><span class="meta">${d.date?'Filed '+date(d.date):''}</span></button>${profile?button('View Profile','entity','amici|'+profile,'amicus-profile'):''}</article>`}

function caseAreas(c) {
  return c.areas?.length ? c.areas : currentAreas[c.id]?.areas || [];
}

function materialGroup(d) {
  if(d.editorCategory)return d.category;
  if (d.opinionType === 'Syllabus') return 'Syllabus';
  const group = category(d);
  if (group === 'Amicus' && d.stage === 'Certiorari') return 'Certiorari';
  if (!d.auxiliary && /^petition for (?:a |an )?writ of certiorari/i.test(d.title)) return 'Certiorari';
  if (/^lower court (?:orders|opinion)/i.test(d.title)) return 'Lower courts';
  return group;
}

function caseTimeline(c) {
  const record = milestones[c.id] || {};
  const petition = c.documents.find(d => /^petition for (?:a |an )?writ of certiorari/i.test(d.title));
  const application = (c.proceedings || []).find(p => /^Application .*submitted to (?:the Chief )?Justice/i.test(p.description));
  const events = isApplication(c)
    ? [['Application Filed', c.applicationFiled || application?.date], ...Object.values(c.priorTermOrders||{}).map(o=>['Order Issued',o.decided]), ['Order Issued', c.decided]]
    : [[record.appealFiled?'Appeal Filed':'Petition Filed', record.petitionFiled || record.appealFiled || petition?.date], [record.grantLabel||'Review Granted', record.granted || c.granted],
       [c.argued ? 'Argued' : 'Argument Scheduled', c.argued || c.scheduledArgument],
       [c.status === 'Dismissed' ? 'Dismissed' : 'Decided', c.decided]];
  const dated = events.filter(([, day]) => day);
  if (!dated.length) return '';
  return `<section class="case-timeline" aria-label="Case Timeline"><h2>Case Timeline</h2><ol>${dated.map(([label, day]) =>
    `<li><span>${esc(label)}</span><time datetime="${esc(day)}">${date(day)}</time></li>`).join('')}</ol></section>`;
}

function caseRelationships(related,display){const consolidated=related.filter(id=>display.consolidation?.dockets?.includes(id)),other=related.filter(id=>!consolidated.includes(id));return `${consolidated.length?`<div class="companion-line">Consolidated with ${consolidated.map(id=>caseLink(caseMap.get(id))).join('')} ${external(display.consolidation.sourceUrl,'Consolidation order')}</div>`:''}${other.length?`<div class="companion-line">Related ${other.length===1?'Case':'Cases'} ${other.map(id=>caseLink(caseMap.get(id))).join('')}</div>`:''}`}

function casePage() {
  const c = getCase(), emergency = isApplication(c), display = caseDisplay[c.id] || {};
  const all = caseDocuments(c).filter(d => !d.auxiliary || materialGroup(d) === 'Lower courts');
  const sections = emergency
    ? [['Decision','Orders & Opinions'],['Application','Application & Responses'],['Amicus','Amicus Briefs'],['Lower courts','Lower Court'],['Appendices','Appendix'],['Other','Other documents']]
    : [['Decision','Opinion'],['Argument','Oral Argument'],['Certiorari','Certiorari'],['Merits','Merits Briefs'],['Amicus','Amicus Briefs'],['Appendices','Appendix'],['Lower courts','Lower Court'],['Other','Other documents']];
  const sectionDocs = key => all.filter(d => key === 'Application'
    ? ['Merits','Certiorari'].includes(materialGroup(d)) || (materialGroup(d) === 'Other' && /^(application|response|reply)/i.test(d.title))
    : materialGroup(d) === key);
  const unavailable = key => (c.unavailableFilings||[]).filter(f=>f.category===key);
  const available = sections.filter(([id]) => sectionDocs(id).length || unavailable(id).length || (id === 'Argument' && c.audio?.url));
  const section = available.some(([id]) => id === state.caseSection) ? state.caseSection : available[0]?.[0];
  const material = sectionDocs(section);
  const syllabus = all.find(d => materialGroup(d) === 'Syllabus');
  const vote = verifiedVotes[c.id]?.label || c.decision?.vote;
  const subtitle = display.beneficiaryText || (!c.decided && c.granted && !c.argued && !c.scheduledArgument ? date(c.granted) : outcomeExplanation(c));
  const disposition=(display.outcomeLabel || outcomeLabel(c)).split(/\s*\(opinion also for/i)[0];
  const decided = !!c.decided && !emergency && c.status!=='Dismissed';
  const holding = c.decision?.holding || c.officialSummary;
  const areas = caseAreas(c);
  const related = (c.relatedDockets || []).filter(id => caseMap.has(id));
  return `<main class="main case-page case-desktop"><header class="case-hero"><div class="breadcrumb">${button(emergency?'Orders':'October Term '+c.term,emergency?'route':'browse-term',emergency?'applications':String(c.term))}<span class="breadcrumb-separator">/</span><span>No. ${esc(displayDocket(c.docket))}</span></div>
    <div class="row between"><h1>${esc(c.name)}</h1>${button(icon(state.saved.includes(c.id)?'check':'save')+'Save','save',c.id,'outline')}</div>${caseRelationships(related,display)}${signedIn()?button('Edit case','edit-case',c.id,'outline'):''}</header>
    <div class="case-canvas"><aside class="case-summary-scroll" data-case="${esc(c.id)}">
      <section class="outcome-card"><h2>${decided?'Decided':esc(titleCaseLabel(disposition))}</h2><p class="outcome-subtitle">${decided&&disposition!=='Decided'?esc(disposition)+' · ':''}${esc(subtitle)}</p>
      ${holding?`<p class="holding">${esc(holding)}</p>`:''}
      ${votePortraits(c)}${vote||syllabus?`<div class="outcome-foot">${vote?`<span>Court vote <strong>${esc(vote)}</strong></span>`:''}${syllabus?button('Read Syllabus','open',syllabus.id):''}</div>`:''}</section>
      ${!emergency && (c.question || display.questions?.length)?`<section class="question-card"><h2>Questions Presented</h2>${caseQuestions(c)}</section>`:''}
      <section class="connections-card">${areas.length?`<h3>Areas of Law</h3><div class="entity-links">${areas.map(a=>entityButton('areas',a)).join('')}</div>`:''}
      ${c.advocates?.length?`<h3>Advocates</h3>${c.advocates.map(a=>`<div class="advocate-link">${entityButton('advocates',a.name)}<span>${esc(advocateRole(a.role))}</span></div>`).join('')}`:''}
      ${c.courtBelow?`<h3>From the Lower Court</h3><p>${esc(c.courtBelow)}</p>`:''}

      <div class="source-links">${external(c.sourceUrl,'Official Docket')}${c.audio?.url?external(c.audio.url,'Argument Recording'):''}</div></section></aside>
      <div class="case-workbench">${caseTimeline(c)}
      ${available.length?`<section class="case-materials"><div class="material-top"><h2>Case Materials</h2></div><nav class="document-sections" aria-label="Case materials" tabindex="0">${available.map(([id,title])=>button(title,'case-section',id,section===id?'active':'',`aria-pressed="${section===id}"`)).join('')}</nav>
      <div class="material-scroll">${section==='Decision'?opinionsView(c,material):section==='Argument'?argumentView(c,material):`<div class="document-shelf">${material.map(docRow).join('')}${unavailable(section).map(f=>`<article class="docrow paper-filing"><span class="doc-title">${esc(f.title)}</span><span class="meta">${date(f.date)} · ${esc(f.availability)}</span></article>`).join('')}</div>`}</div></section>`:''}</div></div></main>`;
}


// Keep the narrow-screen reading and keyboard order meaningful, rather than
// stacking the complete desktop sidebar ahead of the documents.
function arrangeCaseCards() {
  const canvas = document.querySelector('.case-canvas');
  if (!canvas) return;
  const active = document.activeElement;
  const focusedCardControl = active && canvas.contains(active) && active.closest('.outcome-card, .question-card, .case-materials, .case-timeline, .connections-card') ? active : null;
  const summary = canvas.querySelector('.case-summary-scroll');
  const workbench = canvas.querySelector('.case-workbench');
  const narrow = window.matchMedia('(max-width: 860px)').matches;
  const groups = narrow
    ? [[canvas, ['outcome-card', 'question-card', 'case-materials', 'case-timeline', 'connections-card']]]
    : [[summary, ['outcome-card', 'question-card', 'connections-card']], [workbench, ['case-timeline', 'case-materials']]];
  for (const [parent, classes] of groups) {
    for (const name of classes) {
      const card = canvas.querySelector('.' + name);
      if (card && card.parentElement !== parent) parent.append(card);
    }
  }
  if (focusedCardControl?.isConnected && document.activeElement !== focusedCardControl) {
    focusedCardControl.focus({preventScroll: true});
  }
}
window.matchMedia('(max-width: 860px)').addEventListener('change', arrangeCaseCards);


let caseDisplay={},currentTerm={},currentTextIndex={},caseIssues={},courtPhoto={},collectionPhoto={};
let verifiedVotes={},milestones={},recordSupplement={},currentAreas={},termBenches={};
const splitParents = new Map();
function isApplication(c){return /\d{2}A-?\d+/i.test(c?.docket||'')}
function advocateRole(role){const r=String(role||'').trim();return !r?'':/^for\b/i.test(r)?r[0].toUpperCase()+r.slice(1):'For '+r.replace(/^on behalf of\s+/i,'').replace(/^the\s+/i,'the ')}
function validCitation(c){const value=caseDisplay[c.id]?.reporterCitation||c.citation||caseMap.get(c.sharedDecisionFrom)?.citation;return /^\d+\s+U\.?\s*S\.?\s+\d+$/.test(value||'')?value:''}
function outcomeLabel(c){if(c.result)return titleCaseLabel(c.result.toLowerCase());const h=c.decision?.holding||c.officialSummary||'';if(isApplication(c)&&/grants? .*application|application .*granted/i.test(h))return 'Application Granted';if(isApplication(c)&&/denies|denied/i.test(h))return 'Application Denied';return c.status==='Dismissed'?'Dismissed':c.decided?'Decided':c.argued?'Awaiting Decision':c.scheduledArgument?'Argument Scheduled':c.granted?'Review Granted':'Pending'}
function outcomeExplanation(c){if(!c.argued&&!c.decided&&c.scheduledArgument)return date(c.scheduledArgument);if(!c.decided&&c.argued)return 'Argued '+date(c.argued);const r=(c.result||'').toLowerCase();if(r.includes('remand'))return 'Returned to the lower court for further proceedings';if(r.includes('affirm'))return 'The lower court’s judgment stands';if(r.includes('revers'))return 'The lower court’s judgment is reversed';if(r.includes('dismiss'))return 'The proceeding has been dismissed';return isApplication(c)?'':c.decided?'Judgment of the Court':'Before the U.S. Supreme Court'}
function caseQuestions(c){const q=caseDisplay[c.id]?.questions||[];if(q.length){const idx=Math.min(state.qpIndex||0,q.length-1),item=q[idx];return `${q.length>1?`<div class="qp-tabs">${q.map((x,i)=>button((x.label||x.partyRole)+(q.filter(y=>y.label===x.label).length>1&&x.partyName?' · '+x.partyName:''),'qp',String(i),i===idx?'active':'')).join('')}</div>`:''}<div class="qp-versions">${q.map((entry,i)=>`<div class="qp-text" ${i===idx?'':'inert aria-hidden="true"'}>${esc(entry.text)}</div>`).join('')}</div>`};return c.question?questionHTML(c.question):'<p class="small muted">The question is stated in the filed petition.</p>'}
function opinionJoiners(c,o){const names=[...(o.joinedBy||[])];if(o.joiningScope&&!/Court/i.test(o.type)){for(const n of justiceNames()){const surname=n.replace(', Jr.','').split(' ').at(-1);if(n!==o.author&&new RegExp('Justice '+surname+'\\b').test(o.sourceExcerpt||'')&&!names.includes(n))names.push(n)}}if(/unanimous/i.test(c.decision?.compositionText||'')&&/Court/i.test(o.type))return justiceNames().filter(n=>n!==o.author&&participation(c,n).length);return names}
function opinionCard(c,o,featured=false){const filed=ds(o.documentId),d=filed?.opinionType?filed:(opinionSections[c.id]||[]).find(d=>d.opinionAuthor===o.author&&d.opinionType===o.type)||filed,unsigned=/per curiam/i.test(o.author||o.type),title=d?.editorTitle?d.title:unsigned?'Per Curiam Opinion':titleCaseLabel(o.type);return `<article class="opinion-tile ${featured?'featured-opinion':''}" data-action="open" data-value="${esc(d?.id||'')}"><button class="opinion-open" data-action="open" data-value="${esc(d?.id||'')}"><span class="opinion-heading"><strong>${esc(title)}</strong><span class="opinion-byline">${!unsigned&&profiles[o.author]?portrait(o.author,'opinion-portrait'):''}<span>${unsigned?'':esc(o.author||'The Court')}</span></span></span><span class="opinion-open-indicator" aria-hidden="true">${icon('arrow')}</span></button>${opinionJoiners(c,o).length?`<div class="joined-line"><span>Joined by</span>${opinionJoiners(c,o).map(n=>`<span>${entityButton('justices',n)}${joiningNote(o,n)}</span>`).join('')}</div>`:''}</article>`}

function opinionsView(c,material){
 const sections=material.filter(d=>d.opinionType && d.opinionType!=='Syllabus');
 const ops=c.decision?.opinions||[];
 if(sections.length)return '<div class="opinion-presentation">'+sections.map((d,i)=>{
   const original=ops.find(o=>o.type===d.opinionType && o.author===d.opinionAuthor);
   return opinionCard(c,{...original,type:d.opinionType,author:d.opinionAuthor,documentId:d.id},i===0);
 }).join('')+material.filter(d=>!d.opinionType).map(docRow).join('')+'</div>';
 return '<div class="opinion-presentation">'+material.filter(d=>d.opinionType!=='Syllabus').map(docRow).join('')+'</div>';
}
function argumentView(c,material){const day=c.argued||c.scheduledArgument,advocates=(c.advocates||[]).filter(a=>a.name);return `<section class="argument-session" aria-label="Oral argument"><header class="argument-heading"><h3>Oral argument</h3>${day?`<p>${c.argued?'Argued':'Scheduled for'} <time datetime="${esc(day)}">${date(day)}</time></p>`:''}</header><div class="argument-actions">${c.audio?.url?button(icon('play')+'Listen','listen',c.id,'primary','aria-label="Listen to oral argument"'):''}${material.map((d,i)=>button(icon('file')+(material.length>1?'Transcript '+(i+1):'Read transcript'),'open',d.id,'outline')).join('')}</div>${advocates.length?`<section class="argument-advocates" aria-label="Advocates"><h4>${c.argued?'Argued by':'Advocates'}</h4>${advocates.map(a=>`<article>${personImage(a.name,'directory-portrait')}<div>${entityButton('advocates',a.name)}${a.role?`<p>${esc(advocateRole(a.role))}</p>`:''}</div></article>`).join('')}</section>`:''}</section>`}
function siteFooter(){return ''}
function hydrateSyllabi(){document.querySelectorAll('[data-syllabus]').forEach(el=>el.addEventListener('toggle',async()=>{if(!el.open||el.dataset.loaded)return;el.dataset.loaded='true';const id=el.dataset.syllabus,data=await ensureDoc(id),range=ds(id).sourceRange;if(data){const text=data.pages.map((p,i)=>{if(i<range.startPage||i>range.endPage)return '';return readingText(p.text,id,i,data,i===range.startPage?range.startOffset:0,i===range.endPage?range.endOffset:p.text.length).text}).filter(Boolean).join(' ');el.querySelector('.syllabus-content').textContent=text}}))}

function recentRow(id){const d=ds(id);if(!d)return '';const c=contextCase(id),w=state.workspaces[c?.id];return button(`<span class="recent-case-title">${esc(c?.name||d.caseId)}</span><span class="recent-document">${esc(tabLabel(d))}</span>`,w?.tabs?.length?'workspace':'open',w?.tabs?.length?c.id:id,'recent recent-case')}
function recentCases(){const seen=new Set();return state.recents.filter(id=>{const c=contextCase(id)?.id;if(!c||seen.has(c))return false;seen.add(c);return true})}
function displayDocket(d){return String(d).replace(/^(\d{2}[AO])(\d+)$/,'$1-$2')}

function libraryPage(){if(!signedIn())return `<main class="main library-page"><h1>My Library</h1><p>Sign in to save cases and keep your notes and reading progress across devices.</p>${button('Sign In / Create Account','account-signin','','outline')}</main>`;if(!account.ready)return `<main class="main library-page"><h1>My Library</h1><p>Loading your library…</p></main>`;const ns=state.notes.filter(meaningfulNote);return `<main class="main library-page"><header class="collection-title library-title"><h1>My Library</h1><details class="library-actions"><summary>Options</summary><div>${button(icon('download')+'Export Annotations','export','','outline')}${button('About Saved Data','library-storage','','listbutton')}</div></details></header><div class="library-grid"><section class="library-reading"><div class="library-section"><h2>Saved Cases</h2>${state.saved.length?state.saved.map(id=>caseMap.get(id)).filter(Boolean).map(c=>`<div class="recent row between"><div>${caseLink(c)}<div class="tiny muted">No. ${esc(displayDocket(c.docket))}</div></div>${button(icon('close'),'save',c.id,'',`aria-label="Unsave ${esc(c.name)}"`)}</div>`).join(''):'<p class="empty">Cases you save appear here.</p>'}</div><div class="library-section"><h2>Recent Reading</h2>${recentCases().map(recentRow).join('')||'<p class="empty">Your recent reading appears here.</p>'}</div></section><section class="library-section"><h2>Highlights & Comments</h2>${ns.length?ns.slice().reverse().map(n=>noteCard(n,true)).join(''):'<p class="empty">Select a passage in the reader to highlight it or add a comment.</p>'}</section></div></main>`}
function sourcesPage(){const unavailable=cases.flatMap(c=>(c.unavailableFilings||[]).map(f=>({...f,caseId:c.id,caseName:c.name}))),years=[...new Set(cases.map(c=>c.term))].sort(),sources=[...(catalog.sources||[]),...(currentTerm.sources||[])],uniqueSources=[...new Map(sources.map(s=>[typeof s==='string'?s:s.url||s.sourceUrl,s])).values()];return `<main class="main"><div class="page-title"><span class="caps">Primary sources</span><h1>Sources & coverage</h1><p class="lede">Browse the available Supreme Court record for October Terms ${years.map(esc).join(' and ')}. The collection is updated from official dockets, but it is not a guarantee that every filing is present.</p>${metrics()}</div><div class="notice">Counts are by docket and indexed document. Consolidated matters may appear separately. Reader documents have extracted text; some scanned filings and fixed-layout forms open as the original PDF.</div><div class="source-list">${uniqueSources.map(s=>`<div class="source-card"><h3>${esc(typeof s==='string'?s:s.title||s.name||'Source')}</h3>${external(typeof s==='string'?s:s.url||s.sourceUrl,'Open source')}<p>${esc(typeof s==='string'?'':s.description||'')}</p></div>`).join('')}</div><div class="section-title"><h2>Known limits</h2></div><div class="source-card"><p>${unavailable.length?`${unavailable.length} filings are currently marked unavailable in the collection. Their case pages show the available information.`:'No filings are currently marked unavailable. This does not establish that every docket entry has been collected.'}</p><p>Administrative entries, alternate copies, and supporting attachments may not all be indexed. The official docket is the authoritative source for the complete record and recent updates.</p><p>Extracted text may contain errors, especially in scans, tables, and forms. Compare the original PDF when the wording or layout matters. Printed page labels may differ from source PDF page numbers.</p><p>Highlights and comments belong to the selected source text. Citation previews cover references resolved to material in this collection; other citations provide a source lookup.</p></div></main>`}
function meaningfulNote(n){return !!(n.quote?.trim()||n.comment?.trim()||n.anchors?.length||n.pdfRects?.length)}
function noteCard(n,inLibrary=false){const d=ds(n.docId),c=contextCase(n.docId);if(!meaningfulNote(n))return '';if(inLibrary)return `<article class="library-annotation"><button data-action="goto-note" data-value="${n.id}"><span class="annotation-context"><strong>${esc(c?.name||'Case')}</strong><small>${esc(tabLabel(d))}</small></span>${n.quote?`<blockquote>${esc(n.quote)}</blockquote>`:''}${n.comment?`<p>${esc(n.comment)}</p>`:''}<span class="annotation-open">Open in Reader ${icon('arrow')}</span></button></article>`;return `<article class="note-card ${n.color||'yellow'}" data-note-card="${n.id}"><div class="row between"><strong>${n.comment?'Comment':'Highlight'}</strong>${button(icon('trash'),'delete-note',n.id,'danger',`aria-label="Delete annotation"`)}</div>${n.quote?`<blockquote class="quote">${esc(n.quote)}</blockquote>`:''}<label class="note-comment-label">Comment<textarea data-note-edit="${n.id}" aria-label="Comment on selected passage" placeholder="Write a comment…">${esc(n.comment||'')}</textarea></label><div class="note-color-row"><span>Highlight Color</span><div class="colors">${['yellow','blue','pink','mint'].map(col=>button('','note-color',n.id+':'+col,'swatch '+col+(n.color===col?' active':''),`aria-label="${col} highlight" aria-pressed="${n.color===col}"`)).join('')}</div></div><div class="note-footer"><span class="note-save-state">Saved</span>${button('Show Passage','goto-note',n.id)}</div></article>`}
const tools=[['info','info','Case'],['docs','files','Documents'],['contents','list','Contents'],['notes','note','Notes'],['refs','book','Authorities']];
function sidebar(){const title=tools.find(t=>t[0]===state.tool)?.[2]||'Explorer';return `<aside class="sidebar"><div class="sidebar-head"><strong>${title}<small class="sidebar-document-label">${esc(tabLabel(ds(state.active)))}</small></strong>${button(icon('close'),'close-side','','',`aria-label="Close explorer"`)}</div><div class="sidebar-scroll">${sidebarContent()}</div></aside>`}

let readerTabObserver;
let readerReturnLocation = '';
const browsePositions = new Map();
function rememberBrowsePosition() {
  const main = app.querySelector('main[data-browse-key]');
  if (!main) return;
  const top = selector => main.querySelector(selector)?.scrollTop || 0;
  browsePositions.set(main.dataset.browseKey, {main:main.scrollTop, summary:top('.case-summary-scroll'),
    bench:top('.case-workbench'), materials:top('.material-scroll'), section:main.dataset.section});
}
function restoreBrowsePosition() {
  const main = app.querySelector('main');
  if (!main) return;
  const key = state.route==='case' ? 'case/'+state.caseId : locationKey();
  main.dataset.browseKey = key;
  main.dataset.section = state.caseSection || '';
  const position = browsePositions.get(key);
  if (!position) return;
  main.scrollTop = position.main;
  for (const [selector,top] of [['.case-summary-scroll',position.summary],['.case-workbench',position.bench],
    ['.material-scroll',position.section===main.dataset.section ? position.materials : 0]]) {
    const panel = main.querySelector(selector);
    if (panel) panel.scrollTop = top;
  }
}

function tabs(ids=state.tabs) {
  const items = ids.map(id => {
    const doc = ds(id);
    const title = esc(documentLabel(doc));
    return `<div class="tab ${state.active === id ? 'selected' : ''} ${state.split === id ? 'in-split' : ''}" draggable="true" data-tab-id="${esc(id)}">
      <button role="tab" aria-selected="${state.active === id}" aria-controls="reader-panes" data-action="activate" data-value="${esc(id)}" title="${title}">${esc(tabLabel(doc))}</button>
      <button class="tab-menu-button" data-action="tab-menu" data-value="${esc(id)}" aria-label="Options for ${title}">⋯</button>
      <button class="close" data-action="close-tab" data-value="${esc(id)}" aria-label="Close ${title}">${icon('close')}</button>
    </div>`;
  }).join('');
  return `<div class="tabbar" role="tablist" aria-label="Open documents">${items}<button hidden class="tab-overflow" data-action="all-tabs" aria-haspopup="dialog">All Tabs</button></div>`;
}

// Keep the active document visible, including when opening the explorer reduces the available width.
function fitReaderTabs(bar) {
  const tabs = [...bar.querySelectorAll('[data-tab-id]')];
  const menu = bar.querySelector('.tab-overflow');
  const room = bar.clientWidth;
  const minWidth = 108;
  menu.hidden = tabs.length * minWidth <= room || tabs.length < 2;
  const available = menu.hidden ? tabs.length : Math.max(1, Math.floor((room - menu.offsetWidth - 8) / minWidth));
  const priority = [...new Set([state.active, state.split, ...tabs.map(t=>t.dataset.tabId)].filter(id=>tabs.some(t=>t.dataset.tabId===id)))];
  const visible = new Set(priority.slice(0, available));
  for (const tab of tabs) tab.hidden = !visible.has(tab.dataset.tabId);
}

function bindReaderTabs(){readerTabObserver?.disconnect();const bars=[...app.querySelectorAll('.tabbar')];readerTabObserver=new ResizeObserver(entries=>entries.forEach(e=>{if(e.target.clientWidth)fitReaderTabs(e.target)}));for(const bar of bars){if(bar.clientWidth)fitReaderTabs(bar);readerTabObserver.observe(bar)}}

function showReaderTabList(trigger) {
  const list = state.tabs.map(id => button(
    esc(tabLabel(ds(id))), 'activate', id, 'listbutton',
    state.active === id ? 'aria-current="page"' : ''
  )).join('');
  const menu = mountMenu(trigger, list, 'reader-tab-list');
  if (!menu) return;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Open documents');
  menu.querySelector('[aria-current]')?.focus();
}

function rememberReaderReturn() {
  if (state.route !== 'reader' && location.hash && !location.hash.startsWith('#/reader')) {
    readerReturnLocation = location.hash;
  }
}

function minimizeReader() {
  if (!readerReturnLocation) {
    state.caseSection = 'Decision';
    route('case');
    return;
  }
  storePositions();
  saveWorkspace();
  history.pushState(null, '', readerReturnLocation);
  readLocation();
  render();
}

function readerPage(){const d=ds(state.active),c=contextCase(d?.id);return `<section class="reader-shell"><div class="reader-top"><div class="reader-heading"><div class="reader-case">${esc(c?.name||'Reading workspace')}<small>No. ${esc(displayDocket(c?.docket||''))}</small></div></div><div class="reader-controls"><div id="reader-playback">${playbackControls()}</div>${button(icon('view')+'View','reader-menu','view')}${button(icon('minimize'),'workspace-minimize','','reader-minimize','aria-label="Minimize reader and return to case"')}</div></div><div class="workspace"><nav class="rail" aria-label="Explorer tools">${tools.map(([id,ic,label])=>button(icon(ic)+`<span>${label}</span>`,'tool',id,state.side&&state.tool===id?'active':'',`aria-label="${label}" title="${label}"`)).join('')}</nav>${state.side?sidebar():''}<div class="work-main">${tabs()}<div class="panes ${state.split?'split':''}" id="reader-panes" role="tabpanel">${state.active?pane(state.split&&state.paneOrder?.includes(state.active)?state.paneOrder[0]:state.active,false):`<div class="reader-empty"><h2>Open a Document</h2>${button('Browse Case Documents','tool','docs','outline')}</div>`}${state.split?pane(state.paneOrder?.includes(state.split)?state.paneOrder[1]:state.split,true):''}</div></div></div></section>`}

function pane(id,second){const d=ds(id),data=docCache.get(id);if(!d)return '';const pdf=state.pdfDocs?.includes(id)||!d.textPath&&!d.timedSession;return `<section class="pane ${state.active===id?'is-focused':''} ${second?'secondary-pane':''}" data-pane="${esc(id)}">${state.split?`<div class="pane-tabs">${tabs(second?[id]:state.tabs.filter(t=>t!==(state.paneOrder?.[1]||state.split)))}</div>`:''}<div class="doc-scroll ${pdf?'pdf-scroll':''}" data-doc="${esc(id)}">${pdf?'<div class="loading">Opening PDF…</div>':data?documentHTML(id,data):'<div class="loading">Opening document…</div>'}</div><div class="drop-zone">Open Side by Side</div></section>`}

function audioDock(){const timed=audioCase?currentTimedDoc():null;return audioCase?`<div class="audio-dock">${button(icon(audio.paused?'play':'pause'),'audio-toggle','','',`aria-label="${audio.paused?'Play':'Pause'} argument"`)}<div class="audio-speaker-portrait" id="audio-speaker-portrait"></div><div class="audio-identity"><span class="audio-title">${esc(caseMap.get(audioCase)?.name||'Oral argument')}</span><small id="current-speaker"></small></div><span id="audio-time">${time(audio.currentTime)}</span><input id="audio-seek" type="range" min="0" max="${Number.isFinite(audio.duration)?audio.duration:100}" value="${audio.currentTime}" aria-label="Argument position"><select id="audio-speed" aria-label="Playback speed">${[.75,1,1.25,1.5,2].map(v=>`<option value="${v}" ${audio.playbackRate===v?'selected':''}>${v}×</option>`).join('')}</select>${timed?button('Transcript','open',timed.id)+button(followTranscript?'Following':'Follow','follow-transcript','',followTranscript?'active':''):''}${button(icon('close'),'audio-close','','',`aria-label="Close audio"`)}</div>`:''}

function time(s){return Math.floor((s||0)/60)+':'+String(Math.floor((s||0)%60)).padStart(2,'0')}
// This fixed-layout judgment has verified garbled extraction. Preserve its filed layout by default.
const pdfFirstDocuments=new Set(['25-5343-97e702fdb59d--lower-8-14']);
function rememberDocumentFormat(id,pdf){state.readingOverrides=(state.readingOverrides||[]).filter(x=>x!==id);if(!pdf)state.readingOverrides.push(id)}
function render(){
 for(const id of [state.active,state.split])if((pdfFirstDocuments.has(id)||ds(id)?.pdfPreferred)&&!state.readingOverrides?.includes(id))state.pdfDocs=[...new Set([...(state.pdfDocs||[]),id])];
 if(state.active===state.split)state.split=null;
 if(state.split&&(!state.paneOrder||!state.paneOrder.includes(state.active)||!state.paneOrder.includes(state.split)))state.paneOrder=[state.active,state.split];
 rememberBrowsePosition();storePositions();saveWorkspace();renderGeneration++;clearTransient();if(['view','audio'].includes(state.tool))state.tool='info';if(state.route==='term')state.route='cases';
 document.body.classList.toggle('reader-mode',state.route==='reader'); document.body.dataset.page=state.route;
 const content=state.route==='home'?homePage():state.route==='about'?aboutPage():state.route==='reader'?readerPage():state.route==='case'?casePage():state.route==='library'?libraryPage():state.route==='sources'?sourcesPage():['areas','justices','advocates','amici','profile'].includes(state.route)?peoplePage():casesPage();
 app.innerHTML=header()+content+siteFooter()+workspaceDock();arrangeCaseCards();lastSpokenKey=null;formatHeadings();hydrateSyllabi();bindReaderTabs();restoreBrowsePosition();if(state.route==='reader'&&state.side&&state.tool==='refs'){refreshSidebar();hydrateReference(state.refs.find(r=>r.key===state.ref))}

 restorePositions();bindScroll();scheduleMargins();if(audioCase&&!narration)updateTranscript();if(state.route==='reader'){loadExtendedAuthorities();for(const id of [state.active,state.split].filter(Boolean)){ensureDoc(id);if(state.pdfDocs?.includes(id)||!ds(id)?.textPath&&!ds(id)?.timedSession)renderPDF(id)}}persist();syncLocation();
}
function bindScroll(){document.querySelectorAll('.doc-scroll').forEach(el=>el.addEventListener('scroll',()=>{if(el.dataset.nativePDF)return;state.positions[positionKey(el)]=capturePosition(el);clearPeek();closeReaderMenu();positionSelection();const input=app.querySelector(`[data-page-input="${CSS.escape(el.dataset.doc)}"]`);if(input&&document.activeElement!==input)input.value=Number(state.positions[positionKey(el)].page)+1;clearTimeout(el._save);el._save=setTimeout(persist,400)},{passive:true}))}
async function sourceJSON(path) {
 const packed=document.documentElement.dataset.packedText==='true' &&
   (/^data\/(?:docs|current-docs|statutes)\/.+\.json$/.test(path) || ['data/reading-layout.json','data/catalog.json','data/current-term.json','data/argument-alignment.json','data/reader-structure.json','data/brief-precedent-summaries.json','data/precedent-index.json','data/statute-index.json','data/cited-opinions.json','data/rules-index.json'].includes(path));
 const response=await fetchContent(packed?path+'.gz':path);
 if(!response.ok) throw Error('Source request '+response.status);
 if(!packed) return response.json();
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes[0]===31 && bytes[1]===139) {
   return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }
 return JSON.parse(new TextDecoder().decode(bytes));
}
async function ensureDoc(id){
 const d=ds(id);if(d?.editorContent){if(!docCache.get(id)?.edited||docCache.get(id)?.revision!==d.editorContent.revision)docCache.set(id,compileDocument(d.editorContent));return docCache.get(id)}if(docCache.has(id))return docCache.get(id);if(d?.timedSession){const data={pages:d.timedSession.turns.map((t,i)=>({number:i+1,text:t.text}))};docCache.set(id,data);return data}if(!d?.textPath)return;if(docPending.has(id))return docPending.get(id);
 const p=Promise.resolve().then(async()=>{try{
 let data;if(d.referenceSummary && d.textPath==='inline'){const entry=d.referenceSummary;data={pages:[{number:1,text:await authorityBody(entry)}]}}else if(d.parentDocumentId && !d.independentText)data=await ensureDoc(d.parentDocumentId);else{let path=d.textPath.replace(/^\.\//,'');if(!path.startsWith('data/'))path='data/'+path;data=await sourceJSON(path);if(!Array.isArray(data.pages))throw Error('No pages');data.pages=data.pages.map((p,i)=>typeof p==='string'?{number:i+1,text:p}:{...p,text:String(p.text||'')})}if(!data)throw Error('Document not loaded');if(ds(id)!==d){if(docPending.get(id)===p)docPending.delete(id);return ensureDoc(id);}docCache.set(id,data);
 if(state.route==='reader'){const target=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"]`);if(target&&!state.pdfDocs?.includes(id)){target.innerHTML=documentHTML(id,data);restorePositions();scheduleMargins()}if(state.side&&['contents','refs'].includes(state.tool))refreshSidebar()}
 return data;
 }catch(e){if(ds(id)!==d){if(docPending.get(id)===p)docPending.delete(id);return ensureDoc(id);}const target=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"]`);if(target)target.innerHTML=`<div class="reader-empty"><h2>Unable to open text</h2>${button('Try Again','retry-document',id,'outline')}${d.pdfPath?button('Open PDF','pdf-toggle',id,'outline'):filedPDF(d)?button('Open PDF','pdf-toggle',id,'outline'):d.sourceUrl?external(d.sourceUrl,'Open Source'):''}</div>`;console.warn('Document load failed',id,e.message);return null}finally{if(docPending.get(id)===p)docPending.delete(id)}});docPending.set(id,p);return p;
}
function hasSourceText(data,range){return (data?.pages||[]).some((p,i)=>{if(range&&(i<range.startPage||i>range.endPage))return false;const start=range&&i===range.startPage?range.startOffset:0,end=range&&i===range.endPage?range.endOffset:p.text.length;return !!p.text.slice(start,end).trim()})}
function pageJoin(previous,current,begins){const citationContinuation=/[,–-]\s*$/.test(previous)&&/^(?:n\.\s*\d|\d+(?:[–-]\d+)?(?:\s*\(\d{4}\)|[,;]))/.test(current);return previous?(begins&&!citationContinuation?'\n\n':' '):''}
function documentHTML(id,data){const d=ds(id);if(!hasSourceText(data,d.sourceRange))return `<div class="reader-empty"><h2>Reading text unavailable</h2><p>This document has no extracted text in this section. Open the original PDF to read it.</p>${d.pdfPath||filedPDF(d)?button('Open PDF','pdf-toggle',id,'outline'):d.sourceUrl?external(d.sourceUrl,'Open Source'):''}</div>`;if(d.timedSession)return transcriptHTML(id,data);if(category(d)==='Argument'&&!d.editorContent)return untimedTranscriptHTML(id,data);const range=d.sourceRange;let previous='';return `<article class="document-body ${state.pageMarkers?'show-page-markers':''} ${state.marginNotes?'show-margin-notes':''}" data-document="${esc(id)}"><header class="document-title"><h1>${esc(documentLabel(d))}</h1>${d.opinionAuthor?`<p>${esc(d.opinionAuthor)}</p>`:''}${d.referenceSummary?`<p>${esc([d.citation,d.referenceSummary.year,d.referenceSummary.edition,d.referenceSummary.excerptLabel].filter(Boolean).join(' · '))} ${external(d.sourceUrl,d.referenceSummary.kind==='case'?'Case Source':'Official Text')}</p>`:''}</header>${data.pages.map((p,i)=>{if(range&&(i<range.startPage||i>range.endPage||(i===range.endPage&&!range.endOffset)))return '';const start=range&&i===range.startPage?range.startOffset:0,end=range&&i===range.endPage?range.endOffset:p.text.length;const text=readingText(p.text,id,i,data,start,end);if(!text.text.trim())return '';const layout=layoutPage(id,i),begins=layout?.paragraphStarts?.some(n=>n>=start&&n<=text.map[0]+2);const gap=pageJoin(previous,text.text,begins);previous=text.text;return `${gap}<span class="source-page" data-page="${i}"><span class="page-marker" data-marker-page="${i}" aria-hidden="true">${esc(p.label||p.number||i+1)}</span><span class="page-text" data-text-doc="${esc(id)}" data-page="${i}">${renderText(text.text,id,i,text.map)}</span></span>`}).join('')}${footnotesHTML(id,data)}<aside class="document-margin" aria-label="Notes and references"></aside></article>`}

const refsIndex=new Map(), authoritiesByCitation=new Map(), referenceDocs=new Map(), caseByCitation=new Map();
let authorityLoad;
const statuteTitles=new Map();
async function authorityBody(entry) {
  if(!entry.bodyPath) {
    if(entry.text||entry.summary||entry.excerpt) return entry.summary||entry.text||entry.excerpt;
    if(entry.subjects?.length) return 'Subject headings\n\n'+entry.subjects.join(' · ');
    return '';
  }
  if(!statuteTitles.has(entry.bodyPath)) statuteTitles.set(entry.bodyPath,sourceJSON(entry.bodyPath).catch(error=>{statuteTitles.delete(entry.bodyPath);throw error}));
  const sections=await statuteTitles.get(entry.bodyPath);
  const text=sections[entry.citation];
  if(!text?.trim()) throw Error('Section text unavailable');
  return text;
}

function citationRanges(text,id,page,map) {
 if(ds(id)?.editorContent)return (docCache.get(id)?.pages[page]?.citations||[]).map(hit=>{const ref={...hit.ref,key:[id,page,hit.start,hit.ref.id].join('|'),fromDoc:id,page,offset:hit.start,passage:passageAround(text,hit.start,hit.end)};refsIndex.set(ref.key,ref);return {...hit,ref}});
  const c=contextCase(id);
  return citationsIn(text,c?.id==='24-440'||/Federal Rules? of Civil Procedure|Fed\. R\. Civ\. P/i.test(text),c?.id==='24-440',(v,r,n)=>shortCaseIn(docCache.get(id),v,r,n)).map(hit=>{
    const key=[hit.type,id,page,map?.[hit.start]??hit.start,hit.label].join('|');
    const ref={key,label:hit.label,type:hit.type,canonical:hit.canonical,fromDoc:id,caseName:hit.caseName,page,offset:map?.[hit.start]??displayMaps.get(id+':'+page)?.[hit.start]??hit.start,
      passage:passageAround(text,hit.start,hit.end)};
    ref.number=referenceNumber(id,ref.canonical||ref.label);refsIndex.set(key,ref);
    return {...hit,ref};
  });
}
function authorityIdentity(citation) {
  const usc=citation.match(/^(\d+)\s*U\.?\s*S\.?\s*C\.?\s*§\s*(.+)$/i);
  return usc?usc[1]+'usc§'+usc[2].replace(/\s+/g,''):authorityKey(citation);
}
function registerAuthority(entry,citation) {
  const key=authorityIdentity(citation);
  const existing=authoritiesByCitation.get(key);
  if(existing) {
    if (entry.kind==='rule') {
      Object.assign(existing,entry,{excerptLabel:'Rule text'});
      const old=docs.get('reference-'+key);
      if(old) Object.assign(old,{sourceUrl:entry.sourceUrl,type:'Federal Rule',title:entry.name});
    }
    if(entry.bodyPath) Object.assign(existing,{bodyPath:entry.bodyPath,edition:entry.edition});
    if(entry.summary && !existing.summary) Object.assign(existing,entry);
    if(entry.subjects?.length && !existing.subjects) existing.subjects=entry.subjects;
    if(entry.textPath) {
      existing.textPath=entry.textPath;
      existing.court ||= entry.court;
      if(!existing.excerpt && entry.excerpt) Object.assign(existing,{excerpt:entry.excerpt,excerptLabel:entry.excerptLabel});
      const openable=docs.get('reference-'+key);
      if(openable) openable.textPath=entry.textPath;
    }
    entry=existing;
    if(docs.get('reference-'+key)) return;
  } else authoritiesByCitation.set(key,entry);
  const body=entry.text||entry.summary||entry.excerpt||entry.bodyPath;
  if(!body && !entry.textPath) return;
  const id='reference-'+key;
  docs.set(id,{id,title:entry.name||citation,category:'Authority',type:entry.kind==='case'?'Case Reference':entry.kind==='rule'?'Federal Rule':'Statute',
    textPath:entry.textPath||'inline',sourceUrl:entry.sourceUrl,citation,referenceKey:citation,referenceSummary:entry});
  referenceDocs.set(key,id);
}
function loadExtendedAuthorities() {
  if(!authorityLoad) authorityLoad=Promise.allSettled(['brief-precedent-summaries','precedent-index','statute-index','cited-opinions','rules-index'].map(async file=>{
    return sourceJSON('data/'+file+'.json');
  })).then(datasets=>{
    for(const result of datasets) if(result.status==='fulfilled')
      for(const [citation,entry] of Object.entries(result.value)) registerAuthority(entry,citation);
    if(datasets.some(r=>r.status==='rejected')) authorityLoad=null;
    return datasets.every(r=>r.status==='fulfilled');
  }).catch(()=>{authorityLoad=null;return false});
  return authorityLoad;
}
const appendixPageIndexes = new WeakMap();
function appendixPage(data, citation, range) {
  let index = appendixPageIndexes.get(data);
  if (!index) {
    index = new Map();
    const numberOn = line => line.trim().match(/^[[(\s–—-]*(?:(?:Pet\.\s*)?App\.|J\.?\s*A\.?)?\s*(?:A(\d+)|(\d+[a-z]?))[\s\])–—-]*$/i);
    data.pages.forEach((p, page) => {
      const lines = p.text.trim().split('\n').filter(t => t.trim());
      for (const line of [...lines.slice(0, 3), ...lines.slice(-2)]) {
        const match = numberOn(line);
        if (!match) continue;
        const n = (match[1] ? match[1]+'a' : match[2]).toLowerCase();
        if (!index.has(n)) index.set(n,[]);
        if (index.get(n).at(-1)!==page) index.get(n).push(page);
      }
    });
    data.pages.forEach((p,page)=>{
      if (!p.label || String(p.label)===String(page+1)) return;
      const match=numberOn(String(p.label));
      if (match) {
        const n=(match[1]?match[1]+'a':match[2]).toLowerCase();
        if(!index.has(n)) index.set(n,[page]);
      }
    });
    appendixPageIndexes.set(data,index);
  }
  const matches=index.get(citation.match(/\d+[a-z]?$/i)?.[0].toLowerCase()) || [];
  return matches.find(i=>!range || i>=range.startPage && (i<range.endPage || i===range.endPage && range.endOffset>0)) ?? -1;
}
function appendixTargets(ref) {
  const owner=contextCase(ref.fromDoc);
  const petition=/^Pet/i.test(ref.label)||/\da$/i.test(ref.label);
  const items=(owner?.documents||[]).filter(d=>!d.auxiliary && category(d)==='Appendices' &&
    (petition ? !/joint/i.test(d.title) : /joint/i.test(d.title)));
  if (petition) {
    const filing=owner?.documents.find(d=>/^petition for (?:a |an )?writ of certiorari/i.test(d.title) && !d.auxiliary);
    if (filing) items.push(filing);
  }
  return items;
}
async function locateAppendix(ref, stillNeeded) {
  if (ref.type!=='appendix') return;
  for (const d of appendixTargets(ref)) {
    if (!stillNeeded()) return;
    const data=await ensureDoc(d.id);
    if (data && appendixPage(data,ref.label,d.sourceRange)>=0) return;
  }
}
function appendixIdentity(ref) {
  if(ref.type!=='appendix'||!/^J\.?\s*A\.?/i.test(ref.label)) return null;
  const source=(docCache.get(ref.fromDoc)?.pages||[]).map(p=>p.text||'').join('\n');
  // Name the lower court only when this filing explicitly defines its JA label.
  const court=source.match(/\bCA\s*(\d{1,2})\s+Appendix\s*\([“"']?J\.?\s*A\.?[”"']?\)/i);
  const ordinals=['','First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth','Eleventh'];
  const circuit=ordinals[Number(court?.[1])];
  const page=ref.label.match(/\d+[a-z]?$/i)?.[0];
  return {title:'Joint Appendix',meta:[circuit?circuit+' Circuit':'',page?'p. '+page:ref.label].filter(Boolean).join(' · ')};
}
function materialFor(ref) {
  const old=ref.canonical||ref.summary?.citation||citationsIn(ref.label,true,true)[0]?.canonical||ref.label;
  const key=authorityIdentity(old),entry=authoritiesByCitation.get(key)||ref.summary;
  const c=caseByCitation.get(key),bibliography=ref.type==='case'?citedNames(docCache.get(ref.fromDoc)).get(old):null;
  let id=referenceDocs.get(key)||ref.docId,embedded=false,caseRecord,appendixSource;
  if(ref.type==='appendix') {
    caseRecord=contextCase(ref.fromDoc);
    const candidates=appendixTargets(ref);
    const found=candidates.find(d=>docCache.has(d.id)&&appendixPage(docCache.get(d.id),ref.label,d.sourceRange)>=0);
    id=found?.id;
    embedded=found && category(found)==='Certiorari';
    if(candidates.length===1) appendixSource=candidates[0].sourceUrl;
  }
  const doc=ds(id),data=docCache.get(id);
  const targetPage=ref.type==='record'?(ref.recordPage??-1):ref.type==='appendix'&&data?appendixPage(data,ref.label,doc.sourceRange):-1;
  if(ref.type==='record')return {doc,targetPage,title:old,meta:'Court record citation',excerpt:data?.pages[targetPage]?.text||'This citation identifies a filing in the lower-court record. Its source document has not been matched in this collection.',kind:data?'Cited record page':'Record not linked',source:doc?.sourceUrl,record:true};
  const official=c?.decision?.holding;
  const text=entry?.summary||entry?.text||entry?.excerpt||official||'';
  let excerpt=text,kind=entry?.summary||official?'Holding':entry?.excerptLabel||(entry?.kind==='statute'?'Section text':entry?.kind==='rule'?'Rule text':'');
  if(!excerpt && data && !entry?.subjects?.length) {
    const pages=targetPage>=0?[data.pages[targetPage]]:data.pages;
    const first=pages.find(p=>p.text?.trim().length>60);
    if(first) {excerpt=first.text;kind=ref.type==='appendix'?(targetPage>=0?'Appendix · '+ref.label.match(/\d+[a-z]?$/i)[0]:'From the appendix'):'Section text'}
  }
  const missingAppendix=ref.type==='appendix'&&targetPage<0;
  const contextOnly=!excerpt&&!!ref.passage;
  if(contextOnly) {excerpt=ref.passage;kind=missingAppendix?'Context from this filing':'Citing passage'}
  const identity=appendixIdentity(ref);
  return {entry,doc,targetPage,c,caseRecord,excerpt,kind,contextOnly,missingAppendix,title:identity?.title||(embedded?'Petition Appendix':entry?.name||c?.name||bibliography?.name||ref.caseName||doc?.title||old),
    meta:identity?.meta||[entry?.citation||old,entry?.court,entry?.year||c?.decided?.slice(0,4)||bibliography?.year,entry?.edition].filter(Boolean).join(' · '),
    source:entry?.sourceUrl||doc?.sourceUrl||appendixSource||c?.sourceUrl,
    lookup:'https://www.courtlistener.com/?q='+encodeURIComponent('"'+old+'"')};
}

function renderText(text,id,page,map,mapKey=id+':'+page){
 let citations=citationRanges(text,id,page,map);if(!ds(id)?.editorContent){const transformed=numberedReading(text,map,citations);text=transformed.text;map=transformed.map;citations=transformed.citations;displayMaps.set(mapKey,map)}const annotations=state.notes.filter(n=>noteMatches(n,id)).flatMap(n=>(n.anchors||[]).filter(a=>Number(a.page)===page).map(a=>({start:lowerBound(map,a.start),end:lowerBound(map,a.end),note:n})));
 const headings=(structureFor(id,docCache.get(id)).headings||[]).filter(h=>h.page===page).map(h=>extendHeadingMarker(h,structureFor(id,docCache.get(id)))).map(h=>({...h,start:lowerBound(map,h.start),end:lowerBound(map,h.end)}));const footnoteMarkers=(structureFor(id,docCache.get(id)).footnoteMarkers||[]).filter(m=>m.page===page).map(m=>({...m,start:lowerBound(map,m.start),end:lowerBound(map,m.end)}));const formats=docCache.get(id)?.pages[page]?.marks||[];const cuts=new Set([0,text.length]);for(const r of [...citations,...annotations,...headings,...footnoteMarkers,...formats]){cuts.add(Math.max(0,Math.min(text.length,r.start)));cuts.add(Math.max(0,Math.min(text.length,r.end)))}const sorted=[...cuts].sort((a,b)=>a-b);let html='',activeHeading=null;
 for(let i=0;i<sorted.length-1;i++){const a=sorted[i],b=sorted[i+1];if(a===b)continue;const h=headings.find(h=>h.start<=a&&h.end>=b);if(h!==activeHeading){if(activeHeading)html+='</span>';if(h)html+=`<span class="reader-section-heading ${h.level?'minor':''}" role="heading" aria-level="${h.level?3:2}">`;activeHeading=h}let chunk=esc(text.slice(a,b));for(const f of formats)if(f.start<=a&&f.end>=b)chunk=`<${f.tag}>${chunk}</${f.tag}>`;const marker=footnoteMarkers.find(m=>m.start<=a&&m.end>=b);if(marker)chunk=`<sup><button class="footnote-anchor" data-action="footnote-preview" data-value="${esc(id)}|${page}|${esc(marker.label)}" aria-label="Footnote ${esc(marker.label)}">${chunk}</button></sup>`;const cr=citations.find(r=>r.start<=a&&r.end>=b);if(cr)chunk=`<span class="citation" role="button" tabindex="0" data-ref-key="${esc(cr.ref.key)}">${chunk}</span>`;const an=annotations.filter(r=>r.start<=a&&r.end>=b).at(-1);if(an)chunk=`<mark class="annotation ${an.note.color||'yellow'} ${an.note.comment?'has-comment':''} ${state.focusedNote===an.note.id?'focused':''}" data-annotation="${an.note.id}">${chunk}</mark>`;html+=chunk}if(activeHeading)html+='</span>';return html;
}
function refreshDocuments(){storePositions();document.querySelectorAll('.doc-scroll').forEach(el=>{const data=docCache.get(el.dataset.doc);if(data&&!state.pdfDocs?.includes(el.dataset.doc))el.innerHTML=documentHTML(el.dataset.doc,data);else if(state.pdfDocs?.includes(el.dataset.doc))renderPDFNotes(el)});restorePositions();scheduleMargins()}
function refreshSidebar(){const side=app.querySelector('.sidebar');if(side)side.outerHTML=sidebar()}
function openDoc(id,{split=false}={}){
 rememberReaderReturn();id=canonicalDocId(id);const d=ds(id);if(!d)return;storePositions();const selected=caseMap.get(state.caseId);
 const owner=caseMap.has(d.caseId)?d.caseId:state.route==='reader'?state.workspaceId:selected?.id;
 switchWorkspace(owner||state.caseId);if(!state.tabs.includes(id))state.tabs.push(id);
 if(split&&state.active&&state.active!==id){state.split=id;state.paneOrder=[state.active,id];state.side=false}else{state.active=id;if(state.split===id)state.split=null}
 state.tabCases[id]=state.workspaceId;state.caseId=state.workspaceId;state.route='reader';
 state.recents=[id,...state.recents.filter(x=>x!==id)].slice(0,24);clearPeek();render();ensureDoc(id);
}
function referenceDetails(ref,compact=false) {
  const m=materialFor(ref);
  const full=docCache.get(m.doc?.id)?.pages?.map(p=>p.text).join(' ')||m.excerpt||'';const canOpen=m.doc&&(m.doc.pdfPath||m.doc.pageCount>2||full.length>2400)&&!m.contextOnly;
  const sourceLabel=m.entry?.kind==='case'?'Case Source':ref.type==='statute'?'Official Text':'Source';
  const text=m.excerpt?excerptOf(m.excerpt,compact?560:2200):'';
  const subjects=m.entry?.subjects?.slice(0,compact?3:6).join(' · ');
  return `<p class="reference-meta">${esc(m.meta)}</p>${m.missingAppendix?'<p class="small muted"><strong>Cited page unavailable.</strong> This appendix page is not available in this collection.</p>':''}${subjects?`<p class="reference-subjects">${esc(subjects)}</p>`:''}${text?(m.missingAppendix&&m.contextOnly?`<details class="reference-context"><summary>Show context from this filing</summary><div class="reference-content"><p>${esc(text)}</p></div></details>`:`<div class="reference-content">${m.kind?`<strong>${esc(m.kind)}</strong>`:''}<p>${esc(text)}</p></div>`):'<p class="small muted">Full text is unavailable for this citation.</p>'}
    <div class="ref-actions">${compact?button('Keep Open','keep-ref',ref.key):''}${canOpen?button('New Tab','open-reference',ref.key):''}
    ${m.c?`<a href="#/case/${encodeURIComponent(m.c.id)}">Case Page</a>`:''}
    ${!compact&&canOpen?button('Float','float-ref',ref.key):''}
    ${ref.type==='appendix'&&!m.source&&m.caseRecord?`<a href="#/case/${encodeURIComponent(m.caseRecord.id)}?section=Appendices">Case Materials</a>`:m.record&&!m.source?'':external(m.source||m.lookup,m.source?sourceLabel:'Search Citation')}</div>`;
}
function referenceHTML(ref) {
  return ref?`<h2 class="ref-title">${esc(materialFor(ref).title)}</h2>${referenceDetails(ref)}`:'';
}
function clearPeek(){overlays.querySelector('.peek')?.remove()}
async function showPeek(trigger) {
  const ref=refsIndex.get(trigger.dataset.refKey);
  if(!ref||!trigger.isConnected) return;
  clearPeek();peekAnchor=trigger;
  const el=document.createElement('section');el.className='peek';el.dataset.ref=ref.key;
  overlays.append(el);
  function position() {
    if(!el.isConnected||!trigger.isConnected) return;
    const r=trigger.getBoundingClientRect();
    el.style.left=Math.max(9,Math.min(r.left,innerWidth-el.offsetWidth-9))+'px';
    el.style.top=Math.max(9,Math.min(r.bottom+7,innerHeight-el.offsetHeight-9))+'px';
  }
  function paint() {
    if(!el.isConnected||!trigger.isConnected) return;
    const contextOpen=el.querySelector('.reference-context')?.open;
    el.innerHTML=`<div class="peek-heading"><h3>${esc(materialFor(ref).title)}</h3>${button(icon('close'),'dismiss-peek','','','aria-label="Close preview"')}</div>${referenceDetails(ref,true)}`;
    if(contextOpen&&el.querySelector('.reference-context'))el.querySelector('.reference-context').open=true;
    position();
  }
  el.addEventListener('toggle',position,true);
  paint();
  await loadExtendedAuthorities();
  if(!el.isConnected) return;
  const m=materialFor(ref);
  if(ref.type==='record')await locateRecord(ref);
  if(ref.type==='appendix') await locateAppendix(ref,()=>el.isConnected);
  else if(m.doc&&!m.entry) await ensureDoc(m.doc.id);
  paint();
}

async function keepRef(key) {
  const ref=refsIndex.get(key)||state.refs.find(r=>r.key===key);
  if(!ref) return;
  if(!state.refs.some(r=>r.key===key)) state.refs.push(ref);
  state.ref=key;state.tool='refs';state.side=true;clearPeek();render();
  await hydrateReference(ref);
}
async function hydrateReference(ref) {
  if(!ref) return;
  await loadExtendedAuthorities();
  if(ref.type==='record')await locateRecord(ref);
  if(ref.type==='appendix') await locateAppendix(ref,()=>state.ref===ref.key);
  const doc=materialFor(ref).doc;
  if(doc) await ensureDoc(doc.id);
  if(state.ref===ref.key&&state.route==='reader'&&state.side&&state.tool==='refs') refreshSidebar();
}
function referencesSidebar() {
 const active=(state.refs||[]).find(r=>r.key===state.ref&&r.fromDoc===state.active);
 const items=new Map();for(const ref of refsIndex.values())if(ref.fromDoc===state.active&&!items.has(ref.id||ref.canonical||ref.label))items.set(ref.id||ref.canonical||ref.label,ref);
 if(active)return `<div class="reference-back">${button(icon('back')+'All References','references-back')}</div><div id="reference-detail">${referenceHTML(active)}${materialFor(active).contextOnly?button('Go to Passage','reference-location',active.key,'outline'):`<section class="reference-context"><h3>Referenced Here</h3><p>${esc(active.passage||'')}</p>${button('Go to Passage','reference-location',active.key,'outline')}</section>`}</div>`;
 return `${signedIn()?button('Edit authorities','edit-case',state.caseId,'outline'):''}<p class="reference-intro">Authorities cited in ${esc(tabLabel(ds(state.active)))}. Select one to read its note and the passage that cites it.</p><div class="reference-list">${[...items.values()].map(r=>`<article>${button(`<strong>[${esc(r.number)}] ${esc(r.name||materialFor(r).title)}</strong><small>${esc(r.canonical||r.label)} · Source p. ${(r.page??Number(r.key.split('|')[2])??0)+1}</small><span>${esc(excerptOf(r.passage||'',180))}</span>`,'keep-ref',r.key,'document-reference')}</article>`).join('')||'<p class="small muted">No recognized citations in this document.</p>'}</div>`;
}
async function floatRef(key){const ref=state.refs.find(r=>r.key===key)||refsIndex.get(key);if(!ref)return;const doc=materialFor(ref).doc;if(!doc)return;const data=await ensureDoc(doc.id);const el=document.createElement('section');el.className='floatref';el.innerHTML=`<div class="drag"><span>${esc(doc.title)}</span>${button(icon('close'),'close-float','','',`aria-label="Close floating reference"`)}</div><div class="floatbody">${data?esc(data.pages.map(p=>p.text).join('\n\n')):'Reader text unavailable.'}</div>`;overlays.append(el);const handle=el.querySelector('.drag');handle.onpointerdown=e=>{if(e.target.closest('button'))return;const r=el.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;handle.setPointerCapture(e.pointerId);handle.onpointermove=ev=>{el.style.left=Math.max(0,Math.min(innerWidth-el.offsetWidth,ev.clientX-dx))+'px';el.style.top=Math.max(0,Math.min(innerHeight-50,ev.clientY-dy))+'px';el.style.right='auto'};handle.onpointerup=()=>handle.onpointermove=null}}
function readSelection(){const s=window.getSelection();if(!s||s.isCollapsed||!s.rangeCount){clearSelection();return}const r=s.getRangeAt(0);if((r.startContainer.parentElement||r.startContainer).closest('.pdf-document')){readPDFSelection(r);return}const start=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;const end=r.endContainer.nodeType===1?r.endContainer:r.endContainer.parentElement;const article=start.closest('.document-body');if(!article||article!==end.closest('.document-body'))return;const id=article.dataset.document,anchors=[];for(const p of article.querySelectorAll('.page-text')){if(!r.intersectsNode(p))continue;let a=0,b=p.textContent.length;if(p.contains(r.startContainer)){const rr=document.createRange();rr.selectNodeContents(p);rr.setEnd(r.startContainer,r.startOffset);a=rr.toString().length}if(p.contains(r.endContainer)){const rr=document.createRange();rr.selectNodeContents(p);rr.setEnd(r.endContainer,r.endOffset);b=rr.toString().length}if(b>a){const m=displayMaps.get(p.dataset.mapKey||id+':'+p.dataset.page);anchors.push({page:Number(p.dataset.page),start:m?.[a]??a,end:b>0?(m?.[b-1]??(b-1))+1:b,quote:p.textContent.slice(a,b)})}}if(!anchors.length)return;const quote=anchors.map(a=>a.quote).join('\n');if(!quote.trim())return;selection={docId:id,sourceDocId:textSourceId(id),anchors,quote};selectionRange=r.cloneRange();overlays.querySelector('.selection-tools')?.remove();const t=document.createElement('div');t.className='selection-tools';t.setAttribute('role','toolbar');t.setAttribute('aria-label','Annotate selection');t.innerHTML=`<div class="colors">${['yellow','blue','pink','mint'].map(c=>button('','highlight',c,'swatch '+c,`aria-label="Highlight ${c}"`)).join('')}</div>${button(icon('note')+'Comment','comment')}${narration?.id===id?button(icon('play')+'Read From Here','narrate-selection'):''}${button(icon('close'),'dismiss-selection','','',`aria-label="Close annotation tools"`)}`;overlays.append(t);positionSelection()}
function addAnnotation(color='yellow',comment=false){if(!selection?.quote?.trim())return;const n={id:crypto.randomUUID(),...selection,color,comment:'',createdAt:new Date().toISOString(),sourceUrl:ds(selection.docId)?.sourceUrl};state.notes.push(n);state.focusedNote=n.id;clearSelection();window.getSelection()?.removeAllRanges();refreshDocuments();if(state.side&&state.tool==='notes')refreshSidebar();persist();if(comment)requestAnimationFrame(()=>{const trigger=app.querySelector(`[data-annotation="${n.id}"]`);if(trigger)showNoteEditor(trigger,n.id)});else toast('Highlight saved')}
async function goNote(id){const n=state.notes.find(x=>x.id===id);if(!n)return;state.focusedNote=id;const targetId=canonicalDocId(n.docId),target=ds(targetId);if(target?.timedSession){state.pdfDocs=(state.pdfDocs||[]).filter(x=>x!==targetId);if((n.sourceDocId||n.docId)===target.pdfSourceId)state.pdfDocs.push(targetId)}openDoc(targetId);await ensureDoc(targetId);if(state.pdfDocs?.includes(targetId))await renderPDF(targetId);if(nativePDF(targetId)){jumpPage(targetId,n.anchors?.[0]?.page??n.pdfRects?.[0]?.page??n.page??0);return}const p=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(canonicalDocId(n.docId))}"]`);const mark=p?.querySelector(`[data-annotation="${CSS.escape(id)}"]`);if(mark)for(const detail of p.querySelectorAll('details'))if(detail.contains(mark))detail.open=true;(mark||p?.querySelector(`[data-page="${n.anchors?.[0]?.page??n.page??0}"]`))?.scrollIntoView({block:'center',behavior:'smooth'})}
function exportNotes(){const data={format:'court-reader-annotations-v1',exportedAt:new Date().toISOString(),term:catalog.term,annotations:state.notes.map(n=>({...n,documentTitle:ds(n.docId)?.title,caseName:caseMap.get(ds(n.docId)?.caseId)?.name})),savedCases:state.saved.map(id=>caseMap.get(id)).filter(Boolean).map(c=>({id:c.id,name:c.name,sourceUrl:c.sourceUrl}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='court-reader-annotations.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function listen(id,sessionId=null,start=null){const c=caseMap.get(id),sessions=argumentAlignment[id]?.sessions||[],session=sessions.find(s=>s.id===sessionId)||sessions[0];if(!c?.audio?.url&&!session)return;stopNarration();const url=session?.audioUrl||c.audio.url;if(audioCase!==id||audioSession!==(session?.id||null)){audioCase=id;audioSession=session?.id||null;audio.src=url}if(start!==null)audio.currentTime=start;try{await audio.play();if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:c.name,artist:'Supreme Court of the United States'});navigator.mediaSession.setActionHandler('play',()=>audio.play());navigator.mediaSession.setActionHandler('pause',()=>audio.pause())}}catch{toast('Tap Play to start the recording.')}refreshPlayback();closeReaderMenu()}

function jumpPage(id,index){const p=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"]`);if(p?._pdfPreparing){p._pdfJump=index;return}const frame=nativePDF(id);if(frame){const source=pdfSources(ds(id),ds).find(s=>new URL(s.url,location.href).href.split('#')[0]===frame.src.split('#')[0]);frame.src=nativePDFURL(frame.src,source?.sliced?Math.max(0,index-(ds(id)?.sourceRange?.startPage||0)):index,location.href);state.positions[id+':pdf']={page:index,scroll:0};persist();return}p?.querySelector(`.source-page[data-page="${index}"]`)?.scrollIntoView({block:'start',behavior:'smooth'})}
function route(name){storePositions();saveWorkspace();state.route=name;clearPeek();overlays.querySelector('.selection-tools')?.remove();render();if(name!=='reader')window.scrollTo(0,0)}
document.addEventListener('click',async e=>{const citation=e.target.closest('[data-ref-key]');if(citation){showPeek(citation);return}const mark=e.target.closest('[data-annotation]');if(mark){showNoteEditor(mark,mark.dataset.annotation);return}const b=e.target.closest('[data-action]');if(!b||e.target.closest('.joining-detail'))return;const a=b.dataset.action,v=b.dataset.value;if(a==='qp'){state.qpIndex=Number(v);render()}else if(a==='term-picker'){setTermChooser(!state.termChooserOpen,true)}else if(a==='choose-term'){chooseTerm(v)}else if(a==='term-area'){state.termArea=v;render();window.scrollTo(0,0)}else if(a==='clear-term'){state.termArea='';state.query='';state.argumentMonth='';render()}else if(a==='participation'){state.participation=v;render()}else if(a==='workspace'){if(state.route==='reader'&&state.workspaceId===v){minimizeReader()}else{rememberReaderReturn();switchWorkspace(v);state.caseId=v;route('reader')}}else if(a==='workspace-minimize'){minimizeReader()}else if(a==='workspace-close'){storePositions();const wasActive=state.workspaceId===v;delete state.workspaces[v];if(wasActive){state.workspaceId=null;state.tabs=[];state.active=null;state.split=null;if(state.route==='reader'){minimizeReader();return}}render()}else if(a==='opinion-open'){const pos=v.lastIndexOf('|'),id=v.slice(0,pos),page=Number(v.slice(pos+1));openDoc(id);await ensureDoc(id);jumpPage(id,page)}else if(a==='case-section'){state.caseSection=v;render()}else if(a==='entity'){const pos=v.indexOf('|');state.profileType=v.slice(0,pos);state.profileName=v.slice(pos+1);state.profileTerm='all';state.participation='all';route('profile')}else if(a==='pdf-toggle'){state.pdfDocs=state.pdfDocs||[];state.pdfDocs=state.pdfDocs.includes(v)?state.pdfDocs.filter(x=>x!==v):[...state.pdfDocs,v];rememberDocumentFormat(v,state.pdfDocs.includes(v));render()}else if(a==='route'){state.entityQuery='';if(v==='cases')openTerm(currentTerm.term,false);else {if(v==='applications'){state.query='';state.applicationStatus='';state.applicationTerm='all';state.termChooserOpen=false}route(v)}}else if(a==='case'){state.caseSection='Decision';state.qpIndex=0;state.caseId=v;state.group='All';state.docQuery='';route('case')}else if(a==='open')openDoc(v);else if(a==='activate'){if(state.split&&[state.active,state.split].includes(v)){focusReaderPane(v)}else{storePositions();if(state.split){const replaced=b.closest('.pane')?.dataset.pane||state.active;const other=[state.active,state.split].find(id=>id!==replaced);state.paneOrder=(state.paneOrder||[state.active,state.split]).map(id=>id===replaced?v:id);state.split=other}state.active=v;render()}}else if(a==='close-tab'){storePositions();const idx=state.tabs.indexOf(v);state.tabs=state.tabs.filter(id=>id!==v);if(state.active===v)state.active=state.tabs[Math.min(idx,state.tabs.length-1)]||null;if(state.split===v)state.split=null;render()}else if(a==='tool'){state.side=!(state.side&&state.tool===v);state.tool=v;render()}else if(a==='toggle-side'){state.side=!state.side;render()}else if(a==='close-side'){state.side=false;render()}else if(a==='single'){state.split=null;render()}else if(a==='split-doc')openDoc(v,{split:true});else if(a==='swap'){[state.active,state.split]=[state.split,state.active];render()}else if(a==='save'){state.saved=state.saved.includes(v)?state.saved.filter(x=>x!==v):[v,...state.saved];render()}else if(a==='group'){state.group=v;render()}else if(a==='month'){state.month=v;state.calendarLimit=14;render()}else if(a==='more-events'){state.calendarLimit=1000;render()}else if(a==='highlight')addAnnotation(v);else if(a==='comment')addAnnotation('yellow',true);else if(a==='dismiss-selection'){selection=null;overlays.querySelector('.selection-tools')?.remove()}else if(a==='delete-note'){state.notes=state.notes.filter(n=>n.id!==v);state.focusedNote=null;if(state.route==='reader'){refreshDocuments();refreshSidebar();persist()}else render()}else if(a==='note-color'){const [id,col]=v.split(':');const n=state.notes.find(n=>n.id===id);if(n){n.color=col;overlays.querySelectorAll('.note-editor .swatch').forEach(b=>{const active=b.dataset.value===v;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});if(state.route==='reader'){refreshDocuments();refreshSidebar();persist()}else render()}}else if(a==='goto-note')goNote(v);else if(a==='page-note'){if(!state.active)return;const p=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(state.active)}"]`);const n={id:crypto.randomUUID(),docId:state.active,sourceDocId:annotationSourceId(state.active),page:Number(p?visiblePage(p):0),anchors:[],quote:'',comment:'',color:'yellow',createdAt:new Date().toISOString()};state.notes.push(n);state.focusedNote=n.id;state.tool='notes';state.side=true;refreshSidebar();persist();const editor=app.querySelector(`[data-note-edit="${n.id}"]`);editor?.scrollIntoView({block:'nearest'});editor?.focus();scheduleMargins()}else if(a==='export')exportNotes();else if(a==='retry-document'){await ensureDoc(v)}else if(a==='open-reference'){const ref=refsIndex.get(v)||state.refs.find(r=>r.key===v);if(ref){const m=materialFor(ref);if(m.doc){openDoc(m.doc.id);if(m.targetPage>=0)jumpPage(m.doc.id,m.targetPage)}}}else if(a==='keep-ref')keepRef(v);else if(a==='ref-select'){state.ref=v;refreshSidebar();persist();hydrateReference(state.refs.find(r=>r.key===v))}else if(a==='dismiss-peek')clearPeek();else if(a==='float-ref')floatRef(v);else if(a==='close-float')b.closest('.floatref')?.remove();else if(a==='page-jump'){const at=v.lastIndexOf(':');jumpPage(v.slice(0,at),Number(v.slice(at+1)))}else if(a==='listen')listen(v);else if(a==='audio-toggle'){if(audio.paused)audio.play().catch(()=>toast('Audio could not play.'));else audio.pause();refreshPlayback()}else if(a==='audio-close'){audio.pause();audioCase=null;refreshPlayback()}else if(a==='read-aloud')startNarration();else if(a==='stop-narration')stopNarration()});
let searchTimer;document.addEventListener('input',e=>{const t=e.target;if(['entity-search','case-search','doc-search'].includes(t.id)){const key={'entity-search':'entityQuery','case-search':'query','doc-search':'docQuery'}[t.id];state[key]=t.value;clearTimeout(searchTimer);if(e.isComposing)return;searchTimer=setTimeout(()=>{if(!t.isConnected)return;refreshSearchResults(t)},120)}else if(t.dataset.noteEdit){const n=state.notes.find(n=>n.id===t.dataset.noteEdit);if(n){n.comment=t.value;persist();document.querySelectorAll(`[data-annotation="${n.id}"]`).forEach(m=>m.classList.toggle('has-comment',!!n.comment));scheduleMargins();const status=t.closest('.note-card')?.querySelector('.note-save-state');if(status)status.textContent='Saved'}}else if(t.id==='text-size'){state.textSize=Number(t.value);app.querySelectorAll('.page-text').forEach(p=>p.style.setProperty('--reader-size',state.textSize+'px'));scheduleMargins();persist()}else if(t.id==='audio-seek'&&Number.isFinite(audio.duration))audio.currentTime=Number(t.value)});
document.addEventListener('change',e=>{const t=e.target;if(t.id==='application-status'){state.applicationStatus=t.value;render()}else if(t.id==='application-sort'){state.applicationSort=t.value;render()}else if(t.id==='term-view-select'){state.termView=t.value;render()}else if(t.id==='sitting-select'){state.sitting=t.value;render()}else if(t.id==='term-area'){state.termArea=t.value;render()}else if(t.id==='profile-term'){state.profileTerm=t.value;render();app.querySelector('#profile-term')?.focus({preventScroll:true})}else if(t.id==='page-markers'){state.pageMarkers=t.checked;refreshDocuments();persist()}else if(t.id==='margin-notes'){state.marginNotes=t.checked;refreshDocuments();persist()}else if(t.id==='argument-month'){state.argumentMonth=t.value;render()}else if(t.id==='admin-toggle'){state.includeAdmin=t.checked;render()}else if(t.id==='case-sort'){state.sort=t.value;render()}else if(t.id==='side-group'){state.docGroup=t.value;refreshSidebar();persist()}else if(t.id==='split-select'&&t.value)openDoc(t.value,{split:true});else if(t.dataset.pageInput)jumpPage(t.dataset.pageInput,Number(t.value)-1);else if(t.id==='audio-speed')audio.playbackRate=Number(t.value)});
document.addEventListener('pointerup',e=>{if(e.target.closest('.document-body,.pdf-document'))setTimeout(readSelection,20)});
document.addEventListener('keyup',e=>{if(e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))readSelection();if(e.key==='Escape'){clearPeek();overlays.querySelector('.selection-tools')?.remove();selection=null}});
let hoverTimer;document.addEventListener('pointerover',e=>{const note=e.target.closest('[data-note-preview]');if(note&&e.pointerType!=='touch'&&!overlays.querySelector('.note-editor')){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>showNotePeek(note),200);return}const c=e.target.closest('[data-ref-key]');if(c&&e.pointerType!=='touch'){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>{if(window.getSelection()?.isCollapsed)showPeek(c)},250)}});
audio.addEventListener('timeupdate',()=>{const t=document.querySelector('#audio-time'),r=document.querySelector('#audio-seek');if(t)t.textContent=time(audio.currentTime);if(r){r.max=Number.isFinite(audio.duration)?audio.duration:100;r.value=audio.currentTime}const elapsed=document.querySelector('.playback-time');if(elapsed&&!narration)elapsed.textContent=time(audio.currentTime)});audio.addEventListener('error',()=>toast('The audio source could not be loaded.'));window.addEventListener('beforeunload',()=>{storePositions();persist()});
function amicusIdentity(value){let name=String(value||'').replace(/^Amicus brief of /i,'').replace(/ submitted$/i,'').replace(/,?\s+et\.?\s+al\.?$/i,'').replace(/[,\s]+$/,'').trim();if(!name)return null;
 const generic=/^(?:\d+\b|One Hundred|Two |Three |Four |Five |Six |Seven |Eight |Nine |Ten |Thirteen |Fourteen |Bipartisan |Current and Former |Anonymous |Members of |Legislators from |Plaintiffs in |Individuals and Organizations |Court-appointed |Opposition of |Scholars of |Professors of |Experts (?:in|on) |Parents of |Coaches,|Professional, Olympic)/i;
 const roles=/(?:Scholars|Professors|Officials|Judges|Governors|Commissioners|Administrators|Attorneys|Lawyers|Secretaries|Organizations|Groups|Professionals|Scientists|Physiologists|Economists|Technologists|Leaders|Stakeholders|Denominations|Holders|Amici|Historians|Directors|Commissioners|Counselors|Congress|Prisons Officials|Boards and Commissions|Federal Reserve System|Equal Employment Opportunity Commission|Torture|War Crimes Issues\/Global Criminal Justice)$/i;
 const namedInstitution=/\b(?:Association|Institute|Foundation|Center|Centre|Council|Society|Union|Federation|Committee|Clinic|University|Alliance|League|Network|United|Project|Fund|Inc|LLC|Corporation)\b/i;
 const excluded=new Set(['Former Commissioners of the United States Sentencing Commission','Former FCC Chairs','Former Government Officials and Advisors','Former Ohio Attorneys General','Former Ohio State Attorneys General','Independent Agency Board Members','State and Local Election Officials, etc','Trade Scholars in Economics, Politics, and Law','Academic Medical Centers','Advocates for Girls\' and Women\'s Rights','Business Leaders','Doctors of Sports Medicine','Faith Leaders in Congressional District 6','Farm Bureau Organizations of California','Haitian TPS Holders','Insurance Companies','Interested Freight Brokers','Land-Surveyor and Civil-Engineer Trade Associations','Law & Technology','Lay Roman Catholics','Local Governments','Milligan Plaintiffs','National Agricultural Associations','Oil and Gas Associations','Persecuted Christian Minorities','Roundup and Paraquat MDL Court-appointed Leadership','Tribal Nations','Williams Institute Scholars','Louisiana Mathematics and Computer-Science Professors in support on neither party']);
 name=name.replace(/ and \d+ Other States$/i,'').replace(/ and Former White House Lawyers$/i,'');if(generic.test(name)||excluded.has(name)||(roles.test(name)&&!namedInstitution.test(name)))return null;return name;}

function amiciName(d){return d.amiciName||d.title.replace(/^Brief\s+(?:of\s+)?(?:amici\s+curiae|amicus\s+curiae)\s+(?:of\s+|for\s+|by\s+)?/i,'').replace(/\s*VIDED\.?\s*$/i,'').replace(/\s+filed\.?$/i,'')}
function titleCaseLabel(text){const small=new Set(['a','an','and','as','at','but','by','for','in','nor','of','on','or','per','the','to','via','with']);return String(text).replace(/\b[a-z][a-z'-]*\b/g,(word,index)=>index>0&&small.has(word)?word:word[0].toUpperCase()+word.slice(1))}
function formatHeadings(){app.querySelectorAll('h1,h2,h3').forEach(h=>{if(h.closest('.case-hero,.profile-hero,.document-body,.reference-content'))return;const walk=document.createTreeWalker(h,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())n.nodeValue=titleCaseLabel(n.nodeValue)})}
function entityButton(type,name){return button(esc(type==='areas'?titleCaseLabel(name):name),'entity',type+'|'+name,'entity-link')}
function entityEntries(type){const map=new Map();for(const c of cases){let names=[];if(type==='areas')names=(c.areas||[]).map(x=>typeof x==='string'?x:x.name);if(type==='justices')names=justiceNames().filter(n=>participation(c,n).length);if(type==='advocates')names=(c.advocates||[]).map(a=>a.name);if(type==='amici')names=(c.amici||[]).map(a=>amicusIdentity(a.name)).filter(Boolean);for(const n of names){if(!n)continue;if(!map.has(n))map.set(n,new Set());map.get(n).add(c.id)}}if(type==='justices')for(const n of justiceNames())if(!map.has(n))map.set(n,new Set());const order=justiceNames();return [...map].map(([name,ids])=>({name,ids:[...ids]})).sort((a,b)=>type==='justices'?order.indexOf(a.name)-order.indexOf(b.name):a.name.localeCompare(b.name))}
function peopleDirectory(type, entries, title) {
  const query = (state.entityQuery || '').toLowerCase();
  const people = type === 'justices' || type === 'advocates';
  const cards = entries.filter(e=>e.name.toLowerCase().includes(query)).map(e=>{
    const p = profiles[e.name];
    const role = type === 'justices' ? justiceRole(e.name) : p?.role;
    const detail = type === 'justices' ? justiceTenure(e.name) : e.ids.length + (e.ids.length===1?' case':' cases');
    const url = '#/profile/'+type+'/'+encodeURIComponent(e.name);
    return `<a class="directory-card" href="${esc(url)}" aria-label="${esc(e.name)}">${people ? personImage(e.name,'directory-portrait') : type==='amici'?amicusArt():''}<div><strong>${esc(e.name)}</strong>
      ${role?`<span>${esc(role)}</span>`:''}<small>${esc(detail)}</small></div></a>`;
  }).join('');
  return `<main class="main directory-page"><header class="collection-title"><h1>${esc(title)}</h1></header><div class="filterbar"><input id="entity-search" type="search" aria-label="Find ${esc(title)}" placeholder="Find ${esc(title.toLowerCase())}" value="${esc(state.entityQuery||'')}"></div>
    <div class="people-directory ${people?'with-portraits':''} ${type==='justices'?'justice-directory':type+'-directory'}">${cards||'<p class="empty">No matches.</p>'}</div></main>`;
}
function amicusArt(){return '<figure class="amicus-art" aria-hidden="true"><img src="images/amici-art/amicus-briefs.webp" alt="" width="512" height="512" loading="lazy"></figure>'}
function justiceRole(name) {
  return /chief justice/i.test(profiles[name]?.role||'') ? 'Chief Justice' : 'Associate Justice';
}
function personImage(name, cls) {
  const p=profiles[name];
  if (p?.portraitPath || p?.illustrationPath) return portrait(name,cls);
  return `<figure class="${cls} generic-avatar" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><circle cx="24" cy="17" r="8"/><path d="M7 43v-3c0-8 8-13 17-13s17 5 17 13v3Z"/></svg></figure>`;
}
function profileTermSelect(years) {
  return `<select id="profile-term" aria-label="Filter by October term"><option value="all">All Terms</option>${years.map(y=>`<option value="${y}" ${String(y)===state.profileTerm?'selected':''}>October Term ${y}</option>`).join('')}</select>`;
}
function personProfileHero(name, justice) {
  const p=profiles[name] || {};
  const facts=(p.facts||[]).map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(/^\d{4}-\d{2}-\d{2}$/.test(f.value)?date(f.value):f.value)}</dd></div>`).join('');
  return `<section class="person-hero ${justice?'justice-hero':''}">${personImage(name,'profile-portrait')}<div class="person-intro">
    <span class="profile-role">${esc(justice?justiceRole(name):p.role||'Advocate')}</span><h1>${esc(name)}</h1>
    ${p.bio?`<p class="profile-bio">${esc(p.bio)}</p>`:''}${p.sourceUrl?external(p.sourceUrl,'Biography'):''}</div>
    ${facts?`<dl class="person-facts">${facts}</dl>`:''}${justice?justiceVoice(name):''}</section>`;
}
function votingPartners(name, term) {
  const relationships = new Map(), seen = new Set();
  for (const [id, record] of Object.entries(verifiedVotes)) {
    const c=caseMap.get(id);
    if (!c || (term!=='all' && String(c.term)!==term)) continue;
    const key=c.sharedDecisionFrom || id;
    if (seen.has(key)) continue;
    const agree=record.groups.find(g=>g.label==='For the Judgment')?.names || [];
    const dissent=record.groups.find(g=>g.label==='Dissented')?.names || [];
    if (!agree.includes(name) && !dissent.includes(name)) continue;
    seen.add(key);
    for (const other of [...agree,...dissent]) {
      if (other===name) continue;
      const stat=relationships.get(other)||{other,same:0,total:0}; stat.total++;
      if (agree.includes(other)===agree.includes(name)) stat.same++;
      relationships.set(other,stat);
    }
  }
  return [...relationships.values()].sort((a,b)=>b.same/b.total-a.same/a.total||b.total-a.total||a.other.localeCompare(b.other));
}
function justiceProfile(name) {
  const selected=state.profileTerm||'all', authored=[], seen=new Set();
  for (const c of cases) {
    if (selected!=='all' && String(c.term)!==selected) continue;
    for (const d of opinionSections[c.id]||[]) {
      if (d.opinionAuthor!==name) continue;
      const key=[d.sourceUrl||c.id,d.opinionType,d.sourceRange?.startPage,d.sourceRange?.startOffset].join('|');
      if (seen.has(key)) continue;
      seen.add(key); authored.push({c,d});
    }
  }
  authored.sort((a,b)=>(b.c.decided||'').localeCompare(a.c.decided||'')||a.c.name.localeCompare(b.c.name));
  const areas=new Map(); for(const {c} of authored) for(const area of caseAreas(c)) areas.set(area,(areas.get(area)||0)+1);
  const partners=votingPartners(name,selected);
  const groups=[
    ['Opinions of the Court',authored.filter(({d})=>d.opinionType==='Opinion of the Court')],
    ['Separate Opinions',authored.filter(({d})=>d.opinionType!=='Opinion of the Court')]
  ];
  const opinionGroup=([heading,items],index)=>`<section class="authored-group"><h4>${heading}</h4>
    ${items.length?`<div class="opinion-group-list" role="region" aria-label="${heading}" tabindex="0">${items.map(({c,d})=>`<a class="authored-entry" href="#/reader/${esc(c.id)}?doc=${encodeURIComponent(d.id)}">
    <strong>${esc(c.name)}</strong><small>${esc([index?d.opinionType:'',date(d.date||c.decided)].filter(Boolean).join(' · '))}</small></a>`).join('')}</div>`:'<p class="record-empty">None recorded for this term selection.</p>'}</section>`;
  return `<main class="main profile-page person-page">${personProfileHero(name,true)}
    <section class="profile-collection justice-record"><header><h2>Judicial Record</h2><div class="record-term">${profileTermSelect(termYears())}</div></header>
    <div class="record-panels"><section class="record-panel"><h3>Opinions Written</h3>
    <div class="authored-groups">${groups.map(opinionGroup).join('')}</div></section>
    <section class="record-panel"><h3>Voting Agreement</h3>
    ${partners.length?`<p class="record-caption">Same side of the judgment, including unanimous decisions. Each pair’s total includes only decisions where both cast a recorded vote for or against the judgment.</p>
    <ul class="agreement-list">${partners.map(x=>`<li><a href="#/profile/justices/${encodeURIComponent(x.other)}">
    ${portrait(x.other,'partner-portrait')}<span>${esc(x.other)}</span><small>${x.same} of ${x.total}</small><strong>${Math.round(100*x.same/x.total)}%</strong></a></li>`).join('')}</ul>`:
    '<p class="record-empty">No comparable votes recorded for this term selection.</p>'}</section></div>
    ${areas.size?`<section class="opinion-areas"><h3>Areas of Authored Opinions</h3><div class="area-links">${[...areas].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([a])=>entityButton('areas',a)).join('')}</div></section>`:''}</section></main>`;

}
function advocateProfile(name, entries) {
  const ids=entries.find(e=>e.name===name)?.ids||[];
  const all=ids.map(id=>caseMap.get(id)).filter(Boolean);
  const years=[...new Set(all.map(c=>Number(c.term)))].sort((a,b)=>b-a);
  const items=all.filter(c=>state.profileTerm==='all'||String(c.term)===state.profileTerm).sort((a,b)=>(b.argued||'').localeCompare(a.argued||'')||a.name.localeCompare(b.name));
  return `<main class="main profile-page person-page">${personProfileHero(name,false)}<section class="profile-collection"><header><h2>Oral Arguments</h2>${profileTermSelect(years)}</header>
  <div class="work-list appearance-list">${items.map(c=>{
    const role=advocateRole(c.advocates.find(a=>a.name===name)?.role);
    const transcript=caseDocuments(c).find(d=>materialGroup(d)==='Argument');
    return `<article><div><a href="#/case/${esc(c.id)}?section=Argument">${esc(c.name)}</a><span>${[role,c.argued?date(c.argued):'','No. '+displayDocket(c.docket)].filter(Boolean).map(esc).join(' · ')}</span></div>
      <div class="appearance-actions">${transcript?button('Transcript','open',transcript.id,'outline'):''}${c.audio?.url?button(icon('play')+'Listen','listen',c.id,'outline'):''}</div></article>`;
  }).join('')||'<p class="empty">No arguments recorded for this term.</p>'}</div></section></main>`;
}

function peoplePage(){
 const type=state.route==='profile'?state.profileType:state.route,name=state.profileName,titles={areas:'Areas of law',justices:'Justices',advocates:'Advocates',amici:'Amici'},entries=entityEntries(type);
 if(state.route!=='profile')return peopleDirectory(type,entries,titles[type]);
 if(type==='justices')return justiceProfile(name);
 if(type==='advocates')return advocateProfile(name,entries);
 const profile=profiles[name],record=entries.find(e=>e.name===name),all=(record?.ids||[]).map(id=>caseMap.get(id)),terms=[...new Set(all.map(c=>String(c.term||catalog.term)))].sort().reverse();
 const cs=all.filter(c=>state.profileTerm==='all'||String(c.term||catalog.term)===state.profileTerm);const events=[...new Map(cs.flatMap(c=>participation(c,name).map(o=>({...o,c}))).map(o=>[(o.sourceUrl||o.readId)+'|'+o.author+'|'+o.type+'|'+o.authored,o])).values()];
 const counts={court:events.filter(o=>o.authored&&/Court|plurality/i.test(o.type)).length,concur:events.filter(o=>o.authored&&/concur/i.test(o.type)).length,dissent:events.filter(o=>o.authored&&/dissent/i.test(o.type)).length,joined:events.filter(o=>!o.authored).length};
 const filtered=cs.filter(c=>state.participation==='all'||participation(c,name).some(o=>state.participation==='written'?o.authored:state.participation==='joined'?!o.authored:new RegExp(state.participation,'i').test(o.type)));
 return `<main class="main profile-page"><div class="breadcrumb">${button(titles[type],'route',type)}</div><section class="profile-hero">${['justices','advocates'].includes(type)?portrait(name,'profile-portrait'):type==='amici'?amicusArt():''}<div class="profile-summary"><div class="profile-introduction"><span class="profile-role">${esc(profile?.role||({advocates:'Advocate',justices:'Justice',amici:'Amicus participant',areas:'Area of law'}[type]))}</span><h1>${esc(type==='areas'?titleCaseLabel(name):name)}</h1>${profile?.bio?`<p class="profile-bio">${esc(profile.bio)}</p>`:''}<div class="profile-tags">${(profile?.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div>${profile?.sourceUrl?external(profile.sourceUrl,'Biography'):''}</div>${type==='justices'?justiceVoice(name):''}</div>${profile?.facts?.length?`<dl class="profile-facts">${profile.facts.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(/^\d{4}-\d{2}-\d{2}$/.test(f.value)?date(f.value):f.value)}</dd></div>`).join('')}</dl>`:''}</section>
 <section class="participation-section"><div class="section-title"><h2>${type==='justices'?'Opinions & participation':type==='advocates'?'Argument appearances':type==='amici'?'Briefs & cases':'Cases'}</h2><label class="term-select"><select id="profile-term" aria-label="Filter by October term"><option value="all">All available terms</option>${terms.map(t=>`<option value="${t}" ${state.profileTerm===t?'selected':''}>October Term ${t}</option>`).join('')}</select></label></div>
 ${type==='justices'?`<div class="participation-summary">${[['Court / plurality',counts.court],['Concurrences',counts.concur],['Dissents',counts.dissent],['Opinions joined',counts.joined]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span><div class="bar"><i style="width:${Math.max(2,n/Math.max(1,...Object.values(counts))*100)}%"></i></div></div>`).join('')}</div><div class="participation-filter" aria-label="Filter participation">${[['all','All participation'],['written','Written'],['joined','Joined'],['concur','Concurrences'],['dissent','Dissents']].map(([v,t])=>button(t,'participation',v,state.participation===v?'active':'')).join('')}</div>`:''}
 <div class="profile-cases">${filtered.map(c=>`<article class="participation-case"><div class="participation-case-heading"><span class="docket">${esc(displayDocket(c.docket))} · OT ${c.term||catalog.term}</span>${caseLink(c)}${c.decision?.vote?`<span class="small muted">${esc(c.decision.vote)}</span>`:''}</div>${type==='justices'?participation(c,name).map(o=>`<div class="participation-row"><span class="participation-role ${/dissent/i.test(o.type)?'dissent':''}">${o.authored?'Wrote':'Joined'}</span><span>${esc(o.type)}${!o.authored?' · '+esc(o.author):''}</span>${o.readId?button('Read','open',o.readId,'outline'):''}${!o.authored?joiningNote(o,name):''}</div>`).join(''):type==='advocates'?`<div class="participation-row"><span>${esc(advocateRole((c.advocates||[]).find(a=>a.name===name)?.role))}</span>${(c.advocates||[]).find(a=>a.name===name)?.documentId?button('Transcript','open',(c.advocates||[]).find(a=>a.name===name).documentId,'outline'):''}${c.audio?.url?button('Listen','listen',c.id,'outline'):''}</div>`:type==='amici'?c.documents.filter(d=>category(d)==='Amicus'&&amicusIdentity(amiciName(d))===name&&!d.auxiliary).map(docRow).join(''):''}</article>`).join('')||'<p class="empty">No matching participation.</p>'}</div></section></main>`;
}

function caseDocuments(c){if(editedCaseDocuments.has(c?.id))return editedCaseDocuments.get(c.id);const sections=opinionSections[c?.id]||[],parents=new Set(sections.map(d=>d.parentDocumentId)),timed=[...docs.values()].filter(d=>d.caseId===c?.id&&d.timedSession),backing=new Set(timed.map(d=>d.pdfSourceId).filter(Boolean));return [...(c?.documents||[]).filter(d=>(!d.filedFor||d.filedFor===c.id)&&!parents.has(d.id)&&!backing.has(d.id)&&!/^questions? presented[. ]*$/i.test(d.title)),...sections,...timed]}

function portrait(name,cls){const p=profiles[name],illustrated=cls!=='profile-portrait'&&p?.illustrationPath,path=illustrated?p.illustrationPath:p?.portraitPath;return path?`<figure class="${cls}${illustrated?' illustrated-portrait':''}"><img src="${esc(path)}" alt="${esc(name)}" ${cls==='profile-portrait'?'':'loading="lazy"'}>${cls==='profile-portrait'?`${p.type==='justice'?justiceSignature(name):''}`:''}</figure>`:`<div class="${cls} portrait-initials" aria-hidden="true">${esc(name.split(' ').filter(x=>x.length>2).map(x=>x[0]).slice(0,2).join(''))}</div>`}
function justiceSignature(name) {
  const signature=justiceSignatures[name];
  return signature?.path?`<figcaption class="justice-signature"><img src="${esc(signature.path)}" alt="Signature of ${esc(name)}"></figcaption>`:'';
}
function justiceVoice(name){const quotes=justiceQuotes[name]||[];if(!quotes.length)return '';if(!quoteChoices.has(name))quoteChoices.set(name,Math.floor(Math.random()*quotes.length));const q=quotes[quoteChoices.get(name)%quotes.length];return `<section class="justice-voice" aria-label="In their words"><blockquote>“${esc(q.text)}”</blockquote><div class="quote-attribution"><a href="${esc(safeUrl(q.sourceUrl))}" target="_blank" rel="noopener noreferrer">${esc(q.sourceTitle)}${q.year?' · '+esc(q.year):''}</a></div>${q.context?`<p class="quote-context">${esc(q.context)}</p>`:''}</section>`}
function justiceNames(){return Object.values(profiles).filter(p=>p.type==='justice').sort((a,b)=>{const chief=p=>/chief justice/i.test(p.role||'');if(chief(a)!==chief(b))return chief(a)?-1:1;const joined=p=>p.facts?.find(f=>f.label==='Joined the Court')?.value||'9999';return joined(a).localeCompare(joined(b))}).map(p=>p.name)}
function participation(c,name){const ops=c.decision?.opinions||[],unanimous=/unanimous/i.test(c.decision?.compositionText||'');return ops.filter(o=>o.author===name||o.joinedBy?.includes(name)||(unanimous&&/Opinion of the Court/i.test(o.type)&&!new RegExp(name.split(' ').at(-1)+'.{0,70}took no part','i').test(c.decision.compositionText))).map(o=>({...o,authored:o.author===name,readId:(opinionSections[c.id]||[]).find(d=>d.opinionAuthor===o.author&&d.opinionType===o.type)?.id||o.documentId}))}
function questionHTML(raw){if(!raw)return '<p class="qp-text">See the petition for the questions presented.</p>';const m=/The questions? presented (?:is|are)[:\s]+/i.exec(raw);if(!m||m.index<100)return `<div class="qp-text">${esc(raw)}</div>`;const question=raw.slice(m.index+m[0].length).trim();return `<div class="qp-text">${esc(question)}</div><details class="question-context"><summary>Background</summary><p>${esc(raw.slice(0,m.index).trim())}</p></details>`}




function homePage(){const year=Number(currentTerm.term||catalog.term),activity=recentCourtActivity(),current=justiceNames().filter(name=>profiles[name]?.isCurrentJustice===true);return `<main class="main front-page"><section class="front-hero"><div class="front-intro"><h1>The Supreme Court, in Context</h1><p>Read the briefs, hear the arguments, and follow the precedents behind the Court’s decisions.</p><div class="front-actions"><a class="front-primary" href="#/cases?term=${year}">Browse October Term ${year} ${icon('arrow')}</a><a href="#/cases?view=all">Browse All Cases</a></div></div><figure><img src="${esc(courtPhoto.path||'images/court-exterior.jpg')}" alt="${esc(courtPhoto.alt||'The Supreme Court of the United States')}"></figure></section><div class="front-middle"><section class="front-recent"><header><h2>Recent Court Activity</h2></header><div>${activity.map(x=>button(`<time datetime="${x.date}">${shortdate(x.date)}</time><span><small>${esc(x.label)}</small><strong>${esc(x.c.name)}</strong></span>`,'case',x.c.id,'front-event')).join('')||'<p>No recent court events.</p>'}</div></section><section class="front-feature">${featuredCaseCard()}</section></div><section class="front-court"><header><h2>Current Court</h2><a href="#/justices">View Justices ${icon('arrow')}</a></header><div class="current-bench">${current.map(n=>button(`${portrait(n,'home-justice-portrait')}<span>${esc(n)}</span>`,'entity','justices|'+n,'bench-person')).join('')}</div></section></main>`}
function workspaceDock(){const entries=Object.entries(state.workspaces||{}).filter(([id,w])=>caseMap.has(id)&&w.tabs?.length);return entries.length?`<nav class="workspace-dock" aria-label="Open readers">${entries.map(([id,w])=>`<div class="workspace-task ${state.route==='reader'&&state.workspaceId===id?'active':''}">${button(`<span>${esc(caseMap.get(id).name)}</span>`,'workspace',id,'workspace-resume',`aria-label="${state.route==='reader'&&state.workspaceId===id?'Minimize':'Resume'} ${esc(caseMap.get(id).name)}" title="${esc(caseMap.get(id).name+'\n'+w.tabs.map(t=>documentLabel(ds(t))).join('\n'))}"`)}${button(icon('close'),'workspace-close',id,'workspace-close',`aria-label="Close reader for ${esc(caseMap.get(id).name)}"`)}</div>`).join('')}</nav>`:''}
function saveWorkspace(){if(!state.workspaceId)return;state.workspaces=state.workspaces||{};state.workspaces[state.workspaceId]=Object.fromEntries(workspaceFields.map(k=>[k,structuredClone(state[k]??(k==='tabs'||k==='refs'||k==='pdfDocs'?[]:null))]))}
function switchWorkspace(id){if(state.workspaceId===id)return;saveWorkspace();const w=state.workspaces[id]||{tabs:[],active:null,split:null,refs:[],ref:null,side:false,tool:'info',docGroup:'All',pdfDocs:[],tabCases:{}};state.workspaceId=id;for(const k of workspaceFields)state[k]=structuredClone(w[k]??(k==='tabs'||k==='refs'||k==='pdfDocs'?[]:k==='tabCases'?{}:null));state.caseId=id}
function locationKey(){const q=new URLSearchParams();let path=state.route;if(path==='cases'){if(state.termView==='all')q.set('view','all');else{if(state.termExplicit)q.set('term',state.browseTerm);if(state.termChooserOpen)q.set('view','terms')}}if(path==='applications'&&state.applicationTerm&&state.applicationTerm!=='all')q.set('term',state.applicationTerm);if(path==='case'){path+='/'+encodeURIComponent(state.caseId);if(state.caseSection)q.set('section',state.caseSection)}if(path==='profile'){path+='/'+encodeURIComponent(state.profileType)+'/'+encodeURIComponent(state.profileName);if(state.profileTerm&&state.profileTerm!=='all')q.set('term',state.profileTerm)}if(state.route==='reader'){path+='/'+encodeURIComponent(state.workspaceId||state.caseId);if(state.active)q.set('doc',state.active)}if(['cases','applications'].includes(state.route)&&state.query)q.set('q',state.query);return '#/'+path+(q.size?'?'+q:'')}
function syncLocation(){if(!historyReady||restoringHistory)return;const next=locationKey();if(location.hash!==next)history.pushState(null,'',next)}
function readLocation(){const [path,query='']=location.hash.replace(/^#\/?/,'').split('?'),parts=path.split('/').map(x=>decodeURIComponent(x)),q=new URLSearchParams(query);state.route=['home','about','terms','applications','cases','case','reader','profile','areas','justices','advocates','amici','library'].includes(parts[0])?parts[0]:'home';if(state.route==='cases'||state.route==='terms'){const year=Number(state.route==='terms'?parts[1]:q.get('term'));state.termExplicit=termYears().includes(year);state.termChooserOpen=q.get('view')==='terms'||state.route==='terms'&&!parts[1];state.route='cases';state.browseTerm=state.termExplicit?year:termYears()[0];state.sitting=q.get('sitting')||defaultSitting(state.browseTerm);state.termView=q.get('view')==='all'?'all':'sittings';state.argumentMonth='';state.termArea=''}if(state.route==='applications'){const year=Number(q.get('term'));state.applicationTerm=termYears(true).includes(year)?year:'all';state.termChooserOpen=false;state.applicationStatus='';state.query=q.get('q')||''}if(state.route==='case'){state.caseId=caseMap.has(parts[1])?parts[1]:cases[0]?.id;state.caseSection=q.get('section')||'Decision'}if(state.route==='profile'){state.profileType=['areas','justices','advocates','amici'].includes(parts[1])?parts[1]:'justices';state.profileName=parts[2]||'';state.profileTerm=termYears().includes(Number(q.get('term')))?q.get('term'):'all';state.participation='all'}if(state.route==='reader'){if(!caseMap.has(parts[1])){state.route='home';return}switchWorkspace(parts[1]);state.caseId=parts[1];const id=canonicalDocId(q.get('doc'));if(id&&docs.has(id)){const owner=caseMap.has(ds(id).caseId)?ds(id).caseId:parts[1];if(owner!==state.workspaceId){state.tabs=state.tabs.filter(x=>x!==id);saveWorkspace();switchWorkspace(owner);state.caseId=owner}if(!state.tabs.includes(id))state.tabs.push(id);state.active=id;state.tabCases[id]=owner}}if(state.route==='cases')state.query=q.get('q')||''}
window.addEventListener('popstate',()=>{storePositions();saveWorkspace();restoringHistory=true;readLocation();render();restoringHistory=false;if(state.route!=='reader')window.scrollTo(0,0)});
document.addEventListener('submit',e=>{if(e.target.id==='home-search-form'){e.preventDefault();state.query=document.querySelector('#home-search').value;route('cases')}});


const displayMaps=new Map(),readingCache=new Map(),runningLineCache=new WeakMap();
function noteMatches(n,id){return (n.sourceDocId||n.docId)===annotationSourceId(id)||(!n.sourceDocId&&n.docId===id&&!ds(id)?.timedSession)}
function lowerBound(map,value){let lo=0,hi=map.length;while(lo<hi){const mid=(lo+hi)>>1;if(map[mid]<value)lo=mid+1;else hi=mid}return lo}
function normalizedMargin(s){return s.replace(/\d+/g,'#').replace(/\s+/g,' ').trim()}
function runningLines(data){if(runningLineCache.has(data))return runningLineCache.get(data);const counts=new Map();for(const p of data.pages){const lines=p.text.split('\n').map(x=>x.trim()).filter(Boolean);for(const t of new Set([...lines.slice(0,4),...lines.slice(-3)].map(normalizedMargin)))if(t.length>5&&t.length<100)counts.set(t,(counts.get(t)||0)+1)}const repeated=new Set([...counts].filter(([s,n])=>n>=Math.max(3,Math.ceil(data.pages.length*.18))).map(([s])=>s));runningLineCache.set(data,repeated);return repeated}
function readingText(raw,id,page,data,start=0,end=raw.length,includeFootnotes=false){
 if(ds(id)?.editorContent){const text=raw.slice(start,end),map=Array.from({length:text.length},(_,i)=>start+i);displayMaps.set(id+':'+page,map);return {text,map}}
 const mapKey=id+':'+page+(includeFootnotes?':fn:'+start:''),key=mapKey+':'+start+':'+end;if(readingCache.has(key)){const c=readingCache.get(key);displayMaps.set(mapKey,c.map);return c}
 if(ds(id)?.type==='Statute'){
    const text=raw.slice(start,end),map=Array.from({length:text.length},(_,i)=>start+i);
    displayMaps.set(mapKey,map);readingCache.set(key,{text,map});return {text,map};
 }
 const structure=structureFor(id,data);if(!includeFootnotes){if(page<structure.bodyStart.page)return {text:'',map:[]};if(page===structure.bodyStart.page)start=Math.max(start,structure.bodyStart.offset)}const all=[...raw.matchAll(/[^\n]*(?:\n|$)/g)].filter(m=>m[0]),lines=[];
 const isTranscript=category(ds(id))==='Argument';
 for(let i=0;i<all.length;i++){
  const m=all[i];let value=m[0].replace(/\n$/,''),a=m.index,b=a+value.length;if(b<=start||a>=end)continue;if(!includeFootnotes&&structure.omitRanges.some(r=>r.page===page&&a>=r.start&&b<=r.end&&(r.expectedText===undefined||raw.slice(r.start,r.end)===r.expectedText)))continue;if(!includeFootnotes&&layoutPage(id,page)?.footnotes?.some(f=>a>=f.start&&a<f.end))continue;
  if(a<start){value=value.slice(start-a);a=start}if(b>end)value=value.slice(0,end-a);
  const leading=value.match(/^\s*/)[0].length;a+=leading;value=value.trim();
  const edge=i<5||i>=all.length-4,verifiedHeading=structure.headings.some(h=>h.page===page&&Math.abs(h.start-a)<3);
  if(!value){lines.push({text:'',at:a});continue}
  const folio = value.replace(/^\((.+)\)$/, '$1');
  if (edge && !verifiedHeading && /^[ivxlcdm]+$/.test(folio) && folio === data.pages[page]?.label) continue;
  if(edge&&!verifiedHeading&&(/^(?:USCA\d+ Case:|Page Proof Pending Publication|Cite as:|OCTOBER TERM,?\s+\d|Heritage Reporting Corporation|Official - Subject to Final Review)/i.test(value)||/^\d{1,4}$/.test(value)||/^(?:Opinion of the Court|Opinion of (?:[A-Z][a-z]+|[A-Z]+),?\s+(?:C\.\s*)?J\.|Syllabus|(?:[A-Z][a-z]+|[A-Z]+),?\s+J\.,?\s+(?:concurring|dissenting))$/i.test(value)))continue;
  if(edge&&!verifiedHeading&&(/^(?:\d+\s+)?[A-Z][A-Z ,.'’\-]+\s+v\.\s+[A-Z][A-Z ,.'’\-]+(?:\s+\d+)?$/.test(value)))continue;
  if(isTranscript){const number=value.match(/^\d{1,2}\s+/);if(number){a+=number[0].length;value=value.slice(number[0].length)}}
  lines.push({text:value,at:a});
 }
 let text='',map=[],previous='',blank=false;
 function add(str,at){text+=str;for(let j=0;j<str.length;j++)map.push(at+j)}
 for(const line of lines){if(!line.text){blank=true;continue}const t=line.text;
  const heading=/^(?:[IVXLC]+|[A-H]|\d{1,2})\.?$/.test(t)||(/^[A-Z\s\d.,:;()'’—–-]{4,85}$/.test(t)&&/[A-Z]{3}/.test(t));
  const prevHeading=/^(?:[IVXLC]+|[A-H]|\d{1,2})\.?$/.test(previous)||(/^[A-Z\s\d.,:;()'’—–-]{4,85}$/.test(previous)&&/[A-Z]{3}/.test(previous));
  const sameHeading=structure.headings.some(h=>h.page===page&&line.at>h.start&&line.at<h.end);const isLayoutStart=layoutPage(id,page)?.paragraphStarts?.some(n=>n>=line.at-3&&n<=line.at+3);const paragraph=!sameHeading&&(isLayoutStart||blank||heading||prevHeading||(/^\(?[a-z0-9]{1,2}[.)]\s/.test(t)&&!/^n\.\s*\d/.test(t))||(isTranscript&&/^(?:JUSTICE|CHIEF JUSTICE|MR\.|MS\.|MRS\.)\s/.test(t)));
  if(text){if(text.endsWith('-')&&/^[a-z]/.test(t)&&!paragraph){text=text.slice(0,-1);map.pop()}else{const sep=paragraph?'\n\n':' ';text+=sep;for(let j=0;j<sep.length;j++)map.push(Math.max(map.at(-1)||0,line.at-1))}}
  add(t,line.at);previous=t;blank=false;
 }
 let result=normalizeReadingTypography(text,map);result=repairReading(result,structure.repairs.filter(r=>r.page===page),raw);result=tidyHeadingSpace(result,structure.headings.filter(h=>h.page===page).map(h=>extendHeadingMarker(h,structure)));result=tidyFootnoteMarkers(result,(structure.footnoteMarkers||[]).filter(m=>m.page===page));readingCache.set(key,result);displayMaps.set(mapKey,result.map);return result;
}
function paneTools(id,second){const d=ds(id),data=docCache.get(id),pdf=state.pdfDocs?.includes(id)||!d.textPath,range=d.sourceRange;return `<span class="reading-format">${pdf?'Original PDF':'Reading view'}</span>${!pdf&&data?`<label class="page-jump-label">Source p. <input type="number" min="${(range?.startPage||0)+1}" max="${range?(range.endPage+(range.endOffset?1:0)):data.pages.length}" value="${Number(state.positions[id]?.page??range?.startPage??0)+1}" data-page-input="${esc(id)}" aria-label="Jump to source page"></label>`:''}${d.textPath?button(pdf?'Reading view':'Original PDF','pdf-toggle',id):''}${second?button(icon('close'),'single','','',`aria-label="Close split view"`):state.split?button('Switch pane','swap','','mobile-switch'):''}`}
let marginFrame;
function scheduleMargins(){cancelAnimationFrame(marginFrame);marginFrame=requestAnimationFrame(layoutMargins)}
// Use the first rendered line, not an inline element's multi-line bounding box.
function marginAnchor(el,origin){const range=document.createRange();range.selectNodeContents(el);const rect=[...range.getClientRects()].find(r=>r.height&&r.width)||el.getBoundingClientRect();return rect.top+rect.height/2-origin}
function layoutMargins(){
 document.querySelectorAll('.document-body').forEach(article=>{
  const aside=article.querySelector('.document-margin');if(!aside)return;aside.replaceChildren();
  const origin=article.getBoundingClientRect().top,seen=new Set(),rows=[];
  const add=(el,key,html)=>{if(seen.has(key))return;seen.add(key);const center=marginAnchor(el,origin);let row=rows.find(r=>Math.abs(r.center-center)<6);if(!row){row={center,items:[]};rows.push(row)}row.items.push(html)};
  if(state.marginNotes){
   for(const el of article.querySelectorAll('.page-text [data-annotation],.page-text .citation')){
    const noteId=el.dataset.annotation,key=noteId||el.dataset.refKey;if(!key)continue;
    if(noteId){const n=state.notes.find(n=>n.id===noteId);add(el,'note:'+key,button(icon(n?.comment?'note':'highlight')+`<span class="margin-label">${esc(n?.comment||'Highlight')}</span>`,'edit-margin-note',noteId,'margin-note',`aria-label="${esc(n?.comment||'Highlight')}" title="${esc(n?.comment||'Highlight')}" data-note-preview="${esc(noteId)}"`))}
    else{const number=refsIndex.get(key)?.number;add(el,'ref:'+key,`<button class="margin-reference" data-ref-key="${esc(key)}" aria-label="Preview ${esc(el.textContent)}" title="${esc(el.textContent)}">${icon('book')}${number?`<small>${esc(number)}</small>`:''}<span class="margin-label">${esc(el.textContent)}</span></button>`)}
   }
   for(const n of state.notes.filter(n=>noteMatches(n,article.dataset.document)&&!seen.has('note:'+n.id))){const target=article.querySelector(`.page-text[data-page="${n.page??0}"]`);if(target)add(target,'note:'+n.id,button(icon('note')+`<span class="margin-label">${esc(n.comment||'Note')}</span>`,'edit-margin-note',n.id,'margin-note',`data-note-preview="${esc(n.id)}" aria-label="Open note" title="${esc(n.comment||'Note')}"`))}
   for(const row of rows){const item=document.createElement('div');item.className='margin-item';item.style.top=row.center+'px';if(row.items.length===1)item.innerHTML=row.items[0];else{const labels=row.items.map(html=>{const template=document.createElement('template');template.innerHTML=html;return template.content.querySelector('small')?.textContent||'•'});item.innerHTML=button(icon('book')+`<small>${esc(labels.join(', '))}</small>`,'margin-group','','margin-group',`aria-label="${row.items.length} references and notes on this line" title="References and notes on this line" aria-haspopup="true"`);item.querySelector('button')._marginItems=row.items.join('')}aside.append(item)}
  }
  article.querySelectorAll('.page-marker').forEach(m=>{const text=m.nextElementSibling;if(text){const r=document.createRange();r.selectNodeContents(text);if(text.firstChild)r.setEnd(text.firstChild,text.firstChild.nodeType===3?Math.min(1,text.firstChild.length):0);m.style.top=(r.getBoundingClientRect().top-origin)+'px'}});
 });positionSelection();
}
function showMarginGroup(trigger){return mountMenu(trigger,`<h3>On this line</h3><div class="margin-reference-list">${trigger._marginItems}</div>`)}
document.addEventListener('click',event=>{const trigger=event.target.closest('[data-action="margin-group"]');if(trigger)showMarginGroup(trigger)});
document.addEventListener('pointerover',event=>{const trigger=event.target.closest('[data-action="margin-group"]');if(trigger&&event.pointerType!=='touch'&&!trigger.contains(event.relatedTarget)){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>{if(trigger.isConnected&&readerMenuTrigger!==trigger)showMarginGroup(trigger)},250)}});
document.addEventListener('pointerout',event=>{const trigger=event.target.closest('[data-action="margin-group"]');if(trigger&&!trigger.contains(event.relatedTarget))clearTimeout(hoverTimer)});

window.addEventListener('resize',scheduleMargins);
document.fonts?.ready.then(scheduleMargins);
document.fonts?.addEventListener('loadingdone',scheduleMargins);

async function init(){try{loadedContentBase=await readContentBase().catch(()=>null);catalog=await sourceJSON('data/catalog.json');[readingLayout,argumentAlignment,pdfPaths,readerStructure,referenceSummaries]=await Promise.all(['data/reading-layout.json','data/argument-alignment.json','data/pdf-paths.json','data/reader-structure.json','data/reference-summaries.json'].map(u=>sourceJSON(u).catch(()=>({}))));try{caseDisplay=await fetchContent('data/case-display.json').then(r=>r.ok?r.json():{})}catch{};[profiles,opinionSections,justiceQuotes,justiceSignatures]=await Promise.all(['data/profiles.json','data/opinion-sections.json','data/justice-quotes.json','data/justice-signatures.json'].map(u=>fetchContent(u).then(r=>{if(!r.ok)throw Error(u);return r.json()})));[currentTerm,currentTextIndex,caseIssues,courtPhoto,collectionPhoto]=await Promise.all(['data/current-term.json','data/current-text-index.json','data/case-issues.json','data/court-photo.json','data/collection-photo.json'].map(u=>sourceJSON(u).catch(()=>({}))));const supplementary = await Promise.all(['verified-votes','case-milestones','record-supplement','opinion-section-overrides','current-areas','term-benches'].map(name=>fetchContent('data/'+name+'.json').then(r=>{if(!r.ok)throw Error(name);return r.json()})));
 [verifiedVotes,milestones,recordSupplement,,currentAreas,termBenches]=supplementary;
 Object.assign(opinionSections,supplementary[3]);
 const photos=await fetchContent('data/advocate-portraits.json').then(r=>r.ok?r.json():{});
 for(const [name,photo] of Object.entries(photos))profiles[name]={name,type:'advocate',...profiles[name],...photo};
 for(const list of Object.values(opinionSections)){
   for(const section of list){
     const parent=section.parentDocumentId;
     if(parent&&(!splitParents.has(parent)||section.opinionType==='Opinion of the Court'))splitParents.set(parent,section.id);
   }
 }
 cases=[...catalog.cases,...(currentTerm.cases||[])].map(mergeCaseSources).map(c=>({...c,id:String(c.id||c.docket),docket:String(c.docket||c.id),documents:(c.documents||[]).map(d=>({...d,...(currentTextIndex[d.id]||{}),id:String(d.id),caseId:String(c.id||c.docket)}))}));caseMap=new Map(cases.map(c=>[c.id,c]));docs=new Map(cases.flatMap(c=>c.documents).map(d=>[d.id,d]));for(const d of catalog.authorities||[])docs.set(d.id,d);for(const list of Object.values(opinionSections))for(const d of list)docs.set(d.id,d);for(const c of cases){const cite=validCitation(c);if(cite&&!caseByCitation.has(authorityKey(cite)))caseByCitation.set(authorityKey(cite),c);const opinion=c.documents.find(d=>category(d)==='Decision'&&d.textPath);if(opinion&&c.citation)opinion.citation=c.citation}registerReferenceSummaries();registerTimedTranscripts();normalizeReaderDocuments();state.notes=state.notes.filter(meaningfulNote);for(const [id,path]of Object.entries(pdfPaths))if(docs.has(id)&&!docs.get(id).pdfPath)docs.get(id).pdfPath=path;if(location.hash.startsWith('#/reader')||[...state.tabs,...Object.values(state.workspaces).flatMap(w=>w.tabs||[])].some(id=>id.startsWith('reference-')))await loadExtendedAuthorities();state.pdfDocs=(state.pdfDocs||[]).filter(id=>embeddedPDF(ds(id)));for(const w of Object.values(state.workspaces))w.pdfDocs=(w.pdfDocs||[]).filter(id=>embeddedPDF(ds(id)));state.tabs=state.tabs.filter(id=>docs.has(id));if(!docs.has(state.active))state.active=state.tabs[0]||null;if(!docs.has(state.split))state.split=null;if(!caseMap.has(state.caseId))state.caseId=cases[0]?.id;state.saved=state.saved.filter(id=>caseMap.has(id));state.recents=state.recents.filter(id=>docs.has(id));for(const ref of state.refs){ref.canonical=ref.canonical||ref.summary?.citation;refsIndex.set(ref.key,ref)}document.title='Ninefold · U.S. Supreme Court';if(!state.workspaceId&&state.tabs.length){state.workspaceId=state.tabCases[state.active]||ds(state.active)?.caseId;saveWorkspace()}for(const [id,w] of Object.entries(state.workspaces)){w.tabs=(w.tabs||[]).filter(id=>docs.has(id));if(!docs.has(w.active))w.active=w.tabs[0]||null;if(!docs.has(w.split))w.split=null}restoringHistory=true;readLocation();restoringHistory=false;history.replaceState(null,'',locationKey());historyReady=true;document.documentElement.style.setProperty('--reader-size',state.textSize+'px');if(loadedContentBase&&await readContentBase().catch(()=>null)!==loadedContentBase)loadedContentBase=null;captureImportedContent();appReady=true;render();initializeAccount();window.__court={get state(){return state},get catalog(){return catalog},get docs(){return docs},get cache(){return docCache}}}catch(e){sourceFailed=true;app.innerHTML=`<main class="main"><h1>Collection unavailable</h1><p style="margin-top:20px">The term collection could not load. Please refresh once the import is ready.</p><p class="small muted">${esc(e.message)}</p></main>`;console.error(e)}}
init();

document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.term-case')){e.preventDefault();e.target.click()}});
let readingLayout={},argumentAlignment={},pdfPaths={},readerStructure={},referenceSummaries={},selectionRange=null,peekAnchor=null,readerMenu=null,readerMenuTrigger=null;
let audioSession=null,followTranscript=true,narration=null,narrationToken=0,playbackExpanded=false,lastSpokenKey=null;
const pdfCache=new Map(),pdfLoading=new Map();
function layoutPage(id,page){const key=textSourceId(id),layout=readingLayout[key]?.[page]||{},footnotes=readerStructure[key]?.footnotes?.filter(f=>f.page===page);return footnotes?.length?{...layout,footnotes}:layout}
function documentLabel(d){if(!d)return 'Document';if(d.editorTitle)return d.title;if(d.timedSession||category(d)==='Argument')return 'Transcript';if(/per curiam/i.test(d.opinionType||''))return 'Per Curiam Opinion';if(!d.sourceRange&&Object.values(opinionSections).some(list=>list.some(x=>x.parentDocumentId===d.id)))return 'Syllabus & Opinions';return d.title}
function readerCaseInfo(c) {
  if (!c) return '';
  const vote = verifiedVotes[c.id];
  const areas = caseAreas(c);
  const dates = [['Review Granted', c.granted], ['Argued', c.argued], ['Decided', c.decided]].filter(([,value]) => value);
  const groups = (vote?.groups || []).map(({label, names}) => `<section class="reader-vote-group"><h4>${esc(label)}</h4><ul>${names.map(name => {
    const label = name.replace(/,? Jr\.$/, '').split(' ').at(-1);
    return `<li>${button(portrait(name, 'reader-vote-portrait') + `<span>${esc(label)}</span>`, 'entity', 'justices|' + name, 'reader-voter', `title="${esc(name)}" aria-label="${esc(name)}"`)}</li>`;
  }).join('')}</ul></section>`).join('');
  return `<div class="reader-case-info">
    <h2>${esc(c.name)}</h2><div class="reader-case-meta"><span>No. ${esc(displayDocket(c.docket))}</span><a href="#/case/${encodeURIComponent(c.id)}">Case Page</a></div>
    ${areas.length ? `<div class="reader-case-areas">${areas.map(area => button(esc(area), 'entity', 'areas|' + area)).join('')}</div>` : ''}
    <h3>${esc(caseDisplay[c.id]?.outcomeLabel || outcomeLabel(c))}</h3>${caseDisplay[c.id]?.beneficiaryText?`<p class="judgment-beneficiary">${esc(caseDisplay[c.id].beneficiaryText)}</p>`:''}
    ${c.decision?.holding ? `<p>${esc(c.decision.holding)}</p>` : ''}
    ${dates.length ? `<dl class="reader-case-dates">${dates.map(([label,value]) => `<dt>${label}</dt><dd>${date(value)}</dd>`).join('')}</dl>` : ''}
    ${vote ? `<section class="reader-votes"><h3>Vote${vote.label ? ' · ' + esc(vote.label) : ''}</h3>${votePortraits(c)}</section>` : ''}
  </div>`;
}

function readerDocuments(c, activeDoc) {
  const emergency = isApplication(c);
  const order = emergency
    ? [['Decision','Orders & Opinions'],['Application','Application & Responses'],['Amicus','Amicus Briefs'],['Argument','Oral Argument'],['Appendices','Appendices'],['Lower courts','Lower Court']]
    : [['Decision','Opinions'],['Syllabus','Syllabus'],['Argument','Oral Argument'],['Certiorari','Certiorari'],['Merits','Merits Briefs'],['Amicus','Amicus Briefs'],['Appendices','Appendices'],['Lower courts','Lower-Court Opinions']];
  const documents = caseDocuments(c).filter(doc => !doc.auxiliary || materialGroup(doc)==='Lower courts');
  const groupFor = doc => {
    const group=materialGroup(doc);
    return emergency && (['Merits','Certiorari'].includes(group) || group==='Other' && /^(application|response|reply)/i.test(doc.title)) ? 'Application' : group;
  };
  const sections = order.map(([group,label]) => ({group, label, items: documents.filter(doc => groupFor(doc) === group)})).filter(section => section.items.length);
  const preferred = activeDoc && groupFor(activeDoc);
  const initial = sections.some(section => section.group === preferred) ? preferred : sections[0]?.group;
  const expanded = state.expandedDocGroups?.[c.id] ?? [initial];
  const sectionHTML = sections.map(({group,label,items}) => {
    const rows = items.map(doc => {
      const title = category(doc) === 'Amicus' ? amiciName(doc) : documentLabel(doc);
      const filed = doc.date && !['Decision','Argument','Syllabus'].includes(group);
      return `<div class="explorer-document"><button class="explorer-document-main" data-action="open" data-value="${esc(doc.id)}" ${doc.id === state.active ? 'aria-current="page"' : ''}><strong>${esc(title)}</strong>${filed ? `<small>Filed ${date(doc.date)}</small>` : ''}</button>
        ${button('⋯','document-menu',doc.id,'explorer-document-options',`aria-label="Options for ${esc(title)}"`)}
      </div>`;
    }).join('');
    return `<details class="explorer-section" data-doc-section="${esc(group)}" ${expanded.includes(group) ? 'open' : ''}><summary><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg><span>${esc(label)}</span></summary>${rows}</details>`;
  }).join('');
  return `<div class="explorer-documents" data-case-docs="${esc(c.id)}">${sectionHTML}</div>`;
}
function sidebarContent(){const d=ds(state.focusedDoc||state.active),c=contextCase(d?.id);
 if(state.tool==='info')return readerCaseInfo(c);
 if(state.tool==='docs')return readerDocuments(c,d);
 if(state.tool==='contents'){const data=docCache.get(state.pdfDocs?.includes(d?.id)&&d?.pdfSourceId?d.pdfSourceId:state.active);if(!data)return '<p class="small muted">Open a document to see its contents.</p>';if(category(d)==='Argument'&&!d.timedSession&&!state.pdfDocs?.includes(d.id))return '<p class="small muted">Speaker conversation · Synchronized timing is not yet available for this recording.</p>';if(d.timedSession&&!state.pdfDocs?.includes(d.id))return `<div class="conversation-contents">${d.timedSession.turns.filter((t,i)=>i===0||t.section!==d.timedSession.turns[i-1].section).map(t=>button(`<span>${time(t.start)}</span>${esc((t.section===0?'Argument · ':'')+t.speaker)}`,'transcript-seek',d.id+'|'+t.start,'listbutton')).join('')}</div>`;const headings=contentsFor(d,data),pdf=state.pdfDocs?.includes(d.id),count=d.sourceRange?d.sourceRange.endPage+(d.sourceRange.endOffset?1:0):data.pages.length;return `${pdf&&!nativePDF(d.id)?`<div class="document-navigation"><label>Page <input type="number" data-page-input="${esc(d.id)}" min="${(d.sourceRange?.startPage||0)+1}" max="${count}" value="${Number(state.positions[d.id+':pdf']?.page??d.sourceRange?.startPage??0)+1}" aria-label="Go to page"></label><span>of ${count}</span></div>`:''}<nav class="contents-outline" aria-label="Document sections">${headings.length?headings.map(h=>button(`<span class="contents-label">${esc(h.label||h.text)}</span>${h.excerpt?`<span class="contents-excerpt">${esc(h.excerpt)}</span>`:''}`,'heading-jump',d.id+'|'+h.page+'|'+h.offset,'contents-entry '+(h.level?'subheading':''))).join(''):'<p class="small muted">This document has no section headings.</p>'}</nav>`}
 if(state.tool==='notes'){const ns=state.notes.filter(n=>noteBelongsToDocument(n,state.active)&&meaningfulNote(n));return `<div class="notes-toolbar">${button(icon('download'),'export','','',`aria-label="Export notes" title="Export notes"`)}</div>${ns.slice().reverse().map(n=>noteCard(n)).join('')||'<p class="small muted">Select text to highlight it or add a comment.</p>'}`}
 if(state.tool==='refs')return referencesSidebar();return ''}
function contentsFor(d,data){const structure=structureFor(d.id,data),range=d.sourceRange;return structure.headings.filter(h=>!range||(h.page>range.startPage||h.page===range.startPage&&h.start>=range.startOffset)&&(h.page<range.endPage||h.page===range.endPage&&h.start<range.endOffset)).filter(h=>!/^(?:table of (?:contents|authorities)|contents|authorities)$/i.test(h.text)).map(h=>({text:h.text,label:h.text,page:h.page,offset:h.start,level:h.level||0}))}
function clearSelection(){selection=null;selectionRange=null;overlays.querySelector('.selection-tools')?.remove()}
function clearTransient(){overlays.querySelector('.global-search-dialog[open]')?.close();clearPeek();closeReaderMenu();clearSelection()}
function positionSelection(){const t=overlays.querySelector('.selection-tools');if(!t||!selectionRange)return;const anchor=selectionRange.startContainer.parentElement,scroll=anchor?.closest('.doc-scroll');if(!scroll?.isConnected){t.hidden=true;return}const bounds=scroll.getBoundingClientRect(),rects=[...selectionRange.getClientRects()],r=rects.find(x=>x.bottom>bounds.top+2&&x.top<bounds.bottom-4);t.hidden=!r;if(!r)return;t.style.left=Math.max(bounds.left+8,Math.min(r.left,Math.min(bounds.right,innerWidth)-t.offsetWidth-8))+'px';t.style.top=Math.max(bounds.top+5,Math.min(r.top-t.offsetHeight-8,bounds.bottom-t.offsetHeight-5))+'px'}
function closeReaderMenu(restoreFocus=false){const trigger=readerMenuTrigger;overlays.querySelector('.reader-popover')?.remove();trigger?.setAttribute('aria-expanded','false');readerMenu=null;readerMenuTrigger=null;if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true})}
function mountMenu(trigger,html,cls=''){const repeated=readerMenu&&readerMenuTrigger===trigger;closeReaderMenu();if(repeated)return null;const el=document.createElement('section');el.className='reader-popover '+cls;el.innerHTML=html;overlays.append(el);const r=trigger.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.left,innerWidth-el.offsetWidth-8))+'px';el.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-el.offsetHeight-8))+'px';readerMenu=el;readerMenuTrigger=trigger;trigger.setAttribute('aria-expanded','true');return el}
function embeddedPDF(d) {
  return !!(d?.pdfPath || ds(d?.parentDocumentId)?.pdfPath || ds(d?.pdfSourceId)?.pdfPath || filedPDF(d));
}
function filedPDF(d) {
  if(d?.editorPdfUrl){try{return normalizePDFURL(d.editorPdfUrl);}catch{return '';}}
  if(!d || d.category==='Authority') return '';
  const url=d.sourceUrl||d.sourceMirrorUrl;
  return /\.pdf(?:$|[?#])/i.test(url||'') ? url : '';
}
function originalPDFLink(d){const url=filedPDF(d)||filedPDF(ds(d?.parentDocumentId));return url?`<a class="external original-pdf-link" data-open-original href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">Open original PDF in new tab</a>`:''}
function viewMenu(trigger){const d=ds(state.active),pdf=isPDF(d?.id),native=!!nativePDF(d?.id);mountMenu(trigger,`<h3>View</h3>${embeddedPDF(d)?`<div class="segmented" role="group" aria-label="Document format">${button('Reading','format','reading',pdf?'':'active',!d?.textPath&&!d?.timedSession?'disabled aria-label="Reading view unavailable for this scanned filing"':'')}${button('PDF','format','pdf',pdf?'active':'')}</div>`: filedPDF(d)?external(filedPDF(d),'Open Filed PDF'):''}${pdf?(native?'<p class="small muted">Use the browser PDF viewer controls to zoom and change pages.</p>':`<label class="menu-field">Zoom<select id="pdf-zoom" aria-label="PDF zoom">${[['width','Fit Width'],['page','Fit Page'],['0.75','75%'],['1','100%'],['1.25','125%'],['1.5','150%'],['2','200%']].map(([v,t])=>`<option value="${v}" ${(state.pdfZoom?.[d.id]||'width')===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="document-navigation"><label>Page <input type="number" data-page-input="${esc(d.id)}" min="${(d.sourceRange?.startPage||0)+1}" max="${d.sourceRange?d.sourceRange.endPage+(d.sourceRange.endOffset?1:0):d.pageCount||docCache.get(d.id)?.pages.length||999}" value="${Number(state.positions[d.id+':pdf']?.page??d.sourceRange?.startPage??0)+1}" aria-label="Go to page"></label></div>`):`<label class="menu-field">Text Size<input id="text-size" type="range" min="14" max="24" value="${state.textSize}" aria-label="Text size"></label><label class="view-check"><input id="page-markers" type="checkbox" ${state.pageMarkers?'checked':''}>Page Numbers</label><label class="view-check"><input id="margin-notes" type="checkbox" ${state.marginNotes?'checked':''}>Margin Icons</label>`}${d?.scanOnly?'<p class="small muted">This scanned filing is available as its original PDF. Extracted text is not available.</p>':''}${originalPDFLink(d)}${state.split?button('Close Split View','single','','listbutton'):''}`)}
function isPDF(id){const d=ds(id);return state.pdfDocs?.includes(id)||(!d?.textPath&&!d?.timedSession)}
function listenMenu(trigger){const c=audioCase?caseMap.get(audioCase):contextCase(state.active),d=ds(state.active);mountMenu(trigger,`<h3>${audioCase?'Argument Audio':'Listen'}</h3>${audioCase?`<label class="menu-field">Volume<input class="playback-volume" type="range" min="0" max="1" step="0.05" value="${audio.volume}" aria-label="Audio volume"></label>${currentTimedDoc()?button(followTranscript?'Following Transcript':'Follow Transcript','follow-transcript','',followTranscript?'active listbutton':'listbutton'):''}`:''}${d&&(d.textPath||d.timedSession)?button(icon('play')+(d.timedSession?'Read Transcript':'Read Document'),'read-aloud','','listbutton'):''}${c?.audio?.url?button(icon('play')+'Oral Argument Recording','listen',c.id,'listbutton'):''}${!audioCase?`<label class="menu-field">Narration Voice<select id="natural-voice">${[['af_heart','Heart · American'],['af_bella','Bella · American'],['bm_george','George · British']].map(([v,label])=>`<option value="${v}" ${(state.naturalVoice||'af_heart')===v?'selected':''}>${label}</option>`).join('')}</select></label>`:''}`)}

function openOptions(trigger,id){const isOpen=state.tabs.includes(id),current=state.active===id;mountMenu(trigger,`${button(isOpen?(current?'Current Document':'Show Tab'):'Open in New Tab','open',id,'listbutton',current?'disabled':'')}${state.active&&id!==state.active?button(state.split===id?'Close Split View':'Open Side by Side',state.split===id?'single':'split-doc',id,'listbutton'):''}`,'open-menu')}

function transcriptHTML(id,data){const d=ds(id),session=d.timedSession,c=contextCase(id);return `<article class="document-body conversation ${state.marginNotes?'show-margin-notes':''}" data-document="${esc(id)}"><header class="conversation-header"><div><h2>Oral Argument</h2><p>${date(c.argued)}</p></div>${button(icon('play')+'Listen','transcript-seek',id+'|0','outline')}</header>${session.turns.map((t,i)=>{const {text,map}=conversationText(t);displayMaps.set(id+':'+i,map);const speaker=speakerProfile(t.speaker),justice=speaker?.type==='justice';return `<section class="speaker-turn source-page ${justice?'justice-turn':'advocate-turn'}" data-page="${i}" data-turn="${i}" data-start="${t.start}" data-end="${t.end}"><div class="speaker-avatar ${speaker?.illustrationPath?'illustrated-speaker':''}">${speaker?.portraitPath?`<img src="${esc(speaker.illustrationPath||speaker.portraitPath)}" alt="${esc(t.speaker)}">`:`<span>${esc(t.speaker.split(' ').filter(x=>x.length>1).map(x=>x[0]).slice(0,2).join(''))}</span>`}</div><div class="speaker-message"><header><strong>${esc(t.speaker)}</strong>${button(time(t.start),'transcript-seek',id+'|'+t.start,'turn-time',`aria-label="Play ${esc(t.speaker)} at ${time(t.start)}"`)}</header><div class="page-text" data-text-doc="${esc(id)}" data-page="${i}">${timedParagraphs(text,map,t,id,i)}</div></div></section>`}).join('')}<footer class="transcript-credit">${session.timingMethod==='speech-aligned'?`<a href="${esc(safeUrl(d.sourceUrl))}" target="_blank" rel="noopener">Official Court transcript</a> · Timing aligned to the Court recording by Ninefold. Timestamps are approximate.`:`Transcript and timing: <a href="${esc(safeUrl(d.attributionUrl))}" target="_blank" rel="noopener">Oyez</a> · <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a>. Reformatted for reading.`}</footer><aside class="document-margin"></aside></article>`}
function registerTimedTranscripts(){for(const [caseId,record]of Object.entries(argumentAlignment)){const c=caseMap.get(caseId);if(!c)continue;const filed=c.documents.filter(d=>category(d)==='Argument'&&!d.auxiliary);record.sessions.forEach((session,i)=>{const source=filed[i]||filed[0],id=caseId+'-argument-'+session.id;if(source&&(!transcriptAliases.has(source.id)||source.caseId===caseId))transcriptAliases.set(source.id,id);docs.set(id,{id,caseId,title:'Transcript',category:'Argument',type:'Transcript',timedSession:session,pdfSourceId:source?.id,pdfPath:source?.pdfPath||pdfPaths[source?.id],sourceUrl:source?.sourceUrl||session.sourceUrl,attributionUrl:record.attributionUrl,date:c.argued});docCache.set(id,{pages:session.turns.map((t,i)=>({number:i+1,text:t.text}))})})}migrateTranscriptWorkspaces()}

function currentTimedDoc(){return [...docs.values()].find(d=>d.caseId===audioCase&&d.timedSession?.id===audioSession)}
function clearSpoken(){CSS.highlights?.delete('spoken');document.querySelectorAll('.speaker-turn.speaking').forEach(el=>el.classList.remove('speaking'));lastSpokenKey=null}
function updateTranscript(){
 const d=currentTimedDoc();if(!d||audio.ended){clearSpoken();return}
 const turns=d.timedSession.turns,i=turns.findIndex(t=>audio.currentTime>=t.start&&audio.currentTime<t.end),turn=turns[i];
 const selector=`.doc-scroll[data-doc="${CSS.escape(d.id)}"] .speaker-turn[data-turn="${i}"]`;
 document.querySelectorAll('.speaker-turn.speaking').forEach(el=>{if(!el.matches(selector))el.classList.remove('speaking')});
 document.querySelectorAll(selector).forEach(el=>el.classList.add('speaking'));
 const sentence=turn?sentenceAtTime(turn,audio.currentTime):null,key=sentence?`${d.id}:${i}:${sentence.start}:${sentence.end}`:null;
 CSS.highlights?.delete('spoken');
 if(sentence){const el=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(d.id)}"] .page-text[data-page="${i}"]`),map=displayMaps.get(d.id+':'+i);if(el&&map){const range=textRange(el,lowerBound(map,sentence.start),lowerBound(map,sentence.end));if(range){if(CSS.highlights)CSS.highlights.set('spoken',new Highlight(range));if(followTranscript&&key!==lastSpokenKey){const scroll=el.closest('.doc-scroll'),box=range.getBoundingClientRect(),bounds=scroll.getBoundingClientRect();if(box.top<bounds.top+30||box.bottom>bounds.bottom-30)scroll.scrollBy({top:box.top-bounds.top-Math.min(90,bounds.height/4),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}}}}
 lastSpokenKey=key;
 const label=document.querySelector('#current-speaker');if(label)label.textContent=turn?.speaker||'Oral argument';
 const face=document.querySelector('#audio-speaker-portrait'),name=turn?.speaker;
 if(face&&face.dataset.speaker!==(name||'')){face.dataset.speaker=name||'';const person=name?speakerProfile(name):null;face.classList.toggle('illustrated-speaker',!!person?.illustrationPath);face.innerHTML=name?(person?.portraitPath?`<img src="${esc(person.illustrationPath||person.portraitPath)}" alt="">`:`<span>${esc(name.split(' ').filter(x=>x.length>1).map(x=>x[0]).slice(0,2).join(''))}</span>`):''}
}
function stopArgument(){audio.pause();audio.removeAttribute('src');audioCase=null;audioSession=null;playbackExpanded=false;clearSpoken();closeReaderMenu();refreshPlayback()}
function skipSpokenCitations(text){return text.replace(/\b\d+\s+U\.?\s*S\.?\s*C\.?\s*§{0,2}\s*[\w.()–-]+/g,'').replace(/\b\d+\s+(?:U\.?\s*S\.?|F\.(?:2d|3d|4th)|S\.\s*Ct\.|A\.(?:2d|3d))\s+\d+(?:,\s*\d+(?:[–-]\d+)?)?(?:\s*\(\d{4}\))?/g,'').replace(/\b\d{4}\s+WL\s+\d+(?:,?\s*at\s*\*?[\d–-]+)?/g,'').replace(/\b(?:Fed\.?\s*R\.?\s*Civ\.?\s*P\.?|Rule|Section)\s*\d+(?:\.\d+)*(?:\([\w]+\))*/g,'').replace(/§{1,2}\s*\d+[\w().–-]*/g,'').replace(/\b\d+\s+Del\.?\s+C\.?\s*§?\s*\d+[\w().–-]*/g,'').replace(/\b(?:Id\.|Ibid\.)\s*(?:at\s*\*?[\d–-]+)?/g,'').replace(/\(\s*\)/g,'').replace(/\s+([,.;:!?])/g,'$1').replace(/[,;]\s*([.!?])/g,'$1').replace(/\s+/g,' ').trim()}
function narrationChunks(id){const data=docCache.get(id),d=ds(id),chunks=[];if(!data)return chunks;data.pages.forEach((p,page)=>{if(d.sourceRange&&(page<d.sourceRange.startPage||page>d.sourceRange.endPage))return;const start=page===d.sourceRange?.startPage?d.sourceRange.startOffset:0,end=page===d.sourceRange?.endPage?d.sourceRange.endOffset:p.text.length,original=d.timedSession?{text:p.text,map:Array.from(p.text,(_,i)=>i)}:readingText(p.text,id,page,data,start,end),clean={text:original.text,map:original.map},structure=structureFor(id,data),markers=structure.footnoteMarkers?.filter(m=>m.page===page)||[];if(markers.length)clean.text=Array.from(clean.text,(ch,i)=>markers.some(m=>clean.map[i]>=m.start&&clean.map[i]<m.end)?' ':ch).join('');const cuts=new Set([0,clean.text.length]);for(const m of clean.text.matchAll(/\n\n+/g)){cuts.add(m.index);cuts.add(m.index+m[0].length)}for(const h of structure.headings.filter(h=>h.page===page)){cuts.add(lowerBound(clean.map,h.start));cuts.add(lowerBound(clean.map,h.end))}const sorted=[...cuts].sort((a,b)=>a-b);for(let i=0;i<sorted.length-1;i++){const from=sorted[i],part=clean.text.slice(from,sorted[i+1]);for(const m of part.matchAll(/.{1,220}(?:\s|$)|\S{1,220}/gs)){const speech=skipSpokenCitations(m[0]);if(!/[a-zA-Z]/.test(speech))continue;const at=from+m.index;chunks.push({page,start:at,length:m[0].length,sourceStart:clean.map[at]??0,text:speech})}}});return chunks}
let voiceWorker=null,voiceRequest=0;const voicePending=new Map(),narrationAudio=new Audio();narrationAudio.preload='auto';
function getVoiceWorker(){if(voiceWorker)return voiceWorker;voiceWorker=new Worker('./narration-worker.js',{type:'module'});voiceWorker.onmessage=({data})=>{if(data.type==='progress'){if(narration?.loading){const n=overlays.querySelector('.voice-progress')||document.querySelector('.voice-progress');if(n)n.textContent=data.progress.status==='progress'&&data.progress.total>10000000?'Preparing Voice '+Math.round(data.progress.progress)+'%':'Preparing Voice…'}return}const p=voicePending.get(data.id);if(!p)return;voicePending.delete(data.id);data.type==='audio'?p.resolve(data):p.reject(new Error(data.message))};voiceWorker.onerror=()=>{for(const p of voicePending.values())p.reject(new Error('Voice engine could not load'));voicePending.clear()};return voiceWorker}
function generateChunk(n,index){if(!n.chunks[index])return Promise.resolve(null);if(n.cache.has(index))return Promise.resolve(n.cache.get(index));if(n.pending.has(index))return n.pending.get(index);const id=++voiceRequest,promise=new Promise((resolve,reject)=>{voicePending.set(id,{resolve,reject});getVoiceWorker().postMessage({id,session:n.token,text:n.chunks[index].text,voice:state.naturalVoice||'af_heart'})}).then(data=>{const value={url:URL.createObjectURL(new Blob([data.wav],{type:'audio/wav'})),duration:data.duration};n.cache.set(index,value);n.pending.delete(index);return value});n.pending.set(index,promise);return promise}
async function playNarrationChunk(n,index,offset=0){if(n!==narration)return;if(index>=n.chunks.length){stopNarration();return}n.index=index;n.loading=true;refreshPlayback();try{const clip=await generateChunk(n,index);if(n!==narration)return;n.loading=false;narrationAudio.src=clip.url;narrationAudio.playbackRate=state.narrationSpeed||1;narrationAudio.currentTime=Math.max(0,Math.min(offset,clip.duration));if(!n.paused)await narrationAudio.play();const chunk=n.chunks[index],el=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(n.id)}"] .page-text[data-page="${chunk.page}"]`);if(el){highlightNarration(el,chunk.start,chunk.length);const r=textRange(el,chunk.start,chunk.start+Math.min(1,chunk.length)),scroll=el.closest('.doc-scroll');if(r&&scroll){const box=r.getBoundingClientRect(),bounds=scroll.getBoundingClientRect();if(box.top<bounds.top||box.bottom>bounds.bottom)scroll.scrollBy({top:box.top-bounds.top-70,behavior:'smooth'})}}refreshPlayback();if(index+1<n.chunks.length)generateChunk(n,index+1).catch(()=>{});}catch(e){if(n===narration){stopNarration();toast('The natural voice could not load. Check your connection and try again.');console.warn('Natural narration',e.message)}}}
async function startNarration(anchor=null){const id=anchor?.docId||state.active;await ensureDoc(id);const chunks=narrationChunks(id);if(!chunks.length)return;stopNarration();stopArgument();const scroll=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"]`),page=anchor?.page??Number(scroll?visiblePage(scroll):0);let index=chunks.findIndex(c=>c.page>page||c.page===page&&c.sourceStart>=(anchor?.offset||0));if(index<0)index=0;const n={id,token:++narrationToken,index,loading:true,paused:false,chunks,cache:new Map(),pending:new Map()};narration=n;closeReaderMenu();clearSelection();await playNarrationChunk(n,index)}
function stopNarration(){narrationToken++;narrationAudio.pause();narrationAudio.removeAttribute('src');if(narration)for(const value of narration.cache.values())URL.revokeObjectURL(value.url);narration=null;voiceWorker?.postMessage({type:'cancel',session:narrationToken});for(const p of voicePending.values())p.reject(new Error('Cancelled'));voicePending.clear();CSS.highlights?.delete('narration');document.querySelectorAll('.narrating').forEach(e=>e.classList.remove('narrating'));refreshPlayback()}
function highlightNarration(el,start,length){if(!CSS.highlights)return;const r=textRange(el,start,start+length);if(r)CSS.highlights.set('narration',new Highlight(r))}
function showNarrationDock(){refreshPlayback()}
function playbackControls(){const n=narration,active=n||audioCase;if(!active)return button(icon('audio')+'Listen','reader-menu','listen','listen-button');const media=n?narrationAudio:audio,paused=n?n.paused:media.paused;
 return `<div class="playback-strip ${playbackExpanded?'expanded':''}" role="group" aria-label="Audio playback"><div class="playback-primary">${button(icon(paused?'play':'pause'),'playback-toggle','','playback-toggle',`aria-label="${paused?'Play':'Pause'}"`)}<span class="playback-identity">${!n&&currentTimedDoc()?'<span class="audio-speaker-portrait" id="audio-speaker-portrait"></span><span id="current-speaker">Oral argument</span>':`<span>${esc(n?documentLabel(ds(n.id)):'Oral argument')}</span>`}</span><select class="playback-speed" aria-label="Playback speed">${[.75,1,1.25,1.5,2].map(v=>`<option value="${v}" ${(n?state.narrationSpeed||1:audio.playbackRate)===v?'selected':''}>${v}×</option>`).join('')}</select>${button(icon('chevron'),'playback-expand','','playback-expand',`aria-expanded="${playbackExpanded}" aria-controls="playback-secondary" aria-label="${playbackExpanded?'Collapse':'Expand'} audio controls"`)}</div><div id="playback-secondary" class="playback-secondary">${button(skipIcon(false),'playback-skip','-10','skip-audio',`aria-label="Back 10 seconds" ${n?.loading?'disabled':''}`)}${button(skipIcon(true),'playback-skip','10','skip-audio',`aria-label="Forward 10 seconds" ${n?.loading?'disabled':''}`)}${state.seekOpen?`<input class="playback-seek" type="range" min="0" max="${Number.isFinite(media.duration)?media.duration:0}" value="${media.currentTime||0}" step="0.1" aria-label="Seek audio">${button(time(media.currentTime),'seek-toggle','','seek-close','aria-label="Show elapsed time"')}`:button(time(n?narrationElapsed():audio.currentTime),'seek-toggle','','playback-time','aria-label="Show audio seek bar"')}${state.route!=='reader'?button(icon('file'),'return-audio','','return-audio','aria-label="Return to transcript or document"'):''}${button(icon('audio'),'playback-settings','','',`aria-label="Audio options"`)}${button(icon('close'),'playback-close','','',`aria-label="Stop audio"`)}</div>${n?.loading?'<span class="voice-progress" role="status">Preparing Audio…</span>':''}</div>`}
function narrationElapsed(){if(!narration)return 0;return [...narration.cache].filter(([index])=>index<narration.index).reduce((n,[,clip])=>n+clip.duration,0)+narrationAudio.currentTime}
function refreshPlayback(){let slot=document.querySelector('#reader-playback,#global-playback');if(state.route!=='reader'){if(!audioCase&&!narration){document.querySelector('#global-playback')?.remove();return}if(!slot){app.querySelector('.nav-account')?.insertAdjacentHTML('beforebegin','<div id="global-playback"></div>');slot=document.querySelector('#global-playback')}}if(slot){slot.innerHTML=playbackControls();if(audioCase&&!narration)updateTranscript()}}
async function skipPlayback(seconds){if(!narration){audio.currentTime=Math.max(0,Math.min(Number.isFinite(audio.duration)?audio.duration:Infinity,audio.currentTime+seconds));return}const n=narration;let index=n.index,position=narrationAudio.currentTime+seconds;narrationAudio.pause();while(position<0&&index>0){const prev=await generateChunk(n,--index);position+=prev.duration}while(index<n.chunks.length-1){const clip=await generateChunk(n,index);if(position<clip.duration)break;position-=clip.duration;index++}if(n===narration)await playNarrationChunk(n,index,Math.max(0,position))}
narrationAudio.addEventListener('ended',()=>{if(narration)playNarrationChunk(narration,narration.index+1)});
narrationAudio.addEventListener('timeupdate',()=>{const label=document.querySelector('.playback-time');if(label&&narration)label.textContent=time(narrationElapsed())});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]'),a=b?.dataset.action;if(a==='playback-toggle'){if(narration){narration.paused=!narration.paused;if(!narration.loading){if(narration.paused)narrationAudio.pause();else narrationAudio.play().catch(()=>toast('Tap Play to resume.'))}}else if(audio.paused)audio.play().catch(()=>toast('Tap Play to start.'));else audio.pause();refreshPlayback()}else if(a==='playback-close'){stopNarration();stopArgument()}else if(a==='playback-skip')await skipPlayback(Number(b.dataset.value));else if(a==='playback-settings')listenMenu(b);else if(a==='narrate-selection'&&selection&&narration?.id===selection.docId){const x=selection;await startNarration({docId:x.docId,page:x.anchors[0].page,offset:x.anchors[0].start})}});
document.addEventListener('change',e=>{if(e.target.matches('.playback-speed')){const rate=Number(e.target.value);if(narration){state.narrationSpeed=rate;narrationAudio.playbackRate=rate;persist()}else audio.playbackRate=rate}if(e.target.id==='natural-voice'){state.naturalVoice=e.target.value;persist();if(narration){const c=narration.chunks[narration.index];startNarration({docId:narration.id,page:c.page,offset:c.sourceStart})}}});

function textRange(el,start,end){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),r=document.createRange();let n,at=0,begun=false;while(n=w.nextNode()){const next=at+n.length;if(!begun&&start<=next){r.setStart(n,Math.max(0,start-at));begun=true}if(begun&&end<=next){r.setEnd(n,Math.max(0,end-at));return r}at=next}return null}
function jumpHeading(id,page,offset){if(state.pdfDocs?.includes(id)){jumpPage(id,page);return}const el=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"] .page-text[data-page="${page}"]`);if(!el)return;const pos=lowerBound(displayMaps.get(id+':'+page)||[],offset),r=textRange(el,pos,pos+1),scroll=el.closest('.doc-scroll');if(r)scroll.scrollBy({top:r.getBoundingClientRect().top-scroll.getBoundingClientRect().top-30,behavior:'smooth'})}

async function loadSourcePDF(url) {
  if (pdfCache.has(url)) return pdfCache.get(url);
  if (!pdfLoading.has(url)) {
    const task=pdfjsLib.getDocument({url,cMapUrl:'vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'vendor/pdfjs/standard_fonts/'}).promise;
    pdfLoading.set(url,task.then(pdf=>{pdfCache.set(url,pdf);return pdf;}).finally(()=>pdfLoading.delete(url)));
  }
  return pdfLoading.get(url);
}
function nativePDF(id){return app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"] .native-pdf-frame`)}
function showNativePDF(id,scroll,source){
 const d=ds(id),sourcePage=scroll._pdfJump??state.positions[id+':pdf']?.page??d.sourceRange?.startPage??0;
 const page=source.sliced?Math.max(0,sourcePage-(d.sourceRange?.startPage||0)):sourcePage;
 const url=nativePDFURL(source.url,page,location.href);if(!url)return false;
 const reading=d.textPath||d.timedSession;
 scroll.innerHTML=`<section class="native-pdf" aria-label="Original PDF"><div class="native-pdf-status"><p>The interactive PDF reader could not open this file. Your browser's PDF viewer is shown below. ${reading?'Use Reading view to add highlights and comments.':'Ninefold highlights are unavailable in this viewer.'}${d.sourceRange&&!source.sliced?` This is the full original filing; this section starts on PDF page ${d.sourceRange.startPage+1}.`:''}</p><div>${reading?button('Reading View','pdf-toggle',id,'outline'):''}${originalPDFLink(d)||`<a class="external" data-open-original href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open PDF in new tab</a>`}</div><p class="small muted">Page position in this viewer is not saved. If the PDF does not appear, open it in a new tab.</p></div><iframe class="native-pdf-frame" ${d.editorPdfUrl?'sandbox="allow-scripts allow-downloads"':''} title="${esc(d.title||'Original PDF')}" src="${esc(url)}" referrerpolicy="no-referrer"></iframe></section>`;
 delete scroll._pdfJump;scroll._pdfPreparing=false;scroll.dataset.nativePDF='true';if(state.side&&state.tool==='contents')refreshSidebar();return true;
}
async function renderPDF(id){
 const d=ds(id),scroll=app.querySelector(`.doc-scroll[data-doc="${CSS.escape(id)}"]`);if(!d||!scroll)return;
 const request={};scroll._pdfRequest=request;scroll._pdfPreparing=true;scroll._pdfObserver?.disconnect();delete scroll.dataset.nativePDF;
 const current=()=>scroll.isConnected&&scroll._pdfRequest===request;
 const sources=pdfSources(d,ds);let selected,pdf,lastError;
 try{
  if(d.pdfSourceId)await ensureDoc(d.pdfSourceId);
  for(const source of sources){try{pdf=await loadSourcePDF(source.url);selected=source;break}catch(error){lastError=error}if(!current())return}
  if(!current())return;
  if(!pdf)throw lastError||new Error('No PDF source is available');
  const {first,last,sourceOffset}=pdfPageRange(d,selected,pdf.numPages);
  const layout=await preparePDFLayout(pdf,first,last,{width:Math.max(100,scroll.clientWidth-(innerWidth<760?16:36)),height:scroll.clientHeight,zoom:state.pdfZoom?.[id]||'width'},current);
  if(!current()||!layout)return;
  scroll.innerHTML=`<article class="pdf-document" data-document="${esc(id)}">${layout.map(({index:pi,viewport})=>{const source=pi+sourceOffset;return `<section class="pdf-page source-page" data-page="${source}" data-pdf-page="${pi}" style="width:${viewport.width}px;height:${viewport.height}px"><canvas></canvas><div class="textLayer" data-text-doc="${esc(id)}" data-page="${source}"></div><div class="pdf-notes"></div><span class="pdf-page-number">${source+1}</span></section>`}).join('')}</article>`;
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&!entry.target.dataset.loaded){entry.target.dataset.loaded='true';drawPDFPage(pdf,entry.target,id,current).catch(error=>{if(current()){console.warn('PDF page unavailable',id,error.message);observer.disconnect();scroll._pdfRequest={};showNativePDF(id,scroll,selected)}})}},{root:scroll,rootMargin:'1000px'});
  scroll.querySelectorAll('.pdf-page').forEach((el,j)=>{el._pdfViewport=layout[j].viewport;observer.observe(el)});scroll._pdfObserver=observer;scroll._pdfPreparing=false;restorePositions(scroll);if(scroll._pdfJump!==undefined){const page=scroll._pdfJump;delete scroll._pdfJump;jumpPage(id,page)}
 }catch(e){
  if(!current())return;
  scroll._pdfRequest={};scroll._pdfPreparing=false;const source=sources.find(s=>s.url===filedPDF(d))||sources[0];
  if(!source||!showNativePDF(id,scroll,source))scroll.innerHTML=`<div class="reader-empty"><h2>PDF Could Not Load</h2>${d.textPath||d.timedSession?button('Reading View','pdf-toggle',id,'outline'):''}<p>The PDF could not load in the reader.</p>${button('Retry PDF','retry-pdf',id)}${originalPDFLink(d)}</div>`;
  console.warn('PDF unavailable',id,e.message);
 }
}
async function drawPDFPage(pdf,el,id,current=()=>true){if(!el.isConnected||!current())return;const page=await pdf.getPage(Number(el.dataset.pdfPage)+1);if(!el.isConnected||!current())return;const viewport=el._pdfViewport,ratio=Math.min(devicePixelRatio||1,2),canvas=el.querySelector('canvas');el.style.setProperty('--scale-factor',viewport.scale);el.style.setProperty('--total-scale-factor',viewport.scale);canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;if(!el.isConnected||!current())return;const layer=el.querySelector('.textLayer');const text=await page.getTextContent();if(!el.isConnected||!current())return;await new pdfjsLib.TextLayer({textContentSource:text,container:layer,viewport}).render();if(!el.isConnected||!current())return;renderPDFNotes(el.closest('.doc-scroll'))}
function normalizedText(text){let clean='',map=[];for(let i=0;i<text.length;i++){let c=text[i].normalize('NFKD').toLowerCase();if(/[a-z0-9]/.test(c))for(const ch of c){clean+=ch;map.push(i)}}return {clean,map}}
function readPDFSelection(r){const first=r.startContainer.parentElement?.closest('.pdf-document'),last=r.endContainer.parentElement?.closest('.pdf-document');if(!first||first!==last)return;const id=first.dataset.document,data=docCache.get(ds(id)?.pdfSourceId||id),anchors=[],pdfRects=[];for(const page of first.querySelectorAll('.pdf-page')){const layer=page.querySelector('.textLayer');if(!r.intersectsNode(layer))continue;const partial=r.cloneRange();if(!layer.contains(r.startContainer))partial.setStart(layer,0);if(!layer.contains(r.endContainer))partial.setEnd(layer,layer.childNodes.length);const quote=partial.toString(),pi=Number(page.dataset.page),raw=data?.pages[pi]?.text||'',norm=normalizedText(raw),needle=normalizedText(quote).clean,at=norm.clean.indexOf(needle);if(needle&&at>=0)anchors.push({page:pi,start:norm.map[at],end:norm.map[at+needle.length-1]+1,quote:raw.slice(norm.map[at],norm.map[at+needle.length-1]+1)});const box=page.getBoundingClientRect();for(const rect of partial.getClientRects()){if(rect.width<1||rect.height<1)continue;pdfRects.push({page:pi,x:(rect.left-box.left)/box.width,y:(rect.top-box.top)/box.height,w:rect.width/box.width,h:rect.height/box.height})}}if(!pdfRects.length)return;selection={docId:id,sourceDocId:ds(id)?.pdfSourceId||textSourceId(id),anchors,pdfRects,quote:r.toString()};selectionRange=r.cloneRange();overlays.querySelector('.selection-tools')?.remove();const t=document.createElement('div');t.className='selection-tools';t.innerHTML=`<div class="colors">${['yellow','blue','pink','mint'].map(c=>button('','highlight',c,'swatch '+c,`aria-label="Highlight ${c}"`)).join('')}</div>${button(icon('note')+'Comment','comment')}${narration?.id===id?button(icon('play')+'Read From Here','narrate-selection'):''}${button(icon('close'),'dismiss-selection','','',`aria-label="Close annotation tools"`)}`;overlays.append(t);positionSelection()}
function renderPDFNotes(scroll){if(!scroll)return;const id=scroll.dataset.doc,data=docCache.get(ds(id)?.pdfSourceId||id);for(const page of scroll.querySelectorAll('.pdf-page')){const layer=page.querySelector('.textLayer'),overlay=page.querySelector('.pdf-notes'),pi=Number(page.dataset.page),box=page.getBoundingClientRect();overlay.innerHTML='';for(const n of state.notes.filter(n=>noteMatches(n,id))){let rects=n.pdfRects?.filter(r=>r.page===pi)||[];if(!rects.length&&data&&layer.textContent){const norm=normalizedText(layer.textContent);for(const a of (n.anchors||[]).filter(a=>a.page===pi)){const needle=normalizedText(data.pages[pi].text.slice(a.start,a.end)).clean,at=norm.clean.indexOf(needle);if(at<0||!needle)continue;const r=textRange(layer,norm.map[at],norm.map[at+needle.length-1]+1);if(r)rects.push(...[...r.getClientRects()].map(x=>({x:(x.left-box.left)/box.width,y:(x.top-box.top)/box.height,w:x.width/box.width,h:x.height/box.height})))}}for(const r of rects)overlay.insertAdjacentHTML('beforeend',`<button class="pdf-highlight ${n.color||'yellow'}" data-annotation="${n.id}" title="${esc(n.comment||'Highlight')}" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.w*100}%;height:${r.h*100}%"></button>`)}}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]'),a=b?.dataset.action,v=b?.dataset.value;if(!e.target.closest('.reader-popover')&&!['reader-menu','tab-menu','document-menu','playback-settings','all-tabs','margin-group'].includes(a))closeReaderMenu();if(!e.target.closest('.peek,[data-ref-key],[data-annotation],[data-note-preview]'))clearPeek();if(a==='all-tabs'){showReaderTabList(b)}else if(a==='reader-menu'){v==='view'?viewMenu(b):listenMenu(b)}else if(a==='tab-menu'||a==='document-menu')openOptions(b,v);else if(a==='format'){const id=state.active;state.pdfDocs=(state.pdfDocs||[]).filter(x=>x!==id);if(v==='pdf')state.pdfDocs.push(id);rememberDocumentFormat(id,v==='pdf');render()}else if(a==='heading-jump'){const [id,page,offset]=v.split('|');jumpHeading(id,Number(page),Number(offset))}else if(a==='remove-ref'){state.refs=state.refs.filter(r=>r.key!==v);if(state.ref===v)state.ref=state.refs[0]?.key;refreshSidebar();persist()}else if(a==='transcript-seek'){const [id,start]=v.split('|'),d=ds(id);await listen(d.caseId,d.timedSession.id,Number(start));updateTranscript()}else if(a==='follow-transcript'){followTranscript=!followTranscript;b.classList.toggle('active',followTranscript);b.setAttribute('aria-pressed',String(followTranscript));b.textContent=followTranscript?'Following':'Follow';if(followTranscript){lastSpokenKey=null;updateTranscript()}}});
document.addEventListener('change',e=>{if(e.target.id==='narration-voice'){state.voice=e.target.value;persist()}if(e.target.id==='narration-speed'){state.narrationSpeed=Number(e.target.value);persist()}});
document.addEventListener('pointerdown',e=>{if(e.target.closest('.selection-tools'))e.preventDefault();if(!e.target.closest('.selection-tools,.document-body,.pdf-document'))clearSelection()});
document.addEventListener('dragstart',e=>{const tab=e.target.closest('[data-tab-id]');if(!tab)return;e.dataTransfer.setData('application/x-court-document',tab.dataset.tabId);e.dataTransfer.effectAllowed='move';document.body.classList.add('dragging-tab')});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-court-document')&&e.target.closest('.pane,.tab')){e.preventDefault();e.dataTransfer.dropEffect='move'}});
document.addEventListener('drop',e=>{const id=e.dataTransfer.getData('application/x-court-document');if(!id)return;e.preventDefault();document.body.classList.remove('dragging-tab');const target=e.target.closest('[data-tab-id]');if(target){const next=state.tabs.filter(t=>t!==id),at=next.indexOf(target.dataset.tabId);next.splice(at<0?next.length:at,0,id);state.tabs=next;render()}else if(e.target.closest('.pane')&&id!==state.active)openDoc(id,{split:true})});
document.addEventListener('dragend',()=>document.body.classList.remove('dragging-tab'));
document.addEventListener('pointerout',e=>{if(e.target.closest('[data-ref-key]'))clearTimeout(hoverTimer)});
document.addEventListener('scroll',e=>{if(e.target.closest?.('.doc-scroll'))clearTimeout(hoverTimer)},true);
window.addEventListener('resize',()=>{clearPeek();positionSelection()});
audio.addEventListener('timeupdate',updateTranscript);
audio.addEventListener('play',()=>{document.querySelectorAll('[data-action=audio-toggle]').forEach(b=>b.innerHTML=icon('pause'))});audio.addEventListener('pause',()=>{document.querySelectorAll('[data-action=audio-toggle]').forEach(b=>b.innerHTML=icon('play'))});

function conversationText(turn){const segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(turn.text)].map(x=>({text:x.segment,start:x.index})):(turn.blocks||[]).map(x=>({text:x.text,start:turn.text.indexOf(x.text)}));const breaks=new Set();let count=0;for(const part of segments){if(part.start<0)continue;if(count>60){breaks.add(part.start);count=0}count+=part.text.trim().split(/\s+/).length}let text='',map=[];for(let i=0;i<turn.text.length;i++){if(breaks.has(i)&&text){text+='\n\n';map.push(i,i)}text+=turn.text[i];map.push(i)}return {text,map}}

function footnotesHTML(id,data){const d=ds(id),range=d.sourceRange,items=[];data.pages.forEach((p,i)=>{if(range&&(i<range.startPage||i>range.endPage))return;for(const f of layoutPage(id,i)?.footnotes||[]){const start=Math.max(f.start,i===range?.startPage?range.startOffset:0),end=Math.min(f.end,i===range?.endPage?range.endOffset:p.text.length);if(end<=start)continue;const text=readingText(p.text,id,i,data,start,end,true);items.push(`<div class="footnote-entry"><small>${esc(f.label||'Note')}</small><span class="page-text" data-text-doc="${esc(id)}" data-page="${i}" data-map-key="${esc(id+':'+i+':fn:'+start)}">${renderText(text.text,id,i,text.map,id+':'+i+':fn:'+start)}</span></div>`)}});return items.length?`<details class="reader-footnotes"><summary>Footnotes</summary>${items.join('')}</details>`:''}

function tabLabel(d){if(!d)return 'Document';if(d.editorTitle)return d.title;if(d.timedSession||category(d)==='Argument')return 'Transcript';if(!d.sourceRange&&Object.values(opinionSections).some(list=>list.some(x=>x.parentDocumentId===d.id)))return 'Syllabus & Opinions';if(d.opinionType){if(/per curiam/i.test(d.opinionType))return 'Per Curiam';if(/concur|dissent/i.test(d.opinionType)){const last=(d.opinionAuthor||'').replace(/, Jr\.$/,'').split(' ').at(-1);return (/concur/i.test(d.opinionType)?'Concurrence':'Dissent')+(last?' · '+last:'')}return d.opinionType;}if(category(d)==='Amicus')return amiciName(d);if(/reply/i.test(d.title))return 'Reply Brief';if(category(d)==='Merits'){if(/petitioner/i.test(d.title))return 'Petitioner’s Brief';if(/respondent/i.test(d.title))return 'Respondent’s Brief';return 'Merits Brief'}if(/petition for.*certiorari/i.test(d.title))return 'Cert Petition';return d.title.split(' · ')[0]}

function pauseTranscriptFollowing(event){const target=event.target;if(!audioCase||!(target.closest?.('.conversation')||target.closest?.('.doc-scroll')?.querySelector('.conversation')))return;followTranscript=false;const b=document.querySelector('[data-action=follow-transcript]');if(b){b.classList.remove('active');b.setAttribute('aria-pressed','false');b.textContent='Follow Transcript'}}
document.addEventListener('wheel',pauseTranscriptFollowing,{passive:true});
document.addEventListener('touchmove',pauseTranscriptFollowing,{passive:true});
document.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!event.target.closest?.('input,select,textarea,button,[role=button],[contenteditable]'))pauseTranscriptFollowing(event)});

function speakerProfile(name){const aliases={'Neil Gorsuch':'Neil M. Gorsuch','Neal Kumar Katyal':'Neal K. Katyal'};name=aliases[name]||name;if(profiles[name])return profiles[name];const key=x=>String(x||'').replace(/^(?:Chief Justice|Justice)\s+/i,'').replace(/[^a-z]/gi,'').toLowerCase();return Object.values(profiles).find(p=>key(p.name)===key(name))}

const transcriptAliases=new Map();
function canonicalDocId(id){return splitParents.get(id)||transcriptAliases.get(id)||id}
function textSourceId(id){if(ds(id)?.editorContent)return id+'@'+ds(id).editorContent.revision;const d=ds(id);return d?.independentText?id:(d?.parentDocumentId||id)}
function annotationSourceId(id){const d=ds(id);return state.pdfDocs?.includes(id)&&d?.pdfSourceId?d.pdfSourceId:textSourceId(id)}
function noteBelongsToDocument(n,id){const d=ds(id);return canonicalDocId(n.docId)===id||[d?.pdfSourceId,textSourceId(id),id].filter(Boolean).includes(n.sourceDocId||n.docId)}
function positionKey(el){return el.dataset.doc+(el.classList.contains('pdf-scroll')?':pdf':'')}
function migrateTranscriptWorkspaces(){const migrate=w=>{const oldActive=w.active,activeWasPDF=(w.pdfDocs||[]).includes(oldActive);w.tabs=[...new Set((w.tabs||[]).map(canonicalDocId))];w.active=canonicalDocId(w.active);w.split=canonicalDocId(w.split);if(w.active===w.split)w.split=null;w.pdfDocs=[...new Set((w.pdfDocs||[]).map(canonicalDocId))];if(ds(w.active)?.timedSession&&!activeWasPDF)w.pdfDocs=w.pdfDocs.filter(id=>id!==w.active);if(w.tabCases)for(const [id,c]of Object.entries(w.tabCases))w.tabCases[canonicalDocId(id)]=c};migrate(state);for(const w of Object.values(state.workspaces||{}))migrate(w);state.recents=[...new Set(state.recents.map(canonicalDocId))];for(const n of state.notes)if(transcriptAliases.has(n.docId)){n.sourceDocId=n.sourceDocId||n.docId;n.docId=canonicalDocId(n.docId)}for(const [old,id]of transcriptAliases)if(state.positions[old]&&!state.positions[id+':pdf'])state.positions[id+':pdf']=state.positions[old]}

function showNotePeek(trigger){const n=state.notes.find(n=>n.id===trigger.dataset.notePreview);if(!n||!trigger.isConnected)return;clearPeek();peekAnchor=trigger;const el=document.createElement('div');el.className='peek note-peek';el.innerHTML=`<div class="peek-heading"><h3>${n.quote?'Highlight':'Note'}</h3>${button(icon('close'),'dismiss-peek','','',`aria-label="Close preview"`)}</div><div class="peek-content"><p>${esc(n.comment||n.quote||'Empty note')}</p></div>${button('Edit Note','edit-margin-note',n.id)}`;overlays.append(el);const r=trigger.getBoundingClientRect();el.style.left=Math.max(9,Math.min(r.left,innerWidth-el.offsetWidth-9))+'px';el.style.top=Math.max(9,Math.min(r.bottom+7,innerHeight-el.offsetHeight-9))+'px'}

function normalizeReadingTypography(text,map){let out='',offsets=[];for(let i=0;i<text.length;){if(/[ \t\u00a0]/.test(text[i])){let end=i+1;while(end<text.length&&/[ \t\u00a0]/.test(text[end]))end++;const previous=out.at(-1)||'',next=text[end]||'';if(!/[“‘(\[{]/.test(previous)&&!/[.,;:!?%”’\])}]/.test(next)&&previous!=='\n'&&next!=='\n'){out+=' ';offsets.push(map[i])}i=end;continue}const ligatures={'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl','ﬅ':'st','ﬆ':'st'},value=ligatures[text[i]]||text[i];out+=value;for(let j=0;j<value.length;j++)offsets.push(map[i]);i++}return {text:out,map:offsets}}

function showGlobalSearch(){overlays.querySelector('.global-search-dialog')?.remove();const dialog=document.createElement('dialog');dialog.className='global-search-dialog';dialog.setAttribute('aria-label','Search');dialog.innerHTML=`<form method="dialog" class="global-search-top">${icon('search')}<input type="search" aria-label="Search cases and people" placeholder="Cases, justices, advocates…" autocomplete="off"><button aria-label="Close search">${icon('close')}</button></form><div class="global-search-results"></div>`;overlays.append(dialog);const input=dialog.querySelector('input'),results=dialog.querySelector('.global-search-results');input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase(),normalized=q.replace(/[^a-z0-9]/g,'');if(!q){results.innerHTML='';return}const hits=cases.filter(c=>c.name.toLowerCase().includes(q)||normalized&&String(c.docket).replace(/[^a-z0-9]/gi,'').toLowerCase().includes(normalized)).slice(0,8);let html=hits.length?`<h3>Cases</h3>${hits.map(c=>button(`<span class="search-name">${esc(c.name)}</span><small>No. ${esc(displayDocket(c.docket))}</small>`,'case',c.id,'search-result')).join('')}`:'';for(const [type,label]of [['justices','Justices'],['advocates','Advocates'],['areas','Areas of Law'],['amici','Amici']]){const found=entityEntries(type).filter(e=>e.name.toLowerCase().includes(q)).slice(0,4);if(found.length)html+=`<h3>${label}</h3>${found.map(e=>button(`<span class="search-name">${esc(e.name)}</span>`,'entity',type+'|'+e.name,'search-result')).join('')}`}results.innerHTML=html||'<p class="search-empty">No matches.</p>'});input.addEventListener('keydown',event=>{
    if (event.isComposing) return;
    if (event.key==='Escape') {event.preventDefault();dialog.close()}
    if (event.key==='Enter') {event.preventDefault();results.querySelector('.search-result')?.click()}
  });dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('.search-result'))dialog.close()});dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();input.focus()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b?.dataset.action==='global-search')showGlobalSearch();if(b?.dataset.action==='home-sitting'){state.sitting=b.dataset.value;state.termView='sittings';state.query='';state.termArea='';state.argumentMonth='';route('cases')}});

document.addEventListener('click',e=>{const b=e.target.closest('[data-action="next-quote"]');if(!b)return;const name=b.dataset.value,quotes=justiceQuotes[name]||[];if(quotes.length<2)return;quoteChoices.set(name,((quoteChoices.get(name)||0)+1)%quotes.length);b.closest('.justice-voice').outerHTML=justiceVoice(name)});

function showNoteEditor(trigger,id){const n=state.notes.find(x=>x.id===id);if(!n)return;clearPeek();clearSelection();const el=document.createElement('section');el.className='peek note-editor';el.dataset.note=id;el.innerHTML=`<div class="peek-heading"><h3>Passage Note</h3>${button(icon('trash'),'delete-note',n.id,'danger',`aria-label="Delete annotation"`)}${button(icon('close'),'dismiss-peek','','',`aria-label="Close note"`)}</div>${noteCard(n)}${button('Done','dismiss-peek','','note-done')}`;overlays.append(el);const r=trigger.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.right+10,innerWidth-el.offsetWidth-8))+'px';el.style.top=Math.max(8,Math.min(r.top,innerHeight-el.offsetHeight-8))+'px';el.querySelector('textarea')?.focus()}
document.addEventListener('click', event => {
  const summary = event.target.closest('.explorer-section > summary');
  if (!summary) return;
  event.preventDefault();
  const section = summary.parentElement;
  section.open = !section.open;
  const list = section.closest('.explorer-documents');
  state.expandedDocGroups ||= {};
  state.expandedDocGroups[list.dataset.caseDocs] = [...list.querySelectorAll('details[open]')].map(el => el.dataset.docSection);
  persist();
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b?.dataset.action==='edit-margin-note')showNoteEditor(b,b.dataset.value);if(b?.dataset.action==='library-storage')toast('Your library syncs privately with your Ninefold account. Offline changes stay on this device until it reconnects. Export annotations to keep a separate copy.');if(b?.dataset.action==='delete-note'&&overlays.querySelector('.note-editor')?.dataset.note===b.dataset.value)clearPeek();});
document.addEventListener('change',e=>{if(e.target.id==='term-dropdown')chooseTerm(e.target.value);if(e.target.id==='pdf-zoom'){storePositions();state.pdfZoom={...state.pdfZoom,[state.active]:e.target.value};renderPDF(state.active);persist();}});

function justiceTenure(name){const joined=profiles[name]?.facts?.find(f=>/Joined the Court/i.test(f.label))?.value;return joined?String(joined).slice(0,4)+'–Present':''}
const derivedStructures=new Map();
function structureFor(id,data){if(ds(id)?.editorContent||ds(id)?.timedSession)return {bodyStart:{page:0,offset:0},omitRanges:[],headings:[],repairs:[]};const key=textSourceId(id),known=readerStructure[key]||readerStructure[ds(id)?.textPath?.split('/').at(-1)?.replace('.json','')];if(known)return {bodyStart:{page:0,offset:0},omitRanges:[],headings:[],repairs:[],...known};if(derivedStructures.has(key))return derivedStructures.get(key);if(!data)return {bodyStart:{page:0,offset:0},omitRanges:[],headings:[],repairs:[]};const d=ds(key)||ds(id),result={bodyStart:{page:0,offset:0},omitRanges:[],headings:[],repairs:[]};
 const printed = d && ['Certiorari','Merits','Amicus'].includes(category(d)) && !d.sourceRange ? briefContents(data.pages) : null;
 data.pages.forEach((p,page)=>{const raw=p.text,lines=[...raw.matchAll(/[^\n]+/g)].map(m=>({text:m[0].trim(),start:m.index,end:m.index+m[0].length})).filter(x=>x.text);const lead=lines.slice(0,5).map(l=>l.text).join(' ');const front=/\bTABLE OF (?:CONTENTS|(?:CITED )?AUTHORITIES)\b/i.test(lead)||/^[ivxlcdm]+$/i.test(p.label||'')&&/^(?:[ivxlcdm]+\s+)?Cited Authorities\b/i.test(lead)||page===0&&/PRELIMINARY PRINT|OFFICIAL REPORTS|ON (?:PETITION|WRIT) (?:FOR|OF) CERTIORARI|No\.\s*\d{2}[-–]\d+/i.test(raw)&&!/(?:QUESTION(?:S)? PRESENTED|INTEREST OF|INTRODUCTION|Justice .* delivered)/.test(raw);if((front||printed?.omit.has(page))&&!d?.sourceRange){result.omitRanges.push({page,start:0,end:raw.length,reason:'Front matter'});return}const starts=layoutPage(id,page)?.headings||[];
 for(let i=0;i<lines.length;i++){const l=lines[i];if(!starts.some(h=>Math.abs(h.offset-l.start)<5)&&!(/^[A-Z][A-Z ,’'().:;—–\-\d]{4,}$/.test(l.text)&&l.text.length<170))continue;if(/PRELIMINARY|REPORTS|Cite as|Page Proof|OCTOBER TERM|TABLE OF|^\d|^No\.|^Syllabus$/i.test(l.text))continue;let last=i,text=l.text;while(last+1<lines.length&&/^[A-Z][A-Z ,’'().:;—–\-\d]{3,}$/.test(lines[last+1].text)&&!starts.some(h=>Math.abs(h.offset-lines[last+1].start)<5)&&text.length<400){text+=' '+lines[++last].text}result.headings.push({page,start:l.start,end:lines[last].end,text,level:/^[A-H]\.\s/.test(text)?1:0});i=last}
 });
 if(printed?.headings.length) {
   const actual = new Map();
   for (const h of printed.headings) {if (!actual.has(h.page)) actual.set(h.page, []); actual.get(h.page).push(h);}
   result.headings = result.headings.filter(h=>!actual.get(h.page)?.some(p=>p.start<h.end && h.start<p.end));
   result.headings.push(...printed.headings.filter(h=>!result.omitRanges.some(r=>r.page===h.page && r.start<=h.start && h.end<=r.end)));
   result.headings.sort((a,b)=>a.page-b.page||a.start-b.start);
 }
 for(let page=0;page<data.pages.length;page++){if(result.omitRanges.some(r=>r.page===page&&r.start===0&&r.end===data.pages[page].text.length)){result.bodyStart={page:page+1,offset:0};continue}break}derivedStructures.set(key,result);return result}
function repairReading(value,repairs,raw){let {text,map}=value;for(const r of [...repairs].sort((a,b)=>b.start-a.start)){if(r.expectedText!==undefined&&(typeof raw!=='string'||raw.slice(r.start,r.end)!==r.expectedText))continue;const a=lowerBound(map,r.start),b=lowerBound(map,r.end);if(b<=a)continue;const replacement=r.text??r.replacement??'';text=text.slice(0,a)+replacement+text.slice(b);map=[...map.slice(0,a),...Array.from({length:replacement.length},(_,i)=>r.start+Math.min(r.end-r.start-1,Math.floor(i*(r.end-r.start)/Math.max(1,replacement.length)))),...map.slice(b)]}return {text,map}}
function authorityKey(s){return s.replace(/\s+/g,'').replace(/[.,]/g,'').toLowerCase()}
function registerReferenceSummaries() {
  for(const [citation,entry] of Object.entries(referenceSummaries)) registerAuthority(entry,citation);
  for(const [key,c] of caseByCitation) {
    const citation=validCitation(c),holding=c.decision?.holding;
    if(citation&&holding) registerAuthority({kind:'case',citation,name:c.name,sourceUrl:c.decision.sourceUrl||c.sourceUrl,
      year:c.decided?.slice(0,4),summary:holding},citation);
  }
  for(const d of catalog.authorities||[]) if(!referenceDocs.has(authorityIdentity(d.referenceKey))) referenceDocs.set(authorityIdentity(d.referenceKey),d.id);
}

audio.addEventListener('play',refreshPlayback);audio.addEventListener('pause',refreshPlayback);audio.addEventListener('ended',refreshPlayback);

function tidyHeadingSpace(value,headings){
 let {text,map}=value;const runs=[];
 for(const h of headings){const a=lowerBound(map,h.start),b=lowerBound(map,h.end);let l=a,r=b;while(l>0&&/\s/.test(text[l-1]))l--;while(r<text.length&&/\s/.test(text[r]))r++;if(a>l)runs.push({start:l,end:a});if(r>b)runs.push({start:b,end:r})}
 // Adjacent headings share a whitespace run. Apply it only once so the next
 // heading's first source character and annotation offset remain intact.
 const merged=[];
 for(const run of runs.sort((a,b)=>a.start-b.start||a.end-b.end)){const previous=merged.at(-1);if(previous&&run.start<=previous.end)previous.end=Math.max(previous.end,run.end);else merged.push({...run})}
 for(const x of merged.reverse()){text=text.slice(0,x.start)+' '+text.slice(x.end);map=[...map.slice(0,x.start),map[x.start],...map.slice(x.end)]}
 return {text,map};
}

function skipIcon(forward){return `<svg viewBox="0 0 24 24" aria-hidden="true"><g ${forward?'transform="translate(24 0) scale(-1 1)"':''}><path d="M3 10a9 9 0 1 1 2 9 M3 4v6h6"/></g><text x="12" y="13" dominant-baseline="middle" text-anchor="middle" fill="currentColor" stroke="none" font-family="Source Sans 3, sans-serif" font-size="8">10</text></svg>`}
function extendHeadingMarker(h,structure){const marker=structure.footnoteMarkers?.find(m=>m.page===h.page&&m.start===h.end);return marker?{...h,end:marker.end}:h}
function tidyFootnoteMarkers(value,markers){let {text,map}=value;for(const m of [...markers].sort((a,b)=>b.start-a.start)){const a=lowerBound(map,m.start);let start=a;while(start>0&&/\s/.test(text[start-1]))start--;if(a>start){text=text.slice(0,start)+text.slice(a);map=[...map.slice(0,start),...map.slice(a)]}}return {text,map}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action="footnote-preview"]');if(!b)return;const [id,page,label]=b.dataset.value.split('|'),data=docCache.get(id),record=layoutPage(id,Number(page))?.footnotes?.find(f=>String(f.label)===label);if(!record||!data)return;clearPeek();const el=document.createElement('section');el.className='peek';const content=readingText(data.pages[page].text,id,Number(page),data,record.start,record.end,true).text;el.innerHTML=`<div class="peek-heading"><h3>Footnote ${esc(label)}</h3>${button(icon('close'),'dismiss-peek','','',`aria-label="Close footnote"`)}</div><div class="peek-content"><p>${esc(content)}</p></div>`;overlays.append(el);const r=b.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.left,innerWidth-el.offsetWidth-8))+'px';el.style.top=Math.max(8,Math.min(r.bottom+8,innerHeight-el.offsetHeight-8))+'px'});
let pdfResizeTimer;window.addEventListener('resize',()=>{clearTimeout(pdfResizeTimer);pdfResizeTimer=setTimeout(()=>{if(state.route!=='reader')return;storePositions();for(const id of [state.active,state.split].filter(Boolean)){const zoom=state.pdfZoom?.[id]||'width';if(isPDF(id)&&!nativePDF(id)&&['width','page'].includes(zoom))renderPDF(id)}},200)});


document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b?.dataset.action==='browse-term')openTerm(b.dataset.value);});

function closeSiteMenus(target) {
  for (const menu of document.querySelectorAll('.library-actions[open], .explore-menu[open], .account-menu[open], .mobile-menu[open]')) {
    if (!menu.contains(target)) menu.open = false;
  }
}
document.addEventListener('pointerdown', event => closeSiteMenus(event.target));
document.addEventListener('focusin', event => closeSiteMenus(event.target));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if(readerMenu){event.preventDefault();closeReaderMenu(true);}
  for (const menu of document.querySelectorAll('.library-actions[open], .explore-menu[open], .account-menu[open], .mobile-menu[open]')) {
    menu.open = false; menu.querySelector('summary')?.focus();
  }
});
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action="feature-step"]');
  if (control) {
    const count = currentTerm.cases.filter(c=>caseIssues[c.id] && c.status !== 'Dismissed').length;
    featuredCaseIndex = (featuredCaseIndex + Number(control.dataset.value) + count) % count;
    document.querySelector('.front-feature').innerHTML = featuredCaseCard();
    document.querySelector('.front-feature [data-value="'+control.dataset.value+'"]')?.focus({preventScroll:true});
  }
  const action = event.target.closest('.library-actions button');
  if (action) action.closest('details').open = false;
});

function normalizeReaderDocuments() {
  function migrate(w) {
    if (!w) return;
    w.tabs = [...new Set((w.tabs||[]).map(canonicalDocId))];
    w.active = canonicalDocId(w.active);
    w.split = canonicalDocId(w.split);
    if (w.active === w.split) w.split = null;
    if (w.pdfDocs) w.pdfDocs = w.pdfDocs.map(canonicalDocId).filter(id=>!ds(id)?.referenceSummary && ds(id)?.type!=='Statute');
  }
  for (const note of state.notes || []) {
    const part=ds(note.docId);
    const retained=note.docId?.endsWith('--annotated-copy') && note.sourceDocId;
    const source=retained || (part?.independentText && note.sourceDocId===part.parentDocumentId ? part.parentDocumentId : note.docId);
    if(!splitParents.has(source))continue;
    const old=ds(source);
    if(!old)continue;
    const anchor=note.anchors?.[0];
    const sections=opinionSections[old.caseId] || [];
    const match=anchor && sections.find(d=>{
      const r=d.sourceRange;
      return d.parentDocumentId===source && !d.independentText && r &&
        (anchor.page>r.startPage || anchor.page===r.startPage && anchor.start>=r.startOffset) &&
        (anchor.page<r.endPage || anchor.page===r.endPage && anchor.start<r.endOffset);
    });
    if(match){note.docId=match.id;note.sourceDocId=source;continue}
    const archiveId=source+'--annotated-copy';
    if(!docs.has(archiveId))docs.set(archiveId,{...old,id:archiveId,title:'Annotated Source',parentDocumentId:source});
    note.docId=archiveId;note.sourceDocId=source;
  }
  migrate(state);
  Object.values(state.workspaces||{}).forEach(migrate);
  state.recents = [...new Set(state.recents.map(canonicalDocId))];
}

function mergeCaseSources(c) {
  const combined = new Map((c.documents || []).map(d => [d.id,d]));
  for (const d of recordSupplement[c.id] || []) combined.set(d.id,{...combined.get(d.id),...d});
  return {...c,areas:caseAreas(c),documents:[...combined.values()]};
}

function joiningNote(o,name){
 const scope=o.joiningScope;if(!scope)return '';
 if(typeof scope==='object'){const value=scope[name];return value?` <small>(${esc(Array.isArray(value)?value.join(', '):value)})</small>`:''}
 const surname=name.replace(/, Jr\.$/,'').split(' ').at(-1),excerpt=o.sourceExcerpt||'';
 const direct=excerpt.match(new RegExp('(?:Justice )?'+surname+'(?:,? J{1,2}\\.)?\\s+joins?\\s+(?:as to|with respect to)\\s+(Parts?[^,;.]+)','i'));
 const limited=excerpt.match(/an opinion with respect to (Parts?[^,;]+), in which ([\s\S]*?)joined/i);
 const part=direct?.[1]||(limited&&limited[2].includes(surname)?limited[1]:null);
 return part?` <small>(${esc(part.trim())})</small>`:'';
}
function votePortraits(c){const vote=verifiedVotes[c.id];if(!vote)return '';return `<div class="vote-portraits" aria-label="Court votes">${vote.groups.map(g=>{const minority=/dissent|against/i.test(g.label);return `<div class="vote-coalition ${minority?'minority':'majority'}"><span>${minority?(/in part/i.test(g.label)?'Partial Dissent':'Dissent'):/not participat|recus/i.test(g.label)?'Not Participating':vote.groups.length===1?'Unanimous':'Majority'}</span><div>${g.names.map(n=>button(portrait(n,'vote-face'),'entity','justices|'+n,'vote-person',`aria-label="${esc(n+' · '+g.label)}"`)).join('')}</div></div>`}).join('')}</div>`}
function focusReaderPane(id){if(!state.split||![state.active,state.split].includes(id)||id===state.active)return;state.paneOrder=[...document.querySelectorAll('.pane')].map(p=>p.dataset.pane);[state.active,state.split]=[state.split,state.active];document.querySelectorAll('[data-tab-id]').forEach(t=>{t.classList.toggle('selected',t.dataset.tabId===id);t.classList.toggle('in-split',t.dataset.tabId===state.split);t.querySelector('[role=tab]')?.setAttribute('aria-selected',String(t.dataset.tabId===id))});document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('is-focused',p.dataset.pane===id));refreshSidebar();persist()}
document.addEventListener('pointerdown',e=>{const pane=e.target.closest('.pane');if(pane)focusReaderPane(pane.dataset.pane)});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]'),a=b?.dataset.action,v=b?.dataset.value;
 if(a==='browse-mode'){state.termView=v==='all'?'all':'sittings';state.termChooserOpen=v!=='all';state.argumentMonth='';render()}
 if(a==='court-toggle'){state.courtExpanded=!state.courtExpanded;render();document.querySelector('.court-toggle')?.focus({preventScroll:true});persist()}
 if(a==='playback-expand'){playbackExpanded=!playbackExpanded;refreshPlayback();document.querySelector('[data-action=playback-expand]')?.focus({preventScroll:true})}
 if(a==='seek-toggle'){state.seekOpen=!state.seekOpen;refreshPlayback()}
 if(a==='return-audio'){const d=narration?ds(narration.id):currentTimedDoc()||caseDocuments(caseMap.get(audioCase)).find(d=>category(d)==='Argument');if(d)openDoc(d.id)}
 if(a==='references-back'){state.ref=null;refreshSidebar();persist()}
 if(a==='reference-location'){const r=refsIndex.get(v)||state.refs.find(r=>r.key===v);if(r){jumpHeading(r.fromDoc,r.page??Number(r.key.split('|')[2]),r.offset??0)}}
 if(a==='retry-pdf')renderPDF(v);
 if(a==='focus-pane')focusReaderPane(v);
 const turn=e.target.closest('.speaker-turn');if(turn&&!b&&!e.target.closest('[data-ref-key],[data-annotation]')&&window.getSelection()?.isCollapsed){const id=turn.closest('[data-document]').dataset.document,d=ds(id);if(d.timedSession)await listen(d.caseId,d.timedSession.id,Number(e.target.closest('[data-seek-start]')?.dataset.seekStart??turn.dataset.start))}
});
document.addEventListener('input',e=>{if(e.target.matches('.playback-volume'))audio.volume=Number(e.target.value);if(e.target.matches('.playback-seek')){const media=narration?narrationAudio:audio;media.currentTime=Number(e.target.value)}});
function updateSeek(){const media=narration?narrationAudio:audio;const slider=document.querySelector('.playback-seek');if(slider&&document.activeElement!==slider){slider.max=Number.isFinite(media.duration)?media.duration:0;slider.value=media.currentTime}const label=document.querySelector('.playback-time');if(label)label.textContent=time(narration?narrationElapsed():audio.currentTime);const seekLabel=document.querySelector('.seek-close');if(seekLabel)seekLabel.textContent=time(media.currentTime)}
audio.addEventListener('timeupdate',updateSeek);audio.addEventListener('loadedmetadata',updateSeek);narrationAudio.addEventListener('timeupdate',updateSeek);
// App previews replace native title tooltips on these controls.
const tooltipObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){for(const el of [node,...node.querySelectorAll('[title]')])if(el.hasAttribute('title')&&(el.matches('button,summary,.playback-strip')||el.closest('.reader-shell'))){if(!el.hasAttribute('aria-label')&&el.matches('button,summary'))el.setAttribute('aria-label',el.getAttribute('title'));el.removeAttribute('title')}}});tooltipObserver.observe(document.body,{subtree:true,childList:true});

async function locateRecord(ref){if(ref.docId)return;const match=ref.label.match(/CA\s*(\d+)\s*[-–]?\s*ECF\s*(\d+(?:[-–]\d+)?).*?\bat\s+(\d+)/i);if(!match)return;const candidates=caseDocuments(contextCase(ref.fromDoc)).filter(d=>materialGroup(d)==='Lower courts');for(const d of candidates){const data=await ensureDoc(d.id);if(!data)continue;const header=data.pages.slice(0,2).map(p=>p.text).join(' ');if(new RegExp('USCA'+match[1]+'\\s+Case:').test(header)&&new RegExp('Document:\\s*'+match[2]+'(?:\\s|$)').test(header)){ref.docId=d.id;ref.recordPage=Number(match[3])-1;return}}}

function refreshSearchResults(input){
 const selector=input.id==='entity-search'?'.people-directory':input.id==='case-search'?'.register-scroll':null;
 if(selector){const template=document.createElement('template');template.innerHTML=input.id==='entity-search'?peopleDirectory(state.route,entityEntries(state.route),{areas:'Areas of Law',justices:'Justices',advocates:'Advocates',amici:'Amici'}[state.route]):casesPage();const next=template.content.querySelector(selector),current=app.querySelector(selector);if(next&&current){current.replaceWith(next);persist();syncLocation();return}}
 const focused=document.activeElement===input,start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection,id=input.id;render();if(focused){const next=document.getElementById(id);next?.focus({preventScroll:true});if(start!==null)try{next?.setSelectionRange(start,end,direction)}catch{}}
}

function officialTranscriptTurns(id,data){
 const d=ds(id),c=contextCase(id),turns=[],declaredNames=[...data.pages.slice(0,4).map(p=>p.text).join('\n').matchAll(/\b([A-Z][A-Za-z .’'-]+), ESQ\./g)].map(m=>titleCaseLabel(m[1].trim().toLowerCase()).replace(/\bMc([a-z])/g,(_,ch)=>'Mc'+ch.toUpperCase()));let current=null,finished=false;
 for(let page=0;page<data.pages.length&&!finished;page++){
  const raw=data.pages[page].text.replace(/(?:^[ \t]*\d+[ \t]*\n){20,}[ \t]*\d+[ \t]*(?=\n|$)/gm,m=>m.replace(/[^\n]/g,' ')).replace(/^[ \t]*(?:Official - Subject to Final Review|Heritage Reporting Corporation|(?:ORAL ARGUMENT OF|REBUTTAL (?:ORAL )?ARGUMENT OF|ON BEHALF OF)[^\n]*)[ \t]*$/gm,m=>' '.repeat(m.length)),cleaned=readingText(raw,id,page,data);let text=cleaned.text;const close=text.search(/\(Whereupon,[\s\S]*?case was submitted\./i);if(close>=0){text=text.slice(0,close);finished=true;}
  const pattern=/(?:^|\n\n)((?:(?:CHIEF )?JUSTICE|MR\.|MS\.|MRS\.|GENERAL)\s+[A-Z][A-Za-z .’'–-]*):\s*/g;
  const matches=[...text.matchAll(pattern)];
  const add=(start,end)=>{if(!current||end<=start)return;for(const part of text.slice(start,end).matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)){const value=part[0].trim();if(!value||/^(?:ORAL ARGUMENT OF|REBUTTAL ARGUMENT OF|ON BEHALF OF|FOR THE UNITED STATES|AS AMICUS CURIAE|SUPPORTING THE)\b/.test(value))continue;const trim=part.index+part[0].indexOf(value),map=cleaned.map.slice(start+trim,start+trim+value.length),key=id+':'+page+':turn:'+turns.length+':'+current.parts.length;displayMaps.set(key,map);current.parts.push({page,text:value,map,key})}};
  if(matches.length){add(0,matches[0].index);for(let i=0;i<matches.length;i++){const m=matches[i],label=m[1],surname=label.replace(/^(?:(?:CHIEF )?JUSTICE|MR\.|MS\.|MRS\.|GENERAL)\s+/,'').trim().toUpperCase(),person=Object.keys(profiles).find(n=>n.toUpperCase().replace(/, JR\.$/,'').endsWith(' '+surname))||(c.advocates||[]).find(a=>a.name.toUpperCase().endsWith(' '+surname))?.name||declaredNames.find(n=>n.toUpperCase().endsWith(' '+surname));current={speaker:person?(person===person.toUpperCase()?titleCaseLabel(person.toLowerCase()):person):titleCaseLabel(label.toLowerCase()),justice:/JUSTICE/.test(label),parts:[]};turns.push(current);add(m.index+m[0].length,matches[i+1]?.index??text.length)}}else add(0,text.length);
 }
 return turns;
}
function untimedTranscriptHTML(id,data){
 const d=ds(id),c=contextCase(id),turns=officialTranscriptTurns(id,data);
 return `<article class="document-body conversation untimed-conversation" data-document="${esc(id)}"><header class="conversation-header"><div><h2>Oral Argument</h2><p>${date(c.argued)}</p><small>Synchronized timing is not yet available.</small></div>${c.audio?.url?button(icon('play')+'Listen','listen',c.id,'outline'):''}</header>${turns.map(t=>`<section class="speaker-turn ${t.justice?'justice-turn':'advocate-turn'}"><div class="speaker-avatar">${portrait(t.speaker,'transcript-face')}</div><div class="speaker-message"><header><strong>${esc(t.speaker)}</strong></header>${t.parts.map(p=>`<span class="source-page" data-page="${p.page}"><span class="page-text" data-text-doc="${esc(id)}" data-page="${p.page}" data-map-key="${esc(p.key)}">${renderText(p.text,id,p.page,p.map)}</span></span>`).join(' ')}</div></section>`).join('')}<footer class="transcript-credit">Official Court transcript · Speaker formatting preserves the filed text.</footer><aside class="document-margin"></aside></article>`;
}

function timedParagraphs(text,map,turn,id,page){let offset=0,cursor=0;const blocks=(turn.blocks||[]).map(b=>{const at=turn.text.indexOf(b.text,cursor);if(at>=0)cursor=at+b.text.length;return {...b,at}});return text.split('\n\n').map(part=>{const source=map[offset]??0,block=blocks.find(b=>b.at>=0&&source>=b.at&&source<b.at+b.text.length),word=turn.words?.find(w=>w[0]>=source),start=word?word[1]:Number.isFinite(block?.start)?block.start:turn.start;const html=`<span class="transcript-paragraph" data-seek-start="${start}">${renderText(part,id,page,map.slice(offset,offset+part.length))}</span>`;offset+=part.length+2;return html}).join('\n\n')}

// Filed PDFs opened anywhere in the application remain in the reading workspace.
document.addEventListener('click',e=>{const link=e.target.closest('a[href]');if(!link||link.hasAttribute('data-open-original')||!(/\.pdf(?:$|[?#])/i.test(link.href)))return;const source=[...docs.values()].find(d=>[d.sourceUrl,d.sourceMirrorUrl,d.pdfPath].some(u=>u&&new URL(u,location.href).href===link.href));if(!source)return;e.preventDefault();e.stopImmediatePropagation();const id=canonicalDocId(source.id);openDoc(id);state.pdfDocs=[...new Set([...(state.pdfDocs||[]),id])];render()},true);

async function initializeAccount(){
 try{const {createAccount}=await import('./account.js');account=await createAccount(event=>{
  applyingAccount=true;
  if(event.type==='session'){clearSelection();overlays.replaceChildren();state.notes=[];state.saved=[];state.recents=[];state.positions={};}
  if(event.type==='library'){Object.assign(state,{notes:event.notes,saved:event.saved,recents:event.recents,positions:event.positions});}
  if(event.type==='error'||event.type==='content-cleanup-warning')toast(event.message);
  if(appReady)render();applyingAccount=false;
 });if(account?.loadPublishedContent){try{for(const record of await account.loadPublishedContent()){try{applyEditedCase(record.value,false);}catch(error){console.warn('Case edit was not applied',record.id,error.message);}}}catch(e){console.warn('Published edits unavailable',e)}}if(appReady)render();}catch(error){console.error('Account initialization failed',error);toast('Sign-in is unavailable. Public reading is still available.');}
}
function showSignIn(){
 overlays.querySelector('.account-dialog')?.remove();const dialog=document.createElement('dialog');dialog.className='account-dialog';dialog.setAttribute('aria-label','Sign in to Ninefold');
 if(!account?.configured){dialog.innerHTML=`<h2>Accounts are being connected</h2><p>Public reading is available now. Sign-in and synced libraries will be available once account setup is complete.</p><form method="dialog"><button>Close</button></form>`;overlays.append(dialog);dialog.showModal();return;}
 dialog.innerHTML=`<form method="dialog"><button class="account-dialog-close" aria-label="Close">${icon('close')}</button></form><h2>Welcome to Ninefold</h2><p>Sign in to sync your library, notes, and highlights.</p><button type="button" class="outline account-google">Continue with Google</button><form class="account-email"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><button type="submit" class="outline">Sign In</button><button type="button" class="account-create">Create Account</button><button type="button" class="account-reset">Reset Password</button></form><p class="account-feedback" role="status"></p>`;
 overlays.append(dialog);dialog.showModal();const form=dialog.querySelector('.account-email'),feedback=dialog.querySelector('.account-feedback');
 const attempt=async fn=>{feedback.textContent='';try{await fn();if(signedIn())dialog.close();}catch(e){const messages={'auth/invalid-credential':'The email or password is incorrect.','auth/email-already-in-use':'An account already exists for this email. Sign in or reset your password.','auth/weak-password':'Choose a stronger password.','auth/popup-blocked':'Please allow the Google sign-in popup.','auth/unauthorized-domain':'This website address has not been enabled for sign-in yet.','auth/network-request-failed':'Check your connection and try again.','auth/too-many-requests':'Too many attempts. Please try again later.'};feedback.textContent=messages[e.code]||'Sign-in could not be completed. Please try again.';}};
 dialog.querySelector('.account-google').onclick=()=>attempt(()=>account.login());
 form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())attempt(()=>account.emailLogin(form.email.value,form.password.value,false));};
 dialog.querySelector('.account-create').onclick=()=>{if(form.reportValidity())attempt(()=>account.emailLogin(form.email.value,form.password.value,true));};
 dialog.querySelector('.account-reset').onclick=()=>{if(!form.email.reportValidity())return;attempt(async()=>{await account.reset(form.email.value);feedback.textContent='If an account exists, a password reset email will arrive shortly.';});};
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
 if(action==='account-signin'){event.stopImmediatePropagation();showSignIn();return;}
 if(action==='account-signout'){event.stopImmediatePropagation();account?.logout().catch(()=>toast('Sign-out failed. Please try again.'));return;}
 if(['save','highlight','comment','page-note','delete-note','note-color'].includes(action)){
  if(!signedIn()){event.preventDefault();event.stopImmediatePropagation();showSignIn();}
  else if(!account.ready){event.preventDefault();event.stopImmediatePropagation();toast('Please wait for your library to finish loading.');}
 }
},true);

// Keep the case-document categories in a single accessible horizontal row.
function revealMaterialSection(button){const nav=button?.closest('.document-sections');if(!nav)return;const b=button.getBoundingClientRect(),r=nav.getBoundingClientRect();if(b.left<r.left)nav.scrollLeft-=r.left-b.left;if(b.right>r.right)nav.scrollLeft+=b.right-r.right}
document.addEventListener('focusin',event=>{if(event.target.matches?.('.document-sections button'))revealMaterialSection(event.target)});
document.addEventListener('keydown',event=>{const nav=event.target.closest?.('.document-sections');if(!nav||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...nav.querySelectorAll('button')],current=buttons.indexOf(document.activeElement),index=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,current+(event.key==='ArrowRight'?1:-1)));event.preventDefault();buttons[index]?.focus({preventScroll:true});revealMaterialSection(buttons[index])});
document.addEventListener('click',event=>{const b=event.target.closest('[data-action="case-section"]');if(b){const active=document.querySelector('.document-sections .active');active?.focus({preventScroll:true});revealMaterialSection(active)}});

// Inline reference spans wrap like prose and retain button keyboard activation.
document.addEventListener('keydown',event=>{const ref=event.target.closest?.('.citation[role="button"][data-ref-key]');if(ref&&['Enter',' '].includes(event.key)){event.preventDefault();showPeek(ref)}});

// Case editing keeps published data and private previews separate from source imports.
const referenceNumbers=new Map(),editedCaseDocuments=new Map();
function referenceNumber(id,key){let numbers=referenceNumbers.get(id);if(!numbers){numbers=new Map();referenceNumbers.set(id,numbers)}if(!numbers.has(key))numbers.set(key,numbers.size+1);return numbers.get(key)}
function numberedReading(text,map,citations){let value='',out=[],at=0,hits=[];map=map||Array.from({length:text.length},(_,i)=>i);for(const hit of citations.slice().sort((a,b)=>a.start-b.start)){if(hit.start<at)continue;value+=text.slice(at,hit.start);out.push(...map.slice(at,hit.start));const start=value.length,label='['+hit.ref.number+']';value+=label;out.push(...Array.from({length:label.length},(_,i)=>i===label.length-1?map[hit.end-1]:map[hit.start]));hits.push({...hit,start,end:value.length});at=hit.end}value+=text.slice(at);out.push(...map.slice(at));return {text:value,map:out,citations:hits}}
function caseSnapshot(c){return {schema:1,caseId:c.id,name:c.name,description:c.decision?.holding||c.officialSummary||'',questions:structuredClone(caseDisplay[c.id]?.questions||[{label:'Questions presented',text:c.question||''}]),documents:caseDocuments(c).map(d=>({id:d.id,title:d.title,category:materialGroup(d),...(d.editorPdfUrl?{pdfUrl:d.editorPdfUrl}:{}),...(d.editorContent?{content:structuredClone(d.editorContent)}:{})}))}}
const importedCaseContent=new Map(),appliedContentPatches=new Map();let loadedContentBase=null;
function fetchContent(path){const url=new URL(path,location.href);if(loadedContentBase)url.searchParams.set('base',loadedContentBase);return fetch(url.href,{cache:'no-cache'});}
async function readContentBase(){const response=await fetch('data/content-base-version.json',{cache:'no-store'});if(!response.ok)throw Error('Collection version unavailable. Reload after the site build is complete.');const value=await response.json();if(value.schema!==1||!/^[a-f0-9]{64}$/.test(value.version))throw Error('Invalid collection version.');return value.version;}
async function assertCurrentContentBase(){if(!loadedContentBase)throw Error('This site build has no verified collection version. Editing cannot be published.');if(await readContentBase()!==loadedContentBase)throw Error('The imported collection changed while this editor was open. Save your draft, reload the site, and review the latest source before publishing.');}
function captureImportedContent(){for(const c of cases)importedCaseContent.set(c.id,{record:structuredClone(c),display:structuredClone(caseDisplay[c.id]||{}),snapshot:caseSnapshot(c),documents:new Map(caseDocuments(c).map(d=>[d.id,structuredClone(d)]))});}
function applyEditedCase(patch,refresh=true){
 validateContentPatch(patch);const base=importedCaseContent.get(patch.caseId),c=caseMap.get(patch.caseId);if(!base||!c)return;
 const result=applyContentPatch(base.snapshot,patch),previous=appliedContentPatches.get(c.id),before=caseDocuments(c);
 const touched=new Set([...Object.keys(previous?.documents||{}),...Object.keys(patch.documents),...(previous?.addedDocuments||[]).map(d=>d.id),...patch.addedDocuments.map(d=>d.id),...(previous?.removedDocuments||[]),...patch.removedDocuments]);
 const list=result.documents.map(item=>{
  const source=base.documents.get(item.id),change=source?patch.documents[item.id]:item;
  if(source&&!change)return structuredClone(source);
  const d=source?structuredClone(source):{id:item.id,caseId:c.id};
  if(Object.hasOwn(change,'title')){d.title=change.title;d.editorTitle=true;}
  if(Object.hasOwn(change,'category')){d.category=change.category;d.editorCategory=true;}
  if(Object.hasOwn(change,'pdfUrl'))d.editorPdfUrl=normalizePDFURL(change.pdfUrl);
  if(Object.hasOwn(change,'content')){d.editorContent=structuredClone(change.content);d.independentText=true;d.textPath='inline';delete d.parentDocumentId;delete d.sourceRange;delete d.timedSession;}
  return d;
 });
 for(const id of touched){const replacement=list.find(d=>d.id===id);if(replacement)docs.set(id,replacement);else if(!cases.some(other=>other.id!==c.id&&caseDocuments(other).some(d=>d.id===id)))docs.delete(id);docCache.delete(id);referenceNumbers.delete(id);for(const [key,r]of refsIndex)if(r.fromDoc===id)refsIndex.delete(key);}
 for(const key of Object.keys(c))delete c[key];Object.assign(c,structuredClone(base.record));caseDisplay[c.id]=structuredClone(base.display);
 if(Object.hasOwn(patch.fields,'name'))c.name=patch.fields.name;
 if(Object.hasOwn(patch.fields,'description')){c.decision={...c.decision,holding:patch.fields.description};c.officialSummary=patch.fields.description;}
 if(Object.hasOwn(patch.fields,'questions')){c.question=patch.fields.questions.map(q=>q.text).join('\n\n');caseDisplay[c.id].questions=structuredClone(patch.fields.questions);}
 const byId=new Map(list.map(d=>[d.id,d]));c.documents=c.documents.filter(d=>!patch.removedDocuments.includes(d.id)).map(d=>byId.get(d.id)||d);for(const d of list)if(!base.documents.has(d.id))c.documents.push(d);
 const changed=Object.keys(patch.fields).length||Object.keys(patch.documents).length||patch.addedDocuments.length||patch.removedDocuments.length;
 if(changed)editedCaseDocuments.set(c.id,list);else editedCaseDocuments.delete(c.id);appliedContentPatches.set(c.id,structuredClone(patch));
 const removed=before.filter(d=>!byId.has(d.id));for(const d of removed){state.tabs=state.tabs.filter(id=>id!==d.id);if(state.active===d.id)state.active=state.tabs[0]||null;if(state.split===d.id)state.split=null;for(const w of Object.values(state.workspaces)){w.tabs=(w.tabs||[]).filter(id=>id!==d.id);if(w.active===d.id)w.active=w.tabs[0]||null;if(w.split===d.id)w.split=null;}}
 for(const d of list)if(!embeddedPDF(d)){state.pdfDocs=(state.pdfDocs||[]).filter(id=>id!==d.id);for(const w of Object.values(state.workspaces))w.pdfDocs=(w.pdfDocs||[]).filter(id=>id!==d.id);}
 readingCache.clear();displayMaps.clear();if(refresh)render();
}

async function importEditableDocument(id){const d=ds(id),data=await ensureDoc(id);if(!data)throw Error('Document text could not load.');const references=[],byKey=new Map(),pages=[];for(let page=0;page<data.pages.length;page++){const raw=data.pages[page],range=d.sourceRange;if(range&&(page<range.startPage||page>range.endPage))continue;const clean=readingText(raw.text,id,page,data,range&&page===range.startPage?range.startOffset:0,range&&page===range.endPage?range.endOffset:raw.text.length,true);let markdown=clean.text;const hits=citationRanges(clean.text,id,page,clean.map);for(const hit of hits){const key=hit.ref.canonical||hit.ref.label;if(!byKey.has(key)){const ref={id:'r'+(references.length+1),number:references.length+1,name:materialFor(hit.ref).title,label:hit.ref.label,canonical:hit.ref.canonical||hit.ref.label,type:hit.ref.type};byKey.set(key,ref);references.push(ref)}}let cursor=0;markdown='';for(const hit of hits.slice().sort((a,b)=>a.start-b.start)){if(hit.start<cursor)continue;markdown+=escapeMarkdown(clean.text.slice(cursor,hit.start))+'[@'+byKey.get(hit.ref.canonical||hit.ref.label).id+']';cursor=hit.end;}markdown+=escapeMarkdown(clean.text.slice(cursor));pages.push({label:String(raw.label||raw.number||page+1),markdown});}return {revision:crypto.randomUUID(),pages:pages.length?pages:[{label:'1',markdown:''}],references}}
document.addEventListener('click',async event=>{
 if(!event.target.closest('[data-action="edit-case"]'))return;
 const c=getCase(),base=importedCaseContent.get(c.id);if(!base)return;
 let checkpoint=structuredClone(appliedContentPatches.get(c.id)||createContentPatch(base.snapshot,base.snapshot,{baseVersion:loadedContentBase}));
 let readerCheckpoint=structuredClone({tabs:state.tabs,active:state.active,split:state.split,workspaces:state.workspaces});
 const session=createEditorSession({account,base:base.snapshot,baseVersion:loadedContentBase,checkBase:assertCurrentContentBase,applyPatch:applyEditedCase});
 const restore=()=>{applyEditedCase(checkpoint,false);Object.assign(state,structuredClone(readerCheckpoint));render();};
 try{await openCaseEditor({account:session.account,toast,initialDocument:state.route==='reader'?state.active:null,signIn:showSignIn,snapshot:()=>caseSnapshot(c),apply:session.apply,restore,
 commit:()=>{checkpoint=structuredClone(appliedContentPatches.get(c.id)||checkpoint);readerCheckpoint=structuredClone({tabs:state.tabs,active:state.active,split:state.split,workspaces:state.workspaces});},
 importDocument:async id=>{await assertCurrentContentBase();const content=await importEditableDocument(id);await assertCurrentContentBase();return session.rememberImport(id,content);},
 pdf:id=>{const d=base.documents.get(id);return d?.pdfPath?safeUrl(d.pdfPath):d?.sourceUrl&&/\.pdf(?:$|\?)/i.test(d.sourceUrl)?safeUrl(d.sourceUrl):null},
 preview:(resume,cancel)=>{const bar=document.createElement('div');bar.className='editor-preview-bar';bar.innerHTML='<strong>Private draft preview</strong><button>Return to editor</button><button>Stop preview</button>';document.body.append(bar);bar.querySelectorAll('button')[0].onclick=()=>{bar.remove();resume()};bar.querySelectorAll('button')[1].onclick=()=>{bar.remove();cancel()};}
 });}catch(e){toast(e.message)}
});
