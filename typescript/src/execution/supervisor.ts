/** Separate event loop: owns process groups, parent disconnect and absolute monotonic deadline. */
import { fork,execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { executeBash } from '../tools/pan-trusted-local-tools.ts';
const worker=fork(fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./worker.ts':'./worker.js',import.meta.url)),[],{detached:true,stdio:['ignore','ignore','pipe','ipc'],execArgv:['--max-old-space-size=512']});
const groups=new Map<number,string>();let ownershipUncertain=false;
const birth=(pid:number)=>{try{return execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:500}).trim();}catch{return '';}};
if(worker.pid)groups.set(worker.pid,birth(worker.pid));
const ownedRequests=new Map<string,{resolve:()=>void;reject:(e:Error)=>void}>();
const abort=new AbortController();let stopping=false,closed=false;let expiry:NodeJS.Timeout|undefined;let force:NodeJS.Timeout|undefined;let limit:NodeJS.Timeout|undefined;let poll:NodeJS.Timeout|undefined;
const send=(m:unknown)=>{if(process.connected)process.send?.(m as any);};
const signal=(s:NodeJS.Signals)=>{for(const [pid,expected] of groups){const current=birth(pid);if(!expected||(current&&current!==expected)){ownershipUncertain=true;continue;}try{process.kill(-pid,s);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH'){ownershipUncertain=true;send({type:'stop_error',error:String(error)});}}}};
function liveGroups():boolean {
 if(ownershipUncertain)return true;
 try{return execFileSync('ps',['-axo','pgid=,stat='],{encoding:'utf8',timeout:500,maxBuffer:4*1024*1024}).split('\n').some(line=>{const [pgid,state]=line.trim().split(/\s+/);return groups.has(Number(pgid))&&state&&!state.startsWith('Z');});}catch{return true;}
}
function finish(confirmed:boolean){clearTimeout(expiry);clearTimeout(force);clearTimeout(limit);clearInterval(poll);send({type:'stopped',confirmed,workerPid:worker.pid,groups:[...groups.keys()]});process.exit(confirmed?0:1);}
function stop(){
 if(stopping)return;stopping=true;clearTimeout(expiry);abort.abort();for(const p of ownedRequests.values())p.reject(Error('supervisor_stopped'));ownedRequests.clear();
 if(worker.connected)worker.send({type:'stop'});signal('SIGTERM');force=setTimeout(()=>signal('SIGKILL'),2000);
 poll=setInterval(()=>{if(closed&&!liveGroups())finish(true);},30);limit=setTimeout(()=>finish(closed&&!liveGroups()),4900);
}
worker.on('message',(m:any)=>{
 if(m?.type==='rpc'&&m.action==='supervised_shell'){
  if(stopping){if(worker.connected)worker.send({type:'reply',id:m.id,error:'supervisor_stopped'});return;}
  void executeBash(m.payload.workspace,process.env,m.payload.value,abort.signal,async pid=>{
   groups.set(pid,birth(pid));const id=randomUUID();await new Promise<void>((resolve,reject)=>{ownedRequests.set(id,{resolve,reject});send({type:'rpc',id,action:'process_owned',payload:{pid,group:pid,supervisorPid:process.pid}});});
  }).then(value=>{if(worker.connected)worker.send({type:'reply',id:m.id,value});},error=>{if(worker.connected)worker.send({type:'reply',id:m.id,error:String(error)});});return;
 }
 send(m);
});
worker.stderr?.on('data',b=>send({type:'worker_stderr',text:b.toString().slice(0,4096)}));worker.on('error',e=>{send({type:'fatal',error:String(e)});stop();});
worker.on('exit',(code,signalName)=>{closed=true;send({type:'worker_exit',code,signal:signalName});stop();});
process.on('message',(m:any)=>{
 if(m?.type==='stop'){stop();return;}
 if(m?.type==='reply'&&ownedRequests.has(m.id)){const p=ownedRequests.get(m.id)!;ownedRequests.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve();return;}
 if(m?.type==='initialize'){expiry=setTimeout(stop,Math.max(0,Math.ceil(Number(BigInt(m.deadlineNs)-process.hrtime.bigint())/1000000)));send({type:'worker_identity',workerPid:worker.pid,supervisorPid:process.pid});}
 if(!stopping&&worker.connected)worker.send(m);
});
process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
