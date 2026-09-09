import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { connectorFixture, runConnector, dryRun, FileIssueTransport, authorizeConnector } from '../src/connector.ts';
import { bindingShape, validateBinding, codexArgs, connectorEnvironment, type Binding } from '../src/connector-authority.ts';
import { CodexEvents, responseShape } from '../src/connector-output.ts';
import { GitHubTracker, publication, verifyRemoteAuthority, activationBody, stageAReviewBody, humanReviewBody } from '../src/github-tracker.ts';
import { atomic, read, load, birth } from '../src/storage.ts';
import { digest, fileDigest, safe } from '../src/model.ts';
import { members, pause, OfflineProcess } from '../src/process.ts';
const output=process.env.OVERNIGHT_EVIDENCE??mkdtempSync(join(tmpdir(),'connector-evidence-'));mkdirSync(output,{recursive:true});
const rows:Record<string,any[]>={};function record(name:string,row:any):void{(rows[name]??=[]).push(row);atomic(join(output,name+'.json'),{stage:'A',simulation:'SIMULATED',rows:rows[name]});}
function inventory(f:ReturnType<typeof connectorFixture>,label:string):void{record('connector-fixtures',{label,workspace:f.workspace,state:f.state});}
const cli=(...args:string[])=>spawnSync(process.execPath,['--experimental-strip-types',resolve('src/connector.ts'),...args],{encoding:'utf8'});

test('C-LIVE-01 Stage A rejects invalid role/auth/target/binding before any launch',async t=>{
 for(const name of ['missing','role','api','unknown-auth','target','sha','template','config','stage','budget'])await t.test(name,async()=>{
  const f=connectorFixture(),b=read(join(f.workspace,'delegation.json'));let launches=0;
  if(name==='missing')delete b.delegation;
  if(name==='role')b.roles=['builder','builder'];if(name==='api')b.auth='api';if(name==='unknown-auth')b.auth='unknown';
  if(name==='target')b.github.issue=47;if(name==='sha')b.connectorSha='bad';if(name==='template')f.manifest.templates.builder='0'.repeat(64);
  if(name==='config')b.argv=['--dangerously-bypass-approvals-and-sandbox'];if(name==='stage')b.stage='B';if(name==='budget')f.manifest.limits.totalMs=7200001;
  atomic(join(f.workspace,'delegation.json'),b);
  await assert.rejects(runConnector(f.manifest,false,{process:{launch(){launches++;},receipt(){return null;},completion(){return null;},async cleanup(){return false;}}}));
  assert.equal(launches,0);assert(!existsSync(f.state));record('L-AUTH',{case:name,launches,credentialReads:0});inventory(f,name);
 });
});
test('C-LIVE-02 bounded JSONL checks chunking, completion, session, identity and final output',async t=>{
 const f=connectorFixture(),a:any={role:'builder',session:randomUUID(),candidate:f.manifest.base};
 const value={role:a.role,session:a.session,inputCandidate:a.candidate,outcome:'handoff',blockers:[]};
 const events=[{type:'thread.started',thread_id:randomUUID()},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(value)}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:2}}];
 const raw=Buffer.from(events.map(x=>JSON.stringify(x)).join('\n')+'\n');const good=new CodexEvents();for(const b of raw)good.push(Buffer.from([b]));assert(good.finish(0,value,a).thread);
 for(const name of ['malformed','incomplete','exit','role','sha','session','unknown','unknown-blocker','different-final','failed','duplicate-thread'])await t.test(name,()=>{
  const p=new CodexEvents(),v={...value,blockers:[...value.blockers]},e=structuredClone(events);let exit:number|null=0;
  if(name==='role')v.role='regulator';if(name==='sha')v.inputCandidate='f'.repeat(40);if(name==='session')v.session='other';if(name==='unknown')(v as any).canary='SYNTHETIC';if(name==='unknown-blocker')Object.assign(v,{outcome:'criterion_failed',blockers:['OTHER']});
  if(name==='exit')exit=1;if(name==='incomplete')e.pop();if(name==='failed')e.splice(2,0,{type:'turn.failed'} as any);if(name==='duplicate-thread')e.splice(1,0,e[0]!);
  assert.throws(()=>{p.push(Buffer.from(name==='malformed'?'{broken\n':e.map(x=>JSON.stringify(x)).join('\n')+'\n'));p.finish(exit,name==='different-final'?{...v,outcome:'scope_challenge'}:v,a);});record('L-RESULT',{case:name,rejected:true});
 });record('L-RESULT',{case:'one-byte-chunks',pass:true});inventory(f,'JSONL');
});
test('C-LIVE-02/05 actual fake CLI result mismatch/canary stops before next stage',async t=>{
 for(const kind of ['wrong-session','unknown-field'])await t.test(kind,async()=>{
  const f=connectorFixture(),canary='SYNTHETIC_'+randomUUID();atomic(join(f.workspace,'scenario.json'),{kind});writeFileSync(join(f.workspace,'raw-synthetic-canary.txt'),canary);
  const result:any=await runConnector(f.manifest);assert.equal(result.attempts.length,1);assert.notEqual(result.state,'accepted_pending_master');assert(!JSON.stringify(result).includes(canary));assert(!readFileSync(join(f.state,'ledger.json'),'utf8').includes(canary));
  record('L-CONTAINMENT',{case:kind,summary:result,canaryDetectedInRawOnly:true});inventory(f,kind);
 });
});
test('C-LIVE-03 committed write with lost response adopts once; ambiguous/changed comments never retry',async()=>{
 const f=connectorFixture();const result:any=await runConnector(f.manifest);assert.equal(result.state,'accepted_pending_master');const a=load(f.state).attempts[0]!,r=read(join(f.state,'attempts',a.key,'result.json')),b=validateBinding(f.manifest);
 let writes=0;const wire=new FileIssueTransport(join(f.workspace,'lost-response'));const tracker=new GitHubTracker({list:()=>wire.list(),post(body){writes++;wire.post(body);throw Error('lost');}},join(f.workspace,'tracker-fault'),b);
 tracker.publish(a.key,r);tracker.publish(a.key,r);assert.equal(writes,1);assert.deepEqual(tracker.lookup(a.key),r);
 const comments=wire.list();comments[0]!.body=comments[0]!.body.replace(r.session,'changed');atomic(join(f.workspace,'lost-response/comments.json'),comments);assert.throws(()=>tracker.lookup(a.key));
 let unknownWrites=0;const unknown=new GitHubTracker({list:()=>[],post(){unknownWrites++;throw Error('unknown');}},join(f.workspace,'ambiguous'),b);
 assert.throws(()=>unknown.publish(a.key,r));assert.throws(()=>unknown.publish(a.key,r));assert.equal(unknownWrites,1);
 assert.throws(()=>verifyRemoteAuthority([],b));
 record('L-TRACKER',{lostResponseWrites:writes,ambiguousWrites:unknownWrites,changedCommentRejected:true,absentRemoteAuthorityRejected:true});inventory(f,'tracker faults');
});
test('C-LIVE-01/05 actual fixed argv/environment, distinct sessions, private raw logs, terminal replay and negative controls',async()=>{
 const f=connectorFixture(),canary='SYNTHETIC_'+randomUUID();process.env.OPENAI_API_KEY=canary;process.env.GH_TOKEN=canary;
 try {
  const preview:any=dryRun(f.manifest);assert.equal(preview.realLaunches,0);assert(!existsSync(f.state));
  const result:any=await runConnector(f.manifest);assert.equal(result.state,'accepted_pending_master');assert.equal(result.attempts.length,2);
  const l=load(f.state),threads=[];
  for(const a of l.attempts){const dir=join(f.state,'attempts',a.key),config=read(join(dir,'effective-config.json')),session=read(join(dir,'codex-session.json'));threads.push(session.thread);
   assert(!JSON.stringify(config).includes(canary));assert(!config.argv.some((x:string)=>['resume','fork','--last','--approve-for-me','--dangerously-bypass-approvals-and-sandbox','--dangerously-bypass-hook-trust'].includes(x)));
   assert(config.argv.includes('--ignore-user-config'));assert(config.argv.includes('forced_login_method="chatgpt"'));assert.equal(statSync(join(dir,'private-events.jsonl')).mode&0o777,0o600);
   const child=read(join(dir,'observed-connector-process.json'));assert(!JSON.stringify(child.env).includes(canary));assert(!('GH_TOKEN' in child.env));assert(!('OPENAI_API_KEY' in child.env));
  }
  assert.equal(new Set(threads).size,2);const replay:any=await runConnector(f.manifest,true);assert.deepEqual(replay,result);
  const wire=new FileIssueTransport(join(f.workspace,'fixture-github'));assert.equal(wire.list().length,3);assert(!JSON.stringify(wire.list()).includes(canary));
  assert.throws(()=>publication(l.attempts[0]!.key,{...read(join(f.state,'attempts',l.attempts[0]!.key,'result.json')),secret:canary}));
  assert(!safe({text:'\u001b[2J\u202e'}).includes('\u001b'));assert(JSON.stringify({injected:canary}).includes(canary),'oracle negative control');
  record('L-AUTH',{case:'actual fake CLI',threads,argvConfigChecked:true,preview});record('L-CONTAINMENT',{case:'canary and negative controls',pass:true});inventory(f,'positive and channels');
 } finally {delete process.env.OPENAI_API_KEY;delete process.env.GH_TOKEN;}
});
test('C-LIVE-04 real connector crash + corrupt historical comment + CLI stop cleans owned descendants',async()=>{
 const f=connectorFixture();atomic(join(f.workspace,'scenario.json'),{kind:'blocked'});
 const crashed=spawnSync(process.execPath,['--experimental-strip-types',resolve('fixtures/connector-crash.mjs'),f.config],{encoding:'utf8'});assert.equal(crashed.status,94);
 const before=load(f.state),a=before.attempts.at(-1)!,dir=join(f.state,'attempts',a.key),receipt=read(join(dir,'receipt.json'));
 const end=performance.now()+4000;while(!existsSync(join(dir,'descendant.json'))){assert(performance.now()<end);await pause(10);}
 try {
  const path=join(f.workspace,'fixture-github/comments.json'),comments=read(path);comments[0].body=comments[0].body.replace(before.attempts[0]!.session,'corrupt-session');atomic(path,comments);const raw=readFileSync(path);
  assert.equal(cli('stop',f.state).status,0);assert.equal(cli('stop',f.state).status,0);
  const resumed=cli('resume',f.config);assert.equal(resumed.status,0);const result=JSON.parse(resumed.stdout);const returned=performance.now();
  const received=read(join(dir,'stop-receipt.json')),lifecycle=read(join(dir,'cleanup.json'));
  while(performance.now()<returned+3050)await pause(35);
  assert.equal(result.state,'needs_reconciliation');assert.equal(result.reason,'recorded_result_invalid');assert.equal(result.attempts.length,2);assert.equal(result.repairs,0);assert.equal(load(f.state).expiry,before.expiry);
  assert(lifecycle.confirmed);assert(lifecycle.term-received.monotonic<=250);assert(lifecycle.kill-lifecycle.term<=250);assert(lifecycle.observations.at(-1).at-received.monotonic<=2000);assert.equal(members(receipt.pid).length,0);assert(!existsSync(join(dir,'late-sentinel')));assert.deepEqual(readFileSync(path),raw);
  record('L-STOP',{case:'connector F4',workspace:f.workspace,received,lifecycle,sentinelAbsentAfterResumeMs:performance.now()-returned,summary:result});inventory(f,'connector F4');
 } finally {const backstop=join(output,'connector-backstop');mkdirSync(backstop,{recursive:true});assert(await new OfflineProcess().cleanup(receipt,backstop));}
});


test('C-LIVE-01/03 real gate requires exact PASS records and unchanged formal contract',async t=>{
 const f=connectorFixture(),b=structuredClone(validateBinding(f.manifest));b.stage='B';
 const url=(id:number)=>`https://github.com/pym96/Pan-agent/issues/46#issuecomment-${id}`;
 b.stageAReview=url(101);b.humanReview=url(102);b.masterActivation=url(103);
 const comment=(id:number,body:string)=>({id,body,author:b.github.author,url:url(id)});
 const valid=[comment(5595244988,readFileSync(resolve('fixtures/workorder-46-contract.txt'),'utf8')),comment(101,stageAReviewBody(b.connectorSha)),comment(102,humanReviewBody(b.connectorSha)),comment(103,activationBody(b))];
 verifyRemoteAuthority(valid,b);record('L-AUTH',{case:'exact Stage A/Human/Master records',pass:true});
 for(const kind of ['contract','rejected','human-rejected','wrong-sha','wrong-author','missing-activation','prose-only'])await t.test(kind,()=>{
  const changed=structuredClone(valid);
  if(kind==='contract')changed[0]!.body+='changed';if(kind==='rejected')changed[1]!.body=changed[1]!.body.replace('PASS','rejected');
  if(kind==='human-rejected')changed[2]!.body=changed[2]!.body.replace('PASS','rejected');if(kind==='wrong-sha')changed[1]!.body=stageAReviewBody('a'.repeat(40));
  if(kind==='wrong-author')changed[3]!.author='other';if(kind==='missing-activation')changed.pop();if(kind==='prose-only')changed[1]!.body='This rejected review mentions '+b.connectorSha;
  assert.throws(()=>verifyRemoteAuthority(changed,b));record('L-AUTH',{case:kind,rejectedBeforeInference:true});
 });inventory(f,'remote authority records');
});
