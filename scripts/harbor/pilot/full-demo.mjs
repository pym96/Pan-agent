/** Offline public-CLI walkthrough. Synthetic signing keys and I/O only. */
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canonical,check,digest} from './policy.mjs';
const root=resolve(process.argv[2]??'');check(process.argv[2]&&!existsSync(root),'fresh_demo_directory_required');mkdirSync(root);const home=join(root,'home');mkdirSync(home);const campaign=join(root,'campaign'),runner='f'.repeat(40),keys=generateKeyPairSync('ed25519'),fixture=join(root,'fixture.json');
const control={root,home,runner};const authority=join(home,'.local/state/pan-agent/wo75');mkdirSync(authority,{recursive:true});writeFileSync(join(authority,'authority.json'),JSON.stringify({acceptedRunnerSha:runner,publicKey:keys.publicKey.export({type:'spki',format:'pem'})}));
const driver=fileURLToPath(new URL('./test_full_driver.mjs',import.meta.url)),trace=[];
function call(command,args=[],expected=0){writeFileSync(fixture,JSON.stringify(control));const p=spawnSync(process.execPath,[driver,fixture,command,'--campaign',campaign,...args],{env:{PATH:process.env.PATH,HOME:home,TMPDIR:root,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:16*1024*1024});trace.push({command,args,status:p.status,stderr:p.stderr});check(p.status===expected,'demo_unexpected_exit');return p.stdout?JSON.parse(p.stdout):null;}
function activate(ids){const binding=call('status',['--task',ids.join(',')]).proposedBinding,a={authorized:true,version:2,validity:'run-bound',runId:randomUUID(),humanAuthorizationId:'OFFLINE-DEMO-ONLY',notBefore:'2020-01-01T00:00:00Z',expiresAt:null,binding};a.signature=sign(null,Buffer.from(canonical(a)),keys.privateKey).toString('base64');const path=join(root,a.runId+'.json');writeFileSync(path,JSON.stringify(a));return path;}
const run=p=>['--activation',p,'--entry',join(root,'synthetic-entry'),'--task-root',join(root,'synthetic-source')];
call('init',['--entry',join(root,'synthetic-entry')]);const m=JSON.parse(readFileSync(new URL('./full-manifest.json',import.meta.url))),ids=m.tasks.map(t=>t.id);
control.scenarios={[ids[0]]:'valid_failure',[ids[2]]:'prep_zero',[ids[3]]:'model',[ids[4]]:'retry'};
call('prepare',['--task',ids.slice(0,3).join(','),'--task-root',root]);const first=activate(ids.slice(0,3));control.crash='before_result';control.crashTask=ids[1];call('run',run(first),73);
const interrupted=call('status');delete control.crash;delete control.crashTask;call('recover');const rest=ids.slice(2);call('prepare',['--task',rest.join(','),'--task-root',root]);const second=activate(rest);call('run',run(second));const final=call('status');
const effects=readFileSync(join(root,'effects.jsonl'),'utf8').trim().split('\n').map(JSON.parse),starts=effects.filter(e=>e.kind==='start').map(e=>e.task);check(starts.length===89&&new Set(starts).size===89,'demo_duplicate_start');check(final.rows.length===89&&final.rows[1].state==='unknown_interrupted','demo_unknown_lost');
writeFileSync(join(root,'transcript.json'),JSON.stringify({trace,interrupted,final,assertions:{uniqueStarts:89,denominator:89,unknownPreserved:true,realModelCalls:0,officialTaskExecutions:0}},null,2)+'\n');console.log(JSON.stringify({artifact:join(root,'transcript.json'),sha256:digest(readFileSync(join(root,'transcript.json'))),successFraction:final.successFraction,validScoredFraction:final.validScoredFraction,unknown:final.rows.filter(r=>r.state==='unknown_interrupted').length}));
