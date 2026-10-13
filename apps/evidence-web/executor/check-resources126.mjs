import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
import {checkLinuxSample,checkSample,allocatedRoots} from './resources.mjs';
const floor=21474836480,s={profile:'linux-project-v1',os:'linux',projectAllocatedBytes:123,filesystems:[{device:1,freeBytes:floor}],images:[{id:'sha256:'+'a'.repeat(64),logicalBytes:100}]};
checkLinuxSample(s);
for(const x of [{...s,filesystems:[{device:1,freeBytes:floor-1}]},{...s,filesystems:[]},{...s,projectAllocatedBytes:NaN},{...s,os:'darwin'},{...s,filesystems:[{device:1,freeBytes:NaN}]},{...s,images:[]}])assert.throws(()=>checkLinuxSample(x));
checkSample({free:floor,owned:57982058495,docker:48503971840});
assert.throws(()=>checkSample({free:floor,owned:57982058496,docker:48503971840}));
assert.throws(()=>checkSample({free:floor-1,owned:0,docker:48503971840}));
checkSample({free:floor,owned:57982058494,docker:48503971841});
assert.throws(()=>checkSample({free:floor,owned:57982058495,docker:48503971841}));
const root=mkdtempSync(join(tmpdir(),'resources126-')),owned=join(root,'owned'),outside=join(root,'external');mkdirSync(owned);mkdirSync(outside);writeFileSync(join(owned,'data'),'x');writeFileSync(join(outside,'data'),'x'.repeat(100000));
const before=allocatedRoots([owned]);symlinkSync(outside,join(owned,'external'));assert.equal(allocatedRoots([owned,owned]),before);
let starts=0;cp.spawn=()=>{starts++;throw Error('unexpected child start')};syncBuiltinESMExports();
const {dockerTool}=await import('./docker-tool.mjs');
process.env.WEB_ISSUE='dep-wo126-a';process.env.PAN_IMAGE='sha256:'+'a'.repeat(64);
const profile=join(root,'profile.json');process.env.WEB_RESOURCE_PROFILE=profile;
for(const p of [{profile:'wrong'},{profile:'linux-project-v1',baseline:{profile:'linux-project-v1',projectAllocatedBytes:1,projectRoot:'/missing'},projectRoot:'/missing',taskRoot:'/missing'}]){
 writeFileSync(profile,JSON.stringify(p));process.env.WEB_RESOURCE_PROFILE_SHA256=createHash('sha256').update(readFileSync(profile)).digest('hex');
 const tool=dockerTool({root:owned,taskId:'a'.repeat(64),image:process.env.PAN_IMAGE,record:()=>{}});
 await assert.rejects(tool.execute({arguments:{code:'print(1)'},signal:new AbortController().signal,toolCallId:'probe'}));
}
// Exercise the actual tool entry with deterministic low-space/unknown filesystem samples.
const osDescriptor=Object.getOwnPropertyDescriptor(process,'platform');Object.defineProperty(process,'platform',{value:'linux'});
const valid={profile:'linux-project-v1',projectRoot:root,taskRoot:owned,namespace:process.env.WEB_ISSUE,image:process.env.PAN_IMAGE,baseline:{profile:'linux-project-v1',projectAllocatedBytes:1,projectRoot:root}};
cp.execFileSync=(bin,args)=>{assert.equal(bin,'docker');if(args[0]==='info')return root;if(args[0]==='image')return JSON.stringify([{Id:valid.image,Os:'linux',Size:100}]);if(args[0]==='ps')return '';throw Error('unexpected Docker operation')};
for(const free of [21474836479,NaN]){
 fs.statfsSync=()=>({bavail:free,bsize:1});syncBuiltinESMExports();writeFileSync(profile,JSON.stringify(valid));process.env.WEB_RESOURCE_PROFILE_SHA256=createHash('sha256').update(readFileSync(profile)).digest('hex');
 const tool=dockerTool({root:owned,taskId:'a'.repeat(64),image:valid.image,record:()=>{}});await assert.rejects(tool.execute({arguments:{code:'print(1)'},signal:new AbortController().signal,toolCallId:'low-space'}));
}
Object.defineProperty(process,'platform',osDescriptor);
assert.equal(starts,0);
console.log(JSON.stringify({linuxBoundaryAndUnknowns:true,macFormulaUnchanged:true,externalSymlinkExcluded:true,invalidProfilePreventsContainerStart:true,containerStarts:starts,probeRoot:root}));
