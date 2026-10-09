import {readFile,open,rename,lstat,readdir,realpath,chmod} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['stage1.json','analysis.json','details.csv'];
const canary='WEB110_SYNTHETIC_PRIVATE_CONTINUATION_7b94a';
async function tree(path){const out=[];for(const n of (await readdir(path)).sort()){const p=join(path,n),s=await lstat(p);if(s.isDirectory())out.push([n,await tree(p)]);else if(s.isFile())out.push([n,hash(await readFile(p))]);else throw Error('identity_alias')};return hash(JSON.stringify(out))}
async function bytes(root,name){if(!files.includes(name))throw Error('checkpoint_file_name');const d=join(root,'output');if(await realpath(d)!==d)throw Error('checkpoint_file_alias');const p=join(d,name),s=await lstat(p);if(!s.isFile()||s.nlink!==1||s.size>2*1024*1024)throw Error('checkpoint_file_invalid');return readFile(p)}
async function durable(path,data){const f=await open(path+'.tmp','wx',0o600);try{await f.writeFile(data);await f.sync()}finally{await f.close()};await rename(path+'.tmp',path);const dir=await open(dirname(path),'r');try{await dir.sync()}finally{await dir.close()}}
export async function checkpointIdentity(job){return {taskId:job.taskId,contextSHA256:job.contextSHA256,inputs:await tree(join(job.root,'input')),pan:await tree(dirname(process.env.PAN_ENTRY)),executor:hash((await Promise.all(['main.mjs','checkpoint.mjs','docker-tool.mjs','analysis.py','stage2.py','resources.mjs','archive-recover.mjs'].map(n=>readFile(new URL(n,import.meta.url))))).map(b=>hash(b)).join(':')),image:process.env.PAN_IMAGE,cpus:process.env.ANALYSIS_CPUS||'2',memory:process.env.ANALYSIS_MEMORY_GIB||'4'}}
export function checkpointAdapter(Pan,code,second){
 const script=hash(code+'\n'+second);
 return new Pan.CheckpointFauxAdapter(script,async(request,i)=>{
  if(process.env.WEB_CHECKPOINT_FAULT==='after-exchange'&&i===1)await new Promise((_,reject)=>{if(request.signal.aborted)reject(Error('cancelled'));else request.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true})});
  let content;
  if(i<2)content=[{type:'tool_call',id:'stage-'+(i+1),name:'analyze_python',arguments:{code:i===0?code:second}}];
  else{const last=request.context.messages.filter(m=>m.role==='tool_result').at(-1);if(!last||last.isError)throw Error('stage_result_missing');const tool=JSON.parse(last.content.map(c=>c.text||'').join(''));const x=JSON.parse(tool.stdout);content=[{type:'text',text:JSON.stringify({label:'Offline Faux · 检查点恢复测试',total:x.total,counts:x.counts,validScored:x.validScored,segment7Usage:x.segment7Usage,usageScope:x.usageScope,sources:x.sources,selection:x.selection})}]}
  if(process.env.WEB_CHECKPOINT_FAULT==='partial-tools'&&i===0)content.push({type:'tool_call',id:'partial-second',name:'analyze_python',arguments:{code:"import time; time.sleep(120)"}});
  return {kind:'response',message:{role:'assistant',content,timestamp:Date.now()},stopReason:i<2?'tool_calls':'stop',usage:{status:'reported',value:{input:1,output:1,totalTokens:2,cacheRead:0,cacheWrite:0}},identity:{provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'checkpoint-faux-v1'},responseId:{status:'unavailable'}}};
 },canary);
}
export async function checkpointIO(job,record,handshake,signal){
 const identity=await checkpointIdentity(job);
 let restored;
 if(job.checkpoint){
  const c=job.checkpoint;
  if(c.version!==1||c.native?.task!==job.question||c.taskId!==job.taskId||!(/^[a-f0-9]{64}$/).test(c.attemptId)||c.attemptId===job.attemptId||JSON.stringify(c.identity)!==JSON.stringify(identity)||!Array.isArray(c.files)||!c.files.length)throw Error('checkpoint_identity_mismatch');
  const original=resolve(process.env.WEB107_TASK_ROOT,c.attemptId);
  if(await realpath(original)!==original)throw Error('checkpoint_root_alias');
  const seen=new Set();for(const f of c.files){if(seen.has(f.name))throw Error('checkpoint_duplicate_file');seen.add(f.name);const b=await bytes(original,f.name);if(hash(b)!==f.sha256)throw Error('checkpoint_file_hash');await durable(join(job.root,'output',f.name),b);await chmod(join(job.root,'output',f.name),0o666)}
  if(!seen.has('stage1.json'))throw Error('checkpoint_receipt_missing');
  restored=c.native;
 }
 return {restored,sink:{
  async invalidate(){await handshake({kind:'invalidate'});if(process.env.WEB_CHECKPOINT_FAULT==='after-invalidate'&&restored)await hold(job,record,signal,'uncertain')},
  async commit(native){
   if(process.env.WEB_CHECKPOINT_FAULT==='before-commit')throw Error('controlled_checkpoint_persist_failure');
   const manifest=[];
   for(const name of files){try{const b=await bytes(job.root,name);const f=await open(join(job.root,'output',name),'r');try{await f.sync()}finally{await f.close()};manifest.push({name,sha256:hash(b)})}catch(e){if(e.code!=='ENOENT')throw e}}
   const outputDirectory=await open(join(job.root,'output'),'r');try{await outputDirectory.sync()}finally{await outputDirectory.close()};
   if(!manifest.some(f=>f.name==='stage1.json'))throw Error('checkpoint_receipt_missing');
   const c={version:1,taskId:job.taskId,attemptId:job.attemptId,identity,native,files:manifest};const raw=Buffer.from(JSON.stringify(c));
   await durable(join(job.root,'checkpoint.json'),raw);
   const parentDirectory=await open(dirname(job.root),'r');try{await parentDirectory.sync()}finally{await parentDirectory.close()};
   await handshake({kind:'checkpoint',checkpointId:randomBytes(32).toString('hex'),sha256:hash(raw)});
   await record({kind:'event',event:{type:'checkpoint.committed',attemptId:job.attemptId,sourceRunId:native.sourceRunId,modelCalls:native.modelCalls,toolCalls:native.toolCalls,usage:native.usage}});
   if(process.env.WEB_CHECKPOINT_FAULT==='after-commit'&&native.modelCalls===1)await hold(job,record,signal,'committed');
  }
 }};
}
async function hold(job,record,signal,phase){await record({kind:'event',event:{type:'checkpoint.barrier',phase}});for(;;){if(signal?.aborted)throw Error('checkpoint_cancelled');await new Promise(r=>setTimeout(r,50))}}
