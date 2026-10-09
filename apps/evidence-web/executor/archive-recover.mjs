// Stop-only maintenance. Uses existing Product recovery rules; never starts a run.
import {readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]);
if(!/^[a-f0-9]{64}$/.test(root.split('/').at(-1))||root!==resolve(process.env.WEB107_TASK_ROOT,root.split('/').at(-1)))throw Error('archive_owner');
const archive=join(root,'archive');try{if(!(await lstat(archive)).isDirectory())throw Error('archive_root')}catch(e){if(e.code==='ENOENT')process.exit(0);throw e}
const {RunArchiveStore}=await import(pathToFileURL(process.env.PAN_ENTRY));
const pending=[];for(const run of await readdir(join(archive,'runs'))){const dir=join(archive,'runs',run);try{await readFile(join(dir,'manifest.json'))}catch(e){if(e.code!=='ENOENT')throw e;const raw=await readFile(join(dir,'events.jsonl'));const backup=join(root,'interrupted-'+run+'.jsonl');try{await writeFile(backup,raw,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}pending.push({runId:run,originalEventsSHA256:createHash('sha256').update(raw).digest('hex')})}}
await RunArchiveStore.open(archive);
if(pending.length)await writeFile(join(root,'archive-recovery.json'),JSON.stringify({rule:'existing RunArchiveStore.open/recoverRun; original causal bytes retained separately',pending}),{flag:'wx',mode:0o600});
