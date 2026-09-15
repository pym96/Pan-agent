/** Human #49 trial: installed JavaScript, Faux-only, cleared environment and offline guard. */
import fs from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const scripts=dirname(fileURLToPath(import.meta.url)),product=process.argv[2]&&resolve(process.argv[2]);
if(!product||!fs.existsSync(join(product,'dist/index.js')))throw Error('Usage: node scripts/demo_authorization.mjs /absolute/installed/node_modules/pan-agent');
const root=fs.mkdtempSync('/private/tmp/wo49-human-'),workspace=join(root,'workspace');fs.mkdirSync(workspace);
if(spawnSync('/usr/bin/git',['init','-q',workspace]).status!==0)throw Error('fixture git init failed');
for(const [source,target] of [['fixtures/authorization-driver.mjs','driver.mjs'],['wo35-consumer-guard.mjs','base-guard.mjs'],['wo49-consumer-guard.mjs','guard.mjs']])fs.copyFileSync(join(scripts,source),join(root,target));
const consumer=dirname(dirname(product));fs.writeFileSync(join(root,'guard.json'),JSON.stringify({phase:'wo49-human',consumer,allowed:[consumer,root],denied:[dirname(scripts)],report:join(root,'guard-report')}));
console.log('Faux-only trial. Evidence:',root,'\nNo startup y. Tasks: ordinary, protected, deny, shell, trust, again, cancel, long.\nArrows choose; Enter confirms; default Deny. PgUp/PgDn/wheel inspect full details.\nSelect Allow once for protected/shell; Deny for deny; Trust shell for this session for trust.\nRun again, then :trust off and close the view, then shell (must ask again).\nFor cancel: type a draft while the task starts, then Ctrl-C at approval.\nTry 120x40 / 40x12, activity view, scrollbar and :exit. Retain seven Human answers.');
const child=spawnSync(process.execPath,[join(root,'driver.mjs'),product,workspace,join(root,'memory')],{cwd:consumer,stdio:'inherit',env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:root,TERM:process.env.TERM??'xterm-256color',LANG:'en_US.UTF-8',NODE_NO_WARNINGS:'1',NODE_OPTIONS:'--import='+join(root,'guard.mjs'),WO35_GUARD_CONFIG:join(root,'guard.json')}});
console.log('Retained Human evidence:',root);process.exitCode=child.status??1;
