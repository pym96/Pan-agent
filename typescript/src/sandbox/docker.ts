import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,readFile,writeFile,rename,statfs,lstat,open,chmod,readdir,rm} from 'node:fs/promises';
import {dirname,resolve,join,relative,isAbsolute} from 'node:path';
import {hash,initTar,parseWorkspaceTar,MAX_EXPORT} from './archive.ts';
export const IMAGE='python@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1';
export const IMAGE_ID='sha256:df18428df8a0f9189c84e7424d214b4c50092af1f9dca5842a00c41c39bda316';
export const PROFILE=Object.freeze({image:IMAGE,imageId:IMAGE_ID,cpu:1,memory:536870912,pids:64,tmpfs:67108864,user:'nobody',network:'none',capture:1048576,exportBytes:MAX_EXPORT,exportFiles:1000});
export interface CommandResult {code:number;stdout:string;stderr:string}
export async function docker(args:string[],input?:Buffer,limit=1048576,timeout=30000):Promise<Buffer>{
 return new Promise((accept,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,DOCKER_HOST:process.env.DOCKER_HOST,DOCKER_CONTEXT:process.env.DOCKER_CONTEXT}});
  const out:Buffer[]=[];const err:Buffer[]=[];let n=0,e=0,problem:Error|undefined;
  const fail=(text:string)=>{problem??=Error(text);child.kill('SIGKILL');};
  const timer=setTimeout(()=>fail('docker_deadline'),timeout);
  child.stdout.on('data',(b:Buffer)=>{n+=b.length;if(n>limit)fail('docker_output_limit');else out.push(b);});
  child.stderr.on('data',(b:Buffer)=>{e+=b.length;if(e>1048576)fail('docker_stderr_limit');else err.push(b);});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(problem)reject(problem);else if(code!==0)reject(Error('docker_failed:'+Buffer.concat(err).toString().slice(0,4096)));else accept(Buffer.concat(out));});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export type Phase='prepared'|'running'|'stopping'|'stopped'|'verifying'|'exporting'|'archived'|'cleaned';
interface Event {sequence:number;at:string;kind:string;detail:unknown}
interface State {version:1;runId:string;token:string;name:string;volume:string;image:string;policyHash:string;phase:Phase;containerId?:string;volumeCreated?:boolean;verifierId?:string;verifierName?:string;exportPath?:string;archiveHash?:string;stagePath?:string;events:Event[];error?:string}
export function assertSandboxFreeSpace(bytes:number){if(!Number.isFinite(bytes)||bytes<20*1024**3)throw Error('sandbox_free_space');}
export interface SandboxConfig {stateRoot:string;inputs?:readonly string[];onCheckpoint?:(kind:string)=>Promise<void>}
async function atomic(path:string,value:unknown){const temp=path+'.'+randomUUID()+'.tmp';const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(value,null,2));await file.sync();}finally{await file.close();}await rename(temp,path);const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const flags=()=>['--user',PROFILE.user,'--network','none','--cpus','1','--memory','512m','--memory-swap','512m','--pids-limit','64','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges','--ipc','private','--hostname','pan-sandbox','--env','PATH=/usr/local/bin:/usr/bin:/bin','--env','HOME=/tmp','--env','LANG=C.UTF-8','--log-driver','none'];
export class DockerSandbox {
 readonly directory:string; private state:State;private queue=Promise.resolve();private admission=false;private checkpoint?:SandboxConfig["onCheckpoint"];
 private constructor(directory:string,state:State){this.directory=directory;this.state=state;}
 get identity(){return {runId:this.state.runId,containerId:this.state.containerId??'',volume:this.state.volume,policyHash:this.state.policyHash,phase:this.state.phase};}
 private async record(kind:string,detail:unknown={},phase?:Phase){if(phase)this.state.phase=phase;this.state.events.push({sequence:this.state.events.length+1,at:new Date().toISOString(),kind,detail});await atomic(join(this.directory,'state.json'),this.state);await this.checkpoint?.(kind);}
 private async serial<T>(fn:()=>Promise<T>):Promise<T>{const before=this.queue;let done!:()=>void;this.queue=new Promise<void>(r=>done=r);await before;try{return await fn();}finally{done();}}
 static async prepare(config:SandboxConfig):Promise<DockerSandbox>{
  const root=resolve(config.stateRoot);await mkdir(root,{recursive:true,mode:0o700});if((await lstat(root)).isSymbolicLink())throw Error('state_root_symlink');
  const free=await statfs(root);assertSandboxFreeSpace(Number(free.bavail)*Number(free.bsize));
  const info=JSON.parse((await docker(['info','--format','{{json .}}'])).toString());
  if(info.CgroupVersion!=='2'||!info.MemoryLimit||!info.PidsLimit||!info.CpuCfsQuota||!info.SecurityOptions?.some((v:string)=>v.includes('seccomp'))||info.SecurityOptions?.some((v:string)=>v.includes('rootless')))throw Error('sandbox_required_controllers_unsupported');
  const image=JSON.parse((await docker(['image','inspect',IMAGE])).toString())[0];if(image.Id!==IMAGE_ID)throw Error('sandbox_image_mismatch');
  const runId=randomUUID(),token=randomUUID(),name='pan-sb148-'+runId,volume=name+'-work';
  const directory=join(root,runId);await mkdir(directory,{mode:0o700});
  const state:State={version:1,runId,token,name,volume,image:IMAGE,policyHash:hash(JSON.stringify(PROFILE)),phase:'prepared',events:[]};const box=new DockerSandbox(directory,state);box.checkpoint=config.onCheckpoint;
  await box.record('prepare_intent',{profile:PROFILE});
  try{
   const inputs=join(directory,'inputs');await mkdir(inputs,{mode:0o755});let size=0;const entries=[];const used=new Set<string>();
   for(const selected of config.inputs??[]){
    const path=resolve(selected),name=path.split('/').at(-1)!;if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name)||used.has(name))throw Error('input_name');used.add(name);
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=await file.stat();if(!st.isFile()||st.nlink!==1||st.size>1048576)throw Error('input_type_or_size');size+=st.size;if(size>1048576)throw Error('input_limit');const bytes=await file.readFile();await writeFile(join(inputs,name),bytes,{flag:'wx',mode:0o444});entries.push({name,bytes:bytes.length,sha256:hash(bytes)});}finally{await file.close();}
   }
   await chmod(inputs,0o555);await box.record('inputs_snapshot',entries);
   await box.record('volume_create_intent');await docker(['volume','create','--label','pan.sandbox='+token,'--label','pan.run='+runId,volume]);state.volumeCreated=true;await box.record('volume_created');
   await box.record('container_create_intent');
   const id=(await docker(['create','--name',name,'--label','pan.sandbox='+token,'--label','pan.run='+runId,...flags(),'--mount',`type=volume,source=${volume},target=/workspace`,'--mount',`type=bind,source=${inputs},target=/inputs,readonly`,'--workdir','/workspace/task',IMAGE,'python','-c','import time; time.sleep(86400)'])).toString().trim();
   state.containerId=id;await box.record('container_created',{id});
   await box.owned();await docker(['cp','-a','-',id+':/workspace'],initTar());await box.record('fixed_nonroot_directory_initialized',{uid:65534,gid:65534,tarSha256:hash(initTar())});
   await docker(['start',id]);
   const effective=JSON.parse((await docker(['exec',id,'python','-c',`import os,json\nprint(json.dumps({'uid':os.getuid(),'gid':os.getgid(),'security':open('/proc/self/status').read(),'workspace_uid':os.stat('/workspace/task').st_uid,'cpu':open('/sys/fs/cgroup/cpu.max').read().strip(),'memory':open('/sys/fs/cgroup/memory.max').read().strip(),'pids':open('/sys/fs/cgroup/pids.max').read().strip()}))`])).toString());
   if(effective.uid!==65534||effective.gid!==65534||!/^Seccomp:\s+2$/m.test(effective.security)||!/^NoNewPrivs:\s+1$/m.test(effective.security)||!/^CapEff:\s+0+$/m.test(effective.security)||effective.workspace_uid!==65534||effective.memory!=='536870912'||effective.pids!=='64'||effective.cpu!=='100000 100000')throw Error('sandbox_effective_limits');
   await box.record('effective_profile',{...effective,inspect:await box.owned()},'running');box.admission=true;return box;
  }catch(error){state.error=String(error);await box.record('prepare_failed',{error:String(error)});await box.stop('prepare_failed').catch(()=>{});throw Object.assign(Error(String(error)),{sandboxDirectory:directory});}
 }
 static async load(directory:string,onCheckpoint?:SandboxConfig["onCheckpoint"]):Promise<DockerSandbox>{const path=resolve(directory);const s=JSON.parse(await readFile(join(path,'state.json'),'utf8')) as State;
  if(s.version!==1||s.name!=='pan-sb148-'+s.runId||s.volume!==s.name+'-work'||!/^[0-9a-f-]{36}$/.test(s.runId)||!/^[0-9a-f-]{36}$/.test(s.token)||s.policyHash!==hash(JSON.stringify(PROFILE)))throw Error('sandbox_state_invalid');const box=new DockerSandbox(path,s);box.checkpoint=onCheckpoint;return box;}
 private async owned(verifier=false):Promise<any>{const id=verifier?this.state.verifierId??this.state.verifierName:this.state.containerId??this.state.name;if(!id)throw Error('sandbox_identity_missing');const info=JSON.parse((await docker(['inspect',id])).toString())[0];if(info.Config.Labels?.['pan.sandbox']!==this.state.token||info.Config.Labels?.['pan.run']!==this.state.runId||(!verifier&&this.state.containerId&&info.Id!==this.state.containerId)||(verifier&&this.state.verifierId&&info.Id!==this.state.verifierId))throw Error('sandbox_ownership_mismatch');return info;}
 private async volumeOwned(){const v=JSON.parse((await docker(['volume','inspect',this.state.volume])).toString())[0];if(v.Labels?.['pan.sandbox']!==this.state.token||v.Labels?.['pan.run']!==this.state.runId)throw Error('sandbox_volume_ownership');return v;}
 async stop(reason='operator_stop'):Promise<void>{this.admission=false;return this.serial(async()=>{if(['archived','cleaned'].includes(this.state.phase))return;await this.record('stop_intent',{reason},'stopping');
   for(const verifier of [true,false]){if(verifier&&!this.state.verifierName)continue;try{const owned=await this.owned(verifier);if(owned.State.Running)await docker(['stop','--time','1',owned.Id]);const after=await this.owned(verifier);if(after.State.Running)throw Error('sandbox_stop_unconfirmed');}catch(error){if(!String(error).includes('No such object')&&!String(error).includes('No such container')){this.state.error=String(error);await this.record('stop_failed',{error:String(error)});throw error;}}}
   await this.record('execution_stopped',{reason},'stopped');});}
 async bindRun(runId:string){await this.record("pan_run_binding",{runId});}
 async recover(){await this.stop('recovery_uncertain_no_replay');return this.identity;}
 async call(tool:string,args:Record<string,unknown>,signal:AbortSignal):Promise<CommandResult>{
  if(!this.admission||this.state.phase!=='running'||signal.aborted)throw Error('sandbox_admission_closed');
  const id=(await this.owned()).Id;const commandId=randomUUID();await this.record('tool_intent',{tool,commandId,argumentsHash:hash(JSON.stringify(args))});
  const abort=()=>{void this.stop('task_cancelled').catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
   if(signal.aborted||!this.admission)throw Error('sandbox_admission_closed');
   if(tool==='bash'){
    await docker(['exec','-d',id,'python','-c',SHELL,JSON.stringify({id:commandId,command:args.command})]);await this.record('command_started',{commandId});
    const until=Date.now()+Math.min(Number(args.timeout??10),100)*1000;
    while(Date.now()<until&&!signal.aborted&&this.admission){
     const result=JSON.parse((await docker(['exec',id,'python','-c',POLL,commandId],undefined,13*1048576)).toString());if(result.done){await this.record('tool_result',{commandId,code:result.code});return result;}
     await delay(50);
    }
    if(signal.aborted){await this.stop('task_cancelled');throw Error('sandbox_task_cancelled');}
    await this.record('command_wait_timeout',{commandId,stillMayRun:true});return {code:124,stdout:'',stderr:'command_wait_timeout: tracked command may still run; task cancellation is separate'};
   }
   const result=JSON.parse((await docker(['exec','-i',id,'python','-c',FILES],Buffer.from(JSON.stringify({tool,args})),7*1048576)).toString());await this.record('tool_result',{commandId,code:result.code});return result;
  }finally{signal.removeEventListener('abort',abort);}
 }
 async verify(command:string,seconds=10):Promise<CommandResult>{await this.stop('before_verification');return this.serial(async()=>{
  if(this.state.phase!=='stopped'||!Number.isInteger(seconds)||seconds<1||seconds>100)throw Error('verifier_state_or_timeout');await this.volumeOwned();
  const name=this.state.name+'-verify-'+randomUUID();this.state.verifierName=name;this.state.verifierId=undefined;await this.record('verify_intent',{commandHash:hash(command),seconds},'verifying');
  let result:CommandResult;
  try{const id=(await docker(['create','--name',name,'--label','pan.sandbox='+this.state.token,'--label','pan.run='+this.state.runId,...flags(),'--mount',`type=volume,source=${this.state.volume},target=/workspace,readonly`,'--workdir','/workspace/task',IMAGE,'python','-c',VERIFY,command,String(seconds)])).toString().trim();this.state.verifierId=id;await this.record('verifier_created',{id});await this.owned(true);result=JSON.parse((await docker(['start','-a',id],undefined,1048576+65536,(seconds+5)*1000)).toString());}
  catch(error){result={code:125,stdout:'',stderr:String(error)};}
  finally{if(this.state.verifierId){const v=await this.owned(true);if(v.State.Running)await docker(['stop','--time','1',v.Id]);await docker(['rm',v.Id]);}this.state.verifierId=undefined;this.state.verifierName=undefined;}
  await this.record('verify_result',result,'stopped');return result;
 });}
 async export(destination:string):Promise<unknown>{await this.stop('before_export');return this.serial(async()=>{
  if(this.state.phase==='cleaned')return this.checkArchive();
  const dest=resolve(destination);if(dest===this.directory||dest.startsWith(this.directory+'/'))throw Error('export_destination_control_plane');
  if(this.state.exportPath&&this.state.exportPath!==dest)throw Error('export_destination_changed');this.state.exportPath=dest;
  await this.record('export_intent',{destination:dest},'exporting');
  try{
   const existing=await lstat(dest).catch(()=>undefined);
   if(existing){if(!this.state.archiveHash)throw Error('export_destination_exists');await this.checkArchive();await this.record('archive_retry_confirmed',{},'archived');return this.checkArchive();}
   const container=await this.owned();if(container.State.Running)throw Error('export_running');await this.volumeOwned();
   const tar=await docker(['cp',container.Id+':/workspace/task','-'],undefined,MAX_EXPORT+2*1024*1024);const files=parseWorkspaceTar(tar);
   const parent=dirname(dest);if((await lstat(parent)).isSymbolicLink())throw Error('export_parent_symlink');const stage=join(parent,'.pan-export-'+randomUUID());this.state.stagePath=stage;await this.record('export_staging_intent',{stage});await mkdir(stage,{mode:0o700});
   try{await mkdir(join(stage,'files'));for(const file of files){const path=join(stage,'files',file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.bytes,{flag:'wx',mode:0o600});}
    const manifest={version:1,runId:this.state.runId,policyHash:this.state.policyHash,files:files.map(f=>({path:f.path,bytes:f.bytes.length,sha256:f.sha256}))};
    this.state.archiveHash=hash(JSON.stringify(manifest));await this.record('archive_commit_intent',{manifestHash:this.state.archiveHash});await atomic(join(stage,'manifest.json'),manifest);await rename(stage,dest);await this.record('archive_directory_committed',{destination:dest});
    await atomic(join(dest,'receipt.json'),{runId:this.state.runId,manifestHash:this.state.archiveHash});await this.checkArchive();await this.record('archive_committed',{manifestHash:this.state.archiveHash},'archived');return manifest;
   }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
  }catch(error){this.state.error=String(error);await this.record('export_failed',{error:String(error)},'stopped');throw error;}
 });}
 async checkArchive(){const dest=this.state.exportPath;if(!dest||!this.state.archiveHash)throw Error('archive_missing');
  if((await lstat(dest)).isSymbolicLink())throw Error('archive_symlink');
  const manifestPath=join(dest,'manifest.json');if(!(await lstat(manifestPath)).isFile()||(await lstat(manifestPath)).isSymbolicLink())throw Error('archive_manifest_type');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));if(hash(JSON.stringify(manifest))!==this.state.archiveHash||manifest.runId!==this.state.runId)throw Error('archive_manifest_changed');
  for(const file of manifest.files){const target=join(dest,'files',file.path);const rel=relative(join(dest,'files'),target);if(isAbsolute(rel)||rel.startsWith('..'))throw Error('archive_path');let p=target;while(p!==dest){if((await lstat(p)).isSymbolicLink())throw Error('archive_symlink');p=dirname(p);}const st=await lstat(target);if(!st.isFile()||st.nlink!==1||st.size!==file.bytes||hash(await readFile(target))!==file.sha256)throw Error('archive_file_changed');}
  const receipt=join(dest,'receipt.json');const st=await lstat(receipt).catch(()=>undefined);if(st){if(!st.isFile()||st.isSymbolicLink())throw Error('archive_receipt_type');const r=JSON.parse(await readFile(receipt,'utf8'));if(r.runId!==this.state.runId||r.manifestHash!==this.state.archiveHash)throw Error('archive_receipt_changed');}else await atomic(receipt,{runId:this.state.runId,manifestHash:this.state.archiveHash});return manifest;
 }
 async cleanup(){this.admission=false;return this.serial(async()=>{
  await this.checkArchive();await this.record('cleanup_intent');
  try{const c=await this.owned();if(c.State.Running)throw Error('cleanup_running');await docker(['rm',c.Id]);}catch(error){if(!String(error).includes('No such object')&&!String(error).includes('No such container'))throw error;}
  try{await this.volumeOwned();await docker(['volume','rm',this.state.volume]);}catch(error){if(!String(error).includes('no such volume'))throw error;}
  await this.record('cleanup_complete',{},'cleaned');return this.identity;
 });}
 static async list(root:string){const results=[];for(const entry of await readdir(root)){try{results.push((await DockerSandbox.load(join(root,entry))).identity);}catch{}}return results;}
}
const FILES=String.raw`import os,json,sys,pathlib
r=json.load(sys.stdin);a=r['args'];t=r['tool']
p=a['path'];p=os.path.normpath(p if p.startswith('/') else '/workspace/task/'+p)
if not (p.startswith('/workspace/task/') or p.startswith('/inputs/')): raise ValueError('sandbox_path_denied')
real=os.path.realpath(p)
if real!=p: raise ValueError('sandbox_symlink_denied')
if t!='read' and not p.startswith('/workspace/task/'): raise ValueError('sandbox_input_readonly')
try:
 if t=='read':
  with open(p,'rb') as f: b=f.read(1048577)
  if len(b)>1048576: raise ValueError('read_limit')
  text=b.decode('utf8');lines=text.split('\n');start=a.get('offset',1)-1;out='\n'.join(lines[start:start+a.get('limit',len(lines))])
 elif t=='write':
  b=a['content'].encode();
  if len(b)>1048576: raise ValueError('write_limit')
  os.makedirs(os.path.dirname(p),exist_ok=True)
  with open(p,'w') as f:f.write(a['content'])
  out='written'
 elif t=='edit':
  with open(p) as f:text=f.read(1048577)
  if len(text.encode())>1048576: raise ValueError('edit_limit')
  for e in a['edits']:
   if text.count(e['oldText'])!=1:raise ValueError('edit_match_not_unique')
   text=text.replace(e['oldText'],e['newText'])
  if len(text.encode())>1048576:raise ValueError('edit_limit')
  with open(p,'w') as f:f.write(text)
  out='edited'
 else:raise ValueError('unknown_tool')
 print(json.dumps({'code':0,'stdout':out,'stderr':''}))
except Exception as e:print(json.dumps({'code':1,'stdout':'','stderr':str(e)}))`;
const SHELL=String.raw`import subprocess,selectors,json,sys,os,signal
r=json.loads(sys.argv[1]);root='/tmp/pan-commands';os.makedirs(root,exist_ok=True);p=subprocess.Popen(['/bin/sh','-c',r['command']],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ,'stdout');s.register(p.stderr,selectors.EVENT_READ,'stderr');out={'stdout':bytearray(),'stderr':bytearray()};limited=False
while s.get_map():
 for key,_ in s.select(.1):
  b=os.read(key.fileobj.fileno(),65536)
  if not b:s.unregister(key.fileobj);continue
  target=out[key.data];space=1048576-len(target);target.extend(b[:max(0,space)])
  if len(b)>space:
   limited=True
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
code=p.wait();result={'done':True,'code':125 if limited else code,'stdout':out['stdout'].decode('utf8','replace'),'stderr':out['stderr'].decode('utf8','replace')+(' output_limit' if limited else '')};path=root+'/'+r['id']+'.json';tmp=path+'.tmp';open(tmp,'w').write(json.dumps(result));os.rename(tmp,path)`;
const POLL=String.raw`import json,sys,os
p='/tmp/pan-commands/'+sys.argv[1]+'.json'
print(open(p).read() if os.path.exists(p) else json.dumps({'done':False}))`;
const VERIFY=String.raw`import subprocess,sys,json,selectors,os,signal,time
p=subprocess.Popen(['/bin/sh','-c',sys.argv[1]],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ,'stdout');s.register(p.stderr,selectors.EVENT_READ,'stderr');out={'stdout':bytearray(),'stderr':bytearray()};end=time.monotonic()+int(sys.argv[2]);failed=False
while s.get_map():
 if time.monotonic()>=end:
  failed=True
  try:os.killpg(p.pid,signal.SIGKILL)
  except ProcessLookupError:pass
 for key,_ in s.select(.05):
  b=os.read(key.fileobj.fileno(),65536)
  if not b:s.unregister(key.fileobj);continue
  target=out[key.data];space=524288-len(target);target.extend(b[:max(space,0)])
  if len(b)>space:
   failed=True
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
code=p.wait();print(json.dumps({'code':124 if failed else code,'stdout':out['stdout'].decode('utf8','replace'),'stderr':out['stderr'].decode('utf8','replace')}))`;
