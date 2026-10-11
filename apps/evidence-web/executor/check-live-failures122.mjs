import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execute} from './main.mjs';
const root=resolve(process.argv[2]);await mkdir(root,{recursive:true});Object.assign(process.env,{KIMI_API_KEY:'SYNTHETIC-ONLY',WEB_PROVIDER:'kimi',WEB_MODE:'product',WEB_CHECKPOINT_MODE:'0',WEB_OPERATION_MODE:'0',WEB_ISSUE:'web122-failures',WEB107_TASK_ROOT:root});
const results=[];
for(const [i,kind] of ['auth','rate-limit','cancel','checkpoint1','checkpoint2'].entries()){
 const id=String(i+3).repeat(64),dir=join(root,id);await mkdir(join(dir,'input'),{recursive:true});await mkdir(join(dir,'output'));
 await writeFile(join(dir,'input/task.json'),'{"summary":"summary.json"}');await writeFile(join(dir,'input/summary.json'),await readFile(new URL('../../../docs/evidence/terminal-bench-full-live-97-summary.json',import.meta.url)));await writeFile(join(dir,'input/manifest.json'),JSON.stringify({version:1,title:'offline boundary',summary:'summary.json',files:{'summary.json':'f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab'}}));
 let sends=0;const ac=new AbortController(),records=[];const job={taskId:id,attemptId:id,authority:{Task:id,Attempt:id,Owner:'a'.repeat(64),Generation:1},root:dir,question:'synthetic failure'};
 if(kind.startsWith('checkpoint'))job.checkpoint={version:Number(kind.at(-1))};
 const fetchImplementation=async(url,opts)=>{sends++;assert.equal(url,'https://api.kimi.com/coding/v1/chat/completions');if(kind==='cancel'){setTimeout(()=>ac.abort(),25);return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Abort','AbortError')),{once:true}))}return new Response('SYNTHETIC-RAW-ERROR-PRIVATE',{status:kind==='auth'?403:429})};
 if(job.checkpoint){await assert.rejects(execute(job,{fetchImplementation,signal:ac.signal,handshake:async e=>({...e,action:'admission_ack'})}),/live_resume_unsupported/);assert.equal(sends,0);results.push({kind,sends});continue}
 const r=await execute(job,{fetchImplementation,signal:ac.signal,handshake:async e=>({...e,action:'admission_ack'}),record:e=>records.push(e)});
 assert.equal(sends,1);assert.equal(r.result.status,kind==='cancel'?'cancelled':'model_error');assert.ok(!JSON.stringify({r,records}).includes('SYNTHETIC-RAW-ERROR-PRIVATE'));await writeFile(join(dir,'public.json'),JSON.stringify({r,records}));results.push({kind,sends,status:r.result.status,usage:r.result.usage});
}
await writeFile(join(root,'summary.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:true,realProviderSends:0,cases:results}));
