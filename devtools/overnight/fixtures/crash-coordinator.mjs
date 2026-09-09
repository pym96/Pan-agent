// Test-only real coordinator crash: preserves the real owner lock and durable intent.
import { readFileSync, existsSync } from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {load,atomic} from '../src/storage.ts';
import {OfflineProcess} from '../src/process.ts';
import { run } from '../src/coordinator.ts';
const [config,state,point]=process.argv.slice(2);
if(point==='live-review') {
  class BlockedReview extends OfflineProcess {
    launch(m,a,dir){if(a.role==='regulator')atomic(join(m.workspace,'scenario.json'),{kind:'blocked'});super.launch(m,a,dir);}
  }
  await run(JSON.parse(readFileSync(config,'utf8')),state,false,{process:new BlockedReview(),clock:{wall(){if(existsSync(join(state,'ledger.json'))){const a=load(state).attempts.at(-1);if(a?.role==='regulator' && a.pid)process.exit(94);}return Date.now();},mono:()=>performance.now()}});
  process.exit(1);
}
await run(JSON.parse(readFileSync(config,'utf8')),state,false,{clock:{wall(){if(existsSync(join(state,'ledger.json')) && ((point==='recorded-review' && load(state).state==='review_recorded') || (point==='recorded-builder' && load(state).state==='handoff_recorded')))process.exit(93);return Date.now();},mono:()=>performance.now()},crash:p=>{if(p===point)process.exit(91);}});
