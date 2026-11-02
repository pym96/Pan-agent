import { createHash } from 'node:crypto';
import { BudgetLedger, type AccountingSink, type Counts } from './admission.ts';
export interface Clock { now():number; sleep(ms:number,signal:AbortSignal):Promise<void> }
export const monotonicClock:Clock={now:()=>performance.now(),sleep:(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted){reject(Error('cancelled'));return;}
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.ceil(ms));
 const abort=()=>{clearTimeout(timer);reject(Error('cancelled'));};signal.addEventListener('abort',abort,{once:true});
})};
export type StopReason='deadline_exceeded'|'cancelled'|'budget_exhausted'|'worker_failed'|'needs_review'|'succeeded'|'stop_unconfirmed'|'cleanup_failed';
export interface ExecutionPlan {mode:'loop'|'goal';everyMs:number;durationMs:number;objective:string;outer?:Partial<Counts>;criteria?:{version:string;identity:string}}
export interface Candidate {identity:string;[key:string]:unknown}
export interface Attempt {status:'completed'|'incomplete'|'model_error'|'cancelled';reason:string;candidate?:Candidate;[key:string]:unknown}
export interface Verdict {status:'PASS'|'FAIL'|'UNKNOWN';candidateIdentity:string;criteriaVersion:string;verifierIdentity:string;detail:string}
export interface TaskRunner {
 run(input:{attemptId:string;task:string;signal:AbortSignal;ledger:BudgetLedger;deadline:number}):Promise<Attempt>;
 stop(reason:string):Promise<boolean>;
 verify?(attempt:Attempt,signal:AbortSignal):Promise<Verdict>;
 reconcile?():Promise<void>;
 preserve():Promise<void>;
}
export interface ExecutionResult {reason:StopReason;attempts:number;counts:ReturnType<BudgetLedger['snapshot']>;planHash:string}
export function validatePlan(plan:ExecutionPlan):void {
 if(!['loop','goal'].includes(plan.mode)||typeof plan.objective!=='string'||!plan.objective.trim())throw Error('invalid_plan');
 for(const n of [plan.everyMs,plan.durationMs])if(!Number.isSafeInteger(n)||n<=0||n>2147483647)throw Error('invalid_duration');
 if(plan.mode==='goal'&&(!plan.criteria?.version||!plan.criteria?.identity))throw Error('goal_criteria_required');
 new BudgetLedger(plan.outer);
}
export function parseDuration(text:string):number {const m=/^(\d+)(ms|s|m|h)$/.exec(text);if(!m)throw Error('invalid_duration');const n=Number(m[1])*({ms:1,s:1000,m:60000,h:3600000}[m[2]!]!);if(!Number.isSafeInteger(n)||n<=0||n>2147483647)throw Error('invalid_duration');return n;}
export const identity=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Serial state machine: cadence makes work eligible; admission remains independently revocable. */
export class ExecutionController {
 private readonly clock:Clock;private readonly record:AccountingSink;
 private active=false;private used=false;private reason?:StopReason;private abort=new AbortController();private start=0;private deadline=0;
 constructor(clock:Clock=monotonicClock,record:AccountingSink=async()=>{}){this.clock=clock;this.record=record;}
 requestStop(reason:StopReason='cancelled'){if(!this.reason){this.reason=reason;this.abort.abort();}}
 private eligible(){if(this.clock.now()>=this.deadline)this.requestStop('deadline_exceeded');if(this.reason)throw Error(this.reason);}
 async execute(plan:ExecutionPlan,runner:TaskRunner,signal?:AbortSignal):Promise<ExecutionResult>{
  validatePlan(plan);plan=structuredClone(plan);if(this.active||this.used)throw Error('controller_already_used');if(plan.mode==='goal'&&!runner.verify)throw Error('goal_verifier_required');
  this.used=true;this.active=true;this.start=this.clock.now();this.deadline=this.start+plan.durationMs;const planHash=identity(plan);let attempts=0;let feedback='';
  const ledger=new BudgetLedger(plan.outer,()=>this.eligible(),this.record);const deadlineCancel=new AbortController();
  const external=()=>this.requestStop('cancelled');signal?.addEventListener('abort',external,{once:true});if(signal?.aborted)external();
  const deadlineTask=this.clock.sleep(plan.durationMs,deadlineCancel.signal).then(()=>this.requestStop('deadline_exceeded')).catch(()=>{});
  // Stopping the runner happens independently of its cooperation with run()/the worker event loop.
  let stopPromise:Promise<boolean>|undefined;
  const stop=()=>{stopPromise??=this.record({type:'execution.stop_requested',reason:this.reason,at:this.clock.now()}).then(()=>runner.stop(this.reason??'cancelled'));};
  this.abort.signal.addEventListener('abort',stop,{once:true});
  const reconcileTask=(async()=>{if(!runner.reconcile)return;while(!this.abort.signal.aborted){try{await this.clock.sleep(plan.everyMs,this.abort.signal);if(!this.abort.signal.aborted)await runner.reconcile();}catch(error){if(!this.abort.signal.aborted){await this.record({type:'execution.reconcile_error',detail:String(error)});this.requestStop('worker_failed');}break;}}})();
  try{
   await this.record({type:'execution.plan',plan,planHash,start:this.start,deadline:this.deadline});
   let due=this.start;
   while(!this.reason){
    while(due>this.clock.now())await this.clock.sleep(due-this.clock.now(),this.abort.signal);
    this.eligible();const attemptId=`${planHash}:${++attempts}`;
    await this.record({type:'execution.attempt',attemptId,planned:due,actual:this.clock.now(),deadline:this.deadline});this.eligible();
    const task=feedback?`${plan.objective}\n\nIndependent verification feedback from the previous attempt:\n${feedback}`:plan.objective;
    const attempt=await runner.run({attemptId,task,signal:this.abort.signal,ledger,deadline:this.deadline});
    await this.record({type:'execution.attempt_settled',attemptId,result:attempt,at:this.clock.now()});
    this.eligible();
    if(attempt.status!=='completed'){this.requestStop(attempt.reason==='turn_limit'||attempt.reason==='step_limit'?'budget_exhausted':'worker_failed');break;}
    if(plan.mode==='goal'){
     await this.record({type:'goal.verifying',attemptId,candidate:attempt.candidate,criteria:plan.criteria});
     let verdict:Verdict;
     try{verdict=await runner.verify!(attempt,this.abort.signal);}catch(error){verdict={status:'UNKNOWN',candidateIdentity:'',criteriaVersion:plan.criteria!.version,verifierIdentity:plan.criteria!.identity,detail:String(error)};}
     await this.record({type:'goal.verdict',attemptId,verdict,at:this.clock.now()});this.eligible();
     const valid=attempt.candidate&&verdict.candidateIdentity===attempt.candidate.identity&&verdict.criteriaVersion===plan.criteria!.version&&verdict.verifierIdentity===plan.criteria!.identity;
     if(!valid||verdict.status==='UNKNOWN'){this.requestStop('needs_review');break;}
     if(verdict.status==='PASS'){this.requestStop('succeeded');break;}
     feedback=verdict.detail; // validated FAIL starts a new attempt, never replays a command.
    }
    due=this.start+(Math.floor((this.clock.now()-this.start)/plan.everyMs)+1)*plan.everyMs;
    // Completion reconciles immediately; a valid goal FAIL may retry at once, not wait an entire poll interval.
    if(plan.mode==='goal')due=this.clock.now();
    if(due>=this.deadline){await this.clock.sleep(Math.max(0,this.deadline-this.clock.now()),this.abort.signal);this.requestStop('deadline_exceeded');}
   }
  }catch(error){if(!this.reason){await this.record({type:'execution.error',detail:String(error)});this.requestStop('worker_failed');}}
  finally{
   deadlineCancel.abort();await deadlineTask;await reconcileTask;signal?.removeEventListener('abort',external);this.abort.signal.removeEventListener('abort',stop);
   stop();let confirmed=false;try{confirmed=await stopPromise!;}catch(error){await this.record({type:'execution.stop_error',detail:String(error)});}
   await this.record({type:'execution.stop_confirmed',confirmed,at:this.clock.now()});if(!confirmed)this.reason='stop_unconfirmed';
   try{await runner.preserve();}catch(error){await this.record({type:'execution.cleanup_error',detail:String(error)});if(confirmed)this.reason='cleanup_failed';}
   this.active=false;
  }
  const result={reason:this.reason??'worker_failed',attempts,counts:ledger.snapshot(),planHash};await this.record({type:'execution.terminal',...result});return result;
 }
}
/** Goal uses the same controller, with completion authority exclusively in a bound executable verifier. */
export class GoalController extends ExecutionController {
 override execute(plan:ExecutionPlan,runner:TaskRunner,signal?:AbortSignal){if(plan.mode!=='goal')throw Error('goal_mode_required');return super.execute(plan,runner,signal);}
}
