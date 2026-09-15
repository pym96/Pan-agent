import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { SessionAuthorization, protectedReason, type ApprovalChannel, type ApprovalRequest, type ApprovalDecision } from '../src/runtime/authorization.ts';
import { createPanTrustedLocalTools } from '../src/tools/pan-trusted-local-tools.ts';
import { parsePanSettings } from '../src/config/settings.ts';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import type { TuiOptions } from '../src/tui/tui.ts';
import type { JsonObject } from '../src/protocol/canonical-protocol.ts';
import { GeneralAgentSession } from '../src/runtime/session.ts';
import { FauxModelAdapter } from '../src/providers/faux/faux-model-adapter.ts';
import { RunArchiveStore } from '../src/memory/run-archive.ts';

function fixture(approval?:ApprovalChannel,protectedPaths:readonly string[]=[]){
 const root=fs.mkdtempSync('/private/tmp/wo49-test-'),workspace=join(root,'workspace');fs.mkdirSync(workspace);
 const authority=new SessionAuthorization({approval,protectedPaths});
 const raw=createPanTrustedLocalTools(workspace,{PATH:'/usr/bin:/bin'}).tools;
 let n=0;
 const run=(name:string,args:JsonObject,signal=new AbortController().signal)=>authority.wrap(raw.find(t=>t.name===name)!,()=> 'run-1').execute({arguments:args,toolCallId:'call-'+(++n),signal});
 return {root,workspace,authority,raw,run};
}
const allow:ApprovalChannel=async request=>({requestId:request.requestId,decision:'allow-once'});
test('A-POLICY actual content-read/truncate/write counters stay zero for denied existing files',async()=>{
 const f=fixture();fs.writeFileSync(join(f.workspace,'.env'),'EXISTING_SYNTHETIC_CANARY');
 const read=fs.readFileSync,truncate=fs.ftruncateSync,write=fs.writeSync;const counts={reads:0,truncates:0,writes:0};
 fs.readFileSync=((...args)=>{counts.reads++;return read(...args);}) as typeof fs.readFileSync;
 fs.ftruncateSync=((...args)=>{counts.truncates++;return truncate(...args);}) as typeof fs.ftruncateSync;
 fs.writeSync=((...args)=>{counts.writes++;return Reflect.apply(write,fs,args);}) as typeof fs.writeSync;syncBuiltinESMExports();
 try{for(const [tool,args] of [['read',{path:'.env'}],['write',{path:'.env',content:'BAD'}],['edit',{path:'.env',edits:[{oldText:'EXISTING',newText:'BAD'}]}]] as const)assert.equal((await f.run(tool,args)).isError,true);assert.deepEqual(counts,{reads:0,truncates:0,writes:0});console.log('A-POLICY denied content effects '+JSON.stringify(counts));}
 finally{fs.readFileSync=read;fs.ftruncateSync=truncate;fs.writeSync=write;syncBuiltinESMExports();}
 assert.equal(fs.readFileSync(join(f.workspace,'.env'),'utf8'),'EXISTING_SYNTHETIC_CANARY');
});
test('A-POLICY C-AUTH-01 ordinary operations, exact protected classes and settings fail closed',async()=>{
 const f=fixture();
 for(const name of ['a.txt','.env.example','.env.sample','.env.template','a.git/file','.ssh-lookalike/file'])assert.equal((await f.run('write',{path:name,content:'ordinary'})).isError,false,name);
 assert.equal((await f.run('read',{path:'a.txt'})).content[0]?.type,'text');
 assert.equal((await f.run('edit',{path:'a.txt',edits:[{oldText:'ordinary',newText:'edited'}]})).isError,false);
 assert.equal(fs.readFileSync(join(f.workspace,'a.txt'),'utf8'),'edited');
 for(const name of ['.git/config','.ssh/config','.pan-agent/settings','.env','.env.local','.env.example.more','.npmrc',join(f.root,'outside')]){
  const result=await f.run('write',{path:name,content:'BODY_CANARY'});assert.equal(result.isError,true,name);assert.match(JSON.stringify(result),/approval_unavailable/);assert.equal(fs.existsSync(join(f.workspace,name)),false);
 }
 assert.equal((await f.run('bash',{command:'printf hello'})).isError,true);
 assert.equal((await f.run('write',{path:'bad',content:7})).isError,true);assert.equal(fs.existsSync(join(f.workspace,'bad')),false);
 assert.equal(protectedReason(f.workspace,join(f.workspace,'extra/a'),['extra']),'configured_protected_path');
 assert.equal(protectedReason(f.workspace,join(f.workspace,'extra-like/a'),['extra']),undefined);
 const settings={schemaVersion:1,provider:'deepseek',modelId:'deepseek-chat',thinkingLevel:'low',credentialSource:'environment'};
 // Preserve a valid repository model selector, not an external API model name.
 settings.modelId='deepseek-v4-flash';
 for(const value of [null,'path',[1],[''],['a\0b']])assert.throws(()=>parsePanSettings(JSON.stringify({...settings,protectedPaths:value})),/protectedPaths/);
 const direct=f.raw.find(t=>t.name==='bash')!;assert.equal((await direct.execute({toolCallId:'raw',arguments:{command:'printf raw'},signal:new AbortController().signal})).isError,true);
});
test('A-IDENTITY C-AUTH-02 one-time exact decisions, malformed/foreign/late, isolation and revocation',async()=>{
 let captured:ApprovalRequest|undefined,calls=0;const f=fixture(async request=>{captured=request;calls++;return {requestId:request.requestId,decision:'trust-shell'};});
 assert.equal((await f.run('bash',{command:'printf one'})).isError,false);assert.equal((await f.run('bash',{command:'printf two'})).isError,false);assert.equal(calls,1);
 assert.equal((await f.run('write',{path:'.env',content:'BODY_CANARY'})).isError,true,'Shell trust cannot authorize a file trust decision');
 f.authority.revoke();await f.run('bash',{command:'printf three'});assert.equal(calls,3);
 const g=fixture(async()=>({requestId:captured!.requestId,decision:'allow-once'}));assert.equal((await g.run('bash',{command:'printf forged'})).isError,true);
 const h=fixture();assert.equal((await h.run('bash',{command:'printf separate'})).isError,true);
 const denied=fixture(async request=>({requestId:request.requestId,decision:'deny'}));const r=await denied.run('write',{path:'.env',content:'BODY_CANARY'});assert.match(JSON.stringify(r),/approval_denied/);assert.doesNotMatch(JSON.stringify(r),/BODY_CANARY/);
 let release!:(d:ApprovalDecision)=>void,request!:ApprovalRequest;const pending=fixture(async r=>{request=r;return new Promise(resolve=>{release=resolve;});});
 const abort=new AbortController();const result=pending.run('write',{path:'.env',content:'never'},abort.signal);await new Promise(resolve=>setImmediate(resolve));abort.abort();assert.equal((await result).isError,true);release({requestId:request.requestId,decision:'allow-once'});await new Promise(resolve=>setImmediate(resolve));assert.equal(fs.existsSync(join(pending.workspace,'.env')),false);
});
test('A-TARGET-CANCEL C-AUTH-03@1.1 unsupported links and pre-final-check swaps have no planned effect',async()=>{
 const f=fixture(allow);fs.writeFileSync(join(f.workspace,'original'),'sentinel');fs.symlinkSync('original',join(f.workspace,'link'));fs.linkSync(join(f.workspace,'original'),join(f.workspace,'hard'));fs.mkdirSync(join(f.workspace,'dir'));
 for(const path of ['link','original','hard','dir'])assert.match(JSON.stringify(await f.run('write',{path,content:'wrong'})),/unsupported_target/);
 fs.mkdirSync(join(f.workspace,'outside-parent'));fs.symlinkSync('outside-parent',join(f.workspace,'parent-link'));assert.match(JSON.stringify(await f.run('write',{path:'parent-link/new',content:'wrong'})),/unsupported_target/);
 let root='';const swap=fixture(async request=>{fs.renameSync(join(root,'parent'),join(root,'old-parent'));fs.mkdirSync(join(root,'parent'));return {requestId:request.requestId,decision:'allow-once'};},['parent']);root=swap.workspace;fs.mkdirSync(join(root,'parent'));
 const r=await swap.run('write',{path:'parent/new',content:'WRONG'});assert.match(JSON.stringify(r),/approval_invalidated/);assert.equal(fs.existsSync(join(root,'parent/new')),false);assert.equal(fs.existsSync(join(root,'old-parent/new')),false);
 const controller=new AbortController();controller.abort();assert.equal((await f.run('write',{path:'cancelled',content:'never'},controller.signal)).isError,true);assert.equal(fs.existsSync(join(f.workspace,'cancelled')),false);
});
test('A-TARGET-CANCEL C-AUTH-03@1.1 post-check replacement retained as partial-creation limitation',async()=>{
 const f=fixture();const parent=join(f.workspace,'parent');fs.mkdirSync(parent);
 const open=fs.openSync;let injected=false;
 fs.openSync=((path,...args)=>{if(path===join(parent,'new')&&!injected){injected=true;fs.renameSync(parent,join(f.workspace,'original-parent'));fs.mkdirSync(parent);}return open(path,...args);}) as typeof fs.openSync;syncBuiltinESMExports();
 try{const result=await f.run('write',{path:'parent/new',content:'MUST_NOT_WRITE'});assert.equal(result.isError,true);assert.match(JSON.stringify(result),/approval_invalidated/);assert.match(JSON.stringify(result),/"fileCreated":true/);assert.equal(fs.readFileSync(join(parent,'new'),'utf8'),'');assert.equal(fs.existsSync(join(f.workspace,'original-parent/new')),false);console.log('A-TARGET-CANCEL limitation: post-check replacement created empty file; content write refused; no rollback.');}
 finally{fs.openSync=open;syncBuiltinESMExports();}
});
test('A-TARGET-CANCEL C-AUTH-03@1.1 completed ancestor effects and opened-handle identity',async()=>{
 const f=fixture();const mkdir=fs.mkdirSync;let injected=false;
 fs.mkdirSync=((path,...args)=>{const result=mkdir(path,...args);if(path===join(f.workspace,'new')&&!injected){injected=true;fs.renameSync(f.workspace,join(f.root,'old-workspace'));mkdir(f.workspace);}return result;}) as typeof fs.mkdirSync;syncBuiltinESMExports();
 try{const result=await f.run('write',{path:'new/child/file',content:'never'});assert.equal(result.isError,true);assert.match(JSON.stringify(result),/directories/);assert.equal(fs.existsSync(join(f.root,'old-workspace/new')),true);assert.equal(fs.existsSync(join(f.workspace,'new/child/file')),false);console.log('A-TARGET-CANCEL partial ancestor creation retained and attributed.');}finally{fs.mkdirSync=mkdir;syncBuiltinESMExports();}
 const g=fixture();const path=join(g.workspace,'file');fs.writeFileSync(path,'original');const read=fs.readFileSync;
 fs.readFileSync=((p,...args)=>{const result=read(p,...args);if(typeof p==='number'){fs.renameSync(path,join(g.workspace,'renamed'));fs.writeFileSync(path,'replacement');}return result;}) as typeof fs.readFileSync;syncBuiltinESMExports();
 try{assert.equal((await g.run('edit',{path:'file',edits:[{oldText:'original',newText:'edited'}]})).isError,false);assert.equal(read(join(g.workspace,'renamed'),'utf8'),'edited');assert.equal(read(path,'utf8'),'replacement');}finally{fs.readFileSync=read;syncBuiltinESMExports();}
});
test('A-DISPLAY C-AUTH-04 approval defaults Deny; paste is inert, text escaped, draft and focus restored',async()=>{
 const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(){}}),output=Object.assign(new PassThrough(),{isTTY:true,columns:120,rows:40});
 let channel!:ApprovalChannel,cancelled=0;
 const controller=new AbortController();const session={setApprovalChannel(c:ApprovalChannel){channel=c;},cancel(){cancelled++;controller.abort();},contextMessageCount:0};
 const ui=new DailyWorkspace({input,output,session,workspace:'/private/tmp',presentation:createCompactPresentation(),model:'faux',provider:'faux'} as unknown as TuiOptions);
 assert.equal(ui.phase,'idle');ui.phase='running';ui.editor.text='multiline\ndraft';ui.editor.caret=4;ui.focus='transcript';
 const request:ApprovalRequest={requestId:'r',sessionId:'s',runId:'run',callId:'call',tool:'bash',workspace:'/private/tmp',policyRevision:'v',argumentsHash:'a',resourceIdentity:'i',reason:'shell_host_authority',target:'echo \x1b[2J\u202e'+('x'.repeat(400)),metadata:[]};
 const pending=channel(request,controller.signal);assert.equal(ui.approval?.choices[ui.approval.choice],'deny');assert.doesNotMatch(ui.overlay!.lines.join('\n'),/[\x1b\u202e]/);
 (ui as unknown as {data(v:string):void}).data('\x1b[200~\x1b[B\r\x1b[201~');assert.equal(ui.approval?.choice,0);assert.equal(ui.editor.text,'multiline\ndraft');
 output.columns=40;output.rows=12;ui.draw();ui.key('',{name:'pagedown'});ui.key('',{name:'return'});assert.equal((await pending).decision,'deny');assert.equal(ui.focus,'transcript');assert.equal(ui.editor.caret,4);assert.equal(cancelled,0);
 (ui as unknown as {data(v:string):void}).data('');const next=channel({...request,requestId:'next'},controller.signal);ui.key('',{ctrl:true,name:'c'});await next;assert.equal(cancelled,1);assert.equal(ui.editor.text,'multiline\ndraft');
});

test('A-TARGET-CANCEL C-AUTH-03 wrong opened existing object is never read or truncated',async()=>{
 const f=fixture(),path=join(f.workspace,'target');fs.writeFileSync(path,'ORIGINAL');const open=fs.openSync;let swapped=false;
 fs.openSync=((p,...args)=>{if(p===path&&!swapped){swapped=true;fs.renameSync(path,join(f.workspace,'old'));fs.writeFileSync(path,'REPLACEMENT');}return open(p,...args);}) as typeof fs.openSync;syncBuiltinESMExports();
 try{const result=await f.run('write',{path:'target',content:'BAD'});assert.equal(result.isError,true);assert.equal(fs.readFileSync(path,'utf8'),'REPLACEMENT');assert.equal(fs.readFileSync(join(f.workspace,'old'),'utf8'),'ORIGINAL');}finally{fs.openSync=open;syncBuiltinESMExports();}
});

test('A-ENTRY-AUDIT C-AUTH-05 actual Session no-channel, correlated audit, cancellation and sealed view identity',async()=>{
 const f=fixture();const store=await RunArchiveStore.open(join(f.root,'memory'));
 const identity={provider:{status:'reported' as const,value:'pan-faux'},model:{status:'reported' as const,value:'pan-faux-v1'},responseId:{status:'unavailable' as const}};
 const toolResponse={kind:'response' as const,message:{role:'assistant' as const,timestamp:0,content:[{type:'tool_call' as const,id:'c1',name:'write',arguments:{path:'.env',content:'AUDIT_BODY_CANARY'}}]},stopReason:'tool_calls' as const,usage:{status:'unavailable' as const},identity};
 const final={kind:'response' as const,message:{role:'assistant' as const,timestamp:0,content:[{type:'text' as const,text:'done'}]},stopReason:'stop' as const,usage:{status:'unavailable' as const},identity};
 const adapter=new FauxModelAdapter([toolResponse,final]);
 const session=new GeneralAgentSession({kernel:'native',adapter,tools:f.raw,systemPrompt:'offline',memory:{archiveStore:store,runbook:async()=>({content:'offline',revision:'sha256:'+'0'.repeat(64)})}});
 const result=await session.runTask('denied');assert.equal(result.toolCalls,1);assert.equal(fs.existsSync(join(f.workspace,'.env')),false);
 const records=await store.readArchive(result.runId);const settled=records.find(r=>r.type==='tool.settled')!;assert.equal(settled.toolCallId,'c1');assert.equal(settled.isError,true);assert.doesNotMatch(JSON.stringify(settled.details),/AUDIT_BODY_CANARY/);assert.match(JSON.stringify(settled.details),/approval_unavailable/);
 const before=JSON.stringify(records),view=createCompactPresentation();view.replay(records,result.runId);assert.equal(JSON.stringify(await store.readArchive(result.runId)),before);assert.equal(adapter.state.exchangeCount,2);await session.close();
 let request!:ApprovalRequest,release!:(d:ApprovalDecision)=>void;
 const pendingAdapter=new FauxModelAdapter([toolResponse]);const pendingSession=new GeneralAgentSession({kernel:'native',adapter:pendingAdapter,tools:f.raw,systemPrompt:'offline',memory:{archiveStore:store,runbook:async()=>({content:'offline',revision:'sha256:'+'0'.repeat(64)})},authorization:{approval:async r=>{request=r;return new Promise(resolve=>{release=resolve;});}}});
 const pending=pendingSession.runTask('pending');await assert.rejects(pendingSession.runTask('overlap'),/already running/);
 while(!request)await new Promise(resolve=>setImmediate(resolve));pendingSession.cancel();assert.equal((await pending).status,'cancelled');release({requestId:request.requestId,decision:'allow-once'});await pendingSession.close();assert.equal(fs.existsSync(join(f.workspace,'.env')),false);
});
