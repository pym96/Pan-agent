import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {check,digest,Ledger} from './policy.mjs';

/** Evaluation lifecycle only. Product Session/Adapter and official limits stay frozen. */
export async function runAttempt({entry,task,instruction,output,environment,gate,ledger,credentialSource,fetchImplementation,signal,timers=globalThis}){
 const {GeneralAgentSession,PanKimiModelAdapter,KimiFetchTransport,RunArchiveStore}=await import(pathToFileURL(entry));
 gate.assert(signal);ledger.start(task.id);await mkdir(output,{recursive:false});
 const agentAbort=new AbortController();const usage=[],effects=[],phases=[],globalStops=[];
 let phase='agent',agentReason=null,hardReason=null,secret,session,result,verifier=null,stopPromise,stopConfirmed=null,quiescence=null,quiescePromise,agentTimer,verifierTimer,verifierStopResolve;
 const mark=value=>{phase=value;phases.push({phase:value,at:performance.now()});};mark('agent');
 const scrub=value=>JSON.parse(JSON.stringify(value,(k,v)=>k==='reasoning_content'?undefined:typeof v==='string'&&secret?v.split(secret).join('[REDACTED]'):v));
 const boundedWait=(promise,ms,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error(label)),ms,label);})]).finally(()=>timers.clearTimeout(timer));};
 const stopEnvironment=reason=>stopPromise??=(async()=>{try{const r=await boundedWait(Promise.resolve().then(()=>environment.stop(reason)),35000,'environment_stop_timeout');stopConfirmed=r?.stopped===true;}catch{stopConfirmed=false;}})();
 const hard=reason=>{
  if(phase==='ended')return;
  if(!globalStops.some(x=>x.reason===reason))globalStops.push({reason,phase,at:performance.now()});
  hardReason??=reason;verifierStopResolve?.({status:'evaluation_error',rewards:null,verifier_exit_or_exception:hardReason});agentAbort.abort();session?.cancel();void stopEnvironment(reason);
 };
 const quiesce=()=>quiescePromise??=(async()=>{
  try{quiescence=await boundedWait(Promise.resolve().then(()=>environment.quiesce()),15000,'handoff_timeout');}
  catch{quiescence={confirmed:false,reason:'handoff_failed'};}
  if(quiescence?.confirmed!==true)hard('command_stop_unconfirmed');
  return quiescence;
 })();
 const soft=reason=>{
  if(phase!=='agent'||hardReason)return;
  agentReason??=reason;mark('handoff');timers.clearTimeout(agentTimer);
  // Close broker admission before cancelling the product's in-flight tool signal.
  void quiesce();agentAbort.abort();session?.cancel();
 };
 const gateCheck=()=>{try{gate.assert(signal);}catch(e){hard(e.message==='activation_expired'?'activation_expired':'cancelled');throw e;}};
 const admit=()=>{gateCheck();check(phase==='agent'&&!agentAbort.signal.aborted,'agent_closed');};
 const reserve=kind=>{
  admit();
  // Only a failure thrown by the frozen Ledger method is eligible. Adapter/tool
  // strings, transport errors and arbitrary exceptions cannot authorize grading.
  try{Ledger.prototype.reserve.call(ledger,task.id,kind,agentAbort.signal);}
  catch(e){if(e.message===(kind==='dispatch'?'dispatch_budget':'tool_budget'))soft(e.message);else hard('ledger_error');throw e;}
 };
 const transport=new KimiFetchTransport({credentialSource:()=>{admit();secret=credentialSource();return secret;},...(fetchImplementation?{fetchImplementation}:{})});
 const bounded={async send(request){
  admit();check(request.path==='/chat/completions'&&request.method==='POST','endpoint_invariant');
  const payload=JSON.parse(request.body);payload.max_tokens=gate.binding.budget.maxTokens;const body=JSON.stringify(payload);
  check(Buffer.byteLength(body)<=gate.binding.budget.requestBytes,'request_size');reserve('dispatch');
  const deadline=AbortSignal.timeout(Math.max(1,Math.min(gate.binding.budget.dispatchSeconds*1000,gate.expiresAt-gate.clock())));
  const dispatchSignal=AbortSignal.any([request.signal,agentAbort.signal,deadline]);
  try{const response=await transport.send({...request,body,signal:dispatchSignal});
   return {status:response.status,body:(async function*(){let bytes=0;for await(const chunk of response.body){admit();dispatchSignal.throwIfAborted();bytes+=chunk.byteLength;check(bytes<=gate.binding.budget.responseBytes,'response_size');yield chunk;}})()};
  }catch{agentReason??='dispatch_error';throw Error('dispatch_error');}
 }};
 const inner=new PanKimiModelAdapter({modelId:'k3-256k',thinkingLevel:'high'},{transport:bounded});
 const fail=detail=>({kind:'failure',category:'protocol',detail,retryable:false,usage:{status:'unavailable'},identity:{provider:{status:'unavailable'},model:{status:'unavailable'},responseId:{status:'unavailable'}}});
 const adapter={providerId:inner.providerId,modelId:inner.modelId,reasoningLevel:inner.reasoningLevel,async exchange(request){
  const outcome=await inner.exchange(request);const u=outcome.usage?.status==='reported'?{input:outcome.usage.value.input,output:outcome.usage.value.output}:null;
  usage.push(u);ledger.usage(task.id,u);
  if(outcome.kind==='failure'){agentReason??=outcome.category;return {...outcome,retryable:false};}
  if(!u||!Number.isFinite(u.input)||!Number.isFinite(u.output)){agentReason??='usage_missing';return fail('usage_missing');}
  if(secret&&JSON.stringify(outcome).includes(secret)){agentReason??='credential_echo';return fail('credential_echo');}
  return outcome;
 }};
 const tool={name:'task_command',description:'Execute a shell command only in the current task container. timeout is seconds and must satisfy 0 < timeout <= 30; longer commands are not allowed.',parameters:{type:'object',properties:{command:{type:'string'},timeout:{type:'number',exclusiveMinimum:0,maximum:30,description:'Seconds; greater than 0 and at most 30.'}},required:['command','timeout'],additionalProperties:false},validate:v=>v&&Object.keys(v).length===2&&typeof v.command==='string'&&v.command.length<=32768&&Number.isFinite(v.timeout)&&v.timeout>0&&v.timeout<=30?{ok:true,value:v}:{ok:false,error:'invalid_task_command: expected only command (string <=32768 characters) and timeout (seconds, 0 < timeout <= 30); resubmit valid arguments, no automatic clamping'},async execute({arguments:args,signal:toolSignal}){
  admit();toolSignal.throwIfAborted();check(!secret||!args.command.includes(secret),'credential_echo');reserve('tool');
  const abort=()=>{if(phase==='handoff'&&!hardReason)void quiesce();else hard('cancelled');};toolSignal.addEventListener('abort',abort,{once:true});
  try{
   const r=scrub(await boundedWait(environment.exec(args.command,args.timeout),(args.timeout+15)*1000,'command_stop_unconfirmed'));effects.push({arguments:args,result:r});
   if(r.status==='stop_unconfirmed'||r.status==='timeout'&&r.termination?.confirmed!==true)hard('command_stop_unconfirmed');
   if(phase==='agent'&&!hardReason)gateCheck();
   return {content:[{type:'text',text:JSON.stringify(r)}],isError:r.exit_code!==0||r.status!=='completed',details:r};
  }catch{
   if(phase==='agent'&&!hardReason)hard('tool_error');
   const r={status:hardReason??agentReason??'tool_error',exit_code:null,stdout:'',stderr:'task_command_failed'};
   if(!effects.some(e=>e.arguments===args))effects.push({arguments:args,result:r});return {content:[{type:'text',text:JSON.stringify(r)}],isError:true,details:r};
  }finally{toolSignal.removeEventListener('abort',abort);}
 }};
 const cancel=()=>hard('cancelled');signal?.addEventListener('abort',cancel,{once:true});
 agentTimer=timers.setTimeout(()=>soft('agent_timeout'),task.config.agent.timeout_sec*1000,'agent');
 const expiryTimer=timers.setTimeout(()=>hard('activation_expired'),Math.max(1,gate.expiresAt-gate.clock()),'expiry');
 try{
  session=new GeneralAgentSession({kernel:'native',adapter,tools:[tool],systemPrompt:'Complete the supplied task using task_command. The controller fixes the destination. Do not assume verifier files are available.',limits:{maxModelTurns:gate.binding.budget.dispatchesPerTask,maxToolSteps:gate.binding.budget.toolsPerTask},memory:{archiveStore:await RunArchiveStore.open(output+'/archive'),runbook:async()=>({content:'WO75 fixed public pilot',revision:'sha256:'+digest('WO75 fixed public pilot')})}});
  gateCheck();
  // The product and transport respect cancellation; this additional bound covers
  // broken implementations without permitting verification of uncertain activity.
  result=await boundedWait(session.runTask(instruction),task.config.agent.timeout_sec*1000+15000,'agent_settlement_timeout');
  timers.clearTimeout(agentTimer);
  await boundedWait(session.close(),15000,'session_close_timeout');session=undefined;
  if(!agentReason&&result.status!=='completed')agentReason=result.reason??result.status;
  const eligible=(!agentReason&&result.status==='completed')||['agent_timeout','turn_limit','step_limit','dispatch_budget','tool_budget'].includes(agentReason);
  if(eligible&&!hardReason){
   if(phase==='agent'){mark('handoff');agentAbort.abort();}
   await quiesce();gateCheck();
   if(!hardReason){
    mark('verifier');
    let timeoutResolve;const timeout=new Promise(resolve=>timeoutResolve=resolve);
    verifierTimer=timers.setTimeout(()=>{hard('verifier_timeout');timeoutResolve({status:'evaluation_error',rewards:null,verifier_exit_or_exception:'verifier_timeout'});},task.config.verifier.timeout_sec*1000,'verifier');
    const stopped=new Promise(resolve=>verifierStopResolve=resolve);
    const onAbort=()=>{if(hardReason)verifierStopResolve?.({status:'evaluation_error',rewards:null,verifier_exit_or_exception:hardReason});};
    const onGlobal=()=>onAbort();signal?.addEventListener('abort',onGlobal,{once:true});
    const pending=Promise.resolve().then(()=>{gateCheck();if(hardReason)throw Error('global_stop');return environment.verify();}).then(value=>{if(phase==='verifier'&&!hardReason)verifier=value;return value;},()=>({status:'evaluation_error',rewards:null,verifier_exit_or_exception:'broker_verifier_error'}));
    // Hard stops settle this race immediately; broker stop independently bounds
    // actual external effects even if its verifier promise never settles.
    try{const value=await Promise.race([pending,timeout,stopped]);if(verifier===null)verifier=value;}
    finally{signal?.removeEventListener('abort',onGlobal);timers.clearTimeout(verifierTimer);}
   }
  }
 }catch{hard(hardReason??'attempt_error');}
 finally{
  timers.clearTimeout(agentTimer);timers.clearTimeout(verifierTimer);timers.clearTimeout(expiryTimer);
  if(session){session.cancel();try{await boundedWait(session.close(),15000,'session_close_timeout');}catch{hard('session_stop_unconfirmed');}}
  inner.dispose();await stopEnvironment(hardReason??'attempt_complete');signal?.removeEventListener('abort',cancel);mark('ended');
 }
 const report={task:task.id,agentStatus:result?.status??'failed',agentStopReason:agentReason,stopReason:agentReason??hardReason,globalStops,stopConfirmed,quiescence,phases,usage,verifier,effects:scrub(effects)};
 ledger.finish(task.id,report.stopReason??report.agentStatus);await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');return report;
}
