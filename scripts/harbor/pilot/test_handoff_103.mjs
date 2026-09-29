import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,wire} from './test_handoff_support.mjs';
function clock(){const jobs=[];return {setTimeout(fn,ms,label){const t={fn,ms,label,active:true};jobs.push(t);return t;},clearTimeout(t){if(t)t.active=false;},fire(label){const t=jobs.findLast(t=>t.label===label&&t.active);assert(t,label);t.active=false;t.fn();}};}
test('real Native core: settlement watchdog preserves first cause and permits confirmed local recovery',async()=>{
 const timers=clock();let release,commands=0,verified=0;
 const r=await fixture({timers,fetcher:()=>new Response(wire('synthetic-only')),env:{exec(){commands++;return new Promise(resolve=>{release=resolve;setImmediate(()=>{timers.fire('agent');timers.fire('agent_settlement_timeout');});});},stop(){release({status:'interrupted',exit_code:null,stdout:'',stderr:'',wait:{settled:true}});return Promise.resolve({stopped:true});},verify(){verified++;return {status:'synthetic_control'};}}});
 assert.equal(commands,1);assert.equal(verified,0);assert(r.report.globalStops.some(x=>x.reason==='attempt_error'));
 assert.equal(r.report.faults?.[0]?.code,'agent_settlement_timeout');
 assert.equal(r.report.continuation?.allowed,true);
});
import {recoveryAllowed} from './handoff-state.mjs';
import {pathToFileURL} from 'node:url';
const {GeneralAgentSession}=await import(pathToFileURL(process.env.PAN_TEST_ENTRY));
for(const scenario of ['unknown_tool','unknown_transport','quiesce_false','stop_false','cancel','authentication','close_reject','forged_timeout'])test('real core refuses '+scenario,async()=>{
 const timers=clock();const original=timers.setTimeout;timers.setTimeout=(fn,ms,label)=>{const t=original(fn,ms,label);if(['session_close_timeout','recovery_timeout'].includes(label))setImmediate(()=>{if(t.active){t.active=false;fn();}});return t;};
 const abort=new AbortController();let release,commands=0,verifies=0;let oldClose;
 if(scenario==='close_reject'){oldClose=GeneralAgentSession.prototype.close;GeneralAgentSession.prototype.close=async function(){await oldClose.call(this);throw Error('Authorization: Bearer SECRET-CANARY private-reasoning-CANARY',{cause:Error('PRIVATE-CANARY')});};}
 try{
 const r=await fixture({timers,signal:abort.signal,fetcher:()=>{
  if(scenario==='authentication')return new Response('{}',{status:401});
  if(scenario==='unknown_transport'){setImmediate(()=>{timers.fire('agent');timers.fire('agent_settlement_timeout');});return new Promise(()=>{});}
  return new Response(wire('synthetic-only'));
 },env:{exec(){commands++;return new Promise(resolve=>{release=resolve;setImmediate(()=>{timers.fire('agent');if(scenario==='cancel')abort.abort();timers.fire('agent_settlement_timeout');});});},quiesce(){if(scenario==='forged_timeout')throw Error('agent_settlement_timeout');return Promise.resolve({confirmed:scenario!=='quiesce_false'});},stop(){if(scenario!=='unknown_tool')release?.({status:'interrupted',exit_code:null,stdout:'',stderr:'',wait:{settled:true}});return Promise.resolve({stopped:scenario!=='stop_false'});},verify(){verifies++;return {status:'synthetic_control'};}}});
 assert.equal(recoveryAllowed(r.report),false);assert.equal(verifies,0);assert.equal(r.report.verifier,null);
 assert(!JSON.stringify(r.report.faults).includes('CANARY'));assert(!JSON.stringify(r.report.faults).includes('Authorization'));
 const before=commands;release?.({status:'completed',exit_code:0,stdout:'late',stderr:'',wait:{settled:true}});abort.abort();await new Promise(r=>setTimeout(r,10));assert.equal(commands,before);
 }finally{if(oldClose)GeneralAgentSession.prototype.close=oldClose;}
});
test('single successful layer is insufficient and global conditions cannot be recovered',()=>{
 const proof={stopConfirmed:true,globalStops:[{reason:'attempt_error'}],continuation:{version:1,allowed:true,localWatchdog:true,confirmations:{admissionClosed:true,runSettled:true,sessionClosed:true,transportSettled:true,toolsSettled:true,quiesced:true,environmentStopped:true}}};
 assert(recoveryAllowed(proof));for(const k of Object.keys(proof.continuation.confirmations)){const x=structuredClone(proof);x.continuation.confirmations[k]=false;assert(!recoveryAllowed(x));}for(const reason of ['cancelled','authentication','quota_exhausted','resource_boundary','command_stop_unconfirmed','verifier_timeout'])assert(!recoveryAllowed({...proof,globalStops:[{reason}]}));
});
test('actual close pending: one close invocation, finite recovery and no regrading',async()=>{
 const timers=clock();const old=GeneralAgentSession.prototype.close;let closes=0,released=false;
 GeneralAgentSession.prototype.close=async function(){closes++;await old.call(this);await new Promise(resolve=>setImmediate(()=>{timers.fire('session_close_timeout');setImmediate(()=>{released=true;resolve();});}));};
 try{const r=await fixture({timers});assert.equal(closes,1);assert(released);assert.equal(r.report.faults[0].source,'session.close');assert.equal(r.report.verifier,null);assert(recoveryAllowed(r.report));}finally{GeneralAgentSession.prototype.close=old;}
});
test('environment stop rejection diagnostic preserves ordered causes without canaries',async()=>{
 const r=await fixture({env:{stop(){throw new TypeError('SECRET-CANARY Authorization private-reasoning',{cause:Object.assign(Error('PRIVATE-CANARY'),{code:'ECONNRESET'})});}}});
 assert.equal(r.report.stopConfirmed,false);assert.equal(r.report.faults.at(-1).source,'environment.stop');assert.equal(r.report.faults.at(-1).chain[1].code,'ECONNRESET');assert(!JSON.stringify(r.report.faults).includes('CANARY'));assert(!recoveryAllowed(r.report));
});
test('cancel race settlement is not proof that ignored fetch stopped, even without watchdog catch',async()=>{
 const timers=clock();let resolveFetch,verifies=0;
 const r=await fixture({timers,fetcher(){setImmediate(()=>timers.fire('agent'));return new Promise(resolve=>resolveFetch=resolve);},env:{verify(){verifies++;return {status:'synthetic_control'};}}});
 assert.equal(verifies,0);assert.equal(r.report.verifier,null);assert(r.report.globalStops.some(x=>x.reason==='local_work_unsettled'));assert.equal(r.report.continuation.confirmations.transportSettled,false);
 resolveFetch(new Response(wire('must-not-execute')));await new Promise(r=>setTimeout(r,10));assert.equal(r.dispatch,1);
});
test('tool rejection is diagnosed and cannot recover merely because stop returned true',async()=>{
 const r=await fixture({fetcher:()=>new Response(wire('synthetic-only')),env:{exec(){throw Object.assign(Error('SECRET-CANARY'),{code:'EPIPE'});}}});
 assert.equal(r.report.verifier,null);assert(r.report.faults.some(x=>x.source==='tool.execute'&&x.chain[0].code==='EPIPE'));assert(!recoveryAllowed(r.report));assert(!JSON.stringify(r.report).includes('SECRET-CANARY'));
});
