import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runAttempt} from './session.mjs';
import {Ledger,LIMITS,MODEL} from './policy.mjs';
const entry='/private/tmp/wo75-work/consumer/node_modules/pan-agent/dist/index.js';
const frame=x=>'data: '+JSON.stringify({object:'chat.completion.chunk',created:1,...x})+'\n\n';
export function wire(command){return frame({id:randomUUID(),model:'k3-256k',choices:[{index:0,delta:command?{role:'assistant',reasoning_content:'synthetic-private',tool_calls:[{index:0,id:randomUUID(),type:'function',function:{name:'task_command',arguments:JSON.stringify({command,timeout:2})}}]}:{role:'assistant',content:'Done'},finish_reason:null}]})+frame({model:'k3-256k',choices:[{index:0,delta:{},finish_reason:command?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}})+'data: [DONE]\n\n';}
export async function fixture({env={},budget={},agent=1,verifier=2,fetcher,signal,timers,prepare,gateClock}={}){
 const root=mkdtempSync(join(tmpdir(),'wo83-offline-'));const gate={runId:randomUUID(),binding:{model:MODEL,budget:{...LIMITS,...budget},taskIds:['control']},clock:gateClock??Date.now,expiresAt:Date.now()+60000,assert(s){if(signal?.aborted||s?.aborted)throw Error('cancelled');if(this.clock()>=this.expiresAt)throw Error('activation_expired');}};
 const ledger=new Ledger(join(root,'ledger'),gate);let dispatch=0;const events=[];const environment={async exec(){return {status:'completed',exit_code:0,stdout:'ok',stderr:'',wait:{settled:true}};},async quiesce(){events.push('quiesce');return {confirmed:true,scope:'synthetic'};},async stop(){events.push('stop');return {stopped:true};},async verify(){events.push('verify');return {status:'synthetic_control',rewards:{reward:1}};},...env};
 prepare?.({ledger,gate,environment});try{return {report:await runAttempt({entry,task:{id:'control',config:{agent:{timeout_sec:agent},verifier:{timeout_sec:verifier}}},instruction:'Synthetic control only',output:join(root,'attempt'),environment,gate,ledger,credentialSource:()=> 'synthetic-83',signal,timers,fetchImplementation:async(u,o)=>{dispatch++;return fetcher?fetcher(dispatch,o):new Response(wire());}}),dispatch,events,root};}finally{ledger.close();}
}
