import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { PanKimiModelAdapter, KimiFetchTransport, GeneralAgentSession, RunArchiveStore, loadRunbook, runCli, loadPanSettings } from "../src/index.ts";
import type { ModelExchangeRequest, Message, ModelResponse, KimiProfile, KimiTransportRequest } from "../src/index.ts";
const fixture = JSON.parse(await readFile(new URL('../../scripts/fixtures/kimi/kimi-k3-wire-v1.json', import.meta.url), 'utf8')) as {valid:{name:string;wire:string}[]};
const wire = (name: string) => fixture.valid.find(row => row.name === name)!.wire;
const profile = { modelId: 'k3-256k', thinkingLevel: 'high' } as const;
const req = (messages: readonly Message[] = [{role:'user',content:[{type:'text',text:'task'}],timestamp:0}], sessionId = 's'): ModelExchangeRequest => ({sessionId,signal:new AbortController().signal,context:{systemPrompt:'offline',messages,tools:[]}});
function fake(parts: Uint8Array[], captures: KimiTransportRequest[] = []) {
 return new PanKimiModelAdapter(profile,{transport:{async send(request){captures.push(request);return {status:200,body:(async function*(){yield* parts;})()};}}});
}
const bytes = (text: string) => [Buffer.from(text)];
const results = (message: ModelResponse['message']): Message[] => message.content.flatMap(block => block.type === 'tool_call' ? [{role:'tool_result' as const,toolCallId:block.id,toolName:block.name,content:[{type:'text' as const,text:'read result'}],isError:false,timestamp:2}] : []);

test('C-K3-01 closed profiles, explicit wizard low/high/max and legacy identity', async () => {
 for (const bad of [{modelId:'k3'}, {modelId:'k3-256k',thinkingLevel:'none'}, {modelId:'k3-256k'}, {...profile,endpoint:'https://invalid'}, {modelId:'kimi-for-coding',thinkingLevel:'high'}]) {
  assert.throws(()=>new PanKimiModelAdapter(bad as KimiProfile),/kimi_profile_unsupported/);
 }
 for (const effort of ['low','high','max','']) {
  const home=await mkdtemp(join(tmpdir(),'k3-config-'));const input=new PassThrough();const output=new PassThrough();let writes=0;
  const done=runCli(['configure'],{home,input,output,saveCredential:()=>{writes++;}});
  input.end(`kimi-code:k3-256k\n${effort}\nenvironment\n`);
  assert.equal(await done,0);const settings=await loadPanSettings(home);
  assert.equal(settings?.modelId,'k3-256k');assert.equal(settings?.thinkingLevel,effort||'high');assert.equal(writes,0);
 }
 const legacy=new PanKimiModelAdapter();assert.equal(legacy.modelId,'kimi-for-coding');assert.equal(legacy.reasoningLevel,'off');
});

test('C-K3-02 all byte boundaries of every valid frozen fixture; private exact continuation', async () => {
 for (const row of fixture.valid) {
  const data=Buffer.from(row.wire);const baseRequest=req();const expected=await fake([data]).exchange(baseRequest);
  assert.equal(expected.kind,'response',row.name);
  for (const chunks of [[...data].map(b=>Uint8Array.of(b)), ...Array.from({length:data.length+1},(_,i)=>[data.subarray(0,i),data.subarray(i)])]) {
   const captured: KimiTransportRequest[]=[];const adapter=fake(chunks,captured);let progress='';
   const outcome=await adapter.exchange({...baseRequest,onProgress:d=>{progress+=d.text;}});
   assert.deepEqual(outcome,expected);assert.ok(!progress.includes('PRIVATE'));
   assert.equal(JSON.parse(captured[0]!.body).reasoning_effort,'high');
   if (outcome.kind!=='response') throw new Error('required response');
   const next=req([...baseRequest.context.messages,outcome.message,...results(outcome.message)]);
   await adapter.exchange(next);
   assert.equal(captured.length,2);const prior=JSON.parse(captured[1]!.body).messages[2];
   assert.equal(prior.reasoning_content,row.name==='single'?'PRIVATE-K3-思考-片0':row.name==='multiple'?'PRIVATE-K3-思考-片0片1':'PRIVATE-FINAL');
   assert.ok(!JSON.stringify(outcome).includes('PRIVATE'));
  }
 }
});

test('C-K3-02 tampered, copied, sliced and foreign-session histories refuse before transport', async () => {
 const captured: KimiTransportRequest[]=[];const adapter=fake(bytes(wire('single')),captured);const first=req();
 const outcome=await adapter.exchange(first);assert.equal(outcome.kind,'response');if(outcome.kind!=='response')return;
 const messages=[...first.context.messages,outcome.message,...results(outcome.message)];
 const assertRefused=async (request:ModelExchangeRequest, selected=adapter) => {
  const before=captured.length;const result=await selected.exchange(request);assert.equal(result.kind,'failure');assert.equal(captured.length,before);
 };
 await assertRefused(req(structuredClone(messages)));
 await assertRefused(req(messages,'foreign'));
 await assertRefused(req(messages.slice(1)));
 await assertRefused(req(messages),fake(bytes(wire('final')),captured));
 (first.context.messages[0]!.content[0] as {text:string}).text='altered';await assertRefused(req(messages));
 (first.context.messages[0]!.content[0] as {text:string}).text='task';
 (outcome.message.content[0] as {text:string}).text='altered';await assertRefused(req(messages));
});

test('C-K3-02 identical visible messages never borrow private reasoning across sessions or profiles', async () => {
 const a=fake(bytes(wire('single')));const captures:KimiTransportRequest[]=[];
 const b=fake(bytes(wire('single').replace('PRIVATE-K3','PRIVATE-OTHER')),captures);
 const ra=req(undefined,'a'),rb=req(undefined,'b');const oa=await a.exchange(ra),ob=await b.exchange(rb);
 assert.equal(oa.kind,'response');assert.equal(ob.kind,'response');if(oa.kind!=='response'||ob.kind!=='response')return;
 assert.deepEqual(oa,ob);
 const foreign=await b.exchange(req([...rb.context.messages,oa.message,...results(oa.message)],'b'));assert.equal(foreign.kind,'failure');assert.equal(captures.length,1);
 await b.exchange(req([...rb.context.messages,ob.message,...results(ob.message)],'b'));
 assert.equal(JSON.parse(captures[1]!.body).messages[2].reasoning_content,'PRIVATE-OTHER-思考-片0');
 const switched=new PanKimiModelAdapter({...profile,thinkingLevel:'low'},{transport:{async send(){throw new Error('must refuse before transport');}}});
 const refusal=await switched.exchange(req([...ra.context.messages,oa.message,...results(oa.message)],'a'));
 assert.equal(refusal.kind,'failure');if(refusal.kind==='failure')assert.equal(refusal.category,'protocol');
});

async function sessionFor(adapter: Pick<PanKimiModelAdapter, "providerId" | "modelId" | "reasoningLevel" | "exchange" | "dispose">) {
 const archiveStore=await RunArchiveStore.open(await mkdtemp(join(tmpdir(),'k3-memory-')));
 const runbook=await loadRunbook(new URL('../RUNBOOK.md',import.meta.url).pathname);let effects=0;
 const session=new GeneralAgentSession({kernel:'native',adapter,systemPrompt:'offline',tools:[{name:'read',description:'synthetic',parameters:{type:'object'},validate:value=>({ok:true,value:value as never}),execute:async()=>{effects++;return{content:[{type:'text',text:'read result'}]};}}],memory:{archiveStore,runbook:async()=>runbook},cleanup:()=>adapter.dispose()});
 return {session,archiveStore,effects:()=>effects};
}

test('C-K3-02 invalid and truncated streams cannot execute tools', async () => {
 const single=wire('single');
 const invalid=[single.replace('data: [DONE]\n\n',''),single.replace('tool_calls"}', 'stop"}'),single.replace('\\"sample.txt\\"}', 'not-json'),wire('multiple').replaceAll('call-1','call-0'),single+'data: {}\n\n'];
 for(const broken of invalid){
  const state=await sessionFor(fake(bytes(broken)));const result=await state.session.runTask('task');
  assert.equal(result.status,'model_error',broken);assert.equal(state.effects(),0);await state.session.close();
 }
 const captured:KimiTransportRequest[]=[];const adapter=fake(bytes(single),captured);
 const orphan:Message={role:'tool_result',toolCallId:'orphan',toolName:'read',content:[{type:'text',text:'x'}],timestamp:0,isError:false};
 assert.equal((await adapter.exchange(req([orphan]))).kind,'failure');assert.equal(captured.length,0);
});

test('C-K3-03 fixed endpoint, header-only credential, truthful identity, no errors/retries leaking', async () => {
 const credential='SYNTHETIC-CREDENTIAL-K3';let reads=0;let calls=0;
 const transport=new KimiFetchTransport({credentialSource:()=>{reads++;return credential;},fetchImplementation:async(url,options)=>{
  calls++;assert.equal(url,'https://api.kimi.com/coding/v1/chat/completions');assert.equal((options?.headers as Record<string,string>).authorization,`Bearer ${credential}`);
  assert.ok(!String(options?.body).includes(credential));return new Response(wire('usage-tail'),{status:200});
 }});
 const adapter=new PanKimiModelAdapter(profile,{transport});assert.equal(reads,0);
 const outcome=await adapter.exchange(req());assert.equal(reads,1);assert.equal(calls,1);assert.equal(outcome.kind,'response');
 assert.deepEqual(outcome.identity.model,{status:'reported',value:'observed-k3-build'});
 assert.deepEqual(outcome.usage,{status:'reported',value:{input:7,output:3,cacheRead:0,totalTokens:10}});
 assert.ok(!JSON.stringify(outcome).includes(credential));assert.ok(!JSON.stringify(outcome).includes('PRIVATE'));
 for(const status of [400,401,402,403,404,422,429,500,502,503]){
  let count=0;const errors=new PanKimiModelAdapter(profile,{transport:{async send(){count++;return {status,body:(async function*(){yield Buffer.from('SYNTHETIC-ERROR-BODY');})()};}}});
  const result=await errors.exchange(req());assert.equal(result.kind,'failure');assert.equal(count,1);assert.ok(!JSON.stringify(result).includes('SYNTHETIC-ERROR-BODY'));assert.deepEqual(result.usage,{status:'unavailable'});assert.deepEqual(result.identity.model,{status:'unavailable'});
 }
 const missing=wire('final').replaceAll(',"model":"observed-k3-build"','').replaceAll(',"id":"synthetic-k3"','');
 const absent=await fake(bytes(missing)).exchange(req());assert.equal(absent.kind,'response');assert.deepEqual(absent.identity.model,{status:'unavailable'});assert.deepEqual(absent.identity.responseId,{status:'unavailable'});assert.deepEqual(absent.usage,{status:'unavailable'});
});

test('C-K3-04 pre-abort, blocked transport/body cancellation, late completion and disposal', async () => {
 const pre=new AbortController();pre.abort();const captured:KimiTransportRequest[]=[];
 assert.equal((await fake(bytes(wire('final')),captured).exchange({...req(),signal:pre.signal})).kind,'failure');assert.equal(captured.length,0);
 for(const phase of ['transport','reasoning','partial-call']){
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const started=new Promise<void>(r=>{entered=r;});
  let signal:AbortSignal|undefined;
  const adapter=new PanKimiModelAdapter(profile,{transport:{async send(request){signal=request.signal;
   if(phase==='transport'){entered();await gate;}
   return {status:200,body:(async function*(){
    if(phase!=='transport'){const events=wire('single').split('\n\n');yield Buffer.from(events.slice(0,phase==='reasoning'?1:2).join('\n\n')+'\n\n');entered();await gate;}
    yield Buffer.from(wire('single'));
   })()};
  }}});
  const state=await sessionFor(adapter);const pending=state.session.runTask('task');await started;state.session.cancel();
  const result=await pending;assert.equal(result.status,'cancelled');assert.equal(signal?.aborted,true);assert.equal(state.effects(),0);
  const before=await state.archiveStore.readArchive(result.runId);assert.equal(before.filter(r=>r.type==='run.terminal').length,1);
  release();await new Promise(r=>setImmediate(r));assert.equal(state.effects(),0);assert.deepEqual(await state.archiveStore.readArchive(result.runId),before);
  await state.session.close();assert.equal((await adapter.exchange(req())).kind,'failure');
 }
 const adapter=fake(bytes(wire('single')));const original=req();const result=await adapter.exchange(original);assert.equal(result.kind,'response');
 adapter.dispose();assert.equal((await adapter.exchange(original)).kind,'failure');
});

test('R68-01 C-K3-02 request-time lineage rejects in-flight content and object changes', async () => {
 for (const phase of ['transport', 'stream']) {
  for (const mutation of ['none', 'content', 'object', 'equal-object', 'append']) {
   let started!: () => void, release!: () => void;
   const ready = new Promise<void>(resolve => { started = resolve; });
   const gate = new Promise<void>(resolve => { release = resolve; });
   const captures: KimiTransportRequest[] = [];
   const adapter = new PanKimiModelAdapter(profile, { transport: { async send(request) {
    captures.push(request);
    if (captures.length === 1 && phase === 'transport') { started(); await gate; }
    const text = captures.length === 1 ? wire('single') : wire('final');
    return { status: 200, body: (async function* () {
     if (captures.length === 1 && phase === 'stream') {
      const boundary = text.indexOf('\n\n') + 2;
      yield Buffer.from(text.slice(0, boundary)); started(); await gate;
      yield Buffer.from(text.slice(boundary));
     } else yield Buffer.from(text);
    })() };
   } } });
   const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: 'ORIGINAL_REQUEST' }], timestamp: 0 }];
   const request = req(messages);
   const pending = adapter.exchange(request); await ready;
   assert.equal(JSON.parse(captures[0]!.body).messages[1].content, 'ORIGINAL_REQUEST');
   if (mutation === 'content') (messages[0]!.content[0] as { text: string }).text = 'ALTERED_WHILE_PENDING';
   if (mutation === 'object' || mutation === 'equal-object') messages[0] = { role: 'user', content: [{ type: 'text', text: mutation === 'object' ? 'REPLACED_WHILE_PENDING' : 'ORIGINAL_REQUEST' }], timestamp: 0 };
   if (mutation === 'append') messages.push({ role: 'user', content: [{ type: 'text', text: 'APPENDED_WHILE_PENDING' }], timestamp: 1 });
   release(); const first = await pending;
   if (first.kind === 'response') await adapter.exchange(req([...messages, first.message, ...results(first.message)]));
   assert.equal(captures.length, mutation === 'none' ? 2 : 1, `${phase}/${mutation}: mismatched continuation must not reach transport`);
   if (mutation === 'none') assert.equal(first.kind, 'response');
   else {
    assert.equal(first.kind, 'failure');
    if (first.kind === 'failure') { assert.equal(first.category, 'protocol'); assert.equal(first.detail, 'kimi_continuation_unavailable'); }
   }
   adapter.dispose();
  }
 }
});

test('R68-01 C-K3-02 GeneralAgentSession rejects changed pending lineage before any Tool effect', async () => {
 for (const mutation of ['content', 'object']) {
  let started!: () => void, release!: () => void, active!: ModelExchangeRequest;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let transports = 0;
  const inner = new PanKimiModelAdapter(profile, { transport: { async send() {
   transports++; started(); await gate;
   return { status: 200, body: (async function* () { yield Buffer.from(wire('single')); })() };
  } } });
  const state = await sessionFor({ providerId: inner.providerId, modelId: inner.modelId, reasoningLevel: inner.reasoningLevel,
   exchange(request) { active = request; return inner.exchange(request); }, dispose() { inner.dispose(); } });
  const pending = state.session.runTask('ORIGINAL_REQUEST'); await ready;
  const messages = active.context.messages as Message[];
  if (mutation === 'content') (messages[0]!.content[0] as { text: string }).text = 'ALTERED_WHILE_PENDING';
  else messages[0] = { role: 'user', content: [{ type: 'text', text: 'REPLACED_WHILE_PENDING' }], timestamp: 0 };
  release(); const result = await pending;
  assert.equal(result.status, 'model_error'); assert.equal(result.reason, 'kimi_continuation_unavailable');
  assert.equal(transports, 1); assert.equal(state.effects(), 0);
  const records = await state.archiveStore.readArchive(result.runId);
  assert.equal(records.filter(row => row.type === 'tool.started').length, 0);
  assert.equal(records.filter(row => row.type === 'run.terminal').length, 1);
  assert.ok(!JSON.stringify(records).includes('PRIVATE'));
  await state.session.close();
 }
});
