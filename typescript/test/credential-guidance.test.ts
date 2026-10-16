import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runCli} from '../src/cli.ts';
import {DailyWorkspace} from '../src/tui/daily-workspace.ts';

test('ordinary Kimi missing environment credential stays failed and displays actionable guidance without fetch/tools',async()=>{
 const root=await mkdtemp(join(tmpdir(),'credential-guidance-'));await mkdir(join(root,'home/.pan-agent'),{recursive:true});await mkdir(join(root,'workspace'));
 await writeFile(join(root,'home/.pan-agent/settings.json'),JSON.stringify({schemaVersion:1,provider:'kimi-code',modelId:'k3-256k',thinkingLevel:'high',credentialSource:'environment'}));
 const key=process.env.KIMI_API_KEY,fetch=globalThis.fetch;delete process.env.KIMI_API_KEY;let sends=0,frame='';globalThis.fetch=async()=>{sends++;throw Error('must not send');};
 const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(v:boolean){this.isRaw=v;}}),output=Object.assign(new PassThrough(),{isTTY:true,columns:100,rows:28});output.on('data',x=>{frame=String(x);});
 try{
  const code=await runCli(['--kernel','native','--workspace',join(root,'workspace'),'--memory-root',join(root,'archives')],{home:join(root,'home'),output,startTui:async options=>{
   const ui=new DailyWorkspace({...options,input,output});ui.start();ui.editor.insert('Reply with hello only. Do not use tools.');ui.key(undefined,{name:'return'});
   for(let i=0;i<500&&ui.phase!=='idle';i++)await new Promise(r=>setTimeout(r,5));
   try{assert.equal(ui.phase,'idle');ui.draw();assert.match(frame,/KIMI_API_KEY/);assert.match(frame,/configure/);assert.match(frame,/model_error/);assert.equal(sends,0);}
   finally{ui.dispose();await options.session.close();}return 0;
  }});assert.equal(code,0);
  const run=(await readdir(join(root,'archives/runs')))[0]!;const raw=await readFile(join(root,'archives/runs',run,'events.jsonl'),'utf8');assert.match(raw,/kimi_credential_unavailable/);assert.doesNotMatch(raw,/tool.started/);assert.match(raw,/model_error/);
 }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.KIMI_API_KEY;else process.env.KIMI_API_KEY=key;}
});

import {credentialGuidance} from '../src/tui/credential-guidance.ts';
import {createCompactPresentation} from '../src/tui/presentation.ts';
import type {ModelFailure} from '../src/protocol/canonical-protocol.ts';
const failure=(detail:string,category:ModelFailure['category']='authentication')=>({kind:'failure',category,detail,retryable:false,usage:{status:'unavailable'},identity:{}} as ModelFailure);
test('credential hints whitelist exact provider/category/code and know the configured source',()=>{
 assert.match(credentialGuidance(failure('deepseek_credential_unavailable'),'deepseek','environment')!,/DEEPSEEK_API_KEY/);
 assert.doesNotMatch(credentialGuidance(failure('kimi_credential_unavailable'),'kimi-code','keychain')!,/KIMI_API_KEY/);
 assert.match(credentialGuidance(failure('kimi_credential_unavailable'),'kimi-code','keychain')!,/Keychain/);
 assert.doesNotMatch(credentialGuidance(failure('kimi_credential_unavailable'),'kimi-code',undefined)!,/KIMI_API_KEY/);
 for(const f of [failure('secret=do-not-print'),failure('kimi_credential_unavailable secret=do-not-print'),failure('kimi_credential_unavailable','transport')])assert.equal(credentialGuidance(f,'kimi-code','environment'),undefined);
 assert.equal(credentialGuidance(failure('kimi_credential_unavailable'),'deepseek','environment'),undefined);
});
test('arbitrary provider failure detail is never displayed in actual workspace or on settlement',()=>{
 const presentation=createCompactPresentation();let frame='';const output=Object.assign(new PassThrough(),{isTTY:true,columns:100,rows:24});output.on('data',x=>{frame=String(x);});const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(){}});
 const ui=new DailyWorkspace({input,output,presentation,workspace:'/tmp',provider:'kimi-code',model:'test',thinking:'off',credentialSource:'environment',session:{setApprovalChannel(){},close:async()=>{}} as never});
 presentation.observe({type:'run.started',runId:'x',task:'test'});presentation.observe({type:'model.turn_settled',runId:'x',turn:1,text:'',failure:failure('secret=do-not-print\x1b]52;bad')} as never);presentation.settle({runId:'x',status:'model_error',reason:'secret=do-not-print',finalText:'',usage:{status:'unavailable'}} as never);ui.draw();assert.doesNotMatch(frame,/do-not-print|52;bad/);assert.match(frame,/model_error/);assert.equal(ui.entries.filter(e=>e.role==='Notice').length,0);
});
