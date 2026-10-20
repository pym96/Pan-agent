import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const outcomes=[];
test('answer is independently specified as 42',()=>{try{assert.equal(JSON.parse(readFileSync(join(process.env.PAN_VERIFY_CANDIDATE,'answer.json'),'utf8')).answer,42);outcomes.push({id:'answer',outcome:'PASS'});}catch(error){outcomes.push({id:'answer',outcome:'FAIL'});throw error;}});
after(()=>writeFileSync(process.env.PAN_VERIFY_REPORT,JSON.stringify({schema:'pan-test-report/v1',runId:process.env.PAN_VERIFY_RUN_ID,outcomes})));
