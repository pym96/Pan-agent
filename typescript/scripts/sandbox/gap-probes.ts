import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {DockerSandbox} from '../../src/sandbox/docker.ts';
const root=process.argv[2]!;const rows=[];
for(const point of ['volume_created','verifier_created']){
 const dir=root+'/'+point;await mkdir(dir);const child=fork(fileURLToPath(new URL('./gap-worker.ts',import.meta.url)),[dir,point],{stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',b=>output+=b);
 await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('checkpoint not reached '+output)),20000);child.once('message',()=>{clearTimeout(t);resolve();});child.once('exit',code=>{clearTimeout(t);reject(Error('early '+code+' '+output));});});const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;
 const states=await DockerSandbox.list(dir+'/states');const stateDir=dir+'/states/'+states[0]!.runId;await writeFile(dir+'/before-recovery.json',await readFile(stateDir+'/state.json'));const box=await DockerSandbox.load(stateDir);
 let error;try{await box.recover();if(point==='verifier_created')await box.verify('test "$(cat retained)" = only-copy',5);await box.export(dir+'/export');await box.cleanup();await box.cleanup();}catch(e){error=String(e);}
 rows.push({point,error:error??null,identity:box.identity});await writeFile(root+'/results.json',JSON.stringify(rows,null,2));
}
if(rows.some(r=>r.error))throw Error('GAP_PROBES_FAILED '+JSON.stringify(rows));console.log('GAPS_RECOVERED');
