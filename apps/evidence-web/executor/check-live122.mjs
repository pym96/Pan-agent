import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,chmod,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execute,digest} from './main.mjs';
import {validateLiveConfig,validateArtifacts,LIVE_PROMPT} from './live.mjs';
import {dockerEnvironment} from './docker-tool.mjs';
const root=resolve(process.argv[2]);await mkdir(root,{recursive:true});
const Pan=await import(pathToFileURL(process.env.PAN_ENTRY));
const secret='SYNTHETIC-KEY-122',priv='SYNTHETIC-PRIVATE-REASONING-122';
process.env.KIMI_API_KEY=secret;process.env.DATABASE_URL='SYNTHETIC-DB-122';process.env.WEB_PROVIDER='kimi';process.env.WEB_MODE='product';process.env.WEB_CHECKPOINT_MODE='0';process.env.WEB_OPERATION_MODE='0';process.env.WEB_ISSUE='web122-offline';process.env.WEB107_TASK_ROOT=root;
assert.deepEqual(Object.keys(dockerEnvironment()).sort(),['DOCKER_HOST','PATH'].filter(k=>process.env[k]).sort());assert.ok(!JSON.stringify(dockerEnvironment()).includes('SYNTHETIC'));
assert.throws(()=>validateLiveConfig(Pan,{KIMI_API_KEY:''}),/credential/);
for(const cp of [{version:1},{version:2}])assert.throws(()=>validateLiveConfig(Pan,process.env,{checkpoint:cp}),/unsupported/);
assert.throws(()=>validateLiveConfig(Pan,{...process.env,KIMI_ENDPOINT:'https://evil.invalid'}),/unsupported/);
const tid='1'.repeat(64),dir=join(root,tid);await mkdir(join(dir,'input'),{recursive:true});await mkdir(join(dir,'output'));await chmod(join(dir,'output'),0o777);
await writeFile(join(dir,'input/task.json'),JSON.stringify({summary:'summary.json'}));await writeFile(join(dir,'input/summary.json'),await readFile(new URL('../../../docs/evidence/terminal-bench-full-live-97-summary.json',import.meta.url)));
// Fake transport generates tool code; no real model requests or target answers.
const code=`import json, csv, hashlib, os
from pathlib import Path
assert not any(k in os.environ for k in ['KIMI_API_KEY','DATABASE_URL','PGPASSWORD'])
p=Path('/input/summary.json'); raw=p.read_bytes(); d=json.loads(raw)
s={'file':p.name,'sha256':hashlib.sha256(raw).hexdigest(),'pointer':'/classifications/0'}
Path('/output/analysis.json').write_text(json.dumps({'version':1,'summary':'synthetic test only','data':{'task':d['classifications'][0]['task']},'sources':[s]}))
with open('/output/details.csv','w',newline='') as f:
 w=csv.writer(f);w.writerow(['task','source_file','source_sha256','json_pointer']);w.writerow([d['classifications'][0]['task'],s['file'],s['sha256'],s['pointer']])
print('synthetic Docker computation completed; no credentials')`;
let calls=0,feedback=false,continuation=false,context=false;const records=[];
const snapshot=JSON.stringify({turns:[{question:'previous public question',answer:'PREVIOUS_PUBLIC_ANSWER'}]});
const fetchImplementation=async(url,opts)=>{
 assert.equal(url,'https://api.kimi.com/coding/v1/chat/completions');assert.equal(opts.headers.authorization,'Bearer '+secret);
 const b=JSON.parse(opts.body);assert.equal(b.model,'k3-256k');assert.equal(b.reasoning_effort,'high');assert.ok(!opts.body.includes(secret));
 context||=opts.body.includes('PREVIOUS_PUBLIC_ANSWER');continuation||=b.messages.some(m=>m.reasoning_content===priv);feedback||=b.messages.some(m=>m.role==='tool'&&m.content.includes('artifact_missing'));
 const n=calls++;let delta={reasoning_content:priv},finish='tool_calls';
 if(n===0||n===2)delta.tool_calls=[{index:0,id:'validate-'+n,type:'function',function:{name:'validate_artifacts',arguments:'{}'}}];
 else if(n===1)delta.tool_calls=[{index:0,id:'python-1',type:'function',function:{name:'analyze_python',arguments:JSON.stringify({code})}}];
 else{delta.content='Synthetic completed public answer.';finish='stop'}
 const chunk={id:'fake-'+n,object:'chat.completion.chunk',created:1,model:'k3-256k',choices:[{index:0,delta,finish_reason:finish}],usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}};
 return new Response('data: '+JSON.stringify(chunk)+'\n\ndata: [DONE]\n\n',{status:200,headers:{'content-type':'text/event-stream'}});
};
const result=await execute({taskId:tid,attemptId:tid,authority:{Task:tid,Attempt:tid,Owner:'2'.repeat(64),Generation:1},root:dir,question:'synthetic boundary task',contextText:snapshot,contextSHA256:digest(snapshot)},{handshake:async e=>({...e,action:'admission_ack'}),fetchImplementation,record:e=>{records.push(e)},signal:new AbortController().signal});
await writeFile(join(root,'public-evidence.json'),JSON.stringify({result,records},null,2));
assert.equal(result.result.status,'completed');assert.equal(result.artifactValidation.status,'valid');assert.equal(calls,4);assert.equal(result.providerSends,4);assert.ok(context&&continuation&&feedback);
async function scan(p){for(const n of await readdir(p,{withFileTypes:true})){const f=join(p,n.name);if(n.isDirectory())await scan(f);else {const b=await readFile(f);assert.ok(!b.includes(Buffer.from(secret))&&!b.includes(Buffer.from(priv)), 'private marker persisted')}}}await scan(root);
const good=await readFile(join(dir,'output/analysis.json'));const csv=await readFile(join(dir,'output/details.csv'));
for(const bad of [Buffer.concat([good,Buffer.from(' trailing')]),Buffer.concat([good,Buffer.from('{}')]),Buffer.from('{}')]){await writeFile(join(dir,'output/analysis.json'),bad);await assert.rejects(validateArtifacts(dir))}
await writeFile(join(dir,'output/analysis.json'),Buffer.concat([good,Buffer.from(' \n\t')]));await validateArtifacts(dir);
let obj=JSON.parse(good);obj.sources[0].sha256='0'.repeat(64);await writeFile(join(dir,'output/analysis.json'),JSON.stringify(obj));await assert.rejects(validateArtifacts(dir),/identity/);
obj=JSON.parse(good);obj.sources[0].pointer='/absent';await writeFile(join(dir,'output/analysis.json'),JSON.stringify(obj));await assert.rejects(validateArtifacts(dir),/pointer/);
await writeFile(join(dir,'output/analysis.json'),good);await writeFile(join(dir,'output/details.csv'),'bad header\n');await assert.rejects(validateArtifacts(dir),/header/);await writeFile(join(dir,'output/details.csv'),csv);
assert.ok(!LIVE_PROMPT.includes('valid_failure')&&!LIVE_PROMPT.includes('89'));
console.log(JSON.stringify({status:'passed',realProviderSends:0,fakeTransportSends:calls,privateMarkerAbsent:true,publicContextReceived:context,continuationInMemory:continuation,validationFeedback:feedback,actualDocker:true,artifactNegativeCases:6}));
