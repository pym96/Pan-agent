import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeKernel} from '../src/runtime/native-kernel.ts';
import {CheckpointFauxAdapter} from '../src/providers/faux/checkpoint-faux.ts';
import type {NativeCheckpoint} from '../src/runtime/checkpoint.ts';
import {response,call,emptyParameters} from './pan-fixture.ts';
import type {AgentTool} from '../src/protocol/agent-tool.ts';
const request={runId:'first',task:'one task',systemPrompt:'test',onObservation:()=>{}};
const limits={maxModelTurns:10,maxToolSteps:10};
function fixture(two=false){let effects=0;const tool:AgentTool={name:'record',description:'record',parameters:emptyParameters,validate:()=>({ok:true,value:{}}),execute:async()=>{effects++;return {content:[{type:'text',text:'settled'}]}}};const adapter=()=>new CheckpointFauxAdapter('fixture-v1',async(_r,i)=>i===0?response([call('record',{}, {id:'one'}),...(two?[call('record',{}, {id:'two'})]:[])],{stopReason:'tool_calls'}):response('done'),'private-canary');return {tool,adapter,effects:()=>effects}}
test('checkpoint resumes correlations and counters without another user or tool effect',async()=>{
 const f=fixture();let saved:NativeCheckpoint|undefined;let valid=false;let first!:NativeKernel;
 first=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{valid=false},commit:async c=>{saved=structuredClone(c);valid=true;first.cancel()}}});
 await first.runTask(request);assert.ok(saved);assert.equal(valid,true);assert.equal(f.effects(),1);
 const a=f.adapter();const resumed=new NativeKernel({adapter:a,tools:[f.tool],limits,checkpoint:{invalidate:async()=>{valid=false},commit:async()=>{throw Error('unexpected')}}});
 const result=await resumed.resumeTask({...request,runId:'second'},JSON.parse(JSON.stringify(saved)));
 assert.equal(result.status,'completed');assert.equal(result.modelCalls,2);assert.equal(result.toolCalls,1);assert.equal(f.effects(),1);assert.equal(a.didRestore,true);assert.equal(valid,false);assert.equal(resumed.contextMessageCount,4);
});
test('partial multi-tool round never commits; persistence failure prevents next exchange',async()=>{
 const f=fixture(true);let commits=0;let k!:NativeKernel;
 k=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{commits++}}});
 const r=await k.runTask({...request,onObservation:e=>{if(e.type==='tool.settled')k.cancel()}});assert.equal(r.status,'cancelled');assert.equal(commits,0);assert.equal(f.effects(),1);
 const other=fixture();const failed=new NativeKernel({adapter:other.adapter(),tools:[other.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{throw Error('disk unavailable')}}});
 const x=await failed.runTask(request);assert.equal(x.status,'model_error');assert.equal(x.modelCalls,1);assert.equal(other.effects(),1);
});
test('unsupported adapter and corrupt checkpoint fail before model/tool sends',async()=>{
 let sends=0;assert.throws(()=>new NativeKernel({adapter:{providerId:'kimi',modelId:'test',reasoningLevel:'off',exchange:async()=>{sends++;return response('bad')}},tools:[],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{}}}),/unsupported/);assert.equal(sends,0);
 const f=fixture();let saved:NativeCheckpoint|undefined;let k!:NativeKernel;k=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async c=>{saved=c;k.cancel()}}});await k.runTask(request);assert.ok(saved);
 for(const corrupt of [{...saved,version:2},{...saved,providerState:{}},{...saved,systemPrompt:'changed'},{...saved,messages:saved.messages.slice(0,-1)}]){
 const n=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{}}});await assert.rejects(n.resumeTask(request,corrupt as NativeCheckpoint));assert.equal(f.effects(),1);
 }
});
test('pending barrier resumes exactly one authorized tool without repeating the model response',async()=>{
 const f=fixture();let saved!:NativeCheckpoint;
 const k=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{},pending:async c=>{saved=structuredClone(c);throw Error('crash before dispatch')}}});
 const first=await k.runTask(request);assert.equal(first.status,'model_error');assert.equal(f.effects(),0);assert.equal(saved.next,'pending_tool');assert.equal(saved.version,2);
 const next=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{},pending:async()=>{}}});
 const result=await next.resumeTask({...request,runId:'new'}, {...saved,resolution:{kind:'not_started'}});assert.equal(result.status,'completed');assert.equal(result.modelCalls,2);assert.equal(result.toolCalls,1);assert.equal(f.effects(),1);
});
test('completed pending result, including errors, is imported unchanged with zero repeated effects',async()=>{
 const f=fixture();let saved!:NativeCheckpoint;
 const k=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{},pending:async c=>{saved=structuredClone(c);throw Error('crash')}}});await k.runTask(request);
 for(const isError of [false,true]){
  const observations: string[]=[];const result={role:'tool_result' as const,toolCallId:'one',toolName:'record',content:[{type:'text' as const,text:'original exit=7'}],isError,timestamp:1};let received:unknown;
  const adapter=new CheckpointFauxAdapter('fixture-v1',async r=>{received=r.context.messages.at(-1);return response('done')},'private-canary');
  const n=new NativeKernel({adapter,tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{},pending:async()=>{}}});assert.equal((await n.resumeTask({...request,onObservation:e=>{observations.push(e.type)}},{...saved,resolution:{kind:'completed',result}})).status,'completed');assert.deepEqual(received,result);assert.equal(f.effects(),0);assert(!observations.some(t=>t.startsWith('tool.')));
 }
 const n=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{},pending:async()=>{}}});await assert.rejects(n.resumeTask(request,saved),/pending_invalid/);assert.equal(f.effects(),0);
});
test('receipt persistence failure prevents subsequent exchange; multi-tool partial remains unsupported',async()=>{
 const f=fixture();const k=new NativeKernel({adapter:f.adapter(),tools:[f.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{throw Error('unexpected')},pending:async()=>{},settled:async()=>{throw Error('receipt unknown')}}});const r=await k.runTask(request);assert.equal(r.modelCalls,1);assert.equal(r.status,'model_error');assert.equal(f.effects(),1);
 const multi=fixture(true);let pending=0;let m!:NativeKernel;m=new NativeKernel({adapter:multi.adapter(),tools:[multi.tool],limits,checkpoint:{invalidate:async()=>{},commit:async()=>{},pending:async()=>{pending++}}});await m.runTask({...request,onObservation:e=>{if(e.type==='tool.settled')m.cancel()}});assert.equal(pending,0);assert.equal(multi.effects(),1);
});
