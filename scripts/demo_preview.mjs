/** #51 Human offline preview launcher: requires an installed package and the existing network/credential guard. */
import {mkdtemp,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [packagePath,recordsRoot,forbiddenSource]=process.argv.slice(2);
if(!packagePath||!recordsRoot)throw Error('usage: demo_preview.mjs INSTALLED_PACKAGE RECORDS_ROOT [FORBIDDEN_SOURCE]');
const product=resolve(packagePath),consumer=resolve(product,'../..'),source=dirname(fileURLToPath(import.meta.url));
const root=await mkdtemp(join(resolve(recordsRoot),'preview-')),workspace=join(root,'workspace'),memory=join(root,'memory');
await mkdir(workspace);
const guard=join(root,'guard.mjs'),driver=join(root,'driver.mjs'),fixture=join(root,'fixture.json');
await copyFile(join(source,'wo35-consumer-guard.mjs'),guard);
await copyFile(join(source,'fixtures/preview/interactive-driver.mjs'),driver);
await copyFile(join(source,'fixtures/preview-first-task-v1.json'),fixture);
const config=join(root,'guard.json');
await writeFile(config,JSON.stringify({phase:'human-offline-preview',consumer,allowed:[consumer,root],denied:forbiddenSource?[resolve(forbiddenSource)]:[],report:join(root,'guard-report')}));
const child=spawnSync(process.execPath,[driver,product,workspace,memory,fixture],{stdio:'inherit',cwd:consumer,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:root,TERM:process.env.TERM??'xterm-256color',LANG:'en_US.UTF-8',NODE_NO_WARNINGS:'1',NODE_OPTIONS:'--import='+guard,WO35_GUARD_CONFIG:config}});
process.exitCode=child.status??1;
