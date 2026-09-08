import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, status, stop } from './coordinator.ts';
import { fixture } from './fixture.ts';
import { safe, Refusal } from './model.ts';
export async function main(argv:string[]):Promise<void> {
  const [command,...args]=argv;
  if(command==='demo') {
    const f=fixture('repair');
    console.log(safe({simulation:'SIMULATED',issue:f.manifest.issue,limits:f.manifest.limits,localArtifacts:f.workspace,stopCommand:['node',fileURLToPath(import.meta.url),'stop',f.state]}));
    console.log(safe(await run(f.manifest,f.state)));return;
  }
  if(command==='fixture') {const f=fixture(args[0]??'repair');console.log(safe({simulation:'SIMULATED',config:f.config,state:f.state}));return;}
  if(command==='status'||command==='summary') {if(args.length!==1)throw new Refusal('usage');console.log(safe(status(resolve(args[0]!))));return;}
  if(command==='stop'){if(args.length!==1)throw new Refusal('usage');stop(resolve(args[0]!));console.log(safe({simulation:'SIMULATED',state:'stop_requested'}));return;}
  if(command==='start'||command==='resume'||command==='reconcile') {
    if(args.length!==2)throw new Refusal('usage');
    const config=JSON.parse(readFileSync(resolve(args[0]!),'utf8'));
    console.log(safe(await run(config,resolve(args[1]!),command!=='start')));return;
  }
  console.log('SIMULATED offline only: demo | fixture [repair|accept|blocked] | start CONFIG STATE | status STATE | stop STATE | resume CONFIG STATE | reconcile CONFIG STATE');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(safe({simulation:'SIMULATED',state:'refused',reason:e instanceof Refusal?e.category:'invalid_input'}));process.exitCode=1;});
