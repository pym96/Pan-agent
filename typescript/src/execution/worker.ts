/** Private IPC worker entry. Never a model-visible tool or public executable. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { GeneralAgentSession, GENERAL_AGENT_SYSTEM_PROMPT } from '../runtime/session.ts';
import { RunArchiveStore } from '../memory/run-archive.ts';
import { createPanTrustedLocalTools } from '../tools/pan-trusted-local-tools.ts';
import { SandboxSession } from '../sandbox/session.ts';
import { FauxModelAdapter, type FauxScriptEntry } from '../providers/faux/faux-model-adapter.ts';
import { createPanDeepSeekAdapter } from '../providers/deepseek/pan-deepseek-model-adapter.ts';
import { createPanKimiAdapter } from '../providers/kimi/pan-kimi-model-adapter.ts';
import { loadPanSettings } from '../config/settings.ts';
import { DEFAULT_DEEPSEEK_PROFILE } from '../providers/deepseek/deepseek-profile.ts';
import { DEFAULT_KIMI_PROFILE, KIMI_K3_MODEL_ID } from '../providers/kimi/kimi-profile.ts';
import { DeepSeekFetchTransport } from '../providers/deepseek/deepseek-transport.ts';
import { KimiFetchTransport } from '../providers/kimi/kimi-transport.ts';
import { PAN_KEYCHAIN_ACCOUNT,PAN_KEYCHAIN_KIMI_ACCOUNT,PAN_KEYCHAIN_SERVICE,readKeychainCredential } from '../config/keychain.ts';
import type { Counts, Ticket } from './admission.ts';
import type { Usage } from '../protocol/canonical-protocol.ts';
import type { KernelLimits } from '../runtime/agent-kernel.ts';
export interface WorkerConfig {workspace:string;memoryRoot:string;deliveryFiles?:string[];sandboxRoot?:string;sandboxInputs?:string[];fixture?:FauxScriptEntry[];limits:KernelLimits;runbook:{content:string;revision:string}}
const pending=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
const rpc=(action:string,payload:unknown)=>new Promise<any>((resolve,reject)=>{const id=randomUUID();pending.set(id,{resolve,reject});process.send?.({type:'rpc',id,action,payload});});
let session:GeneralAgentSession|undefined;let busy=false;let lastResult:unknown;
async function initialize(config:WorkerConfig){
 const settings=config.fixture&&!config.deliveryFiles?undefined:await loadPanSettings();const provider=settings?.provider??'deepseek';
 const credentialSource=()=>readKeychainCredential({service:PAN_KEYCHAIN_SERVICE,account:provider==='kimi-code'?PAN_KEYCHAIN_KIMI_ACCOUNT:PAN_KEYCHAIN_ACCOUNT});
 const adapter=config.fixture?new FauxModelAdapter(config.fixture):provider==='kimi-code'?createPanKimiAdapter(settings?.modelId===KIMI_K3_MODEL_ID?{modelId:KIMI_K3_MODEL_ID,thinkingLevel:settings.thinkingLevel}:DEFAULT_KIMI_PROFILE,settings?.credentialSource==='keychain'?{transport:new KimiFetchTransport({credentialSource})}:{}):createPanDeepSeekAdapter({modelId:(settings?.modelId??DEFAULT_DEEPSEEK_PROFILE.modelId) as typeof DEFAULT_DEEPSEEK_PROFILE.modelId,thinkingLevel:settings?.thinkingLevel??DEFAULT_DEEPSEEK_PROFILE.thinkingLevel},settings?.credentialSource==='keychain'?{transport:new DeepSeekFetchTransport({credentialSource})}:{});
 const sandbox=config.sandboxRoot?new SandboxSession({stateRoot:config.sandboxRoot,inputs:config.sandboxInputs},text=>{process.send?.({type:'sandbox',directory:text.slice('SANDBOX '.length)});}):undefined;
 const localTools = sandbox?.tools ?? createPanTrustedLocalTools(config.workspace,process.env,async(workspace,value,signal)=>{
  if(signal.aborted)throw Error('cancelled');return rpc('supervised_shell',{workspace,value});
 }).tools;
 const deliveryFiles = config.deliveryFiles;
 const tools = deliveryFiles ? localTools.filter(tool => ['read','write'].includes(tool.name)).map(tool => ({
  ...tool,
  validate(value: Parameters<typeof tool.validate>[0]) {
   if (typeof value.path !== 'string' || !deliveryFiles.includes(value.path)) return {ok:false as const,error:'path_outside_delivery_scope'};
   if (tool.name === 'write' && (typeof value.content !== 'string' || Buffer.byteLength(value.content)>131072)) return {ok:false as const,error:'delivery_file_limit'};
   return tool.validate(value);
  },
 })) : localTools;
 session=new GeneralAgentSession({kernel:'native',adapter,tools,limits:config.limits,
  systemPrompt:deliveryFiles ? 'You are the delivery builder. Use only the provided read and write tools on the authorized files. Implement the operator task, then report the changes. The controller independently verifies every criterion.' : GENERAL_AGENT_SYSTEM_PROMPT+(sandbox?'\nTools run ONLY in isolated Docker /workspace/task. Each task uses a new workspace.':''),
  memory:{archiveStore:await RunArchiveStore.open(config.memoryRoot),runbook:async()=>config.runbook},executionBoundary:sandbox,
  authorization:{...(deliveryFiles?{permissions:settings?.permissions}:{}),protectedPaths:settings?.protectedPaths,approval:async(request,signal)=>{if(signal.aborted)throw Error('cancelled');return rpc('approval',request);}},
  admission:async(runId,limits,restored)=>{
   let counts:Counts=await rpc('begin',{runId,limits,restored});
   return {snapshot:()=>({...counts}),check:()=>rpc('check',{}),admit:async(kind,count)=>{const result=await rpc('admit',{kind,count});counts=result.counts;return result.ticket;},settle:(ticket:Ticket,usage?:Usage)=>rpc('settle',{ticket,usage})};
  },
  onObservation:async observation=>{await rpc('observation',observation);},
 });
 process.send?.({type:'ready'});
}
process.on('message',async(message:any)=>{
 if(message?.type==='reply'){const p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.error?p.reject(Error(message.error)):p.resolve(message.value);return;}
 if(message?.type==='reconcile'){process.send?.({type:'activity',busy});if(!busy&&lastResult)process.send?.(lastResult as any);return;}
 if(message?.type==='stop'){session?.cancel();return;}
 if(message?.type==='initialize'){try{await initialize(message.config);}catch(error){process.send?.({type:'fatal',error:String(error)});}return;}
 if(message?.type==='run'){
  if(busy||!session){process.send?.({type:'fatal',error:'worker_unavailable'});return;}busy=true;
  try{const result=await session.runTask(message.task);lastResult={type:'result',attemptId:message.attemptId,result};process.send?.(lastResult as any);}
  catch(error){process.send?.({type:'fatal',error:String(error)});}finally{busy=false;}
 }
});
process.on('disconnect',()=>{session?.cancel();for(const p of pending.values())p.reject(Error('controller_disconnected'));setTimeout(()=>process.exit(1),100).unref();});
