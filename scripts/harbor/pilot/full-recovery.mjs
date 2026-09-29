// #100: evidence import, not reconstruction of the lost journal. Pins are accepted #97 artifacts.
import {readFileSync,existsSync,mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {check,canonical,digest,MODEL,METERED_LIMITS} from './policy.mjs';
import {initialize,durable,rawAccounting} from './full-store.mjs';
import {projectFor,EXECUTION_POLICY,resourceCheck} from './full-host.mjs';
import {validateLayout,sampleDurable,flushTree} from './full-durable.mjs';
export const PINS=Object.freeze({archive:'34165656f7cc4b6f48ed1097d96bf524f624a120003f18badeb1627efd8f6f9e',index:'294a67cb9db4a0efa982859f85ac8abfed1e13779de558c434c3c5660acfca4a',ledgers:'a94398a3e395572655c5aa48733fd1aa922118f60c0b01702324a3f550ab743f',second:'1467312adb5193eaca0fe694e95e3c6ac2749f72bcaca3e7008a335c76013b0e'});
export const RECOVERY_PACKAGE='12a1e82bbb59c5572c3b59140c4222308d9bf4296deafa84b539c50d25fa7b61';
const FIRST='eecf5765-a6fe-47ab-9286-aa825fa0aba7',SECOND='16f4f98e-348f-41a3-b18f-ee9dad4dbc18';
const json=p=>JSON.parse(readFileSync(p));
function pinned(path,hash){const bytes=readFileSync(path);check(digest(bytes)===hash,'recovery_source_hash');return JSON.parse(bytes);}
function safe(name){check(typeof name==='string'&&!name.startsWith('/')&&!name.split('/').some(x=>['..','.',''].includes(x)),'recovery_source_path');return name;}
function ledger(bytes,id,m){
 const text=bytes.toString();check(text.endsWith('\n'),'recovery_ledger_truncated');let rows;try{rows=text.slice(0,-1).split('\n').map(JSON.parse);}catch{throw Error('recovery_ledger_truncated');}
 const header=rows[0];check(header?.event==='campaign_reserved'&&header.runId===id&&rows.filter(r=>r.event==='campaign_reserved').length===1,'recovery_ledger_identity');
 const b=header.binding;
 check(b.manifestHash===digest(readFileSync(new URL('./full-manifest.json',import.meta.url)))&&b.panHash===RECOVERY_PACKAGE&&canonical(b.model)===canonical(MODEL)&&canonical(b.budget)===canonical(METERED_LIMITS)&&b.mode==='live','recovery_binding_identity');
 check(Array.isArray(b.taskIds)&&new Set(b.taskIds).size===b.taskIds.length&&b.taskIds.every(t=>m.tasks.some(x=>x.id===t)),'recovery_tasks');
 const used=new Set();for(const r of rows.slice(1)){check(b.taskIds.includes(r.task),'recovery_foreign_task');if(r.event==='attempt_reserved'){check(!used.has(r.task),'recovery_duplicate_attempt');used.add(r.task);}else check(used.has(r.task),'recovery_unreserved_event');}
 return {rows,b,used:[...used]};
}
export function inspectRecovery(source,m){
 const sources={},missing=[];const remember=(rel,expected,required=true)=>{safe(rel);const p=join(source,rel);if(!existsSync(p)){check(!required,'recovery_required_source_missing');missing.push(rel);return null;}const bytes=readFileSync(p);check(digest(bytes)===expected,'recovery_source_hash');sources[rel]=expected;return bytes;};
 for(const [rel,hash] of Object.entries({'criteria12-pre-signing-20260928/inventory.json':PINS.archive,'recovery-20260928/reservation-evidence-index.json':PINS.index,'recovery-20260928/ledger-inventory.json':PINS.ledgers,'segment2-retained-ledger-20260928.jsonl':PINS.second}))remember(rel,hash);
 const index=json(join(source,'recovery-20260928/reservation-evidence-index.json')),inv=json(join(source,'criteria12-pre-signing-20260928/inventory.json')),li=json(join(source,'recovery-20260928/ledger-inventory.json'));
 // All available historical files are verified, missing task artifacts are explicit.
 const prefix='campaign-disk39/history-original/';
 for(const [name,hash] of Object.entries(inv))if(name.startsWith(prefix)&&!name.split('/').some(n=>n.startsWith('._'))){const tail=name.slice(prefix.length);remember('criteria12-pre-signing-20260928/'+name,hash,tail==='campaign.json'||tail.startsWith('journal/'));}
 for(const [name,hash] of Object.entries(li))remember('recovery-20260928/ledgers/'+safe(name),hash);
 const base=join(source,'criteria12-pre-signing-20260928',prefix),meta=json(join(base,'campaign.json'));
 check(canonical(meta.resourceBaseline)===canonical(index.originalBaseline)&&meta.resourceBaseline.docker===48503971840,'recovery_baseline');
 let head=digest(canonical(meta));const journal=[];
 for(const name of Object.keys(inv).filter(n=>n.startsWith(prefix+'journal/')&&!n.split('/').some(x=>x.startsWith('._'))).sort()){
  const row=json(join(source,'criteria12-pre-signing-20260928',name));check(name===prefix+'journal/'+String(journal.length).padStart(8,'0')+'.json'&&row.previous===head,'recovery_journal_chain');journal.push(row);head=digest(canonical(row));
 }
 check(head==='2042e9534a5943c8386d1f7e03150a02dd7ecf60ebc045a064900f26f59ac68f','recovery_history_checkpoint');
 const first=ledger(readFileSync(join(source,'recovery-20260928/ledgers',FIRST+'.jsonl')),FIRST,m),second=ledger(readFileSync(join(source,'recovery-20260928/ledgers',SECOND+'.jsonl')),SECOND,m);
 check(digest(readFileSync(join(source,'recovery-20260928/ledgers',SECOND+'.jsonl')))===PINS.second,'recovery_duplicate_conflict');
 check(first.b.full.campaignId===meta.campaignId&&first.b.full.root===meta.root&&second.b.full.campaignId==='517190e1-ae47-4dc2-9ff8-cb2a7cf6cdcd'&&second.b.full.root==='/private/tmp/wo97-live/campaign-disk39','recovery_campaign_identity');
 const imported=[];
 for(const [id,part] of [[FIRST,first],[SECOND,second]])for(const task of part.used){
  const project=projectFor(part.b.full.campaignId,id,task,part.b.full.root),image=part.b.images[task];check(/^sha256:[a-f0-9]{64}$/.test(image),'recovery_image_identity');
  let outcome=null,stopConfirmed=null,missingEvidence=true;
  if(id===FIRST){
   const reservation=journal.find(r=>r.event==='reserved'&&r.task===task),result=journal.find(r=>r.event==='result'&&r.task===task);check(reservation?.project===project&&reservation.runId===id&&reservation.image===image,'recovery_reservation_conflict');
   const taskPrefix='criteria12-pre-signing-20260928/'+prefix+'segments/'+id+'/'+task+'/';
   missingEvidence=missing.some(n=>n.startsWith(taskPrefix));
   if(result&&!missingEvidence)outcome=result;
   const cleanup=join(base,'segments',id,task,'cleanup.json');if(existsSync(cleanup)){const p=json(cleanup);if(p.confirmed===true&&p.project===project&&result?.stopConfirmed===true)stopConfirmed=true;}
  }
  imported.push({event:'consumed_import',task,runId:id,project,image,oldRoot:part.b.full.root,stopConfirmed,outcome,missingEvidence,reason:outcome?outcome.reason:'missing_evidence/unknown',sourceLedger:li[id+'.jsonl']});
 }
 const ids=imported.map(r=>r.task).sort();check(new Set(ids).size===57&&canonical(ids)===canonical(index.reservedTasksNeverRerun),'recovery_consumed_conflict');
 check(canonical(m.tasks.map(t=>t.id).filter(id=>!ids.includes(id)).sort())===canonical([...index.unstartedTasks].sort()),'recovery_unstarted_conflict');
 check(first.used.length===37&&second.used.length===20,'recovery_population');
 return {sources,missing,imported,baseline:meta.resourceBaseline,runIds:[FIRST,SECOND]};
}
function copySources(source,target,files){for(const [name,hash] of Object.entries(files)){const dest=join(target,name);mkdirSync(dirname(dest),{recursive:true});const bytes=readFileSync(join(source,name));check(digest(bytes)===hash,'recovery_source_changed');writeFileSync(dest,bytes,{flag:'wx',mode:0o600});}}
export function restoreEvidence(source,target,layout,host,m){
 const proof=inspectRecovery(source,m);validateLayout(layout,target,host.mode);host.internal(dirname(target));
 const sample=host.sampleRecovery??sampleDurable;resourceCheck(target,proof.baseline,sample(dirname(target),layout.ownedRoots));
 const pkg=json(new URL('./package-identity.json',import.meta.url)),identity={manifestHash:digest(readFileSync(new URL('./full-manifest.json',import.meta.url))),panHash:pkg.package_sha256,runnerSha:host.runnerSha(),model:MODEL,budget:METERED_LIMITS,mode:host.mode,executionPolicy:EXECUTION_POLICY};
 const store=initialize(target,{schema:2,campaignId:crypto.randomUUID(),identity,resourceBaseline:proof.baseline,createdUTC:new Date().toISOString(),recovery:{pins:PINS,sourcesDigest:digest(canonical(proof.sources))},durability:layout});
 copySources(source,join(target,'recovery-original'),proof.sources);
 // Separate copies for accounting; never duplicate cumulative events or rewrite originals.
 for(const id of proof.runIds){mkdirSync(join(target,'segments',id));writeFileSync(join(target,'segments',id,'ledger.jsonl'),readFileSync(join(source,'recovery-20260928/ledgers',id+'.jsonl')),{flag:'wx'});}
 store.add('evidence_import',{source:realpathSync(source),sources:proof.sources,missing:proof.missing,consumed:proof.imported.length,notice:'actual import time; old journal not reconstructed'});
 flushTree(target);
 durable(join(target,'recovery-complete.json'),{metadata:digest(canonical(store.meta)),sources:proof.sources});
 attachRecovery(store,m);resourceCheck(target,proof.baseline,sample(target,layout.ownedRoots));return store;
}
export function attachRecovery(store,m){
 if(!store.meta.recovery)return;
 check(canonical(store.meta.recovery.pins)===canonical(PINS)&&canonical(store.meta.identity.executionPolicy)===canonical(EXECUTION_POLICY),'recovery_policy_identity');
 const proof=inspectRecovery(join(store.root,'recovery-original'),m),complete=json(join(store.root,'recovery-complete.json'));
 check(complete.metadata===digest(canonical(store.meta))&&canonical(complete.sources)===canonical(proof.sources)&&store.meta.recovery.sourcesDigest===digest(canonical(proof.sources))&&canonical(store.meta.resourceBaseline)===canonical(proof.baseline),'recovery_incomplete');
 check(store.rows[0]?.event==='evidence_import'&&canonical(store.rows[0].sources)===canonical(proof.sources),'recovery_import_event');
 for(const id of proof.runIds)check(digest(readFileSync(join(store.root,'segments',id,'ledger.jsonl')))===proof.sources['recovery-20260928/ledgers/'+id+'.jsonl'],'recovery_accounting_conflict');
 store.imported=proof.imported;store.oldRunIds=proof.runIds;store.reload();
}
export async function checkImportedStops(store,host){
 store.residualsChecked=false;
 for(const r of store.imported??[])if(store.meta.successor104||r.stopConfirmed!==true){const p=await host.inspectResidual(r);check(p?.confirmed===true,'historical_stop_unknown');}
 store.residualsChecked=true;
}
