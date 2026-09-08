// Trusted offline process wrapper; no account/network connector. Raw outputs are discarded.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
const dir=process.argv[2], input=JSON.parse(readFileSync(join(dir,'input.json'),'utf8'));
const put=(name,value)=>{writeFileSync(join(dir,name+'.tmp'),JSON.stringify(value)+'\n',{mode:0o600});renameSync(join(dir,name+'.tmp'),join(dir,name));};
const birth=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart=','-o','command='],{encoding:'utf8'}).trim();
put('receipt.json',{pid:process.pid,birth,key:input.attempt.key,session:input.attempt.session});
const child=spawn(process.execPath,['--import',join(dirname(fileURLToPath(import.meta.url)),'offline-guard.mjs'),join(dirname(fileURLToPath(import.meta.url)),'role.mjs'),dir],{cwd:input.attempt.worktree,env:process.env,stdio:'ignore'});
child.on('error',()=>put('completion.json',{exit:null}));
child.on('exit',code=>put('completion.json',{exit:code}));
