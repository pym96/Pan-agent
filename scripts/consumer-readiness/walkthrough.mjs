#!/usr/bin/env node
// Installed CLI demonstration, not an alternate runtime or live-model benchmark.
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [cliArg, outputArg] = process.argv.slice(2);
if (!cliArg || !outputArg || process.argv.length !== 4) {
  console.error('Usage: node walkthrough.mjs /absolute/consumer/node_modules/.bin/pan-agent NEW_OUTPUT_DIR');
  process.exit(2);
}
const cli=resolve(cliArg), root=resolve(outputArg), here=dirname(fileURLToPath(import.meta.url));
await mkdir(root,{recursive:false});
const home=join(root,'home');await mkdir(home);
const networkLog=join(root,'network.jsonl');await writeFile(networkLog,'');
const guard=join(root,'offline-network-guard.mjs');await copyFile(join(here,'offline-network-guard.mjs'),guard);
const env={PATH:process.env.PATH,HOME:home,LANG:'C',NODE_OPTIONS:'--import='+pathToFileURL(guard).href,PAN_WALKTHROUGH_NETWORK_LOG:networkLog};
const reports=[];
const digest=b=>createHash('sha256').update(b).digest('hex');
async function manifest(dir) {
  const files={};
  async function walk(path,relative='') {
    for(const entry of await readdir(path,{withFileTypes:true})) {
      const name=relative?relative+'/'+entry.name:entry.name, full=join(path,entry.name);
      if(entry.isDirectory()) await walk(full,name);
      else if(entry.isFile()) files[name]=digest(await readFile(full));
    }
  }
  await walk(dir);return files;
}
async function run(name,args,expected) {
  const started=performance.now();
  const proc=spawn(cli,args,{env,stdio:['ignore','pipe','pipe'],detached:true});
  let stdout='',stderr='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;try{process.kill(-proc.pid,'SIGKILL');}catch{}},20000);
  proc.stdout.on('data',b=>stdout+=b);proc.stderr.on('data',b=>stderr+=b);
  const code=await new Promise((ok,bad)=>{proc.on('error',bad);proc.on('close',ok);}).finally(()=>clearTimeout(timer));
  const elapsedMs=performance.now()-started;
  await writeFile(join(root,name+'.stdout'),stdout);await writeFile(join(root,name+'.stderr'),stderr);
  const events=stdout.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const owned=new Set([proc.pid]);
  for(const e of events) {
    if(e.type==='worker_identity'){owned.add(e.workerPid);owned.add(e.supervisorPid);}
    if(e.type==='verifier.owned'){owned.add(e.pid);owned.add(e.executorPid);}
  }
  const alive=()=>[...owned].filter(Number.isInteger).filter(pid=>{
    const state=spawnSync('ps',['-p',String(pid),'-o','stat='],{encoding:'utf8'}).stdout.trim();
    return state && !state.startsWith('Z');
  });
  let remaining=alive();
  for(let i=0;i<20&&remaining.length;i++){await new Promise(r=>setTimeout(r,100));remaining=alive();}
  const report={name,args,code,elapsedMs,timedOut,ownedPids:[...owned],remainingPids:remaining};
  reports.push(report);await writeFile(join(root,'commands.json'),JSON.stringify(reports,null,2)+'\n');
  assert.equal(timedOut,false,name+': runner timeout; inspect retained evidence');
  assert.deepEqual(remaining,[],name+': owned child still active');
  assert.equal(code,expected,name+': '+stderr);
  return {events,stdout,elapsedMs};
}
const response={kind:'response',message:{role:'assistant',content:[{type:'text',text:'Scripted completion; verifier must decide.'}],timestamp:0},stopReason:'stop',usage:{status:'unavailable'},identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}}};
const fixture=join(root,'fixture.json');await writeFile(fixture,JSON.stringify(Array(20).fill(response),null,2)+'\n');
const help=await run('help',['--help'],0);
assert.ok(help.stdout.includes('--sandbox-root')&&help.stdout.includes('sandbox list'),'root help must expose sandbox');
for(const command of ['loop','goal','execution'])await run(command+'-help',[command,'--help'],0);
async function command(name,mode,duration) {
 const dir=join(root,name);await mkdir(dir);const workspace=join(dir,'workspace');await mkdir(workspace);
 // Pre-existing artifact: this demonstrates verification/control, not model task-solving.
 await writeFile(join(workspace,'result.txt'),'correct\n');
 return [mode,'--every','1s','--for',duration,'--task','Inspect the pre-existing result; completion text is not a verdict.','--workspace',workspace,'--memory-root',join(dir,'memory'),'--state',join(dir,'state'),'--fixture',fixture];
}
const loop=await run('loop',await command('loop','loop','4s'),0);
const terminal=events=>events.findLast(e=>e.type==='execution.terminal');
assert.equal(terminal(loop.events).reason,'deadline_exceeded');
assert.ok(loop.events.filter(e=>e.type==='execution.attempt_settled'&&e.result.status==='completed').length>=2,'normal model final must not stop loop');
const verifier=join(root,'verifier.json');await writeFile(verifier,JSON.stringify({version:'offline-v1',command:'test "$(cat result.txt)" = correct',seconds:2}));
const goal=await run('goal',[...await command('goal','goal','10s'),'--verifier',verifier],0);
assert.equal(terminal(goal.events).reason,'succeeded');assert.equal(terminal(goal.events).attempts,1);
assert.equal(goal.events.find(e=>e.type==='goal.verdict').verdict.status,'PASS');
assert.ok(goal.elapsedMs<10000,'goal should stop early');
const broken=join(root,'unknown-verifier.json');await writeFile(broken,JSON.stringify({version:'offline-unknown-v1',command:'exit 2',seconds:2}));
const unknown=await run('unknown',[...await command('unknown','goal','10s'),'--verifier',broken],1);
assert.equal(terminal(unknown.events).reason,'needs_review');
assert.equal(unknown.events.find(e=>e.type==='goal.verdict').verdict.status,'UNKNOWN');
const invalidArgs=await command('invalid','loop','0s');await run('invalid',invalidArgs,2);
assert.ok(!(await readdir(join(root,'invalid'))).includes('state'),'invalid plan must have no execution state');
const state=join(root,'goal','state'), before=await manifest(join(root,'goal'));
const inspect=await run('inspect',['execution','inspect','--state',state],0);
assert.equal(inspect.events[0].result.reason,'succeeded');
assert.deepEqual(await manifest(join(root,'goal')),before,'inspect mutated state or artifacts');
assert.equal(await readFile(networkLog,'utf8'),'','unexpected network attempt');
const summary={mode:'offline Faux fixture; pre-existing artifact, no model task-solving',node:process.version,checks:['installed help','loop continues after finals','goal executable PASS stops early','verifier UNKNOWN is not success','invalid duration rejected before state','inspect read-only','owned child settlement','zero guarded network attempts'],loop:terminal(loop.events),goal:terminal(goal.events),unknown:terminal(unknown.events)};
await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
await writeFile(join(root,'manifest.json'),JSON.stringify(await manifest(root),null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
console.log('Evidence retained at '+root);
