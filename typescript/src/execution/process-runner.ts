import { fork, spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';
import { mkdir,open,readdir,lstat,writeFile,readFile } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { DockerSandbox } from '../sandbox/docker.ts';
import type { Admission, AccountingSink, BudgetLedger } from './admission.ts';
import { identity, type Attempt,type TaskRunner,type Verdict } from './controller.ts';
import type { WorkerConfig } from './worker.ts';
import type { ApprovalChannel } from '../runtime/authorization.ts';
export interface VerifierSpec {version:string;command:string;seconds:number}
export interface ProcessRunnerConfig {worker:WorkerConfig;durationMs:number;root:string;verifier?:VerifierSpec;approval:ApprovalChannel;record:AccountingSink}
export async function treeManifest(root:string):Promise<{path:string;bytes:number;sha256:string}[]> {
 const files:{path:string;bytes:number;sha256:string}[]=[];let bytes=0;
 async function visit(rel:string){
  const path=join(root,rel);const stat=await lstat(path);
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||(stat.isFile()&&stat.nlink!==1))throw Error('candidate_unsafe_entry');
  if(stat.isDirectory()){for(const name of (await readdir(path)).sort())await visit(rel?`${rel}/${name}`:name);return;}
  bytes+=stat.size;if(bytes>64*1024*1024||files.length>=1000)throw Error('candidate_limit');
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await fd.stat();if(before.dev!==stat.dev||before.ino!==stat.ino)throw Error('candidate_changed');const data=await fd.readFile();const after=await fd.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('candidate_changed');files.push({path:rel,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}finally{await fd.close();}
 }
 await visit('');return files;
}
async function copySnapshot(source:string,dest:string){const manifest=await treeManifest(source);await mkdir(dest,{recursive:false});for(const f of manifest){const data=await readFile(join(source,f.path));if(createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('candidate_changed');const p=join(dest,f.path);await mkdir(dirname(p),{recursive:true});await writeFile(p,data,{flag:'wx',mode:0o400});}if(identity(await treeManifest(dest))!==identity(manifest))throw Error('snapshot_mismatch');return manifest;}
/** Two existing owners share a pre-effect identity: either healthy event loop can stop the verifier. */
export function runVerifier(command:string,cwd:string,seconds:number,signal:AbortSignal,record:AccountingSink=async()=>{}):Promise<{code:number|null;stdout:string;stderr:string}> {
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('verifier_cancelled'));return;}
  const child=fork(fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./verifier-executor.ts':'./verifier-executor.js',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:['--max-old-space-size=128']});
  let settled=false,stopping=false,executorExited=false,owned:{pid:number;birth:string}|undefined;
  const birth=(pid:number)=>{try{return execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:200}).trim();}catch{return '';}};
  const alive=()=>{if(!owned)return false;try{return execFileSync('ps',['-axo','pgid=,stat='],{encoding:'utf8',timeout:200,maxBuffer:4*1024*1024}).split('\n').some(l=>{const [g,state]=l.trim().split(/\s+/);return Number(g)===owned!.pid&&state&&!state.startsWith('Z');});}catch{return true;}};
  const finish=(error?:Error,result?:{code:number|null;stdout:string;stderr:string})=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(child.connected)child.disconnect();error?reject(error):resolve(result!);};
  const stop=async(reason:string)=>{
   if(settled||stopping)return;stopping=true;let uncertain=false;
   if(owned){const current=birth(owned.pid);if(current&&current!==owned.birth)uncertain=true;else try{process.kill(-owned.pid,'SIGKILL');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')uncertain=true;}}
   // Continue only our direct executor so it can reap its now-killed child; do not rely on that to kill the group.
   child.kill('SIGCONT');if(child.connected)child.send({type:'stop'});
   const until=performance.now()+1000;while((alive()||!executorExited)&&performance.now()<until)await new Promise(r=>setTimeout(r,25));
   const confirmed=!uncertain&&!!owned&&!alive();child.kill('SIGKILL');
   try{await record({type:'verifier.stop',reason,confirmed,executorPid:child.pid,owned});}catch{}
   finish(Error(confirmed?reason:'verifier_stop_unconfirmed'));
  };
  const abort=()=>{void stop('verifier_cancelled');};
  const timer=setTimeout(()=>{void stop('verifier_timeout');},seconds*1000);
  signal.addEventListener('abort',abort,{once:true});
  child.on('message',(m:any)=>{
   if(m?.type==='owned'&&!owned&&!stopping){
    if(!Number.isSafeInteger(m.pid)||m.pid<=1||!m.birth||birth(m.pid)!==m.birth){void stop('verifier_identity_unknown');return;}
    owned={pid:m.pid,birth:m.birth};
    void record({type:'verifier.owned',executorPid:child.pid,...owned}).then(()=>{if(!settled&&!stopping&&child.connected)child.send({type:'ownership_ack'});},()=>{void stop('verifier_ownership_record_failed');});return;
   }
   if(m?.type==='result'&&!stopping){if(alive()){void stop('verifier_descendants_remaining');return;}finish(m.error?Error(m.error):undefined,m.result);}
  });
  child.on('error',()=>{void stop('verifier_executor_error');});child.on('exit',()=>{executorExited=true;if(!settled&&!stopping)void stop('verifier_executor_exited');});
  child.send({type:'start',command,cwd,seconds});if(signal.aborted)abort();
 });
}
export class ProcessTaskRunner implements TaskRunner {
 private config:ProcessRunnerConfig;private child?:ChildProcess;private ready?:Promise<void>;private onReady?:()=>void;private failReady?:(e:Error)=>void;
 private pending?:{resolve:(a:Attempt)=>void;reject:(e:Error)=>void};private ledger?:BudgetLedger;private admission?:Admission;private stopped?:Promise<boolean>;private confirmStop?:(b:boolean)=>void;
 private stopResult?:Promise<boolean>;private generationSettled=true;
 private currentSandbox?:string;private boxes=new Set<string>();private stopCalled=false;private activeAttempt?:string;private serial:Promise<unknown>=Promise.resolve();private verifier?:VerifierSpec;private verifierIdentity?:string;
 constructor(config:ProcessRunnerConfig){this.config=config;this.verifier=config.verifier?Object.freeze({...config.verifier}):undefined;this.verifierIdentity=this.verifier?identity(this.verifier):undefined;}
 private async start(deadline:number){
  this.ready=new Promise((resolve,reject)=>{this.onReady=resolve;this.failReady=reject;});
  this.stopped=new Promise(resolve=>{this.confirmStop=resolve;});
  const child=fork(fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./supervisor.ts':'./supervisor.js',import.meta.url)),[],{stdio:['ignore','ignore','pipe','ipc'],execArgv:['--max-old-space-size=256']});this.child=child;
  child.stderr?.on('data',b=>{void this.config.record({type:'worker.stderr',text:b.toString().slice(0,4096)});});
  child.on('message',(message:any)=>{
   if(message?.type==='stopped'){this.confirmStop?.(message.confirmed===true);this.pending?.reject(Error('worker_stopped'));this.pending=undefined;this.failReady?.(Error('worker_stopped'));void this.config.record({type:'worker.stopped',...message});return;}
   if(message?.type==='activity'){void this.config.record({type:'worker.activity',attemptId:this.activeAttempt,busy:message.busy});return;}
   if(message?.type==='ready'){this.onReady?.();return;}
   if(message?.type==='fatal'){this.pending?.reject(Error(message.error));this.failReady?.(Error(message.error));return;}
   if(message?.type==='worker_identity'){void this.config.record(message);return;}
   if(message?.type==='sandbox'){this.currentSandbox=message.directory;this.boxes.add(message.directory);void this.config.record({type:'worker.sandbox',directory:message.directory});return;}
   if(message?.type==='result'){if(message.attemptId!==this.activeAttempt||!this.pending)return;const p=this.pending;this.pending=undefined;p?.resolve(message.result);return;}
   if(message?.type==='rpc'){
    const op=this.serial.then(async()=>{
     try{const value=await this.handle(message.action,message.payload);if(child.connected)child.send({type:'reply',id:message.id,value});}
     catch(error){if(child.connected)child.send({type:'reply',id:message.id,error:String(error)});}
    });this.serial=op.catch(()=>{});
   }
  });
  child.on('error',e=>{this.failReady?.(e);this.pending?.reject(e);this.confirmStop?.(false);});
  child.on('exit',()=>{this.failReady?.(Error('supervisor_exited'));this.pending?.reject(Error('supervisor_exited'));this.confirmStop?.(false);});
  child.send({type:'initialize',deadlineNs:(process.hrtime.bigint()+BigInt(Math.max(0,Math.floor((deadline-performance.now())*1000000)))).toString(),config:this.config.worker});await this.ready;
 }
 private async handle(action:string,p:any):Promise<unknown>{
  if(action==='process_owned'){await this.config.record({type:'process.owned',...p});if(this.stopCalled)throw Error('execution_stopped');return;}
  if(action==='observation'){await this.config.record({type:'worker.observation',attemptId:this.activeAttempt,observation:p});return;}
  if(action==='approval')return this.config.approval(p,new AbortController().signal);
  if(action==='begin'){if(!this.ledger)throw Error('no_active_attempt');this.admission=await this.ledger.begin(p.runId,p.limits,p.restored);return this.admission.snapshot();}
  if(!this.admission)throw Error('no_active_admission');
  if(action==='check'){if(this.stopCalled)throw Error('execution_stopped');await this.admission.check();return;}
  if(action==='admit'){if(this.stopCalled)throw Error('execution_stopped');const ticket=await this.admission.admit(p.kind,p.count);return {ticket,counts:this.admission.snapshot()};}
  if(action==='settle'){await this.admission.settle(p.ticket,p.usage);return;}
  throw Error('unknown_worker_request');
 }
 async run(input:Parameters<TaskRunner['run']>[0]):Promise<Attempt>{
  if(this.stopCalled||this.pending)throw Error('worker_not_available');this.ledger=input.ledger;this.activeAttempt=input.attemptId;this.currentSandbox=undefined;this.generationSettled=false;
  if(!this.child)await this.start(input.deadline);if(input.signal.aborted)throw Error('execution_stopped');
  const outcome=await new Promise<Attempt>((resolve,reject)=>{this.pending={resolve,reject};this.child!.send({type:'run',attemptId:input.attemptId,task:input.task});});
  this.generationSettled=true;
  if(outcome.status!=='completed')return outcome;
  if(this.verifier){
   const dest=join(this.config.root,'candidates',identity(input.attemptId));await mkdir(dirname(dest),{recursive:true});
   if(this.currentSandbox){
    // Fix candidate identity while the task volume is stopped; verification uses its readonly mount.
    const box=await DockerSandbox.load(this.currentSandbox);await box.stop('candidate_frozen');
    // Bind the exported candidate before its readonly verification; export closes generation admission.
    await box.export(dest);
    const manifest=await treeManifest(join(dest,'files'));
    return {...outcome,candidate:{identity:identity(manifest),directory:join(dest,'files'),sandbox:this.currentSandbox,exportDirectory:dest}};
   }
   const manifest=await copySnapshot(this.config.worker.workspace,dest);
   return {...outcome,candidate:{identity:identity(manifest),directory:dest}};
  }
  return outcome;
 }
 async verify(attempt:Attempt,signal:AbortSignal):Promise<Verdict>{
  const candidate=attempt.candidate;const spec=this.verifier;if(!candidate||!spec)throw Error('verifier_missing');
  const directory=String(candidate.directory);const before=identity(await treeManifest(directory));if(before!==candidate.identity)throw Error('candidate_changed');
  const result=candidate.sandbox?await (await DockerSandbox.load(String(candidate.sandbox))).verify(spec.command,spec.seconds):await runVerifier(spec.command,directory,spec.seconds,signal,this.config.record);
  const after=identity(await treeManifest(directory));if(before!==after)throw Error('candidate_changed');
  if(candidate.sandbox){await (await DockerSandbox.load(String(candidate.sandbox))).checkArchive();}
  await this.config.record({type:'verifier.result',candidateIdentity:before,verifierIdentity:this.verifierIdentity,result});
  return {status:result.code===0?'PASS':result.code===1?'FAIL':'UNKNOWN',candidateIdentity:before,criteriaVersion:spec.version,verifierIdentity:this.verifierIdentity!,detail:JSON.stringify(result)};
 }
 private maintenance(mode:'stop'|'preserve',milliseconds:number):Promise<void>{
  if(!this.config.worker.sandboxRoot)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const helper=spawn(process.execPath,[fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./maintenance.ts':'./maintenance.js',import.meta.url)),mode,this.config.root,this.config.worker.sandboxRoot!],{detached:true,stdio:['ignore','pipe','pipe']});
   let output='',errors='',expired=false;
   const kill=()=>{if(helper.pid)try{process.kill(-helper.pid,'SIGKILL');}catch{}};
   const timer=setTimeout(()=>{expired=true;kill();},milliseconds);
   helper.stdout.on('data',b=>{output+=b.toString();if(output.length>1048576){expired=true;kill();}});helper.stderr.on('data',b=>{errors+=b.toString();if(errors.length>1048576){expired=true;kill();}});
   helper.on('error',e=>{clearTimeout(timer);reject(e);});helper.on('close',code=>{clearTimeout(timer);kill();void this.config.record({type:'execution.maintenance',mode,code,expired,output,errors}).then(()=>{if(code===0&&!expired)resolve();else reject(Error('maintenance_failed:'+mode));},reject);});
  });
 }
 stop(reason:string):Promise<boolean>{
  if(this.stopResult)return this.stopResult;
  this.stopCalled=true;
  this.stopResult=(async()=>{
   const start=performance.now();if(this.child?.connected)this.child.send({type:'stop'});
   let boxesStopped=true;
   const boxes=this.generationSettled?Promise.resolve():this.maintenance('stop',4500).catch(async error=>{boxesStopped=false;await this.config.record({type:'sandbox.stop_error',detail:String(error)});});
   let watchdog:NodeJS.Timeout|undefined;
   const bounded=this.child?new Promise<boolean>(resolve=>{watchdog=setTimeout(()=>{
    // The supervisor itself may be frozen. Never wait for its event loop as proof of stopping.
    this.pending?.reject(Error('supervisor_stop_unconfirmed'));this.pending=undefined;
    this.failReady?.(Error('supervisor_stop_unconfirmed'));this.child?.kill('SIGKILL');resolve(false);
   },4500);}):Promise.resolve(true);
   const confirmed=this.child?await Promise.race([this.stopped!,bounded]):true;
   clearTimeout(watchdog);await boxes;
   const latency=performance.now()-start;await this.config.record({type:'execution.stop_latency',reason,ms:latency,workerConfirmed:confirmed,boxesStopped});return confirmed&&boxesStopped&&latency<=5000;
  })();return this.stopResult;
 }
 async reconcile():Promise<void>{if(!this.stopCalled&&this.child?.connected)this.child.send({type:'reconcile'});}
 async preserve():Promise<void>{await this.maintenance('preserve',30000);}
}
