/** Actual CLI fixture. Parent controls only deterministic Adapter/Tool barriers. */
import {createReadStream,writeSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const [root,workspace,memory,mode,controlFd,eventFd]=process.argv.slice(2);
const {runCli,runTui,FauxModelAdapter,FAUX_PENDING_EXCHANGE,createCompactPresentation}=await import(pathToFileURL(resolve(root,'typescript/src/index.ts')));
const {createPanTrustedLocalTools}=await import(pathToFileURL(resolve(root,'typescript/src/tools/pan-trusted-local-tools.ts')));
const notify=event=>writeSync(Number(eventFd),JSON.stringify(event)+'\n');
const pending=new Map();const controls=createInterface({input:createReadStream('',{fd:Number(controlFd),autoClose:false})});
controls.on('line',line=>{pending.get(line)?.();pending.delete(line);});
function barrier(name,signal){notify({barrier:name});if(signal?.aborted)return Promise.resolve();return new Promise(resolve=>{pending.set(name,resolve);signal?.addEventListener('abort',resolve,{once:true});});}
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(text,calls=[])=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls]},stopReason:calls.length?'tool_calls':'stop',identity,usage:{status:'unavailable'}});
class GatedFaux extends FauxModelAdapter {
 async exchange(request){const index=this.state.exchangeCount;const returned=super.exchange(request);if(index===0){if(mode==='busy')await barrier('model',request.signal);else notify({barrier:'model'});}return returned;}
}
const hostile='正常中文\x1b[2J\x1b]52;c;YQ==\x07\r你 › \b\x7f'+Array.from({length:32},(_,i)=>String.fromCodePoint(128+i)).join('')+'\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u2028\u2029\n已完成';
const hidden={reasoning_content:'HIDDEN_REASON',thinking:'HIDDEN_THINK',authorization:'HIDDEN_AUTH',api_key:'HIDDEN_KEY',unknown:'HIDDEN_UNKNOWN'};
const safety=[response(hostile,[{type:'tool_call',id:'hostile',name:hostile,arguments:{path:hostile}}]),{kind:'failure',category:'protocol',detail:hostile,retryable:false,identity,usage:{status:'unavailable'}}];
const adapter=new GatedFaux(mode==='safety'?safety:mode==='busy'?[response('',[{type:'tool_call',id:'first-bash',name:'bash',arguments:{command:'printf actual-tool'}}]),response('first final'),response('第二个 final')]:[FAUX_PENDING_EXCHANGE,response('after cancellation')],mode==='safety'?{providerId:hostile,modelId:hostile}:{});
const originalFetch=globalThis.fetch;let forbidden=0;globalThis.fetch=async()=>{forbidden++;throw new Error('real network forbidden');};
try {
const exit=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter,createTools:cwd=>{const real=createPanTrustedLocalTools(cwd);return {...real,tools:real.tools.map(tool=>({...tool,async execute(invocation){await barrier('tool',invocation.signal);return tool.execute(invocation);}}))};},createPresentation:write=>{const view=createCompactPresentation(write);return {...view,observe(event){view.observe(mode==='safety'?{...event,...hidden}:event);notify({observation:event.type});},settle(result){view.settle(result);notify({settled:result});},details(){view.details();notify({view:'details'});},replay(records,id){view.replay(mode==='safety'?records.map(record=>({...record,...hidden})):records,id);notify({view:'replay'});}};}});
notify({exit,requests:adapter.state.requests,exchangeCount:adapter.state.exchangeCount,forbidden});
} finally {globalThis.fetch=originalFetch;controls.close();process.exitCode=0;}
process.exit();
