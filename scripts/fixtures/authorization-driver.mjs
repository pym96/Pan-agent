// #49 installed-package Faux-only driver. Does not replace authorization or tool implementations.
import fs from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,workspace,memory]=process.argv.slice(2),root=join(workspace,'..');
const {runCli,FauxModelAdapter}=await import(pathToFileURL(join(product,'dist/index.js')));
const {DailyWorkspace}=await import(pathToFileURL(join(product,'dist/tui/daily-workspace.js')));
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(content,stopReason)=>({kind:'response',message:{role:'assistant',timestamp:0,content},stopReason,usage:{status:'unavailable'},identity});
let ui,exchanges=0,runs=0,faux;const observations=[];
const plans={
 ordinary:[['write',{path:'ordinary.txt',content:'ORIGINAL'}],['read',{path:'ordinary.txt'}],['edit',{path:'ordinary.txt',edits:[{oldText:'ORIGINAL',newText:'EDITED'}]}]],
 protected:[['write',{path:'.git/authorized-demo.txt',content:'SYNTHETIC_FILE_BODY_CANARY'}]],
 deny:[['write',{path:'.git/denied-demo.txt',content:'SYNTHETIC_FILE_BODY_CANARY'}]],
 shell:[['bash',{command:'printf SHELL_ONCE'}]],
 trust:[['bash',{command:'printf TRUSTED_FIRST'}]],
 again:[['bash',{command:'printf TRUSTED_AGAIN'}]],
 cancel:[['bash',{command:'printf CANCEL_MUST_NOT_RUN > cancelled-marker.txt'}]],
 long:[['bash',{command:'printf LONG_REVIEW '+ '#'.repeat(400)+' \u202e \x1b[2J'}]],
};
const adapter={providerId:'pan-faux',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){
 const users=request.context.messages.filter(m=>m.role==='user');
 if(users.length!==runs){runs=users.length;const task=users.at(-1).content.filter(c=>c.type==='text').map(c=>c.text).join('').trim();const calls=(plans[task]??plans.ordinary).map(([name,args],i)=>({type:'tool_call',id:`synthetic-${runs}-${i}`,name,arguments:args}));
  faux=new FauxModelAdapter([response(calls,'tool_calls'),response([{type:'text',text:`FINAL ${task} · view tool outcome for allowed/denied status`}],'stop')]);
  await new Promise(resolve=>setTimeout(resolve,task==='cancel'?1500:150));
 }
 exchanges++;return faux.exchange(request);
}};
const write=process.stdout.write.bind(process.stdout);process.stdout.write=function(chunk,...args){fs.appendFileSync(join(root,'terminal-output.pty'),chunk);return write(chunk,...args);};
const snapshot=()=>({exchanges,runs,runId:ui?.runId,phase:ui?.phase,focus:ui?.focus,draft:ui?.editor.text,caret:ui?.editor.caret,entries:ui?.entries,overlay:ui?.overlay,approval:ui?.approval?{request:ui.approval.request,choice:ui.approval.choice}:null,observations});
const draw=DailyWorkspace.prototype.draw;DailyWorkspace.prototype.draw=function(...args){ui=this;const result=draw.apply(this,args);fs.writeFileSync(join(root,'state.json'),JSON.stringify(snapshot()));return result;};
const observe=DailyWorkspace.prototype.observe;DailyWorkspace.prototype.observe=function(event){observations.push(event.type==='tool.settled'?{type:event.type,runId:event.runId,toolCallId:event.toolCallId,isError:event.isError,details:event.details}:{type:event.type,runId:event.runId});return observe.call(this,event);};
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
fs.writeFileSync(join(root,'report.json'),JSON.stringify({...snapshot(),code},null,2));process.exit(code);
