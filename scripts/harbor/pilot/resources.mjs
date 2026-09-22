import {statSync,statfsSync,readdirSync,lstatSync,appendFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {homedir} from 'node:os';import {check} from './policy.mjs';
const GiB=2**30;
function allocated(root){return readdirSync(root).reduce((sum,n)=>{const p=join(root,n),s=lstatSync(p);return sum+(s.isSymbolicLink()?0:s.isDirectory()?allocated(p):s.blocks*512);},0);}
export function resourceGuard(work,controller){
 check(statSync(work).dev===statSync('/private/tmp').dev,'active_work_must_be_internal');
 const raw=join(homedir(),'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw');
 const sample=()=>{const s=statfsSync(work);return {utc:new Date().toISOString(),free:s.bavail*s.bsize,owned:allocated(work),docker:existsSync(raw)?statSync(raw).blocks*512:null};};
 const baseline=sample(),checkNow=()=>{const s=sample();appendFileSync(join(work,'resource-samples.jsonl'),JSON.stringify(s)+'\n');check(s.free>=60*GiB&&s.owned+Math.max(0,(s.docker??0)-(baseline.docker??0))<24*GiB,'resource_boundary');};
 checkNow();const timer=setInterval(()=>{try{checkNow();}catch{controller.abort();}},5000);
 return {check:checkNow,close(){clearInterval(timer);checkNow();}};
}
