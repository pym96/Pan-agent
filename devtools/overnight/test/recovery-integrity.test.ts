import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fixture } from '../src/fixture.ts';
import { atomic, load, read } from '../src/storage.ts';
import { digest } from '../src/model.ts';
const output=process.env.OVERNIGHT_EVIDENCE??mkdtempSync(join(tmpdir(),'overnight-recovery-integrity-'));
mkdirSync(output,{recursive:true});const rows:any[]=[];
function scenario(name:string, mutate:(r:any,dir:string)=>void, point='recorded-review', kind='repair'):any {
 const f=fixture(kind),caseDir=join(output,'recovery-integrity',name);mkdirSync(caseDir,{recursive:true});
 const crashed=spawnSync(process.execPath,['--experimental-strip-types',resolve('fixtures/crash-coordinator.mjs'),f.config,f.state,point],{encoding:'utf8'});
 assert.equal(crashed.status,93);assert(existsSync(join(f.state,'owner.json')));
 const before=load(f.state),a=before.attempts.at(-1)!,path=join(f.state,'tracker',a.key+'.json'),dir=join(f.state,'attempts',a.key);
 writeFileSync(join(caseDir,'ledger-before.json'),readFileSync(join(f.state,'ledger.json')));writeFileSync(join(caseDir,'tracker-before.json'),readFileSync(path));
 const input=read(path);mutate(input,dir);atomic(path,input);const raw=readFileSync(path);
 const resumed=spawnSync(process.execPath,['--experimental-strip-types',resolve('src/cli.ts'),'resume',f.config,f.state],{encoding:'utf8'});
 writeFileSync(join(caseDir,'raw-synthetic-stdout.txt'),resumed.stdout);writeFileSync(join(caseDir,'raw-synthetic-stderr.txt'),resumed.stderr);
 assert.equal(resumed.status,0);const summary=JSON.parse(resumed.stdout),after=load(f.state);
 const row={name,workspace:f.workspace,state:f.state,caseDir,crashExit:crashed.status,crashedPid:crashed.pid,resumedPid:resumed.pid,originalDigest:a.resultDigest,trackerDigest:digest(input),beforeAttempts:before.attempts.length,afterAttempts:after.attempts.length,summary};rows.push(row);atomic(join(output,'R-RECOVERY.json'),{simulation:'SIMULATED',criteriaVersion:'1.0',rows});
 assert.deepEqual(readFileSync(path),raw,'recovery overwrote tracker input');
 if(name==='unchanged-control'){assert.equal(summary.state,'accepted_pending_master');assert.equal(after.attempts.length,4);}
 else {assert.equal(summary.state,'needs_reconciliation');assert.equal(after.attempts.length,before.attempts.length);assert.equal(after.repairs,before.repairs);}
 return {f,row,stdout:resumed.stdout,stderr:resumed.stderr};
}
test('F1 recorded tracker schema, identities, digest and evidence are revalidated after actual process death',async t=>{
 const variants:Record<string,(r:any,d:string)=>void>={
  'wrong-role':r=>{r.role='builder';r.kind='handoff';r.outcome='accepted';r.blockers=[];},
  'wrong-session':r=>r.session=randomUUID(), 'wrong-candidate':r=>r.candidate='f'.repeat(40),
  'changed-accepted':r=>{r.outcome='accepted';r.blockers=[];},
  'wrong-evidence-link':r=>r.evidence.digest='0'.repeat(64),
  'changed-evidence-bytes':(r,d)=>writeFileSync(join(d,'evidence.json'),'{}\n'),
  'changed-role-result':(r,d)=>atomic(join(d,'result.json'),{...r,session:'wrong'}),
  'unknown-field':r=>r.extra='unexpected',
  'unchanged-control':()=>{}
 };
 for(const [name,mutate]of Object.entries(variants))await t.test(name,()=>scenario(name,mutate));
 await t.test('recorded-builder',()=>scenario('recorded-builder',r=>r.session='forged','recorded-builder'));
});
test('F2 unknown recorded blocker never reserves or launches repair after crash',()=>{
 scenario('unknown-blocker',r=>r.blockers=['C-NOT-IN-CONTRACT']);
});
test('F3 recorded outcome and unexpected-field canaries do not enter generated ledger or CLI',async t=>{
 for(const field of ['outcome','unexpected'])await t.test(field,()=>{
  const canary='RAW_SYNTHETIC_REPAIR_'+randomUUID();
  const {f,stdout,stderr}=scenario('canary-'+field,(r,d)=>{r[field]=canary;writeFileSync(join(d,'raw-synthetic-canary.txt'),canary);});
  assert(!stdout.includes(canary));assert(!stderr.includes(canary));assert(!readFileSync(join(f.state,'ledger.json'),'utf8').includes(canary));
 });
});
