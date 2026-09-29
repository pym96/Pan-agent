import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,cpSync,readdirSync,renameSync,symlinkSync,statSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {inspectSuccessorSource,SUCCESSOR_INVENTORY,SUCCESSOR_PACKAGE,attachSuccessor} from './full-successor-104.mjs';
import {sourceInventory} from './full-upgrade-102.mjs';
import {Store,aggregate} from './full-store.mjs';
import {proposedBinding} from './full-cli.mjs';
import {canonical,digest} from './policy.mjs';
const base=process.env.WO104_ROOT,source=process.env.WO104_SOURCE,external=process.env.WO104_EXTERNAL,entry=process.env.PAN_TEST_ENTRY;
assert(base&&source&&external&&entry,'dedicated roots and actual new package required');mkdirSync(base,{recursive:true});mkdirSync(external,{recursive:true});
const repo=fileURLToPath(new URL('../../../',import.meta.url)),driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
const runner=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),m=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url))),proof=inspectSuccessorSource(source,m),before=aggregate(proof.store,m);
const remaining=before.rows.filter(r=>!r.runId).map(r=>r.task),missing=['mteb-retrieve','pytorch-model-recovery'],cached=remaining.filter(x=>!missing.includes(x));
const images=Object.fromEntries(cached.map(id=>[id,proof.store.rows.filter(r=>r.event==='preparation'&&r.task===id).at(-1).detail.image]));
function setup(){
 const root=mkdtempSync(join(base,'case-')),campaign=join(root,'campaign'),home=join(root,'home'),archive=join(external,root.split('/').at(-1));mkdirSync(home);mkdirSync(archive);
 const runtime=JSON.parse(readFileSync('/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/layout.json'));
 const layout={...runtime,runner:repo,entry,archiveRoot:archive,ownedRoots:['/Users/panyiming/.local/state/pan-agent','/opt/homebrew/Cellar/python@3.12/3.12.9']};
 const lp=join(root,'layout.json');writeFileSync(lp,JSON.stringify(layout));const config={root,home,mode:'live',successor104:true,images,missing};
 const keys=generateKeyPairSync('ed25519'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});writeFileSync(join(state,'authority.json'),JSON.stringify({acceptedRunnerSha:runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 let seq=0;const cmd=(command,args=[],ok=true)=>{const fixture=join(root,'fixture.json');writeFileSync(fixture,JSON.stringify(config));writeFileSync(lp,JSON.stringify(layout));const p=spawnSync(process.execPath,[driver,fixture,command,'--campaign',campaign,...args],{env:{PATH:process.env.PATH,HOME:home,TMPDIR:base,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:32*1024*1024});writeFileSync(join(root,`${seq}-${command}.stdout`),p.stdout);writeFileSync(join(root,`${seq++}-${command}.stderr`),p.stderr);if(ok)assert.equal(p.status,0,p.stderr);return p;};
 const migrate=(src=source,ok=true)=>cmd('successor97',['--source',src,'--layout',lp],ok),status=()=>JSON.parse(cmd('status').stdout);
 const prepare=(ids=remaining)=>cmd('prepare',['--task',ids.join(','),'--task-root',layout.taskRoot]);
 const binding=()=>JSON.parse(cmd('status',['--task',cached.join(',')]).stdout).proposedBinding;
 const effects=()=>existsSync(join(root,'effects.jsonl'))?readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
 const permit=(b,change=()=>{})=>{const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'synthetic104',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:structuredClone(b)};change(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const path=join(root,a.runId+'.json');writeFileSync(path,JSON.stringify(a));return path;};
 const run=p=>cmd('run',['--activation',p,'--entry',layout.entry,'--task-root',layout.taskRoot],false);
 return {root,campaign,archive,config,layout,cmd,migrate,status,prepare,binding,effects,permit,run};
}
function historical(s){return s.rows.filter(r=>r.runId).map(({consumed,missingEvidence,stopConfirmed,preparations,...rest})=>rest);}
function noExecution(c){assert.equal(c.effects().filter(x=>['credential','start','model'].includes(x.kind)).length,0);}
test('C-SUC-01/02 actual fixed source -> fresh successor -> recover/archive -> 25 checked binding, history conserved',()=>{
 const c=setup();c.migrate();const initial=c.status();assert.equal(initial.notStarted,27);assert.deepEqual(historical(initial),historical(before));assert.deepEqual(initial.knownObservedTotals,before.knownObservedTotals);
 assert.equal(initial.rows.filter(r=>r.state==='unknown_interrupted').length,20);
 assert.equal(initial.identity.runnerSha,runner);assert.equal(initial.identity.panHash,SUCCESSOR_PACKAGE);
 assert.deepEqual({...initial.identity,runnerSha:before.identity.runnerSha,panHash:before.identity.panHash},before.identity);
 assert.match(c.cmd('status',['--task',cached[0]],false).stderr,/successor_reconciliation_required/);
 assert.match(c.cmd('prepare',['--task',cached[0],'--task-root',c.layout.taskRoot],false).stderr,/successor_reconciliation_required/);
 c.config.oldStopUnknown=true;assert.match(c.cmd('recover',[],false).stderr,/historical_stop_unknown/);c.config.oldStopUnknown=false;c.cmd('recover');
 assert.match(c.cmd('status',['--task',cached[0]],false).stderr,/task_not_prepared/);c.prepare();
 const binding=c.binding();assert.deepEqual(binding.taskIds,cached);assert.equal(binding.taskIds.length,25);assert.equal(binding.panHash,SUCCESSOR_PACKAGE);assert.equal(binding.runnerSha,runner);assert.notEqual(binding.full.campaignId,before.campaignId);
 const store=new Store(c.campaign);attachSuccessor(store,m);store.residualsChecked=true;
 for(const r of proof.imported)assert.throws(()=>proposedBinding(store,m,[r.task]),/task_not_unstarted/);
 for(const id of missing)assert.match(c.cmd('status',['--task',id],false).stderr,/task_not_prepared/);
 assert.equal(store.oldRunIds.length,15);assert.deepEqual(c.status().knownObservedTotals,before.knownObservedTotals);assert.deepEqual(historical(c.status()),historical(before));
 c.config.changedImage='sha256:'+'b'.repeat(64);assert.match(c.cmd('status',['--task',cached[0]],false).stderr,/task_not_prepared/);delete c.config.changedImage;
 c.config.oldStopUnknown=true;assert.match(c.cmd('status',['--task',cached[0]],false).stderr,/historical_stop_unknown/);delete c.config.oldStopUnknown;
 for(const key of ['runnerSha','panHash'])assert.match(c.run(c.permit(binding,a=>a.binding[key]=before.identity[key])).stderr,/activation_identity/);
 assert.match(c.run(c.permit(binding,a=>a.runId=proof.oldRunIds[0])).stderr,/run_already_consumed/);noExecution(c);
 const snapshot=sourceInventory(c.campaign);assert.notEqual(c.migrate(source,false).status,0);assert.deepEqual(sourceInventory(c.campaign),snapshot);
 assert.deepEqual(sourceInventory(source),proof.files);writeFileSync(join(c.root,'comparison.json'),JSON.stringify({sourceInventory:SUCCESSOR_INVENTORY,source:before,successor:c.status(),binding,historicalProjectionEqual:true,accountingEqual:true},null,2));
});
test('C-SUC-01 mismatched source bytes or metadata never creates a target',()=>{
 for(const file of ['resources.jsonl','campaign.json']){const c=setup(),copy=join(c.root,'bad-source');cpSync(source,copy,{recursive:true});writeFileSync(join(copy,file),readFileSync(join(copy,file),'utf8')+'\n');assert.match(c.migrate(copy,false).stderr,/successor_source_hash/);assert(!existsSync(c.campaign));noExecution(c);}
});
test('C-SUC-01 interruption cannot reopen or overwrite; new target succeeds',()=>{
 for(const stage of ['successor_initialized','successor_before_complete']){const c=setup();c.config.crash=stage;assert.equal(c.migrate(source,false).status,73);delete c.config.crash;assert.notEqual(c.cmd('status',[],false).status,0);assert.notEqual(c.cmd('status',['--task',cached[0]],false).status,0);const snapshot=sourceInventory(c.campaign);assert.notEqual(c.migrate(source,false).status,0);assert.deepEqual(sourceInventory(c.campaign),snapshot);noExecution(c);}
 const c=setup();c.migrate();assert.equal(c.status().notStarted,27);
});
test('C-SUC-02 wrong installed product rejected before target creation',()=>{
 const c=setup(),copy=join(c.root,'bad-package');cpSync(join(entry,'../..'),copy,{recursive:true});c.layout.entry=join(copy,'dist/index.js');writeFileSync(join(copy,'dist/providers/kimi/kimi-transport.js'),'tampered');assert.match(c.migrate(source,false).stderr,/installed_pan_identity/);assert(!existsSync(c.campaign));noExecution(c);
});
test('C-SUC-03 archive failure preserves partials and blocks binding; retry recovery uses new snapshot',()=>{
 const c=setup();c.migrate();c.config.crash='successor_before_archive';assert.equal(c.cmd('recover',[],false).status,73);delete c.config.crash;
 assert.match(c.cmd('status',['--task',cached[0]],false).stderr,/successor_reconciliation_required/);c.cmd('recover');c.prepare();assert.equal(c.binding().taskIds.length,25);
 const parent=join(c.archive,c.status().campaignId,'predecessor');assert.equal(readdirSync(parent).filter(n=>/^[a-f0-9-]{36}$/.test(n)).length,2);
 const receipt=JSON.parse(readFileSync(join(parent,'commit/receipt.json')));writeFileSync(join(parent,receipt.snapshot,'resources.jsonl'),'tampered');assert.match(c.cmd('status',[],false).stderr,/successor_archive_hash/);noExecution(c);
});
test('C-SUC-03 resource and external filesystem gates remain active',()=>{
 const c=setup();c.config.free=21474836479;assert.match(c.migrate(source,false).stderr,/resource_boundary/);assert(!existsSync(c.campaign));delete c.config.free;
 // Valid persistent-looking layout on internal storage is still not an external archive.
 c.layout.archiveRoot=join(c.root,'internal-archive');mkdirSync(c.layout.archiveRoot);assert.match(c.migrate(source,false).stderr,/durable_external_archive/);noExecution(c);
});

test('C-SUC-03 reconciled archive must remain external at every continuation entry',async()=>{
 const c=setup();c.migrate();c.cmd('recover');c.prepare();const binding=c.binding();
 const store=new Store(c.campaign);attachSuccessor(store,m);store.residualsChecked=true;
 const activation=c.permit(binding),original=sourceInventory(c.campaign),observations=[];
 // Each replacement keeps the external original and every archive byte intact.
 // Also cover a nested namespace alias while archiveRoot itself stays external.
 for(const target of [c.archive,join(c.archive,binding.full.campaignId,'predecessor')]){
  const internal=join(c.root,'internal-copy-'+observations.length),retained=target+'-original-retained';
  cpSync(target,internal,{recursive:true});renameSync(target,retained);symlinkSync(internal,target,'dir');
  const observation={target,internal,retained,resolved:realpathSync(target),campaignDevice:statSync(c.campaign).dev,currentDevice:statSync(target).dev,externalDevice:statSync(retained).dev,commands:[]};
  observations.push(observation);assert.equal(observation.currentDevice,observation.campaignDevice);assert.notEqual(observation.externalDevice,observation.campaignDevice);
  for(const [command,args] of [['status',['--task',cached.join(',')]],['recover',[]],['prepare',['--task',cached[0],'--task-root',c.layout.taskRoot]],['run',['--activation',activation,'--entry',c.layout.entry,'--task-root',c.layout.taskRoot]]]){
   const result=c.cmd(command,args,false);observation.commands.push({command,status:result.status,stderr:result.stderr,stdout:result.stdout});
   writeFileSync(join(c.root,'archive-boundary.json'),JSON.stringify({binding,observations},null,2));
   assert.notEqual(result.status,0,command+' must reject an archive resolving onto internal storage');assert.match(result.stderr,/archive_not_external/);
   assert.deepEqual(sourceInventory(c.campaign),original);noExecution(c);
  }
  // Reusing an already-attached Store must not preserve a stale success either.
  assert.throws(()=>proposedBinding(store,m,cached),/archive_not_external/);
  // Retain the alias as evidence, restore only this test's original directory.
  renameSync(target,target+'-internal-alias');renameSync(retained,target);
  assert.deepEqual(c.binding(),binding);c.cmd('recover');assert.deepEqual(c.binding(),binding);
 }
 assert.deepEqual(sourceInventory(source),proof.files);noExecution(c);
 writeFileSync(join(c.root,'archive-boundary.json'),JSON.stringify({binding,observations,legalExternalRestored:true,sourceUnchanged:true,zeroExecution:true},null,2));
});
