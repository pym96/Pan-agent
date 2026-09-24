import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Message,ModelExchangeRequest,KimiTransportRequest} from '../src/index.ts';
const api=await import(process.env.PAN_TEST_ENTRY?pathToFileURL(process.env.PAN_TEST_ENTRY).href:new URL('../src/index.ts',import.meta.url).href);
const profile={modelId:'k3-256k',thinkingLevel:'high'} as const;
const field=(kind:string):Record<string,unknown>=>kind==='missing'?{}:{reasoning_content:({null:null,empty:'',string:'SYNTHETIC_PRIVATE_94',invalid:[],object:{bad:true},number:1,boolean:false} as Record<string,unknown>)[kind]};
const frame=(delta:unknown,finish:string|null=null)=>'data: '+JSON.stringify({object:'chat.completion.chunk',created:1,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n';
function wire(kind:string,turn:number,variant='valid'){
 if(turn===3)return frame({role:'assistant',content:'DONE'},'stop')+'data: [DONE]\n\n';
 const tool={index:0,id:'call-'+turn,type:'function',function:{name:'record',arguments:JSON.stringify({n:turn})}};
 if(variant==='incomplete')tool.function.name='';
 if(variant==='arguments')tool.function.arguments='{';
 const calls=[tool];if(variant==='duplicate')calls.push({...tool,index:1});
 return frame({role:'assistant',...field(kind)})+frame({tool_calls:calls},'tool_calls')+'data: [DONE]\n\n';
}
async function make(kind:string,variant='valid'){
 const requests:Record<string,any>[]=[];const observed:Record<string,any>[]=[];const effects:number[]=[];
 const adapter=new api.PanKimiModelAdapter(profile,{onStructure:(s:Record<string,any>)=>observed.push(s),transport:{async send(r:KimiTransportRequest){requests.push(JSON.parse(r.body));const bytes=Buffer.from(wire(kind,requests.length,variant));return {status:200,body:(async function*(){for(let i=0;i<bytes.length;i+=7)yield bytes.subarray(i,i+7);})()};}}});
 const root=await mkdtemp(join(tmpdir(),'kimi94-'));const archiveStore=await api.RunArchiveStore.open(root);const runbook=await api.loadRunbook(new URL('../RUNBOOK.md',import.meta.url).pathname);
 const session=new api.GeneralAgentSession({kernel:'native',adapter,systemPrompt:'offline',tools:[{name:'record',description:'synthetic',parameters:{type:'object',properties:{n:{type:'integer'}},required:['n']},validate:(value:any)=>({ok:true,value}),execute:async(invocation:{arguments:{n:number}})=>{effects.push(invocation.arguments.n);return {content:[{type:'text',text:'RESULT-'+invocation.arguments.n}]};}}],memory:{archiveStore,runbook:async()=>runbook},cleanup:()=>adapter.dispose()});
 return {requests,observed,effects,session,archiveStore};
}
for(const kind of ['missing','null','empty','string'])test('KCONT94 full Session two tool rounds then final: '+kind,async()=>{
 const f=await make(kind);try{
 const result=await f.session.runTask('synthetic');assert.equal(result.status,'completed');assert.deepEqual(f.effects,[1,2]);assert.equal(f.requests.length,3);
 for(let i=1;i<3;i++){
  const messages=f.requests[i]!.messages;const assistants=messages.filter((m:any)=>m.role==='assistant');const tools=messages.filter((m:any)=>m.role==='tool');assert.equal(assistants.length,i);assert.equal(tools.length,i);
  for(let j=0;j<i;j++){
   assert.equal(assistants[j].tool_calls[0].id,'call-'+(j+1));assert.equal(tools[j].tool_call_id,'call-'+(j+1));assert.equal(tools[j].content,'RESULT-'+(j+1));
   assert.equal(Object.hasOwn(assistants[j],'reasoning_content'),kind==='empty'||kind==='string');
   if(kind==='empty'||kind==='string')assert.equal(assistants[j].reasoning_content,kind==='empty'?'':'SYNTHETIC_PRIVATE_94');
  }
 }
 assert.equal(f.observed[0]!.reasoning[kind],kind==='missing'?2:1);assert.equal(f.observed[0]!.assembledReasoning,kind==='empty'||kind==='string');
 const records=await f.archiveStore.readArchive(result.runId);assert.equal(records.filter((x:any)=>x.type==='tool.started').length,2);assert(!JSON.stringify(records).includes('SYNTHETIC_PRIVATE_94'));assert(!JSON.stringify(f.observed).includes('SYNTHETIC_PRIVATE_94'));assert.equal(f.observed[0]!.usageParsed,false);
 }finally{await f.session.close();}
});
for(const kind of ['invalid','object','number','boolean'])test('KCONT94 rejects non-string reasoning before tool: '+kind,async()=>{
 const f=await make(kind);try{const r=await f.session.runTask('synthetic');assert.equal(r.status,'model_error');assert.equal(r.reason,'kimi_reasoning_invalid');assert.deepEqual(f.effects,[]);assert.equal(f.requests.length,1);}finally{await f.session.close();}
});
for(const variant of ['incomplete','arguments','duplicate'])test('KCONT94 missing reasoning does not bypass tool validation: '+variant,async()=>{
 const f=await make('missing',variant);try{const r=await f.session.runTask('synthetic');assert.equal(r.status,'model_error');assert.deepEqual(f.effects,[]);assert.equal(f.requests.length,1);}finally{await f.session.close();}
});
test('KCONT94 absent continuation remains lineage-bound; wrong session/copy/result cannot send',async()=>{
 const requests:unknown[]=[];const adapter=new api.PanKimiModelAdapter(profile,{transport:{async send(r:unknown){requests.push(r);return{status:200,body:(async function*(){yield Buffer.from(wire('missing',1));})()};}}});
 const original:ModelExchangeRequest={sessionId:'origin',signal:new AbortController().signal,context:{systemPrompt:'offline',tools:[],messages:[{role:'user',content:[{type:'text',text:'task'}],timestamp:0}]}};
 const first=await adapter.exchange(original);assert.equal(first.kind,'response');
 const tool:Message={role:'tool_result',toolCallId:'call-1',toolName:'record',content:[{type:'text',text:'RESULT-1'}],isError:false,timestamp:2};
 const messages=[...original.context.messages,first.message,tool];
 for(const request of [{...original,sessionId:'foreign',context:{...original.context,messages}},{...original,context:{...original.context,messages:structuredClone(messages)}},{...original,context:{...original.context,messages:[...messages.slice(0,-1),{...tool,toolCallId:'wrong'}]}}]){
  assert.equal((await adapter.exchange(request)).kind,'failure');assert.equal(requests.length,1);
 }
 adapter.dispose();
});
