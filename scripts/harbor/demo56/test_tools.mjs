import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBoundTools,filePath} from './tools.mjs';
const entry=resolve(process.argv[2]);const workspace=mkdtempSync(join(tmpdir(),'demo56-tools-'));
const {SessionAuthorization}=await import(pathToFileURL(resolve(entry,'../../dist/runtime/authorization.js')));
let sends=0;const requests=[];const rpc=async(method,payload,signal)=>{assert(!signal.aborted);sends++;requests.push({method,payload});return {content:[{type:'text',text:'bound fake response'}],details:{}};};
const {tools}=await createBoundTools({entry,workspace,containerId:'fixed-cid',rpc});
assert.throws(()=>filePath('/etc/passwd'));assert.throws(()=>filePath('../../etc/passwd'));assert.equal(filePath('a.txt'),'/app/a.txt');
const args={read:{path:'/app/a.txt'},write:{path:'/app/a.txt',content:'hello'},edit:{path:'/app/a.txt',edits:[{oldText:'hello',newText:'world'}]},bash:{command:'echo safe',timeout:5}};
for(const t of tools){
 const a=new SessionAuthorization({approval:async r=>({requestId:r.requestId,decision:'deny'})});const wrapped=a.wrap(t,()=> 'offline-run');const before=sends;const r=await wrapped.execute({toolCallId:'deny',arguments:args[t.name],signal:new AbortController().signal});assert(r.isError);assert.equal(sends,before);
 const allowed=new SessionAuthorization({approval:async r=>({requestId:r.requestId,decision:'allow-once'})});const w=allowed.wrap(t,()=> 'offline-run');const result=await w.execute({toolCallId:'allow',arguments:args[t.name],signal:new AbortController().signal});assert(!result.isError,JSON.stringify(result));assert.equal(sends,before+1);
 const ac=new AbortController();ac.abort();const x=await w.execute({toolCallId:'abort',arguments:args[t.name],signal:ac.signal});assert(x.isError);assert.equal(sends,before+1);
}
const bad=await tools[0].execute({toolCallId:'escape',arguments:{path:'/etc/passwd'},signal:new AbortController().signal});assert(bad.isError);assert.equal(sends,4);
console.log(JSON.stringify({passed:true,tools:4,deniedNoDispatch:4,abortedNoDispatch:4,outsidePathDenied:true,onlyBoundRpc:requests.length,modelCalls:0}));
