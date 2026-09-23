import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test_handoff_support.mjs';
test('local oversized request is distinguishable from sent transport failure',async()=>{
 let sent=0;
 const r=await fixture({budget:{requestBytes:1},fetcher(){sent++;throw Error('must not send');}});
 assert.equal(sent,0);
 assert.equal(r.report.agentStopReason,'request_size');
});
import {wire} from './test_handoff_support.mjs';
import {authorize,canonical,LIMITS,METERED_LIMITS,MODEL,Ledger} from './policy.mjs';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
function signed(budget=METERED_LIMITS){
 const keys=generateKeyPairSync('ed25519');const binding={runnerSha:'a'.repeat(40),panHash:'b'.repeat(64),manifestHash:'c'.repeat(64),model:MODEL,budget,taskIds:['control'],images:{}};
 const activation={version:2,validity:'run-bound',authorized:true,runId:randomUUID(),humanAuthorizationId:'synthetic-only',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding};
 const resign=()=>{const {signature,...payload}=activation;activation.signature=sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64');};resign();
 const authority={publicKey:keys.publicKey,acceptedRunnerSha:binding.runnerSha};return {activation,binding,resign,admit:opts=>authorize(activation,authority,binding,opts)};
}
function clock(onSchedule=()=>{}){const jobs=[];return {jobs,setTimeout(fn,ms,label){const t={fn,ms,label,active:true};jobs.push(t);queueMicrotask(()=>onSchedule(label,this));return t;},clearTimeout(t){if(t)t.active=false;},fire(label){const t=jobs.findLast(t=>t.label===label&&t.active);assert(t,label);t.active=false;t.fn();}};}
const rows=r=>readFileSync(r.root+'/ledger/'+readDir(r.root+'/ledger')[0],'utf8').trim().split('\n').map(JSON.parse);
import {readdirSync as readDir} from 'node:fs';
const transient=()=>Object.assign(Error('PRIVATE diagnostic body'),{cause:{code:'ECONNRESET'}});
test('signed metered validity is explicit; old, unknown, tampered modes fail closed',()=>{
 const good=signed();const gate=good.admit({clock:()=>Date.parse('2050-01-01')});assert.equal(gate.expiresAt,null);
 for(const mutate of [a=>delete a.version,a=>a.validity='overnight',a=>a.expiresAt='2050-01-01',a=>a.binding.budget={...METERED_LIMITS,mode:'unknown'},a=>a.binding.budget={...METERED_LIMITS,dispatchesPerTask:999999},a=>a.binding.budget={...LIMITS,dispatchesPerTask:null}]){
  const f=signed();mutate(f.activation);f.resign();assert.throws(()=>f.admit());
 }
 const tamper=signed();tamper.activation.binding.budget={...METERED_LIMITS,mode:'other'};assert.throws(()=>tamper.admit(),/signature/);
 const c=new AbortController();const f=signed();const g=f.admit({signal:c.signal});c.abort();assert.throws(()=>g.assert(),/cancelled/);
});
test('signed mode traverses real installed Session beyond 40, 64, 80 and 200 with exact ledger',async()=>{
 const f=signed();const timers=clock();const r=await fixture({timers,budget:METERED_LIMITS,agent:600,prepare:({gate})=>Object.assign(gate,f.admit()),fetcher:n=>new Response(wire(n<=201?'true':undefined))});
 assert.equal(r.report.agentStatus,'completed');assert.equal(r.report.agentStopReason,null);assert.equal(r.report.counts.modelRounds,202);assert.equal(r.report.counts.exchanges,202);assert.equal(r.report.counts.reservations,202);assert.equal(r.report.counts.sendEntries,202);assert.equal(r.report.counts.tools,201);assert.equal(timers.jobs.some(x=>x.label==='expiry'),false);
 const log=rows(r);for(const event of ['dispatch_reserved','send_entered','exchange_completed','usage'])assert.equal(log.filter(x=>x.event===event).length,202);assert.equal(log.filter(x=>x.event==='tool_reserved').length,201);
 assert.equal(r.report.verifier.rewards.reward,1);
});
for(const kind of ['unknown','pre_send','parse','auth','quota','quota402','oversize'])test('permanent failure '+kind+' is distinct and never retried',async()=>{
 const r=await fixture({budget:{...METERED_LIMITS,...(kind==='oversize'?{requestBytes:1}:{})},credentialSource:kind==='pre_send'?()=>{throw Error('PRIVATE credential error');}:undefined,fetcher(){
  if(kind==='unknown')throw Error('PRIVATE unknown body');
  if(kind==='auth')return new Response('PRIVATE',{status:401});
  if(kind==='quota'||kind==='quota402')return new Response(JSON.stringify({error:{code:'insufficient_quota',message:'PRIVATE'}}),{status:kind==='quota'?429:402});
  return new Response('data: {BAD PRIVATE\n\n');
 }});
 const d=r.report.diagnostics[0];assert.equal(r.report.counts.retries,0);assert.equal(r.report.verifier,null);assert(!JSON.stringify(r.report).includes('PRIVATE'));assert.equal(r.report.usage[0],null);
 if(['oversize','pre_send'].includes(kind)){assert.equal(d.sendEntered,false);assert.equal(d.stage,'local');assert.equal(r.dispatch,0);assert.equal(d.reserved,kind==='pre_send');}
 if(kind==='parse')assert.equal(d.stage,'parse');if(kind==='unknown')assert.equal(d.reason,'kimi_transport_unknown');if(kind==='auth')assert(r.report.globalStops.some(x=>x.reason==='authentication'));if(kind==='quota'||kind==='quota402')assert(r.report.globalStops.some(x=>x.reason==='quota_exhausted'));
});
for(const kind of ['send','stream','eof','timeout','rate','service'])test('transient '+kind+' retries with metered backoff and retains failed usage',async()=>{
 const timers=clock((label,t)=>{if(label==='recovery')t.fire('recovery');});
 const r=await fixture({timers,budget:METERED_LIMITS,fetcher(n){
  if(n>1)return new Response(wire());
  if(kind==='send')throw transient();
  if(kind==='timeout'){queueMicrotask(()=>timers.fire('dispatch'));return new Promise(()=>{});}
  if(kind==='stream')return {status:200,body:(async function*(){yield Buffer.from(wire('SHOULD_NOT_EXECUTE').split('data: [DONE]')[0]);throw transient();})()};
  if(kind==='eof')return new Response(wire('SHOULD_NOT_EXECUTE').replace('data: [DONE]\n\n',''));
  return new Response('PRIVATE',{status:kind==='rate'?429:503});
 }});
 assert.equal(r.report.agentStatus,'completed');assert.equal(r.report.counts.modelRounds,1);assert.equal(r.report.counts.exchanges,2);assert.equal(r.report.counts.sendEntries,2);assert.equal(r.report.counts.retries,1);assert.equal(r.report.effects.length,0);assert.equal(r.report.usage[0],null);assert.equal(r.report.diagnostics.length,1);assert.equal(timers.jobs.find(x=>x.label==='recovery').ms,250);
});
test('completed tool survives partial next response and executes once',async()=>{
 const timers=clock((label,t)=>{if(label==='recovery')t.fire('recovery');});let commands=0;
 const r=await fixture({timers,budget:METERED_LIMITS,fetcher(n){if(n===1)return new Response(wire('COMPLETED'));if(n===2)return {status:200,body:(async function*(){yield Buffer.from(wire('INCOMPLETE').split('data: [DONE]')[0]);throw transient();})()};return new Response(wire());},env:{async exec(){commands++;return {status:'completed',exit_code:0,stdout:'ok',stderr:'',wait:{settled:true}};}}});
 assert.equal(commands,1);assert.equal(r.report.counts.modelRounds,2);assert.equal(r.report.counts.exchanges,3);assert.equal(r.report.counts.tools,1);assert.equal(r.report.agentStatus,'completed');
});
for(const cause of ['deadline','cancel'])test('persistent failures stop at original '+cause+' during backoff',async()=>{
 const abort=new AbortController();let waits=0;const timers=clock((label,t)=>{if(label==='recovery'){if(++waits===4){if(cause==='deadline')t.fire('agent');else abort.abort();}else t.fire('recovery');}});
 const r=await fixture({timers,signal:abort.signal,budget:METERED_LIMITS,fetcher(){throw transient();}});
 assert.deepEqual(timers.jobs.filter(x=>x.label==='recovery').map(x=>x.ms),[250,500,1000,2000]);assert.equal(timers.jobs.filter(x=>x.label==='agent').length,1);assert.equal(r.dispatch,4);assert.equal(r.report.counts.sendEntries,4);assert.equal(r.report.diagnostics.length,4);
 if(cause==='deadline'){assert.equal(r.report.agentStopReason,'agent_timeout');assert.equal(r.report.verifier.rewards.reward,1);}else {assert(r.report.globalStops.some(x=>x.reason==='cancelled'));assert.equal(r.report.verifier,null);}
});
test('installed runtime rejects implicit/unknown unlimited limits without changing legacy defaults',async()=>{
 const {pathToFileURL}=await import('node:url');const {dirname,join}=await import('node:path');
 const {resolveKernelLimits}=await import(pathToFileURL(join(dirname(process.env.PAN_TEST_ENTRY??process.env.WO75_PAN_ENTRY),'runtime/agent-kernel.js')));
 assert.equal(resolveKernelLimits().maxModelTurns,64);
 for(const input of [{maxModelTurns:null},{mode:'unknown'},{mode:'metered'},{mode:'metered',maxModelTurns:999999,maxToolSteps:999999},{mode:'bounded',maxToolSteps:null}])assert.throws(()=>resolveKernelLimits(input));
 assert.deepEqual(resolveKernelLimits({mode:'metered',maxModelTurns:null,maxToolSteps:null}),{mode:'metered',maxModelTurns:null,maxToolSteps:null});
});
test('HTTP authentication stops without waiting for an unreadable body',async()=>{
 const r=await fixture({budget:METERED_LIMITS,fetcher:()=>({status:401,body:{[Symbol.asyncIterator](){return {next:()=>new Promise(()=>{}),return:()=>Promise.resolve({done:true})};}}})});
 assert.equal(r.report.diagnostics[0].stage,'http');assert.equal(r.report.diagnostics[0].httpStatus,401);assert.equal(r.report.counts.retries,0);assert(r.report.globalStops.some(x=>x.reason==='authentication'));
});
test('Retry-After and exponential waits are bounded delays, not retry count caps',async()=>{
 let waits=0;const timers=clock((label,t)=>{if(label==='recovery'){waits++;t.fire('recovery');}});
 const r=await fixture({timers,budget:METERED_LIMITS,fetcher:n=>n<=10?new Response('{}',{status:429,headers:n===1?{'retry-after':'900'}:{}}):new Response(wire())});
 assert.equal(waits,10);assert.equal(r.report.counts.sendEntries,11);assert.equal(r.report.agentStatus,'completed');assert.deepEqual(timers.jobs.filter(x=>x.label==='recovery').map(x=>x.ms),[60000,500,1000,2000,4000,8000,10000,10000,10000,10000]);
});
for(const reason of ['stream_timeout','cancel_send'])test('diagnostic '+reason+' records stage and true send entry',async()=>{
 const abort=new AbortController();const timers=clock((label,t)=>{if(label==='recovery')t.fire('recovery');});
 const r=await fixture({timers,signal:abort.signal,budget:METERED_LIMITS,fetcher:n=>{
  if(n>1)return new Response(wire());
  if(reason==='cancel_send'){abort.abort();throw transient();}
  return {status:200,body:{[Symbol.asyncIterator](){return {next(){queueMicrotask(()=>timers.fire('dispatch'));return new Promise(()=>{});},return:()=>Promise.resolve({done:true})};}}};
 }});
 assert.equal(r.report.diagnostics[0].sendEntered,true);assert.equal(r.report.diagnostics[0].stage,reason==='cancel_send'?'cancel':'stream');
 if(reason==='stream_timeout'){assert.equal(r.report.diagnostics[0].reason,'dispatch_timeout');assert.equal(r.report.counts.sendEntries,2);}else {assert.equal(r.report.counts.sendEntries,1);assert.equal(r.report.verifier,null);}
});
