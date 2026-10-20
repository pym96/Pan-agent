#!/usr/bin/env node
import {run,check} from './engine.mjs';
const help=`Offline trusted verification (Node >=22.19, POSIX only).
node scripts/verification/cli.mjs run --manifest FILE --manifest-sha256 HEX --candidate DIR --trusted DIR --verifier-sha256 HEX --out NEW_DIR
node scripts/verification/cli.mjs check --manifest FILE --manifest-sha256 HEX --candidate DIR --trusted DIR --verifier-sha256 HEX --receipt FILE --receipt-sha256 HEX --run-id UUID
node scripts/verification/cli.mjs demo --out NEW_DIR
Always invoke a reviewed external copy; candidate code cannot select its verifier.
Exit 0=machine PASS; 1=assertion FAIL; 2=NOT_EVALUABLE. Human gates remain pending.
`;
try{const [mode,...args]=process.argv.slice(2);if(mode==='--help'||!mode){console.log(help);}else{if(!['run','check','demo'].includes(mode))throw Error('unknown_mode');const options={};for(let i=0;i<args.length;i+=2){const key=args[i];if(!key?.startsWith('--')||!args[i+1]||key.slice(2)in options)throw Error('invalid_flags');options[key.slice(2)]=args[i+1];}let result;if(mode==='demo'){const {demo}=await import('./demo.mjs');result=await demo(options);}else{for(const key of ['manifest','manifest-sha256','candidate','trusted','verifier-sha256',...(mode==='run'?['out']:['receipt','receipt-sha256','run-id'])])if(!options[key])throw Error('missing_'+key);result=mode==='run'?await run(options):check(options);}console.log(JSON.stringify(result));process.exitCode=result.machineCheck==='PASS'?0:result.machineCheck==='FAIL'?1:2;}}
catch(error){console.log(JSON.stringify({machineCheck:'NOT_EVALUABLE',reason:error.message}));process.exitCode=2;}
