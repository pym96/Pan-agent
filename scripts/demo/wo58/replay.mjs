// Read-only auxiliary projection; intentionally excludes all free-form payloads.
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
const TYPES=new Set(['run.started','model.turn_started','model.turn_settled','tool.started','tool.settled','run.terminal','run.settled']);
export function project(records) {
 return records.map((r,sequence)=>({sequence,type:TYPES.has(r.type)?r.type:'other',
  ...(Number.isSafeInteger(r.turn)&&r.turn>=0?{turn:r.turn}:{}),
  ...(r.toolName==='task_command'?{tool:'task_command'}:{}),
  ...(typeof r.isError==='boolean'?{isError:r.isError}:{}),
  ...(['completed','cancelled','model_error','incomplete','interrupted'].includes(r.status??r.settled_state)?{terminal:r.status??r.settled_state}:{}),
  payload:'withheld; private offline source only'}));
}
export async function replay(entry,root,id) {
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('invalid run id');
 for(const p of [root,join(root,'runs'),join(root,'runs',id),...['manifest.json','events.jsonl'].map(f=>join(root,'runs',id,f))])if(lstatSync(p).isSymbolicLink())throw Error('symlink refused');
 if(JSON.stringify(readdirSync(join(root,'runs')).filter(n=>!n.startsWith('._')).sort())!==JSON.stringify([id]))throw Error('single sealed copy required');
 const {RunArchiveStore,verifyArchiveBytes}=await import(pathToFileURL(resolve(entry)).href);
 const manifest=JSON.parse(readFileSync(join(root,'runs',id,'manifest.json')));
 verifyArchiveBytes(readFileSync(join(root,'runs',id,'events.jsonl'),'utf8'),manifest);
 // Verified sealed single-run copy only: open's unsealed recovery is never needed.
 const store=await RunArchiveStore.open(root),records=await store.readArchive(id);
 return {label:'AUXILIARY READ-ONLY REPLAY / historical offline preparation, NOT a new demonstration run',runId:id,events:project(records),officialScore:'not inferred from archive terminal'};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [entry,root,id]=process.argv.slice(2);console.log(JSON.stringify(await replay(entry,root,id),null,2));
}
