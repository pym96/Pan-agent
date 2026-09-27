// Narrow one-time successor for the frozen, never-executed #97 preparation snapshot.
import {readFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {check,canonical,digest} from './policy.mjs';
import {Store,initialize,lock,durable} from './full-store.mjs';
import {resourceCheck} from './full-host.mjs';
export const SOURCE_ROOT='/private/tmp/wo97-live/campaign';
export const SOURCE_HASH='9a593a277bf5b1781e36e7f085c2868477597c1f0a572de10c8f8e6f61212b20';
export const OLD_RUNNER='e0d88ecee96c2c1a45ccf1af8e34cf9ffebef2b1';
export function inventory(root){
 const files={};const walk=(dir,rel='')=>{for(const name of readdirSync(dir).sort()){const path=join(dir,name),key=rel?rel+'/'+name:name,s=lstatSync(path);check(!s.isSymbolicLink(),'migration_symlink');if(s.isDirectory())walk(path,key);else {check(s.isFile(),'migration_special_file');files[key]=digest(readFileSync(path));}}};walk(root);return files;
}
// The expected digest is fixed by #98 Evidence, not supplied by the operator.
export function inspectSource(root,expected=SOURCE_HASH){
 const files=inventory(root);check(digest(canonical(files))===expected,'migration_source_hash');
 const meta=JSON.parse(readFileSync(join(root,'campaign.json')));let head=digest(canonical(meta));const rows=[];
 check(meta.identity.runnerSha===OLD_RUNNER,'migration_source_runner');
 check(readdirSync(join(root,'segments')).length===0,'migration_executed');
 for(const name of Object.keys(files))check(name==='.lock'||name==='campaign.json'||name==='resources.jsonl'||/^journal\/\d{8}\.json$/.test(name),'migration_unexpected_file');
 for(const name of Object.keys(files).filter(n=>n.startsWith('journal/')).sort()){
  const row=JSON.parse(readFileSync(join(root,name)));check(name==='journal/'+String(rows.length).padStart(8,'0')+'.json'&&row.previous===head,'journal_chain');check(row.event==='preparation','migration_executed');rows.push(row);head=digest(canonical(row));
 }
 return {files,meta,rows,head,hash:expected};
}
export async function successor(source,target,host,manifest,expected=SOURCE_HASH){
 check(realpathSync(dirname(target))===realpathSync(dirname(source))&&target===join(realpathSync(dirname(source)),'campaign-disk20'),'migration_target');
 check(existsSync(join(source,'.lock')),'migration_source_lock_missing');
 const release=await lock(source); // Existing lock only; no metadata/journal/resources writes.
 try{
  const original=inspectSource(source,expected),runner=host.runnerSha();check(runner!==OLD_RUNNER,'migration_new_runner_required');
  const identity={...original.meta.identity,runnerSha:runner};
  check(identity.manifestHash===digest(readFileSync(new URL('./full-manifest.json',import.meta.url)))&&canonical(identity.model)===canonical(host.expectedModel)&&canonical(identity.budget)===canonical(host.expectedBudget)&&identity.mode===host.mode&&identity.panHash===host.packageHash,'migration_identity');
  host.internal(dirname(target));resourceCheck(target,original.meta.resourceBaseline,host.sample(source));
  for(const row of original.rows)check(manifest.tasks.some(t=>t.id===row.task),'migration_task');
  // mkdir is the exclusive publication claim. A crash leaves evidence and cannot be retried over it.
  const store=initialize(target,{schema:1,campaignId:crypto.randomUUID(),identity,resourceBaseline:original.meta.resourceBaseline,createdUTC:new Date().toISOString(),predecessor:{root:original.meta.root,campaignId:original.meta.campaignId,checkpoint:original.head,sourceHash:expected,runnerSha:OLD_RUNNER,freeFloorBefore:60*2**30,freeFloorAfter:20*2**30}});
  const archive=join(target,'source-original');mkdirSync(archive);mkdirSync(join(archive,'segments'));mkdirSync(join(archive,'docker-client'));
  for(const name of Object.keys(original.files)){const dest=join(archive,name);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(source,name)),{flag:'wx'});}
  check(digest(canonical(inventory(archive)))===expected,'migration_copy_hash');
  for(const row of original.rows)store.add('preparation',{task:row.task,detail:row.detail,sourceRecordHash:digest(canonical(row)),sourceUTC:row.utc});
  inspectSource(source,expected);
  durable(join(target,'migration-complete.json'),{sourceHash:expected,checkpoint:store.head});
  return store;
 }finally{await release();}
}
export async function migrate97(target,host,manifest){
 check(target===join(dirname(SOURCE_ROOT),'campaign-disk20'),'migration_target');
 const {MODEL,METERED_LIMITS}=await import('./policy.mjs');const pkg=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));
 return successor(SOURCE_ROOT,target,{...host,expectedModel:MODEL,expectedBudget:METERED_LIMITS,packageHash:pkg.package_sha256},manifest);
}
export function validateSuccessor(store){
 if(!store.meta.predecessor)return;
 const p=store.meta.predecessor;check(p.sourceHash===SOURCE_HASH,'migration_source_hash');
 const source=inspectSource(join(store.root,'source-original'));
 check(canonical(store.meta.resourceBaseline)===canonical(source.meta.resourceBaseline),'migration_baseline');
 check(p.root===source.meta.root&&p.campaignId===source.meta.campaignId&&p.checkpoint===source.head&&p.runnerSha===OLD_RUNNER&&p.freeFloorBefore===60*2**30&&p.freeFloorAfter===20*2**30,'migration_provenance');
 const old={...source.meta.identity,runnerSha:store.meta.identity.runnerSha};check(canonical(old)===canonical(store.meta.identity)&&old.runnerSha!==OLD_RUNNER,'migration_identity');
 const rows=store.rows.slice(0,source.rows.length);check(rows.length===source.rows.length,'migration_incomplete');
 for(let i=0;i<rows.length;i++){const a=rows[i],b=source.rows[i];check(a.event==='preparation'&&a.task===b.task&&canonical(a.detail)===canonical(b.detail)&&a.sourceRecordHash===digest(canonical(b))&&a.sourceUTC===b.utc,'migration_preparation');}
 const complete=JSON.parse(readFileSync(join(store.root,'migration-complete.json')));check(complete.sourceHash===SOURCE_HASH&&complete.checkpoint===(rows.length?digest(canonical(rows.at(-1))):digest(canonical(store.meta))),'migration_incomplete');
}
