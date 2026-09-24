import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectTasks} from './selection.mjs';
import {summary} from './report.mjs';
const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url)));
test('WO91 selection preserves signed order and frozen task objects without manifest mutation',()=>{
 const before=JSON.stringify(manifest),ids=['break-filter-js-from-html','dna-insert'];
 const chosen=selectTasks(manifest,ids,Object.fromEntries(ids.map(id=>[id,'sha256:'+'a'.repeat(64)])));
 assert.deepEqual(chosen.tasks.map(t=>t.id),ids);assert.equal(JSON.stringify(manifest),before);assert(chosen.tasks.every(t=>manifest.tasks.includes(t)));
});
test('WO91 report retains not-started, unknown and raw scores for single and full selection',()=>{
 for(const tasks of [[manifest.tasks[4]],manifest.tasks]){
  const selected={...manifest,tasks},id=tasks[0].id;
  const initial=summary(selected);assert.equal(initial.denominator,tasks.length);assert.equal(initial.rows.length,tasks.length);assert(initial.rows.every(r=>r.state==='not_started'&&r.reward===null&&r.usage===null));
  const failed=summary(selected,[{task:id,stopReason:'protocol',verifier:null}]);assert.equal(failed.rows[0].reward,null);assert.equal(failed.rows[0].usage,null);
  const raw=summary(selected,[{task:id,verifier:{status:'official_scored',rewards:{reward:0}}}]);assert.deepEqual(raw.rows[0].reward,{reward:0});assert.match(raw.rawRewardCaveat,/does not establish/);
  assert.equal(raw.rows.length,tasks.length);assert.deepEqual(raw.taskIds,tasks.map(t=>t.id));
 }
});
