#!/usr/bin/env node
/** Real installed CLI + TUI + Session + platform enforcement. Only model responses are scripted. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
const [installedArgument,outputArgument]=process.argv.slice(2);
if(!installedArgument||!outputArgument)throw Error('usage: native-macos.mjs INSTALLED_PACKAGE NEW_OUTPUT');
const installed=fs.realpathSync(installedArgument),out=path.resolve(outputArgument);
fs.mkdirSync(out,{mode:0o700});
if(!['darwin','linux'].includes(process.platform))throw Error('requires macOS or supported Linux');
const mode=process.platform==='darwin'?'native-macos-offline':'native-linux-offline';
assert.equal(fs.existsSync(path.join(installed,'src')),false);
assert.equal(fs.existsSync(path.join(installed,'node_modules/typescript')),false);
const home=path.join(out,'home'),workspace=path.join(out,'workspace'),memory=path.join(out,'archives');
fs.mkdirSync(home,{mode:0o700});fs.mkdirSync(workspace,{mode:0o700});
fs.writeFileSync(path.join(workspace,'source.txt'),'before');
fs.writeFileSync(path.join(workspace,'.env'),'SYNTHETIC_CREDENTIAL_BODY');
const api=await import(pathToFileURL(path.join(installed,'dist/index.js')).href);
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(content,stopReason='tool_calls')=>({kind:'response',message:{role:'assistant',timestamp:0,content},stopReason,usage:{status:'unavailable'},identity});
const adapter=new api.FauxModelAdapter([
 response([{type:'tool_call',id:'edit',name:'edit',arguments:{path:'source.txt',edits:[{oldText:'before',newText:'after'}]}}]),
 response([{type:'tool_call',id:'test',name:'bash',arguments:{command:'test "$(cat source.txt)" = after && ! cat .env && printf \'shell-result\' > artifact.tmp && printf \'old\' > artifact.txt && mv -f artifact.tmp artifact.txt && echo NATIVE_INSTALLED_VERIFIED'}}]),
 response([{type:'tool_call',id:'readback',name:'read',arguments:{path:'artifact.txt'}}]),
 response([{type:'text',text:'Completed installed native task'}],'stop'),
]);
const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(value){this.isRaw=value;}});
const output=Object.assign(new PassThrough(),{isTTY:true,columns:160,rows:50});
let transcript='',approved=false,exiting=false,store;
output.on('data',chunk=>{const text=String(chunk);transcript+=text;if(text.includes('Approval required')&&!approved){approved=true;setImmediate(()=>input.write('\x1b[B\r'));}if(text.includes('Completed · next draft')&&!exiting){exiting=true;setTimeout(()=>input.write(':exit\r'),50);}});
const watchdog=setTimeout(()=>{input.end();},12000);
try{
 const code=await api.runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory,'--native-sandbox','--native-offline'],{home,output,createNativeAdapter:()=>adapter,startTui:options=>{assert.equal(options.executionMode,mode);store=options.archiveStore;const running=api.runTui({...options,input});setImmediate(()=>input.write('Edit source then run the offline test\r'));return running;}});
 assert.equal(code,0);assert.equal(approved,true);assert.equal(exiting,true);
 assert.equal(fs.readFileSync(path.join(workspace,'source.txt'),'utf8'),'after');
 assert.equal(fs.readFileSync(path.join(workspace,'.env'),'utf8'),'SYNTHETIC_CREDENTIAL_BODY');
 assert.match(transcript,/Native offline/);assert.doesNotMatch(transcript,/SYNTHETIC_CREDENTIAL_BODY/);
 const runs=await store.listRuns();assert.equal(runs.length,1);const records=await store.readArchive(runs[0].runId);
 fs.writeFileSync(path.join(out,'archive.json'),JSON.stringify(records,null,2)+'\n');
 fs.writeFileSync(path.join(out,'tui.stdout'),transcript);
 const boundary=records.find(r=>r.type==='execution.boundary');assert.equal(boundary.executionMode,mode);assert.match(boundary.policyHash,/^[a-f0-9]{64}$/);
 const tool=records.find(r=>r.type==='tool.settled'&&r.toolCallId==='test');assert.equal(tool.isError,false);assert.match(tool.text,/NATIVE_INSTALLED_VERIFIED/);
 assert.doesNotMatch(JSON.stringify(records),/SYNTHETIC_CREDENTIAL_BODY/);
 const readback=records.find(r=>r.type==='tool.settled'&&r.toolCallId==='readback');assert.equal(readback.isError,false);assert.equal(readback.text,'shell-result');
 assert.equal(fs.readFileSync(path.join(workspace,'artifact.txt'),'utf8'),'shell-result');
 assert.equal(fs.existsSync(path.join(workspace,'artifact.tmp')),false);
 assert.equal(adapter.state.exchangeCount,4);
 const summary={status:'PASS',installed,platform:process.platform,checks:['real-installed-cli','real-TUI-input-and-approval','host-edit-shared-shell-bytes','real-protected-file-denial','mode-and-policy-archived','sealed-archive','shell-atomic-replacement','typed-readback','four-scripted-model-exchanges'],boundary,runId:runs[0].runId};
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks:summary.checks,runId:summary.runId}));
}finally{clearTimeout(watchdog);fs.writeFileSync(path.join(out,'tui.stdout'),transcript);input.destroy();output.destroy();}
