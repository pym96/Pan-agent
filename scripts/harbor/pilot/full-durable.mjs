import {readFileSync,writeFileSync,existsSync,readdirSync,lstatSync,statSync,statfsSync,realpathSync,mkdirSync,openSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute,relative} from 'node:path';
import {homedir} from 'node:os';
import {check,canonical,digest} from './policy.mjs';

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
// Publish a nonempty directory by same-filesystem rename: no hard links required.
// Staged directories are retained on failure; only commit/receipt.json is committed.
export function publishReceipt(target,receipt,checkpoint=()=>{}){
 const stage=join(target,'receipt.stage-'+crypto.randomUUID());mkdirSync(stage);
 const p=join(stage,'receipt.json'),fd=openSync(p,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(receipt,null,2)+'\n');checkpoint('receipt_written');fsyncSync(fd);}finally{closeSync(fd);}
 flushTree(stage);checkpoint('before_publish');
 renameSync(stage,join(target,'commit'));checkpoint('after_publish');
 const d=openSync(target,'r');try{fsyncSync(d);}finally{closeSync(d);}
}
function receiptAt(target){
 const legacy=join(target,'receipt.json'),modern=join(target,'commit','receipt.json');
 check(!(existsSync(legacy)&&existsSync(join(target,'commit'))),'archive_conflict');
 if(existsSync(join(target,'commit')))check(existsSync(modern),'archive_incomplete_commit');
 return existsSync(legacy)?legacy:existsSync(modern)?modern:null;
}
function verifyReceipt(store,reservation,target,path){
 check(!lstatSync(path).isSymbolicLink(),'archive_symlink');
 const receipt=JSON.parse(readFileSync(path)),{runId,task}=reservation;
 check(receipt.campaignId===store.meta.campaignId&&receipt.runId===runId&&receipt.task===task,'archive_identity');
 check(typeof receipt.snapshot==='string'&&/^[a-f0-9-]+$/.test(receipt.snapshot)&&receipt.files&&typeof receipt.files==='object','archive_receipt');
 const snapshot=join(target,'snapshots',receipt.snapshot),actual=collect(snapshot);
 check(Object.keys(receipt.files).every(f=>Object.hasOwn(actual,f))&&Object.keys(actual).every(f=>Object.hasOwn(receipt.files,f)||f.split('/').some(n=>n.startsWith('._'))),'archive_inventory');
 check(receipt.files['campaign.json']&&Object.keys(receipt.files).some(f=>f.startsWith('segments/'+runId+'/'+task+'/')),'archive_receipt');
 for(const [f,h] of Object.entries(receipt.files)){
  check(!f.startsWith('/')&&!f.split('/').some(x=>['..','.',''].includes(x)),'archive_path');
  check(actual[f]===h,'archive_hash');
  const local=readFileSync(join(store.root,f)),archived=readFileSync(join(snapshot,f));
  // A run ledger may grow after an earlier task archive; its sealed prefix may not change.
  check(f==='segments/'+runId+'/ledger.jsonl'?local.subarray(0,archived.length).equals(archived):digest(local)===h,'archive_local_conflict');
 }
 for(const f of ['activation.json','ledger.jsonl'])if(existsSync(join(store.root,'segments',runId,f)))check(receipt.files['segments/'+runId+'/'+f],'archive_receipt');
 let head=digest(canonical(JSON.parse(readFileSync(join(snapshot,'campaign.json'))))),index=0;
 for(const f of Object.keys(receipt.files).filter(f=>f.startsWith('journal/')).sort()){
  check(f==='journal/'+String(index++).padStart(8,'0')+'.json','archive_journal');
  const row=JSON.parse(readFileSync(join(snapshot,f)));check(row.previous===head,'archive_journal');head=digest(canonical(row));
 }
 check(head===receipt.checkpoint,'archive_checkpoint');
 const taskFiles=collect(join(store.root,'segments',runId,task));
 check(Object.keys(taskFiles).every(f=>receipt.files['segments/'+runId+'/'+task+'/'+f]===taskFiles[f]),'archive_local_conflict');
 const record=store.rows.find(r=>r.event==='archived'&&r.task===task&&r.runId===runId);
 if(record)check(record.receipt===digest(readFileSync(path)),'archive_receipt_changed');
 return receipt;
}
export function archiveTask(store,reservation,checkpoint=()=>{}){
 const layout=store.meta.durability;if(!layout)return;
 const {runId,task}=reservation,dir=join(store.root,'segments',runId,task);
 check(existsSync(layout.archiveRoot),'archive_unavailable');if(store.meta.identity.mode==='live')check(statSync(layout.archiveRoot).dev!==statSync(store.root).dev,'archive_not_external');
 const target=join(layout.archiveRoot,store.meta.campaignId,runId,task);
 let path=receiptAt(target);
 if(!path){
  const files={'campaign.json':digest(readFileSync(join(store.root,'campaign.json')))};
  for(const [f,h] of Object.entries(collect(dir)))files['segments/'+runId+'/'+task+'/'+f]=h;
  for(const n of readdirSync(join(store.root,'journal')).filter(n=>/^\d{8}\.json$/.test(n)))files['journal/'+n]=digest(readFileSync(join(store.root,'journal',n)));
  for(const f of ['activation.json','ledger.jsonl'])if(existsSync(join(store.root,'segments',runId,f)))files['segments/'+runId+'/'+f]=digest(readFileSync(join(store.root,'segments',runId,f)));
  const snapshot=digest(canonical(files))+'-'+crypto.randomUUID(),dest=join(target,'snapshots',snapshot);mkdirSync(dest,{recursive:true});
  for(const [f,h] of Object.entries(files)){copyFile(join(store.root,f),join(dest,f),h);checkpoint('copy');}
  flushTree(dir);flushTree(dest);for(const [f,h] of Object.entries(files))check(digest(readFileSync(join(dest,f)))===h,'archive_hash');
  // Flush the namespace chain before publishing a receipt pointing into it.
  for(let p=target;;p=dirname(p)){const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}if(p===resolve(layout.archiveRoot))break;check(p!==dirname(p),'archive_parent');}
  try{publishReceipt(target,{campaignId:store.meta.campaignId,runId,task,checkpoint:store.head,utc:new Date().toISOString(),snapshot,files},checkpoint);}
  catch(e){if(!['EEXIST','ENOTEMPTY'].includes(e.code))throw e;}
  path=receiptAt(target);check(path,'archive_uncommitted');
 }
 verifyReceipt(store,reservation,target,path);checkpoint('before_journal');
 if(!store.rows.some(r=>r.event==='archived'&&r.task===task&&r.runId===runId))store.add('archived',{task,runId,receipt:digest(readFileSync(path)),path:target});
}
export function pendingArchives(store){return store.meta.durability?[...store.rows.filter(r=>r.event==='reserved'),...(store.imported??[]).filter(r=>r.requiresArchive)].filter(r=>!store.rows.some(x=>x.event==='archived'&&x.task===r.task&&x.runId===r.runId)):[];}
