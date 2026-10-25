import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {DockerSandbox} from '../../src/sandbox/docker.ts';
const root=process.argv[2]!;await mkdir(root,{recursive:true});await mkdir(root+'/bin');
await writeFile(root+'/bin/docker',`#!/bin/sh\necho "$1" >> '${root}/calls'\nprintf '%s\\n' '{"CgroupVersion":"2","MemoryLimit":true,"PidsLimit":false,"CpuCfsQuota":true,"SecurityOptions":["name=seccomp"]}'\n`,{mode:0o700});
process.env.PATH=root+'/bin';
await assert.rejects(()=>DockerSandbox.prepare({stateRoot:root+'/state'}),/required_controllers_unsupported/);
assert.equal(await readFile(root+'/calls','utf8'),'info\n');
console.log('UNSUPPORTED_CONTROLLER_NO_CREATE_PASS: simulated unavailable controller via Docker CLI fixture; actual supported limits independently measured');
