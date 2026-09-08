/** New process: replay an actually interrupted stream with no task-file reads or effects. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const [product,workspace,memory,runId,outputFile]=process.argv.slice(2);let taskReads=0;
for(const [api,names] of [[fs,['readFile','readFileSync','open','openSync']],[fsp,['readFile','open']]])for(const name of names){const original=api[name];api[name]=function(file,...args){if(typeof file==='string'&&(resolve(file)===workspace||resolve(file).startsWith(workspace+'/'))){taskReads++;throw new Error('Replay attempted task-file read');}return original.call(this,file,...args);};}
syncBuiltinESMExports();
const compiled=product.endsWith('/pan-agent');const {runCli,runTui,FauxModelAdapter,RunArchiveStore}=await import(pathToFileURL(join(product,compiled?'dist/index.js':'typescript/src/index.ts')));
async function hashes(){const values={};for(const file of await fsp.readdir(memory,{recursive:true}))if(file.endsWith('.json')||file.endsWith('.jsonl'))values[file]=createHash('sha256').update(await fsp.readFile(join(memory,file))).digest('hex');return values;}
const before=await hashes();const store=await RunArchiveStore.open(memory),records=await store.readArchive(runId);assert.ok(records.some(e=>e.type==='run.terminal'&&['cancelled','model_error'].includes(e.status)));
const input=new PassThrough(),output=new PassThrough();let text='',prompts=0;const commands=[`:replay ${runId}`,':details',`:replay ${runId}`,':details',':exit'];
output.on('data',chunk=>{text+=chunk;if(String(chunk).includes('[y/N]> '))setImmediate(()=>input.write('y\n'));if(String(chunk).endsWith('You > '))setImmediate(()=>input.write(commands[prompts++]+'\n'));});
const adapter=new FauxModelAdapter([]);let effects=0;
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,createNativeAdapter:()=>adapter,createTools:()=>({tools:[{name:'read',description:'Replay effect trap',parameters:{type:'object'},validate:value=>({ok:true,value}),async execute(){effects++;throw new Error('Replay effect');}}],boundary:'offline'}),startTui:options=>runTui({...options,input})});
assert.equal(code,0);assert.equal(adapter.state.exchangeCount,0);assert.equal(effects,0);assert.equal(taskReads,0);assert.deepEqual(await hashes(),before);assert.doesNotMatch(text,/Hello, |HIDDEN_|text_delta|LATE_AFTER_CANCEL/);assert.match(text,/Transient previews are not recorded/);assert.match(text,/Admitted tool calls unavailable \(not recorded\)/);assert.match(text,/Model calls unavailable \(not recorded\)/);
await fsp.writeFile(outputFile,JSON.stringify({runId,code,modelExchanges:0,effects,taskReads,sealedBefore:before,sealedAfter:await hashes(),text},null,2)+'\n');
console.log('PASS fresh-process interrupted stream replay, preview absent, sealed hashes unchanged, zero task reads/exchanges/effects');
