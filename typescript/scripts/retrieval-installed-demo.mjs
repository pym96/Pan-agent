/** Synthetic offline model, genuine installed CLI/NativeKernel/DailyWorkspace/tools/archive. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,realpath,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PassThrough} from 'node:stream';
const [packageArg,rootArg]=process.argv.slice(2),pkg=resolve(packageArg),root=resolve(rootArg);await mkdir(root,{recursive:true});
const workspace=join(root,'workspace'),memory=join(root,'memory'),home=join(root,'home');await mkdir(join(workspace,'docs'),{recursive:true});await mkdir(home,{recursive:true});
const api=await import(pathToFileURL(join(pkg,'dist/index.js'))),{DailyWorkspace}=await import(pathToFileURL(join(pkg,'dist/tui/daily-workspace.js')));
let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const response=content=>({kind:'response',message:{role:'assistant',content,timestamp:1},stopReason:content.some(c=>c.type==='tool_call')?'tool_calls':'stop',usage:{status:'unavailable'},identity:{provider:{status:'unavailable'},model:{status:'unavailable'},responseId:{status:'unavailable'}}});
const store=await api.RunArchiveStore.open(memory),prior=new api.GeneralAgentSession({kernel:'native',adapter:new api.FauxModelAdapter([response([{type:'text',text:'Saved prior preference.'}])]),tools:[],systemPrompt:'offline fixture',memory:{archiveStore:store,runbook:async()=>({content:'fixture',revision:'sha256:'+'0'.repeat(64)})}});
const priorRun=await prior.runTask('Previous-session fact: violet lighthouse.');await prior.close();assert.ok(priorRun.archiveSealed);
await writeFile(join(workspace,'docs','service.ts'),'export const recoveryBudget = 17;\n');
const selection=join(root,'selection.json');await writeFile(selection,JSON.stringify({documents:['docs'],history:memory}));
function cli(args){const r=spawnSync(process.execPath,[join(pkg,'bin/pan-agent.mjs'),...args],{encoding:'utf8',env:{...process.env,HOME:home}});assert.equal(r.status,0,r.stderr+r.stdout);return r.stdout;}
const disabled=cli(['retrieval','show','--workspace',workspace]);assert.equal(JSON.parse(disabled).enabled,false);
const config=cli(['retrieval','configure','--workspace',workspace,'--from',selection]);assert.equal(JSON.parse(cli(['retrieval','show','--workspace',workspace])).enabled,true);
const script=[response([{type:'tool_call',id:'history-query',name:'retrieve',arguments:{query:'violet lighthouse'}}]),response([{type:'tool_call',id:'code-query',name:'retrieve',arguments:{query:'recoveryBudget'}}]),response([{type:'text',text:'Offline fixture complete: prior violet lighthouse and recoveryBudget 17 retrieved. See tool evidence for citations.'}])];
const adapter=new api.FauxModelAdapter(script),input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(v){this.isRaw=v;}}),output=Object.assign(new PassThrough(),{isTTY:true,columns:110,rows:32});let transcript='',approvalCount=0,finalRun;output.on('data',b=>transcript+=b.toString());
const wait=async f=>{for(let i=0;i<4000;i++){if(f())return;await new Promise(r=>setTimeout(r,5));}throw Error('demo_timeout');};
const code=await api.runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{home,input,output,createNativeAdapter:()=>adapter,startTui:async options=>{const ui=new DailyWorkspace({...options,input,output});ui.start();try{input.write('Retrieve the previous preference and the code budget.');input.write('\r');
 for(let n=0;n<2;n++){await wait(()=>!!ui.approval);assert.equal(ui.approval.request.tool,'retrieve');approvalCount++;input.write('\x1b[C');input.write('\r');await wait(()=>!ui.approval);}
 await wait(()=>ui.phase==='idle'&&adapter.state.exchangeCount===3);finalRun=ui.runId;assert.ok(ui.entries.some(e=>e.text.includes('Offline fixture complete')));input.write(':replay '+finalRun);input.write('\r');await wait(()=>ui.phase==='idle');assert.equal(adapter.state.exchangeCount,3);input.write('\x07');input.write(':exit');input.write('\r');await ui.closed;return 0;}finally{ui.dispose();await options.session.close();}}});
assert.equal(code,0);assert.equal(networkCalls,0);assert.equal(approvalCount,2);
const exchanges=adapter.state.requests;assert.ok(exchanges[0].context.tools.some(t=>t.name==='retrieve'));
const messages=exchanges.at(-1).context.messages.filter(m=>m.role==='tool_result');assert.equal(messages.length,2);const evidence=messages.map(m=>JSON.parse(m.content[0].text));assert.ok(evidence[0].results.some(e=>e.sourceKind==='history'&&e.runId===priorRun.runId));assert.ok(evidence[1].results.some(e=>e.sourceKind==='document'&&e.snippet.includes('recoveryBudget = 17')));
const archive=await readFile(join(memory,'runs',finalRun,'events.jsonl'),'utf8');assert.ok(archive.includes('selected_retrieval_sources'));assert.ok(archive.includes('recoveryBudget'));assert.ok(archive.includes('violet lighthouse'));
const persisted=JSON.parse(cli(['retrieval','show','--workspace',workspace]));assert.equal(persisted.enabled,true);cli(['retrieval','disable','--workspace',workspace]);assert.equal(JSON.parse(cli(['retrieval','show','--workspace',workspace])).enabled,false);
await writeFile(join(root,'tui.txt'),transcript);await writeFile(join(root,'result.json'),JSON.stringify({code,package:JSON.parse(await readFile(join(pkg,'package.json'),'utf8')).version,priorRun:priorRun.runId,finalRun,approvalCount,scriptedExchanges:adapter.state.exchangeCount,networkCalls,actualInstalledDailyWorkspace:true,persistedConfig:true,disabledAfter:true,results:evidence},null,2));console.log(JSON.stringify({code,finalRun,approvalCount,networkCalls}));
