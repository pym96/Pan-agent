import { existsSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { digest, fileDigest, keys, insist, hex, hash, ident, type Manifest, type Attempt } from './model.ts';
import { read, atomic } from './storage.ts';
import { environment, git } from './process.ts';

export const CONTRACT='486cdcbef921f3d4e183de8aa906350ee69a80887af308c4753c04b6b42e28b9';
export const connectorTemplates={
 builder:'SessionRole: Working Agent (Builder). Human-delegated fresh session for one sumIntegers trial only. Implement finite safe integers with safe running totals, Node tests and README. Run tests. Do not commit or push; the connector commits validated output. No main, other issue, session takeover, subagent, credential or policy changes.',
 regulator:'SessionRole: Regulator Agent. Human-delegated fresh independent session. Read the exact candidate and run its tests. Add negative probes only in the provided probe directory, never edit candidate files. Judge frozen C-SUM-01 with all required cases. No commit, push, other issue, session takeover, subagent, credential or policy changes.'
} as const;
export const TRIAL='sumIntegers(values): [] returns 0; [2,-1,3] returns 4; [Number.MAX_SAFE_INTEGER] unchanged. Reject [1.5], [true], ["1"], [Infinity], [Number.MAX_SAFE_INTEGER+1], [Number.MAX_SAFE_INTEGER,1]. Reject every non-finite/non-safe-integer input and every unsafe running total. Export sumIntegers from sum-integers.js (ES module). Provide sum-integers.test.js and README.md. Only C-SUM-01 may route repair.';
export interface Binding {
 stage:'A'|'B'; contract:string; connectorSha:string; manifestDigest:string;
 delegation:'HF-20260909-061'; roles:['builder','regulator']; campaign:string;
 cli:{path:string;sha256:string;version:'codex-cli 0.153.4'}; model:string; auth:'chatgpt'; codexHome:string;
 github:{repository:'pym96/Pan-agent';issue:46;executable:string;sha256:string;author:string};
 stageAReview:string|null; humanReview:string|null; masterActivation:string|null;
}
export const fixtureCLI=fileURLToPath(new URL('../fixtures/codex-fixture.mjs',import.meta.url));
export function bindingShape(b:any,m:Manifest):asserts b is Binding {
 keys(b,['stage','contract','connectorSha','manifestDigest','delegation','roles','campaign','cli','model','auth','codexHome','github','stageAReview','humanReview','masterActivation']);
 insist(b.stage===(m.mode==='connector-test'?'A':'B') && b.contract===CONTRACT && hex(b.connectorSha) && hash(b.manifestDigest),'activation_identity');
 insist(b.delegation==='HF-20260909-061' && JSON.stringify(b.roles)==='["builder","regulator"]' && ident(b.campaign),'role_delegation');
 insist(b.auth==='chatgpt' && typeof b.model==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(b.model),'subscription_auth_required');
 keys(b.cli,['path','sha256','version']);insist(b.cli.version==='codex-cli 0.153.4' && hash(b.cli.sha256) && typeof b.cli.path==='string' && resolve(b.cli.path)===b.cli.path,'cli_identity');
 keys(b.github,['repository','issue','executable','sha256','author']);insist(b.github.repository==='pym96/Pan-agent' && b.github.issue===46 && hash(b.github.sha256) && typeof b.github.executable==='string' && resolve(b.github.executable)===b.github.executable && /^[A-Za-z0-9-]{1,39}$/.test(b.github.author),'tracker_target');
 insist(typeof b.codexHome==='string' && resolve(b.codexHome)===b.codexHome && !b.codexHome.startsWith(m.workspace+'/'),'auth_home_scope');
 const url=(x:unknown)=>typeof x==='string' && /^https:\/\/github.com\/pym96\/Pan-agent\/issues\/46#issuecomment-[0-9]+$/.test(x);
 if(b.stage==='B')insist(url(b.stageAReview) && url(b.humanReview) && url(b.masterActivation),'stage_b_not_activated');
 else insist(b.stageAReview===null && b.humanReview===null && b.masterActivation===null && b.cli.path===fixtureCLI,'offline_fixture_only');
 insist(m.repository==='sum-integers-trial' && m.issue===46 && m.version==='1.0' && JSON.stringify(m.criteria)==='["C-SUM-01"]' && m.highRisk.length===0 && m.humanProof===null,'trial_identity');
}
export function validateBinding(m:Manifest):Binding {
 const b=read(join(m.workspace,'delegation.json'));bindingShape(b,m);
 const auth=read(join(m.workspace,'authorization.json'));
 insist(auth.bindingDigest===digest(b) && b.manifestDigest===auth.manifestDigest,'delegation_changed');
 insist(fileDigest(b.cli.path)===b.cli.sha256 && fileDigest(b.github.executable)===b.github.sha256,'executable_changed');
 if(b.stage==='B') {
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  insist(git(root,['rev-parse','HEAD'])===b.connectorSha && git(root,['status','--porcelain'])==='','connector_not_reviewed_bytes');
 }
 return b;
}
export function connectorEnvironment(m:Manifest,b:Binding):NodeJS.ProcessEnv {
 return {...environment(join(m.workspace,'home')),PATH:join(resolve(m.executable,'..'))+':/usr/bin:/bin',CODEX_HOME:b.codexHome};
}
export function toolEnvironment(m:Manifest):Record<string,string> {return {...environment(join(m.workspace,'home')),PATH:resolve(m.executable,'..')+':/usr/bin:/bin'} as Record<string,string>;}
export function codexArgs(m:Manifest,b:Binding,a:Attempt,dir:string):string[] {
 const tools=toolEnvironment(m),cwd=a.role==='builder'?a.worktree:join(dir,'probes');
 const config=[
  'forced_login_method="chatgpt"','model_provider="openai"','approval_policy="never"',
  'shell_environment_policy.inherit="none"','shell_environment_policy.experimental_use_profile=false',
  'shell_environment_policy.set='+JSON.stringify(tools).replace(/"([^"\\]+)":/g,'"$1"='),
  'sandbox_workspace_write.network_access=false','sandbox_workspace_write.exclude_tmpdir_env_var=true','sandbox_workspace_write.exclude_slash_tmp=true',
  'mcp_servers={}','hooks={}','plugins={}','features.multi_agent=false','features.apps=false','features.hooks=false',
  'web_search="disabled"','project_doc_max_bytes=0'
 ];
 return ['exec','--ignore-user-config','--strict-config','--json','--color','never','--sandbox','workspace-write','--model',b.model,'--cd',cwd,'--output-schema',join(dir,'schema.json'),'--output-last-message',join(dir,'last-message.json'),...config.flatMap(x=>['-c',x]),'-'];
}
// Stage B only. The official CLI, not this program, handles subscription credentials.
export function validateSubscriptionStatus(status:number|null,version:string,text:string):void {
 insist(status===0 && version==='codex-cli 0.153.4' && text.trim()==='Logged in using ChatGPT','subscription_auth_unconfirmed');
}
export function subscriptionPreflight(m:Manifest,b:Binding):void {
 insist(b.stage==='B','stage_b_not_activated');
 insist(realpathSync(b.codexHome)===b.codexHome && lstatSync(b.codexHome).isDirectory(),'auth_home_scope');
 const allowed=new Set(['auth.json','sessions','archived_sessions','history.jsonl','logs','log','tmp','version.json','models_cache.json','state_5.sqlite','state_5.sqlite-shm','state_5.sqlite-wal']);
 insist(readdirSync(b.codexHome).every(x=>allowed.has(x)),'unapproved_auth_home_config');
 // Refuse project/ancestor config. The dedicated tool HOME and auth home contain no inherited extension/config roots.
 for(let p=m.workspace;;p=resolve(p,'..')){for(const n of ['.codex','.agents','.claude'])insist(!existsSync(join(p,n)),'unapproved_project_config');if(resolve(p,'..')===p)break;}
 for(const p of ['/etc/codex/config.toml','/etc/codex/managed_config.toml','/etc/codex/requirements.toml'])insist(!existsSync(p),'unapproved_managed_config');
 const env=connectorEnvironment(m,b);
 let version:string,login:string;
 try {version=execFileSync(b.cli.path,['--version'],{env,encoding:'utf8',timeout:3000}).trim();
  const observed=spawnSync(b.cli.path,['login','status','-c','forced_login_method="chatgpt"'],{env,encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']});insist(observed.status===0,'subscription_auth_unconfirmed');login=(observed.stdout+observed.stderr).trim();
 }catch{throw new Error('subscription_auth_unconfirmed');}
 validateSubscriptionStatus(0,version,login);
 atomic(join(m.workspace,'auth-observation.json'),{auth:'chatgpt',version,credentials:'handled only by official CLI; never read or copied'});
}
