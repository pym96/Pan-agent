import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,wire} from './test_handoff_support.mjs';
function clock(){const jobs=[];return {jobs,setTimeout(fn,ms,label){const t={fn,ms,label,active:true};jobs.push(t);return t;},clearTimeout(t){if(t)t.active=false;},fire(label,{late=false}={}){const t=jobs.findLast(t=>t.label===label&&(late||t.active));assert(t,label);t.active=false;t.fn();}};}
test('normal completion clears Agent timer; a queued late callback cannot reopen Agent',async()=>{
 const timers=clock();let verifies=0;
 const r=await fixture({timers,env:{async verify(){verifies++;assert.equal(timers.jobs.find(x=>x.label==='agent').active,false);timers.fire('agent',{late:true});return {status:'synthetic_control',rewards:{reward:1}};}}});
 assert.equal(verifies,1);assert.equal(r.report.agentStopReason,null);assert.deepEqual(r.report.phases.map(x=>x.phase),['agent','handoff','verifier','ended']);
});
for(const kind of ['agent_timeout','turn_limit','step_limit','dispatch_budget','tool_budget'])test('eligible end '+kind+' grades once without new solving calls',async()=>{
 const timers=clock();let verifies=0,commands=0;
 const budget=kind==='turn_limit'?{dispatchesPerTask:1}:kind==='step_limit'?{toolsPerTask:1}:kind==='dispatch_budget'?{dispatchesCampaign:1}:{};
 const r=await fixture({timers,budget,prepare:kind==='tool_budget'?({ledger})=>{const start=ledger.start.bind(ledger);ledger.start=id=>{start(id);for(let i=0;i<80;i++)ledger.reserve(id,'tool');};}:undefined,
 fetcher:async(n,o)=>{if(kind==='agent_timeout'){timers.fire('agent');throw Error('cancelled synthetic exchange');}return new Response(wire(kind==='step_limit'&&n===2?'blocked':kind==='tool_budget'?'cmd':n===1?'cmd':null));},
 env:{async exec(){commands++;return {status:'completed',exit_code:0,stdout:'ok',stderr:'',termination:{confirmed:true}};},async verify(){verifies++;return {status:'synthetic_control',rewards:{reward:1}};}}});
 // The tool_budget case preconsumes the frozen 80-tool limit, not a fake error.
 assert.equal(r.report.agentStopReason,kind);assert.equal(verifies,1);assert.equal(r.report.verifier.status,'synthetic_control');assert.notEqual(r.report.agentStatus,'completed');assert.equal(r.report.globalStops.length,0);
});
test('arbitrary transport exception named dispatch_budget never authorizes verifier',async()=>{
 const r=await fixture({fetcher:()=>{throw Error('dispatch_budget');}});assert.equal(r.report.verifier,null);assert(!r.events.includes('verify'));
});
for(const moment of ['fetch','handoff','verifier'])for(const cause of ['cancel','expiry','resource'])test(cause+' at '+moment+' is a hard stop',async()=>{
 const timers=clock(),abort=new AbortController();let verifications=0;
 const fire=()=>cause==='expiry'?timers.fire('expiry'):abort.abort(cause);
 const r=await fixture({timers,signal:abort.signal,fetcher:()=>{if(moment==='fetch')fire();return new Response(wire());},env:{async quiesce(){if(moment==='handoff')fire();return {confirmed:true};},async verify(){verifications++;fire();return new Promise(()=>{});}}});
 assert.equal(verifications,moment==='verifier'?1:0);assert.equal(r.report.stopConfirmed,true);assert.equal(r.report.phases.filter(x=>x.phase==='ended').length,1);assert(r.report.globalStops.length);assert.equal(r.report.verifier?.rewards??null,null);
});
test('verifier deadline is independent and terminates noncooperative verifier',async()=>{
 const timers=clock();const r=await fixture({timers,env:{async verify(){assert.equal(timers.jobs.findLast(x=>x.label==='verifier').ms,2000);timers.fire('verifier');return new Promise(()=>{});}}});
 assert.equal(r.report.agentStatus,'completed');assert.equal(r.report.verifier.rewards,null);assert.equal(r.report.verifier.verifier_exit_or_exception,'verifier_timeout');
});
test('verified result preceding cancellation is retained with cancellation record',async()=>{
 const abort=new AbortController();const r=await fixture({signal:abort.signal,env:{async verify(){return {status:'synthetic_control',rewards:{reward:1}};},async stop(){abort.abort();return {stopped:true};}}});
 assert.equal(r.report.verifier.rewards.reward,1);assert(r.report.globalStops.some(x=>x.reason==='cancelled'));assert.equal(r.report.stopConfirmed,true);
});
test('unconfirmed handoff refuses verifier; no invented success',async()=>{
 const r=await fixture({env:{async quiesce(){return {confirmed:false};}}});assert.equal(r.report.verifier,null);assert(r.report.globalStops.some(x=>x.reason==='command_stop_unconfirmed'));assert.equal(r.report.stopConfirmed,true);
});
