/** #53 installed Kimi task driver: real PanKimiModelAdapter, scripted no-network transport, frozen wires. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const root=process.cwd();
const verification=join(root,'verification');
const home=join(root,'settings-home');
const fixture=JSON.parse(await readFile(join(verification,'kimi-wire.json'),'utf8'));
const taskFixture=JSON.parse(await readFile(join(verification,'fixture.json'),'utf8'));
const canaries=JSON.parse(await readFile(join(verification,'canaries.json'),'utf8')).values;
assert.equal(fixture.id,'kimi-wire/v1');assert.equal(taskFixture.id,'preview-first-task/v1');
const childEnvironments=[];
const originalSpawn=cp.spawn;cp.spawn=function(command,args,options){childEnvironments.push({command,args:Array.isArray(args)?args:[],env:options?.env??null});return originalSpawn.call(this,command,args,options);};
let securityCalls=0;
const originalSpawnSync=cp.spawnSync;cp.spawnSync=function(command,args,options){if(command==='security')securityCalls++;return originalSpawnSync.call(this,command,args,options);};
syncBuiltinESMExports();
const {runCli,runTui,PanKimiModelAdapter,RunArchiveStore,loadRunbook,loadPanSettings}=await import(pathToFileURL(join(root,'node_modules/pan-agent','dist/index.js')));
const settings=await loadPanSettings(home);assert.ok(settings,'settings must exist after configure');
assert.equal(settings.provider,'kimi-code');assert.equal(settings.modelId,'kimi-for-coding');
await mkdir(join(root,'workspace'));assert.deepEqual(await readdir(join(root,'workspace')),[],'workspace must start without a pre-created answer file');
// Scripted transport: serves the frozen wires in order, fragments bytes, captures every request.
const captured=[];
let served=0;
const fragment=wire=>{
 const bytes=Buffer.from(wire,'utf8');const pieces=[];
 for(let i=0;i<bytes.length;i+=7)pieces.push(new Uint8Array(bytes.subarray(i,i+7)));
 return pieces;
};
const scriptedTransport={
 async send(request){
  const index=served++;
  captured.push({method:request.method,path:request.path,headers:{...request.headers},body:request.body});
  if(index>=fixture.exchanges.length)throw new Error('unexpected extra exchange');
  const pieces=fragment(fixture.exchanges[index].wire);
  return {status:200,body:(async function*(){for(const p of pieces)yield p;})()};
 },
};
const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
let rendered='';let prompts=0;
output.on('data',(chunk)=>{
 rendered+=chunk;
 if(chunk.includes('[y/N]> '))setImmediate(()=>input.write('y\n'));
 else if(chunk.endsWith('You > ')) {
  const phase=prompts++;
  if(phase===0)setImmediate(()=>input.write(taskFixture.prompt+'\n'));
  else setImmediate(()=>input.write(':exit\n'));
 }
});
let capturedProfile=null;
const exit=await runCli(['--kernel','native','--workspace',join(root,'workspace'),'--memory-root',join(root,'memory')],{output,home,
 createKimiAdapter:profile=>{capturedProfile=profile;return new PanKimiModelAdapter(profile,{transport:scriptedTransport});},
 startTui:options=>runTui({...options,input})});
assert.equal(exit,0);assert.equal(served,4,'exactly four Kimi exchanges');
assert.deepEqual(capturedProfile,{modelId:'kimi-for-coding'},'restart must restore the fixed Kimi selection');
assert.ok(rendered.includes('CREDENTIAL environment KIMI_API_KEY (required at task time; never saved)'),'kimi credential line must be reported');
assert.equal(securityCalls,0,'no Keychain read before/without selection');
assert.match(rendered,/\(completed\) · Model calls 4 · Tool results 3/);
assert.ok(rendered.includes('verified PAN_PREVIEW_OK'),'final marker visible');
for(const req of captured){
 assert.equal(req.method,'POST');assert.equal(req.path,'/chat/completions');
 const body=JSON.parse(req.body);
 assert.equal(body.model,'kimi-for-coding');
 assert.ok(!('thinking' in body)&&!('reasoning_effort' in body),'no DeepSeek thinking fields');
 assert.ok(!req.body.includes('reasoning_content')&&!req.body.includes('deepseek'),'no DeepSeek fields in Kimi requests');
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hello=await readFile(join(root,'workspace','hello.js'),'utf8');
assert.equal(hello,taskFixture.calls[0].arguments.content);
const store=await RunArchiveStore.open(join(root,'memory'));const runs=await store.listRuns();assert.equal(runs.length,1);
const records=await store.readArchive(runs[0].runId);
const started=records.filter(r=>r.type==='tool.started');const settled=records.filter(r=>r.type==='tool.settled');
assert.deepEqual(started.map(r=>r.toolName),['write','bash','read']);assert.equal(settled.length,3);
assert.equal(settled[1].details.exitCode,0);assert.ok(settled[1].text.split('\n').includes(taskFixture.expected_stdout));
const terminal=records.filter(r=>r.type==='run.terminal');assert.equal(terminal.length,1);assert.equal(terminal[0].status,'completed');
const modelEvents=records.filter(r=>r.type==='model.turn_settled');assert.equal(modelEvents.length,4);
assert.equal(modelEvents.at(-1).text,taskFixture.final);
assert.equal(modelEvents.at(-1).identity.provider.value,'kimi-code');
const runbook=await loadRunbook(join(root,'node_modules/pan-agent','RUNBOOK.md'));assert.equal(records[0].runbook_revision,runbook.revision);
const leak=(surface,where)=>{for(const canary of canaries)assert.ok(!String(surface).includes(canary),`canary reached ${where}`);};
leak(rendered,'terminal');
leak(await readFile(join(home,'.pan-agent','settings.json'),'utf8'),'settings');
for(const file of await readdir(join(root,'memory'),{recursive:true}))if(file.endsWith('.json')||file.endsWith('.jsonl'))leak(await readFile(join(root,'memory',file),'utf8'),'archive:'+file);
for(const file of await readdir(join(root,'workspace'),{recursive:true}))leak(await readFile(join(root,'workspace',file),'utf8'),'workspace:'+file);
const taskChildren=childEnvironments.filter(c=>!(Array.isArray(c.args)&&c.args.some(a=>String(a).includes('guard'))));
assert.equal(taskChildren.length,1,'exactly one task child is allowed');
assert.equal(taskChildren[0].command,'/bin/bash');assert.deepEqual(taskChildren[0].args,['-c','node hello.js']);
leak(JSON.stringify(taskChildren[0].env),'child environment');
await writeFile(join(root,'kimi-task-report.json'),JSON.stringify({case:fixture.id,exit,exchanges:served,run_id:runs[0].runId,capturedProfile,settingsProvider:settings.provider,securityCalls,hello_sha256:hash(hello),canary_leaks:0,requests:captured.map(r=>({method:r.method,path:r.path,body_sha256:hash(r.body)}))},null,2)+'\n');
console.log('PASS installed kimi configured restart task',runs[0].runId);
