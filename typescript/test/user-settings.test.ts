import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { loadPanSettings, savePanSettings, panSettingsPath, parsePanSettings, type PanSettings } from '../src/config/settings.ts';
import { parsePanPermissions, matchesCommandPattern, MAX_DENY_RULES, MAX_DENY_RULE_LENGTH } from '../src/config/permissions.ts';
import { runFirstRunConfiguration } from '../src/config/first-run.ts';
import { runCli } from '../src/cli.ts';
import { SessionAuthorization } from '../src/runtime/authorization.ts';
import { GeneralAgentSession } from '../src/runtime/session.ts';
import { createPanTrustedLocalTools } from '../src/tools/pan-trusted-local-tools.ts';
import { createRetrievalTool } from '../src/retrieval/tool.ts';
import { createSandboxTools } from '../src/sandbox/tools.ts';
import type { DockerSandbox } from '../src/sandbox/docker.ts';
import type { AgentKernel } from '../src/runtime/agent-kernel.ts';
import { FauxModelAdapter } from '../src/providers/faux/faux-model-adapter.ts';
import { RunArchiveStore } from '../src/memory/run-archive.ts';
import type { JsonObject } from '../src/protocol/canonical-protocol.ts';
import { DEFAULT_MAX_ATTACHMENT_BYTES, captureAttachment } from '../src/input/attachments.ts';
const valid={schemaVersion:1,provider:'deepseek',modelId:'deepseek-v4-flash',thinkingLevel:'high',credentialSource:'environment'} as const;
async function temp(t:TestContext){const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'settings170-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
function output(){const stream=new PassThrough();let text='';stream.on('data',c=>{text+=c;});return {stream,text:()=>text};}
const identity={provider:{status:'reported' as const,value:'pan-faux'},model:{status:'reported' as const,value:'pan-faux-v1'},responseId:{status:'unavailable' as const}};
const final={kind:'response' as const,message:{role:'assistant' as const,timestamp:0,content:[{type:'text' as const,text:'done'}]},stopReason:'stop' as const,usage:{status:'unavailable' as const},identity};
function calls(entries:readonly {id:string;name:string;arguments:JsonObject}[]){return {kind:'response' as const,message:{role:'assistant' as const,timestamp:0,content:entries.map(c=>({type:'tool_call' as const,...c}))},stopReason:'tool_calls' as const,usage:{status:'unavailable' as const},identity};}
const runbook=async()=>({content:'offline',revision:'sha256:'+'0'.repeat(64)});

test('SETTINGS C01 strict grammar, literal full-string glob, and parser resource bounds',()=>{
 const legal=['read','write','edit','bash','retrieve','bash(*)','bash(*git reset --hard*)','bash(echo (a))','bash(a\nb)','bash(a[.]?+$^\\b)'];assert.deepEqual(parsePanPermissions({deny:legal}).deny,legal);
 for(const deny of [null,'bash',[1],[''],['Read'],['shell'],['Bash(*)'],['bash()'],['bash(x)extra'],['read(*)'],['!bash'],['bash('+'x'.repeat(MAX_DENY_RULE_LENGTH)+')'],Array(MAX_DENY_RULES+1).fill('bash')])assert.throws(()=>parsePanSettings(JSON.stringify({...valid,permissions:{deny}})),/settings_invalid/);
 for(const permissions of [null,[],{},{deny:[],allow:['bash']},{deny:[],apiKey:'SYNTHETIC_SECRET'}])assert.throws(()=>parsePanSettings(JSON.stringify({...valid,permissions})),/settings_invalid/);
 const cases:[string,string,boolean][]=[['*git reset --hard*','git reset --hard',true],['*git reset --hard*','echo ok;\ngit reset --hard HEAD',true],['git reset --hard','echo git reset --hard',false],['*git reset --hard*','git RESET --hard',false],['a*b','a\n\nb',true],['a[.]?+$^\\b','a[.]?+$^\\b',true],['a[.]?+$^\\b','a.xxb',false],['a*a','a',false],['a**b','ab',true],['*','',true],['echo (x)','echo (x)',true]];
 for(const [pattern,command,expected] of cases)assert.equal(matchesCommandPattern(pattern,command),expected,JSON.stringify([pattern,command]));
 assert.equal(parsePanPermissions({deny:Array(MAX_DENY_RULES).fill('bash')}).deny.length,MAX_DENY_RULES);assert.equal(parsePanPermissions({deny:['bash('+'x'.repeat(MAX_DENY_RULE_LENGTH-6)+')']}).deny.length,1);
});

test('SETTINGS C01 save validates all fields before changing bytes; modes and extensions roundtrip',async t=>{
 const home=await temp(t);const settings={...valid,permissions:{deny:['bash(*reset*)']},protectedPaths:['private'],maxAttachmentBytes:37};await savePanSettings(settings,home);const before=await fs.readFile(panSettingsPath(home));assert.deepEqual(await loadPanSettings(home),settings);
 assert.equal((await fs.stat(panSettingsPath(home))).mode&0o777,0o600);assert.equal((await fs.stat(join(home,'.pan-agent'))).mode&0o777,0o700);
 for(const bad of [{...valid,apiKey:'SYNTHETIC_SECRET'},{...valid,extra:undefined},{...valid,permissions:null},{...valid,maxAttachmentBytes:undefined},...[0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'9',null].map(maxAttachmentBytes=>({...valid,maxAttachmentBytes})),{...valid,provider:'SYNTHETIC_SECRET'},{...valid,protectedPaths:[7]}]){await assert.rejects(savePanSettings(bad as unknown as PanSettings,home),/settings_invalid|provider_unavailable/);assert.deepEqual(await fs.readFile(panSettingsPath(home)),before);}
 assert.deepEqual(await fs.readdir(join(home,'.pan-agent')),['settings.json']);
});

test('SETTINGS C01 configure preserves policy; malformed settings block before prompts or credentials',async t=>{
 const home=await temp(t),extensions={permissions:{deny:['bash']},protectedPaths:['protected'],maxAttachmentBytes:73};await savePanSettings({...valid,...extensions},home);
 const input=new PassThrough(),io=output();const pending=runFirstRunConfiguration({home,input,output:io.stream,saveCredential:()=>assert.fail('credential save')});input.end('kimi-code:k3-256k\nmax\nenvironment\n');
 assert.deepEqual(await pending,{...valid,...extensions,provider:'kimi-code',modelId:'k3-256k',thinkingLevel:'max'});
 const bad=JSON.stringify({...valid,permissions:{deny:['Bash(*)']},apiKey:'SYNTHETIC_SECRET'});await fs.writeFile(panSettingsPath(home),bad);const blocked=output();
 await assert.rejects(runFirstRunConfiguration({home,input:new PassThrough(),output:blocked.stream,saveCredential:()=>assert.fail('credential mutation')}),/settings_invalid/);assert.equal(blocked.text(),'');assert.equal(await fs.readFile(panSettingsPath(home),'utf8'),bad);
});

test('SETTINGS C02 management is read-only, absent explicit, show roundtrips and diagnostics never echo values',async t=>{
 const home=await temp(t);
 for(const [cmd,exit,expected] of [['path',0,panSettingsPath(home)],['show',0,'settings_absent'],['validate',2,'settings_absent']] as const){const io=output();assert.equal(await runCli(['settings',cmd],{home,output:io.stream}),exit);assert(io.text().includes(expected));}assert.deepEqual(await fs.readdir(home),[]);
 const settings={...valid,credentialSource:'keychain' as const,permissions:{deny:['bash(*reset*)']},maxAttachmentBytes:41};await savePanSettings(settings,home);const before=await fs.readFile(panSettingsPath(home)),io=output();assert.equal(await runCli(['settings','show'],{home,output:io.stream}),0);assert.deepEqual(JSON.parse(io.text()),settings);assert.equal(await runCli(['settings','validate'],{home,output:output().stream}),0);assert.deepEqual(await fs.readFile(panSettingsPath(home)),before);
 for(const field of ['apiKey','provider','modelId','thinkingLevel','credentialSource','permissions','maxAttachmentBytes']){await fs.writeFile(panSettingsPath(home),JSON.stringify({...valid,[field]:'SYNTHETIC_SECRET'}));for(const cmd of ['show','validate']){const error=output();assert.equal(await runCli(['settings',cmd],{home,output:error.stream}),2);assert.doesNotMatch(error.text(),/SYNTHETIC_SECRET/);}assert.equal(await runCli(['settings','path'],{home,output:output().stream}),0);}
 for(const args of [['settings'],['settings','write'],['settings','show','extra']])assert.equal(await runCli(args,{home,output:output().stream}),2);
});

test('SETTINGS C03 all five host tools denied before implementation/approval; file/process sentinels unchanged',async t=>{
 const root=await temp(t);await fs.writeFile(join(root,'target'),'ORIGINAL');let dispatched=0,approved=0;const auth=new SessionAuthorization({permissions:{deny:['read','write','edit','bash','retrieve']},approval:async r=>{approved++;return {requestId:r.requestId,decision:'allow-once'};}});
 const tools=[...createPanTrustedLocalTools(root,{PATH:'/bin:/usr/bin'}).tools,createRetrievalTool(root)];const inputs:Record<string,JsonObject>={read:{path:'target'},write:{path:'new-file',content:'BAD'},edit:{path:'target',edits:[{oldText:'ORIGINAL',newText:'BAD'}]},bash:{command:'printf BAD > process-sentinel'},retrieve:{query:'SYNTHETIC'}};
 for(const tool of tools){const wrapped=auth.wrap({...tool,execute:async i=>{dispatched++;return tool.execute(i);}},()=> 'run-host');const result=await wrapped.execute({toolCallId:'call-'+tool.name,arguments:inputs[tool.name]!,signal:new AbortController().signal});assert.equal(result.isError,true);const audit=(result.details as JsonObject).authorization as JsonObject;assert.equal((result.details as JsonObject).code,'permission_denied');assert.equal(audit.rule,tool.name);assert.equal(audit.callId,'call-'+tool.name);assert.equal(audit.runId,'run-host');assert.match(String(audit.policyRevision),/^[a-f0-9]{64}$/);}
 assert.equal(dispatched,0);assert.equal(approved,0);assert.equal(await fs.readFile(join(root,'target'),'utf8'),'ORIGINAL');assert.deepEqual(await fs.readdir(root),['target']);
});

test('SETTINGS C03 caller mutation or prior shell trust cannot loosen deny; legitimate commands execute',async t=>{
 const root=await temp(t);let approvals=0;const deny=['bash(*denied-file*)'],permissions={deny};const auth=new SessionAuthorization({permissions,approval:async r=>{approvals++;return {requestId:r.requestId,decision:'trust-shell'};}});deny.splice(0);permissions.deny=['read'];
 const bash=auth.wrap(createPanTrustedLocalTools(root,{PATH:'/bin:/usr/bin'}).tools.find(t=>t.name==='bash')!,()=> 'trust-run');const invoke=(command:string)=>bash.execute({arguments:{command},toolCallId:command,signal:new AbortController().signal});
 assert.equal((await invoke('printf OK > allowed-file')).isError,false);assert.equal(approvals,1);assert.equal(((await invoke('printf BAD > denied-file')).details as JsonObject).code,'permission_denied');assert.equal(approvals,1);assert.equal(await fs.readFile(join(root,'allowed-file'),'utf8'),'OK');await assert.rejects(fs.stat(join(root,'denied-file')),/ENOENT/);
 assert.equal((await invoke('printf STILL >> allowed-file')).isError,false);assert.equal(approvals,1);assert.equal(await fs.readFile(join(root,'allowed-file'),'utf8'),'OKSTILL');auth.revoke();assert.equal((await invoke('printf AGAIN >> allowed-file')).isError,false);assert.equal(approvals,2);
});

test('SETTINGS C03 sandbox denies precede box.call; legitimate nonmatch retains sandbox approval',async()=>{
 let effects=0,approvals=0;const box={identity:{runId:'fixed',containerId:'fixed',phase:'running'},call:async()=>{effects++;return {code:0,stdout:'ok',stderr:''};}} as unknown as DockerSandbox;
 const tools=createSandboxTools(box).tools,auth=new SessionAuthorization({permissions:{deny:['read','write','edit','bash(*blocked*)']},approval:async r=>{approvals++;return {requestId:r.requestId,decision:'allow-once'};}});
 for(const tool of tools){const result=await auth.wrap(tool,()=> 'sandbox-run').execute({toolCallId:'sandbox-'+tool.name,arguments:tool.name==='bash'?{command:'echo blocked'}:tool.name==='write'?{path:'target',content:'bad'}:tool.name==='edit'?{path:'target',edits:[{oldText:'old',newText:'new'}]}:{path:'target'},signal:new AbortController().signal});assert.equal((result.details as JsonObject).code,'permission_denied');}assert.equal(effects,0);assert.equal(approvals,0);
 assert.equal((await auth.wrap(tools.find(t=>t.name==='bash')!,()=> 'sandbox-run').execute({toolCallId:'allowed',arguments:{command:'echo legitimate'},signal:new AbortController().signal})).isError,false);assert.equal(effects,1);assert.equal(approvals,1);
});

test('SETTINGS C03 CLI freezes/reloads policy, propagates attachment precedence, and archives denial',async t=>{
 const root=await temp(t),home=join(root,'home'),workspace=join(root,'workspace');await fs.mkdir(workspace);await fs.writeFile(join(workspace,'attachment.txt'),'123456789');await savePanSettings({...valid,permissions:{deny:['bash']},maxAttachmentBytes:8},home);const memory=join(root,'archive');let approvals=0,seen=0;
 const adapter=()=>new FauxModelAdapter([calls([{id:'shell-call',name:'bash',arguments:{command:'printf ALLOWED > marker'}}]),final]);
 const launch=async(args:string[]=[])=>runCli(['--kernel','native','--trusted-local','--workspace',workspace,'--memory-root',memory,...args],{home,output:output().stream,createNativeAdapter:adapter,startTui:async o=>{
  seen++;assert.equal(o.maxAttachmentBytes,seen===1?8:seen===2?16:DEFAULT_MAX_ATTACHMENT_BYTES);o.session.setApprovalChannel(async r=>{approvals++;return {requestId:r.requestId,decision:'allow-once'};});
  if(seen===1){await assert.rejects(captureAttachment(workspace,'attachment.txt',o.maxAttachmentBytes!),/attachment_budget_exceeded/);await savePanSettings({...valid,permissions:{deny:[]},maxAttachmentBytes:32},home);}
  const result=await o.session.runTask('offline policy check'),archive=await o.archiveStore!.readArchive(result.runId),settled=archive.find(r=>r.type==='tool.settled')!;assert.equal(settled.toolCallId,'shell-call');assert.equal(settled.isError,seen===1);
  if(seen===1){assert.match(JSON.stringify(settled.details),/permission_denied/);assert.equal(approvals,0);await assert.rejects(fs.stat(join(workspace,'marker')),/ENOENT/);}else assert.equal(await fs.readFile(join(workspace,'marker'),'utf8'),'ALLOWED');await o.session.close();return 0;
 }});
 assert.equal(await launch(),0);assert.equal(await launch(['--max-attachment-bytes','16']),0);await savePanSettings(valid,home);assert.equal(await launch(),0);assert.equal(approvals,2);
});

test('SETTINGS C04 malformed policy aborts before model/tools; opaque injected kernels fail closed',async t=>{
 const root=await temp(t),home=join(root,'home'),workspace=join(root,'workspace');await fs.mkdir(workspace);await savePanSettings(valid,home);await fs.writeFile(panSettingsPath(home),JSON.stringify({...valid,permissions:{deny:['unknown']}}));assert.equal(await runCli(['--kernel','native','--workspace',workspace,'--memory-root',join(root,'memory')],{home,output:output().stream,createNativeAdapter:()=>assert.fail('adapter constructed'),createTools:()=>assert.fail('tools constructed'),startTui:()=>assert.fail('TUI started')}),2);
 const store=await RunArchiveStore.open(join(root,'injected-memory'));let runs=0;const kernel={kind:'native',runTask:async()=>{runs++;throw Error('opaque');},cancel(){},async close(){}} as unknown as AgentKernel;
 const base={kernel,adapterIdentity:{provider:'faux',modelId:'faux',thinkingLevel:'off'},systemPrompt:'offline',memory:{archiveStore:store,runbook}};assert.throws(()=>new GeneralAgentSession({...base,authorization:{permissions:{deny:['bash']}}}),/permissions_unsupported: injected kernel/);assert.equal(runs,0);for(const permissions of [null,{deny:['unknown']},{allow:['bash']},[]])assert.throws(()=>new SessionAuthorization({permissions} as never),/settings_invalid/);await new GeneralAgentSession(base).close();
});
