import {test} from 'node:test';
import assert from 'node:assert/strict';
const {parseHTML} = await import(process.env.EUI_DOM_MODULE || '$DATA/host-offload/_home_kvn_.bun_install_cache/linkedom@0.18.13@@@1/worker.js');
const {document,window}=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{document,window,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:f=>f()});
const {state}=await import('../src/js/themes.js');
import fs from 'node:fs';
state.base=JSON.parse(fs.readFileSync(new URL('../src/data/themes.json',import.meta.url))).themes.find(t=>t.id==='t3-dark');
const {cuaActionMake}=await import('../src/js/kinds-cua.js');
const {violations,callFor,RESULT_EXAMPLES,CUA_EXAMPLE}=await import('../src/js/cua-data.js');
const click=el=>el.dispatchEvent(new window.Event('click'));
const make=()=>cuaActionMake({id:'cua',name:'Cua',hex:null});
test('contract invariants from action-result-contract.md',()=>{
 for(const r of Object.values(RESULT_EXAMPLES))assert.deepEqual(violations(r),[]);
 assert.ok(violations({effect:'confirmed',route:'accessibility'}).some(v=>/evidence/.test(v)));
 assert.ok(violations({effect:'partial',route:'dom',delivery:{mode:'background'}}).some(v=>/delivered_count/.test(v)));
 assert.ok(violations({effect:'refused',route:'dom',error:{code:'x'},evidence:[{kind:'value_readback'}]}).length);
 assert.ok(violations({effect:'confirmed',route:'dom',evidence:[{kind:'window_change'}],error:{code:'x'}}).some(v=>/only on refused/.test(v)));
 assert.ok(violations({effect:'done'}).length);
});
test('calls always carry pid + window_id + element_token, never coordinates',()=>{
 const c=callFor(CUA_EXAMPLE.windows[1],CUA_EXAMPLE.state[52][0],'type_text','hi');
 assert.deepEqual(c,{tool:'type_text',args:{pid:5310,window_id:52,element_token:'e:52:body',text:'hi'}});
});
test('window -> element -> request emits the exact call and claims no execution',()=>{
 const c=make(),ev=[];c.el.addEventListener('eui:intent',e=>ev.push(e.detail));
 const send=c.el.querySelector('.eu-f button');assert.ok(send.disabled);
 click(c.el.querySelectorAll('.cd-el')[0]);assert.equal(ev[0].action,'select_element');
 assert.match(c.el.querySelector('.cd-call').textContent,/"element_token": "e:41:7"/);
 click(send);assert.equal(ev.at(-1).action,'request_cua_action');assert.equal(JSON.parse(ev.at(-1).text).call.args.window_id,41);
 assert.match(send.textContent,/pending/);assert.match(c.el.summary,/not dispatched/);
 click(c.el.querySelectorAll('.cd-win')[2]);assert.match(c.el.querySelector('.cd-els').textContent,/get_window_state first/);assert.ok(c.el.querySelector('.eu-f button').disabled);
});
test('a driver result is shown only if it passes the contract',()=>{
 const c=make();assert.match(c.el.querySelector('.cd-result').textContent,/EXAMPLE/);
 assert.ok(c.setResult({effect:'confirmed',route:'accessibility'}).length);assert.match(c.el.querySelector('.cd-result').textContent,/not shown as success/);
 assert.deepEqual(c.setResult(RESULT_EXAMPLES.confirmed),[]);assert.doesNotMatch(c.el.querySelector('.cd-result').textContent,/EXAMPLE/);assert.match(c.el.textContent,/value_readback/);
});
