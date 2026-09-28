// #99: one pinned CLOSED executed source; no arbitrary campaign import.
import {readFileSync,existsSync,cpSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {Store,initialize,lock,durable} from './full-store.mjs';
import {inventory,validateSuccessor} from './full-migrate.mjs';
import {resourceCheck,DISK_POLICY} from './full-host.mjs';
import {check,canonical,digest,MODEL,METERED_LIMITS} from './policy.mjs';
export const EXECUTED_SOURCE='/private/tmp/wo97-live/campaign-disk20';
export const EXECUTED_HASH='fa179cba8ee9b278977322ad77e98846d23b3468b892e93e8a805272358ddc7d';
export const EXECUTED_CHECKPOINT='2042e9534a5943c8386d1f7e03150a02dd7ecf60ebc045a064900f26f59ac68f';
export const EXECUTED_RUNNER='dc42190f547f352250be986ed76587667c5e59db';
export function inspectExecuted(root){
 check(digest(canonical(inventory(root)))===EXECUTED_HASH,'history_inventory');
 const source=new Store(root,EXECUTED_SOURCE);validateSuccessor(source);
 check(source.head===EXECUTED_CHECKPOINT&&source.meta.campaignId==='447d42b7-43d1-4e7e-9e95-8c2d6ce1683e'&&source.meta.identity.runnerSha===EXECUTED_RUNNER,'history_identity');
 check(!source.pending().length,'history_active');
 const reserved=source.rows.filter(r=>r.event==='reserved');check(reserved.length===37,'history_reservations');
 for(const r of reserved){
  const result=source.rows.find(x=>x.event==='result'&&x.task===r.task);check(result?.stopConfirmed===true,'history_stop_unknown');
  const cleanup=JSON.parse(readFileSync(join(root,'segments',r.runId,r.task,'cleanup.json')));check(cleanup.confirmed===true&&cleanup.project===r.project,'history_cleanup');
 }
 return source;
}
export async function executedSuccessor(sourceRoot,target,host){
 check(target===join(realpathSync(dirname(sourceRoot)),'campaign-disk39'),'history_target');
 check(existsSync(join(sourceRoot,'.lock')),'history_lock_missing');inspectExecuted(sourceRoot);const release=await lock(sourceRoot);
 try{
  const source=inspectExecuted(sourceRoot),runner=host.runnerSha();check(runner!==EXECUTED_RUNNER&&/^[a-f0-9]{40}$/.test(runner),'history_new_runner');
  const pkg=JSON.parse(readFileSync(new URL('./package-identity.json',import.meta.url)));
  const identity={...source.meta.identity,runnerSha:runner};check(identity.mode===host.mode&&identity.panHash===pkg.package_sha256&&identity.manifestHash===digest(readFileSync(new URL('./full-manifest.json',import.meta.url)))&&canonical(identity.model)===canonical(MODEL)&&canonical(identity.budget)===canonical(METERED_LIMITS),'history_product_identity');
  host.internal(dirname(target));resourceCheck(target,source.meta.resourceBaseline,host.sample(sourceRoot));
  const store=initialize(target,{schema:1,campaignId:crypto.randomUUID(),identity,resourceBaseline:source.meta.resourceBaseline,createdUTC:new Date().toISOString(),history:{root:EXECUTED_SOURCE,campaignId:source.meta.campaignId,checkpoint:source.head,inventory:EXECUTED_HASH,runnerSha:EXECUTED_RUNNER,oldPolicy:{minFreeBytes:20*2**30,incrementExclusiveBytes:24*2**30},newPolicy:DISK_POLICY}});
  // Independent byte copies, never hardlinks back to live ledgers or artifacts.
  cpSync(sourceRoot,join(target,'history-original'),{recursive:true,errorOnExist:true,force:false});
  inspectExecuted(sourceRoot);inspectExecuted(join(target,'history-original'));
  resourceCheck(target,source.meta.resourceBaseline,host.sample(target));
  durable(join(target,'history-complete.json'),{inventory:EXECUTED_HASH,metadata:digest(canonical(store.meta))});
  attachHistory(store);return store;
 }finally{await release();}
}
export function attachHistory(store){
 if(!store.meta.history){check(!existsSync(join(store.root,'history-original'))&&!existsSync(join(store.root,'history-complete.json')),'history_metadata_missing');return;}
 const h=store.meta.history;check(h.root===EXECUTED_SOURCE&&h.inventory===EXECUTED_HASH&&h.checkpoint===EXECUTED_CHECKPOINT&&h.runnerSha===EXECUTED_RUNNER&&canonical(h.newPolicy)===canonical(DISK_POLICY)&&canonical(h.oldPolicy)===canonical({minFreeBytes:20*2**30,incrementExclusiveBytes:24*2**30}),'history_provenance');
 const source=inspectExecuted(join(store.root,'history-original'));
 check(h.campaignId===source.meta.campaignId&&canonical(store.meta.resourceBaseline)===canonical(source.meta.resourceBaseline),'history_baseline');
 check(canonical({...source.meta.identity,runnerSha:store.meta.identity.runnerSha})===canonical(store.meta.identity)&&store.meta.identity.runnerSha!==EXECUTED_RUNNER,'history_identity');
 const done=JSON.parse(readFileSync(join(store.root,'history-complete.json')));check(done.inventory===EXECUTED_HASH&&done.metadata===digest(canonical(store.meta)),'history_incomplete');
 store.history=source;store.reload();
}
export function migrateExecuted97(target,host){
 check(target===join(dirname(EXECUTED_SOURCE),'campaign-disk39'),'history_target');
 return executedSuccessor(EXECUTED_SOURCE,target,host);
}
