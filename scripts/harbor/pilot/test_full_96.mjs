import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,cpSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {canonical,digest} from './policy.mjs';
import {requirements,resourceCheck} from './full-host.mjs';
const BASE=process.env.WO96_TEST_ROOT;assert(BASE,'set WO96_TEST_ROOT to issue-owned directory');mkdirSync(BASE,{recursive:true});
const driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url)));const ids=manifest.tasks.map(t=>t.id);
function setup(){
 const root=mkdtempSync(join(BASE,'case-')),home=join(root,'home'),campaign=join(root,'campaign'),fixture=join(root,'fixture.json');mkdirSync(home);const runner='f'.repeat(40);const keys=generateKeyPairSync('ed25519');
 const dir=join(home,'.local/state/pan-agent/wo75');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'authority.json'),JSON.stringify({acceptedRunnerSha:runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const config={root,home,runner};const save=()=>writeFileSync(fixture,JSON.stringify(config));save();
 const env={PATH:process.env.PATH,HOME:home,TMPDIR:root,NPM_CONFIG_CACHE:join(root,'cache'),PYTHONDONTWRITEBYTECODE:'1'};
 const argv=(command,options=[])=>[driver,fixture,command,'--campaign',campaign,...options];
 const cmd=(command,options=[],ok=true)=>{save();const p=spawnSync(process.execPath,argv(command,options),{env,encoding:'utf8',maxBuffer:16*1024*1024});if(ok)assert.equal(p.status,0,p.stderr);return p;};
 const status=()=>JSON.parse(cmd('status').stdout);
 const prepare=(tasks)=>cmd('prepare',['--task',tasks.join(','),'--task-root',join(root,'source')]);
 const permit=(tasks,mutate)=>{const b=JSON.parse(cmd('status',['--task',tasks.join(',')]).stdout).proposedBinding;const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline-control',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:b};mutate?.(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const p=join(root,a.runId+'.json');writeFileSync(p,JSON.stringify(a));return {a,path:p};};
 const run=(p,ok=true)=>cmd('run',['--activation',p.path,'--entry',config.entry??join(root,'entry'),'--task-root',join(root,'source')],ok);
 const effects=()=>existsSync(join(root,'effects.jsonl'))?readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
 cmd('init',['--entry',join(root,'entry')]);return {root,home,campaign,config,save,env,argv,cmd,status,prepare,permit,run,effects};
}
test('C01 exact frozen89 registry population/config provenance; old five intact',()=>{
 const old=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url)));assert.equal(ids.length,89);assert.equal(new Set(ids).size,89);assert.deepEqual(ids,old.registry_entry.tasks.map(t=>t.name));
 for(const t of manifest.tasks){assert.equal(t.git_commit_id,'69671fbaac6d67a7ef0dfec016cc38a64ef7a77c');assert(t.config_source.includes(t.git_commit_id));assert(t.files.some(f=>f.path==='task.toml'));}
 for(const t of old.tasks)assert.deepEqual(manifest.tasks.find(x=>x.id===t.id).config,t.config);
 assert(!requirements({config:{environment:{cpus:8,memory:'16G'}}}));assert.throws(()=>resourceCheck('unused',{docker:0},{free:100*2**30,owned:0,docker:25*2**30}),/resource_boundary/);
});
test('C03 actual CLI89 total: normal failures continue, raw0 unscored, retry usage preserved',()=>{
 const c=setup();c.config.scenarios={[ids[0]]:'valid_failure',[ids[1]]:'prep_zero',[ids[2]]:'environment',[ids[3]]:'model',[ids[4]]:'retry'};
 c.prepare(ids);const p=c.permit(ids);c.run(p);const s=c.status();assert.equal(s.rows.length,89);assert.equal(s.successes,85);assert.equal(s.validScored,86);assert.equal(s.unscored,3);assert.equal(s.notStarted,0);assert.equal(s.knownObservedTotals.counts.sendEntries,89);assert.equal(s.knownObservedTotals.usage.unknown,1);
 assert.equal(s.rows[1].rawReward,0);assert.equal(s.rows[1].validScore,null);assert.equal(s.rows[4].accounting.usage.unknown,1);assert.equal(s.rows[4].accounting.counts.retries,1);assert.equal(s.rows[4].accounting.counts.modelRounds,1);assert.equal(s.rows[4].accounting.counts.sendEntries,2);
 assert.equal(new Set(c.effects().filter(e=>e.kind==='start').map(e=>e.task)).size,89);assert.notEqual(c.run(p,false).status,0);
});
for(const stage of ['before_reservation','after_reservation','before_result','after_result'])test('C02 process death '+stage+' then new-segment unstarted-only resume',()=>{
 const c=setup();c.prepare(ids.slice(0,3));const first=c.permit(ids.slice(0,2));c.config.crash=stage;assert.equal(c.run(first,false).status,73);
 const before=c.status();const reserved=stage!=='before_reservation';assert.equal(before.rows[0].state,stage==='after_result'?'success':reserved?'unknown_interrupted':'not_started');assert.equal(before.pendingSegments.length,1);
 const ledger=join(c.home,'.local/state/pan-agent/wo75/ledger',first.a.runId+'.jsonl'),hash=digest(readFileSync(ledger));
 delete c.config.crash;assert.match(c.run(first,false).stderr,/reconciliation_required/);c.cmd('recover');
 const next=reserved?ids.slice(1,3):ids.slice(0,3);c.prepare(next);c.run(c.permit(next));assert.equal(digest(readFileSync(ledger)),hash);const starts=c.effects().filter(e=>e.kind==='start').map(e=>e.task);assert.equal(new Set(starts).size,starts.length);assert.equal(c.status().rows.length,89);
});
test('C02 unknown residual prevents effects until exact owned reconciliation confirmed',()=>{
 const c=setup();c.prepare(ids.slice(0,2));c.config.crash='after_reservation';c.run(c.permit(ids.slice(0,2)),false);delete c.config.crash;
 const records=readdirSync(join(c.campaign,'journal')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(join(c.campaign,'journal',n))));const project=records.find(r=>r.event==='reserved').project;c.config.unknownStop=[project];assert.match(c.cmd('recover',[],false).stderr,/residual_stop_unknown/);assert.equal(c.effects().filter(e=>e.kind==='start').length,0);
 c.config.unknownStop=[];c.cmd('recover');c.prepare([ids[1]]);c.run(c.permit([ids[1]]));assert.equal(c.status().rows[0].state,'unknown_interrupted');assert.deepEqual(c.effects().filter(e=>e.kind==='start').map(e=>e.task),[ids[1]]);
});
test('C02 OS lock rejects concurrent double start; persistent cancel stops after current reservation',async()=>{
 const c=setup();c.prepare(ids.slice(0,3));const p=c.permit(ids.slice(0,3));c.config.hold='after_reservation';c.config.holdMs=1500;c.save();
 const child=spawn(process.execPath,c.argv('run',['--activation',p.path,'--entry',join(c.root,'entry'),'--task-root',c.root]),{env:c.env,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);child.stdout.resume();const done=new Promise(r=>child.on('exit',r));
 for(let i=0;i<100&&!c.effects().some(e=>e.kind==='hold');i++)await delay(20);
 assert(c.effects().some(e=>e.kind==='hold'));assert.match(c.run(p,false).stderr,/campaign_locked/);c.cmd('cancel');assert.equal(await done,0,stderr);assert.equal(c.effects().filter(e=>e.kind==='start').length,0);const s=c.status();assert.equal(s.rows[0].state,'unscored');assert.equal(s.rows[1].state,'not_started');
});
test('C02 signed identity/checkpoint/image/list mutation and consumed fresh permit reject before credential',()=>{
 const c=setup();c.prepare([ids[0]]);const p=c.permit([ids[0]]);const n=c.effects().length;p.a.binding.images[ids[0]]=['sha256:'+'a'.repeat(64)];writeFileSync(p.path,JSON.stringify(p.a));assert.notEqual(c.run(p,false).status,0);assert.equal(c.effects().length,n);
 const valid=c.permit([ids[0]]);const bad=JSON.parse(readFileSync(valid.path));bad.binding.full.checkpoint='0'.repeat(64);writeFileSync(valid.path,JSON.stringify(bad));assert.match(c.run(valid,false).stderr,/activation_signature/);
 const consumed=c.permit([ids[0]]);mkdirSync(join(c.home,'.local/state/pan-agent/wo75/ledger'),{recursive:true});writeFileSync(join(c.home,'.local/state/pan-agent/wo75/ledger',consumed.a.runId+'.jsonl'),'consumed');assert.match(c.run(consumed,false).stderr,/run_already_consumed/);assert.equal(c.effects().filter(e=>e.kind==='credential').length,0);
 const meta=join(c.campaign,'campaign.json'),value=JSON.parse(readFileSync(meta));value.identity.panHash='0'.repeat(64);writeFileSync(meta,JSON.stringify(value));assert.notEqual(c.cmd('status',[],false).status,0);
});
test('C03 global model block pauses; new segment only remaining, cumulative resource baseline cannot reset',()=>{
 const c=setup();c.config.scenarios={[ids[0]]:'global'};c.prepare(ids.slice(0,3));c.run(c.permit(ids.slice(0,3)));assert.deepEqual(c.effects().filter(e=>e.kind==='start').map(e=>e.task),[ids[0]]);assert.equal(c.status().notStarted,88);
 c.config.docker=25*2**30;assert.match(c.cmd('prepare',['--task',ids[1],'--task-root',c.root],false).stderr,/resource_boundary/);assert.equal(c.status().notStarted,88);
});
test('C03 preparation failure before reservation stays visible/unstarted, global preparation blocks next',()=>{
 const c=setup();c.config.scenarios={[ids[0]]:'not_cached',[ids[1]]:'global_prepare'};c.prepare(ids.slice(0,3));const s=c.status();assert.equal(s.notStarted,89);assert.equal(s.rows[0].preparations[0].reason,'image_not_cached');assert.equal(s.rows[1].preparations[0].global,true);assert.equal(s.rows[2].preparations.length,0);
});

test('C02 broker ticket: live owner blocks cleanup fence; death releases; late startup sees fenced',async()=>{
 const c=setup(),ticket=join(c.root,'ticket.json');writeFileSync(ticket,JSON.stringify({state:'pending'}));
 const code="import fcntl,sys,time,json\nf=open(sys.argv[1],'r+')\nfcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nassert json.load(f)['state']=='pending'\nprint('owned',flush=True)\ntime.sleep(30)";
 const child=spawn('python3',['-c',code,ticket],{env:c.env,stdio:['ignore','pipe','pipe']});await new Promise(r=>child.stdout.once('data',r));
 const {lock}=await import('./full-store.mjs');await assert.rejects(lock(c.root,ticket),/campaign_locked/);const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;
 const release=await lock(c.root,ticket);assert.equal(JSON.parse(readFileSync(ticket)).state,'fenced');await release();
 const late=spawnSync('python3',['-c',code,ticket],{env:c.env,encoding:'utf8'});assert.notEqual(late.status,0);assert.match(late.stderr,/AssertionError/);
 const pkg=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));const actual=spawnSync(pkg.python,[fileURLToPath(new URL('./broker.py',import.meta.url))],{env:c.env,input:JSON.stringify({lifecycle_path:ticket,task:{}})+'\n',encoding:'utf8'});assert.notEqual(actual.status,0);assert.match(actual.stderr,/broker_start_fenced/);
});
test('C01 full manifest tamper rejected by actual CLI before any fake effect',()=>{
 const c=setup(),copy=join(c.root,'copied-pilot');cpSync(fileURLToPath(new URL('.',import.meta.url)),copy,{recursive:true});const p=join(copy,'full-manifest.json'),value=JSON.parse(readFileSync(p));value.tasks.pop();writeFileSync(p,JSON.stringify(value));
 const before=c.effects().length;const result=spawnSync(process.execPath,[join(copy,'test_full_driver.mjs'),join(c.root,'fixture.json'),'status','--campaign',c.campaign],{env:c.env,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/full_manifest_identity/);assert.equal(c.effects().length,before);
});

test('C04 full CLI uses actual packed Session/Adapter with pre-reserved Ledger and synthetic transport/tools',()=>{
 assert(process.env.PAN_TEST_ENTRY);const c=setup();c.config.realSession=true;c.config.entry=process.env.PAN_TEST_ENTRY;c.prepare([ids[0]]);c.run(c.permit([ids[0]]));const row=c.status().rows[0];assert.equal(row.validScore,1);assert.equal(row.accounting.counts.modelRounds,2);assert.equal(row.accounting.counts.sendEntries,2);assert.equal(row.accounting.counts.tools,1);
});

test('C02 signed reuse of an earlier run is refused even if its synthetic ledger disappears',()=>{
 const c=setup();c.prepare(ids.slice(0,2));const first=c.permit([ids[0]]);c.run(first);unlinkSync(join(c.home,'.local/state/pan-agent/wo75/ledger',first.a.runId+'.jsonl'));const second=c.permit([ids[1]],a=>{a.runId=first.a.runId;});const before=c.effects().length;assert.match(c.run(second,false).stderr,/run_already_consumed/);assert.equal(c.effects().length,before);
});

test('C02 recovery refuses a re-chained foreign project before any cleanup capability',()=>{
 const c=setup();c.prepare([ids[0]]);c.config.crash='after_reservation';c.run(c.permit([ids[0]]),false);delete c.config.crash;const dir=join(c.campaign,'journal'),files=readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort();let head=digest(canonical(JSON.parse(readFileSync(join(c.campaign,'campaign.json')))));
 for(const f of files){const p=join(dir,f),v=JSON.parse(readFileSync(p));v.previous=head;if(v.event==='reserved')v.project='wo78-'+'0'.repeat(16);writeFileSync(p,JSON.stringify(v));head=digest(canonical(v));}
 const count=c.effects().length;assert.match(c.cmd('recover',[],false).stderr,/foreign_project/);assert.equal(c.effects().length,count);
});
