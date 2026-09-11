/** #52 disposable-Keychain lifecycle driver: accept/decline paths, real security CLI, cleanup in every path. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const [product,home,account,mode,canary]=process.argv.slice(2);
if(!product||!home||!account||!mode||!canary)throw new Error('usage: config-keychain-driver.mjs PRODUCT HOME ACCOUNT accept|decline|interrupt-after-save CANARY');
const securityCalls=[];
const originalSpawnSync=cp.spawnSync;cp.spawnSync=function(command,args,options){if(command==='security')securityCalls.push((Array.isArray(args)?args:[]).map(a=>a===canary?'<redacted>':a));return originalSpawnSync.call(this,command,args,options);};
syncBuiltinESMExports();
const {runCli,saveKeychainCredential,readKeychainCredential,deleteKeychainCredential,keychainCredentialExists,loadPanSettings}=await import(pathToFileURL(join(product,'dist/index.js')));
const reference={service:'com.pym96.pan-agent.workorder-52-test',account};
// Cleanup on success, failure and interruption alike.
const cleanup=()=>{try{if(keychainCredentialExists(reference))deleteKeychainCredential(reference);}catch{}};
process.on('SIGINT',()=>{cleanup();process.exit(130);});
process.on('SIGTERM',()=>{cleanup();process.exit(143);});
const report={mode,reference:{service:reference.service,account},steps:[]};
try{
 assert.equal(keychainCredentialExists(reference),false,'test item must not pre-exist');
 report.steps.push('pre-absent');
 const answers=(mode==='accept'||mode==='interrupt-after-save')?['','','','keychain',canary,'y']:['','','','keychain',canary,'n','environment'];
 const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
 let rendered='';output.on('data',c=>{rendered+=c;});
 const pending=runCli(['configure'],{input,output,home,saveCredential:(secret,ref)=>saveKeychainCredential(secret,ref),keychainReference:reference});
 for(const line of answers)input.write(line+'\n');input.end();
 const code=await pending;
 assert.equal(code,0);
 report.steps.push('configure-exit-0');
 const settings=await loadPanSettings(home);
 const settingsBody=await readFile(join(home,'.pan-agent','settings.json'),'utf8');
 assert.ok(!settingsBody.includes(canary),'canary must never reach settings');
 if(mode==='accept'||mode==='interrupt-after-save'){
  assert.equal(settings?.credentialSource,'keychain');
  assert.match(rendered,/Keychain item saved/);
  // Authorized retrieval probe: exactly the named item, exactly the canary.
  assert.equal(readKeychainCredential(reference),canary,'restart retrieval must return the canary through the named reference');
  report.steps.push('item-created-and-retrieved');
  if(mode==='interrupt-after-save'){
   // Deterministic interruption: the signal handler must remove the test item.
   report.rendered=rendered.replaceAll(canary,'<redacted>');
   report.securityCalls=securityCalls;
   report.ok=true;report.interrupted=true;
   await writeFile(join(home,'keychain-report.json'),JSON.stringify(report,null,2)+'\n');
   process.kill(process.pid,'SIGTERM');
   await new Promise(r=>setTimeout(r,10000));
  }
 }else{
  assert.equal(settings?.credentialSource,'environment');
  assert.match(rendered,/Remembering declined; no Keychain item written/);
  assert.equal(keychainCredentialExists(reference),false,'decline must create no item');
  report.steps.push('decline-no-item');
 }
 assert.ok(!rendered.includes(canary),'canary must never reach terminal output');
 report.rendered=rendered.replaceAll(canary,'<redacted>');
 report.securityCalls=securityCalls;
 report.ok=true;
}catch(error){report.ok=false;report.error=String(error);}
finally{
 cleanup();
 report.cleanedUp=!keychainCredentialExists(reference);
 await writeFile(join(home,'keychain-report.json'),JSON.stringify(report,null,2)+'\n');
}
if(!report.ok){console.error(report.error);process.exit(1);}
console.log('PASS keychain lifecycle',mode,'cleanup',report.cleanedUp);
