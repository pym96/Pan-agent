// Explicit fresh demo configuration. No new scheduler, signature format or task loop.
import {existsSync,lstatSync,readFileSync,statSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute,basename} from 'node:path';
import {check,canonical,digest} from './policy.mjs';
import {EXECUTION_POLICY,DISK_POLICY} from './full-host.mjs';
import {validateLayout,sampleDurable,verifyArchivedTasks} from './full-durable.mjs';
export const DEMO_BASELINE=48503971840;
const within=(p,r)=>p===r||p.startsWith(r+'/');
// Existing components must be real directories/files, never aliases into old state.
// Normalize dot segments once; persisted identities must equal normalization on reread.
function path(p){
 check(typeof p==='string'&&isAbsolute(p),'demo_absolute_path');
 const absolute=resolve(p);let q=absolute;
 while(true){try{check(!lstatSync(q).isSymbolicLink(),'demo_symlink');}catch(e){if(e.code!=='ENOENT')throw e;}if(q===dirname(q))break;q=dirname(q);}
 return absolute;
}
export function demoRequiredRoots(home){return [
 join(home,'.local/state/pan-agent'),
 '/opt/homebrew/Cellar/python@3.12/3.12.9',
 join(home,'Desktop/todo/面试/career-planning/60-项目/pan-agent/typescript/node_modules')
];}
const keys=(o,expected)=>check(o&&typeof o==='object'&&!Array.isArray(o)&&canonical(Object.keys(o).sort())===canonical(expected.sort()),'demo_config_fields');
export function normalizeDemo(raw,root,host){
 keys(raw,['version','campaignRoot','authorityPath','authorityHash','ledgerRoot','outputRoot','mediaRoot','layout','baselineDocker','resourcePolicy','taskIds']);
 check(raw.version===1&&raw.baselineDocker===DEMO_BASELINE&&canonical(raw.resourcePolicy)===canonical(DISK_POLICY),'demo_resource_policy');
 check(Array.isArray(raw.taskIds)&&raw.taskIds.length===1&&raw.taskIds[0]==='log-summary-date-ranges','demo_task_selection');
 check(typeof raw.authorityHash==='string'&&/^[a-f0-9]{64}$/.test(raw.authorityHash),'demo_authority_hash');
 keys(raw.layout,['version','runner','entry','python','harborRoot','taskRoot','archiveRoot','ownedRoots']);
 check(Array.isArray(raw.layout.ownedRoots),'demo_owned_roots');
 const c={...raw,campaignRoot:path(raw.campaignRoot),authorityPath:path(raw.authorityPath),ledgerRoot:path(raw.ledgerRoot),outputRoot:path(raw.outputRoot),mediaRoot:path(raw.mediaRoot),layout:{...raw.layout}};
 for(const k of ['runner','entry','python','harborRoot','taskRoot']){
  check(typeof raw.layout[k]==='string'&&isAbsolute(raw.layout[k]),'demo_absolute_path');
  // Frozen read-only runtimes may use venv interpreter symlinks. Preserve argv
  // semantics; validateLayout resolves storage and verifyProduct pins bytes/imports.
  c.layout[k]=resolve(raw.layout[k]);
 }
 c.layout.archiveRoot=path(raw.layout.archiveRoot);
 c.layout.ownedRoots=[...new Set(raw.layout.ownedRoots.map(path))].sort();
 check(c.campaignRoot===path(root),'demo_campaign_path');
 const owner=dirname(c.campaignRoot);
 // A namespace per campaign makes cross-campaign ledger/authority/output sharing invalid.
 check(basename(c.campaignRoot)==='campaign'&&c.authorityPath===join(owner,'authority.json')&&c.ledgerRoot===join(owner,'ledger')&&c.outputRoot===join(c.campaignRoot,'segments'),'demo_namespace');
 check(!within(c.mediaRoot,owner)&&!within(owner,c.mediaRoot),'demo_media_overlap');
 check(c.layout.archiveRoot===join(c.mediaRoot,'task-archives',digest(c.campaignRoot)),'demo_archive_namespace');
 const oldState=join(host.home,'.local/state/pan-agent');
 // A fixed-depth namespace makes owners siblings regardless of creation order.
 // A descendant prefix alone permits B inside A's campaign/segments or ledger.
 // Apply the same rule to offline fixtures and live reopening, before any writes.
 check(dirname(owner)===join(oldState,'wo58-video-20261009','campaigns'),'demo_owner_depth');
 const forbidden=[join(oldState,'wo75'),join(oldState,'benchmark97-next'),join(oldState,'wo97'),join(oldState,'wo97-image-prep'),'/Volumes/WD_BLACK/pan-agent/wo97-full-live-20260925'];
 for(const p of [owner,c.mediaRoot])check(!forbidden.some(f=>within(p,f)||within(f,p)),'demo_old_state_overlap');
 if(host.mode==='live'){
  check(c.mediaRoot==='/Volumes/WD_BLACK/pan-agent/wo58-video-20261009','demo_media_root');
 }
 // Persistent historical roots must be explicit, even when absent on this machine.
 // Temporary historical roots are always added by sampleDurable, never caller-removable.
 for(const required of [...demoRequiredRoots(host.home),c.mediaRoot])check(c.layout.ownedRoots.includes(path(required)),'demo_required_root_missing');
 check(c.layout.ownedRoots.some(r=>within(owner,r)),'demo_new_root_missing');
 validateLayout(c.layout,c.campaignRoot,host.mode);
 if(host.mode==='live'){
  check(statSync(c.mediaRoot).dev!==statSync(dirname(c.campaignRoot)).dev,'demo_archive_device');
  if(existsSync(c.layout.archiveRoot))check(statSync(c.layout.archiveRoot).dev===statSync(c.mediaRoot).dev,'demo_archive_device');
 }
 return c;
}
export function validateDemo(store,host,supplied){
 if(!store.meta.demo58){check(!supplied&&store.meta.schema!==3,'demo_config_required');return;}
 const c=normalizeDemo(store.meta.demo58,store.root,host);
 check(canonical(c)===canonical(store.meta.demo58),'demo_config_changed');
 if(supplied)check(canonical(normalizeDemo(supplied,store.root,host))===canonical(c),'demo_config_conflict');
 check(store.meta.schema===3&&!store.meta.history&&!store.meta.recovery&&!store.meta.upgrade102&&!store.meta.successor104,'demo_no_import');
 check(canonical(store.meta.durability)===canonical(c.layout)&&canonical(store.meta.resourceBaseline)===canonical({docker:DEMO_BASELINE}),'demo_meta_identity');
 check(canonical(store.meta.identity.demo58)===canonical(c)&&canonical(store.meta.identity.executionPolicy)===canonical(EXECUTION_POLICY),'demo_signed_config');
 check(digest(readFileSync(c.authorityPath))===c.authorityHash,'demo_authority_changed');
 verifyArchivedTasks(store);
 return c;
}
export function demoAuthority(config){check(digest(readFileSync(config.authorityPath))===config.authorityHash,'demo_authority_changed');return JSON.parse(readFileSync(config.authorityPath));}
export function demoSample(root,config,host){return (host.sampleRecovery??sampleDurable)(root,config.layout.ownedRoots);}
export function demoSelection(store,ids){if(store.meta.demo58)check(canonical(ids)===canonical(store.meta.demo58.taskIds),'demo_task_selection');}
