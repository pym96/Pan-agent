import {DockerSandbox} from './docker.ts';
export async function sandboxCommand(args:readonly string[]):Promise<string>{
 const [action,...rest]=args;const get=(key:string)=>{const i=rest.indexOf(key);if(i<0||!rest[i+1])throw Error('sandbox requires '+key);return rest[i+1]!;};
 if(action==='list')return JSON.stringify(await DockerSandbox.list(get('--root')),null,2);
 const box=await DockerSandbox.load(get('--run'));
 if(action==='recover'||action==='stop')await box.recover();
 else if(action==='export')return JSON.stringify(await box.export(get('--out')),null,2);
 else if(action==='verify')return JSON.stringify(await box.verify(get('--command'),Number(get('--seconds'))),null,2);
 else if(action==='cleanup')await box.cleanup();
 else throw Error('sandbox list|recover|stop|verify|export|cleanup');
 return JSON.stringify(box.identity,null,2);
}
