/** #52 installed task driver with persisted settings: restart restore, CREDENTIAL line, Faux task, canary containment. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const root=process.cwd();
const verification=join(root,'verification');
const home=join(root,'settings-home');
const fixture=JSON.parse(await readFile(join(verification,'fixture.json'),'utf8'));
const expected=JSON.parse(await readFile(join(verification,'expected-result.json'),'utf8'));
const canaries=JSON.parse(await readFile(join(verification,'canaries.json'),'utf8')).values;
assert.equal(fixture.id,'preview-first-task/v1');
const childEnvironments=[];
const originalSpawn=cp.spawn;cp.spawn=function(command,args,options){childEnvironments.push({command,args:Array.isArray(args)?args:[],env:options?.env??null});return originalSpawn.call(this,command,args,options);};
let securityCalls=0;
const originalSpawnSync=cp.spawnSync;cp.spawnSync=function(command,args,options){if(command==='security')securityCalls++;return originalSpawnSync.call(this,command,args,options);};
syncBuiltinESMExports();
const {runCli,runTui,FauxModelAdapter,RunArchiveStore,loadRunbook,loadPanSettings}=await import(pathToFileURL(join(root,'node_modules/pan-agent','dist/index.js')));
const settings=await loadPanSettings(home);assert.ok(settings,'settings must exist after configure');
await mkdir(join(root,'workspace'));assert.deepEqual(await readdir(join(root,'workspace')),[],'workspace must start without a pre-created answer file');
const usage={status:'reported',value:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const outcome=(content,stopReason)=>({kind:'response',message:{role:'assistant',content,timestamp:0},stopReason,usage,identity});
const script=[...fixture.calls.map(c=>outcome([{type:'tool_call',...c}],'tool_calls')),outcome([{type:'text',text:fixture.final}],'stop')];
const contexts=[];let capturedProfile=null;
class ObservedFaux extends FauxModelAdapter {
 async exchange(request) {
  const index=this.state.exchangeCount;
  const messages=request.context.messages;
  const priorCalls=messages.filter(m=>m.role==='assistant').flatMap(m=>m.content.filter(c=>c.type==='tool_call'));
  const results=messages.filter(m=>m.role==='tool_result');
  assert.equal(priorCalls.length,index);assert.equal(results.length,index);
  for(let i=0;i<index;i++) {
   assert.deepEqual(priorCalls[i],{type:'tool_call',...fixture.calls[i]});
   assert.equal(results[i].toolCallId,priorCalls[i].id);assert.equal(results[i].toolName,priorCalls[i].name);assert.equal(results[i].isError,false);
  }
  contexts.push(structuredClone(request.context));return super.exchange(request);
 }
}
const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
let rendered='';let prompts=0;
output.on('data',(chunk)=>{
 rendered+=chunk;
 if(chunk.includes('[y/N]> '))setImmediate(()=>input.write('y\n'));
 else if(chunk.endsWith('You > ')) {
  const phase=prompts++;
  if(phase===0)setImmediate(()=>input.write(fixture.prompt+'\n'));
  else setImmediate(()=>input.write(':exit\n'));
 }
});
const exit=await runCli(['--kernel','native','--workspace',join(root,'workspace'),'--memory-root',join(root,'memory')],{output,home,createNativeAdapter:profile=>{capturedProfile=profile;return new ObservedFaux(script);},startTui:options=>runTui({...options,input})});
assert.equal(exit,0);assert.equal(contexts.length,4);
// Restart restore: the resolved composition profile comes from persisted settings when no flag overrides.
assert.deepEqual(capturedProfile,{modelId:settings.modelId,thinkingLevel:settings.thinkingLevel},'restart must restore the persisted selection exactly');
assert.ok(rendered.includes('CREDENTIAL environment DEEPSEEK_API_KEY (required at task time; never saved)'),'credential source line must be reported');
assert.equal(securityCalls,0,'no Keychain read before/without selection');
assert.match(rendered,/\(completed\) · Model calls 4 · Tool results 3/);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hello=await readFile(join(root,'workspace','hello.js'),'utf8');
assert.equal(hello,fixture.calls[0].arguments.content);
assert.equal(hash(hello),expected.hello_sha256);
const store=await RunArchiveStore.open(join(root,'memory'));const runs=await store.listRuns();assert.equal(runs.length,1);
const records=await store.readArchive(runs[0].runId);
const started=records.filter(r=>r.type==='tool.started');const settled=records.filter(r=>r.type==='tool.settled');
assert.deepEqual(started.map(r=>r.toolName),['write','bash','read']);assert.equal(settled.length,3);
assert.equal(settled[1].details.exitCode,0);assert.ok(settled[1].text.split('\n').includes(fixture.expected_stdout));
const terminal=records.filter(r=>r.type==='run.terminal');assert.equal(terminal.length,1);assert.equal(terminal[0].status,'completed');
const runbook=await loadRunbook(join(root,'node_modules/pan-agent','RUNBOOK.md'));assert.equal(records[0].runbook_revision,runbook.revision);
// Canary containment across every observed surface. The transport boundary probe
// is a separate unguarded driver (config-boundary-driver.mjs) because the guard
// intentionally throws on any credential-pattern env read.
const leak=(surface,where)=>{for(const canary of canaries)assert.ok(!String(surface).includes(canary),`canary reached ${where}`);};
leak(rendered,'terminal');
leak(await readFile(join(home,'.pan-agent','settings.json'),'utf8'),'settings');
for(const file of await readdir(join(root,'memory'),{recursive:true}))if(file.endsWith('.json')||file.endsWith('.jsonl'))leak(await readFile(join(root,'memory',file),'utf8'),'archive:'+file);
for(const file of await readdir(join(root,'workspace'),{recursive:true}))leak(await readFile(join(root,'workspace',file),'utf8'),'workspace:'+file);
const taskChildren=childEnvironments.filter(c=>!(Array.isArray(c.args)&&c.args.some(a=>String(a).includes('guard'))));
assert.equal(taskChildren.length,1,'exactly one task child is allowed');
assert.equal(taskChildren[0].command,'/bin/bash');assert.deepEqual(taskChildren[0].args,['-c','node hello.js']);
leak(JSON.stringify(taskChildren[0].env),'child environment');
await writeFile(join(root,'tracer-report.json'),JSON.stringify({case:fixture.id,exit,model_exchanges:4,run_id:runs[0].runId,capturedProfile,settingsSource:settings.credentialSource,securityCalls,boundary:'authorization-header-only',hello_sha256:hash(hello),canary_leaks:0},null,2)+'\n');
console.log('PASS installed configured restart task',runs[0].runId);
