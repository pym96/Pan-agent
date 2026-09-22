import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';import {homedir} from 'node:os';
export const childEnvironment=(home,dockerConfig)=>({PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',HOME:home,DOCKER_CONFIG:dockerConfig,DOCKER_HOST:'unix://'+homedir()+'/.docker/run/docker.sock',PYTHONDONTWRITEBYTECODE:'1'});
const timed=(promise,ms,code)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),ms);})]).finally(()=>clearTimeout(timer));};
export function openBroker({python,config,home,dockerConfig,spawnImplementation=spawn}){
 const child=spawnImplementation(python,[fileURLToPath(new URL('./broker.py',import.meta.url))],{env:childEnvironment(home,dockerConfig),stdio:['pipe','pipe','pipe']});
 const pending=new Map();let seq=0,readyResolve,readyReject,isReady=false;const initial=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 const fail=()=>{readyReject(new Error('broker_failed'));for(const {reject} of pending.values())reject(new Error('broker_failed'));pending.clear();};
 child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);child.stderr.on('data',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{try{const msg=JSON.parse(line);if(msg.ready){isReady=true;readyResolve(msg.instruction);}else{const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);msg.error?p.reject(new Error('broker_operation_failed')):p.resolve(msg.result);}}catch{fail();}});
 child.stdin.write(JSON.stringify(config)+'\n');
 const call=(method,args={})=>new Promise((resolve,reject)=>{if(child.exitCode!==null||child.signalCode)return reject(Error('broker_exited'));const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,...args})+'\n');});
 const ready=timed(initial,(config.task.config.environment.build_timeout_sec+35)*1000,'broker_start_timeout');
 return {ready,exec:command=>call('exec',{command}),verify:()=>call('verify'),stop:reason=>timed(call('stop',{reason}),35000,'stop_unconfirmed'),async close(){
  let stopError;try{if(isReady)await timed(call('stop',{reason:'controller_exit'}),35000,'stop_unconfirmed');}catch(e){stopError=e;}
  child.stdin.end();try{await timed(new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);}),35000,'cleanup_unconfirmed');}catch(e){child.kill('SIGTERM');throw e;}if(stopError)throw stopError;
 }};
}
