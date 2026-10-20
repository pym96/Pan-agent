/** Explicit operator selection; never populated from retrieved/model text. */
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AuthorizedFile } from '../tools/authorized-file.ts';
import { digest } from '../runtime/authorization.ts';
export const RETRIEVAL_LIMITS=Object.freeze({roots:8,entries:1024,files:128,totalBytes:4*1024*1024,fileBytes:256*1024,archiveBytes:1024*1024,chunks:4096,chunkChars:800,results:8,queryChars:256,depth:12,configBytes:16384,resultBytes:65536,diagnostics:32});
export type SourceKind='documents'|'history'|'ledger'|'runbook';
export interface Anchor {path:string;dev:number;ino:number;kind:SourceKind}
export interface RetrievalConfig {schema:'pan-retrieval/v1';workspace:string;workspaceDev:number;workspaceIno:number;enabled:boolean;sources:Anchor[]}
export class RetrievalFailure extends Error {readonly code:string;constructor(code:string){super(code);this.code=code;}}
export function inside(root:string,path:string):boolean {const p=relative(root,path);return !p||(!isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep));}
export function pin(path:string,kind:SourceKind):Anchor {
 for(let p=path;;p=dirname(p)){const s=lstatSync(p);if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory())||(s.isFile()&&s.nlink!==1))throw new RetrievalFailure('unsupported_link_or_target');if(dirname(p)===p)break;}
 const s=lstatSync(path);if((kind==='documents'||kind==='history')?!s.isDirectory():!s.isFile())throw new RetrievalFailure('source_kind_mismatch');
 return {path,kind,dev:s.dev,ino:s.ino};
}
export function recheck(anchor:Anchor):void {const now=pin(anchor.path,anchor.kind);if(now.dev!==anchor.dev||now.ino!==anchor.ino)throw new RetrievalFailure('source_root_replaced');}
export const configPath=(workspace:string)=>join(workspace,'.pan-agent','retrieval.json');
const keys=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));
export function loadRetrievalConfig(workspace:string,signal:AbortSignal):{config:RetrievalConfig;revision:string}|undefined {
 const path=configPath(workspace);try{lstatSync(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}
 const f=new AuthorizedFile(path,signal);let body:string;try{body=f.readBounded(RETRIEVAL_LIMITS.configBytes);}finally{f.close();}
 let c:RetrievalConfig;try{c=JSON.parse(body) as RetrievalConfig;}catch{throw new RetrievalFailure('retrieval_config_invalid');}
 if(!c||typeof c!=='object'||!keys(c as unknown as Record<string,unknown>,['schema','workspace','workspaceDev','workspaceIno','enabled','sources'])||c.schema!=='pan-retrieval/v1'||c.workspace!==workspace||typeof c.enabled!=='boolean'||!Array.isArray(c.sources)||c.sources.length>RETRIEVAL_LIMITS.roots)throw new RetrievalFailure('retrieval_config_invalid');
 const w=lstatSync(workspace);if(w.dev!==c.workspaceDev||w.ino!==c.workspaceIno)throw new RetrievalFailure('workspace_replaced');
 for(const a of c.sources){if(!a||typeof a!=='object'||!keys(a as unknown as Record<string,unknown>,['path','kind','dev','ino'])||!['documents','history','ledger','runbook'].includes(a.kind)||typeof a.path!=='string'||!isAbsolute(a.path)||resolve(a.path)!==a.path||!Number.isSafeInteger(a.dev)||!Number.isSafeInteger(a.ino)||(a.kind==='documents'&&!inside(workspace,a.path)))throw new RetrievalFailure('retrieval_config_invalid');}
 if(c.enabled&&!c.sources.length||new Set(c.sources.map(a=>a.path)).size!==c.sources.length)throw new RetrievalFailure('retrieval_config_invalid');
 const history=c.sources.find(a=>a.kind==='history');if(c.sources.some(a=>a.kind==='ledger'&&(!history||a.path!==join(history.path,'retrospective-ledger.jsonl'))))throw new RetrievalFailure('retrieval_config_invalid');
 if(c.sources.some(a=>a.kind==='runbook'&&basename(a.path)!=='RUNBOOK.md'||a.kind==='ledger'&&basename(a.path)!=='retrospective-ledger.jsonl'))throw new RetrievalFailure('retrieval_config_invalid');
 if(c.sources.filter(a=>a.kind==='history').length>1||c.sources.filter(a=>a.kind==='ledger').length>1||c.sources.filter(a=>a.kind==='runbook').length>1)throw new RetrievalFailure('retrieval_config_invalid');
 return {config:c,revision:digest(body)};
}
export function configureRetrieval(workspaceInput:string,selection:unknown):RetrievalConfig {
 const workspace=realpathSync(workspaceInput);const w=lstatSync(workspace);
 if(!selection||typeof selection!=='object'||Array.isArray(selection))throw new RetrievalFailure('selection_invalid');
 const s=selection as Record<string,unknown>;
 if(!keys(s,['documents','history','ledger','runbook'])||!Array.isArray(s.documents)||s.documents.some(p=>typeof p!=='string'||!p.trim())||!(s.history===undefined||typeof s.history==='string')||!(s.runbook===undefined||typeof s.runbook==='string')||!(s.ledger===undefined||typeof s.ledger==='boolean'))throw new RetrievalFailure('selection_invalid');
 const sources:Anchor[]=[];
 for(const p of s.documents as string[]){const path=resolve(workspace,p);if(!inside(workspace,path))throw new RetrievalFailure('outside_workspace');sources.push(pin(path,'documents'));}
 if(s.history){sources.push(pin(resolve(workspace,s.history as string),'history'));if(s.ledger)sources.push(pin(join(resolve(workspace,s.history as string),'retrospective-ledger.jsonl'),'ledger'));}else if(s.ledger)throw new RetrievalFailure('ledger_requires_history');
 if(s.runbook){if(basename(s.runbook as string)!=='RUNBOOK.md')throw new RetrievalFailure('runbook_filename_required');sources.push(pin(resolve(workspace,s.runbook as string),'runbook'));}
 if(sources.length>RETRIEVAL_LIMITS.roots||!sources.length||new Set(sources.map(a=>a.path)).size!==sources.length)throw new RetrievalFailure('selection_invalid');
 const c:RetrievalConfig={schema:'pan-retrieval/v1',workspace,workspaceDev:w.dev,workspaceIno:w.ino,enabled:true,sources};writeConfig(c);return c;
}
function writeConfig(c:RetrievalConfig):void {const f=new AuthorizedFile(configPath(c.workspace),new AbortController().signal);try{f.write(JSON.stringify(c,null,2)+'\n');}finally{f.close();}}
export function retrievalCommand(args:readonly string[]):string {
 const [command,flag,workspaceInput,...rest]=args;
 if(flag!=='--workspace'||!workspaceInput)throw new RetrievalFailure('usage: retrieval configure|show|disable --workspace DIR [--from selection.json]');
 const workspace=realpathSync(workspaceInput),signal=new AbortController().signal;
 if(command==='configure'&&rest.length===2&&rest[0]==='--from'){
  const f=new AuthorizedFile(resolve(rest[1]!),signal);let text:string;try{text=f.readBounded(RETRIEVAL_LIMITS.configBytes);}finally{f.close();}
  return JSON.stringify(configureRetrieval(workspace,JSON.parse(text)),null,2);
 }
 if(rest.length)throw new RetrievalFailure('retrieval_command_invalid');
 const loaded=loadRetrievalConfig(workspace,signal);
 if(command==='show')return JSON.stringify(loaded?.config??{enabled:false,sources:[]},null,2);
 if(command==='disable'){if(loaded)writeConfig({...loaded.config,enabled:false,sources:[]});return 'Retrieval disabled; selected sources cleared.';}
 throw new RetrievalFailure('retrieval_command_invalid');
}
