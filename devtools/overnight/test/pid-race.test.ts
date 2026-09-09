import {test} from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
const moduleURL=process.env.TEST_STORAGE_MODULE?pathToFileURL(process.env.TEST_STORAGE_MODULE).href:new URL('../src/storage.ts',import.meta.url).href;
const {birth}=await import(moduleURL);
test('C-LIVE-04 OS exit between ps reads is distinct from a still-live different identity',async t=>{
 const observations:any[]=[];
 for(const kind of ['exited-between-reads','live-different-identity'])await t.test(kind,()=>{
  const original=childProcess.execFileSync;let statuses=0;const calls:any[]=[];
  childProcess.execFileSync=((command:any,args:any[])=>{calls.push({command,args});if(args.includes('stat=')){statuses++;return kind==='exited-between-reads' && statuses>1?'Z':'S';}return 'synthetic different command identity';}) as any;syncBuiltinESMExports();
  try{const result=birth(45678);observations.push({kind,moduleURL,result,calls});assert.equal(result,kind==='exited-between-reads'?null:'synthetic different command identity');}
  finally{childProcess.execFileSync=original;syncBuiltinESMExports();if(process.env.OVERNIGHT_EVIDENCE){mkdirSync(process.env.OVERNIGHT_EVIDENCE,{recursive:true});writeFileSync(join(process.env.OVERNIGHT_EVIDENCE,'PID-RACE.json'),JSON.stringify({simulation:'SIMULATED PS responses; no PID signaled',observations},null,2)+'\n');}}
 });
});
