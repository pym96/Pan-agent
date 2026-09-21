#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {POLICY, Attempt, capRequest, guardedTransport, readLock, validateActivation, readRecords, reconstruct, sha256} from './guard.mjs';
import {runSynthetic, bindingFor, installedIdentity} from './run.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const fixtures=JSON.parse(fs.readFileSync(path.join(here,'fixtures.json')));
const [product,packageFile,output,runnerSHA]=process.argv.slice(2);
if (product==='--owner-child') {
  const activation=JSON.parse(fs.readFileSync(packageFile));
  try { const a=new Attempt(activation); a.reserve(10,new AbortController().signal); console.log('owner'); process.exit(0); }
  catch { console.log('consumed'); process.exit(2); }
}
assert(product && packageFile && output && runnerSHA, 'usage: verify.mjs PRODUCT_DIR PRODUCT_TGZ NEW_OUTPUT_DIR RUNNER_SHA');
fs.mkdirSync(output,{recursive:false});
const lockHash=readLock(path.join(here,'lock.json')).hash;
const binding=bindingFor(runnerSHA,lockHash);
let tests=0, successRecords; const results=[];
function activation() { const now=Date.now(); return {version:POLICY.version,mode:'synthetic',...binding,run_id:randomUUID(),credential_env:'SYNTHETIC_ONLY',account_confirmed:true,
 human_authorization:'I authorize this exact single smoke attempt and its resource limits.',approval_reference:'synthetic-only-not-authorization',approved_at:new Date(now-2000).toISOString(),starts_at:new Date(now-1000).toISOString(),expires_at:new Date(now+3600000).toISOString(),ledger_root:path.resolve(output,'ledger')}; }
async function test(name,fn) { try {await fn();results.push({name,passed:true}); tests++;} catch(error) {results.push({name,passed:false});fs.writeFileSync(path.join(output,'tests.json'),JSON.stringify(results,null,2)); console.error('FAILED '+name);throw error;} }
function wire({tool=true,usage=true,model='observed-k3-build',stop,text,name=POLICY.tool,args='{}',truncate=false,outputTokens=3}={}) {
 const delta={reasoning_content:fixtures.reasoning,...(tool ? {tool_calls:[{index:0,id:'smoke-call',type:'function',function:{name,arguments:args}}]} : {content:text ?? POLICY.marker})};
 const base={object:'chat.completion.chunk',created:1,id:'synthetic-response',...(model===null ? {} : {model})};
 const rows=[{...base,choices:[{index:0,delta,finish_reason:null}]},{...base,choices:[{index:0,delta:{},finish_reason:stop ?? (tool?'tool_calls':'stop')}]}];
 if(usage)rows.push({...base,choices:[],usage:{prompt_tokens:7,completion_tokens:outputTokens,total_tokens:7+outputTokens}});
 return rows.map(r=>'data: '+JSON.stringify(r)+'\n\n').join('')+(truncate?'':'data: [DONE]\n\n');
}
function fakeClock() { let time=0, next=0;const timers=new Map();return {now:()=>time,schedule:(fn,ms)=>{timers.set(++next,{at:time+ms,fn});return next;},clear:id=>timers.delete(id),advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}}; }
async function scenario(name,options={}) {
 const a=options.activation ?? activation();let sends=0,credentials=0;const requests=[];let reservationSeen=true;
 const fetchImplementation=async(url,init)=>{
   sends++;requests.push(JSON.parse(init.body));
   assert.equal(url,POLICY.endpoint);assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer '+fixtures.credential);
   if(options.fetch) return options.fetch(url,init,sends);
   const data=options.status ? fixtures.error : (options.wires ?? [wire(),wire({tool:false})])[sends-1];
   return {status:options.status ?? 200,body:{async *[Symbol.asyncIterator](){yield Buffer.from(data);}}};
 };
 const credentialSource=()=>{credentials++;const records=readRecords(path.join(a.ledger_root,a.run_id,'records.jsonl'));reservationSeen &&= records.filter(r=>r.type==='reserved').length===credentials;if(options.credentialFail)throw Error(fixtures.error);return fixtures.credential;};
 const result=await runSynthetic({activation:a,runnerSHA,product,packageFile,fetchImplementation,credentialSource,signal:options.signal,clock:options.clock,...options.overrides});
 assert(reservationSeen);assert(credentials<=2 && sends<=2);assert.equal(result.report.reserved_dispatches,credentials);
 assert.equal(result.report.smoke_success,false);assert.equal(result.report.live_compatibility_demonstrated,false);
 assert.deepEqual(result.report,reconstruct(readRecords(path.join(result.directory,'records.jsonl'))));
 fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({report:result.report,independent:{sends,credentials,reservationSeen}},null,2));
 return {...result,sends,credentials,requests};
}
await test('installed identity',()=>assert.equal(installedIdentity(product).runtime_sha256,POLICY.runtime_sha256));
await test('two-response installed public Session and exact continuation',async()=>{
 const r=await scenario('success');successRecords=path.join(r.directory,'records.jsonl');assert.equal(r.report.oracle_met,true);assert.equal(r.sends,2);assert.equal(r.report.tool_executions,1);
 assert(!JSON.stringify(r.requests[0]).includes(POLICY.marker));
 assert(r.requests[1].messages.some(m=>m.role==='tool' && m.content===POLICY.marker));
 assert(r.requests[1].messages.some(m=>m.role==='assistant' && m.reasoning_content===fixtures.reasoning));
 assert(r.requests.every(r=>r.max_tokens===4096));
});
for(const status of [400,401,403,429,500])await test('http '+status,async()=>{const r=await scenario('http-'+status,{status});assert.equal(r.sends,1);assert.equal(r.report.calls[0].status,status);assert.equal(r.report.tool_executions,0);assert.equal(r.report.evidence_complete,true);});
for(const [name,first,second,count] of [
 ['missing-usage',wire({usage:false}),wire({tool:false}),1],['missing-identity',wire({model:null}),wire({tool:false,model:null}),2],
 ['changed-model',wire(),wire({tool:false,model:'different-alias'}),2],['truncated',wire({truncate:true}),wire({tool:false}),1],
 ['length',wire({tool:false,stop:'length'}),wire({tool:false}),1],['no-tool-final',wire({tool:false}),wire({tool:false}),1],
 ['wrong-tool',wire({name:'other'}),wire({tool:false}),1],['extra-arguments',wire({args:'{"extra":true}'}),wire({tool:false}),1],
 ['malformed-arguments',wire({args:'{'}),wire({tool:false}),1],['wrong-final',wire(),wire({tool:false,text:'wrong'}),2],
 ['third-turn-request',wire(),wire(),2],['reported-cap-exceeded',wire({outputTokens:4097}),wire({tool:false}),1]
])await test(name,async()=>{const r=await scenario(name,{wires:[first,second]});assert.equal(r.sends,count);assert.equal(r.report.oracle_met,name==='missing-identity');if(name==='missing-identity')assert(r.report.responses.every(x=>x.model.status==='unavailable'));if(name==='missing-usage')assert.equal(r.report.responses[0].usage.status,'unavailable');});
await test('requested output cap equality',async()=>{const r=await scenario('output-cap-equality',{wires:[wire({outputTokens:4096}),wire({tool:false,outputTokens:4096})]});assert.equal(r.report.oracle_met,true);});
await test('credential callback failure reservation consumed',async()=>{const r=await scenario('credential-failure',{credentialFail:true});assert.equal(r.credentials,1);assert.equal(r.sends,0);assert.equal(r.report.reserved_dispatches,1);assert.equal(r.report.upstream_dispatch_attempts,0);});
await test('transport throws raw error safely',async()=>{const r=await scenario('transport-failure',{fetch:async()=>{throw Error(fixtures.error);}});assert.equal(r.sends,1);});
await test('pre-abort inert',async()=>{const c=new AbortController();c.abort();const r=await scenario('pre-abort',{signal:c.signal});assert.equal(r.sends,0);assert.equal(r.credentials,0);});
for(const pending of ['send','stream'])await test('pending '+pending+' cancellation and late result',async()=>{
 const c=new AbortController();let release;const wait=new Promise(r=>release=r);
 const r=await scenario('pending-'+pending,{signal:c.signal,fetch:async()=>{setImmediate(()=>c.abort());if(pending==='send')await wait;return {status:200,body:{async *[Symbol.asyncIterator](){await wait;yield Buffer.from(wire());}}};}});
 assert.equal(r.sends,1);assert.equal(r.report.oracle_met,false);release();await new Promise(r=>setImmediate(r));assert.equal(r.report.tool_executions,0);
});
for(const boundary of [119999,120000,120001])await test('dispatch monotonic '+boundary,async()=>{
 const clock=fakeClock();const r=await scenario('deadline-'+boundary,{clock,fetch:async(_url,_init,n)=>{if(n===1)clock.advance(boundary);return {status:200,body:{async *[Symbol.asyncIterator](){yield Buffer.from(wire({tool:n===1}));}}};}});
 assert.equal(r.report.oracle_met,boundary<120000);assert.equal(r.sends,boundary<120000?2:1);
});
for(const pending of ['send','stream'])await test('pending '+pending+' dispatch timeout',async()=>{
 const clock=fakeClock();const never=new Promise(()=>{});
 const r=await scenario('timeout-'+pending,{clock,fetch:async()=>{if(pending==='send'){setImmediate(()=>clock.advance(120000));await never;}return {status:200,body:{async *[Symbol.asyncIterator](){setImmediate(()=>clock.advance(120000));await never;}}};}});
 assert.equal(r.sends,1);assert.equal(r.report.terminal.stop,'dispatch_deadline');
});
await test('activation invalid matrix inert before effects',async()=>{
 const bad=[null,{}, {...activation(),mode:'live'},...['runner_sha','product_sha','package_sha256','lock_sha256'].map(k=>({...activation(),[k]:'0'.repeat(k.includes('sha256')?64:40)})),{...activation(),expires_at:'2000-01-01T00:00:00Z'},{...activation(),starts_at:'2999-01-01T00:00:00Z'},{...activation(),account_confirmed:false},{...activation(),human_authorization:'yes'},{...activation(),run_id:'placeholder'},{...activation(),extra:true}];
 for(const a of bad){let effects=0;await assert.rejects(runSynthetic({activation:a,runnerSHA,product,packageFile,fetchImplementation:()=>effects++,credentialSource:()=>effects++}));assert.equal(effects,0);}
 assert.throws(()=>validateActivation(activation(),binding,'live'));
});
await test('wrong package and immutable lock inputs inert',async()=>{
 const bogus=path.join(output,'bogus.tgz');fs.writeFileSync(bogus,'synthetic wrong package');
 for(const overrides of [{packageFile:bogus},{product:output}]){let effects=0;await assert.rejects(runSynthetic({activation:activation(),runnerSHA,product,packageFile,fetchImplementation:()=>effects++,credentialSource:()=>effects++,...overrides}));assert.equal(effects,0);}
 for(const key of ['model','task','tool','max_tokens','endpoint','reasoning','kernel']){const file=path.join(output,'wrong-'+key+'.json');fs.writeFileSync(file,JSON.stringify({...POLICY,[key]:'wrong'}));let effects=0;await assert.rejects(runSynthetic({activation:activation(),runnerSHA,product,packageFile,lockFile:file,fetchImplementation:()=>effects++,credentialSource:()=>effects++}));assert.equal(effects,0);}
});
const baseRequest=()=>({method:'POST',path:'/chat/completions',headers:{accept:'text/event-stream','content-type':'application/json'},signal:new AbortController().signal,body:JSON.stringify({model:POLICY.model,messages:[],stream:true,stream_options:{include_usage:true},reasoning_effort:'high',tools:[{type:'function',function:{name:POLICY.tool,description:'Return the fixed smoke fixture.',parameters:{type:'object',properties:{},additionalProperties:false}}}]})});
await test('only cap insertion preserves every field',()=>{const r=baseRequest();const b=JSON.parse(r.body);b.messages=[{role:'assistant',reasoning_content:fixtures.reasoning,tool_calls:[{id:'x'}]}];r.body=JSON.stringify(b);const capped=JSON.parse(capRequest(r));assert.equal(capped.max_tokens,4096);delete capped.max_tokens;assert.deepEqual(capped,b);});
await test('wrong wire route profile tool and cap refuse',()=>{for(const delta of [{max_tokens:4096},{max_completion_tokens:9},{model:'other'},{reasoning_effort:'low'},{tools:[]},{temperature:1}]){const r=baseRequest();r.body=JSON.stringify({...JSON.parse(r.body),...delta});assert.throws(()=>capRequest(r));}for(const delta of [{method:'GET'},{path:'/models'},{headers:{authorization:'unexpected'}}])assert.throws(()=>capRequest({...baseRequest(),...delta}));});
for(const bytes of [131072,131073])await test('request bytes '+bytes,async()=>{const r=baseRequest();const b=JSON.parse(r.body);b.messages=[{role:'user',content:''}];r.body=JSON.stringify(b);b.messages[0].content='x'.repeat(bytes-Buffer.byteLength(capRequest(r)));r.body=JSON.stringify(b);const a=new Attempt(activation());let effects=0;try{const transport=guardedTransport(a,{send:async()=>{effects++;return {status:200,body:{async *[Symbol.asyncIterator](){}}};}});if(bytes===131072){const response=await transport.send(r);for await(const _ of response.body){}assert.equal(effects,1);}else{await assert.rejects(transport.send(r));assert.equal(effects,0);}}finally{a.settle({status:'synthetic',oracle_met:false,archive_sealed:false});}});
for(const bytes of [524288,524289])await test('response bytes '+bytes+' rejects overflowing chunk before adapter',async()=>{const a=new Attempt(activation());let received=0;const transport=guardedTransport(a,{send:async()=>({status:200,body:{async *[Symbol.asyncIterator](){yield new Uint8Array(524288);if(bytes>524288)yield new Uint8Array(1);}}})});try{const response=await transport.send(baseRequest());const consume=async()=>{for await(const chunk of response.body)received+=chunk.length;};if(bytes===524288)await consume();else await assert.rejects(consume());assert.equal(received,524288);}finally{a.settle({status:'synthetic',oracle_met:false,archive_sealed:false});}});
await test('third dispatch and second tool blocked',()=>{const a=new Attempt(activation());try{a.reserve(1);a.finishDispatch();a.reserve(1);a.finishDispatch();assert.throws(()=>a.reserve(1));assert.equal(readRecords(a.file).filter(r=>r.type==='reserved').length,2);}finally{a.settle({status:'synthetic'});}const b=new Attempt(activation());try{b.tool('one');assert.throws(()=>b.tool('two'));assert.equal(b.tools,1);}finally{b.settle({status:'synthetic'});}});
for(const boundary of [299999,300000,300001])await test('whole attempt monotonic '+boundary,()=>{const clock=fakeClock();const a=new Attempt(activation(),{clock});try{clock.advance(boundary);if(boundary<300000)a.check();else assert.throws(()=>a.check());}finally{a.settle({status:'synthetic'});}});
await test('earliest whole deadline prevents send and tool',()=>{const clock=fakeClock();const a=new Attempt(activation(),{clock});try{clock.advance(299999);a.reserve(1);clock.advance(1);assert.throws(()=>a.check());assert.throws(()=>a.tool('late'));assert.equal(a.reason,'attempt_deadline');}finally{a.settle({status:'synthetic'});}});
await test('concurrent separate processes and restart after reservation',async()=>{
 const a=activation();const file=path.join(output,'synthetic-concurrency-activation.json');fs.writeFileSync(file,JSON.stringify(a));
 const child=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[fileURLToPath(import.meta.url),'--owner-child',file],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('exit',code=>resolve({code,stdout,stderr}));});
 const simultaneous=await Promise.all([child(),child()]);assert.deepEqual(simultaneous.map(x=>x.code).sort(),[0,2]);const restart=await child();assert.equal(restart.code,2);
 assert.equal(readRecords(path.join(a.ledger_root,a.run_id,'records.jsonl')).filter(r=>r.type==='reserved').length,1);
 fs.writeFileSync(path.join(output,'concurrency.json'),JSON.stringify({simultaneous,restart},null,2));
 const report=reconstruct(readRecords(path.join(a.ledger_root,a.run_id,'records.jsonl')));assert.equal(report.evidence_complete,false);assert.equal(report.reserved_dispatches,1);assert.equal(report.terminal.status,'uncertain');
});
await test('CLI help dry-run report and absent malformed activation are inert',async()=>{
 const malformed=path.join(output,'malformed-activation.json');fs.writeFileSync(malformed,'{');
 const commands=[['--help'],['dry-run'],['report',successRecords],['live',path.join(output,'absent-activation.json'),product,packageFile],['live',malformed,product,packageFile]];
 const logs=[];
 for(const args of commands){const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(here,'run.mjs'),...args],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('exit',code=>resolve({args,code,stdout,stderr}));});assert.equal(result.code,args[0]==='live'?1:0);if(args[0]==='report')assert.deepEqual(JSON.parse(result.stdout.split('WO35 meters')[0]),reconstruct(readRecords(successRecords)));logs.push(result);}
 fs.writeFileSync(path.join(output,'cli.json'),JSON.stringify(logs,null,2));
});
await test('all persisted reports ledgers archives exclude private canaries and their hashes',()=>{
 function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else{const text=fs.readFileSync(file,'utf8');for(const value of [fixtures.credential,fixtures.reasoning,fixtures.error]){assert(!text.includes(value),'private canary leaked');assert(!text.includes(sha256(value)),'private hash leaked');}}}}scan(output);
});
fs.writeFileSync(path.join(output,'tests.json'),JSON.stringify({classification:'synthetic offline; not live authorization',tests,results,real_provider_calls:0,real_credential_reads:0,account_quota_calls:0,paid_executions:0,fees:0},null,2)+'\n');
console.log(JSON.stringify({synthetic:true,tests,passed:true}));
