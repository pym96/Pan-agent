import { existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixture.ts';
import { run, status, stop, type Options } from './coordinator.ts';
import { CodexProcess } from './codex-process.ts';
import { GitHubTracker, GhIssueTransport, type IssueTransport, type Comment } from './github-tracker.ts';
import { connectorTemplates, fixtureCLI, CONTRACT, TRIAL, validateBinding, bindingShape, type Binding, codexArgs } from './connector-authority.ts';
import { digest, fileDigest, manifestCore, validate, shape, insist, safe, Refusal, type Manifest } from './model.ts';
import { read, atomic, load, save, acquire } from './storage.ts';
import { git } from './process.ts';

export class FileIssueTransport implements IssueTransport {
 private root:string;
 constructor(root:string){this.root=root;mkdirSync(root,{recursive:true,mode:0o700});}
 list():Comment[]{return existsSync(join(this.root,'comments.json'))?read(join(this.root,'comments.json')):[];}
 post(body:string):void {const all=this.list(),id=all.length+1;all.push({id,body,author:'fixture',url:`https://github.com/pym96/Pan-agent/issues/46#issuecomment-${id}`});atomic(join(this.root,'comments.json'),all);}
}
// Operator preparation is separate from inference. Tests can only authorize the fixed fake CLI.
export function authorizeConnector(m:Manifest,b:Binding):void {
 b.manifestDigest=digest(manifestCore(m));bindingShape(b,m);
 const auth={id:m.authorization.id,manifestDigest:b.manifestDigest,bindingDigest:digest(b)};
 m.authorization.digest=digest(auth);atomic(join(m.workspace,'delegation.json'),b);atomic(join(m.workspace,'authorization.json'),auth);atomic(join(m.workspace,'manifest.json'),m);
}
export function connectorFixture():ReturnType<typeof fixture> {
 const f=fixture('accept'),m=f.manifest;m.mode='connector-test';m.repository='sum-integers-trial';m.issue=46;m.branch='workorder/46-candidate';m.criteria=['C-SUM-01'];m.templates={builder:digest(connectorTemplates.builder),regulator:digest(connectorTemplates.regulator)};
 writeFileSync(join(m.workspace,'contract.txt'),TRIAL+'\n');m.contractDigest=fileDigest(join(m.workspace,'contract.txt'));
 atomic(join(m.workspace,'repository.json'),{id:m.repository});git(join(m.workspace,'repo'),['push','origin',`HEAD:refs/heads/${m.branch}`]);
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const b:Binding={stage:'A',contract:CONTRACT,connectorSha:git(root,['rev-parse','HEAD']),manifestDigest:digest(manifestCore(m)),delegation:'HF-20260909-061',roles:['builder','regulator'],campaign:'single-synthetic-campaign',cli:{path:fixtureCLI,sha256:fileDigest(fixtureCLI),version:'codex-cli 0.153.4'},model:'synthetic-only',auth:'chatgpt',codexHome:join(m.workspace+'-unused-auth'),github:{repository:'pym96/Pan-agent',issue:46,executable:process.execPath,sha256:fileDigest(process.execPath),author:'fixture'},stageAReview:null,humanReview:null,masterActivation:null};
 authorizeConnector(m,b);return f;
}
export function dryRun(config:unknown):object {
 shape(config);insist(config.mode!=='offline','connector_mode_required');const m=validate(config),b=validateBinding(m);
 return {stage:b.stage,simulation:m.mode==='connector-test'?'SIMULATED':'TRIAL NOT STARTED',auth:b.auth,model:b.model,cliVersion:b.cli.version,connectorSha:b.connectorSha,issue:46,limits:m.limits,delegatedRoles:b.roles,realLaunches:0,credentialReads:0,requirements:'Stage B requires independent PASS, Human review and exact Master binding. dry-run never reads account authentication.'};
}
export async function runConnector(config:unknown,resume=false,options:Options={},transport?:IssueTransport):Promise<object> {
 shape(config);insist(config.mode!=='offline','connector_mode_required');const m=validate(config),b=validateBinding(m),root=join(m.workspace,'state');
  const wire=transport??(m.mode==='connector-test'?new FileIssueTransport(join(m.workspace,'fixture-github')):new GhIssueTransport(b,root));
 // A real transport is constructed only after a Stage B binding validates; fixture mode cannot select it.
  const tracker=new GitHubTracker(wire,join(root,'github-receipts'),b);
  if(resume && existsSync(join(root,'ledger.json'))) {
    const old=load(root),active=old.attempts.at(-1);
    const recorded=old.attempts.some(a=>a.phase==='recorded');
    const stopping=existsSync(join(root,'stop.json')) || Date.now()>=Math.min(old.expiry,(active?.intentAt??old.created)+m.limits.roleMs);
    if(active && active.phase!=='recorded' && (stopping || recorded)) {
      // Never let synchronous tracker/auth I/O delay an owned stop. Local result trust is still checked.
      // Without a pending stop, uncertain remote history conservatively stops owned work for reconciliation.
      await run(m,root,true,{...options,connector:true,process:options.process??new CodexProcess(),tracker:{lookup(key){if(!stopping)throw new Refusal('tracker_unknown');return read(join(root,'attempts',key,'result.json'));},publish(){throw new Refusal('tracker_unknown');}}});
      const release=acquire(root);
      try {
        const current=load(root);const cleanupState=current.state,cleanupReason=current.reason;
        try {
          if(m.mode==='codex')wire.list();
          for(const a of current.attempts)if(a.phase==='recorded')insist(digest(tracker.lookup(a.key))===a.resultDigest,'recorded_result_invalid');
        } catch {
          current.state=cleanupState==='cleanup_failed'?'cleanup_failed':'needs_reconciliation';current.reason='recorded_result_invalid';save(root,current);
        }
        atomic(join(root,'pre-transport-cleanup.json'),{cleanupState,cleanupReason,historyState:current.state,historyReason:current.reason,remoteCheckedAfterOwnedCleanup:true});
        if(['cancelled','timed_out','cleanup_failed'].includes(current.state))tracker.publishSummary(status(root),digest(manifestCore(m)));
        return status(root);
      } finally {release();}
    }
  }
  if(m.mode==='codex')wire.list(); // authoritative read-back before a fresh role can launch
  const result:any=await run(m,root,resume,{...options,connector:true,process:options.process??new CodexProcess(),tracker});
  if(['accepted_pending_master','needs_human','cancelled','timed_out','cleanup_failed'].includes(result.state)){
    const release=acquire(root);try{tracker.publishSummary(result,digest(manifestCore(m)));}finally{release();}
  }
  return result;
}
export async function connectorMain(args:string[]):Promise<void> {
 const [command,...paths]=args;
 if(command==='demo'){const f=connectorFixture();console.log(safe({simulation:'SIMULATED',workspace:f.workspace,config:f.config,state:f.state}));console.log(safe(await runConnector(f.manifest)));return;}
 insist(paths.length===1,'usage');
 if(command==='status'){console.log(safe(status(resolve(paths[0]!))));return;}
 if(command==='stop'){stop(resolve(paths[0]!));console.log(safe({state:'stop_requested'}));return;}
 const m=read(resolve(paths[0]!));
 if(command==='dry-run'){console.log(safe(dryRun(m)));return;}
 insist(command==='start'||command==='resume','usage');console.log(safe(await runConnector(m,command==='resume')));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))connectorMain(process.argv.slice(2)).catch(e=>{console.error(safe({state:'refused',reason:e instanceof Refusal?e.category:'connector_unconfirmed'}));process.exitCode=1;});
