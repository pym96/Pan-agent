import {DockerSandbox} from '../../src/sandbox/docker.ts';
const [root,point]=process.argv.slice(2);const box=await DockerSandbox.prepare({stateRoot:root+'/states',onCheckpoint:async kind=>{if(kind===point){process.send?.({point});await new Promise(()=>{setInterval(()=>{},1000);});}}});
await box.call('write',{path:'retained',content:'only-copy'},new AbortController().signal);await box.stop();await box.verify('sleep 10',20);
