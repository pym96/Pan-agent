import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {wire} from './test_handoff_support.mjs';
const {PanKimiModelAdapter}=await import(pathToFileURL(process.env.PAN_TEST_ENTRY));
const req=()=>({sessionId:'offline89',signal:new AbortController().signal,context:{systemPrompt:'offline',messages:[{role:'user',content:[{type:'text',text:'task'}],timestamp:0}],tools:[]}});
test('PV89 missing reasoning rejection carries distinguishable structure, never body',async()=>{
 const records=[];const adapter=new PanKimiModelAdapter({modelId:'k3-256k',thinkingLevel:'high'},{diagnostics:true,onStructure:d=>records.push(d),transport:{async send(){return {status:200,body:(async function*(){yield Buffer.from(wire('SYNTHETIC_COMMAND').replace(',"reasoning_content":"synthetic-private"',''));})()};}}});
 const outcome=await adapter.exchange(req());assert.equal(outcome.detail,'kimi_reasoning_missing');assert.equal(records.length,1);assert(records[0].reasoning.missing>0);assert.equal(records[0].reasoning.string,0);assert.equal(records[0].assembledReasoning,false);assert(!JSON.stringify(records).includes('SYNTHETIC_COMMAND'));
});
import {fixture} from './test_handoff_support.mjs';
import {METERED_LIMITS} from './policy.mjs';
import {readFileSync,readdirSync} from 'node:fs';
const kinds=['missing','null','empty','string','invalid'];
const make=(kind)=>wire('ONCE').replace('"reasoning_content":"synthetic-private"',kind==='missing'?'"ignored":true':'"reasoning_content":'+JSON.stringify({null:null,empty:'',string:'PRIVATE_THOUGHT_89',invalid:{secret:'PRIVATE_CANARY_89'}}[kind]));
for(const kind of kinds)for(const chunk of [1,4096])test(`PV89 ${kind} reasoning / byte chunks ${chunk}`,async()=>{
 const seen=[],bytes=Buffer.from(make(kind));const adapter=new PanKimiModelAdapter({modelId:'k3-256k',thinkingLevel:'high'},{diagnostics:true,onStructure:s=>seen.push(s),transport:{async send(){return {status:200,body:(async function*(){for(let i=0;i<bytes.length;i+=chunk)yield bytes.subarray(i,i+chunk);})()};}}});
 const result=await adapter.exchange(req());assert.equal(seen.length,1);const d=seen[0];assert(!JSON.stringify(d).includes('PRIVATE'));assert(!JSON.stringify(d).includes('ONCE'));
 assert.equal(d.reasoning[kind],kind==='missing'?2:1);assert.equal(d.assembledReasoning,['empty','string'].includes(kind));
 assert.equal(result.kind,['empty','string'].includes(kind)?'response':'failure');if(result.kind==='failure')assert.equal(result.detail,kind==='invalid'?'kimi_reasoning_invalid':'kimi_reasoning_missing');
 if(kind!=='invalid'){assert.equal(d.done,1);assert.equal(d.completeTools,1);assert.equal(d.usageParsed,true);}
});
for(const kind of ['empty','string'])test('PV89 installed Session preserves '+kind+' exact continuation and executes once',async()=>{
 let next;
 const r=await fixture({budget:METERED_LIMITS,fetcher:(n,request)=>{if(n===1)return new Response(make(kind));next=JSON.parse(request.body);return new Response(wire());}});
 assert.equal(r.report.agentStatus,'completed');assert.equal(r.report.effects.length,1);const previous=next.messages.find(m=>m.role==='assistant'&&m.tool_calls);assert.equal(previous.reasoning_content,kind==='empty'?'':'PRIVATE_THOUGHT_89');
 const lines=readFileSync(r.root+'/ledger/'+readdirSync(r.root+'/ledger')[0],'utf8').trim().split('\n').map(JSON.parse),diag=lines.filter(x=>x.event==='exchange_completed');assert.equal(diag.length,2);assert.equal(diag[0].structure.assembledReasoning,true);assert.deepEqual(r.report.usage,[{input:10,output:5},{input:10,output:5}]);assert(!JSON.stringify(diag).includes('PRIVATE_THOUGHT_89'));assert.equal(r.report.counts.tools,1);
});
for(const variant of ['missing_done','missing_terminal','partial_arguments','invalid_finish','missing_usage'])test('PV89 incomplete/error '+variant+' cannot execute partial tool',async()=>{
 let body=make('string');if(variant==='missing_done')body=body.replace('data: [DONE]\n\n','');if(variant==='missing_terminal')body=body.replace('"finish_reason":"tool_calls"','"finish_reason":null').replace(/,"usage":\{[^}]+\}/,'');if(variant==='partial_arguments')body=body.replace('ONCE','').replace('\\"timeout\\":2}', '\\"timeout\\":');if(variant==='invalid_finish')body=body.replace('"finish_reason":"tool_calls"','"finish_reason":"PRIVATE_CANARY_89"');if(variant==='missing_usage')body=body.replace(/,"usage":\{[^}]+\}/,'');
 // Bounded mode avoids intentional transient retry on missing DONE; parser path is identical.
 const r=await fixture({fetcher:()=>new Response(body)});assert.equal(r.report.effects.length,0);assert.equal(r.report.verifier,null);const diag=r.report.diagnostics[0];assert(diag.structure);assert(!JSON.stringify(diag).includes('PRIVATE'));assert.equal(r.report.counts.sendEntries,1);assert.equal(r.report.counts.tools,0);
 if(variant==='missing_done')assert.equal(diag.structure.done,0);if(variant==='invalid_finish')assert.equal(diag.structure.finish,'invalid');if(variant==='missing_usage')assert.equal(diag.structure.usageParsed,false);
});
test('PV89 observing or throwing observer never changes outcome',async()=>{
 const run=async(onStructure)=>new PanKimiModelAdapter({modelId:'k3-256k',thinkingLevel:'high'},{onStructure,transport:{async send(){return {status:200,body:(async function*(){yield Buffer.from('data: '+JSON.stringify({object:'chat.completion.chunk',created:1,choices:[{index:0,delta:{content:'OK'},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:2,total_tokens:9}})+'\n\ndata: [DONE]\n\n');})()};}}}).exchange(req());
 assert.deepEqual(await run(()=>{throw Error('sink');}),await run(undefined));
});
test('PV89 multiple reasoning events including null/empty preserve assembly and counts',async()=>{
 const frame=delta=>'data: '+JSON.stringify({object:'chat.completion.chunk',created:1,choices:[{index:0,delta,finish_reason:null}]})+'\n\n';
 const body=frame({reasoning_content:null})+frame({reasoning_content:''})+frame({reasoning_content:'PRIVATE_A'})+make('string');
 const seen=[];let requestBody;let count=0;
 const adapter=new PanKimiModelAdapter({modelId:'k3-256k',thinkingLevel:'high'},{onStructure:d=>seen.push(d),transport:{async send(request){requestBody=JSON.parse(request.body);return {status:200,body:(async function*(){yield Buffer.from(++count===1?body:wire());})()};}}});
 const first=req(),result=await adapter.exchange(first);assert.equal(result.kind,'response');assert.equal(seen[0].reasoning.null,1);assert.equal(seen[0].reasoning.empty,1);assert.equal(seen[0].reasoning.string,2);assert.equal(seen[0].reasoningCharacters,'PRIVATE_APRIVATE_THOUGHT_89'.length);
 const tool=result.message.content.find(c=>c.type==='tool_call');const next={...first,context:{...first.context,messages:[...first.context.messages,result.message,{role:'tool_result',toolCallId:tool.id,toolName:tool.name,content:[{type:'text',text:'ok'}],isError:false,timestamp:2}]}};
 assert.equal((await adapter.exchange(next)).kind,'response');assert.equal(requestBody.messages.find(x=>x.role==='assistant').reasoning_content,'PRIVATE_APRIVATE_THOUGHT_89');assert(!JSON.stringify(seen).includes('PRIVATE'));
});
for(const kind of ['missing','null','invalid'])test('PV89 Session failure '+kind+' retains structure without tool execution',async()=>{
 const r=await fixture({fetcher:()=>new Response(make(kind))});assert.equal(r.report.effects.length,0);assert.equal(r.report.counts.sendEntries,1);assert.equal(r.report.counts.tools,0);assert.equal(r.report.diagnostics[0].structure.reasoning[kind],kind==='missing'?2:1);assert.deepEqual(r.report.usage,[null]);assert(!JSON.stringify(r.report).includes('PRIVATE'));
});
