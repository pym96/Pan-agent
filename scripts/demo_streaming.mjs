/** Offline/scripted, actual installed Product. Delays aid Human viewing; barrier tests prove incrementality. */
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),at=args.indexOf('--package');
if(at<0)throw new Error('Pass --package /absolute/installed/node_modules/pan-agent');
const product=resolve(args[at+1]);
const {runCli,FauxModelAdapter,FAUX_PENDING_EXCHANGE}=await import(pathToFileURL(join(product,'dist/index.js')));
const fixture=JSON.parse(await readFile(new URL('./fixtures/packed-create-run-verify-v1.json',import.meta.url),'utf8'));
const root=await mkdtemp(join(tmpdir(),'pan-agent-streaming-demo-')),workspace=join(root,'workspace'),memory=join(root,'memory');await mkdir(workspace);
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(text,calls=[])=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls.map(c=>({type:'tool_call',...c}))]},stopReason:calls.length?'tool_calls':'stop',usage:{status:'unavailable'},identity});
let selectedUserCount=0,selected,exchanges=0;
const adapter={providerId:'pan-faux (offline/scripted)',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){
 const users=request.context.messages.filter(m=>m.role==='user');
 if(users.length!==selectedUserCount){
  selectedUserCount=users.length;const task=users.at(-1).content.filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();const call=(name,args)=>({id:`demo-${selectedUserCount}-${name}`,name,arguments:args});
  const script=task==='cancel'?[FAUX_PENDING_EXCHANGE]:task==='broken'?[response('This response will not settle successfully.')]:task==='error'?[response('Reading a deliberately missing file.',[call('read',{path:'deliberately-missing.txt'})]),{kind:'failure',category:'protocol',detail:'offline_scripted_failure_after_read_error',retryable:false,identity,usage:{status:'unavailable'}}]:task==='long'?[response('Requesting 200 lines.',[call('bash',{command:"i=1; while [ $i -le 200 ]; do printf 'line-%03d\\n' \"$i\"; i=$((i+1)); done"})]),response('Use :details to inspect line-001 through line-200.')]:[...fixture.calls.map(c=>response(`Preparing ${c.name}.`,[{...c,id:`demo-${selectedUserCount}-${c.id}`} ])),response(fixture.final)];
  selected=new FauxModelAdapter(script,{progress:async function*(index,signal){
   const entry=script[index];const text=task==='cancel'?'This is an unfinished preview. Press Ctrl-C to cancel.':task==='broken'?'This preview ends with a scripted broken stream.':entry?.kind==='response'?entry.message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):'';
   for(const fragment of text.match(/.{1,6}/gu)??[]){if(signal.aborted)return;yield fragment;try{await delay(80,undefined,{signal});}catch{return;}}
   if(task==='broken')throw new Error('offline_scripted_broken_stream');
  }});
 }
 exchanges++;return selected.exchange(request);
}};
let networkAttempts=0;globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline demo prohibits network');};
console.log('OFFLINE / SCRIPTED STREAMING DEMO · actual installed Pan Product · no real Provider');
console.log(`Disposable records retained: ${root}`);
console.log('Confirm y. Enter frozen (or an ordinary task) for the fixed write/bash/read round trip.');
console.log('Enter cancel, watch the unfinished preview, then press Ctrl-C. Enter broken for a scripted stream failure.');
console.log('Enter frozen again to continue; long shows 200 tool-result lines in :details; error shows a real read error.');
console.log(':details / :runs / :replay RUN_ID / :exit. Replies are scripted, not evidence of model capability.');
console.log('Live unfinished previews are not archived. Replay reads retained settled records only.');
process.exitCode=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
console.log(`OFFLINE demo closed · Faux exchanges=${exchanges} · network attempts=${networkAttempts} · records=${memory}`);
