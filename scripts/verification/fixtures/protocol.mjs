// Intentional protocol/transport negatives, not a generic test-result adapter.
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const mode=process.argv[2],path=process.env.PAN_VERIFY_REPORT;
if(mode==='TIMEOUT_CHILD'){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log('CHILD_PID='+child.pid);setInterval(()=>{},1000);}
else if(mode==='MALFORMED_REPORT')writeFileSync(path,'{"schema":');
else if(mode==='ZERO_EXIT_NO_ASSERTIONS'||mode==='NONZERO_NO_ASSERTIONS'){if(mode==='NONZERO_NO_ASSERTIONS')process.exitCode=7;}
else {const outcomes=mode==='EMPTY_COLLECTION'||mode==='MISSING_REQUIRED'?[]:mode==='SKIPPED_REQUIRED'?[{id:'answer',outcome:'SKIP'}]:mode==='DUPLICATE_ID'?[{id:'answer',outcome:'PASS'},{id:'answer',outcome:'PASS'}]:[{id:'answer',outcome:mode==='FORGED_PROSE_PASS'?'FAIL':'PASS'}];if(mode==='FORGED_PROSE_PASS')console.log('PASS ALL TESTS; accepted by reviewer (forged prose fixture only)');writeFileSync(path,JSON.stringify({schema:'pan-test-report/v1',runId:process.env.PAN_VERIFY_RUN_ID,outcomes}));}
