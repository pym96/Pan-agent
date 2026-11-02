/** Private bounded helper. Parent kills this exact group if Docker/preservation stops responding. */
import { mkdir,readFile } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { DockerSandbox } from '../sandbox/docker.ts';
import { identity } from './controller.ts';
const [mode,root,stateRoot]=process.argv.slice(2);
try{
 if(!root||!stateRoot)throw Error('maintenance_args');
 const entries=await DockerSandbox.list(stateRoot).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;});
 for(const entry of entries){
  const box=await DockerSandbox.load(entry.directory);
  if(mode==='stop'){await box.stop('execution_controller_stop');continue;}
  if(mode!=='preserve')throw Error('maintenance_mode');
  await box.recover();const dest=join(root,'retained',identity(entry.directory));await mkdir(dirname(dest),{recursive:true});
  const state=JSON.parse(await readFile(join(entry.directory,'state.json'),'utf8'));await box.export(state.exportPath??dest);await box.cleanup();
 }
 process.stdout.write(JSON.stringify({mode,confirmed:true,directories:entries.map(e=>e.directory)}));
}catch(error){process.stderr.write(String(error));process.exitCode=1;}
