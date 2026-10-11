// Standalone equivalent of the accepted host gate; deployment needs no benchmark runner.
import {userInfo} from 'node:os';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendFileSync,existsSync,lstatSync,readdirSync,statSync,statfsSync,realpathSync} from 'node:fs';
const check=(ok,message)=>{if(!ok)throw Error(message)};
function storagePath(p){const path=resolve(p);let q=path;while(!existsSync(q)){try{check(!lstatSync(q).isSymbolicLink(),'durable_dangling_alias')}catch(e){if(e.code!=='ENOENT')throw e}q=dirname(q)}return resolve(realpathSync(q),relative(q,path))}
export function allocatedRoots(roots){
 const seen=new Set();function walk(p){if(!existsSync(p))return 0;const s=lstatSync(p);if(s.isSymbolicLink())return 0;const key=s.dev+':'+s.ino;if(seen.has(key))return 0;seen.add(key);return s.isDirectory()?readdirSync(p).reduce((n,f)=>n+walk(join(p,f)),0):s.blocks*512}
 return roots.map(storagePath).reduce((n,p)=>n+walk(p),0);
}
export function checkSample(s){check([s.free,s.owned,s.docker].every(n=>Number.isFinite(n)&&n>=0),'resource_sample_unknown');check(s.free>=21474836480&&s.owned+Math.max(0,s.docker-48503971840)<57982058496,'resource_boundary')}
export function resourceGate(root){
 // HOME is intentionally private for child execution; OS account home identifies the
 // fixed host ledger and Docker backing file, never a model-provided path.
 const home=userInfo().homedir,roots=[resolve(dirname(fileURLToPath(import.meta.url)),'..'),resolve(process.env.WEB107_TASK_ROOT,'..'),join(home,'.local/state/pan-agent'),'/opt/homebrew/Cellar/python@3.12/3.12.9',join(home,'Desktop/todo/面试/career-planning/60-项目/pan-agent/typescript/node_modules'),'/Volumes/WD_BLACK/pan-agent/wo58-video-20261009',join(home,'Library/Caches/go-build'),join(home,'go/pkg/mod'),'/opt/homebrew/opt/postgresql@14',join(home,'.npm'),...[106,107,108,109,110,111,112,113,114,119].map(n=>'/Volumes/WD_BLACK/pan-agent/web'+n),'/private/tmp/wo97-live','/private/tmp/wo97-runner-disk39','/private/tmp/wo74-work','/private/tmp/wo94-kimi'];
 const raw=join(home,'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw');check(existsSync(raw),'resource_sample_unknown');const fs=statfsSync(root),s={utc:new Date().toISOString(),free:fs.bavail*fs.bsize,owned:allocatedRoots(roots),docker:statSync(raw).blocks*512};
 appendFileSync(join(root,'resources.jsonl'),JSON.stringify({...s,baselineDocker:48503971840,increment:s.owned+Math.max(0,s.docker-48503971840)})+'\n');checkSample(s);return s;
}
