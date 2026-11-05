import {test} from 'node:test';
import assert from 'node:assert/strict';
const {parseHTML} = await import(process.env.EUI_DOM_MODULE || '$DATA/host-offload/_home_kvn_.bun_install_cache/linkedom@0.18.13@@@1/worker.js');
const {document,window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{document,window,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:f=>f()});
const {state}=await import('../src/js/themes.js');
import fs from 'node:fs';
state.base=JSON.parse(fs.readFileSync(new URL('../src/data/themes.json',import.meta.url))).themes.find(t=>t.id==='t3-dark');
const {gevContactsMake}=await import('../src/js/kinds-gev.js');
const {GEV_EXAMPLE}=await import('../src/js/gev-data.js');
const make=()=>gevContactsMake({id:'god-s-eye-view',name:"God's Eye View",hex:null});
const click=el=>el.dispatchEvent(new window.Event('click'));
test('select and request carry exact aircraft/source, without execution claims',()=>{
 const c=make(),events=[];c.el.addEventListener('eui:intent',e=>events.push(e.detail));
 const send=c.el.querySelector('.eu-f button');assert.ok(send.disabled);
 click(c.el.querySelector('.gc-contact'));assert.equal(events[0].action,'select_aircraft');assert.deepEqual(events[0].ids,['aircraft:abc001']);
 assert.match(c.el.querySelector('.gc-inspector').textContent,/9,200 m/);click(send);
 assert.equal(events[1].action,'request_track_aircraft');assert.equal(JSON.parse(events[1].text).freshness,'stale');assert.match(send.textContent,/unconfirmed/);assert.match(c.el.summary,/no app action executed/);
});
test('filter clears hidden selection, empty result and malformed replacement are atomic',()=>{
 const c=make(),events=[];c.el.addEventListener('eui:intent',e=>events.push(e.detail));click(c.el.querySelector('.gc-contact'));
 const q=c.el.querySelector('input[type=search]');q.value='no-match';q.dispatchEvent(new window.Event('input'));
 assert.equal(events.at(-1).action,'filter_aircraft');assert.deepEqual(events.at(-1).ids,[]);assert.equal(JSON.parse(events.at(-1).text).query,'no-match');
 assert.match(c.el.textContent,/No contacts match/);assert.ok(c.el.querySelector('.eu-f button').disabled);
 const before=c.spec.input;assert.throws(()=>c.setResult({data:{rows:[{id:'<bad>'}]}}));assert.equal(c.spec.input,before);
 q.value='';c.setResult({...GEV_EXAMPLE,data:{...GEV_EXAMPLE.data,rows:[],returned:0,total:0}});assert.match(c.el.textContent,/0 visible/);
});
test('unknown telemetry remains unavailable and caller strings are inert text',()=>{
 const x=structuredClone(GEV_EXAMPLE);x.data.rows[0].callsign='<script>bad()</script>';
 const c=gevContactsMake({id:'gev',name:'GEV'},null,{result:x});click(c.el.querySelectorAll('.gc-contact')[1]);
 assert.match(c.el.querySelector('.gc-inspector').textContent,/Unavailable/);assert.equal(c.el.querySelectorAll('script').length,0);assert.match(c.el.textContent,/CALLER-SUPPLIED/);
});
test('scope blips select the same contact as the roster and follow filters',()=>{
 const c=make(),events=[];c.el.addEventListener('eui:intent',e=>events.push(e.detail));
 assert.equal(c.el.querySelectorAll('.gc-scope .blip').length,7);
 click(c.el.querySelectorAll('.gc-scope .blip')[2]);assert.equal(events[0].action,'select_aircraft');assert.deepEqual(events[0].ids,['aircraft:abc003']);
 assert.equal(c.el.querySelector('.gc-contact[aria-pressed=true] b').textContent,'DEMO214');assert.equal(c.el.querySelectorAll('.gc-scope .blip.sel').length,1);
 const a=c.el.querySelector('input[type=checkbox]');a.checked=true;a.dispatchEvent(new window.Event('change'));assert.equal(c.el.querySelectorAll('.gc-scope .blip').length,6);
 assert.match(c.el.querySelector('.gc-range').textContent,/250 KM/);assert.doesNotMatch(c.el.textContent,/\bLIVE\b/);
});
