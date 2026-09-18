/** #49 offline guard: narrowly permit read-only authorization metadata. No content exception. */
import fs from 'node:fs';
import {dirname,resolve,basename,sep} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const lstat=fs.lstatSync,write=fs.writeFileSync;
const config=JSON.parse(fs.readFileSync(process.env.WO35_GUARD_CONFIG,'utf8'));
const ancestors=new Set(),reservedPeers=new Set(),metadata=new Set();
const inside=(path,root)=>path===root||path.startsWith(root+sep);
for(const root of config.allowed){let p=resolve(root);for(;;){
 if(p!==resolve(root))ancestors.add(p);
 if(dirname(p)===p)break;
 for(const name of ['.git','.ssh','.pan-agent'])reservedPeers.add(resolve(dirname(p),name));
 p=dirname(p);
}}
await import('./base-guard.mjs');
const guarded=fs.lstatSync;
fs.lstatSync=function(path,...args){
 if(typeof path==='string'){
  const p=resolve(path),name=basename(p);
  const syntheticPolicyName=config.allowed.some(root=>inside(p,root))&&!config.denied.some(root=>inside(p,root))&&(name==='.npmrc'||name==='.env'||name.startsWith('.env.'));
  if(ancestors.has(p)||reservedPeers.has(p)||syntheticPolicyName){
   metadata.add(p);const info=lstat(path,...args);
   if(ancestors.has(p)&&(!info.isDirectory()||info.isSymbolicLink()))throw Error('ancestor_metadata_not_directory');
   return info;
  }
 }
 return guarded(path,...args);
};
process.on('exit',()=>write(resolve(dirname(config.report),'classification-metadata.json'),JSON.stringify({operation:'lstat only; no contents',paths:[...metadata].sort()},null,2)));
syncBuiltinESMExports();
