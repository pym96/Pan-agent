// Private host-only operation protocol. Neither this file nor its receipts are container mounts.
import {readFile,open,rename,lstat,realpath,readdir,chmod} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {command} from './docker-tool.mjs';
import {checkpointIdentity} from './checkpoint.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const allowed=['stage1.json','analysis.json','details.csv'];
export async function durable(path,data){const tmp=path+'.'+randomBytes(8).toString('hex');const f=await open(tmp,'wx',0o600);try{await f.writeFile(data);await f.sync()}finally{await f.close()};await rename(tmp,path);const d=await open(dirname(path),'r');try{await d.sync()}finally{await d.close()}}
async function file(root,name){if(!allowed.includes(name))throw Error('operation_file_name');const dir=join(root,'output');if(await realpath(dir)!==dir)throw Error('operation_file_alias');const p=join(dir,name),s=await lstat(p);if(!s.isFile()||s.nlink!==1||s.size>2*1024*1024)throw Error('operation_file_invalid');return readFile(p)}
async function manifest(root,sync=false){const result=[];for(const name of allowed){try{const b=await file(root,name);if(sync){const f=await open(join(root,'output',name),'r');try{await f.sync()}finally{await f.close()}};result.push({name,sha256:hash(b)})}catch(e){if(e.code!=='ENOENT')throw e}}if(sync){const d=await open(join(root,'output'),'r');try{await d.sync()}finally{await d.close()}};return result}
function binding(c){const last=c.native.messages.at(-1),calls=last?.role==='assistant'?last.content.filter(b=>b.type==='tool_call'):[];if(c.native.version!==2||c.native.next!=='pending_tool'||calls.length!==1||calls[0].name!=='analyze_python')throw Error('operation_pending_unsupported');const call=calls[0];return {taskId:c.taskId,attemptId:c.attemptId,runId:c.native.sourceRunId,toolCallId:call.id,toolName:call.name,argsSHA256:hash(JSON.stringify(call.arguments)),codeSHA256:hash(call.arguments.code),identitySHA256:hash(JSON.stringify(c.identity))}}
export async function validateOperation(c,job){
 if(c.native?.provider!=='pan-faux'||c.native?.model!=='checkpoint-faux-v1'||c.native?.providerFormat!=='pan-faux-private-v1')throw Error('operation_provider_unsupported');
 if(c.version!==2||c.taskId!==job.taskId||!(/^[a-f0-9]{64}$/).test(c.attemptId)||c.native.task!==job.question)throw Error('operation_identity_invalid');
 const root=resolve(process.env.WEB107_TASK_ROOT,c.attemptId);if(await realpath(root)!==root)throw Error('operation_root_alias');
 const identity=await checkpointIdentity({...job,root});if(JSON.stringify(c.identity)!==JSON.stringify(identity))throw Error('operation_identity_mismatch');
 const inspected=await command('docker',['image','inspect',c.identity.image,'--format','{{.Id}}']);if(inspected.exitCode!==0||inspected.stdout.trim()!==c.identity.image)throw Error('operation_image_missing');
 const b=binding(c);if(JSON.stringify(c.operation?.binding)!==JSON.stringify(b))throw Error('operation_binding_mismatch');
 if(!['pre_dispatch','completed'].includes(c.operation.state))throw Error('operation_result_unknown');
 if(!Array.isArray(c.files))throw Error('operation_files_invalid');const seen=new Set();for(const f of c.files){if(seen.has(f.name))throw Error('operation_duplicate_file');seen.add(f.name);if(hash(await file(root,f.name))!==f.sha256)throw Error('operation_artifact_mismatch')}
 // All known artifacts must be covered; a pre-dispatch writer must not have left unaccounted effects.
 if(JSON.stringify(await manifest(root))!==JSON.stringify(c.files))throw Error('operation_artifact_conflict');
 if(c.operation.state==='completed'){
  const r=c.operation.result;if(!r||r.role!=='tool_result'||r.toolCallId!==b.toolCallId||r.toolName!==b.toolName||!Array.isArray(r.content)||r.content.length!==1||r.content[0].type!=='text'||typeof r.isError!=='boolean'||hash(JSON.stringify(r))!==c.operation.resultSHA256)throw Error('operation_receipt_invalid');
  let o;try{o=JSON.parse(r.content[0].text)}catch{throw Error('operation_receipt_invalid')}
  if(typeof o.stdout!=='string'||typeof o.stderr!=='string'||!(o.exitCode===null||Number.isInteger(o.exitCode))||typeof o.overflow!=='boolean'||r.isError!==(o.exitCode!==0||o.overflow))throw Error('operation_receipt_invalid');
 }
 return {decision:c.operation.state==='completed'?'confirmed_complete':'confirmed_not_started',root};
}
export async function restoreOperation(c,job){const checked=await validateOperation(c,job);for(const f of c.files){await durable(join(job.root,'output',f.name),await file(checked.root,f.name));await chmod(join(job.root,'output',f.name),0o666)}return {...c.native,resolution:c.operation.state==='completed'?{kind:'completed',result:c.operation.result}:{kind:'not_started'}}}
export function operationIO(job,identity,handshake,record,signal,restored){
 let current,point,transferred=false;
 async function hold(phase){await record({kind:'event',event:{type:'operation.barrier',phase}});for(;;){if(signal?.aborted)throw Error('operation_cancelled');await new Promise(r=>setTimeout(r,50))}}
 async function persist(kind){const raw=Buffer.from(JSON.stringify(current));await durable(join(job.root,'checkpoint.json'),raw);const parent=await open(dirname(job.root),'r');try{await parent.sync()}finally{await parent.close()};await handshake({kind,checkpointId:point,sha256:hash(raw)});await record({kind:'event',event:{type:'operation.persisted',phase:current.operation.state,toolCallId:current.operation.binding.toolCallId,attemptId:job.attemptId}})}
 return {
  async pending(native){
   point=randomBytes(32).toString('hex');current={version:2,taskId:job.taskId,attemptId:job.attemptId,identity,native,files:await manifest(job.root,true)};current.operation={state:'pre_dispatch',binding:binding(current)};
   // A reused receipt remains durable through a second crash, without admitting a dispatch.
   if(!transferred&&restored?.resolution?.kind==='completed'){current.operation={...current.operation,state:'completed',result:restored.resolution.result,resultSHA256:hash(JSON.stringify(restored.resolution.result)),reusedFrom:job.checkpoint.attemptId};transferred=true}
   await persist('checkpoint');if(process.env.WEB_OPERATION_FAULT==='pre-dispatch'&&native.modelCalls===1)await hold('pre_dispatch');
  },
  async dispatch(call){if(!current)return;const b=current.operation.binding;if(current.operation.state!=='pre_dispatch'||b.toolCallId!==call.toolCallId||b.argsSHA256!==hash(JSON.stringify(call.arguments)))throw Error('operation_dispatch_conflict');current.operation.state='dispatched';await persist('dispatch');if(process.env.WEB_OPERATION_FAULT==='after-dispatch')await hold('dispatched')},
  async complete(call,result){if(!current)return;const r={role:'tool_result',toolCallId:call.toolCallId,toolName:'analyze_python',...result,isError:result.isError??false,timestamp:Date.now()};current.files=await manifest(job.root,true);current.operation={...current.operation,state:'completed',result:r,resultSHA256:hash(JSON.stringify(r))};if(process.env.WEB_OPERATION_FAULT==='receipt-failure'){await durable(join(job.root,'checkpoint.json'),Buffer.from('{partial'));throw Error('operation_receipt_persist_failed')}await persist('receipt');if(process.env.WEB_OPERATION_FAULT==='after-receipt'&&current.native.modelCalls===1)await hold('completed')},
  async settled(result){if(current&&(current.operation.state!=='completed'||JSON.stringify(current.operation.result.content)!==JSON.stringify(result.content)||current.operation.result.isError!==result.isError))throw Error('operation_result_unknown')},
  clear(){current=undefined}
 };
}
