import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {check,digest} from './policy.mjs';
/** The calling Node process owns the credential callback and real Adapter.
 * Environment is a capability bound by the controller, never selected by model args. */
export async function runAttempt({entry,task,instruction,output,environment,gate,ledger,credentialSource,fetchImplementation,signal}){
 const {GeneralAgentSession,PanKimiModelAdapter,KimiFetchTransport,RunArchiveStore}=await import(pathToFileURL(entry));
 gate.assert(signal);ledger.start(task.id);await mkdir(output,{recursive:false});
 const controller=new AbortController(),combined=AbortSignal.any([signal??new AbortController().signal,controller.signal]);
 let secret,stoppedReason=null,session;const usage=[],effects=[];let stopPromise;
 const scrub=value=>JSON.parse(JSON.stringify(value, (k,v)=>k==='reasoning_content'?undefined:typeof v==='string'&&secret?v.split(secret).join('[REDACTED]'):v));
 const stop=reason=>{stoppedReason??=reason;controller.abort();return stopPromise??=environment.stop(reason);};
 const transport=new KimiFetchTransport({credentialSource:()=>{gate.assert(combined);secret=credentialSource();return secret;},...(fetchImplementation?{fetchImplementation}:{})});
 const bounded={async send(request){
  gate.assert(combined);check(request.path==='/chat/completions'&&request.method==='POST','endpoint_invariant');
  const payload=JSON.parse(request.body);payload.max_tokens=gate.binding.budget.maxTokens;const body=JSON.stringify(payload);
  check(Buffer.byteLength(body)<=gate.binding.budget.requestBytes,'request_size');ledger.reserve(task.id,'dispatch',combined);
  const deadline=AbortSignal.timeout(Math.max(1,Math.min(gate.binding.budget.dispatchSeconds*1000,gate.expiresAt-gate.clock())));
  const dispatchSignal=AbortSignal.any([request.signal,combined,deadline]);
  try{const response=await transport.send({...request,body,signal:dispatchSignal});
   return {status:response.status,body:(async function*(){let bytes=0;for await(const chunk of response.body){gate.assert(dispatchSignal);bytes+=chunk.byteLength;check(bytes<=gate.binding.budget.responseBytes,'response_size');yield chunk;}})()};
  }catch{stoppedReason??='dispatch_error';throw new Error('dispatch_error');}
 }};
 const inner=new PanKimiModelAdapter({modelId:'k3-256k',thinkingLevel:'high'},{transport:bounded});
 const fail=detail=>({kind:'failure',category:'protocol',detail,retryable:false,usage:{status:'unavailable'},identity:{provider:{status:'unavailable'},model:{status:'unavailable'},responseId:{status:'unavailable'}}});
 const adapter={providerId:inner.providerId,modelId:inner.modelId,reasoningLevel:inner.reasoningLevel,async exchange(request){
  const outcome=await inner.exchange(request);const u=outcome.usage?.status==='reported'?{input:outcome.usage.value.input,output:outcome.usage.value.output}:null;
  usage.push(u);ledger.usage(task.id,u);
  if(outcome.kind==='failure'){stoppedReason??=outcome.category;return {...outcome,retryable:false};}
  if(!u||!Number.isFinite(u.input)||!Number.isFinite(u.output)){stoppedReason='usage_missing';return fail('usage_missing');}
  if(secret&&JSON.stringify(outcome).includes(secret)){stoppedReason='credential_echo';return fail('credential_echo');}
  return outcome; // Preserve the Adapter private continuation identity; public fields were checked above.
 }};
 const tool={name:'task_command',description:'Execute a shell command only in the current task container. timeout is seconds and must satisfy 0 < timeout <= 30; longer commands are not allowed.',parameters:{type:'object',properties:{command:{type:'string'},timeout:{type:'number',exclusiveMinimum:0,maximum:30,description:'Seconds; greater than 0 and at most 30.'}},required:['command','timeout'],additionalProperties:false},validate:v=>v&&Object.keys(v).length===2&&typeof v.command==='string'&&v.command.length<=32768&&Number.isFinite(v.timeout)&&v.timeout>0&&v.timeout<=30?{ok:true,value:v}:{ok:false,error:'invalid_task_command: expected only command (string <=32768 characters) and timeout (seconds, 0 < timeout <= 30); resubmit valid arguments, no automatic clamping'},async execute({arguments:args,signal:toolSignal}){
  gate.assert(toolSignal);check(!secret||!args.command.includes(secret),'credential_echo');ledger.reserve(task.id,'tool',toolSignal);
  const abort=()=>{void stop('cancelled').catch(()=>{});};toolSignal.addEventListener('abort',abort,{once:true});
  let timer;try{
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{void stop('timeout').then(()=>reject(new Error('timeout')),reject);},args.timeout*1000);});
   const raw=await Promise.race([environment.exec(args.command),deadline]);const r=scrub(raw);effects.push({arguments:args,result:r});
   return {content:[{type:'text',text:JSON.stringify(r)}],isError:r.exit_code!==0||r.status!=='completed',details:r};
  }catch{const r={status:stoppedReason??'tool_error',exit_code:null,stdout:'',stderr:'task_command_failed'};effects.push({arguments:args,result:r});return {content:[{type:'text',text:JSON.stringify(r)}],isError:true,details:r};}
  finally{clearTimeout(timer);toolSignal.removeEventListener('abort',abort);}
 }};
 const cancel=()=>{session?.cancel();void stop('cancelled').catch(()=>{});};combined.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{stoppedReason='agent_timeout';controller.abort();},task.config.agent.timeout_sec*1000);
 let result,verifier=null;
 try{
  session=new GeneralAgentSession({kernel:'native',adapter,tools:[tool],systemPrompt:'Complete the supplied task using task_command. The controller fixes the destination. Do not assume verifier files are available.',limits:{maxModelTurns:gate.binding.budget.dispatchesPerTask,maxToolSteps:gate.binding.budget.toolsPerTask},memory:{archiveStore:await RunArchiveStore.open(output+'/archive'),runbook:async()=>({content:'WO75 fixed public pilot',revision:'sha256:'+digest('WO75 fixed public pilot')})}});
  result=await session.runTask(instruction);await session.close();session=undefined;
  if(!stoppedReason&&result.status!=='completed')stoppedReason=result.reason??result.status;
  if(!stoppedReason&&result.status==='completed'){gate.assert(combined);try{verifier=await environment.verify();}catch{verifier={status:'evaluation_error',rewards:null,verifier_exit_or_exception:'broker_verifier_error'};}}
 }finally{clearTimeout(timer);combined.removeEventListener('abort',cancel);await session?.close();inner.dispose();if(stopPromise)await stopPromise;}
 const report={task:task.id,agentStatus:result?.status??'failed',stopReason:stoppedReason,usage,verifier,effects:scrub(effects)};
 ledger.finish(task.id,report.stopReason??report.agentStatus);await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');return report;
}
