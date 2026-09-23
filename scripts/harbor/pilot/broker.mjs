import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {STDERR_LIMIT,classifyDiagnostic,safeStage} from './diagnostics.mjs';
import {fileURLToPath} from 'node:url';import {homedir} from 'node:os';
export const childEnvironment=(home,dockerConfig)=>({PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',HOME:home,DOCKER_CONFIG:dockerConfig,DOCKER_HOST:'unix://'+homedir()+'/.docker/run/docker.sock',PYTHONDONTWRITEBYTECODE:'1'});
const timed=(promise,ms,code)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),ms);})]).finally(()=>clearTimeout(timer));};
export function openBroker({python,config,home,dockerConfig,spawnImplementation=spawn}){
 const child=spawnImplementation(python,[fileURLToPath(new URL('./broker.py',import.meta.url))],{env:childEnvironment(home,dockerConfig),stdio:['pipe','pipe','pipe']});
 const evidencePath=config.output?join(config.output,'broker-diagnostic.json'):null;
 const diagnostic={task:config.task.id??'unknown',stage:'source_validation',project:null,reason:null,exitCode:null,signal:null,stderrBytes:0,stderrTruncated:false,stderrPolicy:'allowlisted categories; arbitrary text suppressed',evidencePath};
 let stderr=Buffer.alloc(0);
 const save=()=>{if(evidencePath){mkdirSync(config.output,{recursive:true});writeFileSync(evidencePath,JSON.stringify(diagnostic,null,2)+'\n');}};
 const problem=()=>{const e=new Error('broker_failed: '+diagnostic.stage+': '+(diagnostic.reason??classifyDiagnostic(stderr.toString())));e.diagnostic={...diagnostic};return e;};
 const pending=new Map();let seq=0,readyResolve,readyReject,isReady=false;const initial=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 const fail=()=>{save();readyReject(problem());for(const {reject} of pending.values())reject(problem());pending.clear();};
 child.on('error',()=>{diagnostic.reason='child_spawn_failed';fail();});child.on('exit',(code,signal)=>{diagnostic.exitCode=code??null;diagnostic.signal=['SIGTERM','SIGKILL','SIGINT'].includes(signal)?signal:null;diagnostic.reason??=classifyDiagnostic(stderr.toString());fail();});child.stdin.on('error',fail);child.stderr.on('data',chunk=>{diagnostic.stderrBytes+=chunk.length;stderr=Buffer.concat([stderr,chunk.subarray(0,Math.max(0,STDERR_LIMIT-stderr.length))]);diagnostic.stderrTruncated=diagnostic.stderrBytes>STDERR_LIMIT;});
 let buffer='';const reasons=new Set(['docker_address_pool_exhausted','docker_daemon_unavailable','docker_image_unavailable','task_source_invalid','required_path_missing','unclassified_child_error']);
 const line=line=>{try{const msg=JSON.parse(line);if(msg.diagnostic){diagnostic.stage=safeStage(msg.diagnostic.stage);if(/^wo78-[a-f0-9]{16}$/.test(msg.diagnostic.project??''))diagnostic.project=msg.diagnostic.project;if(reasons.has(msg.diagnostic.reason))diagnostic.reason=msg.diagnostic.reason;save();}else if(msg.ready){isReady=true;readyResolve(msg.instruction);}else{const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);msg.error?p.reject(new Error('broker_operation_failed')):p.resolve(msg.result);}}catch{diagnostic.reason='invalid_child_protocol';fail();}};
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(Buffer.byteLength(buffer)>1048576){buffer='';diagnostic.reason='child_output_limit';fail();child.kill('SIGTERM');return;}let index;while((index=buffer.indexOf('\n'))>=0){const row=buffer.slice(0,index);buffer=buffer.slice(index+1);line(row);}});
 child.stdin.write(JSON.stringify(config)+'\n');
 const call=(method,args={})=>new Promise((resolve,reject)=>{if(child.exitCode!==null||child.signalCode)return reject(Error('broker_exited'));const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,...args})+'\n');});
 const ready=timed(initial,(config.task.config.environment.build_timeout_sec+35)*1000,'broker_start_timeout');
 return {ready,exec:(command,timeout=30)=>call('exec',{command,timeout}),quiesce:()=>timed(call('quiesce'),15000,'handoff_unconfirmed'),verify:()=>call('verify'),stop:reason=>timed(call('stop',{reason}),35000,'stop_unconfirmed'),async close(){
  let stopError;try{if(isReady)await timed(call('stop',{reason:'controller_exit'}),35000,'stop_unconfirmed');}catch(e){stopError=e;}
  child.stdin.end();try{await timed(new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);}),35000,'cleanup_unconfirmed');}catch(e){child.kill('SIGTERM');throw e;}if(stopError)throw stopError;
 }};
}
