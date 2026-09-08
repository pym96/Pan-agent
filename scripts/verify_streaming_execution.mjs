/** #44 streaming equivalence and retained-only replay; no external model. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {event,ending,wire} from './fixtures/streaming-wire.mjs';
const candidate=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]);await mkdir(output);
const baseline=join(output,'baseline');await mkdir(baseline);
execFileSync('tar',['-xf','-','-C',baseline],{input:execFileSync('git',['archive','fd408c4ecd236cf97d509436085e4df461829e9e'],{cwd:candidate,maxBuffer:32*1024*1024})});
const fixture=JSON.parse(await readFile(join(candidate,'scripts/fixtures/packed-create-run-verify-v1.json'),'utf8'));
const {createCompactPresentation,observeSafely}=await import(pathToFileURL(join(candidate,'typescript/src/tui/presentation.ts')));
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(text,calls=[])=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls.map(c=>({type:'tool_call',...c}))]},stopReason:calls.length?'tool_calls':'stop',usage:{status:'unavailable'},identity});
const scenarios={frozen:{tasks:['Create hello.js, run it and verify its exact source.'],script:[...fixture.calls.map(c=>response('',[c])),response(fixture.final)]},context:{tasks:['first 中文','second ASCII'],script:[response('first answer'),response('second answer')]},cancel2:{tasks:['cancel batch'],cancel:true,script:[response('',Array.from({length:2},(_,i)=>({id:`call-${i}`,name:'write',arguments:{path:`file-${i}`,content:'same'}})))]},cancel3:{tasks:['cancel batch'],cancel:true,script:[response('',Array.from({length:3},(_,i)=>({id:`call-${i}`,name:'write',arguments:{path:`file-${i}`,content:'same'}})))]},protocol:{tasks:['protocol failure'],script:[{...response(''),message:{role:'assistant',timestamp:0,content:[{type:'invalid-block'}]}}]}};
const call=(id,name,args)=>({id,name,arguments:args});
scenarios.batch={tasks:['valid batch'],script:[response('Public before tools',[call('read-a','read',{path:'a.txt'}),call('write-b','write',{path:'b.txt',content:'B'})]),response('batch complete')]};
scenarios.unknown={tasks:['unknown batch'],script:[response('Preview cannot execute',[call('write-a','write',{path:'forbidden',content:'bad'}),call('unknown','unknown',{})])]};
scenarios.schema={tasks:['invalid schema batch'],script:[response('Preview cannot execute',[call('write-a','write',{path:'forbidden',content:'bad'}),call('invalid','write',{content:'missing path'})])]};
scenarios['unknown-after-valid']=structuredClone(scenarios.unknown);scenarios['schema-after-valid']=structuredClone(scenarios.schema);
scenarios.unknown.script[0].message.content.splice(1,1);scenarios.schema.script[0].message.content.splice(1,1);
const providerFixture=async name=>readFile(join(candidate,'typescript/test/fixtures/pan-deepseek-v1',name),'utf8');
const final=await providerFixture('final.sse');
for(const name of ['final','single-tool','multiple-tools','empty-reasoning','length'])scenarios['direct-'+name]={tasks:['frozen direct fixture'],wires:[await providerFixture(name+'.sse'),final]};
const prefix=event({content:'Hello, '});
const toolDelta=args=>event({tool_calls:[{index:0,id:'partial-call',type:'function',function:{name:'write',arguments:args}}]},'tool_calls')+'data: [DONE]\n\n';
for(const [name,body] of Object.entries({missing:prefix,malformed:prefix+'data: {\n\n',duplicate:prefix+ending()+'data: [DONE]\n\n',identity:prefix+event({},'stop',{id:'changed'})+'data: [DONE]\n\n',partial:prefix+toolDelta('{"path":'),schema:prefix+toolDelta('{"content":"missing path"}'),unknown:prefix+toolDelta('{}').replace('"name":"write"','"name":"unknown"')}))scenarios['direct-'+name]={tasks:['invalid direct response'],wires:[body]};
const reports=[];
for(const [scenario,config] of Object.entries(scenarios)) {
 const variants=[];
 for(const [sourceName,source] of [['baseline',baseline],['candidate',candidate]])for(const rendering of [false,true]) {
  const directory=join(output,`${scenario}-${sourceName}-${rendering?'render':'noop'}`);await mkdir(directory);const workspace=join(directory,'workspace');await mkdir(workspace);await writeFile(join(workspace,'a.txt'),'A');
  const load=name=>import(pathToFileURL(join(source,'typescript/src',name+'.ts')));
  const {GeneralAgentSession}=await load('runtime/session');const {FauxModelAdapter}=await load('providers/faux/faux-model-adapter');const {RunArchiveStore}=await load('memory/run-archive');const {loadRunbook}=await load('memory/runbook');const {createPanTrustedLocalTools}=await load('tools/pan-trusted-local-tools');
  const wireRequests=[],recorded=[],outcomes=[],deltas=[];let exchangeCount=0;
  const {PanDeepSeekModelAdapter}=await load('providers/deepseek/pan-deepseek-model-adapter');
  const delegate=config.wires?new PanDeepSeekModelAdapter(undefined,{transport:{async send(request){wireRequests.push(JSON.parse(request.body));const text=config.wires[wireRequests.length-1];assert.equal(typeof text,'string','unexpected extra exchange');return {status:200,body:(async function*(){for(const byte of new TextEncoder().encode(text))yield Uint8Array.of(byte);})()};}}}):new FauxModelAdapter(config.script,{progress:async function*(index){const entry=config.script[index];if(entry?.kind==='response')for(const c of entry.message.content)if(c.type==='text')for(const text of Array.from(c.text))yield text;}});
  const adapter={providerId:delegate.providerId,modelId:delegate.modelId,reasoningLevel:delegate.reasoningLevel,get state(){return {exchangeCount,requests:recorded};},async exchange(request){exchangeCount++;recorded.push({sessionId:request.sessionId,context:structuredClone(request.context)});const outcome=await delegate.exchange(request);outcomes.push(outcome);return outcome;}};const store=await RunArchiveStore.open(join(directory,'memory'));const effects=[],observations=[],results=[],archives=[],lines=[];
  const view=createCompactPresentation(line=>lines.push(line));let session;
  const tools=createPanTrustedLocalTools(workspace).tools.map(tool=>({...tool,async execute(invocation){const result=await tool.execute(invocation);effects.push({name:tool.name,arguments:invocation.arguments,result});return result;}}));
  session=new GeneralAgentSession({kernel:'native',adapter,tools,systemPrompt:'fixed offline equivalence',memory:{archiveStore:store,runbook:()=>loadRunbook(join(source,'typescript/RUNBOOK.md'))},...(rendering?{onProgress:e=>{deltas.push(e);view.progress?.(e);}}:{}),onObservation(event){observations.push(structuredClone(event));if(rendering)observeSafely(view,event,line=>lines.push(line));if(config.cancel&&event.type==='tool.started')session.cancel();}});
  for(const task of config.tasks){const result=await session.runTask(task);results.push(result);archives.push(await store.readArchive(result.runId));if(rendering){view.settle(result);view.details();}}
  await session.close();
  if(scenario==='frozen'){assert.equal(adapter.state.exchangeCount,4);assert.deepEqual(effects.map(e=>e.name),['write','bash','read']);assert.equal(await readFile(join(workspace,'hello.js'),'utf8'),fixture.calls[0].arguments.content);assert.ok(effects[1].result.content[0].text.split('\n').includes(fixture.expected_stdout));assert.equal(effects[2].result.content[0].text,fixture.calls[0].arguments.content);assert.equal(results[0].finalText,fixture.final);}
  if(config.cancel){assert.equal(effects.length,0);assert.equal(results[0].toolCalls,scenario==='cancel2'?2:3);assert.equal(results[0].status,'cancelled');}
  if(scenario==='protocol')assert.equal(results[0].status,'model_error');
  if(['unknown','schema'].includes(scenario)||scenario.startsWith('direct-')&&['missing','malformed','duplicate','identity','partial','schema','unknown'].some(n=>scenario==='direct-'+n))assert.equal(effects.length,0,scenario);
  const raw={requests:adapter.state.requests,wireRequests,outcomes,effects,results,archives,observations};const runIds=Object.fromEntries([...results.map((r,i)=>[r.runId,`RUN_${i}`]),...[...new Set(adapter.state.requests.map(r=>r.sessionId))].map((id,i)=>[id,`SESSION_${i}`])]);
  function normalize(value,key='') {if(Array.isArray(value))return value.map(v=>normalize(v));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));if(typeof value==='string'){if(runIds[value])return runIds[value];return value.split(workspace).join('WORKSPACE_ROOT');}if(key==='timestamp'&&typeof value==='number'&&value>1e12)return 'GENERATED_WALL_TIME';return value;}
  const normalized=normalize(raw);await writeFile(join(directory,'transient-progress.json'),JSON.stringify(deltas,null,2)+'\n');await writeFile(join(directory,'raw.json'),JSON.stringify(raw,null,2)+'\n');await writeFile(join(directory,'normalized.json'),JSON.stringify(normalized,null,2)+'\n');await writeFile(join(directory,'display.txt'),lines.join('\n')+'\n');
  variants.push({sourceName,rendering,normalized});reports.push({scenario,sourceName,rendering,directory,runIds,modelCalls:adapter.state.exchangeCount,toolImplementations:effects.length});
 }
 for(const variant of variants)assert.deepEqual(variant.normalized,variants[0].normalized,`${scenario} ${variant.sourceName} ${variant.rendering}`);
 const changed=structuredClone(variants[0].normalized);changed.results[0].status='MUTATED';assert.notDeepEqual(changed,variants[0].normalized);
}
await writeFile(join(output,'summary.json'),JSON.stringify({base:'fd408c4ecd236cf97d509436085e4df461829e9e',normalization:'Map generated Run and Session IDs consistently; replace known workspace prefix only; replace generated wall-clock timestamps > 1e12 only (script timestamps 0 retained); compare decoded records, excluding no payload fields. Hash chains validated by readArchive, not semantic fields.',negativeControl:'changed status detected',reports},null,2)+'\n');
console.log('PASS',Object.keys(scenarios).length,'scenarios × base/candidate × progress/no-op; complete requests, Context, outcomes, effects and decoded archives agree');
