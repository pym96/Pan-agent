import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MODEL,LIMITS,authorize,Ledger,digest,check} from './policy.mjs';
import {runAttempt} from './session.mjs';
import {openBroker,childEnvironment} from './broker.mjs';
import {resourceGuard} from './resources.mjs';
import {summary} from './report.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
export const blockers=[{task:'break-filter-js-from-html',code:'SC-TBP-75-01',detail:'Official environment/Dockerfile copies tests/test_outputs.py to /app; environment/tests and verifier tests share Git blob 1bf2128a002d4014d85094c2223f87c62ae9088d. Master must resolve conflict with test isolation before any live campaign.'}];
export function dryRun(){const raw=readFileSync(join(HERE,'manifest.json')),manifest=JSON.parse(raw);return {authorized:false,manifestSha256:digest(raw),model:MODEL,budget:LIMITS,denominator:5,tasks:manifest.tasks.map(t=>({id:t.id,image:t.image_reference,digest:null,architecture:t.architecture,official:t.config})),sideEffects:{credentials:0,provider:0,docker:0},blockers};}
export async function main(args=process.argv.slice(2)){
 if(args.length===1&&args[0]==='--dry-run'){console.log(JSON.stringify(dryRun(),null,2));return;}
 const allowed=new Set(['--activation','--entry','--task-root','--output']);const options={};
 for(let i=0;i<args.length;i+=2){check(allowed.has(args[i])&&args[i+1]&&!options[args[i]],'cli_option');options[args[i]]=args[i+1];}
 check(options['--activation'],'activation_required');const activation=JSON.parse(readFileSync(options['--activation']));check(activation.authorized===true,'not_authorized');
 const authorityPath=join(homedir(),'.local/state/pan-agent/wo75/authority.json');check(existsSync(authorityPath),'no_trusted_authority');const authority=JSON.parse(readFileSync(authorityPath));
 const repo=resolve(HERE,'../../..');const gitArgs={cwd:repo,encoding:'utf8',env:{PATH:'/usr/bin:/bin:/opt/homebrew/bin'}};
 const runnerSha=execFileSync('git',['rev-parse','HEAD'],gitArgs).trim();check(!execFileSync('git',['status','--porcelain'],gitArgs).trim(),'runner_dirty');
 const lock=JSON.parse(readFileSync(join(HERE,'package-identity.json'))),manifestRaw=readFileSync(join(HERE,'manifest.json')),manifest=JSON.parse(manifestRaw);
 const expected={runnerSha,panHash:lock.package_sha256,manifestHash:digest(manifestRaw),model:MODEL,budget:activation.binding?.budget,taskIds:manifest.tasks.map(t=>t.id),images:activation.binding?.images};
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
 const gate=authorize(activation,authority,expected,{signal:controller.signal});
 check(expected.images&&expected.taskIds.every(id=>/^sha256:[0-9a-f]{64}$/.test(expected.images[id])),'image_resolution_missing');
 // No task substitution or silent exception to the official-test visibility contract.
 check(blockers.length===0,'SC-TBP-75-01_unresolved');
 const entry=resolve(options['--entry']),installed=resolve(dirname(entry),'..');
 check(entry===join(installed,'dist/index.js'),'installed_entry_path');
 for(const [f,h] of Object.entries(lock.installed_files))check(digest(readFileSync(join(installed,f)))===h,'installed_pan_identity');
 check(digest(readFileSync(lock.python))===lock.python_sha256,'python_identity');
 for(const [f,h] of Object.entries(lock.harbor_files))check(digest(readFileSync(join(lock.harbor_root,f)))===h,'harbor_identity');
 const ledger=new Ledger(join(homedir(),'.local/state/pan-agent/wo75/ledger'),gate);const output=resolve(options['--output']);mkdirSync(output,{recursive:false});
 const resources=resourceGuard(output,controller);const reports=[];const home=join(output,'child-home'),dockerConfig=join(output,'docker-config');mkdirSync(home);mkdirSync(dockerConfig);
 // Only a public CLI plugin search path; no user's credential-bearing Docker config.
 writeFileSync(join(dockerConfig,'config.json'),JSON.stringify({cliPluginsExtraDirs:['/Applications/Docker.app/Contents/Resources/cli-plugins']}));
 writeFileSync(join(output,'summary.json'),JSON.stringify(summary(manifest,reports),null,2)+'\n');
 try{for(const task of manifest.tasks){
  gate.assert(controller.signal);resources.check();const directory=join(output,task.id);mkdirSync(directory);let env,phase='environment_start';
  try{
   env=openBroker({python:lock.python,home,dockerConfig,config:{task,task_root:resolve(options['--task-root']),image:expected.images[task.id],output:join(directory,'harbor')}});
   const instruction=await env.ready;
   phase='agent';const r=await runAttempt({entry,task,instruction,output:join(directory,'pan'),environment:env,gate,ledger,credentialSource:()=>process.env.KIMI_API_KEY,signal:controller.signal});reports.push(r);
  }catch{const failure={task:task.id,agentStatus:phase==='agent'?'failed':null,stopReason:phase==='agent'?'agent_exception':null,verifier:null,usage:null,infrastructurePhase:phase};reports.push(failure);writeFileSync(join(directory,'failure.json'),JSON.stringify(failure,null,2)+'\n');}
  finally{await env?.close();writeFileSync(join(output,'summary.json'),JSON.stringify(summary(manifest,reports),null,2)+'\n');}
 }}finally{ledger.close();resources.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.code==='ENOENT'?'required_input_missing':error.message);process.exitCode=1;});
