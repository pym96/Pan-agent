// Narrow immutable import of the stopped #97 segment3; never edit predecessor identity.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {Store,initialize,durable} from './full-store.mjs';
import {attachRecovery} from './full-recovery.mjs';
import {validateLayout,sampleDurable,archiveTask,flushTree} from './full-durable.mjs';
import {resourceCheck,EXECUTION_POLICY} from './full-host.mjs';
import {check,canonical,digest} from './policy.mjs';
export const SOURCE_ROOT='/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/campaign';
export const SOURCE_INVENTORY='b58f31c35940e89823ebde01876ee9d601eec0becfccfa088726854032cc46c7';
export const OLD_RUN='df271106-59db-4b02-8439-3799e3399e4b';
export function sourceInventory(root,rel='',out={}){
 for(const n of readdirSync(join(root,rel)).sort()){
  if((!rel&&n==='.lock')||n.startsWith('._'))continue;
  const f=rel?rel+'/'+n:n,p=join(root,f),s=lstatSync(p);check(!s.isSymbolicLink(),'upgrade_symlink');
  if(s.isDirectory())sourceInventory(root,f,out);else{check(s.isFile(),'upgrade_special');out[f]=digest(readFileSync(p));}
 }return out;
}
export function inspectPredecessor(root,m){
 const files=sourceInventory(root);check(digest(canonical(files))===SOURCE_INVENTORY,'upgrade_source_hash');
 const s=new Store(root,SOURCE_ROOT);attachRecovery(s,m);
 check(s.meta.identity.runnerSha==='fce8cc2ad6cf6ab7755a7c7b4874cfe6cf777d71'&&s.meta.campaignId==='267ea540-6b8e-4736-b6ff-ecfe3ce9fba1','upgrade_source_identity');
 check(s.pending().length===1&&s.pending()[0].runId===OLD_RUN,'upgrade_pending');
 const reserved=s.rows.filter(r=>r.event==='reserved');check(reserved.length===1&&reserved[0].task==='mcmc-sampling-stan','upgrade_consumption');
 const imported=[...s.imported,...reserved.map(r=>({event:'consumed_import',task:r.task,runId:r.runId,project:r.project,image:r.image,oldRoot:SOURCE_ROOT,stopConfirmed:s.rows.find(x=>x.event==='result'&&x.task===r.task)?.stopConfirmed??null,outcome:s.rows.find(x=>x.event==='result'&&x.task===r.task)??null,requiresArchive:true,missingEvidence:false}))];
 check(new Set(imported.map(r=>r.task)).size===58,'upgrade_consumption');
 return {store:s,files,imported};
}
export function upgrade97(source,target,layout,host,m){
 const proof=inspectPredecessor(source,m),runner=host.runnerSha();check(/^[a-f0-9]{40}$/.test(runner)&&runner!==proof.store.meta.identity.runnerSha,'upgrade_new_runner');
 validateLayout(layout,target,host.mode);host.internal(dirname(target));
 resourceCheck(target,proof.store.meta.resourceBaseline,(host.sampleRecovery??sampleDurable)(dirname(target),layout.ownedRoots));
 const s=initialize(target,{schema:2,campaignId:crypto.randomUUID(),createdUTC:new Date().toISOString(),identity:{...proof.store.meta.identity,runnerSha:runner,mode:host.mode,executionPolicy:EXECUTION_POLICY},resourceBaseline:proof.store.meta.resourceBaseline,durability:layout,upgrade102:{inventory:SOURCE_INVENTORY,root:SOURCE_ROOT,checkpoint:proof.store.head,runnerSha:proof.store.meta.identity.runnerSha}});
 for(const [f,h] of Object.entries(proof.files)){
  const bytes=readFileSync(join(source,f));check(digest(bytes)===h,'upgrade_source_changed');
  const dest=join(target,'predecessor-original',f);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes,{flag:'wx'});
  if(f.startsWith('segments/')){const p=join(target,f);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes,{flag:'wx'});}
 }
 s.add('predecessor_import',{source:realpathSync(source),inventory:SOURCE_INVENTORY,consumed:58,pendingRun:OLD_RUN,notice:'original metadata and pending journal retained; successor reconciliation required'});
 flushTree(target);durable(join(target,'upgrade-complete.json'),{metadata:digest(canonical(s.meta)),inventory:SOURCE_INVENTORY});
 attachUpgrade(s,m);resourceCheck(target,s.meta.resourceBaseline,(host.sampleRecovery??sampleDurable)(target,layout.ownedRoots));return s;
}
export function attachUpgrade(s,m){
 if(!s.meta.upgrade102)return;
 const h=s.meta.upgrade102,proof=inspectPredecessor(join(s.root,'predecessor-original'),m),done=JSON.parse(readFileSync(join(s.root,'upgrade-complete.json')));
 check(h.inventory===SOURCE_INVENTORY&&h.root===SOURCE_ROOT&&h.checkpoint===proof.store.head&&h.runnerSha===proof.store.meta.identity.runnerSha&&s.meta.identity.runnerSha!==h.runnerSha,'upgrade_provenance');
 check(canonical({...proof.store.meta.identity,runnerSha:s.meta.identity.runnerSha,mode:s.meta.identity.mode})===canonical(s.meta.identity)&&canonical(s.meta.resourceBaseline)===canonical(proof.store.meta.resourceBaseline),'upgrade_identity');
 check(done.metadata===digest(canonical(s.meta))&&done.inventory===SOURCE_INVENTORY&&s.rows[0]?.event==='predecessor_import'&&s.rows[0].inventory===SOURCE_INVENTORY,'upgrade_incomplete');
 for(const [f,h] of Object.entries(proof.files).filter(([f])=>f.startsWith('segments/')))check(digest(readFileSync(join(s.root,f)))===h,'upgrade_accounting_or_result_changed');
 s.imported=proof.imported;s.oldRunIds=[...proof.store.oldRunIds,OLD_RUN];s.reload();
}
export async function reconcilePredecessor(s,host){
 if(!s.meta.upgrade102||s.rows.some(r=>r.event==='predecessor_reconciled'))return;
 resourceCheck(s.root,s.meta.resourceBaseline,(host.sampleRecovery??sampleDurable)(s.root,s.meta.durability.ownedRoots));
 for(const r of s.imported.filter(r=>r.requiresArchive)){
  const observation=await host.inspectResidual(r);check(observation?.confirmed===true,'historical_stop_unknown');
  archiveTask(s,r);s.add('predecessor_stop_observed',{task:r.task,runId:r.runId,observation});
 }
 s.add('predecessor_reconciled',{runId:OLD_RUN,sourceInventory:SOURCE_INVENTORY,notice:'successor records current archive/stop confirmation; original pending journal remains unchanged'});
}
