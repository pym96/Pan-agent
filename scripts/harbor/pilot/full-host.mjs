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
function allocated(p){if(!existsSync(p))return 0;const s=lstatSync(p);return s.isSymbolicLink()?0:s.isDirectory()?readdirSync(p).reduce((n,f)=>n+allocated(join(p,f)),0):s.blocks*512;}
export function sample(root){const s=statfsSync(root),raw=join(homedir(),'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw');return {utc:new Date().toISOString(),free:s.bavail*s.bsize,owned:allocated(root),docker:existsSync(raw)?statSync(raw).blocks*512:0};}
export function resourceCheck(root,baseline,now=sample(root)){check(now.free>=60*GiB&&now.owned+Math.max(0,now.docker-baseline.docker)<24*GiB,'resource_boundary');return now;}
let dockerRoot;
export function configure(root){dockerRoot=join(root,'docker-client');mkdirSync(dockerRoot,{recursive:true});}
const env=()=>{check(dockerRoot,'docker_context_missing');return {PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',HOME:dockerRoot,DOCKER_CONFIG:dockerRoot,DOCKER_HOST:'unix://'+homedir()+'/.docker/run/docker.sock'};};
function docker(...args){return execFileSync('docker',args,{env:env(),encoding:'utf8',timeout:35000,stdio:['ignore','pipe','pipe']});}
export function verifyProduct(entry){
 const lock=JSON.parse(readFileSync(join(HERE,'package-identity.json'))),base=resolve(dirname(entry),'..');check(resolve(entry)===join(base,'dist/index.js'),'installed_entry_path');
 for(const [f,h] of Object.entries(lock.installed_files))check(digest(readFileSync(join(base,f)))===h,'installed_pan_identity');
 check(digest(readFileSync(lock.python))===lock.python_sha256,'python_identity');
 for(const [f,h] of Object.entries(lock.harbor_files))check(digest(readFileSync(join(lock.harbor_root,f)))===h,'harbor_identity');return lock;
}
export function validateFiles(task,root){
 const dir=join(root,task.path),paths=[];
 const walk=(p,rel='')=>{for(const f of readdirSync(p)){const q=join(p,f),r=rel?rel+'/'+f:f,s=lstatSync(q);check(!s.isSymbolicLink(),'task_source_symlink');s.isDirectory()?walk(q,r):paths.push(r);}};
 walk(dir);check(JSON.stringify(paths.sort())===JSON.stringify(task.files.map(f=>f.path).sort()),'task_source_inventory');
 for(const f of task.files){const b=readFileSync(join(dir,f.path));check(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex')===f.git_blob_sha1,'task_source_identity');}
}
export function requirements(task){const e=task.config.environment,m=/^(\d+(?:\.\d+)?)([MG])$/.exec(e.memory??'');return typeof e.cpus==='number'&&e.cpus>0&&e.cpus<=2&&m&&Number(m[1])*(m[2]==='G'?1024:1)<=4096;}
export async function prepare(task,taskRoot){
 if(!requirements(task))return {ready:false,reason:'official_resource_requirements_exceed_host',global:false};
 try{validateFiles(task,taskRoot);}catch{return {ready:false,reason:'task_source_missing_or_invalid',global:false};}
 try{if(docker('info','--format','{{.OSType}}').trim()!=='linux')return {ready:false,reason:'docker_unavailable',global:true};}catch{return {ready:false,reason:'docker_unavailable',global:true};}
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
export const production={home:homedir(),mode:'live',configure,sample,prepare,reconcile,verifyProduct,runAttempt,openBroker,scoreEvidence,credentialSource:()=>process.env.KIMI_API_KEY,runnerSha:()=>{const repo=resolve(HERE,'../../..');check(!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),'runner_dirty');return execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();},internal:root=>check(statSync(root).dev===statSync('/private/tmp').dev,'active_work_must_be_internal')};
