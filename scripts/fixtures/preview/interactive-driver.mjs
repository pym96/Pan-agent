/** #51 Human offline preview: actual installed Product, scripted Faux first task. No real Provider. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const [product,workspace,memory,fixturePath]=process.argv.slice(2);
if(!product||!workspace||!memory||!fixturePath)throw new Error('usage: interactive-driver.mjs INSTALLED_PACKAGE WORKSPACE MEMORY FIXTURE');
const fixture=JSON.parse(await fsp.readFile(fixturePath,'utf8'));
const recordsRoot=join(workspace,'..');
const transcript=join(recordsRoot,'terminal-output.pty');
const write=process.stdout.write.bind(process.stdout);
let outputBytes=0;
process.stdout.write=function(chunk,...args){const s=String(chunk);fs.appendFileSync(transcript,s);outputBytes+=Buffer.byteLength(s);return write(s,...args);};
const {runCli,FauxModelAdapter}=await import(pathToFileURL(join(product,'dist/index.js')));
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const outcome=(text,calls=[],stopReason=calls.length?'tool_calls':'stop')=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls.map(c=>({type:'tool_call',...c}))]},stopReason,usage:{status:'unavailable'},identity});
const firstScript=[...fixture.calls.map(c=>outcome('Preparing '+c.name+'.',[c])),outcome(fixture.final)];
const note='Offline preview: only the first task is scripted. Use :runs to list runs, :replay RUN_ID to inspect the sealed run, or :exit to close.';
let exchanges=0,canned=0;
const adapter={providerId:'pan-faux (offline/simulated)',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){
 const index=exchanges++;
 const script=index<4?firstScript.slice(index,index+1):[outcome(note)];
 if(index<4)canned++;
 const selected=new FauxModelAdapter(script,{progress:async function*(i,signal){
  const text=script[i]?.kind==='response'?script[i].message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'';
  for(const fragment of text.match(/.{1,6}/gu)??[]){if(signal.aborted)return;yield fragment;try{await delay(40,undefined,{signal});}catch{return;}}
 }});
 return selected.exchange(request);
}};
let networkAttempts=0;globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline preview prohibits network');};
console.log('OFFLINE / SIMULATED PREVIEW · actual installed Pan Product · scripted Faux replies, no real Provider, no network, no credentials.');
console.log('Confirm y, then enter the frozen first task exactly:');
console.log('  '+fixture.prompt);
console.log('Watch it write hello.js, run node hello.js and read the source back. Afterwards try :runs, :replay RUN_ID and :exit.');
console.log('Local recording directory: '+recordsRoot);
const code=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
await fsp.writeFile(join(recordsRoot,'report.json'),JSON.stringify({code,fixture:fixture.id,exchanges,canned,networkAttempts,outputBytes,terminal:process.env.TERM},null,2)+'\n');
console.log(`OFFLINE preview closed · Faux exchanges=${exchanges} · network attempts=${networkAttempts} · records=${memory}`);
process.exit(code);
