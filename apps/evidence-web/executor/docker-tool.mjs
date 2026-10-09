import {resourceGate} from './resources.mjs';
import {spawn} from 'node:child_process';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
export const runtimeIssue=()=>['web108','web109','web110'].includes(process.env.WEB_ISSUE)?process.env.WEB_ISSUE:'web107';
export const MAX_OUTPUT=2*1024*1024;
export function command(binary,args,{input='',signal,timeout=180000,limit=MAX_OUTPUT}={}){
 return new Promise((done,reject)=>{const child=spawn(binary,args,{env:process.env,stdio:['pipe','pipe','pipe']});let out='',err='',size=0,overflow=false;const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);const cancel=()=>child.kill('SIGKILL');signal?.addEventListener('abort',cancel,{once:true});
 const collect=(target)=>b=>{size+=b.length;if(size>limit){overflow=true;child.kill('SIGKILL');return};if(target==='out')out+=b;else err+=b};child.stdout.on('data',collect('out'));child.stderr.on('data',collect('err'));child.on('error',reject);child.on('close',(code,sig)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);done({exitCode:code,signal:sig,stdout:out,stderr:err,overflow})});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function stopContainer(name,taskId){
 const listing=await command('docker',['ps','-aq','--filter',`name=^/${name}$`]);if(listing.exitCode!==0)throw Error('docker_inspection_unavailable');
 if(!listing.stdout.trim())return;
 const info=await command('docker',['inspect',name]);if(info.exitCode!==0)throw Error('container_inspection_failed');const c=JSON.parse(info.stdout)[0];
 if(c.Config.Labels?.['pan.issue']!==runtimeIssue()||c.Config.Labels?.['pan.task']!==taskId)throw Error('container_owner_mismatch');
 const stop=await command('docker',['rm','-f',name]);if(stop.exitCode!==0)throw Error('container_stop_unconfirmed');
 const after=await command('docker',['ps','-aq','--filter',`name=^/${name}$`]);if(after.exitCode!==0||after.stdout.trim())throw Error('container_stop_unconfirmed');
}
export async function safeArtifact(root,name){
 if(!['analysis.json','details.csv'].includes(name))throw Error('artifact_name_rejected');
 const dir=join(root,'output');if((await lstat(dir)).isSymbolicLink()||await realpath(dir)!==resolve(dir))throw Error('artifact_root_alias');
 const path=join(dir,name),s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>MAX_OUTPUT)throw Error('artifact_not_regular');return readFile(path);
}
export function dockerTool({root,taskId,image,record,cpus=2,memory=4}){
 if(!/^[a-f0-9]{64}$/.test(taskId)||!/^sha256:[a-f0-9]{64}$/.test(image)||cpus<1||cpus>4||memory<1||memory>8)throw Error('executor_configuration');
 const name=runtimeIssue()+'-'+taskId;
 return {name:'analyze_python',description:'Run Python standard-library code in an offline, unprivileged Docker sandbox; /input read-only, /output writable. No host commands or network.',parameters:{type:'object',properties:{code:{type:'string'}},required:['code'],additionalProperties:false},
 validate:a=>Object.keys(a).length===1&&typeof a.code==='string'&&a.code.length<=65536?{ok:true,value:a}:{ok:false,error:'code_only_max_65536'},
 execute:async({arguments:a,signal,toolCallId})=>{
  resourceGate(root);
  await stopContainer(name,taskId);
  const args=['create','--name',name,'--label','pan.issue='+runtimeIssue(),'--label',`pan.task=${taskId}`,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--cpus',String(cpus),'--memory',`${memory}g`,'--memory-swap',`${memory}g`,'--user','65534:65534','--tmpfs','/tmp:rw,nosuid,nodev,size=67108864','--mount',`type=bind,src=${join(root,'input')},dst=/input,readonly`,'--mount',`type=bind,src=${join(root,'output')},dst=/output`,'-i',image,'python','-I','-c',a.code];
  let outcome;try{
   if(signal.aborted)throw Error('cancelled');const c=await command('docker',args,{signal});if(c.exitCode!==0)throw Error('container_create_failed');
   const inspect=await command('docker',['inspect',name]);if(inspect.exitCode!==0)throw Error('container_inspect_failed');await record({type:'sandbox.config',toolCallId,configuration:JSON.parse(inspect.stdout)[0]});
   if(signal.aborted)throw Error('cancelled');outcome=await command('docker',['start','-ai',name],{signal});
  }finally{await stopContainer(name,taskId)}
  const text=JSON.stringify(outcome);await record({type:'sandbox.result',toolCallId,...outcome});return {content:[{type:'text',text}],isError:outcome.exitCode!==0||outcome.overflow,details:{exitCode:outcome.exitCode,overflow:outcome.overflow}};
 }};
}
