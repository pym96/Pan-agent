import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetLedger } from '../src/execution/admission.ts';
import { ExecutionController,GoalController,parseDuration,type Clock,type TaskRunner,type ExecutionPlan,type Verdict } from '../src/execution/controller.ts';
class FakeClock implements Clock {
 time=0;timers:{due:number;resolve:()=>void;reject:(e:Error)=>void;signal:AbortSignal;abort:()=>void}[]=[];
 now(){return this.time;}
 sleep(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(Error('cancelled'));return;}const timer={due:this.time+ms,resolve,reject,signal,abort:()=>{this.timers=this.timers.filter(t=>t!==timer);reject(Error('cancelled'));}};this.timers.push(timer);signal.addEventListener('abort',timer.abort,{once:true});});}
 async drain(){for(let i=0;i<60;i++)await Promise.resolve();}
 async advance(to:number){while(true){await this.drain();const next=this.timers.filter(t=>t.due<=to).sort((a,b)=>a.due-b.due)[0];if(!next)break;this.time=next.due;this.timers=this.timers.filter(t=>t!==next);next.signal.removeEventListener('abort',next.abort);next.resolve();}this.time=to;await this.drain();}
}
const plan:ExecutionPlan={mode:'loop',everyMs:300000,durationMs:3600000,objective:'check'};
const runner=(clock:FakeClock,starts:number[]):TaskRunner=>({run:async()=>{starts.push(clock.now());return {status:'completed',reason:'done'};},stop:async()=>true,preserve:async()=>{}});
test('EC02 fixed-rate immediate twelve ticks; exclusive deadline and wall clock irrelevant',async()=>{
 const clock=new FakeClock(),starts:number[]=[];const controller=new ExecutionController(clock);const result=controller.execute(plan,runner(clock,starts));await clock.advance(3600000);
 assert.deepEqual(starts,Array.from({length:12},(_,i)=>i*300000));assert.equal((await result).reason,'deadline_exceeded');
});
test('EC02 overruns skip missed ticks without overlap/catch-up',async()=>{
 const clock=new FakeClock(),starts:number[]=[];const r=runner(clock,starts);r.run=async({signal})=>{starts.push(clock.now());await clock.sleep(450000,signal);return {status:'completed',reason:'done'};};
 const result=new ExecutionController(clock).execute(plan,r);await clock.advance(3600000);assert.deepEqual(starts,[0,600000,1200000,1800000,2400000,3000000]);assert.equal((await result).reason,'deadline_exceeded');
});
for(const text of ['0s','-1s','NaNs','1.1s','2147483648ms','999999999999999999999h'])test('EC02 invalid duration '+text,()=>assert.throws(()=>parseDuration(text)));
test('EC03 shared per-run/outer whole batch reservation; idempotent settlement and unknown usage',async()=>{
 const events:Record<string,unknown>[]=[];const ledger=new BudgetLedger({modelCalls:2,toolCalls:3},()=>{},async e=>{events.push(e);});const a=await ledger.begin('a',{maxModelTurns:2,maxToolSteps:2});
 const ticket=(await a.admit('model',1))!;await a.settle(ticket,{status:'unavailable'});await a.settle(ticket,{status:'unavailable'});assert.equal(events.filter(e=>e.type==='budget.settled').length,1);
 assert.equal(await a.admit('tools',3),undefined);assert.equal(a.snapshot().toolCalls,0);assert.ok(await a.admit('tools',2));
 const b=await ledger.begin('b',{maxModelTurns:2,maxToolSteps:2});assert.ok(await b.admit('model',1));assert.equal(await b.admit('model',1),undefined);assert.equal(await b.admit('tools',2),undefined);assert.ok(await b.admit('tools',1));assert.equal(ledger.snapshot().usage.status,'unavailable');assert.equal(ledger.snapshot().modelCalls,2);
});
test('EC03 checkpoint counters imported; failed admitted request remains charged',async()=>{
 const ledger=new BudgetLedger();const a=await ledger.begin('resume',{maxModelTurns:3,maxToolSteps:4},{modelCalls:2,toolCalls:3});assert.ok(await a.admit('model',1));assert.equal(await a.admit('model',1),undefined);assert.deepEqual(a.snapshot(),{modelCalls:3,toolCalls:3});await assert.rejects(ledger.begin('resume',{maxModelTurns:3,maxToolSteps:4}));
});
const goal:ExecutionPlan={...plan,mode:'goal',criteria:{version:'v1',identity:'trusted'},outer:{modelCalls:2}};
const verdict=(status:Verdict['status']):Verdict=>({status,candidateIdentity:'fixed',criteriaVersion:'v1',verifierIdentity:'trusted',detail:'assertion result'});
test('G01 G03 valid FAIL retries with feedback, last budget PASS may end early',async()=>{
 const clock=new FakeClock();let n=0;const tasks:string[]=[];const r:TaskRunner={run:async i=>{tasks.push(i.task);const a=await i.ledger.begin('r'+(++n),{maxModelTurns:1,maxToolSteps:1});assert.ok(await a.admit('model',1));return {status:'completed',reason:'claimed',candidate:{identity:'fixed'}};},verify:async()=>verdict(n===1?'FAIL':'PASS'),stop:async()=>true,preserve:async()=>{}};
 const result=await new GoalController(clock).execute(goal,r);assert.equal(result.reason,'succeeded');assert.equal(n,2);assert.match(tasks[1]!,/assertion result/);assert.equal(result.counts.modelCalls,2);assert.equal(clock.time,0);
});
for(const variant of ['unknown','stale','claimed'])test('G01 false completion cannot grant success '+variant,async()=>{
 const clock=new FakeClock();const r=runner(clock,[]);r.run=async()=>({status:'completed',reason:'I succeeded',candidate:{identity:'fixed'}});r.verify=async()=>variant==='unknown'?verdict('UNKNOWN'):variant==='stale'?{...verdict('PASS'),candidateIdentity:'changed'}:{...verdict('PASS'),verifierIdentity:'worker'};
 assert.equal((await new GoalController(clock).execute(goal,r)).reason,'needs_review');
});
test('G03 exact deadline verifier PASS retained but cannot revive goal',async()=>{
 const clock=new FakeClock();const events:Record<string,unknown>[]=[];const r=runner(clock,[]);r.run=async()=>({status:'completed',reason:'done',candidate:{identity:'fixed'}});r.verify=async()=>{await clock.sleep(3600000,new AbortController().signal);return verdict('PASS');};
 const result=new GoalController(clock,async e=>{events.push(e);}).execute(goal,r);await clock.advance(3600000);assert.equal((await result).reason,'deadline_exceeded');assert.equal(events.filter(e=>e.type==='goal.verdict').length,1);
});
test('EC04 sleeping cancellation and unconfirmed stop are distinct',async()=>{
 const clock=new FakeClock(),starts:number[]=[];const controller=new ExecutionController(clock);const r=runner(clock,starts);r.stop=async()=>false;const result=controller.execute(plan,r);await clock.drain();controller.requestStop();await clock.drain();assert.equal((await result).reason,'stop_unconfirmed');assert.equal(starts.length,1);await assert.rejects(controller.execute(plan,r),/already_used/);
});
test('G03 cancel during verification cannot admit subsequent attempts or success',async()=>{
 const clock=new FakeClock();const controller=new GoalController(clock);const r=runner(clock,[]);let verifies=0;r.run=async()=>({status:'completed',reason:'done',candidate:{identity:'fixed'}});r.verify=async()=>{verifies++;controller.requestStop();return verdict('PASS');};assert.equal((await controller.execute(goal,r)).reason,'cancelled');assert.equal(verifies,1);
});
test('EC02 timer early wake is rechecked against monotonic due, never admitted early',async()=>{
 const clock=new FakeClock();const sleep=clock.sleep.bind(clock);let early=true;clock.sleep=(ms,signal)=>{if(ms===300000&&early){early=false;return sleep(ms-.25,signal);}return sleep(ms,signal);};
 const starts:number[]=[];const result=new ExecutionController(clock).execute(plan,runner(clock,starts));await clock.advance(3600000);await result;assert.deepEqual(starts,Array.from({length:12},(_,i)=>i*300000));
});
test('G02 periodic reconciliation observes active worker without overlapping dispatch',async()=>{
 const clock=new FakeClock(),starts:number[]=[],checks:number[]=[];const r=runner(clock,starts);r.run=async({signal})=>{starts.push(clock.now());await clock.sleep(450000,signal);return {status:'completed',reason:'done'};};r.reconcile=async()=>{checks.push(clock.now());};
 const result=new ExecutionController(clock).execute(plan,r);await clock.advance(3600000);await result;assert.equal(starts.length,6);assert.ok(checks.includes(300000));assert.equal(starts.includes(300000),false);
});
test('EC03 guard closes admission before effects and budget0 is supported only at outer level',async()=>{
 const outer=new BudgetLedger({modelCalls:0});const run=await outer.begin('a',{maxModelTurns:1,maxToolSteps:1});assert.equal(await run.admit('model',1),undefined);
 let closed=false;const ledger=new BudgetLedger({},()=>{if(closed)throw Error('deadline');});const next=await ledger.begin('b',{maxModelTurns:1,maxToolSteps:1});closed=true;await assert.rejects(next.admit('tools',1),/deadline/);assert.deepEqual(next.snapshot(),{modelCalls:0,toolCalls:0});
 await assert.rejects(ledger.begin('c',{maxModelTurns:0,maxToolSteps:1}));
});
