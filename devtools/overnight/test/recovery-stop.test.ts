import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fixture, authorize } from '../src/fixture.ts';
import { atomic, load, read, birth } from '../src/storage.ts';
import { OfflineProcess, members, pause } from '../src/process.ts';

const output=process.env.OVERNIGHT_EVIDENCE??mkdtempSync(join(tmpdir(),'overnight-recovery-stop-'));
mkdirSync(output,{recursive:true});const rows:any[]=[];
const command=(...args:string[])=>spawnSync(process.execPath,['--experimental-strip-types',resolve('src/cli.ts'),...args],{encoding:'utf8'});
test('F4 real crash and fresh CLI recovery clean owned work despite invalid history',async t=>{
 for(const name of ['invalid-stop','unchanged-stop','invalid-role-deadline','invalid-total-deadline','conflicting-receipt','reused-identity'])await t.test(name,async()=>{
  const f=fixture('accept'),caseDir=join(output,'recovery-stop',name);mkdirSync(caseDir,{recursive:true});
  if(name==='invalid-role-deadline')f.manifest.limits.roleMs=2500;
  if(name==='invalid-total-deadline')f.manifest.limits.totalMs=3500;
  authorize(f.manifest);
  const crashed=spawnSync(process.execPath,['--experimental-strip-types',resolve('fixtures/crash-coordinator.mjs'),f.config,f.state,'live-review'],{encoding:'utf8'});
  assert.equal(crashed.status,94);assert(existsSync(join(f.state,'owner.json')));
  const before=load(f.state),a=before.attempts.at(-1)!,dir=join(f.state,'attempts',a.key),receipt=read(join(dir,'receipt.json'));
  assert.equal(birth(receipt.pid),receipt.birth);assert.equal(receipt.pid,a.pid);assert.equal(receipt.birth,a.birth);
  const end=performance.now()+4000;while(!existsSync(join(dir,'descendant.json'))){assert(performance.now()<end);await pause(10);}
  const descendant=read(join(dir,'descendant.json'));assert(members(receipt.pid).some(x=>x.pid===descendant.pid));
  try {
   const trackerPath=join(f.state,'tracker',before.attempts[0]!.key+'.json');
   writeFileSync(join(caseDir,'ledger-before.json'),readFileSync(join(f.state,'ledger.json')));
   writeFileSync(join(caseDir,'tracker-before.json'),readFileSync(trackerPath));atomic(join(caseDir,'receipt-before.json'),receipt);
   if(name!=='unchanged-stop'){const r=read(trackerPath);r.session='synthetic-historical-session-mismatch';atomic(trackerPath,r);}
   const rawTracker=readFileSync(trackerPath);
   if(name==='conflicting-receipt')atomic(join(dir,'receipt.json'),{...receipt,pid:process.pid});
   if(name==='reused-identity')atomic(join(dir,'receipt.json'),{...receipt,birth:receipt.birth+' synthetic-reused'});
   const rawReceipt=readFileSync(join(dir,'receipt.json'));
   const unverified=['conflicting-receipt','reused-identity'].includes(name);
   let requestedDeadline:number|null=null;
   if(name.endsWith('deadline')) {
    requestedDeadline=name==='invalid-role-deadline'?a.intentAt+f.manifest.limits.roleMs:before.expiry;
    while(Date.now()<requestedDeadline)await pause(Math.min(10,requestedDeadline-Date.now()));
   } else {
    assert.equal(command('stop',f.state).status,0);
    const first=readFileSync(join(f.state,'stop.json'));assert.equal(command('stop',f.state).status,0);assert.deepEqual(readFileSync(join(f.state,'stop.json')),first);
   }
   // Independent fixture timer, not a fabricated coordinator receipt. Exposes bypass even on the old source.
   const fixtureTimer=Date.now();atomic(join(dir,'stop-coordination'),{requested:true,source:'SIMULATED regression timer'});
   const resumed=command('resume',f.config,f.state),resumeReturned=Date.now(),resumeReturnedMono=performance.now();
   writeFileSync(join(caseDir,'stdout.txt'),resumed.stdout);writeFileSync(join(caseDir,'stderr.txt'),resumed.stderr);
   assert.equal(resumed.status,0);const summary=JSON.parse(resumed.stdout),after=load(f.state);
   const received=existsSync(join(dir,'stop-receipt.json'))?read(join(dir,'stop-receipt.json')):null;
   const lifecycle=existsSync(join(dir,'cleanup.json'))?read(join(dir,'cleanup.json')):null;
   // Wall clock crosses processes; all bound comparisons use raw monotonic values from the coordinator's own process.
   const observations:any[]=[];const through=resumeReturnedMono+3050;
   while(performance.now()<through){observations.push({monotonic:performance.now(),wall:Date.now(),members:members(receipt.pid),sentinel:existsSync(join(dir,'late-sentinel'))});await pause(35);}
   const last={monotonic:performance.now(),wall:Date.now(),members:members(receipt.pid),sentinel:existsSync(join(dir,'late-sentinel'))};observations.push(last);
   const row={name,workspace:f.workspace,state:f.state,caseDir,crashExit:crashed.status,crashedPid:crashed.pid,resumedPid:resumed.pid,receipt,descendant,requestedDeadline,fixtureTimer,resumeReturned,resumeReturnedMono,received,lifecycle,summary,beforeAttempts:before.attempts.length,afterAttempts:after.attempts.length,observations};
   rows.push(row);atomic(join(output,'R-F4.json'),{simulation:'SIMULATED',criteriaVersion:'1.0',rows});
   assert.deepEqual(readFileSync(trackerPath),rawTracker);assert.deepEqual(readFileSync(join(dir,'receipt.json')),rawReceipt);
   assert.equal(after.attempts.length,2);assert.equal(after.repairs,0);assert.equal(after.expiry,before.expiry);assert.deepEqual(after.manifest.limits,before.manifest.limits);
   if(unverified) {
    assert.equal(summary.state,'cleanup_failed');assert.equal(summary.reason,'recorded_result_invalid');
    const decision=read(join(f.state,'history-reconciliation.json'));assert.equal(decision.integrity,'recorded_result_invalid');assert.equal(decision.cleanupReason,'cleanup_unconfirmed');
    assert.equal(lifecycle?.confirmed??false,false);assert.equal(lifecycle?.term??null,null);assert.equal(lifecycle?.kill??null,null);
    assert.equal(birth(receipt.pid),receipt.birth);assert(last.members.length>0);assert(last.sentinel,'untouched fixture control must finish its timer');
   } else {
    assert.equal(summary.state,name==='unchanged-stop'?'cancelled':'needs_reconciliation');
    assert.equal(summary.reason,name==='unchanged-stop'?'cancelled':'recorded_result_invalid');
    assert(received && lifecycle?.confirmed);assert.equal(last.members.length,0);assert(!last.sentinel);
    assert(lifecycle.term-received.monotonic<=250);assert(lifecycle.kill-lifecycle.term<=250);
    assert(lifecycle.observations.at(-1).at-received.monotonic<=2000);
    assert(last.monotonic-resumeReturnedMono>=3000); // resume returned after the coordinator's t0: conservative monotonic lower bound
    if(name!=='unchanged-stop'){const decision=read(join(f.state,'history-reconciliation.json'));assert.equal(decision.integrity,'recorded_result_invalid');assert.equal(decision.cleanupState,name.endsWith('deadline')?'timed_out':'cancelled');}
    if(requestedDeadline!==null)assert.equal(received.reason,'timed_out');
   }
  } finally {
   // Separate backstop; never counts as coordinator success. Only this fixture's verified original receipt.
   const backstop=join(caseDir,'test-backstop');mkdirSync(backstop);assert.equal(birth(receipt.pid)===null || birth(receipt.pid)===receipt.birth,true);
   assert(await new OfflineProcess().cleanup(receipt,backstop));assert.equal(members(receipt.pid).length,0);
  }
 });
});
