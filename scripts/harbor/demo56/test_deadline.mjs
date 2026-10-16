import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {agentDeadline} from './deadline.mjs';
const base=resolve(process.argv[2],'../..');
const {NativeKernel}=await import(pathToFileURL(base+'/dist/runtime/native-kernel.js'));
const {SessionAuthorization}=await import(pathToFileURL(base+'/dist/runtime/authorization.js'));
const unknown={status:'unavailable'},identity={provider:unknown,model:unknown,responseId:unknown,backendFingerprint:unknown};
const results=[];
for(const mode of ['model_wait','tool_wait','approval_wait']){
 const order=[];let calls=0,effects=0;
 const authority=new SessionAuthorization({approval:async(request,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
 const rawTool={name:'bash',description:'offline probe',parameters:{type:'object'},validate:x=>({ok:true,value:x}),async execute(invocation){
  if(mode==='approval_wait')return await (await import(pathToFileURL(base+'/dist/runtime/authorization.js'))).invocationAuthority().authorize('/probe','bash',invocation.toolCallId,invocation.arguments,'fixed',invocation.signal);
  await new Promise(r=>setTimeout(r,70));order.push('tool_drained');effects++;return {content:[{type:'text',text:'completed before verification'}],isError:false};
 }};
 const tool=mode==='approval_wait'?authority.wrap(rawTool,()=> 'probe'):rawTool;
 const adapter={providerId:'offline',modelId:'offline',reasoningLevel:'off',async exchange({signal}){
  calls++;
  if(mode==='model_wait')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  return {kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'tool_call',id:'probe-call',name:'bash',arguments:{command:'offline'}}]},stopReason:'tool_calls',usage:unknown,identity};
 }};
 const kernel=new NativeKernel({adapter,tools:[tool],limits:{maxModelTurns:64,maxToolSteps:null}});
 const clear=agentDeadline({timeoutMs:20,graceMs:300,onTimeout:()=>order.push('deadline'),cancel:()=>kernel.cancel(),onUnconfirmed:()=>{throw Error('stop grace exceeded');}});
 const result=await kernel.runTask({runId:'probe',task:'offline',systemPrompt:'offline',onObservation:()=>{}});clear();
 assert.equal(result.status,'cancelled',JSON.stringify(result));assert.equal(kernel.isRunning,false);order.push('agent_stopped');order.push('verify');order.push('cleanup');
 assert.equal(calls,1);if(mode==='tool_wait')assert(order.indexOf('tool_drained')<order.indexOf('verify'));else assert.equal(effects,0);
 results.push({mode,passed:true,order,calls,effects});await kernel.close();
}
console.log(JSON.stringify({passed:true,realProviderCalls:0,installedNativeKernel:true,results}));
