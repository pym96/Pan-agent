import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,cpSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectRecovery,restoreEvidence,attachRecovery} from './full-recovery.mjs';
import {Store,aggregate} from './full-store.mjs';
import {requirements,EXECUTION_POLICY,resourceCheck} from './full-host.mjs';
import {validateLayout} from './full-durable.mjs';
import {canonical,digest} from './policy.mjs';
const BASE=process.env.WO101_TEST_ROOT,SOURCE=process.env.WO101_SOURCE;assert(BASE&&SOURCE);mkdirSync(BASE,{recursive:true});
const m=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url))),driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
const proof=inspectRecovery(SOURCE,m),reserved=proof.imported.map(x=>x.task),available=m.tasks.map(t=>t.id).filter(x=>!reserved.includes(x));
function setup(){
 const root=mkdtempSync(join(BASE,'case-')),home=join(root,'home'),campaign=join(root,'campaign'),archive=join(root,'archive'),fixture=join(root,'fixture.json');mkdirSync(home);mkdirSync(archive);
 const config={root,home,runner:'f'.repeat(40),mode:'offline-control'};const layout={version:1,runner:root,entry:join(root,'entry'),python:join(root,'python'),harborRoot:join(root,'harbor'),taskRoot:join(root,'tasks'),archiveRoot:archive,ownedRoots:[root]};
 const lp=join(root,'layout.json');writeFileSync(lp,JSON.stringify(layout));const keys=generateKeyPairSync('ed25519'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});writeFileSync(join(state,'authority.json'),JSON.stringify({acceptedRunnerSha:config.runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const cmd=(command,args=[],ok=true)=>{writeFileSync(fixture,JSON.stringify(config));const p=spawnSync(process.execPath,[driver,fixture,command,'--campaign',campaign,...args],{env:{PATH:process.env.PATH,HOME:home,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:16*1024*1024});const n=readdirSync(root).filter(f=>f.endsWith('.stdout')).length;writeFileSync(join(root,`${n}-${command}.stdout`),p.stdout);writeFileSync(join(root,`${n}-${command}.stderr`),p.stderr);if(ok)assert.equal(p.status,0,p.stderr);return p;};
 cmd('restore97',['--source',SOURCE,'--layout',lp]);
 const status=()=>JSON.parse(cmd('status').stdout),prepare=ids=>cmd('prepare',['--task',ids.join(','),'--task-root',layout.taskRoot]);
 const permit=(ids,change)=>{const b=JSON.parse(cmd('status',['--task',ids.join(',')]).stdout).proposedBinding;const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline100',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:b};change?.(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const path=join(root,a.runId+'.json');writeFileSync(path,JSON.stringify(a));return path;};
 const run=(path,ok=true)=>cmd('run',['--activation',path,'--entry',layout.entry,'--task-root',layout.taskRoot],ok);
 const effects=()=>existsSync(join(root,'effects.jsonl'))?readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
 return {root,home,campaign,archive,config,layout,lp,cmd,status,prepare,permit,run,effects};
}

test('C-D54-01 exact 54GiB boundaries, invalid samples and original deployment estimate',()=>{
 const G=2**30,baseline={docker:48503971840};
 for(const free of [20*G-1,20*G,20*G+1])for(const inc of [39*G,54*G-1,54*G,54*G+1]){
  const call=()=>resourceCheck('',baseline,{free,owned:1000,docker:baseline.docker+inc-1000});
  if(free>=20*G&&inc<54*G)call();else assert.throws(call,/resource_boundary/);
 }
 for(const value of [null,undefined,NaN,Infinity,-1,'100',{},[]])for(const field of ['free','owned','docker'])assert.throws(()=>resourceCheck('',baseline,{free:30*G,owned:0,docker:baseline.docker,[field]:value}),/resource_sample_unknown/);
 for(const docker of [null,NaN,-1,'0'])assert.throws(()=>resourceCheck('',{docker},{free:30*G,owned:0,docker:0}),/resource_sample_unknown/);
 assert.throws(()=>resourceCheck('',baseline,{free:30*G,owned:54*G,docker:0}),/resource_boundary/);
 resourceCheck('',baseline,{free:30*G,owned:54*G-1,docker:0});
 const before={free:44734652416,owned:2301550592,docker:88021364736};
 const estimated={...before,free:before.free-103587840,owned:before.owned+103587840};
 assert(estimated.owned+estimated.docker-baseline.docker>=39*G);resourceCheck('',baseline,estimated);
 assert.equal(EXECUTION_POLICY.disk.incrementExclusiveBytes,57982058496);
});
test('C-D54-02 restored57, 54GiB binding, old policy/run refusal, synthetic execution and source integrity',async()=>{
 const before=inspectRecovery(SOURCE,m),c=setup(),s=c.status();
 assert.equal(s.rows.length,89);assert.equal(s.notStarted,32);assert.equal(s.rows.filter(r=>r.runId).length,57);
 const second=s.rows.filter(r=>r.runId==='16f4f98e-348f-41a3-b18f-ee9dad4dbc18');assert.equal(second.length,20);assert(second.every(r=>r.validScore===null));
 const meta=JSON.parse(readFileSync(join(c.campaign,'campaign.json')));assert.equal(meta.resourceBaseline.docker,48503971840);assert.deepEqual(meta.identity.executionPolicy,EXECUTION_POLICY);
 const store=new Store(c.campaign);attachRecovery(store,m);store.residualsChecked=true;const {proposedBinding}=await import('./full-cli.mjs');
 for(const id of reserved)assert.throws(()=>proposedBinding(store,m,[id]),/task_not_unstarted/);
 const ids=['polyglot-c-py'];c.config.owned=40*2**30;c.prepare(ids);
 for(const field of ['executionPolicy','full']){
  const old=c.permit(ids,a=>{if(field==='full')a.binding.full.resourcePolicy.incrementExclusiveBytes=39*2**30;else a.binding.executionPolicy.disk.incrementExclusiveBytes=39*2**30;});
  assert.match(c.run(old,false).stderr,/activation_identity/);
 }
 const reused=c.permit(ids,a=>{a.runId='16f4f98e-348f-41a3-b18f-ee9dad4dbc18';});assert.match(c.run(reused,false).stderr,/run_already_consumed/);
 assert.equal(c.effects().filter(e=>e.kind==='credential'||e.kind==='start').length,0);
 const p=c.permit(ids),binding=JSON.parse(readFileSync(p)).binding;assert.equal(binding.full.resourcePolicy.incrementExclusiveBytes,57982058496);assert.deepEqual(binding.executionPolicy.disk,binding.full.resourcePolicy);
 c.config.owned=54*2**30;assert.match(c.run(p,false).stderr,/resource_boundary/);assert.equal(c.effects().filter(e=>e.kind==='credential').length,0);
 c.config.owned=40*2**30;c.run(p);assert.deepEqual(c.effects().filter(e=>e.kind==='start').map(e=>e.task),ids);assert.equal(c.status().notStarted,31);
 assert.deepEqual(c.status().rows.filter(r=>reserved.includes(r.task)),s.rows.filter(r=>reserved.includes(r.task)));
 assert.deepEqual(inspectRecovery(SOURCE,m),before);
});
