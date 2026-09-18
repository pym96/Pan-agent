import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
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
export type ResourceComparison = 'same' | 'different' | 'unknown';
type Observation = {state:'existing';dev:number;ino:number;mode:number;nlink:number;kind:'file'|'directory'|'other'} | {state:'missing'|'unavailable';code:string};
export type FileAuthorizationState = {readonly created:readonly {dev:number;ino:number;mode:number;nlink:number}[];readonly opened?:{dev:number;ino:number}};
type Comparison = {left:string;right:string;outcome:ResourceComparison;basis:string};
const observe=(path:string):Observation=>{
 try{const s=lstatSync(path);return {state:'existing',dev:s.dev,ino:s.ino,mode:s.mode,nlink:s.isDirectory()?0:s.nlink,kind:s.isDirectory()?'directory':s.isFile()?'file':'other'};}
 catch(error){const code=(error as NodeJS.ErrnoException).code??'metadata_error';return {state:code==='ENOENT'||code==='ENOTDIR'?'missing':'unavailable',code};}
};
/** Read-only evidence for one pending action; never infers a filesystem fold. */
export class PathAssessment {
 readonly comparisons:Comparison[]=[];
 readonly observations=new Map<string,Observation>();
 reason:string|undefined;
 constructor(workspace:string,target:string,extra:readonly string[]){
  let protectedMatch=false,configuredMatch=false,unknown=false;
  const compare=(left:string,right:string)=>{const result=this.compare(left,right);if(result==='unknown')unknown=true;return result;};
  const ancestors:string[]=[];for(let cursor=target;;cursor=dirname(cursor)){ancestors.push(cursor);this.read(cursor);if(dirname(cursor)===cursor)break;}
  for(const cursor of ancestors){
   if(dirname(cursor)===cursor)continue;
   for(const reserved of ['.git','.ssh','.pan-agent'])if(compare(cursor,resolve(dirname(cursor),reserved))==='same')protectedMatch=true;
  }
  const name=basename(target),parent=dirname(target),exceptions=['.env.example','.env.sample','.env.template'];
  let storedName:string|undefined;
  try{const stored=realpathSync.native(target);if(compare(target,stored)==='same')storedName=basename(stored);else unknown=true;}catch{unknown=true;}
  const lexicalProtected=(n:string)=>n==='.env'||n==='.npmrc'||(n.startsWith('.env.')&&!exceptions.includes(n));
  if(lexicalProtected(name)||(storedName!==undefined&&lexicalProtected(storedName)))protectedMatch=true;
  for(const reserved of ['.env','.npmrc'])if(compare(target,resolve(parent,reserved))==='same')protectedMatch=true;
  // Only an exact requested AND stored exception spelling removes this pattern.
  // Canonical spelling is obtained from the filesystem and identity checked.
  if(!(exceptions.includes(name)&&storedName===name)){
   const patternName=storedName??name;
   // For an existing ASCII basename, enumerate every possible suffix boundary;
   // the filesystem, not JS case folding, decides each full-name comparison.
   for(let offset=0;offset<=patternName.length;offset++){
    const candidate=resolve(parent,'.env.'+patternName.slice(offset));
    if(candidate===target&&exceptions.includes(name))continue;
    if(compare(target,candidate)==='same')protectedMatch=true;
   }
   if(storedName===undefined||/[^\x20-\x7e]/.test(patternName)){
    unknown=true;this.comparisons.push({left:target,right:'.env.*',outcome:'unknown',basis:'unresolved_pattern_semantics'});
   }
  }

  for(const configured of extra){
   const root=resolve(workspace,configured);
   if(this.read(root).state!=='existing'){unknown=true;this.comparisons.push({left:target,right:root,outcome:'unknown',basis:'missing_or_unavailable_configured_anchor'});}
   // Pin configured ancestors as well as the final anchor for approval rechecks.
   for(let cursor=root;;cursor=dirname(cursor)){this.read(cursor);if(dirname(cursor)===cursor)break;}
   if(contains(root,target))configuredMatch=true;
   for(const cursor of ancestors)if(compare(root,cursor)==='same')configuredMatch=true;
  }
  let inside=contains(workspace,target);
  if(!inside)for(const cursor of ancestors)if(compare(workspace,cursor)==='same')inside=true;
  this.reason=protectedMatch?'protected_path':configuredMatch?'configured_protected_path':!inside?'outside_workspace':unknown?'resource_equivalence_uncertain':undefined;
 }
 private read(path:string):Observation {let value=this.observations.get(path);if(!value){value=observe(path);this.observations.set(path,value);}return value;}
 private compare(left:string,right:string):ResourceComparison {
  const a=this.read(left),b=this.read(right);let outcome:ResourceComparison,basis:string;
  if(left===right){outcome='same';basis='exact_lexical_policy_match';}
  else if(a.state==='existing'&&b.state==='existing'&&a.kind!=='other'&&b.kind!=='other'){
   outcome=a.dev===b.dev&&a.ino===b.ino?'same':'different';basis='existing_device_inode';
  }else if((a.state==='existing'&&a.kind!=='other'&&b.state==='missing')||(b.state==='existing'&&b.kind!=='other'&&a.state==='missing')){
   // One resource already exists. An equivalent spelling would resolve it.
   // This is never used to distinguish TWO missing names.
   outcome='different';basis='existing_resource_negative_lookup';
  }else{outcome='unknown';basis='missing_or_unavailable_comparison';}
  this.comparisons.push({left,right,outcome,basis});return outcome;
 }
 evidence():JsonObject {return {comparisons:this.comparisons.map(c=>({...c})),observations:[...this.observations].map(([path,value])=>({path,...value}))};}
 revalidate(state:FileAuthorizationState={created:[]}):void {
  for(const [path,previous] of this.observations){
   // A validated opened handle remains the authorized object after path rename.
   if(state.opened&&previous.state==='existing'&&previous.dev===state.opened.dev&&previous.ino===state.opened.ino)continue;
   const now=observe(path);
   if(JSON.stringify(previous)===JSON.stringify(now))continue;
   // Only this tool's already-recorded creations may materialize a missing lookup.
   // Other new/replaced configured anchors still invalidate the decision.
   if(previous.state==='missing'&&now.state==='existing'&&state.created.some(c=>c.dev===now.dev&&c.ino===now.ino&&c.mode===now.mode&&c.nlink===now.nlink)){
    this.observations.set(path,now);continue;
   }
   throw new AuthorizationFailure('approval_invalidated');
  }
 }
}
export function protectedReason(workspace:string,path:string,extra:readonly string[]):string|undefined {return new PathAssessment(workspace,path,extra).reason;}

type InvocationContext={authority:SessionAuthorization;runId:string;callId:string;tool:string;argumentsHash:string;live:boolean;consumed:boolean};
const context=new AsyncLocalStorage<InvocationContext>();
export class AuthorizationFailure extends Error { readonly code:string;constructor(code:string){super(code);this.code=code;} }
export class SessionAuthorization {
 readonly sessionId=randomUUID(); readonly protectedPaths:readonly string[];
 private readonly assessments=new WeakMap<JsonObject,PathAssessment>();
 private channel?:ApprovalChannel;private closed=false;private trust=false;private revision=0;
 constructor(options:AuthorizationOptions={}){validateProtectedPaths(options.protectedPaths??[]);this.protectedPaths=Object.freeze([...(options.protectedPaths??[])]);this.channel=options.approval;}
 setChannel(channel:ApprovalChannel|undefined):void {this.channel=channel;this.revision++;this.trust=false;}
 revoke():void {this.trust=false;this.revision++;}
 close():void {this.closed=true;this.revoke();this.channel=undefined;}
 assertCurrent(audit:JsonObject,signal:AbortSignal,state?:FileAuthorizationState):void {
  const ctx=context.getStore();
  if(signal.aborted||this.closed||(ctx&&!ctx.live)||audit.policyRevision!==digest(JSON.stringify([audit.workspace,this.protectedPaths,this.revision])))throw new AuthorizationFailure('approval_invalidated');
  this.assessments.get(audit)?.revalidate(state);
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
  const assessment=tool==='bash'?undefined:new PathAssessment(workspace,target,this.protectedPaths);
  const reason=tool==='bash'?'shell_host_authority':assessment?.reason;
  const comparisonEvidence=assessment?.evidence();
  const evidenceHash=comparisonEvidence?digest(JSON.stringify(comparisonEvidence)):undefined;
  if(evidenceHash)resourceIdentity=digest(JSON.stringify([resourceIdentity,evidenceHash]));
  const metadata:string[]=[];
  if(reason==='resource_equivalence_uncertain')metadata.push('Resource equivalence is uncertain. This target has not been established as ordinary.');
  for(const key of ['content','edits'])if(args[key]!==undefined){const value=typeof args[key]==='string'?args[key] as string:JSON.stringify(args[key]);metadata.push(`${key}: ${Buffer.byteLength(value)} bytes · SHA-256 ${digest(value)}`);}
  const request:ApprovalRequest=Object.freeze({requestId:randomUUID(),sessionId:this.sessionId,runId,callId,tool,workspace,policyRevision,argumentsHash:digest(JSON.stringify(args)),resourceIdentity,reason:reason??'ordinary_workspace_file',target,metadata:Object.freeze(metadata)});
  const audit:JsonObject={requestId:request.requestId,sessionId:this.sessionId,runId,callId,tool,workspace,policyRevision,argumentsHash:request.argumentsHash,resourceIdentity,reason:request.reason,scope:tool==='bash'?'shell':'file',classification:tool==='bash'?'shell':!reason?'ordinary':reason==='resource_equivalence_uncertain'?'uncertain':reason==='outside_workspace'?'outside':'protected',...(comparisonEvidence?{comparisonEvidence,comparisonEvidenceHash:evidenceHash!}:{})};
  const finish=(decision:string):JsonObject=>{const result={...audit,decision};if(assessment)this.assessments.set(result,assessment);return result;};
  const valid=()=>!signal.aborted&&!this.closed&&(!current||current.live)&&policyRevision===digest(JSON.stringify([workspace,this.protectedPaths,this.revision]));
  if(!valid())throw new AuthorizationFailure('approval_invalidated');
  if(!reason||(tool==='bash'&&this.trust))return finish(reason?'session-trust':'automatic');
  if(!this.channel)throw Object.assign(new AuthorizationFailure('approval_unavailable'),{audit:{...audit,decision:'approval_unavailable'}});
  let abort!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new AuthorizationFailure('approval_invalidated'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  try {
   const decision=await Promise.race([Promise.resolve().then(()=>this.channel!(request,signal)),cancelled]);
   if(!valid()||!decision||decision.requestId!==request.requestId||!['allow-once','deny','trust-shell'].includes(decision.decision))throw new AuthorizationFailure('approval_invalidated');
   if(decision.decision==='deny')throw new AuthorizationFailure('approval_denied');
   if(decision.decision==='trust-shell'){if(tool!=='bash'||!current)throw new AuthorizationFailure('approval_invalidated');this.trust=true;}
   return finish(decision.decision);
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
