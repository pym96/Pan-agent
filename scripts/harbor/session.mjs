// Installed Pan only. JSON-lines IPC has one controller-bound container tool.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const lines=createInterface({input:process.stdin});
const pending=new Map();let configure;
const configured=new Promise(resolve=>configure=resolve);
lines.on('line',line=>{const msg=JSON.parse(line);if(msg.config)configure(msg.config);else if(msg.started){if(config.mode==='cancel')session.cancel();}else {const p=pending.get(msg.id);if(p){pending.delete(msg.id);p(msg.result);}}});
const config=await configured;
const {GeneralAgentSession,FauxModelAdapter,RunArchiveStore}=await import(pathToFileURL(config.installedEntry));
const effects=[],observations=[],inflight=[];
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const usage={status:'reported',value:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
const identity={provider:{status:'reported',value:'synthetic-zero-model'},model:{status:'reported',value:'wo74-script'},responseId:{status:'unavailable'}};
const response=content=>({kind:'response',message:{role:'assistant',content,timestamp:10},stopReason:content[0].type==='tool_call'?'tool_calls':'stop',usage,identity});
const commands=config.commands;
const script=commands.map((command,i)=>response([{type:'tool_call',id:'wo74-'+i,name:'task_command',arguments:{command,timeout:config.mode==='timeout'?1:30}}]));
script.push(response([{type:'text',text:'Scripted control finished; task success is determined only by the official verifier.'}]));
const tool={name:'task_command',description:'Execute only in the controller-bound Harbor task environment',parameters:{type:'object',properties:{command:{type:'string'},timeout:{type:'number'}},required:['command','timeout'],additionalProperties:false},validate:v=>v&&Object.keys(v).every(k=>['command','timeout'].includes(k))&&typeof v.command==='string'&&v.command.length<=32768&&Number.isFinite(v.timeout)&&v.timeout>0&&v.timeout<=30?{ok:true,value:v}:{ok:false,error:'invalid command'},execute:({toolCallId,arguments:args,signal})=>{
 const promise=(async()=>{const reply=new Promise(resolve=>pending.set(toolCallId,resolve));const cancel=()=>send({cancel:toolCallId});signal.addEventListener('abort',cancel,{once:true});send({execute:toolCallId,arguments:args});if(signal.aborted)cancel();let r;try{r=await reply;}finally{signal.removeEventListener('abort',cancel);}effects.push({toolCallId,arguments:args,result:r});return {content:[{type:'text',text:JSON.stringify(r)}],isError:r.status!=='completed'||r.exit_code!==0,details:r};})();inflight.push(promise);return promise;
}};
await mkdir(config.output,{recursive:true});
const session=new GeneralAgentSession({kernel:'native',adapter:new FauxModelAdapter(script),tools:[tool],systemPrompt:'Public hello-world development control. Synthetic zero usage; no real model.',limits:{maxModelTurns:12,maxToolSteps:10},memory:{archiveStore:await RunArchiveStore.open(config.output+'/archive'),runbook:async()=>({content:'WO74 zero-model',revision:'sha256:'+createHash('sha256').update('WO74 zero-model').digest('hex')})},onObservation:e=>observations.push(e)});
let result;
try{result=await session.runTask(config.instruction);}finally{await session.close();await Promise.allSettled(inflight);}
await writeFile(config.output+'/trace.json',JSON.stringify({instruction:config.instruction,registeredTools:[tool.name],usageMeaning:'synthetic zero, not measured model usage',realProviderCalls:0,result,effects,observations},null,2)+'\n');
send({done:result.status});lines.close();process.stdin.destroy();
