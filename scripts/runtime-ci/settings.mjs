#!/usr/bin/env node
/** Installed settings checks: actual packed CLI and public installed composition only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess from 'node:child_process';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';

const [installedArgument, outputArgument] = process.argv.slice(2);
if (!installedArgument || !outputArgument) throw Error('usage: settings.mjs INSTALLED_PACKAGE NEW_OUTPUT');
const installed = path.resolve(installedArgument), out = path.resolve(outputArgument);
fs.mkdirSync(out, {recursive:false});
const home=path.join(out,'home'),workspace=path.join(out,'workspace');fs.mkdirSync(home);fs.mkdirSync(workspace);
assert.equal(fs.existsSync(path.join(installed,'src')),false,'installed consumer must have no source dependency');
assert.equal(fs.existsSync(path.join(installed,'node_modules/typescript')),false);
const settingsPath=path.join(home,'.pan-agent/settings.json'),cli=path.join(installed,'bin/pan-agent.mjs');
const guard=path.join(out,'guard.mjs'),forbidden=path.join(out,'forbidden.log');
fs.writeFileSync(guard, `import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {appendFileSync} from 'node:fs';
const forbidden=what=>{appendFileSync(process.env.PAN_SETTINGS_FORBIDDEN,what+'\\n');throw Error('forbidden_external_access');};
globalThis.fetch=()=>forbidden('fetch');const original=cp.spawnSync;cp.spawnSync=(file,...args)=>{if(file==='security'||file==='/usr/bin/security')return forbidden('keychain');return original(file,...args);};syncBuiltinESMExports();\n`);
const env={PATH:process.env.PATH,HOME:home,TMPDIR:out,NODE_OPTIONS:'--import='+pathToFileURL(guard).href,PAN_SETTINGS_FORBIDDEN:forbidden};
const commands=[],checks=[];
function command(name,args,input){const result=childProcess.spawnSync(process.execPath,[cli,...args],{cwd:workspace,env,input,encoding:'utf8',timeout:8000});fs.writeFileSync(path.join(out,name+'.stdout'),result.stdout??'');fs.writeFileSync(path.join(out,name+'.stderr'),result.stderr??'');commands.push({name,args,status:result.status,signal:result.signal,error:result.error?.message});assert.equal(result.error,undefined);return result;}
const canary=childProcess.spawnSync(process.execPath,['--input-type=module','-e',"import {spawnSync} from 'node:child_process';try{await fetch('data:text/plain,probe')}catch{}try{spawnSync('security',[])}catch{}"],{env:{...env,PAN_SETTINGS_FORBIDDEN:path.join(out,'guard-canary.log')},encoding:'utf8',timeout:8000});
assert.equal(canary.status,0);assert.equal(fs.readFileSync(path.join(out,'guard-canary.log'),'utf8'),'fetch\nkeychain\n');checks.push('network-and-keychain-guards-active');
const p=command('absent-path',['settings','path']);assert.equal(p.status,0);assert.equal(p.stdout.trim(),settingsPath);
const absent=command('absent-show',['settings','show']);assert.equal(absent.status,0);assert.match(absent.stdout,/settings_absent/);assert.equal(command('absent-validate',['settings','validate']).status,2);assert.deepEqual(fs.readdirSync(home),[]);checks.push('absent-read-only');
const valid={schemaVersion:1,provider:'deepseek',modelId:'deepseek-v4-flash',thinkingLevel:'high',credentialSource:'keychain',protectedPaths:['private'],permissions:{deny:['bash(*denied-file*)']},maxAttachmentBytes:8};
fs.mkdirSync(path.dirname(settingsPath),{mode:0o700});fs.writeFileSync(settingsPath,JSON.stringify(valid),{mode:0o600});const before=fs.readFileSync(settingsPath);
const show=command('valid-show',['settings','show']);assert.equal(show.status,0);assert.deepEqual(JSON.parse(show.stdout),valid);assert.equal(command('valid-validate',['settings','validate']).status,0);assert.deepEqual(fs.readFileSync(settingsPath),before);checks.push('keychain-source-read-only-json-roundtrip');
const configured=command('configure-preserves',['configure'],'kimi-code:k3-256k\nmax\nenvironment\n');assert.equal(configured.status,0);const saved=JSON.parse(fs.readFileSync(settingsPath));assert.deepEqual(saved,{...valid,provider:'kimi-code',modelId:'k3-256k',thinkingLevel:'max',credentialSource:'environment'});assert.equal(fs.statSync(settingsPath).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(settingsPath)).mode&0o777,0o700);checks.push('configure-preserves-extensions-and-modes');
for(const [name,value] of [['secret',{...valid,apiKey:'SYNTHETIC_SETTINGS_SECRET'}],['invalid-deny',{...valid,permissions:{deny:['Bash(*)']}}],['secret-provider',{...valid,provider:'SYNTHETIC_SETTINGS_SECRET'}]]){
 fs.writeFileSync(settingsPath,JSON.stringify(value));const old=fs.readFileSync(settingsPath);for(const args of [['settings','show'],['settings','validate'],['configure']]){const r=command(name+'-'+args.join('-'),args,'\n\n\nk\nSYNTHETIC_SETTINGS_SECRET\ny\n');assert.equal(r.status,2);assert.doesNotMatch(r.stdout+r.stderr,/SYNTHETIC_SETTINGS_SECRET/);}assert.deepEqual(fs.readFileSync(settingsPath),old);assert.equal(command(name+'-path',['settings','path']).status,0);
}checks.push('malformed-blocks-before-credential-mutation');
assert.equal(fs.existsSync(forbidden),false,'settings commands accessed external credential/provider boundary');

// Installed public runCli seam, with only the model and terminal substituted.
let external=0;globalThis.fetch=()=>{external++;throw Error('unexpected provider');};const originalSpawn=childProcess.spawnSync;childProcess.spawnSync=(file,...args)=>{if(file==='security'||file==='/usr/bin/security'){external++;throw Error('unexpected Keychain');}return originalSpawn(file,...args);};syncBuiltinESMExports();
const api=await import(pathToFileURL(path.join(installed,'dist/index.js')).href);
const identity={provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
const response=content=>({kind:'response',message:{role:'assistant',timestamp:0,content},stopReason:content[0].type==='tool_call'?'tool_calls':'stop',usage:{status:'unavailable'},identity});
let approvals=0,launch=0;const audits=[];
for(const [savedLimit,flag,expected] of [[8,undefined,8],[32,16,16],[undefined,undefined,1048576]]){
 launch++;const configuration={schemaVersion:1,provider:'deepseek',modelId:'deepseek-v4-flash',thinkingLevel:'high',credentialSource:'keychain',permissions:{deny:launch===1?['bash(*denied-file*)']:[]},...(savedLimit?{maxAttachmentBytes:savedLimit}:{})};await api.savePanSettings(configuration,home);
 const output=new PassThrough();let rendered='';output.on('data',c=>{rendered+=c;});
 const adapter=new api.FauxModelAdapter([response([{type:'tool_call',id:'allowed-'+launch,name:'bash',arguments:{command:'printf OK > allowed-file'}}]),response([{type:'tool_call',id:'denied-'+launch,name:'bash',arguments:{command:'printf CONTROL > denied-file'}}]),response([{type:'text',text:'done'}])]);
 const code=await api.runCli(['--kernel','native','--trusted-local','--workspace',workspace,'--memory-root',path.join(out,'archives'),...(flag?['--max-attachment-bytes',String(flag)]:[])],{home,output,createNativeAdapter:()=>adapter,startTui:async options=>{
  assert.equal(options.maxAttachmentBytes,expected);options.session.setApprovalChannel(async r=>{approvals++;return {requestId:r.requestId,decision:'trust-shell'};});
  if(launch===1)await api.savePanSettings({...configuration,permissions:{deny:[]}},home);
  const result=await options.session.runTask('deterministic installed policy sentinel');const records=await options.archiveStore.readArchive(result.runId);fs.writeFileSync(path.join(out,'archive-'+launch+'.json'),JSON.stringify(records,null,2)+'\n');const settled=records.filter(r=>r.type==='tool.settled');assert.equal(settled.length,2);assert.equal(settled[0].isError,false);assert.equal(settled[1].isError,launch===1);assert.equal(fs.readFileSync(path.join(workspace,'allowed-file'),'utf8'),'OK');
  if(launch===1){assert.equal(fs.existsSync(path.join(workspace,'denied-file')),false);const a=settled[1].details.authorization;assert.equal(settled[1].details.code,'permission_denied');assert.equal(a.rule,'bash(*denied-file*)');assert.equal(a.callId,'denied-1');assert.match(a.policyRevision,/^[a-f0-9]{64}$/);audits.push(a);}else assert.equal(fs.readFileSync(path.join(workspace,'denied-file'),'utf8'),'CONTROL');
  await options.session.close();return 0;
 }});assert.equal(code,0);fs.writeFileSync(path.join(out,'launch-'+launch+'.stdout'),rendered);
}
assert.equal(approvals,3);assert.equal(external,0);checks.push('installed-saved-flag-default-attachment-precedence','installed-trusted-shell-denial-sentinel-and-archive','new-session-reloads-policy');
const summary={status:'PASS',checks,commands,approvals,externalAccesses:external,denial:audits[0],sentinels:{firstSessionDeniedFileAbsent:true,allowedFile:fs.readFileSync(path.join(workspace,'allowed-file'),'utf8'),newSessionControl:fs.readFileSync(path.join(workspace,'denied-file'),'utf8')},limits:'Request text glob only; current session policy is frozen; no Docker containment claim; Faux provider'};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
