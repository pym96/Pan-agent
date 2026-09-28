import {readFileSync,readdirSync,lstatSync,statSync,statfsSync,existsSync,appendFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {check,digest} from './policy.mjs';
import {openBroker} from './broker.mjs';
import {runAttempt} from './session.mjs';
import {lock} from './full-store.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const GiB=2**30;
export const MIN_FREE_BYTES=20*GiB;
export const DISK_POLICY=Object.freeze({minFreeBytes:MIN_FREE_BYTES,incrementExclusiveBytes:54*GiB});
function allocated(p){if(!existsSync(p))return 0;const s=lstatSync(p);return s.isSymbolicLink()?0:s.isDirectory()?readdirSync(p).reduce((n,f)=>n+allocated(join(p,f)),0):s.blocks*512;}
export function sample(root){const s=statfsSync(root),raw=join(homedir(),'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw');return {utc:new Date().toISOString(),free:s.bavail*s.bsize,owned:allocated(root),docker:existsSync(raw)?statSync(raw).blocks*512:null};}
export function resourceCheck(root,baseline,now=sample(root)){check([now.free,now.owned,now.docker,baseline.docker].every(n=>Number.isFinite(n)&&n>=0),'resource_sample_unknown');check(now.free>=MIN_FREE_BYTES&&now.owned+Math.max(0,now.docker-baseline.docker)<DISK_POLICY.incrementExclusiveBytes,'resource_boundary');return now;}
let dockerRoot;
export function configure(root){dockerRoot=join(root,'docker-client');mkdirSync(dockerRoot,{recursive:true});}
const env=()=>{check(dockerRoot,'docker_context_missing');return {PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',HOME:dockerRoot,DOCKER_CONFIG:dockerRoot,DOCKER_HOST:'unix://'+homedir()+'/.docker/run/docker.sock'};};
function docker(...args){return execFileSync('docker',args,{env:env(),encoding:'utf8',timeout:35000,stdio:['ignore','pipe','pipe']});}
export function verifyProduct(entry,runtime){
 const lock=JSON.parse(readFileSync(join(HERE,'package-identity.json'))),base=resolve(dirname(entry),'..');check(resolve(entry)===join(base,'dist/index.js'),'installed_entry_path');
 for(const [f,h] of Object.entries(lock.installed_files))check(digest(readFileSync(join(base,f)))===h,'installed_pan_identity');
 check(digest(readFileSync(runtime?.python??lock.python))===lock.python_sha256,'python_identity');
 if(runtime){const imported=execFileSync(runtime.python,['-c','import harbor,pathlib;print(pathlib.Path(harbor.__file__).parent.resolve())'],{env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:10000}).trim();check(resolve(imported)===resolve(runtime.harborRoot),'harbor_import_identity');
  const frozen=Object.fromEntries(readFileSync(join(HERE,'../requirements.lock'),'utf8').trim().split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split('==')));
  const versions=JSON.parse(execFileSync(runtime.python,['-c','import sys,json,importlib.metadata as m;print(json.dumps({n:m.version(n) for n in json.load(sys.stdin)}))'],{input:JSON.stringify(Object.keys(frozen)),env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:10000}));
  check(Object.entries(frozen).every(([n,v])=>versions[n]===v),'python_dependency_identity');}
 for(const [f,h] of Object.entries(lock.harbor_files))check(digest(readFileSync(join(runtime?.harborRoot??lock.harbor_root,f)))===h,'harbor_identity');return lock;
}
export function validateFiles(task,root){
 const dir=join(root,task.path),paths=[];
 const walk=(p,rel='')=>{for(const f of readdirSync(p)){const q=join(p,f),r=rel?rel+'/'+f:f,s=lstatSync(q);check(!s.isSymbolicLink(),'task_source_symlink');s.isDirectory()?walk(q,r):paths.push(r);}};
 walk(dir);check(JSON.stringify(paths.sort())===JSON.stringify(task.files.map(f=>f.path).sort()),'task_source_inventory');
 for(const f of task.files){const b=readFileSync(join(dir,f.path));check(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex')===f.git_blob_sha1,'task_source_identity');}
}
export const EXECUTION_POLICY=Object.freeze({version:1,maxCpus:4,maxMemoryMiB:8192,serial:true,disk:DISK_POLICY});
export function requirements(task,policy={maxCpus:2,maxMemoryMiB:4096}){const e=task.config.environment,m=typeof e.memory==='string'?/^(\d+(?:\.\d+)?)([MG])$/.exec(e.memory):null;return typeof e.cpus==='number'&&e.cpus>0&&Number.isFinite(e.cpus)&&e.cpus<=policy.maxCpus&&m&&Number(m[1])>0&&Number(m[1])*(m[2]==='G'?1024:1)<=policy.maxMemoryMiB;}
export async function prepare(task,taskRoot,policy){
 if(!requirements(task,policy))return {ready:false,reason:'official_resource_requirements_exceed_host',global:false};
 try{validateFiles(task,taskRoot);}catch{return {ready:false,reason:'task_source_missing_or_invalid',global:false};}
 try{const capacity=JSON.parse(docker('info','--format','{{json .}}'));if(capacity.OSType!=='linux')return {ready:false,reason:'docker_unavailable',global:true};const e=task.config.environment,mem=/^(\d+(?:\.\d+)?)([MG])$/.exec(e.memory);if(!Number.isFinite(capacity.NCPU)||!Number.isFinite(capacity.MemTotal)||capacity.NCPU<e.cpus||capacity.MemTotal<Number(mem[1])*(mem[2]==='G'?2**30:2**20))return {ready:false,reason:'docker_capacity_insufficient_or_unknown',global:false};}catch{return {ready:false,reason:'docker_unavailable',global:true};}
 let info;try{info=JSON.parse(docker('image','inspect',task.image_reference))[0];}catch{return {ready:false,reason:'image_not_cached',global:false};}
 if(info.Os!=='linux'||!['amd64','arm64'].includes(info.Architecture))return {ready:false,reason:'image_architecture_unsupported',global:false};
 return {ready:true,image:info.Id,architecture:info.Architecture,os:info.Os,reference:task.image_reference,sourceValidated:true};
}
export function projectFor(campaignId,runId,task,root){return 'wo78-'+digest(campaignId+'\n'+root+'\n'+runId+'\n'+task).slice(0,16);}
/** Query by the pre-reserved project, never trust a container ID supplied by a report. */
export async function reconcile(project,image,{stop=false,ticket}={}){
 check(/^wo78-[a-f0-9]{16}$/.test(project)&&/^sha256:[a-f0-9]{64}$/.test(image),'cleanup_identity');
 let release;
 try{
  check(ticket,'broker_ticket_required');release=await lock(dirname(ticket),ticket);
  const ids=docker('ps','-aq','--filter','label=com.docker.compose.project='+project).trim().split(/\s+/).filter(Boolean);
  for(const id of ids){let i=JSON.parse(docker('inspect',id))[0];check(i.Config.Labels['com.docker.compose.project']===project&&i.Config.Labels['com.docker.compose.service']==='main'&&i.Image===image,'cleanup_foreign_object');
   if(i.State.Running){if(!stop)return {confirmed:false,reason:'owned_environment_running'};docker('stop','--time','10',id);i=JSON.parse(docker('inspect',id))[0];}
   check(!i.State.Running&&i.State.Pid===0,'stop_unknown');
  }
  const networks=docker('network','ls','-q','--filter','label=com.docker.compose.project='+project).trim().split(/\s+/).filter(Boolean);
  for(const id of networks){const n=JSON.parse(docker('network','inspect',id))[0];check(n.Labels?.['com.docker.compose.project']===project&&!Object.keys(n.Containers??{}).length,'network_not_empty');if(stop)docker('network','rm',id);}
  return {confirmed:true,project,containers:ids,networks,networksRemoved:stop};
 }catch{return {confirmed:false,reason:'owned_cleanup_unknown',project};}finally{await release?.();}
}
export function scoreEvidence(directory,report){
 const dir=join(directory,'harbor/verifier');let raw=null;try{const text=readFileSync(join(dir,'reward.txt'),'utf8').trim();raw=text?Number(text):null;if(!Number.isFinite(raw))raw=null;}catch{}
 let test=null;try{test=JSON.parse(readFileSync(join(dir,'ctrf.json'))).results.summary;}catch{}
 const proven=report?.verifier?.status==='official_scored'&&test&&Number.isInteger(test.tests)&&test.tests>0&&Number.isInteger(test.passed)&&Number.isInteger(test.failed)&&test.passed+test.failed===test.tests&&[0,1].includes(raw)&&raw===(test.failed===0?1:0);
 const files={};for(const f of ['reward.txt','reward.json','ctrf.json','test-stdout.txt'])if(existsSync(join(dir,f)))files[f]=digest(readFileSync(join(dir,f)));
 return {rawReward:raw,validScore:proven?raw:null,state:proven?(raw===1?'success':'valid_failure'):'unscored',reason:proven?'official_tests_executed':report?.agentStopReason??(raw!==null?'verifier_preparation_or_score_unverified':'no_valid_score_evidence'),evidence:{files,ctrf:test??null}};
}
export async function inspectResidual(r){
 try{
  check(/^wo78-[a-f0-9]{16}$/.test(r.project),'cleanup_identity');
  // No fence file exists for the lost segment. Inspect old project and live process identity read-only.
  const processes=execFileSync('ps',['-axo','command='],{encoding:'utf8',timeout:10000});
  if(processes.split('\n').some(p=>p.includes('broker.py')||(p.includes('full-cli.mjs')&&(p.includes(r.oldRoot)||p.includes(r.runId)||p.includes(r.project)))))return {confirmed:false,reason:'old_process_present'};
  const ids=docker('ps','-aq','--filter','label=com.docker.compose.project='+r.project).trim().split(/\s+/).filter(Boolean);
  for(const id of ids){const x=JSON.parse(docker('inspect',id))[0];check(x.Config.Labels['com.docker.compose.project']===r.project&&x.Image===r.image&&!x.State.Running&&x.State.Pid===0,'historical_stop_unknown');}
  return {confirmed:true,project:r.project,containers:ids,observedUTC:new Date().toISOString(),kind:'current_read_only_observation'};
 }catch{return {confirmed:false,reason:'historical_stop_unknown'};}
}
export const production={home:homedir(),mode:'live',configure,sample,prepare,reconcile,inspectResidual,verifyProduct,runAttempt,openBroker,scoreEvidence,credentialSource:()=>process.env.KIMI_API_KEY,runnerSha:()=>{const repo=resolve(HERE,'../../..');check(!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),'runner_dirty');return execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();},internal:root=>check(statSync(root).dev===statSync('/private/tmp').dev,'active_work_must_be_internal')};
