import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {DockerSandbox} from '../../src/sandbox/docker.ts';
const root=process.argv[2]!;await mkdir(root+'/states');const box=await DockerSandbox.prepare({stateRoot:root+'/states'});const signal=new AbortController().signal;const records:any[]=[];
const run=async(command:string,timeout=5)=>{const r=await box.call('bash',{command,timeout},signal);records.push({command,...r});await writeFile(root+'/results.json',JSON.stringify(records,null,2));return r;};
const pid=await run(`python - <<'PY'
import subprocess,time
children=[];limited=False
try:
 for i in range(70):
  try:children.append(subprocess.Popen(['sleep','2']))
  except BlockingIOError:limited=True;break
 print('PID_LIMIT',limited,len(children))
finally:
 for p in children:p.terminate()
 for p in children:p.wait()
PY`);assert.equal(pid.code,0);assert.match(pid.stdout,/PID_LIMIT True/);
const memory=await run("python -c 'x=bytearray(600*1024*1024);print(len(x))'",3);assert.notEqual(memory.code,0);
const counters=await run('cat /sys/fs/cgroup/memory.events; cat /sys/fs/cgroup/pids.events');assert.match(counters.stdout,/oom_kill [1-9]/);assert.match(counters.stdout,/max [1-9]/);
const output=await run("python -c 'import sys;sys.stdout.write(\"x\"*(2*1024*1024))'",5);assert.equal(output.code,125);assert.equal(Buffer.byteLength(output.stdout),1048576);
const wait=await run('sleep 2; echo survived > survived.txt',.1);assert.equal(wait.code,124);await new Promise(r=>setTimeout(r,2200));assert.equal((await run('cat survived.txt')).stdout,'survived\n');
const controller=new AbortController();const pending=box.call('bash',{command:'sleep 10; echo BAD > after-cancel',timeout:20},controller.signal);setTimeout(()=>controller.abort(),200);await assert.rejects(()=>pending);await box.stop('after_cancel');await box.export(root+'/export');await box.cleanup();await writeFile(root+'/results.json',JSON.stringify(records,null,2));console.log('RESOURCE_WAIT_CANCEL_PASS');
