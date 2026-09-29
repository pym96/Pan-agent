import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,cpSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectRecovery,restoreEvidence,attachRecovery} from './full-recovery.mjs';
import {inspectPredecessor,sourceInventory} from './full-upgrade-102.mjs';
import {Store,aggregate} from './full-store.mjs';
import {requirements,EXECUTION_POLICY,resourceCheck} from './full-host.mjs';
import {validateLayout} from './full-durable.mjs';
import {canonical,digest} from './policy.mjs';
const BASE=process.env.WO102_ROOT,SOURCE=process.env.WO102_SOURCE;assert(BASE&&SOURCE);mkdirSync(BASE,{recursive:true});
const m=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url))),driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
const proof=inspectPredecessor(SOURCE,m),reserved=proof.imported.map(x=>x.task),available=m.tasks.map(t=>t.id).filter(x=>!reserved.includes(x));
function setup(){
 const root=mkdtempSync(join(BASE,'case-')),home=join(root,'home'),campaign=join(root,'campaign'),archive=join(process.env.WO102_EXTERNAL,root.split('/').at(-1)),fixture=join(root,'fixture.json');mkdirSync(home);mkdirSync(archive);
 const config={root,home,runner:'f'.repeat(40),mode:'offline-control',legacyPackage:true};const layout={version:1,runner:root,entry:join(root,'entry'),python:join(root,'python'),harborRoot:join(root,'harbor'),taskRoot:join(root,'tasks'),archiveRoot:archive,ownedRoots:[root]};
 const lp=join(root,'layout.json');writeFileSync(lp,JSON.stringify(layout));const keys=generateKeyPairSync('ed25519'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});writeFileSync(join(state,'authority.json'),JSON.stringify({acceptedRunnerSha:config.runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const cmd=(command,args=[],ok=true)=>{writeFileSync(fixture,JSON.stringify(config));const p=spawnSync(process.execPath,[driver,fixture,command,'--campaign',campaign,...args],{env:{PATH:process.env.PATH,HOME:home,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:16*1024*1024});const n=readdirSync(root).filter(f=>f.endsWith('.stdout')).length;writeFileSync(join(root,`${n}-${command}.stdout`),p.stdout);writeFileSync(join(root,`${n}-${command}.stderr`),p.stderr);if(ok)assert.equal(p.status,0,p.stderr);return p;};
 cmd('upgrade97',['--source',SOURCE,'--layout',lp]);
 const status=()=>JSON.parse(cmd('status').stdout),prepare=ids=>cmd('prepare',['--task',ids.join(','),'--task-root',layout.taskRoot]);
 const permit=(ids,change)=>{const b=JSON.parse(cmd('status',['--task',ids.join(',')]).stdout).proposedBinding;const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline100',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:b};change?.(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const path=join(root,a.runId+'.json');writeFileSync(path,JSON.stringify(a));return path;};
 const run=(path,ok=true)=>cmd('run',['--activation',path,'--entry',layout.entry,'--task-root',layout.taskRoot],ok);
 const effects=()=>existsSync(join(root,'effects.jsonl'))?readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
 return {root,home,campaign,archive,config,layout,lp,cmd,status,prepare,permit,run,effects};
}


test('C-ARC-03 pinned real failure -> supplement archive/reconcile -> new binding -> synthetic unstarted only',async()=>{
 const before=sourceInventory(SOURCE),c=setup(),initial=c.status();assert.equal(initial.notStarted,31);assert.equal(initial.rows.filter(r=>r.runId).length,58);assert.equal(initial.successes,17);assert.equal(initial.validScored,22);
 assert.equal(initial.rows.filter(r=>r.runId==='16f4f98e-348f-41a3-b18f-ee9dad4dbc18'&&r.validScore===null).length,20);
 const id='polyglot-c-py';assert.match(c.cmd('prepare',['--task',id,'--task-root',c.layout.taskRoot],false).stderr,/predecessor_reconciliation_required/);
 assert.match(c.cmd('status',['--task',id],false).stderr,/predecessor_reconciliation_required/);
 c.config.oldStopUnknown=true;assert.match(c.cmd('recover',[],false).stderr,/historical_stop_unknown/);c.config.oldStopUnknown=false;
 c.cmd('recover');assert.equal(c.effects().filter(x=>['credential','start','model'].includes(x.kind)).length,0);assert.deepEqual(c.status().rows,initial.rows);
 c.prepare([id]);
 for(const r of reserved)assert.match(c.cmd('prepare',['--task',r,'--task-root',c.layout.taskRoot],false).stderr,/task_not_unstarted/);
 const prior=join(SOURCE,'segments/df271106-59db-4b02-8439-3799e3399e4b/activation.json');assert.match(c.run(prior,false).stderr,/activation_signature|activation_identity|task_not_unstarted/);
 const oldIdentity=c.permit([id],a=>{a.binding.runnerSha='fce8cc2ad6cf6ab7755a7c7b4874cfe6cf777d71';});assert.match(c.run(oldIdentity,false).stderr,/activation_identity/);
 const reuse=c.permit([id],a=>{a.runId='df271106-59db-4b02-8439-3799e3399e4b';});assert.match(c.run(reuse,false).stderr,/run_already_consumed/);
 assert.equal(c.effects().filter(x=>x.kind==='credential').length,0);
 c.run(c.permit([id]));assert.deepEqual(c.effects().filter(x=>x.kind==='start').map(x=>x.task),[id]);assert.equal(c.status().notStarted,30);
 assert.deepEqual(c.status().rows.filter(r=>reserved.includes(r.task)),initial.rows.filter(r=>reserved.includes(r.task)));
 assert.deepEqual(sourceInventory(SOURCE),before);
});
