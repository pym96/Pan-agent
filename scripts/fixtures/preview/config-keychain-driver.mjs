/** #52 disposable-Keychain lifecycle driver with independent child argv/env capture. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const [product,home,account,mode,canary]=process.argv.slice(2);
if(!product||!home||!account||!mode||!canary)throw new Error('usage: config-keychain-driver.mjs PRODUCT HOME ACCOUNT accept|decline|denied|fail-after-save|interrupt-after-save|multiline-key CANARY');
// Independent instrumentation: capture EVERY child argv and environment.
const children=[];
const wrap=(original)=>function(command,args,options){
 children.push({command,args:Array.isArray(args)?[...args]:[],env:options?.env?{...options.env}:null});
 return original.call(this,command,args,options);
};
cp.spawn=wrap(cp.spawn);cp.spawnSync=wrap(cp.spawnSync);
syncBuiltinESMExports();
const {runCli,saveKeychainCredential,readKeychainCredential,deleteKeychainCredential,keychainCredentialExists,loadPanSettings,PanKeychainError}=await import(pathToFileURL(join(product,'dist/index.js')));
const reference={service:'com.pym96.pan-agent.workorder-52-test',account};
// Cleanup on success, failure and interruption alike.
const cleanup=()=>{try{if(keychainCredentialExists(reference))deleteKeychainCredential(reference);}catch{}};
process.on('SIGINT',()=>{cleanup();process.exit(130);});
process.on('SIGTERM',()=>{cleanup();process.exit(143);});
const report={mode,reference:{service:reference.service,account},steps:[]};
const scan=()=>{
 const argvHit=children.some(c=>c.args.some(a=>String(a).includes(canary))||String(c.command).includes(canary));
 const envHit=children.some(c=>c.env&&Object.values(c.env).some(v=>String(v).includes(canary)));
 return {canaryInChildArgv:argvHit,canaryInChildEnv:envHit,childCount:children.length};
};
try{
 assert.equal(keychainCredentialExists(reference),false,'test item must not pre-exist');
 report.steps.push('pre-absent');
 if(mode==='multiline-key'){
  // A newline-bearing key must be rejected BEFORE any write: no -i child, no item, explicit error.
  const multiline=canary+'\nTRUNCATED-SECOND-LINE';
  let thrown=null;
  try{saveKeychainCredential(multiline,reference);}catch(e){thrown=e;}
  assert.ok(thrown instanceof PanKeychainError,'rejection must be a typed Keychain error');
  assert.match(thrown.message,/single line of printable characters/);
  assert.equal(children.filter(c=>c.args.join(' ')==='-i').length,0,'rejected key must never spawn the write channel');
  assert.equal(keychainCredentialExists(reference),false,'rejected key must leave no item');
  report.steps.push('multiline-rejected-pre-write');
 }else{
 const accepting=mode==='accept'||mode==='fail-after-save'||mode==='interrupt-after-save';
 const answers=accepting?['','','','keychain',canary,'y']:mode==='decline'?['','','','keychain',canary,'n','environment']:['','','','keychain',canary,'y','environment'];
 const saveCredential=mode==='denied'
  ?()=>{throw new PanKeychainError('keychain_denied','User interaction is not allowed');}
  :(secret,ref)=>saveKeychainCredential(secret,ref);
 const input=new PassThrough();const output=new PassThrough();output.setEncoding('utf8');
 let rendered='';output.on('data',c=>{rendered+=c;});
 const pending=runCli(['configure'],{input,output,home,saveCredential,keychainReference:reference});
 for(const line of answers)input.write(line+'\n');input.end();
 const code=await pending;
 assert.equal(code,0);
 report.steps.push('configure-exit-0');
 const settings=await loadPanSettings(home);
 const settingsBody=await readFile(join(home,'.pan-agent','settings.json'),'utf8');
 assert.ok(!settingsBody.includes(canary),'canary must never reach settings');
 if(accepting){
  assert.equal(settings?.credentialSource,'keychain');
  assert.match(rendered,/Keychain item saved/);
  // Authorized retrieval probe: exactly the named item, exactly the canary, exactly once.
  assert.equal(readKeychainCredential(reference),canary,'restart retrieval must return the canary through the named reference');
  report.steps.push('item-created-and-retrieved');
  if(mode==='fail-after-save'){
   report.steps.push('deliberate-failure');
   throw new Error('deliberate failure after save: cleanup must still run');
  }
  if(mode==='interrupt-after-save'){
   // Deterministic interruption: the signal handler must remove the test item.
   report.rendered=rendered;
   Object.assign(report,scan());
   report.children=children;
   report.ok=true;report.interrupted=true;
   await writeFile(join(home,'keychain-report.json'),JSON.stringify(report,null,2)+'\n');
   process.kill(process.pid,'SIGTERM');
   await new Promise(r=>setTimeout(r,10000));
  }
 }else if(mode==='decline'){
  assert.equal(settings?.credentialSource,'environment');
  assert.match(rendered,/Remembering declined; no Keychain item written/);
  assert.equal(keychainCredentialExists(reference),false,'decline must create no item');
  report.steps.push('decline-no-item');
 }else{
  assert.equal(settings?.credentialSource,'environment','denied save must fall back to an explicit choice, not a false saved state');
  assert.match(rendered,/Keychain save failed explicitly: keychain_denied/);
  assert.equal(keychainCredentialExists(reference),false,'denied must create no item');
  report.steps.push('denied-explicit');
 }
 assert.ok(!rendered.includes(canary),'canary must never reach terminal output');
 report.rendered=rendered;
 }
 Object.assign(report,scan());
 report.children=children;
 report.ok=true;
}catch(error){report.ok=false;report.error=String(error);Object.assign(report,scan());report.children=children;}
finally{
 cleanup();
 report.cleanedUp=!keychainCredentialExists(reference);
 await writeFile(join(home,'keychain-report.json'),JSON.stringify(report,null,2)+'\n');
}
if(!report.ok){console.error(report.error);process.exit(1);}
console.log('PASS keychain lifecycle',mode,'cleanup',report.cleanedUp,'canaryInChildArgv',report.canaryInChildArgv,'canaryInChildEnv',report.canaryInChildEnv);
