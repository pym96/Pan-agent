import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { validate, shape, digest, fileDigest, insist, Refusal, resultShape, hash, keys, type Manifest, type Ledger, type Attempt, type Result, type Role } from './model.ts';
import { acquire, reconcileOwner, save, load, read, atomic, OfflineTracker, birth, type Tracker } from './storage.ts';
import { OfflineProcess, git, pause, checkReceipt, members, type ProcessAdapter } from './process.ts';
export interface Clock { wall(): number; mono(): number; }
export const clock: Clock = {wall:Date.now,mono:()=>performance.now()};
export interface Options { clock?: Clock; process?: ProcessAdapter; tracker?: Tracker; crash?: (point:string)=>void; }
const terminal=new Set(['accepted_pending_master','needs_human','cancelled','timed_out','cleanup_failed']);
export function deadline(now:number, expiry:number): boolean { return now>=expiry; }
function refs(m:Manifest): {main:string;candidate:string} {
  const remote=join(m.workspace,'remote.git');
  return {main:git(remote,['rev-parse','refs/heads/main']),candidate:git(remote,['rev-parse',`refs/heads/${m.branch}`])};
}
function checkRefs(m:Manifest, candidate:string): void {
  validate(m); insist(git(join(m.workspace,'repo'),['remote','get-url','--all','origin'])===join(m.workspace,'remote.git') && git(join(m.workspace,'repo'),['remote','get-url','--push','--all','origin'])===join(m.workspace,'remote.git'),'remote_drift'); const r=refs(m); insist(r.main===m.base && r.candidate===candidate,'ref_drift');
}
// A result is untrusted again whenever it is loaded, including after a durable recorded phase.
function validatedResult(value:unknown, m:Manifest, a:Attempt, dir:string):Result {
  resultShape(value,m,a);
  if(a.resultDigest!==undefined)insist(hash(a.resultDigest) && digest(value)===a.resultDigest,'result_changed');
  if(a.role==='regulator')insist(value.candidate===a.candidate,'result_identity');
  insist(fileDigest(join(dir,value.evidence.name))===value.evidence.digest,'evidence_missing');
  const evidence=read(join(dir,value.evidence.name));keys(evidence,['simulation','candidate','role','attempt']);
  insist(evidence.simulation==='SIMULATED' && evidence.candidate===value.candidate && evidence.role===a.role && evidence.attempt===a.number,'evidence_identity');
  return value;
}
function recordedResult(m:Manifest, a:Attempt, root:string, tracker:Tracker):Result {
  insist(a.phase==='recorded' && hash(a.resultDigest),'recorded_digest_missing');
  const dir=join(root,'attempts',a.key);
  const result=validatedResult(tracker.lookup(a.key),m,a,dir);
  validatedResult(read(join(dir,'result.json')),m,a,dir);
  const completion=read(join(dir,'completion.json'));keys(completion,['exit']);insist(completion.exit===0,'abnormal_exit');
  const receipt=read(join(dir,'receipt.json'));checkReceipt(receipt,a);
  insist(receipt.pid===a.pid && receipt.birth===a.birth,'process_identity');
  insist(git(a.worktree,['rev-parse','HEAD'])===result.candidate && git(a.worktree,['status','--porcelain'])==='','dirty_result_worktree');
  if(a.role==='builder') {
    insist(result.candidate!==a.candidate,'candidate_not_new');
    git(join(m.workspace,'repo'),['merge-base','--is-ancestor',a.candidate,result.candidate]);
  }
  return result;
}
function stopCategory(result:Result):string {
  switch(result.outcome) {
    case 'scope_challenge':return 'scope_challenge';
    case 'quota_unavailable':return 'quota_unavailable';
    case 'evidence_incomplete':return 'evidence_incomplete';
    default:return 'malformed_result';
  }
}
export function summary(l:Ledger): object {
  return {simulation:'SIMULATED',job:l.manifest.job,repository:l.manifest.repository,issue:l.manifest.issue,criteriaVersion:l.manifest.version,contractDigest:l.manifest.contractDigest,base:l.manifest.base,candidate:l.candidate,state:l.state,reason:l.reason,attempts:l.attempts.map(a=>({role:a.role,number:a.number,session:a.session,key:a.key,candidate:a.candidate,phase:a.phase,launch:a.pid===undefined?'unconfirmed':'confirmed',resultDigest:a.resultDigest??null})),repairs:l.repairs,limits:l.manifest.limits,expiresAt:l.expiry,pendingHuman:l.state==='needs_human'?[l.reason]:[],artifact:'ledger.json; attempts/<delivery-key>; tracker/<delivery-key>.json',realOperation:'NOT ENABLED',accountCost:'not measured; no real account operation authorized'};
}
export function status(root:string): object { try {return summary(load(root));}catch{return {simulation:'SIMULATED',state:'needs_reconciliation',reason:'corrupt_or_missing_ledger',artifact:'original ledger preserved'};} }
export function stop(root:string): void { mkdirSync(root,{recursive:true}); if(!existsSync(join(root,'stop.json'))) atomic(join(root,'stop.json'),{requested:true}); }
export async function run(config:unknown, root:string, resume=false, options:Options={}):Promise<object> {
  // Mode and all numeric/schema checks precede any directory, credential, process or network operation.
  shape(config); let m:Manifest;
  try { m=validate(config); } catch(e) {
    if(!resume || !existsSync(join(root,'ledger.json')))throw e;
    reconcileOwner(root);const unlock=acquire(root);
    try {const old=load(root);old.state='needs_reconciliation';old.reason='authorization_or_contract_drift';save(root,old);return summary(old);} finally{unlock();}
  }
  const time=options.clock??clock;
  if(resume) reconcileOwner(root);
  const release=acquire(root);
  try {
    let l:Ledger;let restoredTracker:Tracker|undefined;let invalidHistory=false;
    if(existsSync(join(root,'ledger.json'))) {
      try{l=load(root);}catch{atomic(join(root,'reconciliation.json'),{simulation:'SIMULATED',state:'needs_reconciliation',reason:'corrupt_ledger',originalPreserved:true});return status(root);}
      insist(l.manifestDigest===digest(m),'different_job_or_manifest');
      restoredTracker=options.tracker??new OfflineTracker(join(root,'tracker'));
      try { for(const a of l.attempts)if(a.phase==='recorded')recordedResult(m,a,root,restoredTracker); }
      catch { invalidHistory=true; }
      if(!invalidHistory && terminal.has(l.state)) return summary(l);
      if(!resume) {
        if(invalidHistory){l.state='needs_reconciliation';l.reason='recorded_result_invalid';save(root,l);}
        return summary(l); // duplicate delivery is observational; only explicit resume may adopt owned work
      }
    } else {
      insist(!resume,'missing_ledger'); checkRefs(m,m.base);
      // Reject dirty/pre-existing role trees before the first launch.
      for(const role of ['builder','regulator']) for(let n=1;n<=3;n++) {
        const p=join(m.workspace,'worktrees',`${role}-${n}`);
        insist(!existsSync(p),'worktree_not_fresh');
      }
      const now=time.wall();l={simulation:'SIMULATED',manifest:m,manifestDigest:digest(m),state:'authorized',reason:'authorized_offline',created:now,expiry:now+m.limits.totalMs,lastWall:now,candidate:m.base,repairs:0,attempts:[],transitions:[{state:'authorized',at:now}]};save(root,l);
    }
    const aliveStart=time.mono(), totalRemaining=l.expiry-time.wall();
    const proc=options.process??new OfflineProcess();const tracker=restoredTracker??options.tracker??new OfflineTracker(join(root,'tracker'));
    const transition=(state:string,reason:string):void=>{l.state=state;l.reason=reason;l.transitions.push({state,at:time.wall()});save(root,l);};
    const stopReason=():string|null=> {
      const now=time.wall();if(now<l.lastWall)return 'backward_clock';l.lastWall=now;
      if(existsSync(join(root,'stop.json')))return 'cancelled';
      if(deadline(now,l.expiry) || deadline(time.mono()-aliveStart,totalRemaining))return 'timed_out';return null;
    };
    const cleanup=async(a:Attempt,why:string,t0=performance.now()):Promise<void>=>{
      const dir=join(root,'attempts',a.key);transition('stopping',why);
      atomic(join(dir,'stop-receipt.json'),{monotonic:t0,receiptMonotonic:performance.now(),wall:Date.now(),reason:why});
      atomic(join(dir,'stop-coordination'),{requested:true});
      let confirmed=false;
      try {
        const receipt=proc.receipt(dir);
        if(receipt) {
          checkReceipt(receipt,a);
          if(a.pid!==undefined)insist(receipt.pid===a.pid && receipt.birth===a.birth,'process_identity');
          confirmed=await proc.cleanup(receipt,dir);
        }
      } catch { confirmed=false; }
      transition(confirmed?(why==='backward_clock'?'needs_reconciliation':why):'cleanup_failed',confirmed?why:'cleanup_unconfirmed');
    };
    const rejectHistory=async():Promise<object>=>{
      const active=l.attempts.at(-1);
      // Historical result authority and current process ownership are independent.
      // No result field is used to select a process, reserve a repair or determine a diagnostic.
      if(active && active.phase!=='recorded') {
        const now=time.wall(),mono=time.mono();
        const why=stopReason()??(deadline(now,active.intentAt+m.limits.roleMs)?'timed_out':'needs_reconciliation');
        const t0=why==='timed_out' && time===clock?mono+Math.min(l.expiry,active.intentAt+m.limits.roleMs)-now:performance.now();
        await cleanup(active,why,t0);
        const cleanupState=l.state,cleanupReason=l.reason;
        // Keep both decisions, even when cleanup succeeded; fixed categories only.
        atomic(join(root,'history-reconciliation.json'),{simulation:'SIMULATED',integrity:'recorded_result_invalid',attempt:active.key,cleanupState,cleanupReason});
        transition(cleanupState==='cleanup_failed'?'cleanup_failed':'needs_reconciliation','recorded_result_invalid');
      } else transition('needs_reconciliation','recorded_result_invalid');
      return summary(l);
    };
    if(invalidHistory)return await rejectHistory();
    let last=l.attempts.at(-1);
    if(resume && time.wall()<l.lastWall) {
      if(last && last.phase!=='recorded')await cleanup(last,'backward_clock');else transition('needs_reconciliation','backward_clock');return summary(l);
    }
    while(true) {
      last=l.attempts.at(-1);
      let prior:Result|undefined;
      if(last?.phase==='recorded') {
        try{prior=recordedResult(m,last,root,tracker);}
        catch{return await rejectHistory();}
      }
      const reason=stopReason();
      if(reason) {if(last && last.phase!=='recorded')await cleanup(last,reason);else transition(reason==='backward_clock'?'needs_reconciliation':reason,reason);return summary(l);}
      let a:Attempt;
      if(last && last.phase!=='recorded') a=last;
      else {
        if(l.state==='needs_reconciliation')return summary(l);
        try{checkRefs(m,l.candidate);}catch{transition('needs_reconciliation','ref_or_contract_drift');return summary(l);}
        let role:Role='builder';
        if(last?.role==='builder') role='regulator';
        if(last?.role==='regulator') {
          const result=prior!;
          if(result?.outcome==='accepted') {
            transition(m.highRisk.length && m.humanProof===null?'needs_human':'accepted_pending_master',m.highRisk.length && m.humanProof===null?'human_evidence_missing':'simulated_review_accepted');options.crash?.('terminal');return summary(l);
          }
          if(result?.outcome!=='criterion_failed') {transition('needs_human',stopCategory(result));return summary(l);}
          if(l.repairs>=m.limits.repairs) {transition('needs_human','repair_limit');return summary(l);}
          l.repairs++; // reserved durably before repair launch
        }
        try{checkRefs(m,l.candidate);}catch{transition('needs_reconciliation','ref_or_contract_drift');return summary(l);}
        const number=l.attempts.filter(x=>x.role===role).length+1;
        const worktree=join(m.workspace,'worktrees',`${role}-${number}`);
        if(existsSync(worktree)) {transition('needs_human','worktree_not_fresh');return summary(l);}
        git(join(m.workspace,'repo'),['fetch','origin',m.branch]);
        git(join(m.workspace,'repo'),['worktree','add','--detach',worktree,l.candidate]);
        insist(git(worktree,['rev-parse','HEAD'])===l.candidate && git(worktree,['status','--porcelain'])==='','dirty_review_worktree');
        const session=randomUUID();const key=digest({repository:m.repository,issue:m.issue,contract:m.contractDigest,version:m.version,authorization:m.authorization.digest,job:m.job,role,number,candidate:l.candidate,session});
        a={key,role,number,session,candidate:l.candidate,worktree,intentAt:time.wall(),phase:'intent'};
        l.attempts.push(a); const dir=join(root,'attempts',key);mkdirSync(dir,{recursive:true});
        atomic(join(dir,'input.json'),{manifest:m,attempt:a,task:'SIMULATED frozen single WorkOrder',criteria:m.criteria,evidence:last?{trackerKey:last.key}:null});
        transition(role==='builder'?(number===1?'building':'repairing'):'reviewing','launch_intent');
        options.crash?.('intent');
        const before=stopReason();if(before){transition(before==='backward_clock'?'needs_reconciliation':before,before);return summary(l);}
        proc.launch(m,a,dir); options.crash?.('launch');
        // A fresh launch can wait briefly for its receipt; recovery cannot assume an absent receipt means no launch.
        for(let i=0;i<100 && !proc.receipt(dir);i++)await pause(10);
        a.phase='launched';save(root,l);
      }
      const dir=join(root,'attempts',a.key);
      try {
        const r=proc.receipt(dir);if(!r){transition('needs_reconciliation','launch_receipt_unknown');return summary(l);}
        checkReceipt(r,a);
        if(a.pid!==undefined)insist(a.pid===r.pid && a.birth===r.birth,'process_identity');
        a.pid=r.pid;a.birth=r.birth;save(root,l);
        // Existing PID with a changed start/command identity must never be touched.
        const identity=birth(r.pid);if(identity!==null && identity!==r.birth){transition('needs_reconciliation','pid_identity_mismatch');return summary(l);}
        const started=time.mono(),remaining=Math.max(0,a.intentAt+m.limits.roleMs-time.wall());
        while(!proc.completion(dir)) {
          const why=stopReason();if(why){await cleanup(a,why,why==='timed_out' && time===clock?aliveStart+totalRemaining:performance.now());return summary(l);}
          if(deadline(time.mono()-started,remaining)){await cleanup(a,'timed_out',time===clock?started+remaining:performance.now());return summary(l);}
          if(birth(r.pid)===null && !proc.completion(dir)){transition('needs_reconciliation','completion_unknown');return summary(l);}
          await pause(15);
        }
        const completion=proc.completion(dir)!;
        if(completion.exit!==0){transition('needs_human','abnormal_exit');return summary(l);}
        // The wrapper writes completion only after child exit. Require its ordinary group to finish too.
        for(let i=0;i<100 && members(r.pid).length;i++)await pause(10);
        if(members(r.pid).length){await cleanup(a,'needs_reconciliation');return summary(l);}
        const result=validatedResult(read(join(dir,'result.json')),m,a,dir);
        const expected=a.role==='builder'?result.candidate:a.candidate;
        checkRefs(m,expected);
        if(a.role==='builder') {
          insist(result.candidate!==a.candidate,'candidate_not_new');
          git(join(m.workspace,'repo'),['fetch','origin',m.branch]);
          git(join(m.workspace,'repo'),['merge-base','--is-ancestor',a.candidate,result.candidate]);
        }
        insist(git(a.worktree,['rev-parse','HEAD'])===result.candidate && git(a.worktree,['status','--porcelain'])==='','dirty_result_worktree');
        if(!['handoff','accepted','criterion_failed'].includes(result.outcome)){transition('needs_human',stopCategory(result));return summary(l);}
        if(a.resultDigest)insist(a.resultDigest===digest(result),'result_changed');
        a.resultDigest=digest(result);a.phase='publishing';save(root,l); // publication intent precedes tracker effect
        tracker.publish(a.key,result);options.crash?.('publication');
        validatedResult(tracker.lookup(a.key),m,a,dir);
        a.phase='recorded';l.candidate=result.candidate;
        transition(a.role==='builder'?'handoff_recorded':'review_recorded','result_recorded');
      } catch(e) {
        // Test crash injections simulate process death and must not be converted into a normal result.
        if(e instanceof SimulatedCrash)throw e;
        transition(e instanceof Refusal && ['ref_drift','remote_drift','contract_drift','publication_conflict','result_changed','tracker_unknown'].includes(e.category)?'needs_reconciliation':'needs_human',e instanceof Refusal?e.category:'malformed_or_missing_result');return summary(l);
      }
    }
  } finally {release();}
}
export class SimulatedCrash extends Error {}
