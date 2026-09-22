// Only accepted broker + fixed harmless probes. Never import the live CLI or Session.
import {verifyLocalImage} from './identity.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {openBroker,childEnvironment} from '../broker.mjs';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
const [workArg,id,round='1']=process.argv.slice(2),work=resolve(workArg);
const raw=readFileSync(new URL('../manifest.json',import.meta.url));if(createHash('sha256').update(raw).digest('hex')!=='74433498d6a551c86ccc6e5faad2f9d8d3c099e5b872170e54edf23769fe6503')throw Error('manifest_drift');
const task=JSON.parse(raw).tasks.find(t=>t.id===id);if(!task)throw Error('unknown_task');
const image=JSON.parse(readFileSync(join(work,'images.json'))).find(t=>t.task===id);if(image?.status!=='pulled'||!/^sha256:[a-f0-9]{64}$/.test(image.local_image_id))throw Error('image_not_ready');
if(!/^[1-9][0-9]*$/.test(round))throw Error('invalid_round');
const output=join(work,round==='1'?'preflight':'preflight-r'+round,id);mkdirSync(output,{recursive:false});
const inspection=execFileSync('docker',['image','inspect',image.pull_reference],{env:childEnvironment(join(work,'home'),join(work,'docker-config')),timeout:30000,encoding:'utf8'});
writeFileSync(join(output,'image-inspect.json'),inspection);verifyLocalImage(image,JSON.parse(inspection)[0]);
const broker=openBroker({spawnImplementation:(exe,args,options)=>{const child=spawn(exe,args,options);child.stderr.on('data',chunk=>appendFileSync(join(output,'broker-stderr.log'),chunk));return child;},python:'/private/tmp/wo74-work/venv/bin/python',home:join(work,'home'),dockerConfig:join(work,'docker-config'),config:{task,task_root:join(work,'tasks'),image:image.local_image_id,output:join(output,'harbor')}});
const report={task:id,status:'starting',modelCalls:0,credentialReads:0,officialVerifierCalls:0,probe:null};
let timer;const cancelled=async()=>{try{await broker.stop('preparation_cancelled');}catch{};};process.once('SIGTERM',cancelled);process.once('SIGINT',cancelled);
try{
 const instruction=await broker.ready;report.instructionSha256=createHash('sha256').update(instruction).digest('hex');report.ready=true;
 const command='uname -m; pwd; for x in bash sh python python3 curl uv uvx pytest node npm pdflatex nginx; do if command -v "$x" >/dev/null 2>&1; then printf "available:%s\\n" "$x"; else printf "missing:%s\\n" "$x"; fi; done; '+(id==='break-filter-js-from-html'?'test -f /app/test_outputs.py && printf "official-visible-test:present\\n"':'printf "official-visible-test:not-applicable\\n"');
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{void broker.stop('probe_timeout').then(()=>reject(Error('probe_timeout')),reject);},30000);});
 report.probe=await Promise.race([broker.exec(command),timeout]);clearTimeout(timer);
 if(report.probe.status!=='completed'||report.probe.exit_code!==0)throw Error('harmless_probe_failed');
 report.stop=await broker.stop('preflight_complete');report.status='prepared';
}catch(e){report.status='blocked';report.reason=e.message;}
finally{clearTimeout(timer);try{await broker.close();}catch(e){report.status='blocked';report.cleanupError=e.message;}writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');process.removeListener('SIGTERM',cancelled);process.removeListener('SIGINT',cancelled);}
console.log(JSON.stringify({task:id,status:report.status,ready:report.ready??false,reason:report.reason??null,cleanupError:report.cleanupError??null}));if(report.status!=='prepared')process.exitCode=1;
