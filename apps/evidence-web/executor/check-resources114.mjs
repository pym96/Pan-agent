import assert from 'node:assert/strict';
import {allocatedRoots,checkSample} from './resources.mjs';
import {mkdtempSync,writeFileSync,linkSync,symlinkSync,statSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=mkdtempSync(join(process.env.EVIDENCE_DIR||tmpdir(),'resource-test-'));mkdirSync(join(root,'a'));writeFileSync(join(root,'a/file'),'allocated');linkSync(join(root,'a/file'),join(root,'hard'));symlinkSync(join(root,'a'),join(root,'alias'));assert.equal(allocatedRoots([root,join(root,'a'),join(root,'alias')]),statSync(join(root,'a/file')).blocks*512);
checkSample({free:21474836480,owned:57982058495,docker:48503971840});for(const s of [{free:21474836479,owned:0,docker:0},{free:21474836480,owned:57982058496,docker:48503971840},{free:21474836480,owned:0,docker:null}])assert.throws(()=>checkSample(s));console.log('PASS allocation deduplication, aliases, unchanged strict budget and free boundary');
