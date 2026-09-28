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
const BASE=process.env.WO100_TEST_ROOT,SOURCE=process.env.WO100_SOURCE;assert(BASE&&SOURCE);mkdirSync(BASE,{recursive:true});
const m=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url))),driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
const proof=inspectRecovery(SOURCE,m),reserved=proof.imported.map(x=>x.task),available=m.tasks.map(t=>t.id).filter(x=>!reserved.includes(x));
function setup(){
 const root=mkdtempSync(join(BASE,'case-')),home=join(root,'home'),campaign=join(root,'campaign'),archive=join(root,'archive'),fixture=join(root,'fixture.json');mkdirSync(home);mkdirSync(archive);
 const config={root,home,runner:'f'.repeat(40),mode:'offline-control'};const layout={version:1,runner:root,entry:join(root,'entry'),python:join(root,'python'),harborRoot:join(root,'harbor'),taskRoot:join(root,'tasks'),archiveRoot:archive,ownedRoots:[root]};
 const lp=join(root,'layout.json');writeFileSync(lp,JSON.stringify(layout));const keys=generateKeyPairSync('ed25519'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});writeFileSync(join(state,'authority.json'),JSON.stringify({acceptedRunnerSha:config.runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const cmd=(command,args=[],ok=true)=>{writeFileSync(fixture,JSON.stringify(config));const p=spawnSync(process.execPath,[driver,fixture,command,'--campaign',campaign,...args],{env:{PATH:process.env.PATH,HOME:home,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:16*1024*1024});if(ok)assert.equal(p.status,0,p.stderr);return p;};
 cmd('restore97',['--source',SOURCE,'--layout',lp]);
 const status=()=>JSON.parse(cmd('status').stdout),prepare=ids=>cmd('prepare',['--task',ids.join(','),'--task-root',layout.taskRoot]);
 const permit=(ids,change)=>{const b=JSON.parse(cmd('status',['--task',ids.join(',')]).stdout).proposedBinding;const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline100',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:b};change?.(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const path=join(root,a.runId+'.json');writeFileSync(path,JSON.stringify(a));return path;};
 const run=(path,ok=true)=>cmd('run',['--activation',path,'--entry',layout.entry,'--task-root',layout.taskRoot],ok);
 const effects=()=>existsSync(join(root,'effects.jsonl'))?readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
 return {root,home,campaign,archive,config,layout,lp,cmd,status,prepare,permit,run,effects};
}
test('C-REC-01 source ledger cross-check, actual89 rows and repeated imports retain57; no inferred scores',()=>{
 const c=setup(),s=c.status();assert.equal(s.notStarted,32);assert.equal(s.successes,16);assert.equal(s.validScored,21);assert.equal(s.rows.filter(r=>r.runId).length,57);
 const second=s.rows.filter(r=>r.runId==='16f4f98e-348f-41a3-b18f-ee9dad4dbc18');assert.equal(second.length,20);assert(second.every(r=>r.validScore===null&&r.reason==='missing_evidence/unknown'));assert.equal(second.reduce((n,r)=>n+r.accounting.usage.input,0),1344318);assert.equal(second.reduce((n,r)=>n+r.accounting.usage.output,0),54793);
 assert.notEqual(c.cmd('restore97',['--source',SOURCE,'--layout',c.lp],false).status,0);assert.equal(setup().status().notStarted,32);
 // Every consumed item is checked directly at the real proposedBinding seam, no fake authorization.
 const store=new Store(c.campaign);attachRecovery(store,m);store.residualsChecked=true;
 return import('./full-cli.mjs').then(({proposedBinding})=>{for(const id of reserved)assert.throws(()=>proposedBinding(store,m,[id]),/task_not_unstarted/);});
});
for(const stage of ['before_reservation','after_reservation','before_result','after_result','before_archive','after_archive'])test('C-REC-02 independent process interruption '+stage+' preserves reservation and resumes only unstarted',()=>{
 const c=setup(),ids=available.slice(0,2);c.prepare(ids);const p=c.permit(ids);c.config.crash=stage;assert.equal(c.run(p,false).status,73);const s=c.status();assert.equal(s.notStarted,stage==='before_reservation'?32:31);
 delete c.config.crash;c.cmd('recover');const next=stage==='before_reservation'?ids:[ids[1]];c.prepare(next);c.run(c.permit(next));assert.equal(c.status().notStarted,30);
 const starts=c.effects().filter(x=>x.kind==='start').map(x=>x.task);assert.equal(new Set(starts).size,starts.length);assert(!starts.some(x=>reserved.includes(x)));
 const files=readdirSync(join(c.campaign,'journal')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(join(c.campaign,'journal',f))));assert(files.some(r=>r.event==='archived'));
});
test('C-REC-02 external disconnect blocks next task, local result survives, archive repair does not execute',()=>{
 const c=setup(),ids=available.slice(0,2);c.prepare(ids);const p=c.permit(ids);renameSync(c.archive,c.archive+'-offline');assert.match(c.run(p,false).stderr,/archive_unavailable/);assert.equal(c.status().notStarted,31);assert.deepEqual(c.effects().filter(x=>x.kind==='start').map(x=>x.task),[ids[0]]);
 renameSync(c.archive+'-offline',c.archive);c.cmd('recover');assert.equal(c.effects().filter(x=>x.kind==='start').length,1);c.prepare([ids[1]]);c.run(c.permit([ids[1]]));assert.equal(c.status().notStarted,30);
});
test('C-REC-01/03 unknown old stop, old signature and old run refuse before credentials',()=>{
 const c=setup();c.prepare([available[0]]);c.config.oldStopUnknown=true;assert.match(c.cmd('status',['--task',available[0]],false).stderr,/historical_stop_unknown/);c.config.oldStopUnknown=false;
 const old=c.permit([available[0]],a=>{delete a.binding.executionPolicy;});assert.match(c.run(old,false).stderr,/activation_identity/);
 const reused=c.permit([available[0]],a=>{a.runId='16f4f98e-348f-41a3-b18f-ee9dad4dbc18';});assert.match(c.run(reused,false).stderr,/run_already_consumed/);assert.equal(c.effects().filter(r=>r.kind==='credential').length,0);
});
test('C-REC-03 4CPU8GiB official tasks reach actual broker config, resources never inflated',()=>{
 const c=setup(),ids=['mcmc-sampling-stan','rstan-to-pystan','polyglot-c-py'];c.prepare(ids);const p=c.permit(ids);const b=JSON.parse(readFileSync(p)).binding;assert.deepEqual(b.executionPolicy,EXECUTION_POLICY);c.run(p);
 for(const e of c.effects().filter(r=>r.kind==='start'))assert.deepEqual(e.resources,m.tasks.find(t=>t.id===e.task).config.environment);
 for(const [cpu,mem,valid] of [[2,'4G',true],[4,'8G',true],[4.1,'8G',false],[4,'8193M',false],[0,'8G',false],[NaN,'8G',false],[2,'0G',false],[2,'-1G',false],[2,'8g',false]])assert.equal(!!requirements({config:{environment:{cpus:cpu,memory:mem}}},EXECUTION_POLICY),valid);
 assert(!requirements(m.tasks.find(t=>t.id==='mcmc-sampling-stan')));assert.throws(()=>resourceCheck('',{docker:48503971840},{free:50*2**30,owned:0,docker:null}),/resource_sample_unknown/);
});
for(const kind of ['ledger-truncated','ledger-conflict','index','result-tamper','missing-result'])test('C-REC-01 controls '+kind,()=>{
 const root=mkdtempSync(join(BASE,'source-')),source=join(root,'source');cpSync(SOURCE,source,{recursive:true});
 if(kind.startsWith('ledger')){const p=join(source,'recovery-20260928/ledgers/16f4f98e-348f-41a3-b18f-ee9dad4dbc18.jsonl');const bytes=readFileSync(p);writeFileSync(p,kind==='ledger-truncated'?bytes.subarray(0,-5):Buffer.concat([bytes,bytes]));}
 else if(kind==='index')writeFileSync(join(source,'recovery-20260928/reservation-evidence-index.json'),'{}');
 else {const base=join(source,'criteria12-pre-signing-20260928/campaign-disk39/history-original/segments/eecf5765-a6fe-47ab-9286-aa825fa0aba7'),task=proof.imported.find(r=>r.outcome?.validScore===1).task,p=join(base,task,'cleanup.json');if(kind==='missing-result')unlinkSync(p);else writeFileSync(p,'{}');}
 if(kind==='missing-result'){const x=inspectRecovery(source,m);assert.equal(x.imported.length,57);assert.equal(x.imported.filter(r=>r.outcome?.validScore!=null).length,20);}else assert.throws(()=>inspectRecovery(source,m),/recovery_source_hash/);
});
test('C-REC-02 temporary/symlink layout fails and missing image cannot bind',()=>{
 const c=setup();assert.throws(()=>validateLayout({...c.layout,python:'/private/tmp/old/python'},c.campaign,'offline-control'),/temporary_runtime_path/);
 c.config.scenarios={[available[0]]:'not_cached'};c.prepare([available[0]]);assert.match(c.cmd('status',['--task',available[0]],false).stderr,/task_not_prepared/);
});

test('C-REC-02 archive write failure retains local originals and recover can supplement without replay',()=>{
 const c=setup(),id=available[0];c.prepare([id]);const p=c.permit([id]);renameSync(c.archive,c.archive+'-held');writeFileSync(c.archive,'synthetic-not-a-directory');assert.notEqual(c.run(p,false).status,0);assert.equal(c.status().notStarted,31);
 unlinkSync(c.archive);renameSync(c.archive+'-held',c.archive);const count=c.effects().filter(x=>x.kind==='start').length;c.cmd('recover');assert.equal(c.effects().filter(x=>x.kind==='start').length,count);
});
test('C-REC-01 imported bytes and accounting tampering prevent any continuation',()=>{
 const c=setup();const p=join(c.campaign,'segments/16f4f98e-348f-41a3-b18f-ee9dad4dbc18/ledger.jsonl');writeFileSync(p,readFileSync(p).subarray(0,-1));assert.match(c.cmd('status',[],false).stderr,/recovery_accounting_conflict/);
});
