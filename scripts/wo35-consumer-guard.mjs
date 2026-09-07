/** Offline verification only: a caught forbidden attempt still fails the process. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import cp from 'node:child_process';
const originalWrite=fs.writeFileSync;
const config=JSON.parse(fs.readFileSync(process.env.WO35_GUARD_CONFIG,'utf8'));
const counts={forbidden_resolution:0,forbidden_filesystem:0,network_attempts:0,real_credential_reads:0,real_provider_calls:0,balance_queries:0,paid_formal_runs:0,cost_cny:0};
const loads=new Set();const filesystem=new Set();const children=[];
const inside=(file,root)=>file===root||file.startsWith(root+path.sep);
function violation(key, detail="") {counts[key]++;console.error(`WO35 blocked ${key}: ${detail}`,new Error().stack);throw new Error(`WO35 blocked ${key}: ${detail}`);}
function checkedFile(value,key) {
 if(typeof value==='number')return;
 if(value instanceof URL)value=fileURLToPath(value);
 if(Buffer.isBuffer(value))value=value.toString();
 if(typeof value!=='string')return;
 const file=path.resolve(value);
 if(config.denied.some(root=>inside(file,root))||!config.allowed.some(root=>inside(file,root)))violation(key,file);
 if(/[/\\](?:\.npmrc|\.env)(?:$|\.)/.test(file) && !inside(file,config.consumer))violation(key,file);
 return file;
}
registerHooks({
 resolve(specifier,context,next) {
  if(/@earendil-works\/pi-|^(?:typescript|tsx|ts-node)(?:\/|$)|[/\\]references[/\\]pi/.test(specifier))violation('forbidden_resolution');
  const result=next(specifier,context);
  if(result.url.startsWith('file:')) {
   checkedFile(new URL(result.url),'forbidden_resolution');
   if(result.url.endsWith('.ts'))violation('forbidden_resolution');
  }
  loads.add(result.url);return result;
 },
 load(url,context,next) {if(url.startsWith('file:'))checkedFile(new URL(url),'forbidden_resolution');return next(url,context);},
});
for(const object of [fs,fsp])for(const name of ['readFile','readFileSync','open','openSync','access','accessSync','stat','statSync','lstat','lstatSync','readdir','readdirSync','realpath','realpathSync','createReadStream']) {
 const original=object[name];if(typeof original!=='function')continue;
 const wrap=implementation=>function(file,...args){const checked=checkedFile(file,'forbidden_filesystem');if(checked)filesystem.add(checked);return implementation.call(this,file,...args);};
 object[name]=wrap(original);
 if(typeof original.native==='function')object[name].native=wrap(original.native);
}
for(const [object,names] of [[net,['connect','createConnection']],[tls,['connect']],[http,['get','request']],[https,['get','request']]])for(const name of names)object[name]=()=>violation('network_attempts');
net.Socket.prototype.connect=function(){return violation('network_attempts');};
globalThis.fetch=async()=>violation('network_attempts');
const originalSpawn=cp.spawn;
cp.spawn=function(command,args,options){
 if(/\b(?:curl|wget|ssh|npx|npm|python)\b/.test([command,...(Array.isArray(args)?args:[])].join(' ')))violation('network_attempts');
 const child=originalSpawn.call(this,command,args,options);
 const observed={command,args,cwd:options?.cwd,exit:null,signal:null};children.push(observed);
 child.on('close',(code,signal)=>{observed.exit=code;observed.signal=signal;});return child;
};
const environment=process.env;
process.env=new Proxy(environment,{set(target,key,value){target[key]=value;return true;},get(target,key){if(typeof key==='string'&&/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|NPM_TOKEN|PASSWORD|SECRET)/i.test(key))violation('real_credential_reads');return Reflect.get(target,key);}});
syncBuiltinESMExports();
const originalExit=process.exit;
const attempted=()=>counts.forbidden_resolution+counts.forbidden_filesystem+counts.network_attempts+counts.real_credential_reads;
process.exit=function(code){return originalExit.call(process,attempted()?1:code);};
process.on('exit',()=>{
 if(counts.forbidden_resolution+counts.forbidden_filesystem+counts.network_attempts+counts.real_credential_reads)process.exitCode=1;
 const report={phase:config.phase,pid:process.pid,node:process.version,execPath:process.execPath,execArgv:process.execArgv,...counts,loaded_modules:[...loads].sort(),filesystem:[...filesystem].sort(),children};
 originalWrite(`${config.report}.${process.pid}.json`,JSON.stringify(report,null,2)+'\n');
 console.log('WO35 meters',JSON.stringify(counts));
});
