/** Paired installed sessions: view/focus/details/replay never change canonical effects or sealed bytes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const [product,output]=process.argv.slice(2);const api=await import(pathToFileURL(join(product,'dist/index.js')));
const {createPanTrustedLocalTools}=await import(pathToFileURL(join(product,'dist/tools/pan-trusted-local-tools.js')));
const {DailyWorkspace}=await import(pathToFileURL(join(product,'dist/tui/daily-workspace.js')));const variants=[];
const response=(text,calls=[])=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls]},stopReason:calls.length?'tool_calls':'stop',usage:{status:'unavailable'},identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}}});
for(const viewing of [false,true]){
 const directory=join(output,viewing?'view':'noop'),workspace=join(output,'shared-workspace');await mkdir(workspace,{recursive:true});await rm(join(workspace,'hello.js'),{force:true});
 const calls=[{type:'tool_call',id:'write',name:'write',arguments:{path:'hello.js',content:'console.log("TUI_A_LOCAL_TOOL");\n'}},{type:'tool_call',id:'bash',name:'bash',arguments:{command:'node hello.js'}},{type:'tool_call',id:'read',name:'read',arguments:{path:'hello.js'}}];
 const adapter=new api.FauxModelAdapter([...calls.map(c=>response('',[c])),response('Verified local result.')]);
 const store=await api.RunArchiveStore.open(join(directory,'memory'));const view=api.createCompactPresentation();const observations=[];
 const session=new api.GeneralAgentSession({kernel:'native',adapter,tools:createPanTrustedLocalTools(workspace).tools,systemPrompt:'fixed offline task',memory:{archiveStore:store,runbook:async()=>({revision:'sha256:'+'0'.repeat(64),content:'fixed'})},onObservation(e){observations.push(structuredClone(e));view.observe(e);if(viewing){ui.key(undefined,{name:'pageup'});ui.key(undefined,{name:'tab'});ui.key(undefined,{name:'return'});ui.key(undefined,{name:'escape'});}}});
 const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(){}}),stdout=Object.assign(new PassThrough(),{isTTY:true,columns:80,rows:24});stdout.resume();const ui=new DailyWorkspace({session,presentation:view,input,output:stdout,workspace,provider:'faux',model:'faux',thinking:'off',archiveStore:store});ui.phase='running';
 const result=await session.runTask('Create hello.js, run it, and read it back.');view.settle(result);ui.phase='idle';const archive=await store.readArchive(result.runId);
 const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');const files=await readdir(join(store.root,'runs',result.runId));const sealed=await Promise.all(files.map(f=>hash(join(store.root,'runs',result.runId,f))));
 if(viewing){view.details();view.replay(archive,result.runId);view.details();}
 assert.deepEqual(await Promise.all(files.map(f=>hash(join(store.root,'runs',result.runId,f)))),sealed);await session.close();
 const ids=new Map([[result.runId,'RUN'],...adapter.state.requests.map(r=>[r.sessionId,'SESSION'])]);
 function normalize(v,k=''){if(Array.isArray(v))return v.map(x=>normalize(x));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([key,x])=>[key,normalize(x,key)]));if(typeof v==='string')return ids.get(v)??v;if(k==='timestamp'&&typeof v==='number'&&v>1e12)return 'GENERATED_TIME';return v;}
 const raw={requests:adapter.state.requests,observations,result,archive,source:await readFile(join(workspace,'hello.js'),'utf8')};const normalized=normalize(raw);await writeFile(join(directory,'raw.json'),JSON.stringify(raw,null,2)+'\n');await writeFile(join(directory,'normalized.json'),JSON.stringify(normalized,null,2)+'\n');variants.push({viewing,normalized,archiveHashes:sealed});
}
assert.deepEqual(variants[0].normalized,variants[1].normalized);assert.equal(variants[0].normalized.result.status,'completed');assert.equal(variants[0].normalized.result.toolCalls,3);
await writeFile(join(output,'result.json'),JSON.stringify({result:'PASS',normalization:'Generated Run/Session IDs and generated timestamps only; same disposable workspace reset between variants; paths unchanged. No payload fields omitted.',variants},null,2)+'\n');console.log('PASS installed paired views/noop; 3 real local tools, unchanged sealed archive reads');
