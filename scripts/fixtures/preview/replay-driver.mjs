/** #51 fresh installed process: :replay is inspection, never another execution. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const [product,workspace,memory,runId,outputFile]=process.argv.slice(2);
if(!product||!workspace||!memory||!runId||!outputFile)throw new Error('usage: replay-driver.mjs PRODUCT WORKSPACE MEMORY RUN_ID REPORT');
const canaries=JSON.parse(await fsp.readFile(join(resolve(workspace,'..'),'verification','canaries.json'),'utf8')).values;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rawRead=fsp.readFile;
async function workspaceHashes(){const values={};for(const file of (await fsp.readdir(workspace,{recursive:true})).sort())values[file]=hash(await rawRead.call(fsp,join(workspace,file)));return values;}
const workspaceBefore=await workspaceHashes();
let taskReads=0;
for(const [api,names] of [[fs,['readFile','readFileSync','open','openSync']],[fsp,['readFile','open']]])for(const name of names){const original=api[name];api[name]=function(file,...args){if(typeof file==='string'&&(resolve(file)===workspace||resolve(file).startsWith(workspace+'/'))){taskReads++;throw new Error('Replay attempted task-file read');}return original.call(this,file,...args);};}
syncBuiltinESMExports();
const {runCli,runTui,FauxModelAdapter,RunArchiveStore}=await import(pathToFileURL(join(product,'dist/index.js')));
async function sealedHashes(){const values={};for(const file of (await fsp.readdir(memory,{recursive:true})).sort())if(file.endsWith('.json')||file.endsWith('.jsonl'))values[file]=hash(await fsp.readFile(join(memory,file)));return values;}
const sealedBefore=await sealedHashes();
const store=await RunArchiveStore.open(memory);const prior=await store.readArchive(runId);
assert.ok(prior.some(e=>e.type==='run.terminal'&&e.status==='completed'),'replay target must be the sealed completed run');
const finalText=prior.filter(e=>e.type==='model.turn_settled').at(-1).text;
const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
let text='',prompts=0;const commands=[':replay '+runId,':exit'];
output.on('data',chunk=>{text+=chunk;if(String(chunk).includes('[y/N]> '))setImmediate(()=>input.write('y\n'));else if(String(chunk).endsWith('You > '))setImmediate(()=>input.write(commands[prompts++]+'\n'));});
const adapter=new FauxModelAdapter([]);let effects=0;
const trap=names=>names.map(name=>({name,description:'Replay effect trap',parameters:{type:'object'},validate:value=>({ok:true,value}),async execute(){effects++;throw new Error('Replay effect: '+name);}}));
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,createNativeAdapter:()=>adapter,createTools:()=>({tools:trap(['write','bash','read','edit']),boundary:'offline'}),startTui:options=>runTui({...options,input})});
assert.equal(code,0);
assert.equal(adapter.state.exchangeCount,0,'replay added model exchanges');
assert.equal(effects,0,'replay caused a tool effect');
assert.equal(taskReads,0,'replay read the task workspace');
assert.match(text,/Archived replay .* · archived · zero execution/);assert.ok(text.includes(finalText),'replay must render the retained final result');
assert.deepEqual(await sealedHashes(),sealedBefore,'replay mutated sealed archive bytes');
assert.deepEqual(await workspaceHashes(),workspaceBefore,'replay changed the workspace');
const leak=surface=>{for(const canary of canaries)assert.ok(!String(surface).includes(canary),'canary reached '+surface);};
leak(text);
await fsp.writeFile(outputFile,JSON.stringify({runId,code,model_exchanges:0,effects,taskReads,final_rendered:finalText,sealedBefore,sealedAfter:await sealedHashes(),workspaceBefore,workspaceAfter:await workspaceHashes(),canary_leaks:0},null,2)+'\n');
console.log('PASS fresh-process replay inspection only, zero exchanges/effects, sealed bytes unchanged');
