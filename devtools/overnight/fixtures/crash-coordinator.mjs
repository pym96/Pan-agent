// Test-only real coordinator crash: preserves the real owner lock and durable intent.
import { readFileSync } from 'node:fs';
import { run } from '../src/coordinator.ts';
const [config,state,point]=process.argv.slice(2);
await run(JSON.parse(readFileSync(config,'utf8')),state,false,{crash:p=>{if(p===point)process.exit(91);}});
