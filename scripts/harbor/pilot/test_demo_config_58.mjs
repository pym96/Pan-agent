import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,symlinkSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {main} from './full-cli.mjs';
import {Store} from './full-store.mjs';
import {canonical,digest} from './policy.mjs';
import {DISK_POLICY} from './full-host.mjs';
import {demoRequiredRoots,DEMO_BASELINE} from './full-demo-config-58.mjs';
const BASE=process.env.WO58_TEST_ROOT;assert(BASE,'set issue-owned persistent WO58_TEST_ROOT');mkdirSync(BASE,{recursive:true});
const pkg=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));
const task='log-summary-date-ranges',image='sha256:'+'a'.repeat(64);
// No HOME/environment mutation; host seams are explicit offline dependencies only.
function fixture(){
 const dir=mkdtempSync(join(BASE,'case-')),home=join(dir,'fake-home'),owner=join(dir,'demo'),root=join(owner,'campaign'),media=join(dir,'media'),runner=join(dir,'runner');
 for(const p of [home,owner,media,runner])mkdirSync(p,{recursive:true});
 const keys=generateKeyPairSync('ed25519'),sha='f'.repeat(40),authorityPath=join(owner,'authority.json');
 writeFileSync(authorityPath,JSON.stringify({acceptedRunnerSha:sha,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const layout={version:1,runner,entry:join(dir,'consumer/dist/index.js'),python:join(dir,'python'),harborRoot:join(dir,'harbor'),taskRoot:join(dir,'tasks'),archiveRoot:join(media,'task-archives',digest(root)),ownedRoots:[...demoRequiredRoots(home),dir,media]};
 const config={version:1,campaignRoot:root,authorityPath,authorityHash:digest(readFileSync(authorityPath)),ledgerRoot:join(owner,'ledger'),outputRoot:join(root,'segments'),mediaRoot:media,layout,baselineDocker:DEMO_BASELINE,resourcePolicy:DISK_POLICY,taskIds:[task]};
 const configPath=join(dir,'demo-config.json');const save=()=>writeFileSync(configPath,JSON.stringify(config));save();
 let sample={free:100*2**30,owned:1234,docker:DEMO_BASELINE},effects=[];const samples=[];
 const deps={home,mode:'offline-control',runnerSha:()=>sha,verifyProduct:()=>pkg,internal:()=>{},configure:()=>{},
 sample:()=>{throw Error('legacy sample must not serve a demo');},sampleRecovery:(r,roots)=>{samples.push({root:r,roots});return {...sample};},
 credentialSource:()=>{effects.push('credential');return 'FAKE_OFFLINE';},
 prepare:async()=>({ready:true,image,architecture:'amd64',os:'linux'}),inspectResidual:async()=>{throw Error('demo must not import history');},
 openBroker:()=>{effects.push('broker');return {ready:Promise.resolve('synthetic instruction'),close:async()=>{},stop:async()=>({stopped:true})};},
 runAttempt:async({output,ledger,signal})=>{effects.push('attempt');mkdirSync(output,{recursive:true});ledger.reserve(task,'dispatch',signal);ledger.usage(task,{input:1,output:2});ledger.finish(task,'synthetic_completed');writeFileSync(join(output,'report.json'),JSON.stringify({synthetic:true}));return {stopConfirmed:true,globalStops:[]};},
 reconcile:async()=>({confirmed:true}),scoreEvidence:()=>({state:'unscored',rawReward:null,validScore:null,reason:'offline_fake_verifier_not_scoring',evidence:null})};
 const cmd=async(command,args=[])=>{let output='';const log=console.log;console.log=(x)=>{output+=x};try{await main([command,'--campaign',root,...args],deps);return JSON.parse(output);}finally{console.log=log;}};
 const init=()=>cmd('init',['--entry',layout.entry,'--demo-config',configPath]);
 const prepare=()=>cmd('prepare',['--task',task,'--task-root',layout.taskRoot]);
 const permit=async(mutate)=>{const b=(await cmd('status',['--task',task])).proposedBinding;const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'SYNTHETIC-ONLY',notBefore:'2020-01-01',expiresAt:null,binding:b};mutate?.(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const p=join(dir,a.runId+'.json');writeFileSync(p,JSON.stringify(a));return {a,path:p};};
 const run=p=>cmd('run',['--activation',p.path,'--entry',layout.entry,'--task-root',layout.taskRoot]);
 return {dir,home,root,owner,media,config,configPath,save,init,cmd,prepare,permit,run,deps,effects,samples,setSample:s=>{sample={...sample,...s}},keys};
}
function tree(root){const out={};function walk(p,rel=''){if(!existsSync(p))return;for(const f of readdirSync(p,{withFileTypes:true})){const q=join(p,f.name),r=rel+'/'+f.name;if(f.isDirectory())walk(q,r);else out[r]=digest(readFileSync(q));}}walk(root);return out;}
test('C-DEMO58-01/02/03 fresh config signed through real init/status/run and durable archive; two namespaces',async()=>{
 const a=fixture(),b=fixture();
 for(const c of [a,b]){await c.init();const first=await c.cmd('status');assert.equal(first.denominator,1);assert.equal(first.notStarted,1);assert.equal(new Store(c.root).allRows.length,0);assert.deepEqual(new Store(c.root).meta.resourceBaseline,{docker:DEMO_BASELINE});await c.prepare();}
 const unchangedB=tree(b.root),p=await a.permit();await a.run(p);assert.deepEqual(tree(b.root),unchangedB);
 assert.deepEqual(a.effects,['credential','broker','attempt']);assert.equal(existsSync(join(a.home,'.local/state/pan-agent/wo75')),false);
 assert(existsSync(join(a.config.ledgerRoot,p.a.runId+'.jsonl')));
 const store=new Store(a.root),receipt=join(a.config.layout.archiveRoot,store.meta.campaignId,p.a.runId,task,'commit/receipt.json');assert(existsSync(receipt));
 const r=JSON.parse(readFileSync(receipt));assert(r.files['campaign.json']);assert(r.files['segments/'+p.a.runId+'/ledger.jsonl']);
 await a.cmd('archive');await a.cmd('status');const effectCount=a.effects.length;await assert.rejects(a.run(p),/task_not_unstarted|activation_identity|run_already_consumed/);assert.equal(a.effects.length,effectCount);
 await b.run(await b.permit());assert.equal((await b.cmd('status')).unscored,1);assert.equal(a.samples.every(x=>x.roots.includes(a.media)),true);
});
for(const field of ['authorityPath','authorityHash','ledgerRoot','outputRoot','campaignRoot','mediaRoot','layout','baselineDocker','resourcePolicy','taskIds'])test('C-DEMO58-01 signed '+field+' mutation rejected before credential',async()=>{
 const c=fixture();await c.init();await c.prepare();const p=await c.permit(a=>{const d=a.binding.demo58;if(field==='layout')d.layout.archiveRoot+='/wrong';else if(field==='baselineDocker')d[field]++;else if(field==='resourcePolicy')d[field].minFreeBytes--;else if(field==='taskIds')d[field]=['other'];else d[field]+='wrong';});await assert.rejects(c.run(p),/activation_identity/);assert.deepEqual(c.effects,[]);
});
for(const field of ['authorityPath','authorityHash','ledgerRoot','outputRoot','mediaRoot','layout','baselineDocker','resourcePolicy','taskIds'])test('C-DEMO58-01 missing '+field+' never falls back',async()=>{
 const c=fixture();delete c.config[field];c.save();await assert.rejects(c.init(),/demo_config_fields/);assert(!existsSync(c.root));assert.deepEqual(c.effects,[]);
});
test('C-DEMO58-01 null option, config conflict, missing authority and invalid signature are rejected',async()=>{
 const c=fixture();writeFileSync(c.configPath,'null');await assert.rejects(c.init(),/demo_config_required/);c.save();await c.init();await c.prepare();
 const p=await c.permit();const a=JSON.parse(readFileSync(p.path));a.signature='invalid';writeFileSync(p.path,JSON.stringify(a));await assert.rejects(c.run(p),/activation_signature/);
 c.config.layout.ownedRoots.push(join(c.dir,'extra'));c.save();await assert.rejects(c.cmd('status',['--demo-config',c.configPath]),/demo_config_conflict/);
 unlinkSync(c.config.authorityPath);await assert.rejects(c.run(p));assert.deepEqual(c.effects,[]);
});
test('C-DEMO58-01 normalized dot paths agree; symlink swaps and other campaign paths fail',async()=>{
 const c=fixture();c.config.authorityPath=c.owner+'/x/../authority.json';c.save();await c.init();await c.prepare();const p=await c.permit();
 mkdirSync(c.config.ledgerRoot);const other=join(c.dir,'foreign-ledger');mkdirSync(other); // swap an initially empty namespace
 const {rmdirSync}=await import('node:fs');rmdirSync(c.config.ledgerRoot);symlinkSync(other,c.config.ledgerRoot);await assert.rejects(c.run(p),/demo_symlink/);assert.deepEqual(c.effects,[]);assert.deepEqual(tree(other),{});
 const b=fixture();b.config.ledgerRoot=c.config.ledgerRoot;b.save();await assert.rejects(b.init(),/demo_symlink|demo_namespace/);
});
for(const index of [0,1,2])test('C-DEMO58-02 mandatory historical owned root '+index+' cannot be omitted',async()=>{
 const c=fixture();c.config.layout.ownedRoots=c.config.layout.ownedRoots.filter(p=>p!==demoRequiredRoots(c.home)[index]);c.save();await assert.rejects(c.init(),/demo_required_root_missing/);assert(!existsSync(c.root));
});
test('C-DEMO58-02 original baseline fixed, policy immutable, threshold both sides and restart sample',async()=>{
 const bad=fixture();bad.config.baselineDocker++;bad.save();await assert.rejects(bad.init(),/demo_resource_policy/);
 const c=fixture();c.setSample({free:21474836480,owned:57982058495,docker:DEMO_BASELINE});await c.init();await c.prepare();await c.cmd('status');
 const before=new Store(c.root).meta.resourceBaseline;c.setSample({owned:57982058496});for(const command of ['status','prepare'])await assert.rejects(c.cmd(command,command==='prepare'?['--task',task,'--task-root',c.config.layout.taskRoot]:[]),/resource_boundary/);
 c.setSample({owned:1,free:21474836479});await assert.rejects(c.cmd('status'),/resource_boundary/);c.setSample({owned:1,free:21474836480,docker:DEMO_BASELINE-100});await c.cmd('status');assert.deepEqual(new Store(c.root).meta.resourceBaseline,before);
 c.setSample({owned:0,docker:DEMO_BASELINE+57982058496});await assert.rejects(c.cmd('status'),/resource_boundary/);assert.deepEqual(c.effects,[]);
});
test('C-DEMO58-02 shared historical sentinels and fake #97 source stay unchanged',async()=>{
 const c=fixture();const shared=join(c.home,'.local/state/pan-agent/wo75'),history=join(c.home,'.local/state/pan-agent/benchmark97-next');for(const p of [shared,history]){mkdirSync(p,{recursive:true});writeFileSync(join(p,'sentinel'),'historical-consumption');}
 const before=[tree(shared),tree(history)];await c.init();await c.prepare();await c.run(await c.permit());assert.deepEqual([tree(shared),tree(history)],before);
});
test('C-DEMO58-03 archive tamper rejects reread; stop-unknown prevents continuation',async()=>{
 const c=fixture();await c.init();await c.prepare();const p=await c.permit();await c.run(p);const store=new Store(c.root),target=join(c.config.layout.archiveRoot,store.meta.campaignId,p.a.runId,task),receipt=JSON.parse(readFileSync(join(target,'commit/receipt.json')));
 writeFileSync(join(target,'snapshots',receipt.snapshot,'campaign.json'),'corrupted');await assert.rejects(c.cmd('archive'),/archive_hash/);
 const b=fixture();b.deps.reconcile=async()=>({confirmed:false});await b.init();await b.prepare();await b.run(await b.permit());assert.equal((await b.cmd('status')).pendingSegments.length,1);await assert.rejects(b.permit(),/reconciliation_required|task_not_unstarted/);
});
test('C-DEMO58-01 authority bytes and archive alias cannot be swapped after binding',async()=>{
 const c=fixture();await c.init();await c.prepare();const p=await c.permit();writeFileSync(c.config.authorityPath,'{}');await assert.rejects(c.run(p),/demo_authority_changed/);assert.deepEqual(c.effects,[]);
 const b=fixture();await b.init();await b.prepare();const q=await b.permit();const {renameSync}=await import('node:fs');renameSync(b.config.layout.archiveRoot,b.config.layout.archiveRoot+'-original');symlinkSync(b.config.layout.archiveRoot+'-original',b.config.layout.archiveRoot);await assert.rejects(b.run(q),/demo_symlink/);assert.deepEqual(b.effects,[]);
});
test('C-DEMO58-02 runtime threshold and preexisting consumed permit reject before credential',async()=>{
 const c=fixture();await c.init();await c.prepare();const p=await c.permit();c.setSample({owned:57982058496});await assert.rejects(c.run(p),/resource_boundary/);assert.deepEqual(c.effects,[]);
 const b=fixture();await b.init();await b.prepare();const q=await b.permit();mkdirSync(b.config.ledgerRoot);writeFileSync(join(b.config.ledgerRoot,q.a.runId+'.jsonl'),'consumed fixture');await assert.rejects(b.run(q),/run_already_consumed/);assert.deepEqual(b.effects,[]);
});
test('C-DEMO58-01 arbitrary flags cannot silently convert legacy to demo or override stored config',async()=>{
 const c=fixture();await c.init();await c.prepare();await assert.rejects(c.cmd('status',['--task','dna-assembly']),/demo_task_selection/);
 c.config.baselineDocker=0;c.save();await assert.rejects(c.cmd('status',['--demo-config',c.configPath]),/demo_resource_policy/);
 assert.deepEqual(c.effects,[]);
});
test('C-DEMO58-01 frozen read-only venv symlink retains interpreter argv; write namespaces reject aliases',async()=>{
 const c=fixture(),actual=join(c.dir,'python-binary');writeFileSync(actual,'synthetic immutable interpreter');symlinkSync(actual,c.config.layout.python);c.save();await c.init();assert.equal(new Store(c.root).meta.durability.python,c.config.layout.python);await c.prepare();await c.run(await c.permit());
});
test('C-DEMO58-02 restart in independent offline CLI process retains binding and resource roots',async()=>{
 const c=fixture();await c.init();await c.prepare();const before=(await c.cmd('status',['--task',task])).proposedBinding;
 const fixturePath=join(c.dir,'restart-fixture.json');writeFileSync(fixturePath,JSON.stringify({root:c.dir,home:c.home,runner:'f'.repeat(40)}));
 const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const p=spawnSync(process.execPath,[fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url)),fixturePath,'status','--campaign',c.root,'--task',task],{env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:4*1024*1024});
 assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout).proposedBinding,before);assert.deepEqual(new Store(c.root).meta.resourceBaseline,{docker:DEMO_BASELINE});
});
test('C-DEMO58-03 identical snapshot behind a symlink still fails archive isolation',async()=>{
 const c=fixture();await c.init();await c.prepare();const p=await c.permit();await c.run(p);
 const s=new Store(c.root),target=join(c.config.layout.archiveRoot,s.meta.campaignId,p.a.runId,task),r=JSON.parse(readFileSync(join(target,'commit/receipt.json'))),snapshot=join(target,'snapshots',r.snapshot);
 const {renameSync}=await import('node:fs');renameSync(snapshot,snapshot+'-retained');symlinkSync(snapshot+'-retained',snapshot);await assert.rejects(c.cmd('status'),/demo_archive_symlink/);
});
