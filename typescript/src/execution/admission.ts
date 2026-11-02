import { randomUUID } from 'node:crypto';
import { resolveKernelLimits, type KernelLimits } from '../runtime/agent-kernel.ts';
import { addUsage, ZERO_REPORTED_USAGE, type Usage } from '../protocol/canonical-protocol.ts';

export type Counts = {modelCalls:number;toolCalls:number};
export type Ticket = {id:string;kind:'model'|'tools';count:number};
export interface Admission {
 snapshot(): Counts;
 admit(kind:Ticket['kind'],count:number):Promise<Ticket | undefined>;
 settle(ticket:Ticket,usage?:Usage):Promise<void>;
 check():Promise<void>;
}
export type AdmissionFactory = (runId:string,limits:KernelLimits,restored:Counts)=>Promise<Admission>;
export type AccountingSink = (event:Record<string,unknown>)=>Promise<void>;
/** One ledger owns both per-run and enclosing reservations. Persistence is a pre-effect barrier. */
export class BudgetLedger {
 private total:Counts={modelCalls:0,toolCalls:0};
 private runs=new Map<string,Counts>();
 private tickets=new Map<string,{ticket:Ticket;runId:string;settled:boolean}>();
 private usage:Usage=ZERO_REPORTED_USAGE;
 private queue:Promise<unknown>=Promise.resolve();
 private readonly outer:Partial<Counts>; private readonly guard:()=>void; private readonly record:AccountingSink;
 constructor(outer:Partial<Counts>={},guard:()=>void=()=>{},record:AccountingSink=async()=>{}) {
 this.outer=outer;this.guard=guard;this.record=record;
  for(const n of Object.values(outer))if(!Number.isSafeInteger(n)||Number(n)<0)throw Error('invalid_outer_budget');
 }
 snapshot(){return {...this.total,usage:structuredClone(this.usage)};}
 async begin(runId:string,limits:KernelLimits,restored:Counts={modelCalls:0,toolCalls:0}):Promise<Admission>{
  if(!runId||this.runs.has(runId))throw Error('duplicate_run_identity');
  limits=resolveKernelLimits(limits);
  if(!Number.isSafeInteger(restored.modelCalls)||!Number.isSafeInteger(restored.toolCalls))throw Error('invalid_restored_budget');
  for(const n of Object.values(restored))if(!Number.isSafeInteger(n)||n<0)throw Error('invalid_restored_budget');
  const counts={...restored};this.runs.set(runId,counts);
  this.total.modelCalls+=counts.modelCalls;this.total.toolCalls+=counts.toolCalls;
  await this.record({type:'budget.run',runId,limits,restored});
  return {
   snapshot:()=>({...counts}),check:async()=>this.guard(),
   admit:async(kind,count)=>{
    const op=this.queue.then(async()=>{
     this.guard();if(!Number.isSafeInteger(count)||count<=0)throw Error('invalid_reservation');
     const key=kind==='model'?'modelCalls':'toolCalls';const cap=kind==='model'?limits.maxModelTurns:limits.maxToolSteps;
     if((cap!==null&&counts[key]+count>cap)||(this.outer[key]!==undefined&&this.total[key]+count>this.outer[key]!)||!Number.isSafeInteger(this.total[key]+count))return undefined;
     const ticket={id:randomUUID(),kind,count};
     await this.record({type:'budget.reserved',runId,ticket});
     // A persisted reservation is charged even if stop arrives during persistence.
     counts[key]+=count;this.total[key]+=count;this.tickets.set(ticket.id,{ticket,runId,settled:false});
     this.guard();return ticket;
    });this.queue=op.catch(()=>{});return op;
   },
   settle:async(ticket,usage)=>{
    const op=this.queue.then(async()=>{
     const entry=this.tickets.get(ticket.id);if(!entry||entry.runId!==runId||JSON.stringify(entry.ticket)!==JSON.stringify(ticket))throw Error('unknown_reservation');
     if(entry.settled)return;
     await this.record({type:'budget.settled',runId,ticket,...(usage?{usage}:{})});entry.settled=true;
     if(usage)this.usage=addUsage(this.usage,usage);
    });this.queue=op.catch(()=>{});await op;
   },
  };
 }
}
