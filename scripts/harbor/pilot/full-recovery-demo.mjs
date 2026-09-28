// Offline-only demonstration: invokes real controller with injected synthetic capabilities.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {canonical,check} from './policy.mjs';
const [sourceArg,outArg]=process.argv.slice(2);check(sourceArg&&outArg,'usage: full-recovery-demo.mjs READ_ONLY_SOURCE NEW_NON_TEMP_OUTPUT');
const source=resolve(sourceArg),out=resolve(outArg);mkdirSync(out);const archive=join(out,'archive'),home=join(out,'home'),campaign=join(out,'campaign');mkdirSync(archive);mkdirSync(home);
const fixture={root:out,home,runner:'f'.repeat(40),mode:'offline-control'},fp=join(out,'fixture.json');
const layout={version:1,runner:out,entry:join(out,'synthetic-entry'),python:join(out,'synthetic-python'),harborRoot:join(out,'synthetic-harbor'),taskRoot:join(out,'synthetic-tasks'),archiveRoot:archive,ownedRoots:[out]};const lp=join(out,'layout.json');writeFileSync(lp,JSON.stringify(layout));
const key=generateKeyPairSync('ed25519'),state=join(home,'.local/state/pan-agent/wo75');mkdirSync(state,{recursive:true});writeFileSync(join(state,'authority.json'),JSON.stringify({acceptedRunnerSha:fixture.runner,publicKey:key.publicKey.export({type:'spki',format:'pem'})}));
const driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url));let sequence=0;
function call(command,args=[],exit=0){writeFileSync(fp,JSON.stringify(fixture));const p=spawnSync(process.execPath,[driver,fp,command,'--campaign',campaign,...args],{env:{PATH:process.env.PATH,HOME:home,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:16*1024*1024});const label=String(sequence++).padStart(2,'0')+'-'+command;writeFileSync(join(out,label+'.stdout'),p.stdout);writeFileSync(join(out,label+'.stderr'),p.stderr);check(p.status===exit,'demo_'+command+': '+p.stderr);return p.stdout?JSON.parse(p.stdout):null;}
function permit(ids){const {proposedBinding:binding}=call('status',['--task',ids.join(',')]);const payload={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'offline-only100',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding};const path=join(out,payload.runId+'.synthetic-activation.json');writeFileSync(path,JSON.stringify({...payload,signature:sign(null,Buffer.from(canonical(payload)),key.privateKey).toString('base64')}));return path;}
const restored=call('restore97',['--source',source,'--layout',lp]);check(restored.notStarted===32&&restored.validScored===21,'demo_restore');
const ids=['mcmc-sampling-stan','rstan-to-pystan'];call('prepare',['--task',ids.join(','),'--task-root',layout.taskRoot]);const activation=permit(ids);
fixture.crash='after_result';call('run',['--activation',activation,'--entry',layout.entry,'--task-root',layout.taskRoot],73);delete fixture.crash;call('recover');
call('prepare',['--task',ids[1],'--task-root',layout.taskRoot]);call('run',['--activation',permit([ids[1]]),'--entry',layout.entry,'--task-root',layout.taskRoot]);const final=call('status');
const effects=readFileSync(join(out,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse),starts=effects.filter(r=>r.kind==='start');check(starts.length===2&&new Set(starts.map(r=>r.task)).size===2&&final.notStarted===30,'demo_replay');
const summary={label:'offline synthetic execution; restored old scores are historical only',restored:{consumed:57,notStarted:32,validScored:21,secondSegmentMissing:20},syntheticStarts:starts,finalNotStarted:final.notStarted,realCalls:0};writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
