import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname } from 'node:path';
import { PassThrough } from 'node:stream';
import { SessionAuthorization, PathAssessment, protectedReason, type ApprovalChannel, type ApprovalRequest, type ApprovalDecision } from '../src/runtime/authorization.ts';
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
 const protectedPath=fs.existsSync(join(f.workspace,'.ENV'))?'.ENV':'.env';
 const read=fs.readFileSync,truncate=fs.ftruncateSync,write=fs.writeSync;const counts={reads:0,truncates:0,writes:0};
 fs.readFileSync=((...args)=>{counts.reads++;return read(...args);}) as typeof fs.readFileSync;
 fs.ftruncateSync=((...args)=>{counts.truncates++;return truncate(...args);}) as typeof fs.ftruncateSync;
 fs.writeSync=((...args)=>{counts.writes++;return Reflect.apply(write,fs,args);}) as typeof fs.writeSync;syncBuiltinESMExports();
 try{for(const [tool,args] of [['read',{path:protectedPath}],['write',{path:protectedPath,content:'BAD'}],['edit',{path:protectedPath,edits:[{oldText:'EXISTING',newText:'BAD'}]}]] as const)assert.equal((await f.run(tool,args)).isError,true);assert.deepEqual(counts,{reads:0,truncates:0,writes:0});console.log('A-POLICY denied content effects '+JSON.stringify(counts));}
 finally{fs.readFileSync=read;fs.ftruncateSync=truncate;fs.writeSync=write;syncBuiltinESMExports();}
 assert.equal(fs.readFileSync(join(f.workspace,'.env'),'utf8'),'EXISTING_SYNTHETIC_CANARY');
});
test('A-POLICY C-AUTH-01 ordinary operations, exact protected classes and settings fail closed',async()=>{
 const f=fixture();
 for(const name of ['a.txt','.env.example','.env.sample','.env.template','a.git/file','.ssh-lookalike/file']){fs.mkdirSync(dirname(join(f.workspace,name)),{recursive:true});fs.writeFileSync(join(f.workspace,name),'seed');const result=await f.run('write',{path:name,content:'ordinary'});assert.equal(result.isError,false,name);assert.equal(((result.details as JsonObject).authorization as JsonObject).decision,'automatic');}
 assert.equal((await f.run('read',{path:'a.txt'})).content[0]?.type,'text');
 assert.equal((await f.run('edit',{path:'a.txt',edits:[{oldText:'ordinary',newText:'edited'}]})).isError,false);
 assert.equal(fs.readFileSync(join(f.workspace,'a.txt'),'utf8'),'edited');
 for(const name of ['.git/config','.ssh/config','.pan-agent/settings','.env','.env.local','.env.example.more','.npmrc',join(f.root,'outside')]){
  const result=await f.run('write',{path:name,content:'BODY_CANARY'});assert.equal(result.isError,true,name);assert.match(JSON.stringify(result),/approval_unavailable/);assert.equal(fs.existsSync(join(f.workspace,name)),false);
 }
 assert.equal((await f.run('bash',{command:'printf hello'})).isError,true);
 assert.equal((await f.run('write',{path:'bad',content:7})).isError,true);assert.equal(fs.existsSync(join(f.workspace,'bad')),false);
 assert.equal(protectedReason(f.workspace,join(f.workspace,'extra/a'),['extra']),'configured_protected_path');
 assert.equal(protectedReason(f.workspace,join(f.workspace,'extra-like/a'),['extra']),'resource_equivalence_uncertain');
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
 const f=fixture(allow);const parent=join(f.workspace,'parent');fs.mkdirSync(parent);
 const open=fs.openSync;let injected=false;
 fs.openSync=((path,...args)=>{if(path===join(parent,'new')&&!injected){injected=true;fs.renameSync(parent,join(f.workspace,'original-parent'));fs.mkdirSync(parent);}return open(path,...args);}) as typeof fs.openSync;syncBuiltinESMExports();
 try{const result=await f.run('write',{path:'parent/new',content:'MUST_NOT_WRITE'});assert.equal(result.isError,true);assert.match(JSON.stringify(result),/approval_invalidated/);assert.match(JSON.stringify(result),/"fileCreated":true/);assert.equal(fs.readFileSync(join(parent,'new'),'utf8'),'');assert.equal(fs.existsSync(join(f.workspace,'original-parent/new')),false);console.log('A-TARGET-CANCEL limitation: post-check replacement created empty file; content write refused; no rollback.');}
 finally{fs.openSync=open;syncBuiltinESMExports();}
});
test('A-TARGET-CANCEL C-AUTH-03@1.1 completed ancestor effects and opened-handle identity',async()=>{
 const f=fixture(allow);const mkdir=fs.mkdirSync;let injected=false;
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


test('A-POLICY R49-01 resource aliases cannot bypass built-in or configured protection',async()=>{
 const f=fixture(undefined,['Secret']);
 fs.writeFileSync(join(f.workspace,'.env'),'SYNTHETIC_ALIAS_CANARY');
 fs.mkdirSync(join(f.workspace,'Secret'));fs.writeFileSync(join(f.workspace,'Secret/data'),'ORIGINAL');
 const insensitive=fs.existsSync(join(f.workspace,'.ENV'));
 console.log('R49-01 case-insensitive filesystem: '+insensitive);
 if(insensitive){
  assert.equal(fs.statSync(join(f.workspace,'.env')).ino,fs.statSync(join(f.workspace,'.ENV')).ino);
  for(const [tool,args] of [['read',{path:'.ENV'}],['write',{path:'secret/data',content:'BAD'}],['write',{path:'secret/new',content:'BAD'}],['edit',{path:'secret/data',edits:[{oldText:'ORIGINAL',newText:'BAD'}]}]] as const){
   const result=await f.run(tool,args);assert.equal(result.isError,true,JSON.stringify(args));assert.match(JSON.stringify(result),/approval_unavailable/);
  }
  assert.equal(fs.readFileSync(join(f.workspace,'Secret/data'),'utf8'),'ORIGINAL');assert.equal(fs.existsSync(join(f.workspace,'Secret/new')),false);
 }
});


test('A-POLICY R49-01 aliases, missing descendants, exact exceptions and controls',async()=>{
 const f=fixture(undefined,['Secret','Future/Private','.env.example','Café']);
 fs.mkdirSync(join(f.workspace,'Secret'));fs.mkdirSync(join(f.workspace,'Café'));
 fs.writeFileSync(join(f.workspace,'.env'),'SYNTHETIC');
 const insensitive=fs.existsSync(join(f.workspace,'.ENV'));
 if(insensitive){
  for(const path of ['SECRET/deep/new','future/private/new','cafe\u0301/new','.ENV.new','.GIT/new','.SSH/new','.PAN-AGENT/new','.NPMRC','.ENV.EXAMPLE']){
   const result=await f.run('write',{path,content:'BAD'});assert.equal(result.isError,true,path);assert.match(JSON.stringify(result),/approval_unavailable/);assert.equal(fs.existsSync(join(f.workspace,path)),false,path);
  }
  assert.equal((await f.run('write',{path:'.ENV.EXAMPLE',content:'BAD'})).isError,true);
  for(const path of ['Secret-lookalike/new','ordinary/new','.env.sample','.env.template']){const r=await f.run('write',{path,content:'OK'});assert.equal(r.isError,true,path);assert.match(JSON.stringify(r),/resource_equivalence_uncertain/);}
  let calls=0;const g=fixture(async request=>{calls++;return allow(request,new AbortController().signal);},['Secret']);
  fs.mkdirSync(join(g.workspace,'Secret'));fs.writeFileSync(join(g.workspace,'.env'),'SYNTHETIC');
  assert.equal((await g.run('read',{path:'.ENV'})).isError,false);
  assert.equal((await g.run('write',{path:'secret/new',content:'ALLOWED'})).isError,false);assert.equal(calls,2);
  const raw=f.raw.find(t=>t.name==='read')!;assert.equal((await raw.execute({toolCallId:'raw-alias',arguments:{path:'.ENV'},signal:new AbortController().signal})).isError,true);
 }else{
  fs.mkdirSync(join(f.workspace,'secret'));fs.writeFileSync(join(f.workspace,'.ENV'),'DISTINCT');
  assert.equal((await f.run('read',{path:'.ENV'})).isError,false);
  fs.writeFileSync(join(f.workspace,'secret/new'),'seed');assert.equal((await f.run('write',{path:'secret/new',content:'DISTINCT'})).isError,false);
 }
});


test('C-AUTH-01@1.2 R49-02 existing Unicode aliases and absent aliases require approval',async()=>{
 const f=fixture(undefined,['Secrets']);fs.mkdirSync(join(f.workspace,'.ssh'));fs.writeFileSync(join(f.workspace,'.ssh/data'),'SYNTHETIC');
 for(const path of ['.ſſh/data','.sſh/data']){assert.equal(fs.statSync(join(f.workspace,path)).ino,fs.statSync(join(f.workspace,'.ssh/data')).ino);assert.equal((await f.run('read',{path})).isError,true,path);}
 for(const path of ['ſecrets/file','Secrets/file','ordinary-new/file']){const r=await f.run('write',{path,content:'DENIED'});assert.equal(r.isError,true,path);assert.match(JSON.stringify(r),/approval_unavailable/);assert.equal(fs.existsSync(join(f.workspace,path)),false);}
});


test('C-AUTH-01@1.2 uncertainty is symmetric, approved once, and supported ordinary remains automatic',async()=>{
 for(const [configured,request] of [['Secrets','ſecrets/file'],['ſecrets','Secrets/file'],['Σ','ς/file'],['ss','ß/file'],['Café','Cafe\u0301/file']]){
  const f=fixture(undefined,[configured!]);const result=await f.run('write',{path:request!,content:'NO'});
  assert.equal(result.isError,true);assert.equal(((result.details as JsonObject).authorization as JsonObject).classification,'uncertain');assert.equal(fs.existsSync(join(f.workspace,request!)),false);
 }
 let calls=0;const f=fixture(async request=>{calls++;assert.equal(request.reason,'resource_equivalence_uncertain');assert.match(request.metadata.join(' '),/has not been established as ordinary/);return {requestId:request.requestId,decision:'allow-once'};});
 const created=await f.run('write',{path:'new/deep/file',content:'ALLOWED'});assert.equal(created.isError,false,JSON.stringify(created));assert.equal(calls,1);assert.equal(fs.readFileSync(join(f.workspace,'new/deep/file'),'utf8'),'ALLOWED');
 const ordinary=await f.run('write',{path:'new/deep/file',content:'EXISTING'});assert.equal(ordinary.isError,false);assert.equal(calls,1);assert.equal(((ordinary.details as JsonObject).authorization as JsonObject).decision,'automatic');
 const evidence=new PathAssessment(f.workspace,join(f.workspace,'new/deep/file'),[]);assert.equal(evidence.reason,undefined);assert(evidence.comparisons.every(c=>c.outcome!=='unknown'));assert(evidence.comparisons.some(c=>c.basis==='existing_resource_negative_lookup'));
 fs.mkdirSync(join(f.workspace,'Protected'));const distinct=new PathAssessment(f.workspace,join(f.workspace,'new/deep/file'),['Protected']);assert.equal(distinct.reason,undefined);assert(distinct.comparisons.some(c=>c.basis==='existing_device_inode'&&c.outcome==='different'));
 const missing=new PathAssessment(f.workspace,join(f.workspace,'new/deep/file'),['Absent']);assert.equal(missing.reason,'resource_equivalence_uncertain');
 const known=new PathAssessment(f.workspace,join(f.workspace,'.ssh/new'),['Absent']);assert.equal(known.reason,'protected_path','known match precedes unknown');
});

test('C-AUTH-01/05@1.2 unknown no-channel and denial have zero content or creation effects',async()=>{
 const f=fixture();fs.writeFileSync(join(f.workspace,'résumé'),'SYNTHETIC');
 const read=fs.readFileSync,write=fs.writeSync,truncate=fs.ftruncateSync,mkdir=fs.mkdirSync,open=fs.openSync;
 const counts={reads:0,writes:0,truncates:0,mkdirs:0,creates:0};
 fs.readFileSync=((...a)=>{counts.reads++;return read(...a);}) as typeof read;
 fs.writeSync=((...a)=>{counts.writes++;return Reflect.apply(write,fs,a);}) as typeof write;
 fs.ftruncateSync=((...a)=>{counts.truncates++;return truncate(...a);}) as typeof truncate;
 fs.mkdirSync=((...a)=>{counts.mkdirs++;return Reflect.apply(mkdir,fs,a);}) as typeof mkdir;
 fs.openSync=((path,flags,...a)=>{if(typeof flags==='number'&&(flags&fs.constants.O_CREAT))counts.creates++;return open(path,flags,...a);}) as typeof open;syncBuiltinESMExports();
 try{
  for(const approval of [undefined,async (r:ApprovalRequest)=>({requestId:r.requestId,decision:'deny' as const})]){
   f.authority.setChannel(approval);
   for(const [tool,args] of [['read',{path:'résumé'}],['write',{path:'new/sub/file',content:'RAW_BODY'}],['edit',{path:'résumé',edits:[{oldText:'SYNTHETIC',newText:'RAW_BODY'}]}]] as const){const result=await f.run(tool,args);assert.equal(result.isError,true);assert.match(JSON.stringify(result),/resource_equivalence_uncertain/);assert.doesNotMatch(JSON.stringify(result),/RAW_BODY/);}
  }
  assert.deepEqual(counts,{reads:0,writes:0,truncates:0,mkdirs:0,creates:0});console.log('Criteria1.2 uncertain denied effects '+JSON.stringify(counts));
 }finally{fs.readFileSync=read;fs.writeSync=write;fs.ftruncateSync=truncate;fs.mkdirSync=mkdir;fs.openSync=open;syncBuiltinESMExports();}
 assert.equal(fs.existsSync(join(f.workspace,'new')),false);
});

test('C-AUTH-02/03@1.2 configured-anchor changes and target failures invalidate approvals',async()=>{
 let workspace='';const f=fixture(async r=>{fs.renameSync(join(workspace,'Protected'),join(workspace,'Old'));fs.mkdirSync(join(workspace,'Protected'));return {requestId:r.requestId,decision:'allow-once'};},['Protected']);workspace=f.workspace;fs.mkdirSync(join(workspace,'Protected'));
 const result=await f.run('write',{path:'new/file',content:'NO'});assert.match(JSON.stringify(result),/approval_invalidated/);assert.equal(fs.existsSync(join(workspace,'new')),false);
 let gWorkspace='';const g=fixture(async r=>{fs.mkdirSync(join(gWorkspace,'Future'));return {requestId:r.requestId,decision:'allow-once'};},['Future']);gWorkspace=g.workspace;
 assert.match(JSON.stringify(await g.run('write',{path:'ordinary-new',content:'NO'})),/approval_invalidated/);assert.equal(fs.existsSync(join(gWorkspace,'ordinary-new')),false);
 let calls=0;const bad=fixture(async r=>{calls++;return allow(r,new AbortController().signal);});fs.symlinkSync('absent',join(bad.workspace,'link'));
 assert.match(JSON.stringify(await bad.run('write',{path:'link/file',content:'NO'})),/unsupported_target/);assert.equal(calls,0);
 const lstat=fs.lstatSync;Object.defineProperty(fs,'lstatSync',{value:((p,...a)=>{if(p===join(bad.workspace,'unreadable'))throw Object.assign(Error('synthetic permission'),{code:'EACCES'});return Reflect.apply(lstat,fs,[p,...a]);}) as typeof lstat});syncBuiltinESMExports();
 try{assert.match(JSON.stringify(await bad.run('write',{path:'unreadable',content:'NO'})),/unsupported_target/);assert.equal(calls,0);}finally{Object.defineProperty(fs,'lstatSync',{value:lstat});syncBuiltinESMExports();}
});

test('C-AUTH-01@1.2 exact exceptions cannot override protected ancestry, stored aliases or configuration',async()=>{
 const f=fixture();for(const name of ['.env.example','.env.sample','.env.template']){fs.writeFileSync(join(f.workspace,name),'EXCEPTION');assert.equal((await f.run('read',{path:name})).isError,false);}
 fs.mkdirSync(join(f.workspace,'.ssh'));fs.writeFileSync(join(f.workspace,'.ssh/.env.example'),'PROTECTED');assert.equal((await f.run('read',{path:'.ſſh/.env.example'})).isError,true);
 const g=fixture(undefined,['.env.sample']);fs.writeFileSync(join(g.workspace,'.env.sample'),'CONFIGURED');assert.equal((await g.run('read',{path:'.env.sample'})).isError,true);
 const h=fixture();fs.writeFileSync(join(h.workspace,'.env.EXAMPLE'),'STORED_PROTECTED');assert.equal((await h.run('read',{path:'.env.example'})).isError,true);
 const q=fixture(undefined,['Future']);fs.writeFileSync(join(q.workspace,'.env.template'),'EXCEPTION');assert.match(JSON.stringify(await q.run('read',{path:'.env.template'})),/resource_equivalence_uncertain/);
});

test('C-AUTH-02/05@1.2 uncertain cancellation settles and late approval is inert',async()=>{
 let release!:(d:ApprovalDecision)=>void,request!:ApprovalRequest;const f=fixture(async r=>{request=r;return new Promise(resolve=>{release=resolve;});});
 const abort=new AbortController();const pending=f.run('write',{path:'new/deep/file',content:'NO'},abort.signal);await new Promise(resolve=>setImmediate(resolve));assert.equal(request.reason,'resource_equivalence_uncertain');abort.abort();assert.match(JSON.stringify(await pending),/approval_invalidated/);release({requestId:request.requestId,decision:'allow-once'});await new Promise(resolve=>setImmediate(resolve));assert.equal(fs.existsSync(join(f.workspace,'new')),false);
});

test('C-AUTH-01@1.2 filesystem identity distinguishes aliases from ordinary distinct controls',async()=>{
 for(const [configured,requested] of [['Secrets','ſecrets'],['Σ','ς'],['ff','ﬀ'],['ss','ß'],['Secrets','Ｓecrets'],['i','ı'],['resume','résumé'],['Café','Cafe\u0301']]){
  const f=fixture(undefined,[configured!]);fs.mkdirSync(join(f.workspace,configured!));
  if(!fs.existsSync(join(f.workspace,requested!)))fs.mkdirSync(join(f.workspace,requested!));
  const same=fs.statSync(join(f.workspace,configured!)).ino===fs.statSync(join(f.workspace,requested!)).ino;
  fs.writeFileSync(join(f.workspace,requested!,'file'),'SYNTHETIC');
  const r=await f.run('read',{path:requested!+'/file'});assert.equal(!!r.isError,same,configured+' / '+requested);
  assert.equal(((r.details as JsonObject).authorization as JsonObject).decision,same?'approval_unavailable':'automatic');
 }
});
