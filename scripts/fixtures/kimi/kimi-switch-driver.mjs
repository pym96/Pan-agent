/** #53 provider switch: a Kimi selection starts a fresh session; no DeepSeek history crosses; old run stays replayable. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
const [product,home,workspace,memory,fixtureDir,reportFile]=process.argv.slice(2);
if(!product||!home||!workspace||!memory||!fixtureDir||!reportFile)throw new Error('usage: kimi-switch-driver.mjs PRODUCT HOME WORKSPACE MEMORY FIXTURE_DIR REPORT');
const fixture=JSON.parse(await readFile(join(fixtureDir,'kimi-wire.json'),'utf8'));
const {runCli,runTui,FauxModelAdapter,PanKimiModelAdapter,RunArchiveStore,savePanSettings}=await import(pathToFileURL(join(product,'dist/index.js')));
await mkdir(workspace,{recursive:true});
// Phase A: a completed DeepSeek-backed synthetic session.
const usage={status:'unavailable'};
const identity=p=>({provider:{status:'reported',value:p},model:{status:'reported',value:p+'-v1'},responseId:{status:'unavailable'}});
const outcome=(provider,text)=>({kind:'response',message:{role:'assistant',content:[{type:'text',text}],timestamp:0},stopReason:'stop',usage,identity:identity(provider)});
const drive=async(deps,task)=>{
 const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
 let rendered='';let prompts=0;
 output.on('data',chunk=>{rendered+=chunk;
  if(chunk.includes('[y/N]> '))setImmediate(()=>input.write('y\n'));
  else if(chunk.endsWith('You > ')){const phase=prompts++;setImmediate(()=>input.write(phase===0?task+'\n':':exit\n'));}});
 const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,home,startTui:o=>runTui({...o,input}),...deps});
 return {code,rendered};
};
await savePanSettings({schemaVersion:1,provider:'deepseek',modelId:'deepseek-v4-flash',thinkingLevel:'high',credentialSource:'environment'},home);
const deepseekAdapter=new FauxModelAdapter([outcome('deepseek','deepseek answer retained')]);
const phaseA=await drive({createNativeAdapter:()=>deepseekAdapter},'deepseek task one');
assert.equal(phaseA.code,0);assert.equal(deepseekAdapter.state.exchangeCount,1);
const store=await RunArchiveStore.open(memory);
const runsA=await store.listRuns();assert.equal(runsA.length,1);
// Phase B: explicit Kimi selection in the SAME installed product, same memory root.
await savePanSettings({schemaVersion:1,provider:'kimi-code',modelId:'kimi-for-coding',thinkingLevel:'high',credentialSource:'environment'},home);
const captured=[];
let served=0;
const scriptedTransport={async send(request){served++;captured.push(request.body);const wire=fixture.exchanges[3].wire;return {status:200,body:(async function*(){yield new TextEncoder().encode(wire);})()};}};
let kimiProfile=null;
const phaseB=await drive({createKimiAdapter:profile=>{kimiProfile=profile;return new PanKimiModelAdapter(profile,{transport:scriptedTransport});}},'kimi task two');
assert.equal(phaseB.code,0);assert.equal(served,0+1,'exactly one Kimi exchange');
assert.deepEqual(kimiProfile,{modelId:'kimi-for-coding'});
// Fresh session: the first Kimi request carries only the system prompt and the new task.
const firstBody=JSON.parse(captured[0]);
assert.equal(firstBody.model,'kimi-for-coding');
assert.equal(firstBody.messages.length,2,'no DeepSeek history crosses into the first Kimi request');
assert.equal(firstBody.messages[0].role,'system');assert.equal(firstBody.messages[1].role,'user');
assert.ok(firstBody.messages[1].content.includes('kimi task two'));
assert.ok(!captured[0].includes('deepseek answer retained'),'old provider content must not cross');
// Old run remains readable; replay produces zero exchanges on either provider.
const runsB=await store.listRuns();assert.equal(runsB.length,2);
const recordsA=await store.readArchive(runsA[0].runId);
assert.ok(recordsA.some(r=>r.type==='run.terminal'&&r.status==='completed'));
const replayInput=new PassThrough();const replayOutput=new PassThrough();replayOutput.setEncoding('utf8');
let replayText='';let replayPrompts=0;
replayOutput.on('data',chunk=>{replayText+=chunk;
 if(chunk.includes('[y/N]> '))setImmediate(()=>replayInput.write('y\n'));
 else if(String(chunk).endsWith('You > '))setImmediate(()=>replayInput.write((replayPrompts++===0?':replay '+runsA[0].runId:':exit')+'\n'));});
const replayCode=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output:replayOutput,home,startTui:o=>runTui({...o,input:replayInput}),createKimiAdapter:profile=>new PanKimiModelAdapter(profile,{transport:scriptedTransport})});
assert.equal(replayCode,0);
assert.ok(replayText.includes('deepseek answer retained'),'old run final text must render on replay');
assert.equal(served,1,'replay adds zero Kimi exchanges');
assert.equal(deepseekAdapter.state.exchangeCount,1,'replay adds zero DeepSeek exchanges');
const hash=b=>createHash('sha256').update(b).digest('hex');
await writeFile(reportFile,JSON.stringify({phaseA_run:runsA[0].runId,phaseB_run:runsB.find(r=>r.runId!==runsA[0].runId)?.runId,firstKimiMessages:firstBody.messages.length,kimiExchangeCount:served,deepseekExchangeCount:deepseekAdapter.state.exchangeCount,replayZeroEffects:true,phaseB_run_listed:runsB.length},null,2)+'\n');
console.log('PASS provider switch is a fresh session; old run replays with zero exchanges/effects');
