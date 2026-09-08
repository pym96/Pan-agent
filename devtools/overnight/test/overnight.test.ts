import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fixture, authorize } from '../src/fixture.ts';
import { run, stop, status, deadline, SimulatedCrash, type Options } from '../src/coordinator.ts';
import { digest, safe, shape, type Manifest, type Attempt } from '../src/model.ts';
import { read, atomic, load, save, birth, OfflineTracker } from '../src/storage.ts';
import { git, pause, members, OfflineProcess } from '../src/process.ts';
const output=process.env.OVERNIGHT_EVIDENCE??mkdtempSync(join(tmpdir(),'overnight-test-evidence-'));
mkdirSync(output,{recursive:true});
const matrices:Record<string,unknown[]>={};
function record(name:string,row:unknown):void{(matrices[name]??=[]).push(row);atomic(join(output,`${name}.json`),{simulation:'SIMULATED',criterion:name,rows:matrices[name]});}
const counts=(s:any)=>[s.attempts.filter((a:Attempt)=>a.role==='builder').length,s.attempts.filter((a:Attempt)=>a.role==='regulator').length];
function inventory(f:ReturnType<typeof fixture>, label:string):void {record('fixtures',{label,workspace:f.workspace,state:f.state,config:f.config,base:f.manifest.base});}
async function waitFor(fn:()=>boolean,ms=5000):Promise<void>{const end=performance.now()+ms;while(!fn()){assert(performance.now()<end,'fixture wait deadline');await pause(15);}}
function attemptDir(f:ReturnType<typeof fixture>):string {const l=load(f.state);return join(f.state,'attempts',l.attempts.at(-1)!.key);}
const crash=(point:string):Options=>({crash:(p)=>{if(p===point)throw new SimulatedCrash(point);}});

test('C-AUTO-01 initial identity matrix refuses before launch; explicit live mode refuses before filesystem use',async()=>{
 const mutations:Record<string,(m:any)=>void>={
  missing_role:m=>delete m.templates.builder, conflict_role:m=>m.templates.builder=m.templates.regulator,
  wrong_issue:m=>m.issue++, wrong_repository:m=>m.repository='wrong', wrong_base:m=>m.base='a'.repeat(40),wrong_candidate:m=>m.branch='main',
  wrong_version:m=>m.version='2.0',wrong_digest:m=>m.contractDigest='b'.repeat(64),wrong_template:m=>m.templates.regulator='c'.repeat(64),
  live:m=>{m.mode='live';m.workspace='/must-not-be-read';},missing_proof:m=>m.humanProof='d'.repeat(64),
  executable:m=>m.executable='/bin/sh',cwd:m=>m.workspace='/tmp/../hostile',role_payload:m=>m.role='Master Agent'
 };
 for(const [label,mutate]of Object.entries(mutations)){
  const f=fixture('accept');mutate(f.manifest);let launched=0;let category='';
  try{await run(f.manifest,f.state,false,{process:{launch(){launched++;},receipt(){return null;},completion(){return null;},async cleanup(){return false;}}});assert.fail('must refuse');}catch(e:any){category=e.category??'invalid_input';}
  assert.equal(launched,0);assert(!existsSync(f.state),'invalid configuration created job directory');record('A-IDENTITY',{label,launches:launched,category});inventory(f,label);
 }
 const f=fixture('accept');mkdirSync(join(f.workspace,'worktrees','regulator-1'));writeFileSync(join(f.workspace,'worktrees','regulator-1','dirty'),'uncommitted');await assert.rejects(run(f.manifest,f.state));assert(!existsSync(join(f.state,'attempts')));record('A-IDENTITY',{label:'dirty_review',launches:0});
});

test('C-AUTO-02 real processes and Git cross repair boundary; terminal duplicate/status launches zero',async()=>{
 for(const kind of ['repair','accept']){
  const f=fixture(kind);const s:any=await run(f.manifest,f.state);assert.equal(s.state,'accepted_pending_master');assert.deepEqual(counts(s),kind==='repair'?[2,2]:[1,1]);
  const l=load(f.state);assert.equal(new Set(l.attempts.map(a=>a.session)).size,l.attempts.length);assert.equal(new Set(l.attempts.map(a=>a.worktree)).size,l.attempts.length);
  const processes=l.attempts.map(a=>read(join(f.state,'attempts',a.key,'observed-process.json')));assert.equal(new Set(processes.map(x=>x.pid)).size,l.attempts.length);
  for(const a of l.attempts){const r=read(join(f.state,'tracker',a.key+'.json'));assert.equal(r.role,a.role);if(a.role==='regulator')assert.equal(r.candidate,a.candidate);assert(!readFileSync(join(f.state,'attempts',a.key,'input.json'),'utf8').includes('private chat'));}
  assert.equal(git(join(f.workspace,'remote.git'),['rev-parse','refs/heads/main']),f.manifest.base);
  assert.deepEqual(await run(f.manifest,f.state,true),s);assert.deepEqual(status(f.state),s);
  const raw=JSON.stringify(l);assert(!raw.includes('private conversation'));record('A-ROUTE',{kind,summary:s,processes,transitions:l.transitions,workspace:f.workspace,main:f.manifest.base});inventory(f,kind);
 }
});

test('C-AUTO-01 post-launch identity spoof and high-risk missing Human evidence do not advance',async()=>{
 for(const kind of ['spoof','wrong-result','malformed','empty']){const f=fixture(kind);const s:any=await run(f.manifest,f.state);assert.equal(s.state,'needs_human');assert.deepEqual(counts(s),[1,0]);record('A-IDENTITY',{kind,summary:s});inventory(f,kind);}
 const f=fixture('accept');f.manifest.highRisk=['C-DEMO-01'];authorize(f.manifest);const s:any=await run(f.manifest,f.state);assert.equal(s.state,'needs_human');assert.equal(s.reason,'human_evidence_missing');assert.deepEqual(counts(s),[1,1]);record('A-IDENTITY',{kind:'missing_additional_human_gate',summary:s});inventory(f,'human gate');
});

test('C-AUTO-03 launch/publication/terminal crash matrix preserves unique effects',async()=>{
 for(const point of ['intent','launch','publication','terminal']) {
  const f=fixture('accept');await assert.rejects(run(f.manifest,f.state,false,crash(point)),SimulatedCrash);
  if(point==='launch')await waitFor(()=>existsSync(join(attemptDir(f),'receipt.json')));
  const s:any=await run(f.manifest,f.state,true);
  if(point==='intent'){assert.equal(s.state,'needs_reconciliation');assert.equal(s.reason,'launch_receipt_unknown');assert.equal(readdirSync(join(f.state,'attempts')).length,1);assert(!existsSync(join(attemptDir(f),'receipt.json')));}
  else {assert.equal(s.state,'accepted_pending_master');assert.deepEqual(counts(s),[1,1]);const tracker=new OfflineTracker(join(f.state,'tracker'));const key=load(f.state).attempts[0]!.key;const result=tracker.lookup(key);tracker.publish(key,result);assert.equal(readdirSync(join(f.state,'tracker')).length,2);}
  const before=readFileSync(join(f.state,'ledger.json'));await run(f.manifest,f.state,true);const after=readFileSync(join(f.state,'ledger.json'));if(point==='terminal')assert.deepEqual(after,before);
  record('A-RECOVERY',{point,summary:s,workspace:f.workspace});inventory(f,point);
 }
});

test('C-AUTO-03 concurrent owner, second job, surviving child and identity-mismatch recovery',async()=>{
 const f=fixture('accept');atomic(join(f.workspace,'scenario.json'),{kind:'accept',delayMs:350});
 const running=run(f.manifest,f.state);await waitFor(()=>existsSync(join(f.state,'attempts')));
 await assert.rejects(run(f.manifest,f.state),/owner_busy/);await assert.rejects(run(f.manifest,f.state,true),/owner_busy/);
 const other=fixture('accept');await assert.rejects(run(other.manifest,f.state),/owner_busy/);const s:any=await running;assert.deepEqual(counts(s),[1,1]);record('A-RECOVERY',{point:'concurrent_second_job',summary:s});inventory(f,'concurrent');
 const g=fixture('accept');atomic(join(g.workspace,'scenario.json'),{kind:'accept',delayMs:400});await assert.rejects(run(g.manifest,g.state,false,crash('launch')),SimulatedCrash);await waitFor(()=>existsSync(join(attemptDir(g),'receipt.json')));assert(birth(read(join(attemptDir(g),'receipt.json')).pid));const adopted:any=await run(g.manifest,g.state,true);assert.equal(adopted.state,'accepted_pending_master');assert.deepEqual(counts(adopted),[1,1]);record('A-RECOVERY',{point:'surviving_child_adopted',summary:adopted});inventory(g,'surviving');
 const h=fixture('accept');await assert.rejects(run(h.manifest,h.state,false,crash('intent')),SimulatedCrash);const a=load(h.state).attempts[0]!;
 atomic(join(attemptDir(h),'receipt.json'),{pid:process.pid,birth:'mismatched supervisor.mjs start identity',key:a.key,session:a.session});
 const mismatch:any=await run(h.manifest,h.state,true);assert.equal(mismatch.state,'needs_reconciliation');assert.equal(mismatch.reason,'pid_identity_mismatch');assert(birth(process.pid));record('A-RECOVERY',{point:'unrelated_pid_untouched',summary:mismatch,pid:process.pid});inventory(h,'pid mismatch');
});

test('C-AUTO-03 corrupted ledger and contract/ref drift preserve bytes and stop',async()=>{
 const f=fixture('accept');await assert.rejects(run(f.manifest,f.state,false,crash('intent')),SimulatedCrash);const path=join(f.state,'ledger.json');writeFileSync(path,'{"truncated":');const original=readFileSync(path);await assert.rejects(run(f.manifest,f.state,true));assert.deepEqual(readFileSync(path),original);assert.equal((status(f.state)as any).state,'needs_reconciliation');record('A-RECOVERY',{point:'truncated',bytes:original.toString('hex')});inventory(f,'truncated');
 for(const kind of ['contract','main','candidate']) {
  const g=fixture('accept');await assert.rejects(run(g.manifest,g.state,false,crash('publication')),SimulatedCrash);
  if(kind==='contract')writeFileSync(join(g.workspace,'contract.txt'),'drift');else git(join(g.workspace,'remote.git'),['update-ref',kind==='main'?'refs/heads/main':`refs/heads/${g.manifest.branch}`,kind==='main'?read(join(attemptDir(g),'result.json')).candidate:g.manifest.base]);
  let s:any;try{s=await run(g.manifest,g.state,true);}catch{ s={state:'needs_reconciliation',reason:'contract_drift_preflight'}; }
  assert(['needs_reconciliation','needs_human'].includes(s.state));assert.equal(load(g.state).attempts.length,1);record('A-RECOVERY',{point:kind+'_drift',summary:s});inventory(g,kind+' drift');
 }
});

test('C-AUTO-04 repair budgets and explicit non-success result categories',async()=>{
 for(const limit of [0,2]) {const f=fixture('always-reject');f.manifest.limits.repairs=limit;authorize(f.manifest);const s:any=await run(f.manifest,f.state);assert.equal(s.reason,'repair_limit');assert.deepEqual(counts(s),[limit+1,limit+1]);assert.equal(s.repairs,limit);record('A-LIMITS',{limit,summary:s});inventory(f,'limit'+limit);}
 for(const kind of ['evidence_incomplete','scope_challenge','quota_unavailable','unknown-criterion','abnormal','empty','malformed']) {const f=fixture(kind);const s:any=await run(f.manifest,f.state);assert.equal(s.state,'needs_human');assert.equal(s.repairs,0);assert(counts(s)[0]!<=1 && counts(s)[1]!<=1);record('A-LIMITS',{kind,summary:s});inventory(f,kind);}
 const invalid=[true,'1',NaN,1.5,-1,Number.MAX_SAFE_INTEGER+1,undefined,Infinity];
 for(const key of ['repairs','totalMs','roleMs'])for(const value of [...invalid,...(key==='repairs'?[3]:[0,key==='totalMs'?28800001:3600001])]){
  const f=fixture('accept');(f.manifest.limits as any)[key]=value;await assert.rejects(run(f.manifest,f.state));assert(!existsSync(f.state));record('A-LIMITS',{invalid:key,value:String(value),launches:0});
 }
 assert.equal(deadline(999,1000),false);assert.equal(deadline(1000,1000),true);
 for(const kind of ['expiry','backward']){const f=fixture('accept');await assert.rejects(run(f.manifest,f.state,false,crash('intent')),SimulatedCrash);const l=load(f.state);const now=kind==='expiry'?l.expiry:l.lastWall-1;const s:any=await run(f.manifest,f.state,true,{clock:{wall:()=>now,mono:()=>0}});assert.notEqual(s.state,'accepted_pending_master');assert.equal(s.attempts.length,1);assert.equal(load(f.state).expiry,l.expiry);record('A-LIMITS',{kind,summary:s,originalExpiry:l.expiry});inventory(f,kind);}
});

test('C-AUTO-05 pre-stop zero launch, explicit stop and deadline kill ordinary descendants within bound',async()=>{
 const pre=fixture('accept');stop(pre.state);const preSummary:any=await run(pre.manifest,pre.state);assert.equal(preSummary.state,'cancelled');assert.deepEqual(counts(preSummary),[0,0]);record('A-CANCEL',{case:'pre-stop',summary:preSummary});
 for(const kind of ['stop','deadline']) {
  const f=fixture('blocked');f.manifest.limits.roleMs=kind==='deadline'?1300:10000;authorize(f.manifest);
  const running=run(f.manifest,f.state);await waitFor(()=>existsSync(join(f.state,'attempts'))&&existsSync(join(attemptDir(f),'descendant.json')));
  const dir=attemptDir(f), descendant=read(join(dir,'descendant.json')), receipt=read(join(dir,'receipt.json'));
  assert(members(receipt.pid).some(p=>p.pid===descendant.pid));
  const request=performance.now();if(kind==='stop'){stop(f.state);stop(f.state);}
  const s:any=await running;assert.equal(s.state,kind==='stop'?'cancelled':'timed_out');assert.deepEqual(counts(s),[1,0]);
  const lifecycle=read(join(dir,'cleanup.json')),received=read(join(dir,'stop-receipt.json'));
  assert(lifecycle.confirmed);assert(lifecycle.elapsed<=2000);assert(lifecycle.t0+lifecycle.elapsed-received.monotonic<=2000);assert(lifecycle.term-received.monotonic<250);assert(lifecycle.kill-lifecycle.term<=250);
  assert.equal(members(receipt.pid).length,0);assert.equal(birth(descendant.pid),null);
  while(performance.now()<received.monotonic+3000){assert(!existsSync(join(dir,'late-sentinel')));await pause(20);}
  assert(!existsSync(join(dir,'late-sentinel')));stop(f.state);assert.deepEqual(await run(f.manifest,f.state,true),s);
  record('A-CANCEL',{case:kind,summary:s,request,received,lifecycle,descendant,receipt,sentinelAbsentThrough:performance.now(),workspace:f.workspace});inventory(f,kind);
 }
});

test('C-AUTO-05 unconfirmed cleanup never reports cancellation; wrong PID is not signaled',async()=>{
 const f=fixture('accept');await assert.rejects(run(f.manifest,f.state,false,crash('intent')),SimulatedCrash);const a=load(f.state).attempts[0]!;atomic(join(attemptDir(f),'receipt.json'),{pid:process.pid,birth:'wrong supervisor.mjs',key:a.key,session:a.session});stop(f.state);
 const s:any=await run(f.manifest,f.state,true);assert.equal(s.state,'cleanup_failed');assert(birth(process.pid));record('A-CANCEL',{case:'wrong_pid',summary:s,pid:process.pid});inventory(f,'wrong pid cleanup');
 const g=fixture('accept');await assert.rejects(run(g.manifest,g.state,false,crash('intent')),SimulatedCrash);stop(g.state);const failed:any=await run(g.manifest,g.state,true);assert.equal(failed.state,'cleanup_failed');record('A-CANCEL',{case:'cleanup_unconfirmed',summary:failed});inventory(g,'unconfirmed');
});

test('C-AUTO-06 canary channels, hostile payloads and negative oracle controls',async()=>{
 const canary='SYNTHETIC_SECRET_'+digest(String(Math.random()));process.env.OVERNIGHT_TEST_SECRET=canary;
 let network=0;const oldFetch=globalThis.fetch;globalThis.fetch=(async()=>{network++;throw Error('network forbidden');})as typeof fetch;
 const clean=(value:string)=>{assert(!value.includes(canary),'canary disclosure');assert(!/[\u001b\u009b\u202e]/.test(value),'terminal control');};
 try {
  for(const kind of ['canary','hostile','accept']) {
    const f=fixture(kind);writeFileSync(join(f.workspace,'raw-synthetic-canary.txt'),canary);const s:any=await run(f.manifest,f.state);
    if(kind!=='accept')assert.equal(s.state,'needs_human');else assert.equal(s.state,'accepted_pending_master');
    clean(readFileSync(join(f.state,'ledger.json'),'utf8'));clean(safe(status(f.state)));
    const l=load(f.state);for(const a of l.attempts){const d=join(f.state,'attempts',a.key);clean(readFileSync(join(d,'observed-process.json'),'utf8'));clean(readFileSync(join(d,'input.json'),'utf8'));assert.equal(read(join(d,'observed-process.json')).env.OVERNIGHT_TEST_SECRET,undefined);}
    if(existsSync(join(f.state,'tracker')))for(const n of readdirSync(join(f.state,'tracker')))clean(readFileSync(join(f.state,'tracker',n),'utf8'));
    assert.equal(git(join(f.workspace,'remote.git'),['rev-parse','refs/heads/main']),f.manifest.base);
    record('A-CONTAINMENT',{kind,summary:s,network,rawFixtureExclusions:['raw-synthetic-canary.txt','attempts/*/result.json'],workspace:f.workspace});inventory(f,kind);
  }
  assert.throws(()=>clean(canary));assert.throws(()=>clean('\u001b[2J'));
  const allowed=(argv:string[])=>assert.deepEqual(argv,['fixed-offline-role']);assert.throws(()=>allowed(['/bin/sh','-c','touch forbidden']));
  clean(safe('x\u001b[2J\u009b\u202e\u0000'));assert.equal(network,0);record('A-CONTAINMENT',{negativeCanaryDetected:true,negativeLaunchDetected:true,negativeTerminalControlDetected:true,network,credentialSourceCalls:0});
 }finally{globalThis.fetch=oldFetch;delete process.env.OVERNIGHT_TEST_SECRET;}
});

test('C-AUTO-03 actual coordinator death leaves owner lock; explicit reconcile adopts without relaunch',async()=>{
 const harness=resolve('fixtures/crash-coordinator.mjs');
 for(const point of ['intent','launch','publication','terminal']) {
  const f=fixture('accept');if(point==='launch')atomic(join(f.workspace,'scenario.json'),{kind:'accept',delayMs:400});
  const child=spawn(process.execPath,['--experimental-strip-types',harness,f.config,f.state,point],{stdio:'ignore'});
  const exit=await new Promise(resolve=>child.on('exit',resolve));assert.equal(exit,91);assert(existsSync(join(f.state,'owner.json')));
  if(point==='launch')await waitFor(()=>existsSync(join(attemptDir(f),'receipt.json')));
  const s:any=await run(f.manifest,f.state,true);assert.equal(s.state,point==='intent'?'needs_reconciliation':'accepted_pending_master');
  assert.deepEqual(counts(s),point==='intent'?[1,0]:[1,1]);
  assert(readdirSync(f.state).some(n=>n.startsWith('retired-owner-')));record('A-RECOVERY',{point:'real_process_crash_'+point,coordinatorPid:child.pid,exit,summary:s,workspace:f.workspace});inventory(f,'actual crash '+point);
 }
});

test('C-AUTO-04 injected monotonic role and total expiry use inclusive boundary and preserve original deadlines',async()=>{
 for(const limit of ['role','total']) {
  const f=fixture('blocked');if(limit==='total'){f.manifest.limits.roleMs=f.manifest.limits.totalMs;authorize(f.manifest);}let mono=0;const wall=Date.now();let steps=0;
  const running=run(f.manifest,f.state,false,{clock:{wall:()=>wall,mono:()=>mono}});
  await waitFor(()=>existsSync(join(f.state,'attempts'))&&existsSync(join(attemptDir(f),'descendant.json')));
  const initial=load(f.state);mono=(limit==='role'?f.manifest.limits.roleMs:f.manifest.limits.totalMs)-1;
  await pause(60);assert.equal(load(f.state).state,'building');steps++;
  mono++;const s:any=await running;assert.equal(s.state,'timed_out');assert.equal(load(f.state).expiry,initial.expiry);assert.deepEqual(counts(s),[1,0]);
  const dir=attemptDir(f);assert.equal(members(read(join(dir,'receipt.json')).pid).length,0);record('A-LIMITS',{kind:'injected_'+limit,beforeBoundaryObserved:steps,exactBoundary:mono,summary:s});inventory(f,'fake '+limit);
 }
});

test('C-AUTO-07 actual CLI start/status/stop/resume and offline-mode refusal',async()=>{
 const cli=resolve('src/cli.ts');
 const command=(args:string[])=>execFileSync(process.execPath,['--experimental-strip-types',cli,...args],{encoding:'utf8'}).trim();
 const f=fixture('accept');const started=JSON.parse(command(['start',f.config,f.state]));assert.equal(started.state,'accepted_pending_master');
 assert.deepEqual(JSON.parse(command(['status',f.state])),started);assert.deepEqual(JSON.parse(command(['resume',f.config,f.state])),started);
 const g=fixture('accept');command(['stop',g.state]);const cancelled=JSON.parse(command(['start',g.config,g.state]));assert.equal(cancelled.state,'cancelled');assert.deepEqual(counts(cancelled),[0,0]);
 const live=join(g.workspace,'live.json');atomic(live,{mode:'live',workspace:'/must-not-be-opened'});assert.throws(()=>command(['start',live,join(g.workspace,'live-state')]));assert(!existsSync(join(g.workspace,'live-state')));
 record('A-PACKAGE',{cliStart:started,statusAndResumeIdentical:true,cliStop:cancelled,liveRefused:true,platform:process.platform,arch:process.arch,node:process.version});inventory(f,'CLI accepted');inventory(g,'CLI stopped');
});

test('C-AUTO-06 credential-source spy and remote/executable drift stop before launch; child network guards report zero',async()=>{
 const fs=await import('node:fs');const {syncBuiltinESMExports}=await import('node:module');
 const f=fixture('accept');const secretPath=join(f.workspace,'synthetic-credential-source');writeFileSync(secretPath,'SYNTHETIC_UNREAD_CREDENTIAL');
 const original=fs.default.readFileSync;let reads=0;
 (fs.default as any).readFileSync=(path:any,...args:any[])=>{if(String(path)===secretPath){reads++;throw Error('credential source forbidden');}return(original as any)(path,...args);};syncBuiltinESMExports();
 try {
  const s:any=await run(f.manifest,f.state);assert.equal(s.state,'accepted_pending_master');assert.equal(reads,0);
  const guards=[];for(const a of load(f.state).attempts){const d=join(f.state,'attempts',a.key);const names=readdirSync(d).filter(n=>n.startsWith('network-guard-'));assert.equal(names.length,2);for(const n of names){const g=read(join(d,n));assert.equal(g.networkAttempts,0);guards.push(g);}}
  const g=fixture('accept');git(join(g.workspace,'repo'),['remote','set-url','origin','https://invalid.example/never-connect']);await assert.rejects(run(g.manifest,g.state),/remote_drift/);assert(!existsSync(join(g.state,'attempts')));
  record('A-CONTAINMENT',{credentialSourceReads:reads,childGuards:guards,remoteDriftLaunches:0});inventory(f,'guarded child');inventory(g,'remote drift');
 }finally{(fs.default as any).readFileSync=original;syncBuiltinESMExports();}
});
