// Fail closed if this offline replay attempts network or child/tool execution.
const fs=require('node:fs');
const attempts=[];
const deny=name=>(...args)=>{attempts.push(name);throw Error('WO58_OFFLINE_DENIED:'+name);};
globalThis.fetch=deny('fetch');
for(const [mod,names] of [['node:http',['request','get']],['node:https',['request','get']],['node:net',['connect','createConnection']],['node:tls',['connect']],['node:dgram',['createSocket']],['node:child_process',['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']]]){
 const m=require(mod);for(const n of names)m[n]=deny(mod+'.'+n);
}
require('node:module').syncBuiltinESMExports();
process.on('exit',()=>{if(process.env.WO58_GUARD_LOG)fs.writeFileSync(process.env.WO58_GUARD_LOG,JSON.stringify({networkAndChildProcessAttempts:attempts}));});
