import {readFileSync,writeFileSync,existsSync,readdirSync,lstatSync,statSync,statfsSync,realpathSync,mkdirSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute,relative} from 'node:path';
import {homedir} from 'node:os';
import {check,canonical,digest} from './policy.mjs';
import {durable} from './full-store.mjs';
const within=(p,r)=>p===r||p.startsWith(r+'/');
// Resolve existing aliases, preserving a not-yet-created suffix for layout planning.
function storagePath(p){
 check(typeof p==='string'&&isAbsolute(p),'durable_absolute_path');const path=resolve(p);let q=path;
 while(!existsSync(q)){try{check(!lstatSync(q).isSymbolicLink(),'durable_dangling_alias');}catch(e){if(e.code!=='ENOENT')throw e;}q=dirname(q);}
 return resolve(realpathSync(q),relative(q,path));
}
export function persistentPath(p){const actual=storagePath(p);check(!['/private/tmp','/tmp','/var/tmp','/private/var/tmp','/private/var/folders','/var/folders'].some(r=>within(actual,r)),'temporary_runtime_path');return actual;}
export function validateLayout(layout,target,mode){
 check(layout?.version===1&&Array.isArray(layout.ownedRoots)&&layout.ownedRoots.length>0,'durable_layout');
 for(const p of [target,layout.runner,layout.entry,layout.python,layout.harborRoot,layout.taskRoot,...layout.ownedRoots])persistentPath(p);
 const roots=layout.ownedRoots.map(storagePath);
 check([target,layout.runner,layout.entry,layout.python,layout.harborRoot,layout.taskRoot].every(p=>roots.some(r=>within(storagePath(p),r))),'durable_storage_omitted');
 check(isAbsolute(layout.archiveRoot)&&!within(resolve(layout.archiveRoot),resolve(target)),'durable_archive_path');
 if(mode==='live')check(layout.archiveRoot.startsWith('/Volumes/WD_BLACK/'),'durable_external_archive');
}
export function sampleDurable(root,roots){
 const seen=new Set(),walk=p=>{if(!existsSync(p))return 0;const s=lstatSync(p);if(s.isSymbolicLink())return 0;const key=s.dev+':'+s.ino;if(seen.has(key))return 0;seen.add(key);return s.isDirectory()?readdirSync(p).reduce((n,f)=>n+walk(join(p,f)),0):s.blocks*512;};
 // Restored old runtime, preparations and global ledgers remain cumulative costs.
 const required=[join(homedir(),'.local/state/pan-agent'),'/private/tmp/wo97-live','/private/tmp/wo97-runner-disk39','/private/tmp/wo74-work','/private/tmp/wo94-kimi'];
 const raw=join(homedir(),'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw'),s=statfsSync(root);
 check(existsSync(raw),'resource_sample_unknown');return {utc:new Date().toISOString(),free:s.bavail*s.bsize,owned:[...roots,...required].map(storagePath).reduce((n,p)=>n+walk(p),0),docker:statSync(raw).blocks*512};
}
export function flushTree(root){for(const name of readdirSync(root)){const p=join(root,name),s=lstatSync(p);check(!s.isSymbolicLink(),'archive_symlink');if(s.isDirectory())flushTree(p);else {check(s.isFile(),'archive_special');const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}}const fd=openSync(root,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function collect(root,rel='',out={}){for(const n of readdirSync(join(root,rel)).sort()){const key=rel?rel+'/'+n:n,p=join(root,key),s=lstatSync(p);check(!s.isSymbolicLink(),'archive_symlink');if(s.isDirectory())collect(root,key,out);else{check(s.isFile(),'archive_special');out[key]=digest(readFileSync(p));}}return out;}
function copyFile(source,dest,hash){const b=readFileSync(source);check(digest(b)===hash,'archive_source_changed');mkdirSync(dirname(dest),{recursive:true});if(existsSync(dest))check(digest(readFileSync(dest))===hash,'archive_conflict');else writeFileSync(dest,b,{flag:'wx',mode:0o600});}
export function archiveTask(store,reservation){
 const layout=store.meta.durability;if(!layout)return;
 const {runId,task}=reservation,dir=join(store.root,'segments',runId,task);
 // A disappeared mount must not become a newly-created directory on the internal disk.
 check(existsSync(layout.archiveRoot),'archive_unavailable');if(store.meta.identity.mode==='live')check(statSync(layout.archiveRoot).dev!==statSync(store.root).dev,'archive_not_external');
 const target=join(layout.archiveRoot,store.meta.campaignId,runId,task),receiptPath=join(target,'receipt.json');
 if(existsSync(receiptPath)){
  const receipt=JSON.parse(readFileSync(receiptPath)),record=store.rows.find(r=>r.event==='archived'&&r.task===task);if(record)check(record.receipt===digest(readFileSync(receiptPath)),'archive_receipt_changed');check(receipt.campaignId===store.meta.campaignId&&receipt.runId===runId&&receipt.task===task,'archive_identity');
  for(const [f,h] of Object.entries(receipt.files))check(digest(readFileSync(join(target,'snapshots',receipt.snapshot,f)))===h,'archive_hash');
  // Retry never executes a task; finished archives are immutable, including their ledger snapshot.
  if(!store.rows.some(r=>r.event==='archived'&&r.task===task))store.add('archived',{task,runId,receipt:digest(readFileSync(receiptPath)),path:target});return;
 }
 const files={'campaign.json':digest(readFileSync(join(store.root,'campaign.json')))};
 for(const [f,h] of Object.entries(collect(dir)))files['segments/'+runId+'/'+task+'/'+f]=h;
 for(const n of readdirSync(join(store.root,'journal')).filter(n=>/^\d{8}\.json$/.test(n)))files['journal/'+n]=digest(readFileSync(join(store.root,'journal',n)));
 for(const f of ['activation.json','ledger.jsonl'])if(existsSync(join(store.root,'segments',runId,f)))files['segments/'+runId+'/'+f]=digest(readFileSync(join(store.root,'segments',runId,f)));
 // Copy under a fresh checkpoint key so an interrupted partial copy never overwrites evidence.
 const snapshot=digest(canonical(files))+'-'+crypto.randomUUID();const dest=join(target,'snapshots',snapshot);mkdirSync(dest,{recursive:true});
 for(const [f,h] of Object.entries(files))copyFile(join(store.root,f),join(dest,f),h);
 flushTree(dir);flushTree(dest);for(const [f,h] of Object.entries(files))check(digest(readFileSync(join(dest,f)))===h,'archive_hash');
 // Receipt paths are relative to target, with no links or writable aliases to live originals.
 for(let p=target;;p=dirname(p)){const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}if(p===resolve(layout.archiveRoot))break;check(p!==dirname(p),'archive_parent');}
 durable(receiptPath,{campaignId:store.meta.campaignId,runId,task,checkpoint:store.head,utc:new Date().toISOString(),snapshot,files});
 store.add('archived',{task,runId,receipt:digest(readFileSync(receiptPath)),path:target});
}
export function pendingArchives(store){return store.meta.durability?store.rows.filter(r=>r.event==='reserved'&&!store.rows.some(x=>x.event==='archived'&&x.task===r.task)):[];}
