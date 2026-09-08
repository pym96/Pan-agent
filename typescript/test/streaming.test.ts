import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as tick } from "node:timers/promises";
import { PanDeepSeekModelAdapter, DeepSeekFetchTransport, FauxModelAdapter, GeneralAgentSession, RunArchiveStore, createCompactPresentation } from "../src/index.ts";
import type { ModelExchangeRequest, ModelOutcome, ModelTextDelta, SessionProgress, SessionObservation } from "../src/index.ts";
import { terminalText } from "../src/tui/presentation.ts";
import { createPanTrustedLocalTools } from "../src/tools/pan-trusted-local-tools.ts";
const enc = new TextEncoder();
const identity = { provider: { status:"reported" as const, value:"pan-faux" }, model: { status:"reported" as const, value:"pan-faux-v1" }, responseId:{status:"unavailable" as const} };
const response = (text:string):ModelOutcome => ({kind:"response",message:{role:"assistant",content:[{type:"text",text}],timestamp:0},stopReason:"stop",identity,usage:{status:"unavailable"}});
const request = (signal = new AbortController().signal):ModelExchangeRequest => ({sessionId:"stream-test",signal,context:{systemPrompt:"offline",messages:[{role:"user",content:[{type:"text",text:"中文 task"}],timestamp:0}],tools:[]}});
const event = (delta:Record<string,unknown>, finish:string|null = null, extra:Record<string,unknown> = {}) => `data: ${JSON.stringify({id:"stream-1",object:"chat.completion.chunk",created:1,model:"deepseek-v4-flash",choices:[{index:0,delta,finish_reason:finish}],usage:finish?{prompt_tokens:3,completion_tokens:4,prompt_cache_hit_tokens:0,total_tokens:7}:null,...extra})}\n\n`;
const end = event({},"stop") + "data: [DONE]\n\n";
const wire = (texts:readonly string[]) => texts.map(content=>event({content})).join("")+end;
function deferred<T=void>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
function direct(parts:readonly Uint8Array[]) { return new PanDeepSeekModelAdapter(undefined,{transport:{async send(){return {status:200,body:(async function*(){yield* parts;})()};}}}); }

// Each finite partition is an algorithmic invariant, never a wall-clock target.
test("C-STR-01 same production decoder exposes text before source release and preserves every byte partition", {timeout:30000}, async()=>{
 const first=event({content:"Hello, "}), rest=wire(["世界","!\n"]); const gate=deferred(), seen=deferred();let settled=false, released=false;
 const adapter=new PanDeepSeekModelAdapter(undefined,{transport:{async send(){return {status:200,body:(async function*(){yield enc.encode(first);await gate.promise;released=true;yield enc.encode(rest);})()};}}});
 const deltas:ModelTextDelta[]=[];const pending=adapter.exchange({...request(),onProgress:e=>{deltas.push(e);seen.resolve();}}).then(value=>{settled=true;return value;});
 await seen.promise;assert.equal(released,false);assert.equal(settled,false);assert.deepEqual(deltas,[{type:"text_delta",text:"Hello, "}]);gate.resolve();const baseline=await pending;
 assert.equal(deltas.map(e=>e.text).join(""),"Hello, 世界!\n");assert.equal(baseline.kind,"response");assert.deepEqual(baseline.usage,{status:"reported",value:{input:3,output:4,cacheRead:0,totalTokens:7}});
 const bytes=enc.encode(first+rest);const partitions=[Array.from(bytes,b=>Uint8Array.of(b)),[bytes],...Array.from({length:bytes.length+1},(_,i)=>[bytes.slice(0,i),bytes.slice(i)])];
 for(const parts of partitions){const progress:ModelTextDelta[]=[];const actual=await direct(parts).exchange({...request(),onProgress:e=>progress.push(e)});assert.deepEqual(actual,baseline);assert.equal(progress.map(e=>e.text).join(""),"Hello, 世界!\n");assert.deepEqual(await direct(parts).exchange(request()),baseline);}
});

test("C-STR-03 blocked Fetch reader cancels without EOF; pre-abort and late source are inert", {timeout:10000}, async()=>{
 let sends=0, syntheticCredentials=0, cleanup=0;let source!:ReadableStreamDefaultController<Uint8Array>;const seen=deferred();const controller=new AbortController();const progress:ModelTextDelta[]=[];
 const adapter=new PanDeepSeekModelAdapter(undefined,{transport:new DeepSeekFetchTransport({credentialSource:()=>{syntheticCredentials++;return "synthetic";},fetchImplementation:async()=>{sends++;return new Response(new ReadableStream<Uint8Array>({start(c){source=c;c.enqueue(enc.encode(event({content:"Hello, "})));},cancel(){cleanup++;}}));}})});
 const pre=new AbortController();pre.abort();const preOutcome=await adapter.exchange(request(pre.signal));assert.equal(preOutcome.kind,"failure");assert.equal(sends,0);assert.equal(syntheticCredentials,0);
 const pending=adapter.exchange({...request(controller.signal),onProgress:e=>{progress.push(e);seen.resolve();}});await seen.promise;controller.abort();const result=await pending;
 assert.equal(result.kind,"failure");if(result.kind==="failure")assert.equal(result.category,"cancelled");assert.equal(cleanup,1);assert.equal(sends,1);assert.equal(syntheticCredentials,1);
 assert.throws(()=>source.enqueue(enc.encode(wire(["LATE"]))));await tick();assert.equal(progress.length,1);
});

test("C-STR-01/03 Faux uses the same sink with a cancellable blocked producer", {timeout:10000}, async()=>{
 const gate=deferred(),seen=deferred();let returned=0;const controller=new AbortController();const progress:ModelTextDelta[]=[];
 const adapter=new FauxModelAdapter([response("Hello, 世界!\n"),response("next")],{progress:()=>({[Symbol.asyncIterator](){let n=0;return {async next(){if(n++===0)return {done:false,value:"Hello, "};await gate.promise;return {done:false,value:"LATE"};},async return(){returned++;return {done:true,value:undefined};}};}})});
 const pending=adapter.exchange({...request(controller.signal),onProgress:e=>{progress.push(e);seen.resolve();}});await seen.promise;assert.equal(adapter.state.exchangeCount,1);controller.abort();const outcome=await pending;assert.equal(outcome.kind,"failure");assert.equal(returned,1);gate.resolve();await tick();assert.equal(progress.length,1);
});

test("C-STR-05 public visibility and reversible Unicode/control encoding survive all byte and delta splits", {timeout:30000}, async()=>{
 const controls=Array.from({length:32},(_,i)=>String.fromCodePoint(i)).join("")+Array.from({length:33},(_,i)=>String.fromCodePoint(127+i)).join("")+"\x1b[2J\x1b]52;c;YQ==\x07\rYou > \b\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u2028\u2029";
 const text="正常中文🙂\\backslash\n"+controls+"\nCompleted";
 const hidden={reasoning_content:"HIDDEN_REASON",thinking:"HIDDEN_THINK",authorization:"HIDDEN_AUTH",api_key:"HIDDEN_KEY",unknown:"HIDDEN_UNKNOWN"};
 const bytes=enc.encode(event({content:text,...hidden},null,hidden)+end);const baseline=await direct([bytes]).exchange(request());
 for(let i=0;i<=bytes.length;i++){const events:ModelTextDelta[]=[];const actual=await direct([bytes.slice(0,i),bytes.slice(i)]).exchange({...request(),onProgress:e=>events.push(e)});assert.deepEqual(actual,baseline);assert.deepEqual(events,[{type:"text_delta",text}]);assert.doesNotMatch(JSON.stringify(events),/HIDDEN_/);}
 for(let i=0;i<=text.length;i++){
  let output="";const view=createCompactPresentation();view.attach(line=>{output+=line+"\n";},undefined,fragment=>{output+=fragment;});
  view.observe({type:"run.started",runId:"r",task:"中文",timestamp:0} as SessionObservation);view.observe({type:"model.turn_started",runId:"r",turn:1,timestamp:0} as SessionObservation);
  for(const part of [text.slice(0,i),text.slice(i)])view.progress?.({type:"text_delta",runId:"r",turn:1,text:part});
  view.observe({type:"model.turn_settled",runId:"r",turn:1,text,stopReason:"stop",identity,usage:{status:"unavailable"}} as SessionObservation);
  assert.ok(output.includes(text.split("\n").map(line=>"│ "+terminalText(line)).join("\n")),String(i));assert.doesNotMatch(output,/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufffd]/);
 }
 const escaped=wire(["\ud83d","\ude42"]);const parts:ModelTextDelta[]=[];const result=await direct([enc.encode(escaped)]).exchange({...request(),onProgress:e=>parts.push(e)});assert.equal(parts.map(e=>e.text).join(""),"🙂");assert.equal(result.kind,"response");
});

test("C-STR-02 late malformed protocol never turns a preview into an accepted response", async()=>{
 const prefix=event({content:"provisional"});const cases=[prefix,prefix+"data: {\n\n",prefix+event({},"stop",{id:"changed"})+"data: [DONE]\n\n",prefix+end+"data: [DONE]\n\n",prefix+event({tool_calls:[{index:0,id:"c",type:"function",function:{name:"write",arguments:'{"path":'}}]},"tool_calls")+"data: [DONE]\n\n"];
 for(const body of cases){const observed:ModelTextDelta[]=[];const enabled=await direct([enc.encode(body)]).exchange({...request(),onProgress:e=>observed.push(e)});const omitted=await direct([enc.encode(body)]).exchange(request());assert.deepEqual(enabled,omitted);assert.equal(enabled.kind,"failure");assert.equal(observed[0]?.text,"provisional");}
});

test("C-STR-03/06 throwing observer and malicious late callback cannot affect terminal or archive", {timeout:10000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),"wo44-observer-"));try {
 const workspace=join(root,"workspace");await mkdir(workspace);const store=await RunArchiveStore.open(join(root,"memory"));let late:ModelExchangeRequest["onProgress"],diagnostics=0,progress=0;const observations:SessionObservation[]=[];
 const delegate=new FauxModelAdapter([response("accepted"),response("next")]);const adapter={providerId:delegate.providerId,modelId:delegate.modelId,reasoningLevel:delegate.reasoningLevel,async exchange(req:ModelExchangeRequest){late=req.onProgress;req.onProgress?.({type:"text_delta",text:"accepted",authorization:"HIDDEN_AUTH"} as ModelTextDelta);return delegate.exchange(req);}};
 const session=new GeneralAgentSession({kernel:"native",adapter,tools:createPanTrustedLocalTools(workspace).tools,systemPrompt:"fixed",memory:{archiveStore:store,runbook:async()=>({content:"fixed",revision:`sha256:${"3".repeat(64)}`})},onObservation:e=>{observations.push(e);},onProgress:e=>{progress++;assert.deepEqual(Object.keys(e).sort(),["runId","text","turn","type"]);throw new Error("HIDDEN_DIAGNOSTIC");},onProgressError:()=>{diagnostics++;}});
 const first=await session.runTask("first");assert.equal(first.status,"completed");assert.equal(first.archiveSealed,true);late?.({type:"text_delta",text:"LATE"});assert.equal(progress,1);assert.equal(diagnostics,1);
 const second=await session.runTask("next");assert.equal(second.status,"completed");assert.equal(delegate.state.exchangeCount,2);assert.equal(diagnostics,2);assert.equal(observations.filter(e=>e.type==="run.terminal").length,2);
 const archive=await store.readArchive(first.runId);assert.doesNotMatch(JSON.stringify(archive),/text_delta|HIDDEN_|LATE|archive_error/);assert.equal(archive.filter(e=>e.type==="run.terminal").length,1);await session.close();
 } finally {await rm(root,{recursive:true,force:true});}
});

test("C-STR-04 streamed settlement, fallback and later failed preview have distinct complete bodies", async()=>{
 const root=await mkdtemp(join(tmpdir(),"wo44-display-"));try {
 for(const mode of ["stream","omitted","length","failure","private"]){
 let output="";const view=createCompactPresentation();view.attach(line=>{output+=line+"\n";},undefined,fragment=>{output+=fragment;});
 const complete=response(mode==="private"?"":"Hello, 世界!\n");if(mode==="length"&&complete.kind==="response")(complete as {stopReason:string}).stopReason="length";
 const script=mode==="failure"?[{kind:"failure" as const,category:"transport" as const,detail:"safe_failure",retryable:false,identity,usage:{status:"unavailable" as const}}]:[complete];
 const adapter=new FauxModelAdapter(script,mode==="omitted"||mode==="private"?{}:{progress:()=> (async function*(){yield "Hello, ";yield "世界";yield "!\n";})()});
 const workspace=join(root,mode);await mkdir(workspace);const store=await RunArchiveStore.open(join(root,mode+"-memory"));const session=new GeneralAgentSession({kernel:"native",adapter,tools:[],systemPrompt:"fixed",memory:{archiveStore:store,runbook:async()=>({content:"fixed",revision:`sha256:${"3".repeat(64)}`})},onObservation:e=>view.observe(e),onProgress:e=>view.progress?.(e)});
 const result=await session.runTask("中文 task");view.settle(result);assert.equal(output.split("Hello, 世界!").length-1,mode==="private"?0:1);if(mode==="failure"||mode==="length")assert.match(output,/Partial response — interrupted/);if(mode==="stream")assert.match(output,/Responding… \(provisional\)[\s\S]*Completed/);if(mode==="omitted")assert.match(output,/Final answer/);if(mode==="private")assert.doesNotMatch(output,/Responding/);
 const archive=await store.readArchive(result.runId);output="";view.replay(archive as unknown as Record<string,unknown>[],result.runId);assert.match(output,/Transient previews are not recorded/);assert.match(output,/Model calls unavailable \(not recorded\)/);if(mode==="failure")assert.doesNotMatch(output,/Hello, 世界/);await session.close();
 }
 }finally{await rm(root,{recursive:true,force:true});}
});

test("C-STR-03 progress closes before failed settlement observation awaits", {timeout:10000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),"wo44-late-"));try {
 let callback:ModelExchangeRequest["onProgress"],seen=0;
 const adapter={providerId:"offline",modelId:"offline",reasoningLevel:"off",async exchange(req:ModelExchangeRequest):Promise<ModelOutcome>{callback=req.onProgress;req.onProgress?.({type:"text_delta",text:"preview"});throw new Error("offline_rejection");}};
 const session=new GeneralAgentSession({kernel:"native",adapter,tools:[],systemPrompt:"fixed",memory:{archiveStore:await RunArchiveStore.open(root),runbook:async()=>({content:"fixed",revision:`sha256:${"3".repeat(64)}`})},onProgress:()=>{seen++;},onObservation:async e=>{if(e.type==="model.turn_settled"){await tick();callback?.({type:"text_delta",text:"LATE"});}}});
 const result=await session.runTask("first");assert.equal(result.status,"model_error");assert.equal(seen,1);await session.close();
 } finally{await rm(root,{recursive:true,force:true});}
});

test("C-STR-04 later failed preview stays distinct from an earlier accepted tool turn", async()=>{
 const root=await mkdtemp(join(tmpdir(),"wo44-prior-"));try {
 const first:ModelOutcome={kind:"response",message:{role:"assistant",timestamp:0,content:[{type:"text",text:"accepted earlier turn"},{type:"tool_call",id:"missing",name:"read",arguments:{path:"absent"}}]},stopReason:"tool_calls",identity,usage:{status:"unavailable"}};
 const adapter=new FauxModelAdapter([first,{kind:"failure",category:"transport",detail:"offline_broken",retryable:false,identity,usage:{status:"unavailable"}}],{progress:async function*(index){yield index===0?"accepted earlier turn":"uncommitted later preview";}});
 let output="";const view=createCompactPresentation();view.attach(line=>{output+=line+"\n";},undefined,part=>{output+=part;});
 const store=await RunArchiveStore.open(join(root,"memory"));const session=new GeneralAgentSession({kernel:"native",adapter,tools:createPanTrustedLocalTools(root).tools,systemPrompt:"fixed",memory:{archiveStore:store,runbook:async()=>({content:"fixed",revision:`sha256:${"3".repeat(64)}`})},onObservation:e=>view.observe(e),onProgress:e=>view.progress?.(e)});
 const result=await session.runTask("read missing");view.settle(result);assert.equal(result.status,"model_error");assert.equal(result.finalText,"accepted earlier turn");assert.equal(output.split("accepted earlier turn").length-1,1);assert.equal(output.split("uncommitted later preview").length-1,1);assert.match(output,/Partial response — interrupted/);assert.match(output,/Tool results 1/);
 const archive=await store.readArchive(result.runId);assert.doesNotMatch(JSON.stringify(archive),/uncommitted later preview/);assert.match(JSON.stringify(archive),/accepted earlier turn/);view.details();assert.match(output,/Transient unfinished preview \(not archived\)/);await session.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
