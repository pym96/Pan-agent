// Explicit offline receipt-fault regression. Never permitted against Kimi mode.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const data=process.env.DEPLOY_DATA,out=process.env.EVIDENCE_DIR;await mkdir(out,{recursive:false});const cfg=JSON.parse(await readFile(data+'/config.json'));assert.equal(cfg.provider,'offline-faux');assert.equal(cfg.testMode,true);
const origin=`http://127.0.0.1:${cfg.httpPort}`,script=cfg.release+'/deploy/pan-web.py';let cookie;
const save=(n,v)=>writeFile(out+'/'+n,JSON.stringify(v,null,2));
async function api(path,body){const r=await fetch(origin+'/api'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value}
async function op(action){await writeFile(out+'/'+action+'-'+Date.now()+'.log',execFileSync('python3',[script,action,'--data',data],{timeout:120000}))}
async function wait(id,predicate){for(;;){const t=await api('/tasks/'+id);if(predicate(t))return t;await new Promise(r=>setTimeout(r,500))}}
try{
 await op('stop');cfg.faults={WEB_OPERATION_FAULT:'after-receipt'};await writeFile(data+'/config.json',JSON.stringify(cfg),{mode:0o600});await op('start');await api('/login',cfg.accounts.a);
 const bundles=await api('/bundles');assert.ok(bundles.length);const c=await api('/conversations',{bundleId:bundles[0].id});const t=await api('/conversations/'+c.id+'/messages',{requestId:'resume122',question:'offline receipt recovery regression'});
 const held=await wait(t.id,t=>t.events.some(e=>e.type==='operation.barrier'));await save('held.json',held);const pid=held.recovery.attempts.at(-1).nodePid;assert.ok(execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes(cfg.release+'/executor/main.mjs'));process.kill(pid,'SIGKILL');
 const interrupted=await wait(t.id,t=>t.state==='interrupted'&&t.cleanupConfirmed);await save('interrupted.json',interrupted);await op('stop');cfg.faults={};await writeFile(data+'/config.json',JSON.stringify(cfg),{mode:0o600});await op('start');
 const reply=await api(`/conversations/${c.id}/tasks/${t.id}/resume`,{requestId:'resume122-confirm',checkpointId:interrupted.recovery.checkpointId});await save('resume.json',reply);
 const done=await wait(t.id,t=>t.recovery.attempts.at(-1)?.id===reply.attemptId&&['completed','failed','interrupted'].includes(t.state)&&t.cleanupConfirmed);await save('done.json',done);assert.equal(done.state,'completed');assert.equal(done.events.filter(e=>e.type==='sandbox.config').length,2);assert.equal(done.result.providerSends,0);assert.equal(done.result.operationReconciled,true);console.log(JSON.stringify({passed:true,providerSends:0,taskId:t.id,oldAttempt:interrupted.ownership.attemptId,newAttempt:reply.attemptId,actualDockerExecutions:2}));
}finally{await op('stop')}
