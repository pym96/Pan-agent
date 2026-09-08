/** Real CLI/TUI and real Pan tools. Only offline Adapter input is pipe-controlled. */
import assert from 'node:assert/strict';
import {createReadStream,writeSync} from 'node:fs';
import {writeFile,readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {event,ending,wire,partition,response,hidden,hostile} from './streaming-wire.mjs';
const [product,workspace,memory,provider,mode,partitionMode,controlFd,eventFd]=process.argv.slice(2);
const compiled=product.endsWith('/pan-agent');const source=resolve(product,compiled?'dist':'typescript/src');const ext=compiled?'js':'ts';
const {runCli,PanDeepSeekModelAdapter,DeepSeekFetchTransport,FauxModelAdapter,createCompactPresentation}=await import(pathToFileURL(join(source,'index.'+ext)));
const {createPanTrustedLocalTools}=await import(pathToFileURL(join(source,'tools/pan-trusted-local-tools.'+ext)));
let sequence=0;const notify=e=>writeSync(Number(eventFd),JSON.stringify({sequence:++sequence,...e})+'\n');
const pending=new Map();const controls=createInterface({input:createReadStream('',{fd:Number(controlFd),autoClose:false})});
controls.on('line',line=>{pending.get(line)?.();pending.delete(line);notify({control:line});});
function barrier(name){notify({barrier:name});return new Promise(resolve=>pending.set(name,resolve));}
const encoder=new TextEncoder();let exchanges=0,syntheticCredentials=0,sourceCleanup=0,progressCount=0,afterTerminal=0,terminals=0,unhandled=0,effects=0,toolStarts=0,closedTurn=false,networkAttempts=0;
const requests=[],outcomes=[],progress=[],observations=[],results=[];
process.on('unhandledRejection',()=>{unhandled++;});globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline fixture forbids real network');};
const blockingCall={id:'blocking',name:'bash',arguments:{command:'printf ready > started; sleep 30; printf late > must-not-exist'}};
const texts=mode==='safety'?['Hello, ',...Array.from(hostile)]:['Hello, ','世界','!\n'];
let lateSource;
function sendChunks(controller,text){for(const part of partition(encoder.encode(text),partitionMode))controller.enqueue(part);}
let delegate;
if(provider==='deepseek')delegate=new PanDeepSeekModelAdapter(undefined,{transport:new DeepSeekFetchTransport({credentialSource:()=>{syntheticCredentials++;return 'offline-synthetic';},fetchImplementation:async(_url,init)=>{
 const index=exchanges-1;requests.push(JSON.parse(init.body));init.signal.addEventListener('abort',()=>notify({abort:true}),{once:true});
 if(index>0)return new Response(wire(['next answer 中文']));
 return new Response(new ReadableStream({start(controller){lateSource=controller;notify({sourceRelease:'prefix'});sendChunks(controller,event({content:texts[0],...hidden},null,hidden));void barrier('source').then(()=>{
  notify({sourceRelease:'remaining'});
  try{if(mode==='cancel'){sendChunks(controller,wire(['LATE_AFTER_CANCEL']));controller.close();notify({lateProducer:'delivered'});return;}
   if(mode==='broken'){controller.error(new Error('HIDDEN_TRANSPORT_ERROR'));return;}
   for(const text of texts.slice(1))sendChunks(controller,event({content:text,...hidden}));
   if(mode==='malformed')sendChunks(controller,'data: {\n\n');else if(mode==='identity')sendChunks(controller,event({},'stop',{id:'changed'})+'data: [DONE]\n\n');else if(mode==='toolcancel')sendChunks(controller,event({tool_calls:[{index:0,id:blockingCall.id,type:'function',function:{name:'bash',arguments:JSON.stringify(blockingCall.arguments)}}]},'tool_calls')+'data: [DONE]\n\n');else sendChunks(controller,ending(mode==='length'?'length':'stop'));
   controller.close();
  }catch{notify({lateProducer:'closed'});}
 });},cancel(){sourceCleanup++;notify({sourceCleanup});}}));
}})});
else delegate=new FauxModelAdapter([response(texts.join(''),mode==='toolcancel'?[blockingCall]:[]),response('next answer 中文')],{progress:index=>({[Symbol.asyncIterator](){let n=0;return {async next(){if(index>0)return {done:true};if(n++===0){notify({sourceRelease:'prefix'});return {done:false,value:texts[0]};}if(n===2){await barrier('source');notify({sourceRelease:'remaining'});if(mode==='broken')throw new Error('scripted producer failure');}if(n-1<texts.length)return {done:false,value:texts[n-1]};return {done:true};},async return(){sourceCleanup++;notify({sourceCleanup});return {done:true};}};}})});
const adapter={providerId:delegate.providerId,modelId:delegate.modelId,reasoningLevel:delegate.reasoningLevel,async exchange(request){closedTurn=false;exchanges++;notify({exchange:'pending',exchanges});const outcome=await delegate.exchange(request);outcomes.push(outcome);notify({exchange:'settled',outcome});closedTurn=true;return outcome;}};
try {
 const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter,createTools:cwd=>{const real=createPanTrustedLocalTools(cwd);return {...real,tools:real.tools.map(tool=>({...tool,async execute(invocation){effects++;return tool.execute(invocation);}}))};},createPresentation:write=>{const view=createCompactPresentation(write);return {...view,progress(p){if(closedTurn)afterTerminal++;progressCount++;progress.push(p);notify({parsedProgress:p});view.progress(p);if(mode==='observer'&&progressCount===1)throw new Error('HIDDEN_OBSERVER_ERROR');},observe(e){observations.push(e);if(e.type==='tool.started')toolStarts++;if(e.type==='run.terminal')terminals++;view.observe(e);},settle(result){view.settle(result);results.push(result);notify({settled:result});},details(){view.details();notify({view:'details'});},replay(records,id){view.replay(records,id);notify({view:'replay'});}};}});
 const archives=[];for(const result of results){const file=join(memory,'runs',result.runId,'events.jsonl');const bytes=await readFile(file,'utf8');assert.doesNotMatch(bytes,/HIDDEN_|LATE_AFTER_CANCEL|text_delta/);archives.push(bytes);}
 const report={code,provider,mode,partitionMode,exchanges,syntheticCredentials,sourceCleanup,progressCount,afterTerminal,terminals,unhandled,effects,toolStarts,networkAttempts,requests:provider==='faux'?delegate.state.requests:requests,outcomes,progress,observations,results,archives};
 await writeFile(join(workspace,'..','report.json'),JSON.stringify(report,null,2)+'\n');notify({exit:code,exchanges,sourceCleanup,afterTerminal,terminals,unhandled,effects,toolStarts,networkAttempts});
}finally{controls.close();}
process.exit();
