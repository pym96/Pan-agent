import test from 'node:test';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {resourceCheck} from './full-host.mjs';
import {inventory,inspectSource,successor,validateSuccessor,SOURCE_ROOT,SOURCE_HASH} from './full-migrate.mjs';
import {canonical,digest,MODEL,METERED_LIMITS,authorize} from './policy.mjs';
import {Store,aggregate} from './full-store.mjs';
import {proposedBinding} from './full-cli.mjs';
const base=process.env.WO98_TEST_ROOT;assert(base);mkdirSync(base,{recursive:true});
const manifest=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url)));
const pkg=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));
const host={runnerSha:()=> 'f'.repeat(40),internal:()=>{},sample:()=>({free:20*2**30,owned:1000,docker:48503971840}),mode:'live',expectedModel:MODEL,expectedBudget:METERED_LIMITS,packageHash:pkg.package_sha256};
function fixture(){const dir=mkdtempSync(join(base,'case-')),source=join(dir,'campaign'),target=join(dir,'campaign-disk20');cpSync(SOURCE_ROOT,source,{recursive:true});return {source,target};}
test('C-DISK-01 exact free and original cumulative allocation boundaries',()=>{
 for(const free of [20*2**30-1,20*2**30,20*2**30+1])for(const delta of [24*2**30-1,24*2**30]){
  const fn=()=>resourceCheck('',{docker:123},{free,owned:7,docker:123+delta-7});if(free>=20*2**30&&delta<24*2**30)fn();else assert.throws(fn,/resource_boundary/);
 }
 assert.throws(()=>resourceCheck('',{docker:1000},{free:20*2**30,owned:24*2**30,docker:0}),/resource_boundary/);
});
test('C-DISK-02 actual97 read-only copy preserves all89 rows, baseline and originals',async()=>{
 const c=fixture(),before=inventory(c.source);const original=inspectSource(c.source);const out=await successor(c.source,c.target,host,manifest);validateSuccessor(out);
 assert.deepEqual(inventory(c.source),before);assert.deepEqual(out.meta.resourceBaseline,original.meta.resourceBaseline);
 const rows=aggregate(out,manifest).rows;assert.equal(rows.length,89);assert.equal(rows.filter(r=>r.preparations.at(-1)?.ready).length,59);assert.equal(rows.filter(r=>!r.preparations.length).length,27);
 assert.equal(out.rows.length,original.rows.length);assert.deepEqual(out.rows.map(r=>r.detail),original.rows.map(r=>r.detail));
 const binding=proposedBinding(out,manifest,rows.filter(r=>r.preparations.at(-1)?.ready).map(r=>r.task));assert.equal(binding.runnerSha,'f'.repeat(40));assert.notEqual(binding.full.campaignId,original.meta.campaignId);
 const keys=generateKeyPairSync('ed25519'),authority={acceptedRunnerSha:binding.runnerSha,publicKey:keys.publicKey.export({type:'spki',format:'pem'})};
 const payload={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding:{...binding,runnerSha:original.meta.identity.runnerSha}};
 const activation={...payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')};assert.throws(()=>authorize(activation,authority,binding),/activation_identity/);
 payload.binding=binding;authorize({...payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')},authority,binding);
 await assert.rejects(successor(c.source,c.target,host,manifest),/EEXIST/);
 const metadata=JSON.parse(readFileSync(join(c.target,'campaign.json')));metadata.resourceBaseline.docker=0;writeFileSync(join(c.target,'campaign.json'),JSON.stringify(metadata));assert.throws(()=>validateSuccessor(new Store(c.target)),/journal_chain|migration_baseline/);
});
for(const kind of ['hash','baseline','identity','segment','reservation','ledger'])test('C-DISK-02 refuses source '+kind,async()=>{
 const c=fixture();if(['baseline','identity'].includes(kind)){const path=join(c.source,'campaign.json'),m=JSON.parse(readFileSync(path));if(kind==='baseline')m.resourceBaseline.docker=0;else m.identity.runnerSha='0'.repeat(40);writeFileSync(path,JSON.stringify(m));}
 else if(kind==='segment'||kind==='ledger')writeFileSync(join(c.source,'segments',kind+'.jsonl'),'{}');
 else {const path=join(c.source,'journal/00000000.json'),r=JSON.parse(readFileSync(path));r.event=kind==='reservation'?'reserved':'corrupt';writeFileSync(path,JSON.stringify(r));}
 await assert.rejects(successor(c.source,c.target,host,manifest),/migration_source_hash/);assert(!existsSync(c.target));
});
test('C-DISK-02 concurrent import publishes at most once',async()=>{const c=fixture();const results=await Promise.allSettled([successor(c.source,c.target,host,manifest),successor(c.source,c.target,host,manifest)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);validateSuccessor(new Store(c.target));});
test('C-DISK-02 failed/incomplete destination cannot load or be overwritten',async()=>{const c=fixture();mkdirSync(c.target);await assert.rejects(successor(c.source,c.target,host,manifest),/EEXIST/);assert.throws(()=>new Store(c.target));});
test('C-DISK-02 altered archived bytes and imported ready digest are rejected',async()=>{
 const c=fixture();await successor(c.source,c.target,host,manifest);
 const first=join(c.target,'journal/00000000.json'),r=JSON.parse(readFileSync(first));r.detail.image='sha256:'+'0'.repeat(64);writeFileSync(first,JSON.stringify(r));assert.throws(()=>validateSuccessor(new Store(c.target)),/journal_chain|migration_preparation/);
 const d=fixture();await successor(d.source,d.target,host,manifest);writeFileSync(join(d.target,'source-original/resources.jsonl'),'tampered');assert.throws(()=>validateSuccessor(new Store(d.target)),/migration_source_hash/);
});
