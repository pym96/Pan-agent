import {check} from './policy.mjs';
/** Selection is part of the signed binding, never an independent CLI override.
 * Validate shape before admission; authorize still verifies the entire binding. */
export function selectTasks(manifest,taskIds,images){
 check(Array.isArray(taskIds)&&taskIds.length>0,'task_selection_empty');
 check(new Set(taskIds).size===taskIds.length,'task_selection_duplicate');
 const tasks=taskIds.map(id=>{const task=manifest.tasks.find(t=>t.id===id);check(typeof id==='string'&&task,'task_selection_unknown');return task;});
 check(images&&typeof images==='object'&&!Array.isArray(images)&&Object.keys(images).length===taskIds.length&&taskIds.every(id=>Object.hasOwn(images,id)&&/^sha256:[0-9a-f]{64}$/.test(images[id])),'image_selection_mismatch');
 return {...manifest,denominator:tasks.length,tasks};
}
