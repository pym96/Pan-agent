/** #51 Human offline preview launcher: requires an installed package and the existing network/credential guard. */
import {mkdtemp,mkdir,writeFile,copyFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [packagePath,recordsRoot,forbiddenSource]=process.argv.slice(2);
if(!packagePath||!recordsRoot)throw Error('usage: demo_preview.mjs INSTALLED_PACKAGE RECORDS_ROOT [FORBIDDEN_SOURCE]');
// Resolve symlinks (e.g. /var vs /private/var) so guard identity matches module realpaths.
const product=await realpath(resolve(packagePath)),consumer=resolve(product,'../..'),source=dirname(fileURLToPath(import.meta.url));
const root=await mkdtemp(join(await realpath(resolve(recordsRoot)),'preview-')),workspace=join(root,'workspace'),memory=join(root,'memory');
await mkdir(workspace);
// Give the disposable workspace a git root so @ attachment discovery never walks past the guard boundary.
spawnSync('/usr/bin/git',['init','-q',workspace],{env:{PATH:'/usr/bin:/bin',HOME:root,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});
const guard=join(root,'guard.mjs'),driver=join(root,'driver.mjs'),fixture=join(root,'fixture.json');
await copyFile(join(source,'wo35-consumer-guard.mjs'),guard);
await copyFile(join(source,'fixtures/preview/interactive-driver.mjs'),driver);
await copyFile(join(source,'fixtures/preview-first-task-v1.json'),fixture);
const config=join(root,'guard.json');
const denied=forbiddenSource?[await realpath(resolve(forbiddenSource))]:[];
await writeFile(config,JSON.stringify({phase:'human-offline-preview',consumer,allowed:[consumer,root],denied,report:join(root,'guard-report')}));
const child=spawnSync(process.execPath,[driver,product,workspace,memory,fixture],{stdio:'inherit',cwd:consumer,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:root,TERM:process.env.TERM??'xterm-256color',LANG:'en_US.UTF-8',NODE_NO_WARNINGS:'1',NODE_OPTIONS:'--import='+guard,WO35_GUARD_CONFIG:config}});
process.exitCode=child.status??1;
