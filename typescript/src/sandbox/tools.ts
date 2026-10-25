import {panToolDefinitions} from '../tools/pan-trusted-local-tools.ts';
import {invocationAuthority} from '../runtime/authorization.ts';
import type {AgentTool} from '../protocol/agent-tool.ts';
import {DockerSandbox} from './docker.ts';
/** Reuse only schema validation; no trusted-local executor can be invoked here. */
export function createSandboxTools(box:DockerSandbox):{tools:readonly AgentTool[]}{
 return {tools:panToolDefinitions().map(base=>({...base,
  description:'Docker sandbox /workspace/task (selected inputs /inputs read-only): '+base.description,
  async execute(invocation){
   try{const authority=invocationAuthority();const identity=JSON.stringify(box.identity);const audit=await authority.authorizeSandbox('/workspace/task',base.name,invocation.toolCallId,invocation.arguments,identity,invocation.signal);
    authority.assertCurrent(audit,invocation.signal);if(identity!==JSON.stringify(box.identity))throw Error('sandbox_identity_changed');
    const result=await box.call(base.name,invocation.arguments,invocation.signal);authority.assertCurrent(audit,invocation.signal);
    return {content:[{type:'text' as const,text:result.stdout+(result.stderr?'\n'+result.stderr:'')}],isError:result.code!==0,details:{...result,authorization:audit,sandbox:box.identity}};
   }catch(error){return {content:[{type:'text' as const,text:String(error)}],isError:true};}
  }
 }))};
}
