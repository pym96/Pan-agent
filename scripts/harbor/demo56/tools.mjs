// External Harbor-bound adapter. Runtime/package bytes remain unchanged.
import {pathToFileURL} from 'node:url';
import {resolve,posix} from 'node:path';
export function filePath(path) {
 if(typeof path!=='string'||!path||path.includes('\0'))throw Error('invalid_path');
 const full=posix.resolve('/app',path);
 if(full!=='/app'&&!full.startsWith('/app/'))throw Error('outside_container_workspace');
 return full;
}
export async function createBoundTools({entry,workspace,containerId,rpc}) {
 const base=resolve(entry,'../..');
 const {createPanTrustedLocalTools}=await import(pathToFileURL(base+'/dist/tools/pan-trusted-local-tools.js'));
 const {invocationAuthority,authorizationError}=await import(pathToFileURL(base+'/dist/runtime/authorization.js'));
 return {tools:createPanTrustedLocalTools(workspace).tools.map(original=>({...original,
  description:original.description+' Execution is in one fixed Harbor task container; file paths are relative to /app. Never executes on host.',
  async execute(invocation) {
   try {
    const checked=original.validate(invocation.arguments);if(!checked.ok)throw Error('invalid_arguments');
    const args=JSON.parse(JSON.stringify(checked.value));if(original.name!=='bash')filePath(args.path);
    if(invocation.signal.aborted)throw Error('aborted_before_dispatch');
    const authority=invocationAuthority();
    const audit=await authority.authorize(workspace,original.name,invocation.toolCallId,args,containerId,invocation.signal);
    authority.assertCurrent(audit,invocation.signal);
    if(invocation.signal.aborted)throw Error('aborted_before_dispatch');
    const result=await rpc('tool',{tool:original.name,arguments:args},invocation.signal);
    return {...result,details:{...result.details,authorization:audit,containerId,executionBoundary:'Harbor task container'}};
   } catch(error) {
    if(error?.code)return authorizationError(error);
    return {content:[{type:'text',text:error.message??'bridge_failed'}],isError:true};
   }
  }
 }))};
}
