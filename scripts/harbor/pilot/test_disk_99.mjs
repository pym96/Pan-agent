import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,existsSync,readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {executedSuccessor,inspectExecuted,attachHistory,EXECUTED_SOURCE} from './full-history.mjs';
import {inventory} from './full-migrate.mjs';
import {Store,aggregate} from './full-store.mjs';
import {resourceCheck} from './full-host.mjs';
import {canonical,digest} from './policy.mjs';
const base=process.env.WO99_TEST_ROOT;assert(base);mkdirSync(base,{recursive:true});
const manifest=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url)));
const host={mode:'live',runnerSha:()=> 'f'.repeat(40),internal:()=>{},sample:()=>({free:30*2**30,owned:10000000,docker:48503971840+25*2**30})};
function fixture(){const root=mkdtempSync(join(base,'case-')),source=join(root,'campaign-disk20'),target=join(root,'campaign-disk39');cpSync(process.env.WO99_SOURCE??EXECUTED_SOURCE,source,{recursive:true});return {root,source,target};}
function ready(c){const store=new Store(c.target);attachHistory(store);return store;}
test('C-GROW99-01 exact free/increment thresholds, old24 admitted, original baseline formula',()=>{
 for(const free of [20*2**30-1,20*2**30,20*2**30+1])for(const increment of [24*2**30-1,24*2**30,24*2**30+1,54*2**30-1,54*2**30,54*2**30+1]){
  const call=()=>resourceCheck('',{docker:100},{free,owned:7,docker:100+increment-7});if(free>=20*2**30&&increment<54*2**30)call();else assert.throws(call,/resource_boundary/);
 }
 assert.throws(()=>resourceCheck('',{docker:100},{free:30*2**30,owned:54*2**30,docker:0}),/resource_boundary/);
});
test('C-GROW99-02 original37 outcomes+usage retained; actual CLI status, signed fake run only52 eligible',async()=>{
 const c=fixture(),before=inventory(c.source),original=aggregate(inspectExecuted(c.source),manifest);await executedSuccessor(c.source,c.target,host);assert.throws(()=>inspectExecuted(c.source).add('preparation',{}),/archive_read_only/);const imported=aggregate(ready(c),manifest);assert.deepEqual(imported.rows,original.rows);assert.deepEqual(imported.knownObservedTotals,original.knownObservedTotals);assert.equal(imported.notStarted,52);assert.deepEqual(inventory(c.source),before);
 const home=join(c.root,'home'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});const keys=generateKeyPairSync('ed25519');writeFileSync(join(state,'authority.json'),JSON.stringify({acceptedRunnerSha:'f'.repeat(40),publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const fp=join(c.root,'fixture.json');writeFileSync(fp,JSON.stringify({root:c.root,home,runner:'f'.repeat(40),mode:'live',free:30*2**30,docker:48503971840+25*2**30}));const driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
 const cmd=(command,args=[],ok=true)=>{const p=spawnSync(process.execPath,[driver,fp,command,'--campaign',c.target,...args],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:home,TMPDIR:c.root,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:16*1024*1024});if(ok)assert.equal(p.status,0,p.stderr);return p;};
 const sourceSnapshot=inventory(join(c.target,'history-original'));const ids=original.rows.filter(r=>r.state==='not_started').map(r=>r.task);assert.equal(ids.length,52);
 for(const row of original.rows.filter(r=>r.runId)){assert.notEqual(cmd('prepare',['--task',row.task,'--task-root',c.root],false).status,0);assert.notEqual(cmd('status',['--task',row.task],false).status,0);}
 cmd('prepare',['--task',ids.join(','),'--task-root',c.root]);const binding=JSON.parse(cmd('status',['--task',ids.join(',')]).stdout).proposedBinding;assert.equal(binding.full.resourcePolicy.incrementExclusiveBytes,54*2**30);assert.equal(binding.full.segmentIndex,2);
 const payload={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'synthetic99',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding};const path=join(c.root,'permit.json');const save=()=>writeFileSync(path,JSON.stringify({...payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')}));
 const run=(ok)=>cmd('run',['--activation',path,'--entry',join(c.root,'entry'),'--task-root',c.root],ok);
 const newId=payload.runId;payload.runId='eecf5765-a6fe-47ab-9286-aa825fa0aba7';save();assert.match(run(false).stderr,/run_already_consumed/);payload.runId=newId;
 const newSha=binding.runnerSha;binding.runnerSha='dc42190f547f352250be986ed76587667c5e59db';save();assert.notEqual(run(false).status,0);binding.runnerSha=newSha;
 binding.full.resourcePolicy.incrementExclusiveBytes=24*2**30;save();assert.notEqual(run(false).status,0);binding.full.resourcePolicy.incrementExclusiveBytes=54*2**30;save();run(true);
 const final=JSON.parse(cmd('status').stdout);assert.equal(final.notStarted,0);assert.equal(final.successes,68);assert.deepEqual(final.rows.filter(r=>r.runId==='eecf5765-a6fe-47ab-9286-aa825fa0aba7'),original.rows.filter(r=>r.runId));assert.deepEqual(inventory(join(c.target,'history-original')),sourceSnapshot);assert.deepEqual(inventory(c.source),before);
 const effects=readFileSync(join(c.root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse);const starts=effects.filter(r=>r.kind==='start');assert.equal(starts.length,52);assert.deepEqual(starts.map(r=>r.task),ids);
 await assert.rejects(executedSuccessor(c.source,c.target,host),/EEXIST/);
});
for(const kind of ['baseline','result','identity','active','stop_unknown','ledger'])test('C-GROW99-02 rejects changed source '+kind,async()=>{
 const c=fixture();let p=join(c.source,'campaign.json'),v=JSON.parse(readFileSync(p));if(kind==='baseline')v.resourceBaseline.docker=0;else if(kind==='identity')v.identity.runnerSha='0'.repeat(40);else {
  const files=readdirSync(join(c.source,'journal')).sort();const picked=files.find(f=>{const r=JSON.parse(readFileSync(join(c.source,'journal',f)));return kind==='active'?r.event==='segment_closed':r.event==='result';});p=join(c.source,'journal',picked);v=JSON.parse(readFileSync(p));if(kind==='active')v.event='segment_open';else if(kind==='stop_unknown')v.stopConfirmed=false;else v.validScore=123;
 }
 if(kind==='ledger'){p=join(c.source,'segments/eecf5765-a6fe-47ab-9286-aa825fa0aba7/ledger.jsonl');writeFileSync(p,'changed');}else writeFileSync(p,JSON.stringify(v));
 await assert.rejects(executedSuccessor(c.source,c.target,host),/history_inventory/);assert(!existsSync(c.target));
});
test('C-GROW99-02 concurrent claims and incomplete destination stay fail-closed',async()=>{
 const c=fixture();const both=await Promise.allSettled([executedSuccessor(c.source,c.target,host),executedSuccessor(c.source,c.target,host)]);assert.equal(both.filter(r=>r.status==='fulfilled').length,1);ready(c);unlinkSync(join(c.target,'history-complete.json'));assert.throws(()=>ready(c));await assert.rejects(executedSuccessor(c.source,c.target,host),/EEXIST/);
});
test('C-GROW99-02 successor baseline and archived bytes tamper are rejected',async()=>{
 const c=fixture();await executedSuccessor(c.source,c.target,host);const p=join(c.target,'campaign.json'),v=JSON.parse(readFileSync(p));v.resourceBaseline.docker=0;writeFileSync(p,JSON.stringify(v));assert.throws(()=>ready(c),/history_baseline/);
 const d=fixture();await executedSuccessor(d.source,d.target,host);writeFileSync(join(d.target,'history-original/resources.jsonl'),'changed');assert.throws(()=>ready(d),/history_inventory/);
});
