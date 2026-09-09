import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {runConnector} from '../src/connector.ts';
import {read,load} from '../src/storage.ts';
const config=process.argv[2],m=read(config),state=join(m.workspace,'state');
await runConnector(m,false,{clock:{wall(){if(existsSync(join(state,'ledger.json'))){const a=load(state).attempts.at(-1);if(a?.role==='regulator' && a.pid)process.exit(94);}return Date.now();},mono:()=>performance.now()}});
