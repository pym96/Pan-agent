/** #51 deterministic installed task driver. Every Product operation is an installed export. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const root=process.cwd();
const verification=join(root,'verification');
const fixture=JSON.parse(await readFile(join(verification,'fixture.json'),'utf8'));
const expected=JSON.parse(await readFile(join(verification,'expected-result.json'),'utf8'));
const canaries=JSON.parse(await readFile(join(verification,'canaries.json'),'utf8')).values;
assert.equal(fixture.id,'preview-first-task/v1');
assert.ok(Array.isArray(canaries)&&canaries.length>=2&&canaries.every(v=>typeof v==='string'&&v.length>=16));
// Independent child-environment observation: capture every spawned child env before Product loads.
const childEnvironments=[];
const originalSpawn=cp.spawn;cp.spawn=function(command,args,options){childEnvironments.push({command,args:Array.isArray(args)?args:[],env:options?.env??null});return originalSpawn.call(this,command,args,options);};
syncBuiltinESMExports();
const {runCli,runTui,FauxModelAdapter,RunArchiveStore,loadRunbook}=await import('pan-agent');
const {runCli:subpathRunCli}=await import('pan-agent/cli');
assert.equal(runCli,subpathRunCli);
const workspace=join(root,'workspace');const memory=join(root,'memory');
await mkdir(workspace);assert.deepEqual(await readdir(workspace),[],'workspace must start without a pre-created answer file');
const usage={status:'reported',value:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const outcome=(content,stopReason)=>({kind:'response',message:{role:'assistant',content,timestamp:0},stopReason,usage,identity});
const script=[...fixture.calls.map(c=>outcome([{type:'tool_call',...c}],'tool_calls')),outcome([{type:'text',text:fixture.final}],'stop')];
const contexts=[];
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
   const callAt=messages.findIndex(m=>m.role==='assistant'&&m.content.some(c=>c.type==='tool_call'&&c.id===priorCalls[i].id));
   assert.equal(messages[callAt+1].toolCallId,priorCalls[i].id);
  }
  if(index>=2)assert.ok(results[1].content[0].text.split('\n').includes(fixture.expected_stdout));
  if(index>=3)assert.equal(results[2].content[0].text,fixture.calls[0].arguments.content);
  contexts.push(structuredClone(request.context));return super.exchange(request);
 }
}
const adapter=new ObservedFaux(script);const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
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
const exit=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,createNativeAdapter:()=>adapter,startTui:options=>runTui({...options,input})});
assert.equal(exit,0);assert.equal(adapter.state.exchangeCount,4);assert.equal(contexts.length,4);
assert.match(rendered,/\(completed\) · Model calls 4 · Tool results 3/,'actual Product summary must report the completed task');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hello=await readFile(join(workspace,'hello.js'),'utf8');
assert.equal(hello,fixture.calls[0].arguments.content);
assert.equal(hash(hello),expected.hello_sha256,'produced bytes must match the independent expected result');
assert.equal(fixture.final,expected.final,'final marker must match the independent expected result');
const store=await RunArchiveStore.open(memory);const runs=await store.listRuns();assert.equal(runs.length,1);
const actualRunId=runs[0].runId;
const records=await store.readArchive(actualRunId);const manifest=await store.readManifest(actualRunId);
const started=records.filter(r=>r.type==='tool.started');const settled=records.filter(r=>r.type==='tool.settled');
assert.deepEqual(started.map(r=>r.toolName),['write','bash','read']);assert.equal(settled.length,3);
for(let i=0;i<3;i++) {assert.deepEqual(started[i].arguments,fixture.calls[i].arguments);assert.equal(settled[i].toolCallId,fixture.calls[i].id);assert.equal(settled[i].isError,false);}
assert.equal(settled[1].details.exitCode,0);assert.ok(settled[1].text.split('\n').includes(fixture.expected_stdout));
assert.equal(settled[2].text,fixture.calls[0].arguments.content);
const terminal=records.filter(r=>r.type==='run.terminal');assert.equal(terminal.length,1);assert.equal(terminal[0].status,'completed');assert.equal(records.at(-1).type,'run.settled');
const modelEvents=records.filter(r=>r.type==='model.turn_settled');assert.equal(modelEvents.length,4);assert.equal(modelEvents.at(-1).text,fixture.final);
const packageRoot=fileURLToPath(new URL('../',import.meta.resolve('pan-agent')));
const runbook=await loadRunbook(join(packageRoot,'RUNBOOK.md'));assert.equal(records[0].runbook_revision,runbook.revision);
assert.ok(manifest.head_hash);assert.equal(runs[0].sealed,true);
// C-ENTRY-05 secret containment: canaries reach no observed surface.
const leak=surface=>{for(const canary of canaries)assert.ok(!String(surface).includes(canary),'canary reached '+surface);};
leak(rendered);
for(const file of await readdir(memory,{recursive:true}))if(file.endsWith('.json')||file.endsWith('.jsonl'))leak(await readFile(join(memory,file),'utf8'));
for(const file of await readdir(workspace,{recursive:true}))leak(await readFile(join(workspace,file),'utf8'));
const taskChildren=childEnvironments.filter(c=>!(Array.isArray(c.args)&&c.args.some(a=>String(a).includes('guard'))));
assert.equal(taskChildren.length,1,'exactly one task child is allowed');
assert.equal(taskChildren[0].command,'/bin/bash');assert.deepEqual(taskChildren[0].args,['-c','node hello.js']);
const childKeys=Object.keys(taskChildren[0].env??{}).sort();
const SAFE=['HOME','LANG','LC_ALL','LC_CTYPE','LOGNAME','PATH','SHELL','TERM','TMPDIR','USER'];
assert.ok(childKeys.every(k=>SAFE.includes(k)),'task child receives only allowlisted environment keys: '+childKeys);
assert.ok(childKeys.includes('PATH'),'task child keeps a usable PATH');
leak(JSON.stringify(taskChildren[0].env));
await writeFile(join(root,'tracer-contexts.json'),JSON.stringify(contexts,null,2)+'\n');
await writeFile(join(root,'tracer-output.txt'),rendered);
await writeFile(join(root,'tracer-records.json'),JSON.stringify(records,null,2)+'\n');
await writeFile(join(root,'tracer-report.json'),JSON.stringify({case:fixture.id,exit,model_exchanges:adapter.state.exchangeCount,tool_names:started.map(r=>r.toolName),run_id:actualRunId,terminal,archive_manifest:manifest,runbook_revision:runbook.revision,hello_sha256:hash(hello),final:fixture.final,expected_result:expected,canary_count:canaries.length,canary_leaks:0,child_environments:taskChildren},null,2)+'\n');
console.log(rendered);console.log('PASS installed preview-first-task/v1',actualRunId);
