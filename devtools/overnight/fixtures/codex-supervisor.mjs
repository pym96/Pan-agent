// Fixed wrapper used in both offline connector tests and the later explicitly activated trial.
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {mkdirSync,openSync,writeSync,closeSync,readFileSync,writeFileSync,chmodSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {atomic,read,birth} from '../src/storage.ts';
import {validate,digest,fileDigest,classification,insist} from '../src/model.ts';
import {validateBinding,connectorEnvironment,codexArgs,connectorTemplates,TRIAL,subscriptionPreflight} from '../src/connector-authority.ts';
import {responseSchema,inspectOutput} from '../src/connector-output.ts';
import {git} from '../src/process.ts';
const dir=process.argv[2],{manifest:m,attempt:a}=read(join(dir,'input.json'));
process.umask(0o077);
atomic(join(dir,'receipt.json'),{pid:process.pid,birth:birth(process.pid),key:a.key,session:a.session});
try {
 validate(m);const b=validateBinding(m);
 mkdirSync(join(dir,'probes'),{mode:0o700});atomic(join(dir,'schema.json'),responseSchema);
 const args=codexArgs(m,b,a,dir),env=connectorEnvironment(m,b);
 atomic(join(dir,'effective-config.json'),{argv:args,environment:env,auth:b.auth,cli:b.cli,model:b.model,source:b.stage==='A'?'SIMULATED':'TRIAL',permissions:'workspace-write; network-disabled tools; no escalation',config:'ignore-user-config; dedicated auth home; reject inherited extension/project roots'});
 const commonRules=readFileSync(fileURLToPath(new URL('../../../AGENTS.md',import.meta.url)),'utf8');
 const prompt=connectorTemplates[a.role]+'\nCommon AGENTS.md from the reviewed connector (map links refer to its enclosing project):\n'+commonRules+'\nHuman-approved trial assignment; use this supplied contract and the separate candidate/probe paths only:\n'+TRIAL+'\n'+JSON.stringify({role:a.role,session:a.session,inputCandidate:a.candidate,candidateDirectory:a.worktree,probeDirectory:join(dir,'probes'),result:'Return the required structured outcome only; use C-SUM-01 for criterion_failed.',allowedFiles:['sum-integers.js','sum-integers.test.js','README.md','package.json']});
 atomic(join(dir,'prompt-identity.json'),{digest:digest(prompt),template:m.templates[a.role],commonRulesDigest:digest(commonRules)});
 const log=openSync(join(dir,'private-events.jsonl'),'wx',0o600),err=openSync(join(dir,'private-stderr.txt'),'wx',0o600);
 const child=spawn(b.stage==='A'?m.executable:b.cli.path,b.stage==='A'?['--import',fileURLToPath(new URL('./connector-guard.mjs',import.meta.url)),b.cli.path,...args]:args,{cwd:a.role==='builder'?a.worktree:join(dir,'probes'),env,stdio:['pipe','pipe','pipe']});
 let bytes=0,overflow=false;
 const capture=(fd,chunk)=>{bytes+=chunk.length;if(bytes>16*1024*1024){overflow=true;child.kill('SIGTERM');}else writeSync(fd,chunk);};
 child.stdout.on('data',c=>capture(log,c));child.stderr.on('data',c=>capture(err,c));child.stdin.on('error',()=>{});child.stdin.end(prompt);
 const exit=await new Promise(resolve=>{child.on('error',()=>resolve(null));child.on('close',resolve);});closeSync(log);closeSync(err);
 insist(!overflow,'codex_output_limit');const observed=inspectOutput(dir,a,exit);const output=read(join(dir,'last-message.json'));
 // A thread is associated with one attempt only. An exclusive marker detects reused sessions across repairs.
 const marker=join(m.workspace,'thread-'+digest(observed.thread));const fd=openSync(marker,'wx',0o600);writeSync(fd,a.key);closeSync(fd);
 atomic(join(dir,'codex-session.json'),{thread:observed.thread,requestSession:a.session,rawDigest:fileDigest(join(dir,'private-events.jsonl')),lastDigest:fileDigest(join(dir,'last-message.json')),exit,usage:observed.usage});
 insist(git(join(m.workspace,'remote.git'),['rev-parse','main'])===m.base,'main_changed');
 let candidate=a.candidate;
 if(a.role==='builder' && output.outcome==='handoff') {
  insist(git(a.worktree,['rev-parse','HEAD'])===a.candidate,'unexpected_model_commit');
  const allowed=['sum-integers.js','sum-integers.test.js','README.md','package.json'];
  const changed=[...git(a.worktree,['diff','--name-only']).split('\n'),...git(a.worktree,['diff','--cached','--name-only']).split('\n'),...git(a.worktree,['ls-files','--others','--exclude-standard']).split('\n')].filter(Boolean);
  insist(changed.length>0 && changed.every(p=>allowed.includes(p)),'trial_scope_changed');
  for(const p of ['sum-integers.js','sum-integers.test.js','README.md'])insist(existsSync(join(a.worktree,p)),'trial_files_missing');
  git(a.worktree,['add','--',...allowed.filter(p=>existsSync(join(a.worktree,p)))]);
  git(a.worktree,['-c','user.name=Trial Connector','-c','user.email=trial@example.invalid','commit','-m',`Trial candidate attempt ${a.number}`]);candidate=git(a.worktree,['rev-parse','HEAD']);
  git(a.worktree,['push',join(m.workspace,'remote.git'),`HEAD:refs/heads/${m.branch}`]);
 } else insist(git(a.worktree,['status','--porcelain'])==='' && git(a.worktree,['rev-parse','HEAD'])===a.candidate,'review_modified_candidate');
 const evidence={simulation:classification(m),candidate,role:a.role,attempt:a.number,connector:fileDigest(join(dir,'codex-session.json'))};atomic(join(dir,'evidence.json'),evidence);
 atomic(join(dir,'result.json'),{simulation:classification(m),kind:a.role==='builder'?'handoff':'verdict',job:m.job,repository:m.repository,issue:m.issue,version:m.version,contractDigest:m.contractDigest,authorization:m.authorization.digest,role:a.role,template:m.templates[a.role],session:a.session,key:a.key,candidate,outcome:output.outcome,blockers:output.blockers,evidence:{name:'evidence.json',digest:fileDigest(join(dir,'evidence.json'))}});
 atomic(join(dir,'completion.json'),{exit:0});
}catch{atomic(join(dir,'connector-error.json'),{reason:'codex_result_permission_or_auth_unconfirmed'});atomic(join(dir,'completion.json'),{exit:1});}
