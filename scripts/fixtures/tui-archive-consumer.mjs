/** Add cancellation archives through installed CLI/Session, never by editing events. */
import assert from 'node:assert/strict';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {PassThrough} from 'node:stream';
import {runCli,FauxModelAdapter,createCompactPresentation,RunArchiveStore} from 'pan-agent';
const workspace=resolve('workspace'),memory=resolve('memory');const before=await readdir(workspace);const results=[];
for(const n of [2,3]) {
 const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
 const adapter=new FauxModelAdapter([{kind:'response',message:{role:'assistant',timestamp:0,content:Array.from({length:n},(_,i)=>({type:'tool_call',id:`call-${i}`,name:'write',arguments:{path:`must-not-exist-${i}`,content:'cancelled before effect'}}))},stopReason:'tool_calls',usage:{status:'unavailable'},identity}]);
 const output=new PassThrough();output.resume();let session;
 await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{output,createNativeAdapter:()=>adapter,createPresentation:write=>{const p=createCompactPresentation(write);return {...p,observe(event){p.observe(event);if(event.type==='tool.started')session.cancel();}};},startTui:async options=>{session=options.session;try{const result=await session.runTask('cancelled batch');assert.equal(result.toolCalls,n);assert.equal(result.status,'cancelled');options.presentation.settle(result);results.push(result);}finally{await session.close();}return 0;}});
 assert.equal(adapter.state.exchangeCount,1);assert.deepEqual(await readdir(workspace),before);
}
const store=await RunArchiveStore.open(memory);const snapshots=await Promise.all(results.map(r=>store.readArchive(r.runId)));
const normalized=snapshots.map(records=>records.map(({runId,...record})=>record));assert.deepEqual(normalized[0],normalized[1]);
await mkdir(join(memory,'runs','corrupt-fixture'));await writeFile(join(memory,'runs','corrupt-fixture','manifest.json'),'invalid manifest');
await writeFile('cancelled-archives.json',JSON.stringify(results,null,2)+'\n');
console.log('PASS installed cancelled batches 2/3, zero tool effects, identical retained records; corrupt fixture added outside sealed archives');
