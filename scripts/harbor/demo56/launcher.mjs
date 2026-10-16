// Media-only orchestration around the UNCHANGED installed runCli/TUI.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,statfsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createBoundTools} from './tools.mjs';
const configPath=resolve(process.argv[2]),activationPath=resolve(process.argv[3]);
const bytes=readFileSync(configPath),cfg=JSON.parse(bytes),activation=JSON.parse(readFileSync(activationPath));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(activation.bindingSha256!==sha(bytes)||activation.role!=='Master Agent'||!activation.authorized)throw Error('fresh_activation_required');
for(const f of cfg.boundFiles)if(sha(readFileSync(f.path))!==f.sha256)throw Error('bound_file_drift:'+f.label);
if(existsSync(cfg.output))throw Error('output_already_exists');
const disk=statfsSync(dirname(cfg.output));if(disk.bavail*disk.bsize<20*2**30)throw Error('disk_floor');
writeFileSync(cfg.attemptReceipt,JSON.stringify({bindingSha256:sha(bytes),time:new Date().toISOString(),state:'consumed'}),{flag:'wx'});
mkdirSync(cfg.output);mkdirSync(cfg.workspace);mkdirSync(cfg.archives);mkdirSync(cfg.home,{recursive:true});
if(cfg.credentialFile)process.env.KIMI_API_KEY=readFileSync(cfg.credentialFile,'utf8').trim();
if(!process.env.KIMI_API_KEY)throw Error('credential_unavailable');
process.env.HOME=cfg.home;
const here=dirname(fileURLToPath(import.meta.url));
const quote=s=>"'"+s.replaceAll("'","'\"'\"'")+"'";
const remoteCommand=['env','-i','PATH='+cfg.remotePath,'HOME='+cfg.remoteHome,'LANG=C.UTF-8','PYTHONDONTWRITEBYTECODE=1',cfg.python,cfg.brokerPath].map(quote).join(' ');
const child=spawn('ssh',['-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-F',cfg.sshConfig, cfg.remoteHost,remoteCommand],{env:{PATH:process.env.PATH,HOME:cfg.sshHome,LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
let pending=new Map(),seq=0,buffer='',closed=false,timer;
const log=(type,fields={})=>{writeFileSync(join(cfg.output,'controller.jsonl'),JSON.stringify({time:new Date().toISOString(),type,...fields})+'\n',{flag:'a'});};
let readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
child.stderr.on('data',b=>writeFileSync(join(cfg.output,'broker.stderr'),b,{flag:'a'}));
child.on('error',error=>readyReject(error));
const stopped=new Promise(resolveStop=>child.on('exit',(code,signal)=>{closed=true;log('broker_exit',{code,signal});for(const p of pending.values())p.reject(Error('broker_closed'));pending.clear();readyReject(Error('broker_closed'));resolveStop({code,signal});}));
child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{readyReject(Error('invalid_broker_protocol'));continue;}if(m.ready)readyResolve(m);else{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}}}});
child.stdin.write(JSON.stringify({...cfg,output:cfg.remoteOutput})+'\n');
function rpc(method,data={},signal){return new Promise((resolveCall,reject)=>{if(closed||signal?.aborted)return reject(Error('bridge_unavailable'));const id=++seq;const abort=()=>{log('tool_abort');child.stdin.end();child.kill('SIGTERM');reject(Error('tool_aborted'));};signal?.addEventListener('abort',abort,{once:true});pending.set(id,{resolve:v=>{signal?.removeEventListener('abort',abort);resolveCall(v);},reject:e=>{signal?.removeEventListener('abort',abort);reject(e);}});child.stdin.write(JSON.stringify({id,method,...data})+'\n');});}
try {
 console.log('HARBOR / PREPARE original db-wal-recovery container (1 CPU, 2 GiB)');
 const r=await ready;log('environment_ready',{containerId:r.containerId});console.log('HARBOR / READY — Mac TUI/provider → SSH → server task container.');
 console.log('EXTERNAL BRIDGE: all four tools are container-bound; stock local-tool wording does not describe this launcher.');
 writeFileSync(join(cfg.output,'instruction.txt'),r.instruction);
 const {runCli}=await import(pathToFileURL(resolve(cfg.entry,'../cli.js')));
 const tools=await createBoundTools({entry:cfg.entry,workspace:cfg.workspace,containerId:r.containerId,rpc});
 // Begin counts original 900-second agent phase, including operator approvals.
 await rpc('begin');timer=setTimeout(()=>{log('agent_timeout');process.stdin.emit('data',Buffer.from('\x03'));child.stdin.end();child.kill('SIGTERM');},900000);
 console.log('PAN / AGENT — original instruction; stock 64-model-round limit; 900-second phase limit.');
 const code=await runCli(['--kernel','native','--workspace',cfg.workspace,'--memory-root',cfg.archives],{home:cfg.home,createTools:()=>tools});clearTimeout(timer);
 const runs=existsSync(join(cfg.archives,'runs'))?readdirSync(join(cfg.archives,'runs')):[];
 if(runs.length!==1)throw Error('expected_one_run');const manifest=JSON.parse(readFileSync(join(cfg.archives,'runs',runs[0],'manifest.json')));log('agent_exit',{code,runId:runs[0],manifest});
 if(code!==0||manifest.settled_state!=='terminal')throw Error('agent_not_settled');
 console.log('HARBOR / VERIFY — original tests/test.sh; task container state retained.');
 const result=await rpc('verify');log('verifier_result',result);console.log(result.testStdout??'[no test stdout]');
 console.log('HARBOR / RESULT '+JSON.stringify({apiResult:result.result,tests:result.ctrf?.results?.summary??null}));
 // Replay uses a separate explicit mode later; this process performs exactly one task.
} catch(error){log('failure',{message:error.message});console.log('HARBOR / UNSCORED OR FAILED: '+error.message);process.exitCode=1;}
finally {clearTimeout(timer);if(!closed){try{await rpc('stop');}catch{}child.stdin.end();}const end=await stopped;console.log('HARBOR / CLEANUP '+JSON.stringify(end));}
