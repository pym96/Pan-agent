import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {sign} from 'node:crypto';
import {fixture} from './test_demo_config_58.mjs';
import {demo115RequiredRoots} from './full-demo-config-58.mjs';
import {resourceCheck,DISK_POLICY,DEMO115_DISK_POLICY} from './full-host.mjs';
import {Store} from './full-store.mjs';
import {canonical,digest} from './policy.mjs';
const G=2**30,B=48503971840;
function fresh(){const c=fixture();c.config.version=2;c.config.resourcePolicy=DEMO115_DISK_POLICY;c.config.layout.ownedRoots.push(...demo115RequiredRoots(c.home));c.save();return c;}
test('C-VID115-01 finite profile init/binding/signature/run/archive/reopen uses56, old remains54',async()=>{
 const c=fresh();c.setSample({owned:55*G});await c.init();await c.prepare();const p=await c.permit();
 assert.deepEqual(p.a.binding.executionPolicy.disk,DEMO115_DISK_POLICY);assert.deepEqual(p.a.binding.full.resourcePolicy,DEMO115_DISK_POLICY);assert.deepEqual(p.a.binding.demo58.resourcePolicy,DEMO115_DISK_POLICY);
 const hash=digest(readFileSync(join(c.root,'campaign.json')));await c.run(p);await c.cmd('archive');await c.cmd('recover');await c.cmd('status');assert.equal(digest(readFileSync(join(c.root,'campaign.json'))),hash);assert.equal(new Store(c.root).meta.resourceBaseline.docker,B);
 const old=fixture();old.setSample({owned:54*G});await assert.rejects(old.init(),/resource_boundary/);assert(!existsSync(old.root));
});
for(const field of ['demo58','executionPolicy','full'])test('C-VID115-01 old54 signed policy in '+field+' rejects before effects',async()=>{
 const c=fresh();await c.init();await c.prepare();const p=await c.permit(a=>{if(field==='executionPolicy')a.binding[field].disk=DISK_POLICY;else a.binding[field].resourcePolicy=DISK_POLICY;});await assert.rejects(c.run(p),/activation_identity/);assert.deepEqual(c.effects,[]);
});
test('C-VID115-01 unbounded/inconsistent/missing profile and changed persistent identity rejected',async()=>{
 for(const version of [0,3,null]){const c=fresh();c.config.version=version;c.save();await assert.rejects(c.init(),/demo_resource_policy/);assert(!existsSync(c.root));}
 for(const version of [1,2]){const c=fresh();c.config.version=version;c.config.resourcePolicy={...DEMO115_DISK_POLICY,incrementExclusiveBytes:57*G};c.save();await assert.rejects(c.init(),/demo_resource_policy/);}
 const c=fresh();await c.init();await c.prepare();const p=await c.permit();p.a.binding.demo58.version=1;p.a.signature=sign(null,Buffer.from(canonical(Object.fromEntries(Object.entries(p.a).filter(([k])=>k!=='signature')))),c.keys.privateKey).toString('base64');writeFileSync(p.path,JSON.stringify(p.a));await assert.rejects(c.run(p),/activation_identity/);assert.deepEqual(c.effects,[]);
 const file=join(c.root,'campaign.json'),meta=JSON.parse(readFileSync(file));meta.demo58.resourcePolicy.incrementExclusiveBytes++;writeFileSync(file,JSON.stringify(meta));await assert.rejects(c.cmd('status'));assert.deepEqual(c.effects,[]);
});
test('C-VID115-02 exact old/new bounds, floor, unknown, Docker drop and arbitrary policy rejected',()=>{
 for(const policy of [DISK_POLICY,DEMO115_DISK_POLICY])for(const delta of [-1,0,1])for(const floor of [-1,0,1]){
  const f=()=>resourceCheck('',{docker:B},{owned:policy.incrementExclusiveBytes+delta,free:20*G+floor,docker:B},policy);
  if(delta<0&&floor>=0)f();else assert.throws(f,/resource_boundary/);
 }
 for(const field of ['free','owned','docker'])for(const v of [undefined,null,NaN,Infinity,-1])assert.throws(()=>resourceCheck('',{docker:B},{free:20*G,owned:0,docker:B,[field]:v},DEMO115_DISK_POLICY),/resource_sample_unknown/);
 assert.throws(()=>resourceCheck('',{docker:NaN},{free:20*G,owned:0,docker:B},DEMO115_DISK_POLICY),/resource_sample_unknown/);
 assert.throws(()=>resourceCheck('',{docker:B},{free:20*G,owned:56*G,docker:0},DEMO115_DISK_POLICY),/resource_boundary/);
 resourceCheck('',{docker:B},{free:20*G,owned:56*G-1,docker:0},DEMO115_DISK_POLICY);
 assert.throws(()=>resourceCheck('',{docker:B},{free:20*G,owned:1,docker:B+56*G-1},DEMO115_DISK_POLICY),/resource_boundary/);
 assert.throws(()=>resourceCheck('',{docker:B},{free:20*G,owned:0,docker:B},{...DEMO115_DISK_POLICY}),/resource_policy_unknown/);
});
test('C-VID115-02 all inherited roots mandatory, no omission in56 profile',async()=>{
 for(const required of demo115RequiredRoots('/fake')){
  const c=fresh(),actual=required.replace('/fake',c.home);c.config.layout.ownedRoots=c.config.layout.ownedRoots.filter(p=>p!==actual);c.save();await assert.rejects(c.init(),/demo_required_root_missing/);assert(!existsSync(c.root));
 }
});
test('C-VID115-02 reopened commands reject unknown/boundary before execution',async()=>{
 const c=fresh();await c.init();await c.prepare();const p=await c.permit();
 for(const sample of [{owned:56*G},{owned:1,free:20*G-1},{owned:1,free:20*G,docker:null}]){
  c.setSample(sample);for(const command of ['status','archive','recover'])await assert.rejects(c.cmd(command),/resource_boundary|resource_sample_unknown/);
  await assert.rejects(c.run(p),/resource_boundary|resource_sample_unknown/);
 }assert.deepEqual(c.effects,[]);
});
test('C-VID115-02 timer overflow aborts current attempt, retains consumed ledger and archive',async()=>{
 const c=fresh();await c.init();await c.prepare();const p=await c.permit();
 c.deps.runAttempt=async({output,ledger,signal})=>{
  c.effects.push('attempt');const {mkdirSync}=await import('node:fs');mkdirSync(output,{recursive:true});ledger.reserve('log-summary-date-ranges','dispatch',signal);c.setSample({owned:56*G});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timer did not stop')),3500);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  writeFileSync(join(output,'report.json'),JSON.stringify({synthetic:true,cancelled:true}));return {stopConfirmed:true,globalStops:[]};
 };
 await c.run(p);const store=new Store(c.root);assert(store.rows.some(r=>r.event==='archived'));assert(store.rows.some(r=>r.event==='segment_closed'&&r.paused));assert(existsSync(join(c.config.ledgerRoot,p.a.runId+'.jsonl')));assert(store.rows.some(r=>r.event==='continuation'&&!r.allowed));assert.deepEqual(c.effects,['credential','broker','attempt']);
});
test('C-VID115-01 separate process reopens56 binding above old ceiling unchanged',async()=>{
 const c=fresh();c.setSample({owned:55*G});await c.init();await c.prepare();const expected=(await c.cmd('status',['--task','log-summary-date-ranges'])).proposedBinding;
 const input=join(c.dir,'restart115.json');writeFileSync(input,JSON.stringify({root:c.dir,home:c.home,runner:'f'.repeat(40),owned:55*G,docker:B,free:20*G}));
 const {spawnSync}=await import('node:child_process');const result=spawnSync(process.execPath,[new URL('./test_full_driver.mjs',import.meta.url).pathname,input,'status','--campaign',c.root,'--task','log-summary-date-ranges'],{env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).proposedBinding,expected);
});
test('C-VID115-02 growth after archive is sampled and preserves terminal evidence',async()=>{
 const c=fresh();await c.init();await c.prepare();const permit=await c.permit();c.deps.checkpoint=async stage=>{if(stage==='after_archive')c.setSample({owned:56*G});};await c.run(permit);
 const store=new Store(c.root);assert(store.rows.some(r=>r.event==='archived'));assert(store.rows.some(r=>r.event==='segment_closed'&&r.paused));assert(store.rows.some(r=>r.event==='continuation'&&!r.allowed));
 const bytes=readFileSync(join(c.config.ledgerRoot,permit.a.runId+'.jsonl'));await assert.rejects(c.run(permit),/resource_boundary|task_not_unstarted/);assert(readFileSync(join(c.config.ledgerRoot,permit.a.runId+'.jsonl')).equals(bytes));
});
