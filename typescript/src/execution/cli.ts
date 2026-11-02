import { mkdir,readFile,writeFile,lstat,realpath } from 'node:fs/promises';
import { resolve,join,relative,isAbsolute,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { Readable,Writable } from 'node:stream';
import { ExecutionController,GoalController,parseDuration,validatePlan,identity,type ExecutionPlan } from './controller.ts';
import { ProcessTaskRunner,type VerifierSpec } from './process-runner.ts';
import { RunArchiveStore } from '../memory/run-archive.ts';
import { loadRunbook } from '../memory/runbook.ts';
import { resolveKernelLimits } from '../runtime/agent-kernel.ts';
import type { ApprovalDecision,ApprovalRequest } from '../runtime/authorization.ts';
import type { FauxScriptEntry } from '../providers/faux/faux-model-adapter.ts';
export const EXECUTION_USAGE=`pan-agent loop|goal --every 5m --for 1h --task TEXT --workspace DIR --memory-root DIR --state NEW_DIR [--max-model-turns N] [--max-tool-steps N] [--total-model-calls N] [--total-tool-calls N] [--sandbox-root DIR] [--sandbox-input FILE] [--fixture FILE]
Goal additionally requires --verifier FILE containing {"version":"v1","command":"...","seconds":10}. Exit 0 succeeds; 1 means valid FAIL; other exits/errors mean UNKNOWN. The verifier is operator-owned executable code, never inferred from model text.
loop uses immediate first tick then fixed-rate serial checks, skips missed ticks and stops at the exclusive deadline. goal verifies immediately and retries valid FAIL until verified PASS or the original deadline/budget. Standard loop completion does not end the schedule.
--fixture explicitly selects the offline Faux adapter with a JSON array of canonical outcomes. Omit it to use configured DeepSeek/Kimi settings; normal credential and approval rules apply.
Protected operations emit a JSON approval.request. Respond on stdin with {"requestId":"...","decision":"allow-once"|"deny"}; no broad automatic approval. Closed stdin denies.
--state must be a NEW directory disjoint from workspace. Reuse fails closed. pan-agent execution inspect --state DIR reads evidence only; never resumes uncertain commands.
Execution stops: soft grace 2s, force and confirmation within 5s or stop_unconfirmed. Preservation has separate 30s cap. Same-user trusted-local is not adversarial containment; use --sandbox-root for Docker isolation.`;
const within=(a:string,b:string)=>{const p=relative(a,b);return !p||(!isAbsolute(p)&&p!=='..'&&!p.startsWith('../'));};
async function canonical(path:string):Promise<string>{try{return await realpath(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const parent=dirname(path);if(parent===path)throw error;return join(await canonical(parent),relative(parent,path));}}
export async function executionCli(args:readonly string[],output:Writable=process.stdout,input:Readable=process.stdin):Promise<number>{
 const emit=(v:unknown)=>output.write(JSON.stringify(v)+'\n');
 if(args.includes('--help')){output.write(EXECUTION_USAGE+'\n');return 0;}
 if(args[0]==='execution'){
  if(args.length!==4||args[1]!=='inspect'||args[2]!=='--state')throw Error('execution inspect --state DIR');
  const root=resolve(args[3]!);const meta=JSON.parse(await readFile(join(root,'execution.json'),'utf8'));
  const terminal=await readFile(join(root,'result.json'),'utf8').then(JSON.parse).catch(()=>undefined);
  emit({metadata:meta,result:terminal??{reason:'interrupted_or_active',instruction:'Inspect owned resources and archived reservations. No automatic replay or resume.'}});return 0;
 }
 const mode=args[0];if(mode!=='loop'&&mode!=='goal')throw Error('invalid_execution_mode');
 const allowed=new Set(['--every','--for','--task','--workspace','--memory-root','--state','--max-model-turns','--max-tool-steps','--total-model-calls','--total-tool-calls','--sandbox-root','--sandbox-input','--fixture','--verifier']);
 const options=new Map<string,string>();const sandboxInputs:string[]=[];
 for(let i=1;i<args.length;i+=2){const key=args[i]!,value=args[i+1];if(!allowed.has(key)||!value||value.startsWith('--')||(options.has(key)&&key!=='--sandbox-input'))throw Error('invalid_execution_argument:'+key);if(key==='--sandbox-input')sandboxInputs.push(resolve(value));else options.set(key,value);}
 const required=(key:string)=>{const value=options.get(key);if(!value)throw Error('required:'+key);return value;};
 const number=(key:string)=>{const text=options.get(key);if(text===undefined)return undefined;if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text)))throw Error('invalid_count:'+key);return Number(text);};
 const workspace=await realpath(resolve(required('--workspace')));if(!(await lstat(workspace)).isDirectory())throw Error('workspace_not_directory');
 const memoryRoot=await canonical(resolve(required('--memory-root')));const root=await canonical(resolve(required('--state')));
 const sandboxRoot=options.has('--sandbox-root')?await canonical(resolve(options.get('--sandbox-root')!)):undefined;
 for(const path of [memoryRoot,root,...(sandboxRoot?[sandboxRoot]:[])])if(within(workspace,path)||within(path,workspace))throw Error('control_workspace_overlap');
 if(within(memoryRoot,root)||within(root,memoryRoot))throw Error('control_paths_overlap');
 if(sandboxInputs.length&&!sandboxRoot)throw Error('sandbox_inputs_require_sandbox');
 const limits=resolveKernelLimits({maxModelTurns:number('--max-model-turns'),maxToolSteps:number('--max-tool-steps')});
 let verifier:VerifierSpec|undefined;
 if(mode==='goal'){
  const verifierPath=await realpath(resolve(required('--verifier')));if(within(workspace,verifierPath))throw Error('verifier_in_workspace');
  verifier=JSON.parse(await readFile(verifierPath,'utf8'));
  if(!verifier||typeof verifier.version!=='string'||!verifier.version||typeof verifier.command!=='string'||!verifier.command.trim()||!Number.isSafeInteger(verifier.seconds)||verifier.seconds<1||verifier.seconds>25||Object.keys(verifier).some(k=>!['version','command','seconds'].includes(k)))throw Error('invalid_verifier');
 }else if(options.has('--verifier'))throw Error('verifier_requires_goal');
 const plan:ExecutionPlan={mode,everyMs:parseDuration(required('--every')),durationMs:parseDuration(required('--for')),objective:required('--task'),outer:{...(options.has('--total-model-calls')?{modelCalls:number('--total-model-calls')}:{ }),...(options.has('--total-tool-calls')?{toolCalls:number('--total-tool-calls')}:{})},...(verifier?{criteria:{version:verifier.version,identity:identity(verifier)}}:{})};validatePlan(plan);
 const fixture=options.has('--fixture')?JSON.parse(await readFile(resolve(options.get('--fixture')!),'utf8')) as FauxScriptEntry[]:undefined;if(fixture&&!Array.isArray(fixture))throw Error('fixture_must_be_array');
 const runbook=await loadRunbook(resolve(dirname(fileURLToPath(import.meta.url)),'../../RUNBOOK.md'));
 // Exclusive directory is the single-controller ownership claim. Existing state is inspect-only.
 await mkdir(root,{recursive:false,mode:0o700});
 const archive=await (await RunArchiveStore.open(join(root,'archive'))).beginRun();let chain:Promise<void>=Promise.resolve();
 const record=(event:Record<string,unknown>)=>{const next=chain.then(async()=>{await archive.append({atUtc:new Date().toISOString(),...event});emit(event);});chain=next;return next;};
 await writeFile(join(root,'execution.json'),JSON.stringify({version:1,plan,planHash:identity(plan),archiveRunId:archive.runId,controllerPid:process.pid,created:new Date().toISOString(),sandboxRoot:sandboxRoot?join(sandboxRoot,archive.runId):undefined}),{flag:'wx',mode:0o600});
 const readline=createInterface({input});let inputClosed=false;const approvals=new Map<string,(d:ApprovalDecision)=>void>();
 readline.on('line',line=>{try{const d=JSON.parse(line);if(d.decision!=='allow-once'&&d.decision!=='deny')return;const accept=approvals.get(d.requestId);approvals.delete(d.requestId);accept?.(d);}catch{}});
 readline.on('close',()=>{inputClosed=true;for(const [requestId,accept] of approvals)accept({requestId,decision:'deny'});approvals.clear();});
 const abort=new AbortController();const cancel=()=>abort.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const approval=async(request:ApprovalRequest,signal:AbortSignal):Promise<ApprovalDecision>=>{
  await record({type:'approval.request',request});if(inputClosed||abort.signal.aborted||signal.aborted)return {requestId:request.requestId,decision:'deny'};
  return new Promise(resolve=>{const done=(d:ApprovalDecision)=>{abort.signal.removeEventListener('abort',deny);resolve(d);};const deny=()=>{approvals.delete(request.requestId);done({requestId:request.requestId,decision:'deny'});};approvals.set(request.requestId,done);abort.signal.addEventListener('abort',deny,{once:true});});
 };
 const runner=new ProcessTaskRunner({worker:{workspace,memoryRoot:join(memoryRoot,archive.runId),limits,fixture,runbook,sandboxRoot:sandboxRoot?join(sandboxRoot,archive.runId):undefined,sandboxInputs},durationMs:plan.durationMs,root,verifier,approval,record});
 try{
  const controller=mode==='goal'?new GoalController(undefined,record):new ExecutionController(undefined,record);
  const result=await controller.execute(plan,runner,abort.signal);await chain;
  await writeFile(join(root,'result.json'),JSON.stringify(result),{flag:'wx',mode:0o600});await archive.settle(result.reason==='succeeded'?'terminal':result.reason==='cancelled'?'cancelled':'failed',result.reason);
  return result.reason==='succeeded'||(mode==='loop'&&result.reason==='deadline_exceeded')?0:1;
 }finally{readline.close();process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
