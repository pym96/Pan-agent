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
const BASE=process.env.WO103_TEST_ROOT??process.env.WO96_TEST_ROOT;assert(BASE,'set WO103_TEST_ROOT to issue-owned directory');mkdirSync(BASE,{recursive:true});
const driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url)));const ids=manifest.tasks.map(t=>t.id);
function setup(initial={}){
 const root=mkdtempSync(join(BASE,'case-')),home=join(root,'home'),campaign=join(root,'campaign'),fixture=join(root,'fixture.json');mkdirSync(home);const runner='f'.repeat(40);const keys=generateKeyPairSync('ed25519');
 const dir=join(home,'.local/state/pan-agent/wo75');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'authority.json'),JSON.stringify({acceptedRunnerSha:runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
 const config={root,home,runner,...initial};const save=()=>writeFileSync(fixture,JSON.stringify(config));save();
 const env={PATH:process.env.PATH,HOME:home,TMPDIR:root,NPM_CONFIG_CACHE:join(root,'cache'),PYTHONDONTWRITEBYTECODE:'1',...(process.env.PYTHONPATH?{PYTHONPATH:process.env.PYTHONPATH}:{})};
 const argv=(command,options=[])=>[driver,fixture,command,'--campaign',campaign,...options];
 const cmd=(command,options=[],ok=true)=>{save();const p=spawnSync(process.execPath,argv(command,options),{env,encoding:'utf8',maxBuffer:16*1024*1024});if(ok)assert.equal(p.status,0,p.stderr);return p;};
 const status=()=>JSON.parse(cmd('status').stdout);
 const prepare=(tasks)=>cmd('prepare',['--task',tasks.join(','),'--task-root',join(root,'source')]);
 const permit=(tasks,mutate)=>{const b=JSON.parse(cmd('status',['--task',tasks.join(',')]).stdout).proposedBinding;const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline-control',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:b};mutate?.(a);a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const p=join(root,a.runId+'.json');writeFileSync(p,JSON.stringify(a));return {a,path:p};};
 const run=(p,ok=true)=>cmd('run',['--activation',p.path,'--entry',config.entry??join(root,'entry'),'--task-root',join(root,'source')],ok);
 const effects=()=>existsSync(join(root,'effects.jsonl'))?readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];
 cmd('init',['--entry',join(root,'entry')]);return {root,home,campaign,config,save,env,argv,cmd,status,prepare,permit,run,effects};
}

for(const scenario of ['confirmed','never_settles','stop_unknown','archive_failure','resource_failure'])test('real core+full controller two-task '+scenario,()=>{
 assert(process.env.PAN_TEST_ENTRY);const c=setup();c.config.entry=process.env.PAN_TEST_ENTRY;c.config.handoff103=true;c.config.scenarios={[ids[0]]:scenario};
 if(scenario==='resource_failure')c.config.dropFreeAt='after_result';
 c.prepare(ids.slice(0,2));const permit=c.permit(ids.slice(0,2));const run=c.run(permit,false);if(scenario==='archive_failure')assert.notEqual(run.status,0);else assert.equal(run.status,0,run.stderr);
 const starts=c.effects().filter(x=>x.kind==='start').map(x=>x.task);assert.deepEqual(starts,scenario==='confirmed'?[ids[0],ids[1]]:[ids[0]]);
 const s=c.status();assert.equal(s.rows[0].state,'unscored');assert.equal(s.rows[0].validScore,null);
 const report=JSON.parse(readFileSync(join(c.campaign,'segments',permit.a.runId,ids[0],'pan/report.json')));assert.equal(report.faults[0].code,'agent_settlement_timeout');assert(report.globalStops.some(x=>x.reason==='attempt_error'));assert.equal(report.continuation.allowed,!['never_settles','stop_unknown'].includes(scenario));
 const before=starts.length;assert.notEqual(c.run(permit,false).status,0);assert.equal(c.effects().filter(x=>x.kind==='start').length,before);
});
test('real core+controller normal two tasks execute exactly once',()=>{
 const c=setup({entry:process.env.PAN_TEST_ENTRY,realSession:true});c.prepare(ids.slice(0,2));c.run(c.permit(ids.slice(0,2)));assert.deepEqual(c.effects().filter(x=>x.kind==='start').map(x=>x.task),ids.slice(0,2));assert.equal(c.status().validScored,2);
});
