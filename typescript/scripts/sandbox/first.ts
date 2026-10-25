import {DockerSandbox} from '../../src/sandbox/docker.ts';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.argv[2]!;await mkdir(root+'/states',{recursive:true});await writeFile(root+'/fixture.txt','41');
const box=await DockerSandbox.prepare({stateRoot:root+'/states',inputs:[root+'/fixture.txt']});console.log(box.identity);
const signal=new AbortController().signal;
for(const [tool,args] of [['read',{path:'/inputs/fixture.txt'}],['write',{path:'answer.txt',content:'41'}],['edit',{path:'answer.txt',edits:[{oldText:'41',newText:'42'}]}],['bash',{command:'cat answer.txt; id; cat /sys/fs/cgroup/cpu.max',timeout:5}]] as const){const r=await box.call(tool,args,signal);console.log(tool,r);assert.equal(r.code,0);}
await box.stop();await box.export(root+'/export');await box.cleanup();assert.equal(await readFile(root+'/export/files/answer.txt','utf8'),'42');console.log('FIRST_PASS',box.identity);
