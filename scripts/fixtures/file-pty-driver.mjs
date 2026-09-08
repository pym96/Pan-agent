/** Verification only: installed CLI, real PTY; synthetic fixtures and explicit read targets. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
const [product,workspace,memory,controlFd,eventFd,mode='normal']=process.argv.slice(2);
const compiled=product.endsWith('/pan-agent');
const {runCli,FauxModelAdapter,createCompactPresentation,decodeAttachedTask}=await import(pathToFileURL(join(product,compiled?'dist/index.js':'typescript/src/index.ts')));
const fixture=JSON.parse(await fsp.readFile(join(workspace,'..','fixture.json'),'utf8'));
let exchanges=0,effects=0;const reads=[],observations=[],results=[],contexts=[],views=[];
const notify=e=>fs.writeSync(Number(eventFd),JSON.stringify(e)+'\n');
for(const [api,names] of [[fs,['readFile','readFileSync','open','openSync','createReadStream']],[fsp,['readFile','open']]])for(const name of names){const original=api[name];api[name]=function(file,...args){if(typeof file==='string'&&resolve(file).startsWith(workspace+'/')){reads.push({operation:name,path:resolve(file).slice(workspace.length+1)});if(![fixture.path,fixture.invalid,'small','overflow'].includes(resolve(file).slice(workspace.length+1)))throw new Error('unselected content read trap');}return original.call(this,file,...args);};}
syncBuiltinESMExports();
let release;const controls=createInterface({input:fs.createReadStream('',{fd:Number(controlFd),autoClose:false})});
controls.on('line',line=>{if(line==='release')release?.();else notify({checkpoint:line,exchanges,reads:[...reads],results:results.length});});
const response=text=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text}]},stopReason:'stop',usage:{status:'unavailable'},identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}}});
const delegate=new FauxModelAdapter([response('Attached snapshot received. 世界'),response('Literal draft received.')],{progress:async function*(index){if(index===0){yield 'Attached snapshot ';await new Promise(resolve=>{release=resolve;notify({barrier:'stream'});});yield 'received. 世界';}}});
const adapter={providerId:delegate.providerId,modelId:delegate.modelId,reasoningLevel:delegate.reasoningLevel,async exchange(request){exchanges++;contexts.push(request.context);notify({exchange:exchanges,context:request.context});return delegate.exchange(request);}};
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory,'--max-attachment-bytes',String(Buffer.byteLength(fixture.content)+1)],{createNativeAdapter:()=>adapter,createTools:()=>({boundary:'offline',tools:[]}),createPresentation:write=>{const view=createCompactPresentation(write);return {...view,observe(e){observations.push(e);view.observe(e);},settle(result){view.settle(result);results.push(result);notify({settled:result});},details(){view.details();views.push('details');notify({view:'details'});},replay(records,id){view.replay(records,id);views.push('replay');notify({view:'replay'});}};}});
const tasks=observations.filter(e=>e.type==='run.started').map(e=>e.task);assert.equal(exchanges,2);assert.equal(tasks.length,2);
const decoded=decodeAttachedTask(tasks[0]);assert.equal(decoded.prompt,'review ');assert.equal(decoded.attachments.length,1);assert.equal(decoded.attachments[0].path,fixture.path);assert.equal(decoded.attachments[0].text,fixture.content);
assert.equal(tasks[1],'literal email a@b.test @plain');assert.equal(decodeAttachedTask(tasks[1]),undefined);
assert.deepEqual(contexts[1].messages.filter(m=>m.role==='user').map(m=>m.content),tasks.map(text=>[{type:'text',text}]));assert.ok(!contexts[0].systemPrompt.includes(fixture.content));
const archives=[];for(const result of results)archives.push(await fsp.readFile(join(memory,'runs',result.runId,'events.jsonl'),'utf8'));
assert.ok(!JSON.stringify({contexts,archives}).includes('UNSELECTED_CANARY'));assert.ok(!JSON.stringify({contexts,archives}).includes('ENV_CANARY'));
await fsp.writeFile(join(workspace,'..','report.json'),JSON.stringify({code,mode,exchanges,effects,reads,contexts,tasks,observations,results,archives,views},null,2)+'\n');notify({exit:code});controls.close();process.exit(code);
