import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {main,dryRun} from './cli.mjs';import {MODEL,LIMITS,METERED_LIMITS,canonical,digest} from './policy.mjs';
const manifestRaw=readFileSync(new URL('./manifest.json',import.meta.url)),manifest=JSON.parse(manifestRaw),lock=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));
const entry=process.env.PAN_TEST_ENTRY??process.env.WO75_PAN_ENTRY;
function fixture(){
 if(!entry)throw Error('PAN_TEST_ENTRY must name the newly installed candidate');
 const root=mkdtempSync(join(process.env.WO75_TEST_ROOT??tmpdir(),'wo75-cli-')),home=join(root,'home'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});
 const keys=generateKeyPairSync('ed25519'),sha='a'.repeat(40),secret='synthetic-'+randomUUID();
 writeFileSync(join(state,'authority.json'),JSON.stringify({publicKey:keys.publicKey.export({type:'spki',format:'pem'}),acceptedRunnerSha:sha}));
 const activation={authorized:true,runId:randomUUID(),humanAuthorizationId:'offline-fixture-only',notBefore:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),binding:{runnerSha:sha,panHash:lock.package_sha256,manifestHash:digest(manifestRaw),model:MODEL,budget:LIMITS,taskIds:manifest.tasks.map(t=>t.id),images:Object.fromEntries(manifest.tasks.map(t=>[t.id,'sha256:'+'b'.repeat(64)]))}};
 const save=()=>{const {signature,...payload}=activation;activation.signature=sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64');writeFileSync(join(root,'activation.json'),JSON.stringify(activation));};save();
 const counts={credentials:0,dispatches:0,environments:0,verifiers:0},phases=[],seen=[];let turn=0,current;
 const dependencies={home,git:(_,args)=>args[0]==='rev-parse'?sha:'',credentialSource:()=>{counts.credentials++;return secret;},openBroker:({config})=>{counts.environments++;current=config.task.id;turn=0;seen.push(config);phases.push(current+':start');return {ready:Promise.resolve('Official fixture instruction '+current),async exec(command){phases.push(current+':tool');assert.equal(command,current==='break-filter-js-from-html'?'python /app/test_outputs.py':'pwd');return {status:'completed',exit_code:0,stdout:'fixture',stderr:''};},async quiesce(){return {confirmed:true};},async verify(){counts.verifiers++;phases.push(current+':verifier');return {status:'official_scored',rewards:{reward:0}};},async stop(){return {stopped:true};},async close(){phases.push(current+':close');}};},fetchImplementation:async(url,options)=>{counts.dispatches++;turn++;assert.equal(url,MODEL.endpoint);assert.equal(options.headers.authorization,'Bearer '+secret);const body=JSON.parse(options.body);assert(body.messages.some(m=>m.role==='user'&&m.content==='Official fixture instruction '+current));const command=current==='break-filter-js-from-html'?'python /app/test_outputs.py':'pwd';const delta=turn===1?{role:'assistant',reasoning_content:'synthetic-private',tool_calls:[{index:0,id:'call-'+current,type:'function',function:{name:'task_command',arguments:JSON.stringify({command,timeout:2})}}]}:{role:'assistant',content:'Completed.'};const frame=(delta,finish,usage)=>'data: '+JSON.stringify({object:'chat.completion.chunk',created:1,id:'reply',model:MODEL.model,choices:[{index:0,delta,finish_reason:finish}],...(usage?{usage:{prompt_tokens:5,completion_tokens:2,total_tokens:7}}:{})})+'\n\n';return new Response(frame(delta,null,false)+frame({},turn===1?'tool_calls':'stop',true)+'data: [DONE]\n\n');}};
 const args=['--activation',join(root,'activation.json'),'--entry',entry,'--task-root',join(root,'fake-source'),'--output',join(root,'output')];return {root,args,dependencies,activation,save,counts,phases,seen,secret};
}
const scan=root=>readdirSync(root,{withFileTypes:true}).map(p=>p.isDirectory()?scan(join(root,p.name)):readFileSync(join(root,p.name),'utf8')).join('\n');
test('Criteria1.1 real CLI reaches injected environments through signature/identity/package/ledger gates',async()=>{
 const f=fixture();const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('real provider forbidden');};try{await main(f.args,f.dependencies);}finally{globalThis.fetch=oldFetch;}
 assert.deepEqual(f.counts,{credentials:10,dispatches:10,environments:5,verifiers:5});assert.deepEqual(f.seen.map(c=>c.task.id),manifest.tasks.map(t=>t.id));
 for(const id of manifest.tasks.map(t=>t.id))assert(f.phases.indexOf(id+':tool')<f.phases.indexOf(id+':verifier'));
 assert(!JSON.stringify(f.seen).includes(f.secret));const report=JSON.parse(readFileSync(join(f.root,'output/summary.json')));assert.equal(report.denominator,5);assert(report.rows.every(r=>r.state==='official_scored'&&r.reward.reward===0));
 await assert.rejects(main(f.args,f.dependencies),/EEXIST/);assert.equal(f.counts.dispatches,10);const artifacts=scan(f.root);assert(!artifacts.includes(f.secret));assert(!artifacts.includes('synthetic-private'));writeFileSync(join(f.root,'receipt.json'),JSON.stringify({counts:f.counts,phases:f.phases,canaryScan:'pass',realProvider:0,realCredential:0,realDocker:0}));
});
test('Criteria1.1 missing/invalid CLI authorization rejects before all injected effects',async()=>{
 for(const mutation of ['missing','unsigned','signature','expired','identity','budget','image']){const f=fixture();if(mutation==='missing')f.args=[];else if(mutation==='unsigned'){f.activation.authorized=false;f.save();}else if(mutation==='signature'){f.activation.signature='invalid';writeFileSync(f.args[1],JSON.stringify(f.activation));}else if(mutation==='expired'){f.activation.expiresAt=new Date(Date.now()-1).toISOString();f.save();}else if(mutation==='identity'){f.activation.binding.panHash='c'.repeat(64);f.save();}else if(mutation==='budget'){f.activation.binding.budget={...LIMITS,dispatchesPerTask:41};f.save();}else{f.activation.binding.images={};f.save();}await assert.rejects(main(f.args,f.dependencies));assert.deepEqual(f.counts,{credentials:0,dispatches:0,environments:0,verifiers:0});}
});
test('visible-test permission is limited to exact original file; image status remains unknown',()=>{
 const d=dryRun(),visible=d.tasks.filter(t=>t.officialVisibleTest);assert.equal(visible.length,1);assert.equal(visible[0].id,'break-filter-js-from-html');assert.equal(visible[0].officialVisibleTest.visible_path,'/app/test_outputs.py');assert.equal(visible[0].officialVisibleTest.git_blob_sha1,'1bf2128a002d4014d85094c2223f87c62ae9088d');assert.match(visible[0].officialVisibleTest.status,/unverified/);assert(d.tasks.every(t=>t.digest===null));assert.equal(d.authorized,false);assert.deepEqual(d.sideEffects,{credentials:0,provider:0,docker:0});
});

for(const status of [401,429,402])test('metered CLI ends campaign on authentication or confirmed quota '+status,async()=>{
 const f=fixture();Object.assign(f.activation,{version:2,validity:'run-bound',expiresAt:null});f.activation.binding.budget=METERED_LIMITS;f.save();
 f.dependencies.fetchImplementation=async()=>{f.counts.dispatches++;return new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status});};
 await assert.rejects(main(f.args,f.dependencies),/cancelled/);assert.equal(f.counts.environments,1);assert.equal(f.counts.dispatches,1);assert.equal(f.counts.verifiers,0);
 const report=JSON.parse(readFileSync(join(f.root,'output/summary.json')));assert.equal(report.rows.filter(r=>r.state==='not_started').length,4);
});

// #87: actual CLI admission, signature and package checks with synthetic I/O only.
test('WO87 signed null reaches installed parser through CLI and retains byte/usage accounting',async()=>{
 const f=fixture();Object.assign(f.activation,{version:2,validity:'run-bound',expiresAt:null});f.activation.binding.budget={...METERED_LIMITS};f.save();
 const fetcher=f.dependencies.fetchImplementation;
 f.dependencies.fetchImplementation=async(...args)=>{const r=await fetcher(...args);return new Response(':'+ 'p'.repeat(527533)+'\n\n'+await r.text());};
 await main(f.args,f.dependencies);
 assert.deepEqual(f.counts,{credentials:10,dispatches:10,environments:5,verifiers:5});
 const log=readFileSync(join(f.root,'home/.local/state/pan-agent/wo75/ledger',f.activation.runId+'.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const completed=log.filter(x=>x.event==='exchange_completed');assert.equal(completed.length,10);assert(completed.every(x=>x.responseBytes>527533&&x.usage.input===5&&x.usage.output===2));
 for(const mutation of ['missing','tampered','bounded-null']){
  const n=fixture();Object.assign(n.activation,{version:2,validity:'run-bound',expiresAt:null});n.activation.binding.budget={...METERED_LIMITS};
  if(mutation==='missing'){delete n.activation.binding.budget.responseBytes;n.save();}
  else if(mutation==='bounded-null'){delete n.activation.version;delete n.activation.validity;n.activation.expiresAt=new Date(Date.now()+60000).toISOString();n.activation.binding.budget={...LIMITS,responseBytes:null};n.save();}
  else {n.activation.binding.budget.responseBytes=524288;n.save();n.activation.binding.budget.responseBytes=null;writeFileSync(n.args[1],JSON.stringify(n.activation));}
  await assert.rejects(main(n.args,n.dependencies));assert.deepEqual(n.counts,{credentials:0,dispatches:0,environments:0,verifiers:0});
 }
});

// WO91: the signed binding is the only selection source; real CLI gates stay active.
const selectBreak=f=>{f.activation.binding.taskIds=['break-filter-js-from-html'];f.activation.binding.images={'break-filter-js-from-html':'sha256:'+'b'.repeat(64)};};
test('WO91 signed single task runs only break and retains independent denominator and ledger',async()=>{
 const f=fixture();selectBreak(f);Object.assign(f.activation,{version:2,validity:'run-bound',expiresAt:null});f.activation.binding.budget=METERED_LIMITS;f.save();
 await main(f.args,f.dependencies);
 assert.deepEqual(f.counts,{credentials:2,dispatches:2,environments:1,verifiers:1});assert.deepEqual(f.seen.map(c=>c.task.id),['break-filter-js-from-html']);assert.equal(f.seen[0].image,f.activation.binding.images['break-filter-js-from-html']);
 const report=JSON.parse(readFileSync(join(f.root,'output/summary.json')));assert.equal(report.denominator,1);assert.deepEqual(report.taskIds,['break-filter-js-from-html']);assert.equal(report.rows.length,1);assert.equal(report.rows[0].reward.reward,0);assert.match(report.attemptScope,/independent/);assert.match(report.rawRewardCaveat,/does not establish/);
 const ledger=readFileSync(join(f.root,'home/.local/state/pan-agent/wo75/ledger',f.activation.runId+'.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(ledger.filter(r=>r.event==='attempt_reserved').map(r=>r.task),['break-filter-js-from-html']);assert(ledger.filter(r=>r.task).every(r=>r.task==='break-filter-js-from-html'));
 await assert.rejects(main(f.args,f.dependencies),/EEXIST/);assert.equal(f.counts.environments,1);
});
for(const mutation of ['empty','unknown','duplicate','missing','image-key','image-digest','extra-image','tampered-selection','tampered-image','cli-override'])test('WO91 selection rejects before effects: '+mutation,async()=>{
 const f=fixture();selectBreak(f);
 if(mutation==='empty')f.activation.binding.taskIds=[];
 if(mutation==='unknown')f.activation.binding.taskIds=['unknown'];
 if(mutation==='duplicate')f.activation.binding.taskIds.push('break-filter-js-from-html');
 if(mutation==='missing')delete f.activation.binding.taskIds;
 if(mutation==='image-key')f.activation.binding.images={'dna-insert':'sha256:'+'b'.repeat(64)};
 if(mutation==='image-digest')f.activation.binding.images['break-filter-js-from-html']='not-an-image';
 if(mutation==='extra-image')f.activation.binding.images['dna-insert']='sha256:'+'b'.repeat(64);
 f.save();
 if(mutation==='tampered-selection'){f.activation.binding.taskIds=['dna-insert'];f.activation.binding.images={'dna-insert':'sha256:'+'b'.repeat(64)};writeFileSync(f.args[1],JSON.stringify(f.activation));}
 if(mutation==='tampered-image'){f.activation.binding.images['break-filter-js-from-html']='sha256:'+'c'.repeat(64);writeFileSync(f.args[1],JSON.stringify(f.activation));}
 if(mutation==='cli-override')f.args.push('--task','dna-insert');
 await assert.rejects(main(f.args,f.dependencies));assert.deepEqual(f.counts,{credentials:0,dispatches:0,environments:0,verifiers:0});
 assert(!readdirSync(join(f.root,'home/.local/state/pan-agent/wo75')).includes('ledger'));assert(!readdirSync(f.root).includes('output'));
});
test('WO91 single-task HTTP403 preserves unknown score and stops without another task',async()=>{
 const f=fixture();selectBreak(f);f.save();f.dependencies.fetchImplementation=async()=>{f.counts.dispatches++;return new Response('',{status:403});};
 await main(f.args,f.dependencies);assert.equal(f.counts.environments,1);assert.equal(f.counts.dispatches,1);assert.equal(f.counts.verifiers,0);
 const r=JSON.parse(readFileSync(join(f.root,'output/summary.json')));assert.equal(r.denominator,1);assert.equal(r.rows.length,1);assert.equal(r.rows[0].reward,null);assert(r.rows[0].globalStops.some(s=>s.reason==='authentication'));
});
