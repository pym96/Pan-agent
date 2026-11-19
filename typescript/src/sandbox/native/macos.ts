/** Offline macOS boundary. No shell text analysis and no implicit host fallback. */
import type {WorkspaceGrant} from '../../config/workspace-trust.ts';
import {NativeNetwork, fetchClient, checkGateway, type ResolveAddresses} from './network.ts';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readdirSync, existsSync, realpathSync, lstatSync, writeFileSync, rmSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import type {AgentTool} from '../../protocol/agent-tool.ts';
import type {JsonObject} from '../../protocol/canonical-protocol.ts';
import {AuthorizationFailure, digest, PathAssessment} from '../../runtime/authorization.ts';
import {createPanTrustedLocalTools, executeBash} from '../../tools/pan-trusted-local-tools.ts';

const SANDBOX_EXEC='/usr/bin/sandbox-exec';
const SYSTEM_READ_ROOTS=Object.freeze(['/System/Library','/System/Cryptexes','/System/Volumes/Preboot/Cryptexes','/usr/bin','/usr/lib','/usr/libexec','/usr/share','/bin','/sbin','/Library/Apple/System/Library']);
const inside=(root:string,path:string)=>{const p=relative(root,path);return !p||(!isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep));};
const quote=(path:string)=>JSON.stringify(path);
const regexEscape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const insensitive=(text:string)=>[...text].map(c=>/[a-z]/i.test(c)?`[${c.toLowerCase()}${c.toUpperCase()}]`:regexEscape(c)).join('');
const RESERVED=['.git','.ssh','.pan-agent','.npmrc'];
function policyError(reason:string):never {throw new AuthorizationFailure('native_sandbox_'+reason);}

/** Fixed executable discovery, never model-controlled PATH or roots. Exact dylib files only. */
function runtimeFiles():string[]{
 const node=realpathSync(process.execPath),seen=new Set<string>();
 const visit=(file:string):void=>{
  if(seen.has(file)||SYSTEM_READ_ROOTS.some(root=>inside(root,file)))return;
  if(seen.size>=96)throw Error('native_sandbox_toolchain_too_large');
  const canonical=realpathSync(file);
  if(!lstatSync(canonical).isFile())throw Error('native_sandbox_invalid_toolchain');
  seen.add(file);seen.add(canonical);
  const result=spawnSync('/usr/bin/otool',['-L',file],{encoding:'utf8',timeout:3000,maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin'}});
  if(result.status!==0)throw Error('native_sandbox_toolchain_unavailable');
  for(const line of result.stdout.split('\n').slice(1)){
   const name=line.trim().split(' (')[0];if(!name)continue;
   let dependency=name;
   if(name.startsWith('@loader_path/'))dependency=resolve(dirname(file),name.slice(13));
   else if(name.startsWith('@executable_path/'))dependency=resolve(dirname(node),name.slice(17));
   else if(name.startsWith('@rpath/')){const candidates=[resolve(dirname(canonical),name.slice(7)),resolve(dirname(node),'../lib',name.slice(7))];dependency=candidates.find(existsSync)??candidates[0]!;}
   if(!isAbsolute(dependency))throw Error('native_sandbox_unsupported_toolchain');
   if(!SYSTEM_READ_ROOTS.some(root=>inside(root,dependency)))visit(dependency);
  }
 };
 visit(node);return [...seen].sort();
}

export interface NativeSandboxOptions {
 readonly workspace:string;
 /** Private state outside the live workspace. No arbitrary toolchain/read-root option. */
 readonly stateRoot:string;
 readonly network?:'public'|'offline';
 readonly privateGrant?:string;
 readonly credentialGrant?: WorkspaceGrant;
 readonly resolveNetworkName?:ResolveAddresses;
 readonly protectedPaths?:readonly string[];
 readonly notify?:(text:string)=>void;
}

export type NativeMacOptions = NativeSandboxOptions;

export class NativeMacSandbox {
 get executionMode(){return this.options.network==='public'?'native-macos-public' as const:'native-macos-offline' as const;}
 private broker?:NativeNetwork;
 private pendingGrant?:string;
 readonly workspace:string;
 readonly stateRoot:string;
 readonly tools:readonly AgentTool[];
 readonly protectedRoots:readonly string[];
 private temporary?:string;
 private profile?:string;
 private policyHash?:string;
 private runId?:string;
 private cancelled=false;
 private readonly controllers=new Set<AbortController>();
 private files:readonly string[]=[];
 private readonly options:NativeMacOptions;
 constructor(options:NativeMacOptions){
  this.options=options;this.pendingGrant=options.privateGrant;
  this.workspace=realpathSync(options.workspace);
  this.stateRoot=resolve(options.stateRoot);
  if(inside(this.workspace,this.stateRoot)||inside(this.stateRoot,this.workspace))throw Error('native_sandbox_state_overlap');
  this.protectedRoots=Object.freeze((options.protectedPaths??[]).map(p=>{const path=resolve(this.workspace,p);if(existsSync(path)&&realpathSync(path)!==path)throw Error('native_sandbox_protected_alias');return path;}));
  this.tools=createPanTrustedLocalTools(this.workspace,{},async(workspace,value,signal)=>{
   if(!this.profile||!this.temporary||!this.policyHash||this.cancelled)return {content:[{type:'text',text:'native_sandbox_unavailable'}],isError:true};
   const controller=new AbortController();const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();this.controllers.add(controller);
   try{return await executeBash(workspace,this.environment(),value,controller.signal,undefined,{executable:SANDBOX_EXEC,prefix:['-p',this.profile],evidence:this.identity,environment:this.environment(),settleGroup:true,credentialInput:this.options.credentialGrant?.take(value.command)});}
   finally{signal.removeEventListener('abort',abort);this.controllers.delete(controller);}
  },path=>this.assertFile(path),()=>{if(!this.profile||!this.policyHash||this.cancelled)policyError('unavailable');return this.policyHash;}).tools;
 }
 get identity():JsonObject{return {executionMode:this.executionMode,backend:'seatbelt',profileVersion:1,policyHash:this.policyHash??null,runId:this.runId??null,workspace:this.workspace,temporary:this.temporary??null,readRoots:[...SYSTEM_READ_ROOTS],runtimeFiles:[...this.files],protectedRoots:[...this.protectedRoots],network:this.broker?'bounded-http-get':'denied',privateGrant:this.broker?.grant??null,resourceQuotas:'not_enforced'};}
 private environment():Record<string,string>{return {PATH:(this.broker?dirname(fetchClient)+':':'')+dirname(realpathSync(process.execPath))+':/usr/bin:/bin:/usr/sbin:/sbin',HOME:this.temporary!,TMPDIR:this.temporary!,LANG:'C',LC_ALL:'C',...(this.broker?{PAN_NETWORK_SOCKET:this.broker.socket,PAN_LOCAL_SOCKETS:this.broker.local}:{}),OPENSSL_CONF:'/dev/null'};}
 private assertFile(path:string):void {
  if(!this.profile||this.cancelled)policyError('unavailable');
  if(!inside(this.workspace,path))policyError('outside_workspace');
  const names=relative(this.workspace,path).split(sep);
  if(names.some(n=>RESERVED.includes(n.toLowerCase())||/^\.env($|\.)/i.test(n)||/\.(pem|key)$/i.test(n)||/^id_(rsa|ed25519)$/i.test(n)))policyError('protected_path');
  const assessment=new PathAssessment(this.workspace,path,this.protectedRoots);
  if(assessment.reason&&assessment.reason!=='resource_equivalence_uncertain')policyError('protected_path');
  // AuthorizedFile performs no-follow/hardlink/identity rechecks at each effect.
 }
 async start(runId:string):Promise<void>{
  if(this.profile)throw Error('native_sandbox_already_active');
  if(process.platform!=='darwin')throw Error('native_sandbox_unsupported_platform: requires macOS sandbox-exec');
  if(!/^[a-zA-Z0-9_-]+$/.test(runId))throw Error('native_sandbox_invalid_run');
  this.options.credentialGrant?.start(this.workspace);
  this.cancelled=false;this.runId=runId;
  mkdirSync(this.stateRoot,{recursive:true,mode:0o700});
  const canonical=realpathSync(this.stateRoot);
  if(canonical!==this.stateRoot||inside(this.workspace,canonical)||inside(canonical,this.workspace))throw Error('native_sandbox_state_overlap_or_alias');
  const directory=join(this.stateRoot,runId);mkdirSync(directory,{mode:0o700});
  this.temporary=join(directory,'temporary');mkdirSync(this.temporary,{mode:0o700});
  // Pre-existing hardlink aliases cannot be assigned pathname authority safely.
  let entries=0;
  const inspect=(directory:string):void=>{for(const name of readdirSync(directory)){if(++entries>50000)throw Error('native_sandbox_workspace_scan_limit');const path=join(directory,name),s=lstatSync(path);if(s.isSymbolicLink())continue;if(s.isFile()&&s.nlink!==1)throw Error('native_sandbox_hardlink_workspace');if(s.isDirectory())inspect(path);}};
  inspect(this.workspace);
  this.files=runtimeFiles();
  if(this.options.network==='public')this.files=[...this.files,realpathSync(fetchClient)];
  if(this.files.some(path=>inside(this.workspace,path)))throw Error('native_sandbox_mutable_toolchain');
  try {
  if(this.options.network==='public'){
   const grant=this.pendingGrant;this.pendingGrant=undefined;
   this.broker=await NativeNetwork.open(directory,grant,this.options.resolveNetworkName);
   if(inside(this.workspace,this.broker.directory))throw Error('native_sandbox_network_state_overlap');
  }
  // System directories and exact executable dependencies are readonly, never HOME or /private.
  const readable=[...SYSTEM_READ_ROOTS,this.workspace,this.temporary];
  let profile='(version 1)\n(deny default)\n(allow process-fork)\n(allow process-info* (target same-sandbox))\n(allow signal (target same-sandbox))\n';
  profile+='(allow sysctl-read '+['hw.activecpu','hw.ncpu','hw.logicalcpu','hw.logicalcpu_max','hw.physicalcpu','hw.physicalcpu_max','hw.memsize','hw.pagesize','hw.pagesize_compat','hw.cachelinesize_compat','hw.cputype','hw.cpusubtype','hw.cpufamily','hw.machine','hw.optional.arm64','kern.osrelease','kern.ostype','kern.osversion','kern.maxfilesperproc'].map(name=>`(sysctl-name ${quote(name)})`).join(' ')+')\n';
  // dyld needs root directory itself. Metadata reveals existence, never arbitrary file bytes.
  profile+='(allow file-read* (literal "/") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))\n(allow file-read-metadata)\n';
  profile+='(allow file-read* '+readable.map(p=>`(subpath ${quote(p)})`).join(' ')+' '+this.files.map(p=>`(literal ${quote(p)})`).join(' ')+')\n';
  profile+='(allow process-exec '+readable.map(p=>`(subpath ${quote(p)})`).join(' ')+' '+this.files.map(p=>`(literal ${quote(p)})`).join(' ')+')\n';
  profile+='(allow file-write* (subpath '+quote(this.workspace)+') (subpath '+quote(this.temporary)+') (literal "/dev/null"))\n';
  if(this.broker){
   const local='(subpath '+quote(this.broker.local)+')';
   profile+='(allow file-read* (literal "/private/etc/ssl/openssl.cnf"))\n';
   profile+='(allow file-read* file-write* '+local+')\n';
   profile+='(allow network-bind network-inbound '+local+')\n';
   profile+='(allow network-outbound (remote unix-socket (path '+quote(this.broker.socket)+')) '+local+')\n';
  }
  const base=regexEscape(this.workspace);
  const patterns=[...RESERVED.map(n=>`^${base}/(.*/)?${insensitive(n)}(/|$)`),`^${base}/(.*/)?${insensitive('.env')}($|[./])`,`^${base}/.*[.]([pP][eE][mM]|[kK][eE][yY])$`,`^${base}/(.*/)?${insensitive('id_rsa')}($|/)`,`^${base}/(.*/)?${insensitive('id_ed25519')}($|/)`];
  profile+='(deny process-exec file-read* file-write* '+patterns.map(p=>`(regex ${quote(p)})`).join(' ')+' '+this.protectedRoots.map(p=>`(subpath ${quote(p)})`).join(' ')+')\n';
  profile+='(deny file-link)\n';
  this.policyHash=digest(this.broker?JSON.stringify([profile,'bounded-get-v1',this.broker.grant??null]):profile);this.profile=profile;
  const check=spawnSync(SANDBOX_EXEC,['-p',profile,'/bin/bash','-c','printf pan-native-ready'],{cwd:this.workspace,env:this.environment(),encoding:'utf8',timeout:5000,maxBuffer:4096,stdio:['ignore','pipe','pipe']});
  if(check.error||check.status!==0||check.stdout!=='pan-native-ready'){this.profile=undefined;throw Error('native_sandbox_setup_failed: OS boundary unavailable or profile rejected; no host fallback');}
  if(this.broker)await checkGateway(SANDBOX_EXEC,['-p',profile],this.workspace,this.environment());
  writeFileSync(join(directory,'policy.sb'),profile,{flag:'wx',mode:0o600});
  writeFileSync(join(directory,'identity.json'),JSON.stringify(this.identity,null,2)+'\n',{flag:'wx',mode:0o600});
  if(this.cancelled){await this.stop('cancelled_during_setup');throw Error('native_sandbox_cancelled');}
  this.options.notify?.('NATIVE MACOS SANDBOX '+(this.broker?'bounded GET':'offline')+' policy='+this.policyHash);
  }catch(error){this.profile=undefined;this.broker?.close();this.broker=undefined;rmSync(this.temporary,{recursive:true,force:true});throw error;}
 }
 cancel():void{this.options.credentialGrant?.expire();this.cancelled=true;this.broker?.close();for(const controller of this.controllers)controller.abort();}
 async stop(_reason:string):Promise<void>{this.cancel();this.profile=undefined;this.broker=undefined;if(this.temporary&&this.controllers.size===0)rmSync(this.temporary,{recursive:true,force:true});}
}
