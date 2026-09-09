/** Human offline trial launcher: requires an installed package and existing network/credential guard. */
import {mkdtemp,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [packagePath,recordsRoot,forbiddenSource]=process.argv.slice(2);if(!packagePath||!recordsRoot)throw Error('usage: demo_tui_a.mjs INSTALLED_PACKAGE RECORDS_ROOT');
const product=resolve(packagePath),consumer=resolve(product,'../..'),source=dirname(fileURLToPath(import.meta.url));
const root=await mkdtemp(join(resolve(recordsRoot),'tui-a-')),workspace=join(root,'workspace'),memory=join(root,'memory');await mkdir(workspace);await mkdir(join(workspace,'one'));await mkdir(join(workspace,'two'));
for(const [name,body] of [['example 中文.txt','Synthetic selection-time snapshot.\n'],['one/same.txt','First duplicate basename.\n'],['two/same.txt','Second duplicate basename.\n']])await writeFile(join(workspace,name),body);
spawnSync('/usr/bin/git',['init','-q',workspace],{env:{PATH:'/usr/bin:/bin',HOME:root,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});
const guard=join(root,'guard.mjs'),driver=join(root,'driver.mjs');await copyFile(join(source,'wo35-consumer-guard.mjs'),guard);await copyFile(join(source,'fixtures/tui-a/driver.mjs'),driver);
const config=join(root,'guard.json');await writeFile(config,JSON.stringify({phase:'human-offline',consumer,allowed:[consumer,root],denied:forbiddenSource?[resolve(forbiddenSource)]:[],report:join(root,'guard-report')}));
console.log('OFFLINE TUI A · installed Product · Faux only. Type only y then Enter first. @ opens files; arrows choose; Tab attaches; Ctrl-P previews; separate Enter sends.');console.log('Wheel/trackpad (terminal SGR reports) scrolls; PageUp/Down fallback; Ctrl-End follows tail. Up/Down recalls prompts at draft edges. During the 8-second response, edit next draft; Ctrl-C cancels once. Ctrl-V safe paste/edit; Esc exits it. :exit closes.');console.log('Local recording directory: '+root);
const child=spawnSync(process.execPath,[driver,product,workspace,memory],{stdio:'inherit',cwd:consumer,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:root,TERM:process.env.TERM??'xterm-256color',LANG:'en_US.UTF-8',NODE_NO_WARNINGS:'1',NODE_OPTIONS:'--import='+guard,WO35_GUARD_CONFIG:config}});process.exitCode=child.status??1;
