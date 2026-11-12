import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applicationRelief,applicationState,applicationEvents,applicationActivity} from '../dist/emergency-docket.js';

const record = description => ({proceedings:[{date:'2026-10-01',description}]});
assert.equal(applicationRelief(record('Application for a stay of execution of sentence of death, submitted to Justice Alito.')),'Stay of execution');
assert.equal(applicationRelief(record('Application to vacate the stay, submitted to Justice Kagan.')),'Vacate an order');
assert.equal(applicationRelief(record('Application for an injunction pending appeal, submitted to Justice Kagan.')),'Injunction');
assert.equal(applicationRelief(record('Application for an extension of time, submitted to Justice Kagan.')),'Extension of time');
const interim={status:'Pending',...record('Application for a stay, submitted to the Chief Justice.')};
interim.proceedings.push({date:'2026-10-02',description:'An administrative stay is entered.'});
assert.equal(applicationState(interim),'pending');
assert.equal(applicationActivity(interim),'2026-10-02');
assert.equal(applicationState({...interim,decided:'2026-10-03'}),'decided');
assert.equal(applicationRelief({docket:'26A123'}),'Other relief');
const duplicate={proceedings:[...interim.proceedings,...interim.proceedings]};
assert.equal(applicationEvents(duplicate).length,2);
assert.equal(applicationEvents(duplicate)[0].date,'2026-10-02');
assert.equal(applicationActivity({documents:[{date:'2026-10-05',title:'Response'}]}),'2026-10-05');
const current=JSON.parse(fs.readFileSync(new URL('../dist/data/current-term.json',import.meta.url)));
// A stay of a lower-court injunction must not be mislabeled as a request for an injunction.
assert.equal(applicationRelief(current.cases.find(c=>c.id==='26A560')),'Stay');
assert.equal(applicationRelief(current.cases.find(c=>c.id==='26A338')),'Bail');
console.log('Emergency docket: relief, interim status, deduplication, activity ordering, and current records passed.');
