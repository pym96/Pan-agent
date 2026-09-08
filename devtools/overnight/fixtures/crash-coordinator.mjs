// Test-only real coordinator crash: preserves the real owner lock and durable intent.
import { readFileSync, existsSync } from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {load} from '../src/storage.ts';
import { run } from '../src/coordinator.ts';
const [config,state,point]=process.argv.slice(2);
await run(JSON.parse(readFileSync(config,'utf8')),state,false,{clock:{wall(){if(existsSync(join(state,'ledger.json')) && ((point==='recorded-review' && load(state).state==='review_recorded') || (point==='recorded-builder' && load(state).state==='handoff_recorded')))process.exit(93);return Date.now();},mono:()=>performance.now()},crash:p=>{if(p===point)process.exit(91);}});
