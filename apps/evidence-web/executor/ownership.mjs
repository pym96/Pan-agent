import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
// An ACK is an admission already committed under the task-row lock, not a
// lease that the child may use for later actions. Each next action needs a new ACK.
export function executionAdmission(job,handshake,signal){
 if(!['web112','web113'].includes(process.env.WEB_ISSUE))return undefined;
 const a=job.authority;
 if(!a||a.Task!==job.taskId||a.Attempt!==job.attemptId||!Number.isSafeInteger(a.Generation)||a.Generation<1||!/^[a-f0-9]{64}$/.test(a.Owner))throw Error('ownership_identity');
 let ordinal=0,held=false;
 async function hold(phase,action){
  if(held||process.env.WEB_ADMISSION_FAULT!==phase+'-'+action)return;held=true;
  await writeFile(join(job.root,'admission-'+phase+'-'+action+'.json'),JSON.stringify({authority:a,ordinal,phase,monotonicNs:process.hrtime.bigint().toString()}),{flag:'wx',mode:0o600});
  for(;;){if(signal?.aborted)throw Error('admission_cancelled');try{await readFile(join(job.root,'admission-release'));return}catch(e){if(e.code!=='ENOENT')throw e};await new Promise(r=>setTimeout(r,25))}
 }
 return async action=>{
  // This intentionally holdable preflight is NOT authority. Only the DB commit is.
  if(signal?.aborted)throw Error('admission_cancelled');await hold('before',action);
  const receipt=await handshake({kind:'admission',authority:a,ordinal:++ordinal,action});
  if(receipt?.action!=='admission_ack'||receipt.ordinal!==ordinal||JSON.stringify(receipt.authority)!==JSON.stringify(a))throw Error('admission_ack_identity');
  await hold('after',action);
 };
}
