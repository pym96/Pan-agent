/** Installed public CLI composition, actual kernel/archives/TUI and owned fixtures. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const [pkg, destination] = process.argv.slice(2);
const root = path.resolve(destination);
fs.mkdirSync(root, {mode:0o700});
const installed = relative => pathToFileURL(path.resolve(pkg, relative));
const {runCli, runTui, parseCliArgs, FauxModelAdapter, savePanSettings} = await import(installed('dist/index.js'));
const platform = process.platform === 'darwin' ? 'macos' : 'linux';
const identity = {provider:{status:'reported',value:'faux'}, model:{status:'reported',value:'faux'}, responseId:{status:'unavailable'}};
const response = (content, stopReason) => ({kind:'response',message:{role:'assistant',timestamp:0,content},stopReason,usage:{status:'unavailable'},identity});
const call = (id,name,args) => response([{type:'tool_call',id,name,arguments:args}], 'tool_calls');
const done = response([{type:'text',text:'Fixture finished'}], 'stop');
const write = (id, file, content) => call(id,'write',{path:file,content});
const put = (file, data) => fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
function paths(label) {
 const base = path.join(root,label), workspace=path.join(base,'workspace'), home=path.join(base,'home'), archives=path.join(base,'archives');
 fs.mkdirSync(base); fs.mkdirSync(home); fs.mkdirSync(workspace);
 return {base,workspace,home,archives,args:['--kernel','native','--workspace',workspace,'--memory-root',archives]};
}
function terminal() {
 const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(v){this.isRaw=v;}});
 const output=Object.assign(new PassThrough(),{isTTY:true,columns:180,rows:45});
 let transcript='',frame='';
 output.on('data',chunk=>{frame=String(chunk); transcript+=frame;});
 const wait=async predicate=>{for(let i=0;i<600;i++){if(predicate(frame))return;await delay(20);}throw Error('TTY wait timed out: '+frame.slice(0,900));};
 return {input,output,wait,send(text){input.write(text);},log(){return transcript;}};
}
const settings = {schemaVersion:1,provider:'deepseek',modelId:'deepseek-v4-flash',thinkingLevel:'high',credentialSource:'environment'};
async function automation(auto) {
 const target=paths(auto?'session-auto':'normal');
 await savePanSettings({...settings,permissions:{deny:['edit']}},target.home);
 fs.writeFileSync(path.join(target.workspace,'existing.txt'),'old');
 const model = new FauxModelAdapter([write('new','notes.txt','actual content'),call('read','read',{path:'notes.txt'}),
  call('denied','edit',{path:'existing.txt',edits:[{oldText:'old',newText:'forbidden'}]}),call('sensitive','read',{path:'.env'}),done]);
 const term=terminal();
 let store;
 const running=runCli([...target.args,...(auto?['--session-auto']:[])],{
  home:target.home,input:term.input,output:term.output,createNativeAdapter:()=>model,
  startTui:options=>{
   assert.equal(options.executionMode,'native-'+platform+'-public');
   store=options.archiveStore;return runTui(options);
  }});
 try {
  await term.wait(f=>f.includes('Write a task')&&f.includes('Native GET'));
  assert.equal(term.log().includes('SESSION AUTO'),auto);
  term.send('Create an ordinary local document and exercise configured restrictions\r');
  if (!auto) {
   await term.wait(f=>f.includes('Approval required')&&f.includes('notes.txt'));
   assert.equal(fs.existsSync(path.join(target.workspace,'notes.txt')),false);
   term.send('\x1b[B\r');
  }
  await term.wait(f=>f.includes('Fixture finished')&&f.includes('· idle ·'));
  assert.equal(term.log().includes('Approval required'),!auto);
  const runs=await store.listRuns();assert.equal(runs.length,1);
  const records=await store.readArchive(runs[0].runId);put(path.join(target.base,'archive.json'),records);
  const boundary=records.find(e=>e.type==='execution.boundary');
  assert.equal(boundary.sessionAutomation,auto);assert.match(boundary.policyHash,/^[a-f0-9]{64}$/);
  const tool=id=>records.find(e=>e.type==='tool.settled'&&e.toolCallId===id);
  assert.equal(tool('new').isError,false,tool('new').text);
  assert.equal(tool('new').details.authorization.decision,auto?'session-auto-new-document':'allow-once');
  assert.equal(tool('read').text,'actual content');assert.equal(tool('denied').details.code,'permission_denied');assert.equal(tool('sensitive').isError,true);
  assert.equal(fs.readFileSync(path.join(target.workspace,'notes.txt'),'utf8'),'actual content');
  assert.equal(fs.readFileSync(path.join(target.workspace,'existing.txt'),'utf8'),'old');
  term.send(':exit\r');assert.equal(await running,0);
 } finally {term.input.end();await running;fs.writeFileSync(path.join(target.base,'tui.stdout'),term.log());term.input.destroy();term.output.destroy();}
}
await automation(true);
await automation(false);

// Real npm, a lifecycle script and its Node child. Only the model and terminal input are synthetic.
const npmTarget=paths('npm-test');
const marker=path.join(npmTarget.workspace,'runs.txt');
fs.writeFileSync(path.join(npmTarget.workspace,'package.json'),JSON.stringify({
 name:'pan-test-fixture',version:'1.0.0',scripts:{test:'node check.cjs',build:'node task.cjs build',report:'node task.cjs report'}
}));
fs.writeFileSync(path.join(npmTarget.workspace,'private.txt'),'synthetic fixture');
fs.writeFileSync(path.join(npmTarget.workspace,'check.cjs'),`
const fs=require('node:fs');
try { fs.readFileSync('private.txt'); process.exit(41); }
catch (e) { if (!['EACCES','EPERM','ENOENT'].includes(e.code)) throw e; }
fs.appendFileSync('runs.txt','ran\\n');
console.log('PAN_NPM_EXECUTED');
if (fs.existsSync('fail')) { console.error('PAN_NPM_FAILED'); process.exit(23); }
`);
fs.writeFileSync(path.join(npmTarget.workspace,'task.cjs'),`
const fs = require('node:fs');
const task = process.argv[2];
fs.appendFileSync('tasks.log', task + '\\n');
console.log('TASK_OUTPUT ' + task);
if (fs.existsSync('fail-' + task)) { console.error('TASK_FAILURE ' + task); process.exit(29); }
`);
const runNpm=(id,command='npm test')=>call(id,'bash',{command});
async function npmSession(label, flags, replies, interaction, sharedArchive) {
 const term=terminal();
 const model=new FauxModelAdapter(replies);
 let store;
 const archive=sharedArchive ?? path.join(npmTarget.base,label+'-archives');
 let before;
 const running=runCli(['--kernel','native','--workspace',npmTarget.workspace,'--memory-root',archive,'--native-sandbox','--native-offline',...flags],{
  home:npmTarget.home,input:term.input,output:term.output,createNativeAdapter:()=>model,
  startTui:async opts=>{store=opts.archiveStore;before=new Set((await store.listRuns()).map(r=>r.runId));return runTui(opts);}
 });
 try {
  await term.wait(f=>f.includes('Write a task'));
  assert.equal(term.log().includes('NPM TEST'),flags.includes('--session-npm-test'));
  await interaction(term);
  await term.wait(f=>f.includes('Fixture finished')&&f.includes('· idle ·'));
  const fresh=(await store.listRuns()).filter(r=>!before.has(r.runId));
  assert.equal(fresh.length,1);
  const records=await store.readArchive(fresh[0].runId);
  put(path.join(npmTarget.base,label+'.json'),records);
  term.send(':exit\r');assert.equal(await running,0);
  return records;
 } finally {
  fs.writeFileSync(path.join(npmTarget.base,label+'.tui'),term.log());
  term.input.end();term.output.destroy();
 }
}
const npmSettings={...settings,protectedPaths:['private.txt']};
await savePanSettings(npmSettings,npmTarget.home);
const submit=term=>term.send('Run the fixture tests\r');
const settled=(records,id)=>records.find(e=>e.type==='tool.settled'&&e.toolCallId===id);
const verifyNpm=(record,code)=>{
 assert.equal(record.details.authorization.decision,'session-npm-test');
 assert.equal(record.details.backend,platform==='macos'?'seatbelt':'bubblewrap-fuse');
 assert.equal(record.details.network,'denied');
 assert.equal(record.details.exitCode,code,record.text);
 assert.equal(record.isError,code!==0);
 assert.match(record.details.stdout,/PAN_NPM_EXECUTED/);
};
const npmFlag=['--session-npm-test'];
const positive=await npmSession('twice',npmFlag,[runNpm('first'),runNpm('second'),done],submit);
verifyNpm(settled(positive,'first'),0);
verifyNpm(settled(positive,'second'),0);
assert.equal(fs.readFileSync(marker,'utf8'),'ran\nran\n');
fs.writeFileSync(path.join(npmTarget.workspace,'fail'),'');
const failed=await npmSession('failure',npmFlag,[runNpm('test-fail'),done],submit);
verifyNpm(settled(failed,'test-fail'),23);
assert.match(settled(failed,'test-fail').details.stderr,/PAN_NPM_FAILED/);
for(const [label,flags,command] of [
 ['expired',[],'npm test'],['other',npmFlag,'npm test && touch unexpected']
]){
 const records=await npmSession(label,flags,[runNpm(label,command),done],async term=>{
  submit(term);await term.wait(f=>f.includes('Approval required'));term.send('\r');
 });
 assert.equal(settled(records,label).details.code,'approval_denied');
}
await savePanSettings({...npmSettings,permissions:{deny:['bash(npm test)']}},npmTarget.home);
const denied=await npmSession('denied',npmFlag,[runNpm('deny'),done],submit);
assert.equal(settled(denied,'deny').details.code,'permission_denied');
assert.equal(fs.readFileSync(marker,'utf8'),'ran\nran\nran\n');
assert.equal(fs.existsSync(path.join(npmTarget.workspace,'unexpected')),false);

// Session-scoped task selection runs exact project scripts and records the requested grant.
const commonArchive=path.join(npmTarget.base,'selected-task-archives');
const selectedFlags=['--session-tasks','report,build'];
const selectedSession=(id,flags,replies,action=submit)=>npmSession(id,flags,[...replies,done],action,commonArchive);
const denyPrompt=async term=>{
 submit(term);
 await term.wait(frame=>frame.includes('Approval required'));
 term.send('\r');
};
await savePanSettings(npmSettings,npmTarget.home);
const selected=await selectedSession('selected',selectedFlags,[
 runNpm('build1','npm run build'),runNpm('report','npm run report'),runNpm('build2','npm run build'),
],term=>{
 assert.ok(term.log().includes('NPM TASKS: build,report'));
 submit(term);
});
assert.deepEqual(selected.find(e=>e.type==='execution.boundary').sessionTasks,['build','report']);
for (const [id,task] of [['build1','build'],['report','report'],['build2','build']]) {
 const result=settled(selected,id);
 assert.equal(result.details.authorization.decision,'session-task');
 assert.equal(result.details.authorization.task,task);
 assert.equal(result.details.exitCode,0,result.text);
 assert.equal(result.details.backend,platform==='macos'?'seatbelt':'bubblewrap-fuse');
 assert.ok(result.details.stdout.includes('TASK_OUTPUT '+task));
}
fs.writeFileSync(path.join(npmTarget.workspace,'fail-report'),'');
const failure=settled(await selectedSession('selected-failure',selectedFlags,[runNpm('report','npm run report')]),'report');
assert.equal(failure.details.exitCode,29,failure.text);
assert.equal(failure.isError,true);
assert.match(failure.details.stderr,/TASK_FAILURE report/);
for(const [id,flags,command] of [
 ['unselected',selectedFlags,'npm test'],['near-match',selectedFlags,'npm run build -- --verbose'],
 ['fresh-session',[],'npm run build'],
]) {
 const result=settled(await selectedSession(id,flags,[runNpm(id,command)],denyPrompt),id);
 assert.equal(result.details.code,'approval_denied');
}
await savePanSettings({...npmSettings,permissions:{deny:['bash(npm run build)']}},npmTarget.home);
const blocked=settled(await selectedSession('selected-deny',selectedFlags,[runNpm('build','npm run build')]),'build');
assert.equal(blocked.details.code,'permission_denied');
assert.equal(fs.readFileSync(path.join(npmTarget.workspace,'tasks.log'),'utf8'),'build\nreport\nbuild\nreport\n');
assert.equal(fs.readFileSync(marker,'utf8'),'ran\nran\nran\n');

await savePanSettings(npmSettings,npmTarget.home);
const originalProject=path.join(npmTarget.base,'original-project');
const replaced=await selectedSession('selected-replaced',selectedFlags,[runNpm('build','npm run build')],term=>{
 fs.renameSync(npmTarget.workspace,originalProject);
 fs.mkdirSync(npmTarget.workspace);
 put(path.join(npmTarget.workspace,'package.json'),{scripts:{build:'touch replacement-marker'}});
 submit(term);
});
assert.equal(settled(replaced,'build').details.code,'approval_invalidated');
assert.equal(fs.existsSync(path.join(npmTarget.workspace,'replacement-marker')),false);

const cliArgs=['--kernel','native','--session-tasks'];
for(const value of ['', 'test,', 'BUILD','install','build,build','report,unknown','toString']) {
 assert.throws(()=>parseCliArgs([...cliArgs,value]),/--session-tasks/);
}
for(const other of [['--trusted-local'],['--sandbox-root','/tmp/owned'],['--native-sandbox','--native-grant','http://127.0.0.1:8080'],['--session-npm-test']]) {
 assert.throws(()=>parseCliArgs([...cliArgs,'build',...other]));
}

// With an actual admitted native task, a result observed before provider failure remains durable.
{
 const target=paths('partial');
 fs.writeFileSync(path.join(target.workspace,'existing.txt'),'before');
 const model=new FauxModelAdapter([write('already-written','existing.txt','after')]);
 const term=terminal();
 await runCli(target.args,{home:target.home,input:term.input,output:term.output,createNativeAdapter:()=>model,
  startTui:async options=>{
   try {
    const run=await options.session.runTask('Make the owned edit');
    assert.notEqual(run.status,'completed');assert.equal(run.toolCalls,1);
    assert.equal(fs.readFileSync(path.join(target.workspace,'existing.txt'),'utf8'),'after');
    assert.match(options.fallback.choose('task'),/denied/);
    const records=await options.archiveStore.readArchive(run.runId);
    assert.equal(records.filter(e=>e.type==='tool.settled'&&!e.isError).length,1);
    put(path.join(target.base,'archive.json'),records);
   } finally {await options.session.close();}return 0;
  }});
 term.input.destroy();term.output.destroy();
}
const nativeModule=await import(installed('dist/sandbox/native/'+platform+'.js'));
const Native=platform==='macos'?nativeModule.NativeMacSandbox:nativeModule.NativeLinuxSandbox;
const originalStart=Native.prototype.start;
Native.prototype.start=async function(){throw Error('native_sandbox_setup_failed: owned prerequisite failure before task execution');};
try {
 for(const scope of ['once','task']){
  const target=paths(scope);
  await savePanSettings({...settings,permissions:{deny:['bash(*forbidden*)']}},target.home);
  const term=terminal();
  const reportLog=path.join(target.base,'report-peer.jsonl');
  put(path.join(target.home,'.pan-agent','mcp-reports.json'), {servers:[{name:'reports',command:process.execPath,
   args:[fileURLToPath(new URL('./mcp-report-peer.mjs',import.meta.url)),'ok',reportLog],tools:['summary']}]});
  const script=[call('fallback-report','mcp_report',{}),write('first','first.txt','yes'),write('second','second.txt','two'),
    write('declined','declined.txt','requires separate approval'),call('denied','bash',{command:'forbidden'}),call('pwd','bash',{command:'pwd'}),
    call('outside','read',{path:'../home/nope'}),done];
  const model=new FauxModelAdapter(script);
  let store;
  const running=runCli([...target.args,'--mcp-report','reports','summary'],{home:target.home,input:term.input,output:term.output,createNativeAdapter:()=>model,
   startTui:async options=>{store=options.archiveStore;return runTui(options);}});
  const idle=async text=>{await term.wait(f=>f.includes('· idle ·')&&f.includes(text));};
  const submit=async text=>{term.send(text+'\r');await delay(40);};
  try {
   await idle('Write a task');
   await submit('Run the owned task');
   await idle('Choose :fallback cancel');
   assert.deepEqual(fs.readdirSync(target.workspace),[]);assert.equal(model.state.exchangeCount,0);
   await submit(':fallback '+scope);
   await term.wait(f=>f.includes('each action requires approval'));
   term.send('\x07');await delay(40);await submit('Fresh task');
   const expectedCalls=scope==='once'?['first.txt']:['first.txt','second.txt','declined.txt','pwd'];
   for(const targetName of expectedCalls){
    await term.wait(f=>f.includes('Approval required')&&f.includes(targetName));
    assert.ok(!term.log().includes('Trust shell for this session'));
    term.send(targetName==='declined.txt'?'\r':'\x1b[B\r');await delay(50);
   }
   await idle('Fixture finished');
   assert.equal(fs.readFileSync(path.join(target.workspace,'first.txt'),'utf8'),'yes');
   assert.equal(fs.existsSync(path.join(target.workspace,'second.txt')),scope==='task');
   const runs=await store.listRuns();
   let activeArchive;
   for(const {runId} of runs){
    const records=await store.readArchive(runId);
    if(records.some(r=>r.type==='execution.boundary'))activeArchive=records;
   }
   put(path.join(target.base,'host-archive.json'),activeArchive);
   const tool=id=>activeArchive.find(e=>e.type==='tool.settled'&&e.toolCallId===id);
   assert.equal(tool('fallback-report').details.code,'mcp_disabled_in_host_fallback');
   const reportEvents=fs.readFileSync(reportLog,'utf8').trim().split('\n').map(line=>JSON.parse(line));
   assert.equal(reportEvents.filter(e=>e.pid).length,1);
   assert.equal(reportEvents.filter(e=>e.fromClient&&JSON.parse(e.fromClient).method==='tools/call').length,0);
   assert.equal(tool('first').details.authorization.decision,'allow-once');assert.equal(tool('first').details.boundary.scope,scope);
   assert.equal(tool('second').isError,scope==='once');
   assert.equal(tool('declined').isError,true);assert.equal(fs.existsSync(path.join(target.workspace,'declined.txt')),false);
   if(scope==='task')assert.equal(tool('declined').details.code,'approval_denied');
   assert.equal(tool('denied').details.code,'permission_denied');
   if(scope==='task')assert.equal(tool('pwd').text,target.workspace);
   assert.equal(tool('outside').isError,true);
   const count=model.state.exchangeCount;
   await submit('Verify task-scoped expiry');await idle('Choose :fallback cancel');assert.equal(model.state.exchangeCount,count);
   await submit(':fallback cancel');await term.wait(f=>f.includes('Fallback cancelled'));term.send('\x07');await delay(40);
   await submit(':fallback task');await term.wait(f=>f.includes('Fallback denied'));term.send('\x07');await delay(40);
   await submit(':exit');assert.equal(await running,0);
  } finally {term.input.end();await running;fs.writeFileSync(path.join(target.base,'tui.stdout'),term.log());term.input.destroy();term.output.destroy();}
 }
 const opted=paths('selected-unavailable'), optedModel=new FauxModelAdapter([]), optedTty=terminal();
 await runCli([...opted.args,'--session-tasks','build,report'],{
  home:opted.home,input:optedTty.input,output:optedTty.output,createNativeAdapter:()=>optedModel,
  startTui:async options=>{
   try {
    await assert.rejects(options.session.runTask('Run the workspace build'),/owned prerequisite failure/);
    assert.match(options.fallback.choose('task'),/denied/);
    assert.deepEqual(fs.readdirSync(opted.workspace),[]);
    assert.equal(optedModel.state.exchangeCount,0);
   } finally {await options.session.close();}
   return 0;
  }
 });
 optedTty.input.destroy();optedTty.output.destroy();
 const target=paths('noninteractive'),model=new FauxModelAdapter([]);
 await runCli(target.args,{home:target.home,output:new PassThrough(),createNativeAdapter:()=>model,startTui:async options=>{
  try{await assert.rejects(options.session.runTask('no terminal'),/owned prerequisite failure/);
   assert.match(options.fallback.choose('once'),/denied/);
   assert.deepEqual(fs.readdirSync(target.workspace),[]);assert.equal(model.state.exchangeCount,0);
  }finally{await options.session.close();}return 0;
 }});
 const changed=paths('changed-context'), changedModel=new FauxModelAdapter([]), tty=terminal();
 await runCli(changed.args,{home:changed.home,input:tty.input,output:tty.output,createNativeAdapter:()=>changedModel,startTui:async options=>{
  try {
   await assert.rejects(options.session.runTask('failed setup'),/owned prerequisite failure/);
   assert.match(options.fallback.choose('task'),/next submission/);
   fs.renameSync(changed.workspace,path.join(changed.base,'previous-workspace'));fs.mkdirSync(changed.workspace);
   await assert.rejects(options.session.runTask('Check the replaced workspace'),/fallback_context_changed/);
   assert.equal(changedModel.state.exchangeCount,0);assert.deepEqual(fs.readdirSync(changed.workspace),[]);
  } finally {await options.session.close();}return 0;
 }});
 tty.input.destroy();tty.output.destroy();
} finally {Native.prototype.start=originalStart;}
put(path.join(root,'summary.json'),{policy:'FBACK1.0',platform,normalAndAutoRealNative:true,manualFallbackPrerequisite:'injected before first model/tool',scopes:['once','task'],noninteractiveDenied:true});
console.log('Native onboarding and session automation; operator fallback scope and approvals verified.');
