/** Explicit WO83 authorization only. No live credentials, provider or official tests. */
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {openBroker} from './broker.mjs';import {runAttempt} from './session.mjs';import {Ledger,LIMITS,MODEL} from './policy.mjs';import {resourceGuard} from './resources.mjs';import {wire} from './test_handoff_support.mjs';
const auth=process.env.WO83_CONTROL_AUTH;const role=process.env.WO83_ROLE??'builder';
if(auth&&auth!=='H-GRADE83-SCOPE-20260923-001')throw Error('authorization_required');
if(!['builder','regulator'].includes(role))throw Error('role');
const root=role==='builder'?'/private/tmp/wo83-work':'/private/tmp/wo83-regulator';
const scenarios=['normal','deadline','budget','cancel','verifier_cancel','uncertain','timeout'];
const selected=process.env.WO83_SCENARIO?scenarios.filter(x=>x===process.env.WO83_SCENARIO):scenarios;
if(process.env.WO83_SCENARIO&&!selected.length)throw Error('scenario');
for(const scenario of selected)test('WO83 real controlled handoff '+scenario,{skip:!auth},async()=>{
 mkdirSync(root,{recursive:true});const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
 const out=join(root,scenario+'-'+randomUUID());mkdirSync(out);const abort=new AbortController();const guard=resourceGuard(root,abort);
 const budgetPath=join(root,role+'-container-budget.jsonl');const budget={...LIMITS,...(scenario==='budget'?{dispatchesPerTask:1}:{})};
 const gate={runId:randomUUID(),binding:{model:MODEL,budget,taskIds:[scenario]},clock:Date.now,expiresAt:Date.now()+60000,assert(s){if(abort.signal.aborted||s?.aborted)throw Error('cancelled');if(Date.now()>=this.expiresAt)throw Error('activation_expired');}};
 const ledger=new Ledger(join(out,'synthetic-ledger'),gate);const requests=[];
 const broker=openBroker({python:'/private/tmp/wo74-work/venv/bin/python',home:out,dockerConfig:out,config:{authorization:auth,role,budget:budgetPath,runner_sha:sha,scenario,output:join(out,'broker'),task:{id:scenario,config:{environment:{build_timeout_sec:15}}}},spawnImplementation:(exe,args,opts)=>spawn(exe,[fileURLToPath(new URL('./test_handoff_control.py',import.meta.url))],opts)});
 const prior=globalThis.fetch;globalThis.fetch=()=>{throw Error('real provider forbidden');};let calls=0,cancelTimer;
 try{
  const instruction=await broker.ready;
  const writer="echo INITIAL >/tmp/artifact; /bin/sh -c 'echo $$ >/tmp/writer-pid; while [ ! -e /tmp/grade-entry ]; do sleep .05; done; echo LATE >/tmp/late' &";
  const first=writer+(['deadline','cancel','timeout'].includes(scenario)?' wait':' :');
  const env={...broker,exec(command,timeout){if(scenario==='cancel')cancelTimer=setTimeout(()=>abort.abort(),1000);return broker.exec(command,timeout);},verify(){if(scenario==='verifier_cancel')cancelTimer=setTimeout(()=>abort.abort(),100);return broker.verify();}};
  const report=await runAttempt({entry:'/private/tmp/wo75-work/consumer/node_modules/pan-agent/dist/index.js',task:{id:scenario,config:{agent:{timeout_sec:scenario==='deadline'?1.5:20},verifier:{timeout_sec:5}}},instruction,output:join(out,'attempt'),environment:env,gate,ledger,credentialSource:()=> 'synthetic-83-control',signal:abort.signal,fetchImplementation:async(u,o)=>{calls++;requests.push(JSON.parse(o.body));return new Response(wire(calls===1?first:scenario==='timeout'&&calls===2?'test -f /tmp/artifact; echo CONTINUED':null));}});
  writeFileSync(join(out,'result.json'),JSON.stringify({scenario,runner_sha:sha,synthetic_dispatches:calls,real_model_requests:0,report},null,2)+'\n');writeFileSync(join(out,'requests.json'),JSON.stringify(requests,null,2)+'\n');
  assert.equal(report.stopConfirmed,true);assert.equal(report.effects.length,scenario==='timeout'?2:1);
  if(['cancel','uncertain'].includes(scenario)){assert.equal(report.verifier,null);assert(report.globalStops.length);}
  else if(scenario==='verifier_cancel'){assert.equal(report.verifier.rewards,null);assert(report.globalStops.some(x=>x.reason==='cancelled'));}
  else{assert.equal(report.verifier?.status,'synthetic_control');assert.equal(report.verifier.rewards.reward,1);assert.equal(report.quiescence.confirmed,true);}
  if(scenario==='deadline'){assert.equal(report.agentStopReason,'agent_timeout');assert.equal(calls,1);assert.equal(report.effects[0].result.termination.confirmed,true);}
  if(scenario==='budget'){assert.equal(report.agentStopReason,'turn_limit');assert.equal(calls,1);}
  if(scenario==='timeout'){assert.equal(report.effects[0].result.status,'timeout');assert.equal(calls,3);assert(requests[1].messages.some(x=>x.role==='tool'&&x.content.includes('timeout')));}
 }finally{clearTimeout(cancelTimer);globalThis.fetch=prior;ledger.close();await broker.close();guard.close();}
 const cleanup=JSON.parse(readFileSync(join(out,'broker/cleanup.json')));assert.equal(cleanup.state.Running,false);assert.equal(cleanup.state.Pid,0);
});
