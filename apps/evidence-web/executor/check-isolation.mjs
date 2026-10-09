import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,unlink,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {dockerTool,safeArtifact} from './docker-tool.mjs';
const rootBase=process.env.WEB107_TASK_ROOT;assert(rootBase);await mkdir(rootBase,{recursive:true});const id=randomBytes(32).toString('hex'),root=join(rootBase,id);await mkdir(root);await mkdir(join(root,'input'));await mkdir(join(root,'output'));await chmod(join(root,'output'),0o777);
await writeFile(join(root,'input/summary.json'),'{"canary":"read-only"}',{mode:0o444});await chmod(join(root,'input'),0o555);const events=[];
const code=`import json,os,socket
checks={}
try:
 open('/input/summary.json','w').write('changed');checks['readonly']=False
except OSError: checks['readonly']=True
checks['host_file_absent']=not os.path.exists('/Users/panyiming/.local/state/pan-agent/web107/runtime/app/config.json')
checks['no_credentials']=not any(k in os.environ for k in ['DATABASE_URL','KIMI_API_KEY','ACCOUNT_A_PASSWORD'])
checks['no_socket']=not os.path.exists('/var/run/docker.sock')
s=socket.socket();s.settimeout(1)
try: s.connect(('1.1.1.1',53));checks['network_blocked']=False
except OSError: checks['network_blocked']=True
try:
 open('/outside','w').write('x');checks['outside_write_blocked']=False
except OSError: checks['outside_write_blocked']=True
print(json.dumps(checks))
`;
const tool=dockerTool({root,taskId:id,image:process.env.PAN_IMAGE,record:e=>events.push(e)});const result=await tool.execute({arguments:{code},toolCallId:'isolation',signal:new AbortController().signal});assert(!result.isError);const checks=JSON.parse(JSON.parse(result.content[0].text).stdout);assert(Object.values(checks).every(x=>x===true));assert.equal(await readFile(join(root,'input/summary.json'),'utf8'),'{"canary":"read-only"}');
await symlink('../input/summary.json',join(root,'output/details.csv'));await assert.rejects(safeArtifact(root,'details.csv'),/artifact_not_regular/);await assert.rejects(safeArtifact(root,'../input/summary.json'),/artifact_name_rejected/);
await writeFile(join(root,'checks.json'),JSON.stringify({checks,symlinkArtifactRejected:true,traversalArtifactRejected:true,events},null,2));console.log(JSON.stringify({root,checks,symlinkArtifactRejected:true,traversalArtifactRejected:true}));
