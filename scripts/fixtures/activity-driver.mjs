/** #61 installed-product driver. Only the observation hooks record state; all input uses the real PTY. */
import fs from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,workspace,memory]=process.argv.slice(2),root=join(workspace,'..');
const {runCli,FauxModelAdapter}=await import(pathToFileURL(join(product,'dist/index.js')));
const {DailyWorkspace}=await import(pathToFileURL(join(product,'dist/tui/daily-workspace.js')));
const calls=[];
for(let i=0;i<3;i++){
 const path=`HIDDEN_DIRECTORY/file-${i}.txt`;
 calls.push({type:'tool_call',id:`HIDDEN_ID_${i}_w`,name:'write',arguments:{path,content:'HIDDEN_RESULT'}});
 calls.push({type:'tool_call',id:`HIDDEN_ID_${i}_r`,name:'read',arguments:{path}});
 calls.push({type:'tool_call',id:`HIDDEN_ID_${i}_e`,name:'edit',arguments:{path,edits:[{oldText:'absent',newText:'HIDDEN_REPLACEMENT'}]}});
 calls.push({type:'tool_call',id:`HIDDEN_ID_${i}_b`,name:'bash',arguments:{command:'printf HIDDEN_COMMAND'}});
}
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(content,stopReason)=>({kind:'response',message:{role:'assistant',timestamp:0,content},stopReason,usage:{status:'unavailable'},identity});
const faux=new FauxModelAdapter([response(calls,'tool_calls'),response([{type:'text',text:'ACTIVITY_FINAL_OK\n'+Array.from({length:50},(_,i)=>`Final answer line ${i+1}`).join('\n')}],'stop')]);
let ui,exchanges=0;const observations=[];
const originalWrite=process.stdout.write.bind(process.stdout);
process.stdout.write=function(chunk,...args){fs.appendFileSync(join(root,'terminal-output.pty'),chunk);return originalWrite(chunk,...args);};
const snapshot=()=>({exchanges,runId:ui?.runId,phase:ui?.phase,focus:ui?.focus,draft:ui?.editor.text,caret:ui?.editor.caret,entries:ui?.entries,overlay:ui?.overlay,observations,stats:ui?.layoutStats});
const draw=DailyWorkspace.prototype.draw;
DailyWorkspace.prototype.draw=function(...args){ui=this;const result=draw.apply(this,args);fs.writeFileSync(join(root,'state.json'),JSON.stringify(snapshot()));return result;};
const observe=DailyWorkspace.prototype.observe;
DailyWorkspace.prototype.observe=function(event){observations.push({type:event.type,runId:event.runId,toolName:event.toolName,isError:event.isError});return observe.call(this,event);};
const adapter={providerId:'pan-faux',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){exchanges++;return faux.exchange(request);}};
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
fs.writeFileSync(join(root,'report.json'),JSON.stringify({...snapshot(),code},null,2));
process.exit(code);
