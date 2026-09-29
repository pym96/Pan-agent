// One fixed stopped #97 source -> #103 product. Historical bytes never change.
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,statSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,initialize,durable} from './full-store.mjs';
import {sourceInventory,attachUpgrade} from './full-upgrade-102.mjs';
import {validateLayout,sampleDurable,pendingArchives,flushTree,publishReceipt} from './full-durable.mjs';
import {resourceCheck} from './full-host.mjs';
import {check,canonical,digest} from './policy.mjs';
export const SUCCESSOR_SOURCE='/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria17/campaign';
export const SUCCESSOR_INVENTORY='b3b9248ae10a3f8da677b044c6c4d02ce46bcf72c93fbea2c9934f58c0850c30';
export const SUCCESSOR_PACKAGE='5ecd3b9b4da688f90dfee3cc651b4a2f755595587b6d7d7287383cab23c8e580';
const OLD_RUNNER='032fb0fba5e9d3893f90a4ff4baae89b43af37aa';
const json=p=>JSON.parse(readFileSync(p));
export function inspectSuccessorSource(root,m){
 const files=sourceInventory(root);check(digest(canonical(files))===SUCCESSOR_INVENTORY,'successor_source_hash');
 const store=new Store(root,SUCCESSOR_SOURCE);attachUpgrade(store,m);
 check(store.meta.campaignId==='10d69769-d733-480a-bb37-5e08457cb512'&&store.meta.identity.runnerSha===OLD_RUNNER&&store.meta.identity.panHash==='12a1e82bbb59c5572c3b59140c4222308d9bf4296deafa84b539c50d25fa7b61','successor_source_identity');
 check(!store.pending().length&&!pendingArchives(store).length&&store.rows.at(-1)?.event==='segment_closed','successor_source_unsettled');
 const imported=m.tasks.map(t=>store.reserved(t.id)).filter(Boolean).map(r=>r.event==='consumed_import'?{...r,requiresArchive:false}:{event:'consumed_import',task:r.task,runId:r.runId,project:r.project,image:r.image,oldRoot:SUCCESSOR_SOURCE,stopConfirmed:store.rows.find(x=>x.event==='result'&&x.task===r.task)?.stopConfirmed??null,outcome:store.rows.find(x=>x.event==='result'&&x.task===r.task)??null,missingEvidence:false,requiresArchive:false});
 check(imported.length===62&&new Set(imported.map(r=>r.task)).size===62,'successor_consumption');
 // Include unused-but-consumed historical permits too, not just task-bearing runs.
 const oldRunIds=[...new Set([...store.oldRunIds,...store.rows.filter(r=>r.event==='segment_open').map(r=>r.runId),...Object.keys(files).filter(f=>/\/ledgers\/[a-f0-9-]{36}\.jsonl$/.test(f)).map(f=>f.split('/').at(-1).slice(0,-6))])];
 return {store,files,imported,oldRunIds};
}
function copyFiles(source,target,files){for(const [f,h] of Object.entries(files)){const bytes=readFileSync(join(source,f));check(digest(bytes)===h,'successor_source_changed');const p=join(target,f);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes,{flag:'wx'});}}
function identity(proof,runner){return {...proof.store.meta.identity,runnerSha:runner,panHash:SUCCESSOR_PACKAGE};}
export async function successor97(source,target,layout,host,m){
 const actualSource=realpathSync(source),actualTarget=join(realpathSync(dirname(target)),basename(target));
 check(actualTarget!==actualSource&&!actualTarget.startsWith(actualSource+'/')&&!actualSource.startsWith(actualTarget+'/'),'successor_source_target_overlap');
 const proof=inspectSuccessorSource(source,m),runner=host.runnerSha();check(/^[a-f0-9]{40}$/.test(runner)&&runner!==OLD_RUNNER,'successor_new_runner');
 check(host.mode===proof.store.meta.identity.mode,'successor_mode');validateLayout(layout,target,host.mode);host.internal(dirname(target));
 if(host.mode==='live')check(realpathSync(layout.runner)===realpathSync(fileURLToPath(new URL('../../..',import.meta.url))),'durable_runner_identity');
 const pkg=host.verifyProduct(layout.entry,layout);check(pkg.package_sha256===SUCCESSOR_PACKAGE,'successor_product');
 resourceCheck(target,proof.store.meta.resourceBaseline,(host.sampleRecovery??sampleDurable)(dirname(target),layout.ownedRoots));
 const s=initialize(target,{schema:2,campaignId:crypto.randomUUID(),createdUTC:new Date().toISOString(),identity:identity(proof,runner),resourceBaseline:proof.store.meta.resourceBaseline,durability:layout,successor104:{root:SUCCESSOR_SOURCE,inventory:SUCCESSOR_INVENTORY,campaignId:proof.store.meta.campaignId,checkpoint:proof.store.head,runnerSha:OLD_RUNNER,panHash:proof.store.meta.identity.panHash}});
 await host.checkpoint?.('successor_initialized');
 copyFiles(source,join(target,'successor-original'),proof.files);
 copyFiles(source,target,Object.fromEntries(Object.entries(proof.files).filter(([f])=>f.startsWith('segments/'))));
 inspectSuccessorSource(source,m);inspectSuccessorSource(join(target,'successor-original'),m);
 s.add('successor_import',{inventory:SUCCESSOR_INVENTORY,consumed:proof.imported.length,oldRunIds:proof.oldRunIds,notice:'old preparations are evidence only; fresh checks and archive/stop confirmation required'});
 resourceCheck(target,s.meta.resourceBaseline,(host.sampleRecovery??sampleDurable)(target,layout.ownedRoots));flushTree(target);
 await host.checkpoint?.('successor_before_complete');
 durable(join(target,'successor-complete.json'),{metadata:digest(canonical(s.meta)),inventory:SUCCESSOR_INVENTORY});attachSuccessor(s,m);return s;
}
function archivePath(s){return join(s.meta.durability.archiveRoot,s.meta.campaignId,'predecessor');}
function checkArchiveStorage(s,paths=[]){
 const archive=s.meta.durability.archiveRoot;check(existsSync(archive),'archive_unavailable');
 if(s.meta.identity.mode==='live'){
  const device=statSync(archive).dev;
  check(device!==statSync(s.root).dev&&paths.every(p=>statSync(p).dev===device),'archive_not_external');
 }
}
function verifyArchive(s){
 const root=archivePath(s),receiptPath=join(root,'commit/receipt.json');
 // Hash equality proves bytes, not the filesystem currently serving those bytes.
 checkArchiveStorage(s,[root,receiptPath]);const receipt=json(receiptPath);
 check(receipt.inventory===SUCCESSOR_INVENTORY&&receipt.metadata===digest(canonical(s.meta))&&typeof receipt.snapshot==='string'&&/^[a-f0-9-]{36}$/.test(receipt.snapshot),'successor_archive_identity');
 checkArchiveStorage(s,[join(root,receipt.snapshot)]);
 check(digest(canonical(sourceInventory(join(root,receipt.snapshot))))===SUCCESSOR_INVENTORY,'successor_archive_hash');
 return digest(readFileSync(join(root,'commit/receipt.json')));
}
export function verifySuccessorArchive(s){
 if(!s.meta.successor104)return;
 const archived=s.rows.find(r=>r.event==='successor_reconciled');
 if(archived)check(archived.receipt===verifyArchive(s),'successor_archive_changed');
}
export function attachSuccessor(s,m){
 if(!s.meta.successor104){check(!existsSync(join(s.root,'successor-original'))&&!existsSync(join(s.root,'successor-complete.json')),'successor_metadata_missing');return;}
 const proof=inspectSuccessorSource(join(s.root,'successor-original'),m),h=s.meta.successor104,done=json(join(s.root,'successor-complete.json'));
 check(canonical(h)===canonical({root:SUCCESSOR_SOURCE,inventory:SUCCESSOR_INVENTORY,campaignId:proof.store.meta.campaignId,checkpoint:proof.store.head,runnerSha:OLD_RUNNER,panHash:proof.store.meta.identity.panHash}),'successor_provenance');
 check(/^[a-f0-9]{40}$/.test(s.meta.identity.runnerSha)&&s.meta.identity.runnerSha!==OLD_RUNNER&&canonical(s.meta.identity)===canonical(identity(proof,s.meta.identity.runnerSha))&&canonical(s.meta.resourceBaseline)===canonical(proof.store.meta.resourceBaseline),'successor_identity');
 check(done.inventory===SUCCESSOR_INVENTORY&&done.metadata===digest(canonical(s.meta))&&s.rows[0]?.event==='successor_import'&&s.rows[0].inventory===SUCCESSOR_INVENTORY&&canonical(s.rows[0].oldRunIds)===canonical(proof.oldRunIds),'successor_incomplete');
 for(const [f,h] of Object.entries(proof.files).filter(([f])=>f.startsWith('segments/')))check(digest(readFileSync(join(s.root,f)))===h,'successor_accounting_changed');
 s.imported=proof.imported;s.oldRunIds=proof.oldRunIds;s.reload();
 verifySuccessorArchive(s);
}
export async function reconcileSuccessor(s,host){
 if(!s.meta.successor104)return;
 if(s.rows.some(r=>r.event==='successor_reconciled')){verifySuccessorArchive(s);return;}
 resourceCheck(s.root,s.meta.resourceBaseline,(host.sampleRecovery??sampleDurable)(s.root,s.meta.durability.ownedRoots));
 for(const r of s.imported){const p=await host.inspectResidual(r);check(p?.confirmed===true,'historical_stop_unknown');}
 checkArchiveStorage(s);
 const root=archivePath(s);mkdirSync(root,{recursive:true});checkArchiveStorage(s,[root]);
 if(!existsSync(join(root,'commit/receipt.json'))){
  const snapshot=crypto.randomUUID(),source=join(s.root,'successor-original');copyFiles(source,join(root,snapshot),sourceInventory(source));flushTree(join(root,snapshot));
  await host.checkpoint?.('successor_before_archive');
  publishReceipt(root,{inventory:SUCCESSOR_INVENTORY,metadata:digest(canonical(s.meta)),snapshot});
 }
 const receipt=verifyArchive(s);s.add('successor_reconciled',{receipt,sourceInventory:SUCCESSOR_INVENTORY,stopsObserved:s.imported.length});
}
