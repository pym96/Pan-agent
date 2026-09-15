import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import type { AgentTool, AgentToolExecutionResult } from '../protocol/agent-tool.ts';
import type { JsonObject } from '../protocol/canonical-protocol.ts';

export type ApprovalChoice = 'allow-once' | 'deny' | 'trust-shell';
export interface ApprovalRequest {
 readonly requestId:string; readonly sessionId:string; readonly runId:string; readonly callId:string;
 readonly tool:string; readonly workspace:string; readonly policyRevision:string;
 readonly argumentsHash:string; readonly resourceIdentity:string; readonly reason:string;
 readonly target:string; readonly metadata:readonly string[];
}
export interface ApprovalDecision { readonly requestId:string; readonly decision:ApprovalChoice }
export type ApprovalChannel = (request:ApprovalRequest, signal:AbortSignal)=>Promise<ApprovalDecision>;
export interface AuthorizationOptions { readonly protectedPaths?:readonly string[]; readonly approval?:ApprovalChannel }
export const digest=(value:string):string=>createHash('sha256').update(value).digest('hex');
export function validateProtectedPaths(value:unknown):asserts value is readonly string[] {
 if(!Array.isArray(value)||value.some(p=>typeof p!=='string'||!p.trim()||p.includes('\0')))throw Error('settings_invalid: protectedPaths');
}
const contains=(root:string,path:string):boolean=>{const r=relative(root,path);return !r||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));};
export function protectedReason(workspace:string,path:string,extra:readonly string[]):string|undefined {
 const parts=path.split(sep),name=basename(path);
 if(parts.some(p=>['.git','.ssh','.pan-agent'].includes(p))||name==='.npmrc'||((name==='.env'||name.startsWith('.env.'))&&!['.env.example','.env.sample','.env.template'].includes(name)))return 'protected_path';
 if(extra.some(p=>contains(resolve(workspace,p),path)))return 'configured_protected_path';
 if(!contains(workspace,path))return 'outside_workspace';
 return undefined;
}
type InvocationContext={authority:SessionAuthorization;runId:string;callId:string;tool:string;argumentsHash:string;live:boolean;consumed:boolean};
const context=new AsyncLocalStorage<InvocationContext>();
export class AuthorizationFailure extends Error { readonly code:string;constructor(code:string){super(code);this.code=code;} }
export class SessionAuthorization {
 readonly sessionId=randomUUID(); readonly protectedPaths:readonly string[];
 private channel?:ApprovalChannel;private closed=false;private trust=false;private revision=0;
 constructor(options:AuthorizationOptions={}){validateProtectedPaths(options.protectedPaths??[]);this.protectedPaths=Object.freeze([...(options.protectedPaths??[])]);this.channel=options.approval;}
 setChannel(channel:ApprovalChannel|undefined):void {this.channel=channel;this.revision++;this.trust=false;}
 revoke():void {this.trust=false;this.revision++;}
 close():void {this.closed=true;this.revoke();this.channel=undefined;}
 assertCurrent(audit:JsonObject,signal:AbortSignal):void {
  const ctx=context.getStore();
  if(signal.aborted||this.closed||(ctx&&!ctx.live)||audit.policyRevision!==digest(JSON.stringify([audit.workspace,this.protectedPaths,this.revision])))throw new AuthorizationFailure('approval_invalidated');
 }
 wrap(tool:AgentTool,runId:()=>string|undefined):AgentTool {
  return {...tool,execute:async invocation=>{
   const run=runId();if(!run||this.closed)return {content:[{type:'text',text:'approval_invalidated'}],isError:true};
   const ctx={authority:this,runId:run,callId:invocation.toolCallId,tool:tool.name,argumentsHash:digest(JSON.stringify(invocation.arguments)),live:true,consumed:false};
   try{return await context.run(ctx,()=>tool.execute(invocation));}finally{ctx.live=false;}
  }};
 }
 async authorize(workspace:string,tool:string,callId:string,args:JsonObject,resourceIdentity:string,signal:AbortSignal):Promise<JsonObject>{
  const current=context.getStore();const runId=current?.authority===this?current.runId:'direct-'+randomUUID();
  if(current){if(current.consumed||current.callId!==callId||current.tool!==tool||current.argumentsHash!==digest(JSON.stringify(args)))throw new AuthorizationFailure('approval_invalidated');current.consumed=true;}
  const policyRevision=digest(JSON.stringify([workspace,this.protectedPaths,this.revision]));
  const target=tool==='bash'?String(args.command):resolve(workspace,String(args.path));
  const reason=tool==='bash'?'shell_host_authority':protectedReason(workspace,target,this.protectedPaths);
  const metadata:string[]=[];
  for(const key of ['content','edits'])if(args[key]!==undefined){const value=typeof args[key]==='string'?args[key] as string:JSON.stringify(args[key]);metadata.push(`${key}: ${Buffer.byteLength(value)} bytes · SHA-256 ${digest(value)}`);}
  const request:ApprovalRequest=Object.freeze({requestId:randomUUID(),sessionId:this.sessionId,runId,callId,tool,workspace,policyRevision,argumentsHash:digest(JSON.stringify(args)),resourceIdentity,reason:reason??'ordinary_workspace_file',target,metadata:Object.freeze(metadata)});
  const audit:JsonObject={requestId:request.requestId,sessionId:this.sessionId,runId,callId,tool,workspace,policyRevision,argumentsHash:request.argumentsHash,resourceIdentity,reason:request.reason,scope:tool==='bash'?'shell':'file'};
  const valid=()=>!signal.aborted&&!this.closed&&(!current||current.live)&&policyRevision===digest(JSON.stringify([workspace,this.protectedPaths,this.revision]));
  if(!valid())throw new AuthorizationFailure('approval_invalidated');
  if(!reason||(tool==='bash'&&this.trust))return {...audit,decision:reason?'session-trust':'automatic'};
  if(!this.channel)throw Object.assign(new AuthorizationFailure('approval_unavailable'),{audit:{...audit,decision:'approval_unavailable'}});
  let abort!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new AuthorizationFailure('approval_invalidated'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  try {
   const decision=await Promise.race([Promise.resolve().then(()=>this.channel!(request,signal)),cancelled]);
   if(!valid()||!decision||decision.requestId!==request.requestId||!['allow-once','deny','trust-shell'].includes(decision.decision))throw new AuthorizationFailure('approval_invalidated');
   if(decision.decision==='deny')throw new AuthorizationFailure('approval_denied');
   if(decision.decision==='trust-shell'){if(tool!=='bash'||!current)throw new AuthorizationFailure('approval_invalidated');this.trust=true;}
   return {...audit,decision:decision.decision};
  }catch(error){if(error instanceof AuthorizationFailure){Object.assign(error,{audit:{...audit,decision:error.code}});throw error;}throw Object.assign(new AuthorizationFailure('approval_unavailable'),{audit:{...audit,decision:'approval_unavailable'}});}
  finally{signal.removeEventListener('abort',abort);}
 }
}
/** Raw exported tools never inherit a permissive fallback. Only application composition supplies a channel. */
export function invocationAuthority():SessionAuthorization {return context.getStore()?.authority??new SessionAuthorization();}
export function authorizationError(error:unknown):AgentToolExecutionResult {
 const code=error instanceof AuthorizationFailure?error.code:'unsupported_target';
 return {content:[{type:'text',text:code}],isError:true,details:{code,...((error as {audit?:JsonObject})?.audit?{authorization:(error as {audit:JsonObject}).audit}:{})}};
}
