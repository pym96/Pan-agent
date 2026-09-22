import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {verifyLocalImage} from './identity.mjs';
test('cached actual inspect agrees; wrong digest and platform are rejected without startup',()=>{
 const rows=JSON.parse(readFileSync('/private/tmp/wo76-work/images.json'));
 for(const row of rows){const info=JSON.parse(readFileSync(row.inspect_log))[0];verifyLocalImage(row,info);assert.throws(()=>verifyLocalImage({...row,local_image_id:'sha256:'+'0'.repeat(64)},info));assert.throws(()=>verifyLocalImage({...row,architecture:'arm64',platform:'linux/arm64'},info));assert.throws(()=>verifyLocalImage({...row,platform_digest:'sha256:'+'0'.repeat(64)},info));}
});
import {authorize} from '../policy.mjs';
test('live draft is rejected by unchanged authorization gate before any runtime',()=>{
 const draft=JSON.parse(readFileSync(new URL('./live-draft.json',import.meta.url)));assert.equal(draft.authorized,false);assert.equal(draft.signature,null);assert.equal(draft.humanAuthorizationId,null);assert.equal(draft.runId,null);assert.throws(()=>authorize(draft,{},{}),/not_authorized/);
});
