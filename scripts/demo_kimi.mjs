/** #53 Human Kimi demo launcher: configure kimi-code → restart → offline wired task through the real Kimi adapter. */
import {mkdtemp,mkdir,writeFile,copyFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [packagePath,recordsRoot,forbiddenSource]=process.argv.slice(2);
if(!packagePath||!recordsRoot)throw Error('usage: demo_kimi.mjs INSTALLED_PACKAGE RECORDS_ROOT [FORBIDDEN_SOURCE]');
const product=await realpath(resolve(packagePath)),consumer=resolve(product,'../..'),source=dirname(fileURLToPath(import.meta.url));
const records=await realpath(resolve(recordsRoot));
const root=await mkdtemp(join(records,'kimi-demo-')),workspace=join(root,'workspace'),memory=join(root,'memory'),home=join(root,'settings-home');
await mkdir(workspace);await mkdir(home);
// Give the disposable workspace a git root so @ attachment discovery never walks past the guard boundary.
spawnSync('/usr/bin/git',['init','-q',workspace],{env:{PATH:'/usr/bin:/bin',HOME:root,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});
const guard=join(root,'guard.mjs'),configureDriver=join(root,'configure.mjs'),driver=join(root,'driver.mjs'),fixture=join(root,'kimi-wire.json');
await copyFile(join(source,'wo35-consumer-guard.mjs'),guard);
await copyFile(join(source,'fixtures/preview/config-interactive-configure.mjs'),configureDriver);
await copyFile(join(source,'fixtures/kimi/kimi-interactive-driver.mjs'),driver);
await copyFile(join(source,'fixtures/kimi/kimi-wire-v1.json'),fixture);
const config=join(root,'guard.json');
const denied=forbiddenSource?[await realpath(resolve(forbiddenSource))]:[];
await writeFile(config,JSON.stringify({phase:'human-offline-kimi',consumer,allowed:[consumer,root],denied,report:join(root,'guard-report')}));
const baseEnv={PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:root,TERM:process.env.TERM??'xterm-256color',LANG:'en_US.UTF-8',NODE_NO_WARNINGS:'1',NODE_OPTIONS:'--import='+guard,WO35_GUARD_CONFIG:config};
console.log('== Phase 1: first-run configuration — choose provider kimi-code (model is fixed: kimi-for-coding), credential source environment (no real key needed for the offline demo).');
let child=spawnSync(process.execPath,[configureDriver,product,home,'demo-human'],{stdio:'inherit',cwd:consumer,env:baseEnv});
if(child.status!==0){console.log('Configuration did not complete; demo stops.');process.exit(child.status??1);}
console.log('== Phase 2: restart with persisted kimi-code settings, then run the offline first task (y, task text, :runs, :replay RUN_ID, :exit)');
child=spawnSync(process.execPath,[driver,product,workspace,memory,fixture,home],{stdio:'inherit',cwd:consumer,env:baseEnv});
spawnSync('security',['delete-generic-password','-s','com.pym96.pan-agent.workorder-52-test','-a','demo-human'],{stdio:'ignore'});
spawnSync('security',['delete-generic-password','-s','com.pym96.pan-agent.workorder-52-test','-a','kimi-code-key'],{stdio:'ignore'});
console.log('Demo closed. Records: '+root);
process.exitCode=child.status??1;
