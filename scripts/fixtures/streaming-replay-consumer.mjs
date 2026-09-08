/** Fresh-process actual installed CLI replay; workspace reads are forbidden. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {resolve,join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const memory=resolve(process.argv[2]??'memory'),workspace=resolve(process.argv[3]??'workspace');
let taskReads=0;
for(const [api,names] of [[fs,['readFile','readFileSync','open','openSync']],[fsp,['readFile','open']]])for(const name of names){const original=api[name];api[name]=function(path,...args){if(typeof path==='string'&&(resolve(path)===workspace||resolve(path).startsWith(workspace+'/'))){taskReads++;throw new Error('replay attempted task-file read');}return original.call(this,path,...args);};}
syncBuiltinESMExports();
const {runCli,runTui,FauxModelAdapter,RunArchiveStore}=await import('pan-agent');
const store=await RunArchiveStore.open(memory);const runs=[];for(const id of await fsp.readdir(join(memory,'runs'))){try{const manifest=await store.readManifest(id);runs.push({runId:id,manifest});}catch{}}assert.ok(runs.length);
async function hashes(){const values={};for(const file of await fsp.readdir(memory,{recursive:true}))if(file.endsWith('.json')||file.endsWith('.jsonl'))values[file]=createHash('sha256').update(await fsp.readFile(join(memory,file))).digest('hex');return values;}
const before=await hashes();const input=new PassThrough(),output=new PassThrough();let text='',prompts=0;
const commands=[':details',':runs',':replay corrupt-fixture',':replay unknown-fixture',...runs.flatMap(run=>[`:replay ${run.runId}`,':details',`:replay ${run.runId}`,':details']),':exit'];
output.on('data',chunk=>{text+=chunk;if(String(chunk).includes('[y/N]> '))setImmediate(()=>input.write('y\n'));if(String(chunk).endsWith('You > '))setImmediate(()=>input.write(commands[prompts++]+'\n'));});
const adapter=new FauxModelAdapter([]);let toolEffects=0;
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,createNativeAdapter:()=>adapter,createTools:()=>({tools:[{name:'read',description:'forbidden replay execution',parameters:{type:'object'},validate:value=>({ok:true,value}),async execute(){toolEffects++;throw new Error('replay tool effect');}}],boundary:'offline'}),startTui:options=>runTui({...options,input})});
assert.equal(code,0);assert.equal(adapter.state.exchangeCount,0);assert.equal(taskReads,0);assert.equal(toolEffects,0);assert.deepEqual(await hashes(),before);
assert.match(text,/ARCHIVE_ERROR corrupt-fixture/);assert.match(text,/LOCAL_ERROR/);assert.match(text,/Tool start events 1 · Tool results 0/);assert.match(text,/No run selected/);assert.match(text,/Admitted tool calls unavailable \(not recorded\)/);assert.match(text,/Model calls unavailable \(not recorded\)/);
for(const run of runs){const records=await store.readArchive(run.runId);const count=records.filter(r=>r.type==='tool.settled').length;assert.ok(text.includes(`Tool results ${count}`));}
await fsp.writeFile('fresh-replay-output.txt',text);await fsp.writeFile('fresh-replay-report.json',JSON.stringify({runs:runs.map(r=>r.runId),taskReads,toolEffects,modelExchanges:adapter.state.exchangeCount,sealedBefore:before,sealedAfter:await hashes()},null,2)+'\n');
console.log('PASS fresh-process installed replay, exact retained counts, no task-file reads or model/tool execution');
