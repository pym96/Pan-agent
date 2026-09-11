/** #52 Human demo launcher: configure (disposable test Keychain item only) → restart → offline Faux task. */
import {mkdtemp,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [packagePath,recordsRoot,forbiddenSource]=process.argv.slice(2);
if(!packagePath||!recordsRoot)throw Error('usage: demo_config.mjs INSTALLED_PACKAGE RECORDS_ROOT [FORBIDDEN_SOURCE]');
const product=await realpathResolve(packagePath),source=dirname(fileURLToPath(import.meta.url));
async function realpathResolve(p){const {realpath}=await import('node:fs/promises');return realpath(resolve(p));}
const consumer=resolve(product,'../..');
const records=await realpathResolve(recordsRoot);
const root=await mkdtemp(join(records,'config-demo-')),workspace=join(root,'workspace'),memory=join(root,'memory'),home=join(root,'settings-home');
await mkdir(workspace);await mkdir(home);
const testAccount='demo-human';
const guard=join(root,'guard.mjs'),driver=join(root,'driver.mjs'),fixture=join(root,'fixture.json'),configureDriver=join(root,'configure.mjs');
await copyFile(join(source,'wo35-consumer-guard.mjs'),guard);
await copyFile(join(source,'fixtures/preview/interactive-driver.mjs'),driver);
await copyFile(join(source,'fixtures/preview/config-interactive-configure.mjs'),configureDriver);
await copyFile(join(source,'fixtures/preview-first-task-v1.json'),fixture);
const config=join(root,'guard.json');
await writeFile(config,JSON.stringify({phase:'human-offline-config',consumer,allowed:[consumer,root],denied:forbiddenSource?[await realpathResolve(forbiddenSource)]:[],report:join(root,'guard-report')}));
const baseEnv={PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:root,TERM:process.env.TERM??'xterm-256color',LANG:'en_US.UTF-8',NODE_NO_WARNINGS:'1',NODE_OPTIONS:'--import='+guard,WO35_GUARD_CONFIG:config};
console.log('== Phase 1: first-run configuration (answers stay local; any Keychain write uses only the disposable test item com.pym96.pan-agent.workorder-52-test/'+testAccount+')');
console.log('   Suggested: provider deepseek, a model, a thinking level, then (e)nvironment — no real key needed for the offline demo.');
let child=spawnSync(process.execPath,[configureDriver,product,home,testAccount],{stdio:'inherit',cwd:consumer,env:baseEnv});
if(child.status!==0){console.log('Configuration did not complete; demo stops.');process.exit(child.status??1);}
console.log('== Phase 2: restart with persisted settings, then run the offline first task (y, task text, :runs, :replay RUN_ID, :exit)');
child=spawnSync(process.execPath,[driver,product,workspace,memory,fixture,home],{stdio:'inherit',cwd:consumer,env:baseEnv});
// Demo hygiene: remove the disposable test item if the Human chose to remember a key.
spawnSync('security',['delete-generic-password','-s','com.pym96.pan-agent.workorder-52-test','-a',testAccount],{stdio:'ignore'});
console.log('Demo closed. Records: '+root);
process.exitCode=child.status??1;
