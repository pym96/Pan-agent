import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fixture,wire} from './test_handoff_support.mjs';
import {authorize,budgets,canonical,LIMITS,METERED_LIMITS,MODEL} from './policy.mjs';

const rows=r=>readFileSync(r.root+'/ledger/'+readdirSync(r.root+'/ledger')[0],'utf8').trim().split('\n').map(JSON.parse);
const signed=(budget=METERED_LIMITS)=>{
 const keys=generateKeyPairSync('ed25519');
 const binding={runnerSha:'a'.repeat(40),panHash:'b'.repeat(64),manifestHash:'c'.repeat(64),model:MODEL,budget,taskIds:['control'],images:{}};
 const a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline-87',notBefore:'2020-01-01',expiresAt:null,binding};
 const seal=()=>{const {signature,...payload}=a;a.signature=sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64');};seal();
 return {a,seal,admit:()=>authorize(a,{publicKey:keys.publicKey,acceptedRunnerSha:binding.runnerSha},binding)};
};
// SSE comment padding is consumed by the real parser, followed by real tool/usage frames.
const large=(size,command='ONCE')=>{const tail=wire(command);return Buffer.from(':'+ 'p'.repeat(size-Buffer.byteLength(tail)-3)+'\n\n'+tail);};
const response=(bytes,chunk=4093)=>({status:200,body:(async function*(){for(let n=0;n<bytes.length;n+=chunk)yield bytes.subarray(n,n+chunk);})()});
const clock=()=>{const jobs=[];return {jobs,setTimeout(fn,ms,label){const t={fn,ms,label,active:true};jobs.push(t);return t;},clearTimeout(t){if(t)t.active=false;},fire(label){const t=jobs.findLast(t=>t.active&&t.label===label);assert(t,label);t.active=false;t.fn();}};};
const prepare=({gate})=>Object.assign(gate,signed().admit());
function receipt(r,expected){writeFileSync(r.root+'/wo87-receipt.json',JSON.stringify({expected,counts:r.report.counts,usage:r.report.usage,exchanges:rows(r).filter(x=>['exchange_completed','exchange_failed'].includes(x.event)),realProvider:0,realContainer:0},null,2));}

test('explicit signed null only; omission, tamper, forged and invalid bounds reject',()=>{
 assert.equal(signed().admit().binding.budget.responseBytes,null);
 for(const b of [LIMITS,{...METERED_LIMITS,responseBytes:524288},{...METERED_LIMITS,responseBytes:17}])assert.equal(budgets(b).responseBytes,b.responseBytes);
 for(const value of [undefined,0,-1,524289,'unlimited']){const f=signed({...METERED_LIMITS});if(value===undefined)delete f.a.binding.budget.responseBytes;else f.a.binding.budget.responseBytes=value;f.seal();assert.throws(f.admit);}
 assert.throws(()=>budgets({...METERED_LIMITS,responseBytes:Infinity}));
 assert.throws(()=>budgets({...LIMITS,responseBytes:null}));
 const f=signed({...METERED_LIMITS,responseBytes:524288});f.a.binding.budget.responseBytes=null;assert.throws(f.admit,/signature/);
 const g=signed();g.a.signature='forged';assert.throws(g.admit,/signature/);
 const template=JSON.parse(readFileSync(new URL('./activation-metered-template.json',import.meta.url)));assert.equal(template.binding.budget.responseBytes,null);assert.equal(template.authorized,false);assert.equal(template.signature,null);
});
for(const size of [524288,524289,525319,527533,2097152])for(const chunk of [4093,65536])test(`installed signed large stream ${size} bytes / chunk ${chunk}`,async()=>{
 const bytes=large(size);const timers=clock();
 const r=await fixture({timers,prepare,budget:METERED_LIMITS,fetcher:n=>n===1?response(bytes,chunk):new Response(wire())});
 assert.equal(r.report.agentStatus,'completed');assert.equal(r.report.effects.length,1);assert.equal(r.report.effects[0].arguments.command,'ONCE');
 assert.deepEqual(r.report.counts,{modelRounds:2,exchanges:2,reservations:2,sendEntries:2,retries:0,tools:1});
 assert.deepEqual(r.report.usage,[{input:10,output:5},{input:10,output:5}]);
 assert.equal(rows(r).find(x=>x.event==='exchange_completed').responseBytes,size);assert(!JSON.stringify(r.report).includes('p'.repeat(100)));
 receipt(r,{bytes:size,chunk});
});
for(const budget of [LIMITS,{...METERED_LIMITS,responseBytes:524288}])test('legacy numeric permit still stops at 512KiB',async()=>{
 const r=await fixture({budget,timers:clock(),fetcher:()=>response(large(527533),65536)});
 assert.equal(r.report.diagnostics[0].reason,'response_size');assert.equal(r.report.effects.length,0);assert.deepEqual(r.report.usage,[null]);assert.equal(r.report.counts.retries,0);receipt(r,{bounded:true});
});
test('large semantic content (not just padding) reaches actual installed parser and archive',async()=>{
 const text='汉'.repeat(190000), bytes=Buffer.from(wire().replace('Done',text));
 const r=await fixture({prepare,budget:METERED_LIMITS,timers:clock(),fetcher:()=>response(bytes,4093)});
 assert.equal(r.report.agentStatus,'completed');assert.equal(rows(r).find(x=>x.event==='exchange_completed').responseBytes,bytes.length);
 const archive=r.root+'/attempt/archive';const scan=p=>readdirSync(p,{withFileTypes:true}).map(e=>e.isDirectory()?scan(p+'/'+e.name):readFileSync(p+'/'+e.name,'utf8')).join('');assert(scan(archive).includes(text));receipt(r,{semanticBytes:bytes.length});
});
for(const kind of ['missing_usage','invalid','partial'])test('large '+kind+' remains honest, no partial tool admitted',async()=>{
 let bytes=large(527533);
 if(kind==='missing_usage')bytes=Buffer.from(bytes.toString().replace(/,"usage":\{[^}]+\}/,''));
 if(kind==='invalid')bytes=Buffer.from(bytes.toString().replace('data: [DONE]','data: {INVALID PRIVATE_CANARY'));
 const r=await fixture({prepare,budget:METERED_LIMITS,timers:clock(),fetcher:()=>kind==='partial'?{status:200,body:(async function*(){yield bytes.subarray(0,bytes.length-14);throw Error('PRIVATE_CANARY');})()}:response(bytes)});
 assert.equal(r.report.effects.length,0);assert.deepEqual(r.report.usage,[null]);assert.equal(r.report.verifier,null);assert.equal(r.report.counts.retries,0);assert(!JSON.stringify(r.report).includes('PRIVATE_CANARY'));assert.notEqual(r.report.diagnostics[0].reason,'response_size');receipt(r,{kind});
});
for(const mode of ['stream','waiting','backoff'])for(const cause of ['cancel','deadline'])test(`unlimited ${mode} stops on ${cause}`,async()=>{
 const abort=new AbortController(),timers=clock();let ended=0;
 const stop=()=>cause==='cancel'?abort.abort():timers.fire('agent');
 const original=timers.setTimeout;timers.setTimeout=function(fn,ms,label){const t=original.call(this,fn,ms,label);if(mode==='backoff'&&label==='recovery')queueMicrotask(stop);return t;};
 const r=await fixture({signal:abort.signal,prepare,budget:METERED_LIMITS,timers,fetcher(){
  if(mode==='backoff')throw Object.assign(Error('synthetic'),{cause:{code:'ECONNRESET'}});
  let n=0;return {status:200,body:{[Symbol.asyncIterator](){return {next(){if(mode==='stream'&&n++<9)return Promise.resolve({done:false,value:Buffer.from(':'+ 'p'.repeat(65536)+'\n\n')});queueMicrotask(stop);return new Promise(()=>{});},return(){ended++;return Promise.resolve({done:true});}};}}};
 }});
 assert.equal(r.report.counts.sendEntries,1);assert.equal(r.report.effects.length,0);assert.equal(r.report.stopConfirmed,true);assert.deepEqual(r.report.usage,[null]);
 if(mode==='stream')assert(r.report.diagnostics[0].responseBytes>524288);if(mode!=='backoff')assert(ended>0);
 if(cause==='deadline'){assert.equal(r.report.agentStopReason,'agent_timeout');assert.equal(r.report.verifier.rewards.reward,1);}else{assert(r.report.globalStops.some(x=>x.reason==='cancelled'));assert.equal(r.report.verifier,null);}receipt(r,{mode,cause});
});
test('large response with separate usage tail preserves Provider values',async()=>{
 let text=large(527533,undefined).toString();
 text=text.replace(/,"usage":\{[^}]+\}/,'').replace('data: [DONE]', 'data: '+JSON.stringify({object:'chat.completion.chunk',choices:[],usage:{prompt_tokens:123456,completion_tokens:321,total_tokens:123777}})+'\n\ndata: [DONE]');
 const bytes=Buffer.from(text),r=await fixture({prepare,budget:METERED_LIMITS,timers:clock(),fetcher:n=>n===1?response(bytes):new Response(wire())});
 assert.equal(r.report.agentStatus,'completed');assert.deepEqual(r.report.usage[0],{input:123456,output:321});assert.equal(rows(r).find(x=>x.event==='exchange_completed').responseBytes,bytes.length);receipt(r,{usageTail:true,bytes:bytes.length});
});
test('large partial transient recovery never duplicates completed tools',async()=>{
 const timers=clock(),old=timers.setTimeout;timers.setTimeout=function(fn,ms,label){const t=old.call(this,fn,ms,label);if(label==='recovery')queueMicrotask(()=>this.fire(label));return t;};
 const bytes=large(527533,'NEVER').subarray(0,527533-14);
 const r=await fixture({prepare,budget:METERED_LIMITS,timers,fetcher:n=>n===1?response(large(525319)):n===2?{status:200,body:(async function*(){yield bytes;throw Object.assign(Error('PRIVATE_CANARY'),{cause:{code:'ECONNRESET'}});})()}:new Response(wire())});
 assert.equal(r.report.agentStatus,'completed');assert.equal(r.report.effects.length,1);assert.equal(r.report.effects[0].arguments.command,'ONCE');assert.deepEqual(r.report.counts,{modelRounds:2,exchanges:3,reservations:3,sendEntries:3,retries:1,tools:1});assert.deepEqual(r.report.usage,[{input:10,output:5},null,{input:10,output:5}]);assert.equal(r.report.diagnostics[0].responseBytes,bytes.length);assert(!JSON.stringify(r.report).includes('PRIVATE_CANARY'));receipt(r,{largePartialRecovery:true});
});
