/** Extend the unchanged offline consumer guard only for exact ancestor directory metadata.
 * #49 must lstat ancestors before effects. No directory listing or file-content exception. */
import fs from 'node:fs';
import {dirname,resolve} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const lstat=fs.lstatSync;
const config=JSON.parse(fs.readFileSync(process.env.WO35_GUARD_CONFIG,'utf8'));
const ancestors=new Set();
for(const root of config.allowed){let p=dirname(resolve(root));for(;;){ancestors.add(p);if(dirname(p)===p)break;p=dirname(p);}}
await import('./base-guard.mjs');
const guarded=fs.lstatSync;
fs.lstatSync=function(path,...args){
 if(typeof path==='string'&&ancestors.has(resolve(path))){const info=lstat(path,...args);if(!info.isDirectory()||info.isSymbolicLink())throw Error('ancestor_metadata_not_directory');return info;}
 return guarded(path,...args);
};
syncBuiltinESMExports();
