// Explicit offline driver invokes the same public parser/controller. Not a production CLI switch.
import {main} from './full-cli.mjs';
import {runAttempt} from './session.mjs';
import {wire} from './test_handoff_support.mjs';
import {readFileSync,appendFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const fixture=JSON.parse(readFileSync(process.argv[2])),root=fixture.root;
const effect=(kind,task,extra={})=>appendFileSync(join(root,'effects.jsonl'),JSON.stringify({kind,task,...extra})+'\n');
const scenarios=fixture.scenarios??{},unknown=fixture.unknownStop??[];
const packageLock=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));
const deps={home:fixture.home,mode:fixture.mode??'offline-control',runnerSha:()=>fixture.runner,verifyProduct:()=>packageLock,internal:()=>{},configure:()=>{},sample:()=>({utc:new Date().toISOString(),free:fixture.free??100*2**30,owned:fixture.owned??0,docker:fixture.docker??0}),credentialSource:()=>{effect('credential');return 'synthetic-only';},
 sampleRecovery:()=>({utc:new Date().toISOString(),free:fixture.free??100*2**30,owned:fixture.owned??0,docker:fixture.docker??48503971840}),
 inspectResidual:async r=>({confirmed:!fixture.oldStopUnknown,project:r.project}),
 prepare:async task=>{effect('prepare',task.id);const scenario=scenarios[task.id];return scenario==='not_cached'?{ready:false,reason:'image_not_cached',global:false}:scenario==='global_prepare'?{ready:false,reason:'docker_unavailable',global:true}:{ready:true,image:'sha256:'+'a'.repeat(64),architecture:'amd64',os:'linux',sourceValidated:true};},
 reconcile:async(project,image,{stop})=>{effect('cleanup',project,{stop});return {confirmed:!unknown.includes(project),project};},
 openBroker:({config})=>{effect('start',config.task.id,{project:config.project,resources:config.task.config.environment});if(scenarios[config.task.id]==='environment')throw Error('fake_environment_failure');return {ready:Promise.resolve('synthetic instruction'),stop:async()=>({stopped:true}),close:async()=>{},exec:async()=>({status:'completed',exit_code:0,stdout:'synthetic',stderr:'',wait:{settled:true}}),verify:async()=>{const vf=join(config.output,'verifier');mkdirSync(vf,{recursive:true});writeFileSync(join(vf,'reward.txt'),'1');writeFileSync(join(vf,'ctrf.json'),JSON.stringify({results:{summary:{tests:1,passed:1,failed:0}}}));return {status:'official_scored',rewards:{reward:1}};},quiesce:async()=>({confirmed:true})};},
 checkpoint:async(stage,task)=>{if(fixture.crash===stage&&(!fixture.crashTask||fixture.crashTask===task)){effect('crash',task,{stage});process.exit(73);}if(fixture.dropFreeAt===stage)fixture.free=20*2**30-1;if(fixture.growDiskAt===stage)fixture.docker=54*2**30;if(fixture.hold===stage){effect('hold',task,{stage});await delay(fixture.holdMs??1500);}},
 runAttempt:async({task,ledger,output,signal})=>{
  effect('model',task.id);ledger.record(task.id,{event:'exchange_started',exchange:1,modelRound:1});ledger.reserve(task.id,'dispatch',signal);ledger.record(task.id,{event:'send_entered',exchange:1});
  if(scenarios[task.id]==='retry'){ledger.usage(task.id,null);ledger.record(task.id,{event:'exchange_failed',exchange:1,modelRound:1,reason:'synthetic_transport'});ledger.record(task.id,{event:'retry_scheduled',exchange:1});ledger.record(task.id,{event:'exchange_started',exchange:2,modelRound:1});ledger.reserve(task.id,'dispatch',signal);ledger.record(task.id,{event:'send_entered',exchange:2});}
  ledger.usage(task.id,{input:10,output:2});ledger.record(task.id,{event:'exchange_completed',exchange:scenarios[task.id]==='retry'?2:1,modelRound:1});ledger.reserve(task.id,'tool',signal);ledger.finish(task.id,'synthetic_completed');
  const vf=join(dirname(output),'harbor/verifier');mkdirSync(vf,{recursive:true});const scenario=scenarios[task.id];
  const raw=scenario==='valid_failure'||scenario==='prep_zero'?0:1;
  if(!['model','global'].includes(scenario)){writeFileSync(join(vf,'reward.txt'),String(raw));if(scenario!=='prep_zero')writeFileSync(join(vf,'ctrf.json'),JSON.stringify({results:{summary:{tests:1,passed:raw,failed:1-raw}}}));}
  const report={task:task.id,stopConfirmed:true,globalStops:scenario==='global'?[{reason:'quota_exhausted'}]:[],agentStopReason:scenario==='model'?'synthetic_model_failure':null,verifier:['model','global'].includes(scenario)?null:{status:'official_scored'}};
  mkdirSync(output,{recursive:true});writeFileSync(join(output,'report.json'),JSON.stringify(report));return report;
 }};
if(fixture.realSession){let calls=0;deps.runAttempt=runAttempt;deps.fetchImplementation=async()=>new Response(wire(++calls===1?'synthetic-command':null));}
if(fixture.handoff103){
 const first=Object.keys(scenarios)[0],scenario=scenarios[first];let release;
 const oldCheckpoint=deps.checkpoint;
 deps.checkpoint=async(stage,task)=>{await oldCheckpoint(stage,task);if(scenario==='archive_failure'&&stage==='before_archive'&&task===first)throw Error('synthetic_archive_failure');};
 const oldBroker=deps.openBroker;
 deps.openBroker=options=>{const b=oldBroker(options);if(options.config.task.id===first){b.exec=()=>new Promise(resolve=>{release=resolve;});b.stop=async()=>{if(scenario!=='never_settles')release?.({status:'interrupted',exit_code:null,stdout:'',stderr:'',wait:{settled:true}});return {stopped:scenario!=='stop_unknown'};};}return b;};
 deps.runAttempt=async args=>{
  const jobs=[];const timers={setTimeout(fn,ms,label){const t={fn,label,active:true};jobs.push(t);if(['session_close_timeout','recovery_timeout'].includes(label))setTimeout(()=>{if(t.active){t.active=false;fn();}},label==='recovery_timeout'?100:0);return t;},clearTimeout(t){if(t)t.active=false;}};
  const fire=label=>{const t=jobs.findLast(t=>t.label===label&&t.active);if(!t)throw Error('missing timer '+label);t.active=false;t.fn();};
  let n=0;const environment=args.environment;
  const oldExec=environment.exec.bind(environment);
  environment.exec=(...a)=>{const pending=oldExec(...a);if(args.task.id===first)setImmediate(()=>{fire('agent');fire('agent_settlement_timeout');});return pending;};
  return runAttempt({...args,timers,fetchImplementation:async()=>new Response(wire(args.task.id===first&&++n===1?'synthetic-command':null))});
 };
}
// #103 raw-source regression: actual core/transport/controller, only host and source timing are synthetic.
if(fixture.sourceSettlement103){
 const {GeneralAgentSession}=await import((await import('node:url')).pathToFileURL(fixture.entry));
 const original=GeneralAgentSession.prototype.close;let attempt=0,releaseReturn,releaseRead,rawSettled=false;
 deps.runAttempt=async args=>{
  attempt++;
  if(attempt>1){effect('next_after_source',args.task.id,{rawSettled});return runAttempt({...args,fetchImplementation:async()=>new Response(wire())});}
  const mode=fixture.sourceSettlement103,jobs=[];
  const timers={setTimeout(fn,ms,label){const t={fn,label,active:true};jobs.push(t);
   if(label==='recovery_timeout'){
    if(mode==='finite')setTimeout(()=>releaseReturn?.(),10);
    setTimeout(()=>{if(t.active){t.active=false;fn();}},100);
   }
   return t;
  },clearTimeout(t){if(t)t.active=false;}};
  const fire=label=>{const t=jobs.findLast(t=>t.label===label&&t.active);if(!t)throw Error('missing timer '+label);t.active=false;t.fn();};
  GeneralAgentSession.prototype.close=async function(){await original.call(this);await new Promise(resolve=>setImmediate(()=>{fire('session_close_timeout');setImmediate(resolve)}));};
  const body={ [Symbol.asyncIterator](){let sent=false;return {
   next(){if(mode==='read_pending')return new Promise(resolve=>{releaseRead=()=>{effect('raw_read_settled',args.task.id);resolve({done:true});};setImmediate(()=>fire('agent'));});if(sent)return Promise.resolve({done:true});sent=true;return Promise.resolve({done:false,value:new TextEncoder().encode(wire())});},
   return(){effect('raw_return_started',args.task.id);if(mode==='read_pending')return Promise.resolve({done:true});return new Promise((resolve,reject)=>{releaseReturn=()=>{rawSettled=true;effect('raw_return_settled',args.task.id);resolve({done:true});};if(mode==='rejected')reject(Object.assign(new Error('synthetic cleanup failure'),{code:'EPIPE'}));});}
  };}};
  try{
   const report=await runAttempt({...args,timers,fetchImplementation:async()=>({status:200,headers:new Headers(),body})});
   effect('source_report',args.task.id,{rawSettled,continuation:report.continuation,pendingOperations:report.pendingOperations});
   // Release deliberately late only after an immutable report; never reinterpret it as permission.
   releaseRead?.();if(!rawSettled)releaseReturn?.();await new Promise(resolve=>setImmediate(resolve));
   return report;
  }finally{GeneralAgentSession.prototype.close=original;}
 };
}
try{await main(process.argv.slice(3),deps);}catch(e){console.error(e.message);process.exitCode=1;}
