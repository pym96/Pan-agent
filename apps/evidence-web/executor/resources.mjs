import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Standalone equivalent of the accepted host gate; deployment needs no benchmark runner.
import {userInfo} from 'node:os';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendFileSync,existsSync,lstatSync,readdirSync,statSync,statfsSync,realpathSync,readFileSync} from 'node:fs';
const check=(ok,message)=>{if(!ok)throw Error(message)};
function storagePath(p){const path=resolve(p);let q=path;while(!existsSync(q)){try{check(!lstatSync(q).isSymbolicLink(),'durable_dangling_alias')}catch(e){if(e.code!=='ENOENT')throw e}q=dirname(q)}return resolve(realpathSync(q),relative(q,path))}
export function allocatedRoots(roots){
 const seen=new Set();function walk(p){if(!existsSync(p))return 0;const s=lstatSync(p);if(s.isSymbolicLink())return 0;const key=s.dev+':'+s.ino;if(seen.has(key))return 0;seen.add(key);return s.isDirectory()?readdirSync(p).reduce((n,f)=>n+walk(join(p,f)),0):s.blocks*512}
 return roots.map(storagePath).reduce((n,p)=>n+walk(p),0);
}
export function checkSample(s){check([s.free,s.owned,s.docker].every(n=>Number.isFinite(n)&&n>=0),'resource_sample_unknown');check(s.free>=21474836480&&s.owned+Math.max(0,s.docker-48503971840)<57982058496,'resource_boundary')}
export function resourceGate(root){
 if(process.env.WEB_RESOURCE_PROFILE){
  try {
   const raw=readFileSync(process.env.WEB_RESOURCE_PROFILE);
   check(createHash('sha256').update(raw).digest('hex')===process.env.WEB_RESOURCE_PROFILE_SHA256,'resource_profile_hash');
   const p=JSON.parse(raw);check(p.baseline?.profile==='linux-project-v1'&&Number.isFinite(p.baseline.projectAllocatedBytes)&&p.baseline.projectAllocatedBytes>0&&p.baseline.projectRoot===p.projectRoot,'resource_baseline_unknown');
   const s=linuxSample(p,root);appendFileSync(join(root,'resources.jsonl'),JSON.stringify(s)+'\n');checkLinuxSample(s);return s;
  }catch(e){appendFileSync(join(root,'resources.jsonl'),JSON.stringify({utc:new Date().toISOString(),profile:'linux-project-v1',error:e.message,measurementAvailable:false})+'\n');throw e}
 }
 check(process.platform==='darwin','resource_profile_required');
 // HOME is intentionally private for child execution; OS account home identifies the
 // fixed host ledger and Docker backing file, never a model-provided path.
 const home=userInfo().homedir,roots=[resolve(dirname(fileURLToPath(import.meta.url)),'..'),resolve(process.env.WEB107_TASK_ROOT,'..'),join(home,'.local/state/pan-agent'),'/opt/homebrew/Cellar/python@3.12/3.12.9',join(home,'Desktop/todo/面试/career-planning/60-项目/pan-agent/typescript/node_modules'),'/Volumes/WD_BLACK/pan-agent/wo58-video-20261009',join(home,'Library/Caches/go-build'),join(home,'go/pkg/mod'),'/opt/homebrew/opt/postgresql@14',join(home,'.npm'),join(home,'Desktop/todo/面试/career-planning/30-已有资产与参考/作品演示/Pan-Web-离线完整流程演示-20261011.mp4'),...[106,107,108,109,110,111,112,113,114,119,122].map(n=>'/Volumes/WD_BLACK/pan-agent/web'+n),'/private/tmp/wo97-live','/private/tmp/wo97-runner-disk39','/private/tmp/wo74-work','/private/tmp/wo94-kimi'];
 const raw=join(home,'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw');check(existsSync(raw),'resource_sample_unknown');const fs=statfsSync(root),s={utc:new Date().toISOString(),free:fs.bavail*fs.bsize,owned:allocatedRoots(roots),docker:statSync(raw).blocks*512};
 appendFileSync(join(root,'resources.jsonl'),JSON.stringify({...s,baselineDocker:48503971840,increment:s.owned+Math.max(0,s.docker-48503971840)})+'\n');checkSample(s);return s;
}

export function checkLinuxSample(s){
 check(s?.profile==='linux-project-v1'&&s.os==='linux','resource_platform_mismatch');
 check(Number.isFinite(s.projectAllocatedBytes)&&s.projectAllocatedBytes>=0&&Array.isArray(s.filesystems)&&s.filesystems.length>0,'resource_sample_unknown');
 for(const f of s.filesystems){check(Number.isFinite(f.device)&&Number.isFinite(f.freeBytes)&&f.freeBytes>=0,'resource_sample_unknown');check(f.freeBytes>=21474836480,'resource_free_space')}
 check(Array.isArray(s.images)&&s.images.length>0&&s.images.every(x=>/^sha256:[a-f0-9]{64}$/.test(x.id)&&Number.isFinite(x.logicalBytes)&&x.logicalBytes>=0),'resource_image_unknown');
}
export function linuxSample(p,root){
 check(process.platform==='linux'&&p.profile==='linux-project-v1','resource_platform_mismatch');
 const canonical=path=>{check(typeof path==='string'&&path===resolve(path)&&realpathSync(path)===path&&statSync(path).isDirectory(),'resource_path_unknown');return path};
 const project=canonical(p.projectRoot),tasks=canonical(p.taskRoot);canonical(root);
 const inside=(parent,child)=>child===parent||child.startsWith(parent+'/');
 check(inside(project,tasks)&&inside(tasks,root),'resource_path_ownership');
 check(/^dep-wo126-[a-f0-9]+$/.test(p.namespace)&&p.namespace===process.env.WEB_ISSUE&&p.image===process.env.PAN_IMAGE,'resource_object_ownership');
 const env=Object.fromEntries(['PATH','DOCKER_HOST','DOCKER_CONFIG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 const docker=args=>execFileSync('docker',args,{env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024}).trim();
 const dockerRoot=canonical(docker(['info','--format','{{.DockerRootDir}}']));
 const image=JSON.parse(docker(['image','inspect',p.image]))[0];check(image.Id===p.image&&image.Os==='linux','resource_image_unknown');
 const ids=docker(['ps','-aq','--filter','label=pan.issue='+p.namespace]).split(/\s+/).filter(Boolean);
 const containers=ids.length?JSON.parse(docker(['inspect',...ids])).map(c=>{check(c.Config.Labels?.['pan.issue']===p.namespace,'resource_object_ownership');return {id:c.Id,image:c.Image,running:c.State.Running,namespace:p.namespace}}):[];
 const filesystems=[],devices=new Set();
 for(const path of [project,tasks,root,dockerRoot]){const st=statSync(path),fs=statfsSync(path);if(!devices.has(st.dev)){devices.add(st.dev);filesystems.push({path,device:st.dev,freeBytes:fs.bavail*fs.bsize})}}
 return {utc:new Date().toISOString(),os:process.platform,profile:p.profile,projectRoot:project,taskRoot:tasks,projectAllocatedBytes:allocatedRoots([project]),filesystems,dockerRoot,images:[{id:image.Id,logicalBytes:image.Size}],containers,dockerAccounting:'logical image bytes only; shared physical layers not attributed; no Mac baseline or increment cap'};
}
