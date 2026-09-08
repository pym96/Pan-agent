/** Actual installed Product; synthetic files and deterministic Faux only. */
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),at=args.indexOf('--package');
if(at<0)throw new Error('Pass --package /absolute/installed/node_modules/pan-agent');
const product=resolve(args[at+1]);const {runCli,FauxModelAdapter,decodeAttachedTask}=await import(pathToFileURL(join(product,'dist/index.js')));
const root=await mkdtemp(join(tmpdir(),'pan-agent-file-demo-')),workspace=join(root,'workspace'),memory=join(root,'memory');await mkdir(workspace);execFileSync('git',['init','-q',workspace],{env:{PATH:process.env.PATH,HOME:root,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
await writeFile(join(workspace,'example 中文.txt'),'\ufeffSYNTHETIC_DEMO_ONLY\r\nA deliberate file snapshot.\n');await writeFile(join(workspace,'second.txt'),'A second synthetic file.\n');
let exchanges=0;
const adapter={providerId:'pan-faux (offline/scripted)',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){
 exchanges++;const task=request.context.messages.filter(m=>m.role==='user').at(-1).content.filter(c=>c.type==='text').map(c=>c.text).join('\n');const decoded=decodeAttachedTask(task);
 const text=decoded?`Offline Faux received ${decoded.attachments.length} snapshot(s), ${decoded.attachments.reduce((n,a)=>n+a.bytes,0)} original bytes as user data. Use :details or :runs then :replay RUN_ID to inspect the recorded snapshot.`:'Offline Faux received literal task text without an attachment.';
 const response={kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text}]},stopReason:'stop',usage:{status:'unavailable'},identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}}};
 return new FauxModelAdapter([response],{progress:async function*(_index,signal){for(const fragment of text.match(/.{1,8}/gu)??[]){if(signal.aborted)return;yield fragment;try{await delay(40,undefined,{signal});}catch{return;}}}}).exchange(request);
}};
console.log('OFFLINE FILE DEMO · installed Product · synthetic files · deterministic Faux');console.log(`Disposable snapshots and archives: ${root}`);
console.log('Confirm y. Type review then a space and @example; Enter selects only. Ctrl-P previews the snapshot. Enter again submits.');
console.log('Ctrl-R removes the last attachment. Escape dismisses the picker and inserts literal @query. :help lists commands.');
console.log(':details / :runs / :replay RUN_ID / :exit. No model capability claim.');
process.exitCode=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
console.log(`OFFLINE file demo closed · Faux exchanges=${exchanges} · records=${memory}`);
