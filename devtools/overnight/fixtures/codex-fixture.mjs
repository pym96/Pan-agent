// No Codex/account operation: deterministic CLI-shaped local process, not a coding Agent.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),out=args[args.indexOf('--output-last-message')+1];
let prompt='';for await(const c of process.stdin)prompt+=c;const input=JSON.parse(prompt.trim().split('\n').at(-1));
const plan=JSON.parse(readFileSync(join(resolve(input.candidateDirectory,'../..'),'scenario.json'),'utf8'));
const dir=dirname(out);
writeFileSync(join(dir,'observed-connector-process.json'),JSON.stringify({pid:process.pid,ppid:process.ppid,argv:process.argv,env:process.env,cwd:process.cwd(),role:input.role,session:input.session}));
if(plan.kind==='blocked' && input.role==='regulator') {
 process.on('SIGTERM',()=>{});
 const code=`const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(join(dir,'descendant.json'))},JSON.stringify({pid:process.pid,ppid:process.ppid}));const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(dir,'stop-coordination'))})){clearInterval(t);setTimeout(()=>fs.writeFileSync(${JSON.stringify(join(dir,'late-sentinel'))},'late'),2500)}},10);`;
 spawn(process.execPath,['-e',code],{stdio:'ignore',env:process.env});await new Promise(()=>{});
}
if(input.role==='builder'){
 writeFileSync(join(input.candidateDirectory,'sum-integers.js'),'export function sumIntegers(values){let total=0;for(const v of values){if(!Number.isSafeInteger(v)||!Number.isSafeInteger(total+v))throw new Error("invalid");total+=v;}return total;}\n');
 writeFileSync(join(input.candidateDirectory,'sum-integers.test.js'),'import {test} from "node:test";import assert from "node:assert/strict";import {sumIntegers} from "./sum-integers.js";test("sum",()=>assert.equal(sumIntegers([2,-1,3]),4));\n');
 writeFileSync(join(input.candidateDirectory,'README.md'),'SIMULATED connector demo only. node --test\n');
}
const value={role:input.role,session:input.session,inputCandidate:input.inputCandidate,outcome:input.role==='builder'?'handoff':'accepted',blockers:[]};
if(plan.kind==='wrong-session')value.session='wrong';
if(plan.kind==='unknown-field')value.secret=readFileSync(join(resolve(input.candidateDirectory,'../..'),'raw-synthetic-canary.txt'),'utf8');
writeFileSync(out,JSON.stringify(value));
for(const event of [{type:'thread.started',thread_id:randomUUID()},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(value)}},{type:'turn.completed',usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0}}]){
 const bytes=Buffer.from(JSON.stringify(event)+'\n');for(let i=0;i<bytes.length;i+=7)process.stdout.write(bytes.subarray(i,i+7));
}
