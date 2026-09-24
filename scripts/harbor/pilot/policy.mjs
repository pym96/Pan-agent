import {createHash,verify} from 'node:crypto';
import {mkdirSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
export const MODEL=Object.freeze({provider:'kimi-code',model:'k3-256k',thinking:'high',endpoint:'https://api.kimi.com/coding/v1/chat/completions'});
export const LIMITS=Object.freeze({dispatchesPerTask:40,dispatchesCampaign:200,toolsPerTask:80,maxTokens:4096,requestBytes:131072,responseBytes:524288,dispatchSeconds:120});
export const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const digest=v=>createHash('sha256').update(v).digest('hex');
export const check=(condition,code)=>{if(!condition)throw new Error(code);};
export const METERED_LIMITS=Object.freeze({...LIMITS,mode:'metered',dispatchesPerTask:null,dispatchesCampaign:null,toolsPerTask:null,responseBytes:null});
export function budgets(value){
 const metered=value?.mode==='metered',schema=metered?METERED_LIMITS:LIMITS;
 check(value&&canonical(Object.keys(value).sort())===canonical(Object.keys(schema).sort()),'budget_fields');
 for(const [k,max] of Object.entries(LIMITS)){
  // Only an explicit, signed null in metered mode disables the response cap.
  // Historical numeric budgets remain bounded; omission never upgrades a permit.
  const unlimited=metered&&k==='responseBytes'&&value[k]===null;
  check(metered&&['dispatchesPerTask','dispatchesCampaign','toolsPerTask'].includes(k)?value[k]===null:unlimited||(Number.isInteger(value[k])&&value[k]>0&&value[k]<=max),'budget_range');
 }
 return Object.freeze({...value});
}
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function authorize(activation,authority,expected,{clock=Date.now,signal}={}){
 check(activation?.authorized===true,'not_authorized');check(authority?.publicKey&&authority.acceptedRunnerSha===expected.runnerSha,'no_trusted_authority');
 const {signature,...payload}=activation;check(typeof signature==='string'&&verify(null,Buffer.from(canonical(payload)),authority.publicKey,Buffer.from(signature,'base64')),'activation_signature');
 check(canonical(activation.binding)===canonical(expected),'activation_identity');budgets(expected.budget);
 check(typeof activation.humanAuthorizationId==='string'&&activation.humanAuthorizationId.length>0,'human_authorization_missing');
 check(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(activation.runId),'run_id');
 const metered=expected.budget.mode==='metered';
 if(metered)check(activation.version===2&&activation.validity==='run-bound'&&activation.expiresAt===null,'activation_validity');
 else check(activation.validity===undefined&&activation.version!==2,'activation_validity');
 const start=Date.parse(activation.notBefore),end=metered?null:Date.parse(activation.expiresAt);check(Number.isFinite(start)&&(metered||Number.isFinite(end)&&start<end),'activation_window');
 const gate=Object.freeze({runId:activation.runId,binding:freeze(structuredClone(expected)),expiresAt:end,assert(otherSignal){check(!signal?.aborted&&!otherSignal?.aborted,'cancelled');check(clock()>=start&&(end===null||clock()<end),'activation_expired');},clock});gate.assert();return gate;
}
/** Exclusive campaign admission plus synchronous fsync before every external effect.
 * Existing files (including partial/interrupted ones) are never opened for restart. */
export class Ledger{
 #fd;#gate;#tasks=new Map();#dispatches=0;
 constructor(root,gate){gate.assert();this.#gate=gate;mkdirSync(root,{recursive:true,mode:0o700});this.path=join(root,gate.runId+'.jsonl');this.#fd=openSync(this.path,'wx',0o600);this.#write({event:'campaign_reserved',runId:gate.runId,binding:gate.binding});}
 #write(row){const bytes=Buffer.from(JSON.stringify(row)+'\n');let offset=0;while(offset<bytes.length){const n=writeSync(this.#fd,bytes,offset,bytes.length-offset);check(n>0,'ledger_write_failed');offset+=n;}fsyncSync(this.#fd);}
 start(id){this.#gate.assert();check(this.#gate.binding.taskIds.includes(id)&&!this.#tasks.has(id),'attempt_already_used_or_unknown');this.#write({event:'attempt_reserved',task:id});this.#tasks.set(id,{dispatches:0,tools:0});}
 reserve(id,kind,signal){this.#gate.assert(signal);const t=this.#tasks.get(id),b=this.#gate.binding.budget;check(t,'attempt_not_started');if(kind==='dispatch'){check((b.dispatchesPerTask===null||t.dispatches<b.dispatchesPerTask)&&(b.dispatchesCampaign===null||this.#dispatches<b.dispatchesCampaign),'dispatch_budget');this.#write({event:'dispatch_reserved',task:id,taskNumber:t.dispatches+1,campaignNumber:this.#dispatches+1});t.dispatches++;this.#dispatches++;}else{check(kind==='tool'&&(b.toolsPerTask===null||t.tools<b.toolsPerTask),'tool_budget');this.#write({event:'tool_reserved',task:id,number:t.tools+1});t.tools++;}}
 record(id,row){check(this.#tasks.has(id),'attempt_not_started');this.#write({...row,task:id});}
 usage(id,usage){this.#write({event:'usage',task:id,input:usage?.input??null,output:usage?.output??null});}
 finish(id,status){this.#write({event:'attempt_finished',task:id,status});}
 close(){if(this.#fd!==undefined){closeSync(this.#fd);this.#fd=undefined;}}
}
