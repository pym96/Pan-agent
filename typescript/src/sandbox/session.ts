import {DockerSandbox,type SandboxConfig} from './docker.ts';
import {createSandboxTools} from './tools.ts';
import type {AgentTool} from '../protocol/agent-tool.ts';
import {panToolDefinitions} from '../tools/pan-trusted-local-tools.ts';
/** One new workspace per task. Model context can persist, workspace authority cannot. */
export class SandboxSession {
 private box?:DockerSandbox;private cancelled=false;
 readonly config:SandboxConfig;readonly notify:(text:string)=>void;
 constructor(config:SandboxConfig,notify:(text:string)=>void=()=>{}){this.config=config;this.notify=notify;}
 readonly tools:readonly AgentTool[]=panToolDefinitions().map(base=>({...base,description:'Sandbox container only: '+base.description,execute:async invocation=>{
  if(!this.box)return {content:[{type:'text' as const,text:'sandbox_unavailable'}],isError:true};
  return createSandboxTools(this.box).tools.find(t=>t.name===base.name)!.execute(invocation);
 }}));
 async start(runId:string){this.cancelled=false;this.box=undefined;const box=await DockerSandbox.prepare(this.config);this.box=box;await box.bindRun(runId);this.notify('SANDBOX '+box.directory);if(this.cancelled)await box.stop('cancelled_during_prepare');}
 async stop(reason:string){if(this.box)await this.box.stop(reason);}
 cancel(){this.cancelled=true;void this.stop('task_cancelled').catch(()=>{});}
}
