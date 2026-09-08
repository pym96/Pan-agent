/** External verification client. Every Product operation is an installed export. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { runCli,runTui,FauxModelAdapter,RunArchiveStore,loadRunbook } from 'pan-agent';
import { runCli as subpathRunCli } from 'pan-agent/cli';
assert.equal(runCli,subpathRunCli);
const root=process.cwd();const workspace=join(root,'workspace');const memory=join(root,'memory');
const fixture=JSON.parse(await readFile(new URL('./fixture.json',import.meta.url),'utf8'));
assert.equal(fixture.id,'packed-create-run-verify/v1');
await mkdir(workspace);assert.deepEqual(await readdir(workspace),[]);
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
let rendered='';let prompts=0;let actualRunId;let snapshotBeforeReplay;let replayCounters;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function archiveFiles(){
 const entries=[];
 for(const file of (await readdir(memory,{recursive:true})).sort()) {
  if(!file.endsWith('.json')&&!file.endsWith('.jsonl'))continue;
  entries.push({path:file,sha256:hash(await readFile(join(memory,file)))});
 }
 return entries;
}
output.on('data',(chunk)=>{
 rendered+=chunk;
 if(chunk.includes('[y/N]> '))setImmediate(()=>input.write('y\n'));
 else if(chunk.endsWith('You > ')) {
  const phase=prompts++;
  if(phase===0)setImmediate(()=>input.write('Create hello.js, run it and verify its exact source.\n'));
  else if(phase===1) {
   assert.match(rendered,/Completed \(completed\) · Model calls 4 · Tool results 3/);
   RunArchiveStore.open(memory).then(store=>store.listRuns()).then(async runs=>{
    assert.equal(runs.length,1); actualRunId=runs[0].runId;
    snapshotBeforeReplay=await archiveFiles();replayCounters=adapter.state.exchangeCount;input.write(':details\n');
   }).catch(error=>{throw error;});
  } else if(phase===2)setImmediate(()=>input.write(':runs\n'));
  else if(phase===3)setImmediate(()=>input.write(`:replay ${actualRunId}\n`));
  else if(phase===4)setImmediate(()=>input.write(':details\n'));
  else if(phase===5)setImmediate(()=>input.write(':replay nonexistent\n'));
  else if(phase===6)setImmediate(()=>input.write(':replay ../escape\n'));
  else setImmediate(()=>input.write(':exit\n'));
 }
});
const exit=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,createNativeAdapter:()=>adapter,startTui:options=>runTui({...options,input})});
assert.equal(exit,0);assert.equal(adapter.state.exchangeCount,4);assert.equal(contexts.length,4);
assert.equal(adapter.state.exchangeCount,replayCounters);assert.match(rendered,/Archived replay/);
assert.deepEqual(await archiveFiles(),snapshotBeforeReplay,'replay must not modify sealed bytes');
assert.match(rendered,/Admitted tool calls 3 · Tool start events 3 · Tool results 3/);
assert.match(rendered,/Admitted tool calls unavailable \(not recorded\) · Tool start events 3 · Tool results 3/);
assert.match(rendered,/Model calls unavailable \(not recorded\)/);
assert.match(rendered,/Full tool result/);assert.match(rendered,/invalid ID/);assert.doesNotMatch(rendered,/RUN_SUMMARY|TOOL started|\x1b/);

assert.equal(await readFile(join(workspace,'hello.js'),'utf8'),fixture.calls[0].arguments.content);
const store=await RunArchiveStore.open(memory);const runs=await store.listRuns();assert.equal(runs.length,1);assert.equal(runs[0].runId,actualRunId);
const records=await store.readArchive(actualRunId);const manifest=await store.readManifest(actualRunId);
const started=records.filter(r=>r.type==='tool.started');const settled=records.filter(r=>r.type==='tool.settled');
assert.deepEqual(started.map(r=>r.toolName),['write','bash','read']);assert.equal(settled.length,3);
for(let i=0;i<3;i++) {assert.deepEqual(started[i].arguments,fixture.calls[i].arguments);assert.equal(settled[i].toolCallId,fixture.calls[i].id);assert.equal(settled[i].isError,false);}
assert.equal(settled[1].details.exitCode,0);assert.ok(settled[1].text.split('\n').includes('PAN_PACK_OK'));
assert.equal(settled[2].text,fixture.calls[0].arguments.content);
const terminal=records.filter(r=>r.type==='run.terminal');assert.equal(terminal.length,1);assert.equal(terminal[0].status,'completed');assert.equal(records.at(-1).type,'run.settled');
const modelEvents=records.filter(r=>r.type==='model.turn_settled');assert.equal(modelEvents.length,4);assert.equal(modelEvents.at(-1).text,fixture.final);
const packageRoot=fileURLToPath(new URL('../',import.meta.resolve('pan-agent')));
const runbook=await loadRunbook(join(packageRoot,'RUNBOOK.md'));assert.equal(records[0].runbook_revision,runbook.revision);
assert.ok(manifest.head_hash);assert.equal(runs[0].sealed,true);
await writeFile(join(root,'tracer-contexts.json'),JSON.stringify(contexts,null,2)+'\n');
await writeFile(join(root,'tracer-output.txt'),rendered);
await writeFile(join(root,'tracer-records.json'),JSON.stringify(records,null,2)+'\n');
await writeFile(join(root,'tracer-report.json'),JSON.stringify({case:fixture.id,exit,model_exchanges:adapter.state.exchangeCount,tool_names:started.map(r=>r.toolName),run_id:actualRunId,terminal,archive_manifest:manifest,runbook_revision:runbook.revision,hello_sha256:hash(await readFile(join(workspace,'hello.js'))),final:fixture.final,replay_extra_exchanges:adapter.state.exchangeCount-replayCounters,sealed_files_before_replay:snapshotBeforeReplay,sealed_files_after_replay:await archiveFiles()},null,2)+'\n');
console.log(rendered);console.log('PASS installed packed-create-run-verify/v1',actualRunId);
