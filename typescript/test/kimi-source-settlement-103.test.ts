import test from "node:test";
import assert from "node:assert/strict";
import { abortableKimiBody, KimiFetchTransport, type KimiSourceObserver } from "../src/providers/kimi/kimi-transport.ts";
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:unknown)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
function observer() {
 const events: {kind:string;state:string;error?:unknown}[]=[];
 const observe:KimiSourceObserver=(kind,promise)=>{const event:{kind:string;state:string;error?:unknown}={kind,state:"pending"};events.push(event);promise.then(()=>event.state="fulfilled",error=>{event.state="rejected";event.error=error;});};
 return {events,observe};
}
test("cancellation settles wrapper promptly while original read and return remain observable",async()=>{
 const read=deferred<IteratorResult<Uint8Array>>(),cleanup=deferred<IteratorResult<Uint8Array>>(),seen=observer(),abort=new AbortController();let returns=0;
 const body={ [Symbol.asyncIterator](){return {next:()=>read.promise,return:()=>{returns++;return cleanup.promise;}};} };
 const iterator=abortableKimiBody(body,abort.signal,seen.observe)[Symbol.asyncIterator]();
 const next=iterator.next();await tick();abort.abort();await assert.rejects(next,{name:"AbortError"});await tick();
 assert.deepEqual(seen.events.map(x=>[x.kind,x.state]),[["read","pending"],["return","pending"]]);
 await iterator.return?.();abort.abort();assert.equal(returns,1);
 cleanup.resolve({done:true,value:undefined});await tick();assert.equal(seen.events[0]!.state,"pending");
 read.resolve({done:false,value:Buffer.from("late synthetic bytes")});await tick();assert(seen.events.every(x=>x.state==="fulfilled"));
 assert.equal((await iterator.next()).done,true);
});
for(const mode of ["fulfilled","rejected","synchronous-throw"])test("raw cleanup settlement: "+mode,async()=>{
 const cleanup=deferred<IteratorResult<Uint8Array>>(),seen=observer(),error=Object.assign(new Error("synthetic"),{code:"EPIPE"});
 const body={ [Symbol.asyncIterator](){return {next:async()=>({done:true as const,value:undefined}),return:()=>{if(mode==="synchronous-throw")throw error;return cleanup.promise;}};} };
 for await(const _ of abortableKimiBody(body,new AbortController().signal,seen.observe))assert.fail("no bytes");
 await tick();if(mode!=="synchronous-throw"){assert.equal(seen.events[1]!.state,"pending");if(mode==="fulfilled")cleanup.resolve({done:true,value:undefined});else cleanup.reject(error);await tick();}
 assert.equal(seen.events[1]!.state,mode==="fulfilled"?"fulfilled":"rejected");
 if(mode!=="fulfilled")assert.equal(seen.events[1]!.error,error);
});
test("late fetch after abort cleans up unentered response and exposes raw return",async()=>{
 const response=deferred<Response>(),cleanup=deferred<IteratorResult<Uint8Array>>(),seen=observer(),abort=new AbortController();let returns=0,reads=0;
 const body={ [Symbol.asyncIterator](){return {next:async()=>{reads++;return {done:true as const,value:undefined};},return:()=>{returns++;return cleanup.promise;}};} };
 const transport=new KimiFetchTransport({credentialSource:()=>"synthetic",fetchImplementation:()=>response.promise,onSourceOperation:seen.observe});
 const send=transport.send({method:"POST",path:"/chat/completions",headers:{},body:"{}",signal:abort.signal});abort.abort();
 response.resolve({status:200,headers:new Headers(),body} as unknown as Response);await assert.rejects(send,{name:"AbortError"});await tick();
 assert.equal(reads,0);assert.equal(returns,1);assert.deepEqual(seen.events.map(x=>[x.kind,x.state]),[["return","pending"]]);
 cleanup.resolve({done:true,value:undefined});await tick();assert.equal(seen.events[0]!.state,"fulfilled");
});
