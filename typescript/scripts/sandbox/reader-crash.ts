import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {DockerSandbox} from '../../src/sandbox/docker.ts';
const [root, mode, directory]=process.argv.slice(2);
if(mode==='reader') {
 const box=await DockerSandbox.load(directory!,async kind=>{if(kind==='recovery_reader_created_before_identity'){process.send?.({kind});await new Promise(()=>{setInterval(()=>{},1000);});}});
 await box.recover();
} else {
 await mkdir(root+'/volume');
 async function killAt(file:string,args:string[]) {
  const c=fork(file,args,{stdio:['ignore','pipe','pipe','ipc']});let out='';c.stdout?.on('data',b=>out+=b);c.stderr?.on('data',b=>out+=b);
  await new Promise<void>((yes,no)=>{const t=setTimeout(()=>no(Error('checkpoint timeout '+out)),20000);c.once('message',()=>{clearTimeout(t);yes();});c.once('exit',code=>{clearTimeout(t);no(Error('early '+code+' '+out));});});
  const done=new Promise(r=>c.once('exit',r));c.kill('SIGKILL');await done;
 }
 await killAt(fileURLToPath(new URL('./gap-worker.ts',import.meta.url)),[root+'/volume','volume_created']);
 const records=await DockerSandbox.list(root+'/volume/states');const dir=root+'/volume/states/'+records[0]!.runId;
 await killAt(fileURLToPath(import.meta.url),[root,'reader',dir]);
 await writeFile(root+'/reader-before-id.json',await readFile(dir+'/state.json'));
 const box=await DockerSandbox.load(dir);await box.recover();await box.recover();await box.export(root+'/archive');await box.cleanup();await box.cleanup();
 await writeFile(root+'/result.json',JSON.stringify(box.identity));console.log('READER_CRASH_RECOVERED');
}
