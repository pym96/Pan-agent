/** Offline/scripted interactive composition of the actual installed Product CLI. */
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);const packageAt=args.indexOf('--package');
const product=packageAt<0?resolve(new URL('../typescript',import.meta.url).pathname):resolve(args[packageAt+1]);
// Only a compiled, explicitly chosen local Product is loaded. Never install/fetch.
const {runCli,FauxModelAdapter,FAUX_PENDING_EXCHANGE}=await import(pathToFileURL(join(product,'dist/index.js')));
const fixture=JSON.parse(await readFile(new URL('./fixtures/packed-create-run-verify-v1.json',import.meta.url),'utf8'));
const root=await mkdtemp(join(tmpdir(),'pan-agent-offline-demo-'));const workspace=join(root,'workspace'),memory=join(root,'memory');await mkdir(workspace);
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=(text,calls=[])=>({kind:'response',message:{role:'assistant',timestamp:0,content:[{type:'text',text},...calls.map(c=>({type:'tool_call',...c}))]},stopReason:calls.length?'tool_calls':'stop',usage:{status:'unavailable'},identity});
let selectedUserCount=0,selected,exchanges=0;
const adapter={providerId:'pan-faux (offline/scripted)',modelId:'pan-faux-v1',reasoningLevel:'off',async exchange(request){
 const users=request.context.messages.filter(m=>m.role==='user');
 if(users.length!==selectedUserCount){selectedUserCount=users.length;const task=users.at(-1).content.filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();const call=(name,arguments_)=>({id:`demo-${selectedUserCount}-${name}`,name,arguments:arguments_});
  const script=task==='cancel'?[FAUX_PENDING_EXCHANGE]:task==='error'?[response('',[call('read',{path:'deliberately-missing.txt'})]),{kind:'failure',category:'protocol',detail:'Offline scripted model_error after the real read error',retryable:false,usage:{status:'unavailable'},identity}]:task==='long'?[response('',[call('bash',{command:"i=1; while [ $i -le 200 ]; do printf 'line-%03d\\n' \"$i\"; i=$((i+1)); done"})]),response('长结果已返回；:details 可查看 line-001 到 line-200。')]:[...fixture.calls.map(c=>response('',[{...c,id:`demo-${selectedUserCount}-${c.id}`} ])),response(fixture.final)];
  selected=new FauxModelAdapter(script);
 }
 exchanges++;return selected.exchange(request);
}};
// The demo has no fallback. A accidental transport call fails locally.
let networkAttempts=0;globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline demo prohibits network');};
console.log('OFFLINE / SCRIPTED DEMO · actual Pan Product CLI/TUI · no real Provider');
console.log(`Disposable records retained: ${root}`);
console.log('确认 y 后输入 frozen（或普通任务）运行固定 write/bash/read；long 查看长结果；error 查看错误；cancel 后 Ctrl-C 取消。');
console.log(':details / :runs / :replay RUN_ID / :exit 可直接使用。每个任务的响应均预先编写，不表示模型能力。');
process.exitCode=await runCli(['--kernel','native','--workspace',workspace,'--memory-root',memory],{createNativeAdapter:()=>adapter});
console.log(`OFFLINE demo closed · Faux exchanges=${exchanges} · network attempts=${networkAttempts} · records=${memory}`);
