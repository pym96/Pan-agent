/** Trusted local verification. Not a sandbox, signature service, or acceptance authority. */
import {readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync,mkdirSync} from 'node:fs';
import {resolve,relative,join,dirname,basename,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error(message);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.length>0;
const id=x=>str(x)&&/^[A-Za-z0-9_.-]+$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const within=(root,path)=>{const p=relative(root,path);return p===''||(!p.startsWith('..'+ '/')&&p!=='..'&&!isAbsolute(p));};
function safe(root,path){if(!str(path)||isAbsolute(path))fail('relative_path_required');const result=resolve(root,path);if(!within(root,result))fail('path_escape');let current=root;for(const part of relative(root,result).split('/').filter(Boolean)){current=join(current,part);if(lstatSync(current).isSymbolicLink())fail('symlink_not_supported');}return result;}
export function fileMap(root,prefix=''){const result=Object.create(null);for(const name of readdirSync(join(root,prefix)).sort()){const p=join(prefix,name),s=lstatSync(join(root,p));if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))fail('unsupported_verifier_file');if(s.isDirectory())Object.assign(result,fileMap(root,p));else result[p]=sha(readBounded(join(root,p)));}return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a<b?-1:1));}
function readBounded(path){const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1048576)fail('unsafe_or_oversized_file');return readFileSync(path);}
const parse=path=>JSON.parse(readBounded(path).toString('utf8'));
function git(candidate,args){const r=spawnSync('git',['-C',candidate,...args],{encoding:'utf8',timeout:5000,maxBuffer:1048576});if(r.status!==0)fail('git_identity_unavailable');return r.stdout.trim();}
export function context(options){
 if(process.platform==='win32')fail('posix_required');
 const trusted=realpathSync(options.trusted),candidate=realpathSync(options.candidate),manifestPath=realpathSync(options.manifest);
 if(within(candidate,trusted)||within(trusted,candidate)||within(candidate,manifestPath))fail('trust_input_must_be_outside_candidate');
 const bytes=readBounded(manifestPath);if(!hex(options['manifest-sha256'])||sha(bytes)!==options['manifest-sha256'])fail('manifest_identity_mismatch');
 const m=JSON.parse(bytes);if(!object(m)||m.schema!=='pan-verification-manifest/v1'||!str(m.workorder)||!str(m.criteriaVersion)||!/^[a-f0-9]{40}$/.test(m.candidateSHA))fail('manifest_invalid');
 if(!object(m.verifierFiles)||!hex(options['verifier-sha256']))fail('verifier_identity_invalid');
 const actual=fileMap(trusted);if(JSON.stringify(actual)!==JSON.stringify(m.verifierFiles)||sha(JSON.stringify(actual))!==options['verifier-sha256'])fail('verifier_identity_mismatch');
 // Even invoking this entry from another checkout must use exactly the pinned engine/CLI bytes.
 const here=dirname(fileURLToPath(import.meta.url));for(const name of ['cli.mjs','engine.mjs','demo.mjs'])if(actual[name]&&sha(readBounded(join(here,name)))!==actual[name])fail('executing_verifier_mismatch');
 if(!Array.isArray(m.commands)||m.commands.length<1||m.commands.length>32||!Array.isArray(m.required)||m.required.length<1||m.required.length>256||!Array.isArray(m.humanCriteria)||m.humanCriteria.some(x=>!id(x)))fail('manifest_sets_invalid');
 const commandIds=new Set(),caseIds=new Set(),criteria=new Set();
 for(const c of m.commands){if(!object(c)||!id(c.id)||commandIds.has(c.id)||!Array.isArray(c.argv)||!c.argv.length||c.argv.some(x=>typeof x!=='string'||x.includes('\0'))||!str(c.argv[0])||!Number.isInteger(c.timeoutMs)||c.timeoutMs<=0||c.timeoutMs>300000)fail('command_invalid');commandIds.add(c.id);if(!lstatSync(safe(trusted,c.cwd)).isDirectory())fail('cwd_invalid');}
 for(const c of m.required){if(!object(c)||!id(c.id)||caseIds.has(c.id)||!id(c.criterion)||!commandIds.has(c.command))fail('required_case_invalid');caseIds.add(c.id);criteria.add(c.criterion);}
 if(new Set(m.humanCriteria).size!==m.humanCriteria.length||m.humanCriteria.some(x=>criteria.has(x))||m.commands.some(c=>!m.required.some(r=>r.command===c.id)))fail('criterion_mapping_invalid');
 if(realpathSync(git(candidate,['rev-parse','--show-toplevel']))!==candidate)fail('candidate_checkout_root_required');const actualSHA=git(candidate,['rev-parse','HEAD']);if(actualSHA!==m.candidateSHA)fail('candidate_sha_mismatch');if(git(candidate,['status','--porcelain','--untracked-files=all']))fail('candidate_dirty');
 return {m,trusted,candidate,manifestSHA:sha(bytes),verifierSHA:options['verifier-sha256'],actualSHA,clean:true};
}
const artifact=(root,name)=>{const p=safe(root,name);return {path:name,sha256:sha(readBounded(p)),bytes:lstatSync(p).size};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function alive(pid){try{process.kill(-pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
async function cleanup(pid){if(!pid)return true;try{process.kill(-pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await sleep(100);if(alive(pid)){try{process.kill(-pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}for(let n=0;n<20;n++){if(!alive(pid))return true;await sleep(50);}return false;}
async function execute(c,ctx,out,runId){
 const start=new Date().toISOString(),clock=performance.now(),report=`${c.id}.report.json`,stdout=`${c.id}.stdout`,stderr=`${c.id}.stderr`;let buffers=[Buffer.alloc(0),Buffer.alloc(0)],overflow=false,timedOut=false,launchError=null,pid,exitCode=null,signal=null;
 await new Promise(done=>{let child;try{child=spawn(c.argv[0],c.argv.slice(1),{cwd:safe(ctx.trusted,c.cwd),detached:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'',LANG:'C.UTF-8',PAN_VERIFY_REPORT:join(out,report),PAN_VERIFY_RUN_ID:runId,PAN_VERIFY_CANDIDATE:ctx.candidate}});}catch(e){launchError=e.code??'spawn_failed';done();return;}
 pid=child.pid;const timer=setTimeout(()=>{timedOut=true;if(pid)try{process.kill(-pid,'SIGTERM');}catch{};setTimeout(()=>{if(pid)try{process.kill(-pid,'SIGKILL');}catch{};},200).unref();},c.timeoutMs);
 [child.stdout,child.stderr].forEach((stream,i)=>stream.on('data',chunk=>{const room=1048576-buffers[i].length;if(chunk.length>room){overflow=true;if(pid)try{process.kill(-pid,'SIGKILL');}catch{}}buffers[i]=Buffer.concat([buffers[i],chunk.subarray(0,room)]);}));
 child.on('error',e=>{launchError=e.code??'spawn_failed';});child.on('close',(code,sig)=>{clearTimeout(timer);exitCode=code;signal=sig;done();});
 });
 const cleanupConfirmed=await cleanup(pid);writeFileSync(join(out,stdout),buffers[0],{flag:'wx'});writeFileSync(join(out,stderr),buffers[1],{flag:'wx'});
 let reportArtifact=null;try{reportArtifact=artifact(out,report);}catch{}
 return {id:c.id,argv:c.argv,cwd:c.cwd,timeoutMs:c.timeoutMs,start,end:new Date().toISOString(),durationMs:performance.now()-clock,pid:pid??null,exitCode,signal,launchError,timedOut,overflow,cleanupConfirmed,stdout:artifact(out,stdout),stderr:artifact(out,stderr),report:reportArtifact};
}
function interpret(m,records,out,runId){const results=Object.create(null),diagnostics=[];
 for(const c of m.commands){const r=records.find(x=>x.id===c.id),expected=m.required.filter(x=>x.command===c.id);let outcomes=[],usable=true;
  try{if(!r?.report)throw Error('missing_report');const report=parse(safe(out,r.report.path));if(!object(report)||report.schema!=='pan-test-report/v1'||report.runId!==runId||!Array.isArray(report.outcomes))throw Error('report_shape_or_run_identity');outcomes=report.outcomes.filter(x=>object(x)&&id(x.id)&&['PASS','FAIL','SKIP'].includes(x.outcome));if(outcomes.length!==report.outcomes.length||new Set(outcomes.map(x=>x.id)).size!==outcomes.length||outcomes.some(x=>!expected.some(e=>e.id===x.id)))throw Error('report_cases_invalid');}catch(e){usable=false;diagnostics.push({command:c.id,reason:e.message});}
  const executionGood=!!r&&!r.launchError&&!r.timedOut&&!r.overflow&&r.cleanupConfirmed;
  for(const e of expected){const matches=outcomes.filter(x=>x.id===e.id);results[e.id]=matches.some(x=>x.outcome==='FAIL')?'FAIL':usable&&executionGood&&r.exitCode===0&&matches.length===1&&matches[0].outcome==='PASS'?'PASS':'NOT_EVALUABLE';}
  if(!executionGood||r?.exitCode!==0)diagnostics.push({command:c.id,reason:'execution_not_successful'});
 }
 const criteria=Object.create(null);for(const e of m.required){const state=results[e.id],old=criteria[e.criterion];criteria[e.criterion]=old==='FAIL'||state==='FAIL'?'FAIL':old==='NOT_EVALUABLE'||state==='NOT_EVALUABLE'?'NOT_EVALUABLE':'PASS';}
 const values=Object.values(criteria),machineCheck=values.includes('FAIL')?'FAIL':values.every(x=>x==='PASS')?'PASS':'NOT_EVALUABLE';return{machineCheck,criteria,cases:results,humanPending:m.humanCriteria,diagnostics};
}
export async function run(options){const ctx=context(options);const out=join(realpathSync(dirname(resolve(options.out))),basename(options.out));if(within(ctx.candidate,out)||within(ctx.trusted,out))fail('external_output_required');mkdirSync(out,{recursive:false});const runId=randomUUID(),commands=[];
 for(const c of ctx.m.commands)commands.push(await execute(c,ctx,out,runId));
 let current=true;try{context(options);}catch{current=false;}
 const evaluation=interpret(ctx.m,commands,out,runId);if(!current){evaluation.machineCheck='NOT_EVALUABLE';for(const k of Object.keys(evaluation.criteria))evaluation.criteria[k]='NOT_EVALUABLE';evaluation.diagnostics.push({reason:'context_changed_during_execution'});}
 const receipt={schema:'pan-verification-receipt/v1',runId,candidateSHA:ctx.actualSHA,clean:ctx.clean,contextStable:current,manifestSHA:ctx.manifestSHA,verifierSHA:ctx.verifierSHA,runtime:{node:process.version,platform:process.platform,arch:process.arch},commands,evaluation};writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return{...evaluation,runId,receipt:join(out,'receipt.json'),receiptSHA:sha(readBounded(join(out,'receipt.json')))};}
export function check(options){const ctx=context(options),receiptPath=realpathSync(options.receipt),out=dirname(receiptPath);if(within(ctx.candidate,out)||within(ctx.trusted,out))fail('external_receipt_required');if(!hex(options['receipt-sha256'])||sha(readBounded(receiptPath))!==options['receipt-sha256'])fail('receipt_hash_mismatch');const r=parse(receiptPath);
 if(!object(r)||r.schema!=='pan-verification-receipt/v1'||r.runId!==options['run-id']||!str(options['run-id'])||r.candidateSHA!==ctx.actualSHA||r.clean!==true||r.manifestSHA!==ctx.manifestSHA||r.verifierSHA!==ctx.verifierSHA||!Array.isArray(r.commands)||r.commands.length!==ctx.m.commands.length||new Set(r.commands.map(x=>x.id)).size!==r.commands.length)fail('receipt_identity_mismatch');
 for(const c of ctx.m.commands){const row=r.commands.find(x=>x.id===c.id);if(!row||JSON.stringify(row.argv)!==JSON.stringify(c.argv)||row.cwd!==c.cwd||row.timeoutMs!==c.timeoutMs)fail('receipt_command_mismatch');for(const name of ['stdout','stderr','report']){const a=row[name];if(a===null&&name==='report')continue;if(!object(a)||a.path!==`${c.id}.${name==='report'?'report.json':name}`||JSON.stringify(artifact(out,a.path))!==JSON.stringify(a))fail('artifact_identity_mismatch');}}
 if(r.contextStable!==true)return{machineCheck:'NOT_EVALUABLE',reason:'execution_context_was_unstable',runId:r.runId,evidenceReplay:true,newExecution:false};return {...interpret(ctx.m,r.commands,out,r.runId),runId:r.runId,evidenceReplay:true,newExecution:false};}
