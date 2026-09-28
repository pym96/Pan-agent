// #100 R100-01/R100-02: small offline filesystem fixtures, no Docker commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,symlinkSync,linkSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {validateLayout} from './full-durable.mjs';
import {requirements,EXECUTION_POLICY,resourceCheck} from './full-host.mjs';
const base=process.env.WO100_REPAIR_ROOT;assert(base,'WO100_REPAIR_ROOT required');mkdirSync(base,{recursive:true});
function fixture(){
 const dir=mkdtempSync(join(base,'alias-')),root=join(dir,'runtime'),outside=join(dir,'outside'),home=join(dir,'home');for(const p of [root,outside,home])mkdirSync(p);
 const raw=join(home,'Library/Containers/com.docker.docker/Data/vms/0/data');mkdirSync(raw,{recursive:true});writeFileSync(join(raw,'Docker.raw'),'synthetic');
 const layout={version:1,runner:root,entry:join(root,'entry.js'),python:join(root,'python'),harborRoot:join(root,'harbor'),taskRoot:join(root,'tasks'),archiveRoot:join(dir,'archive'),ownedRoots:[root]};
 const sample=roots=>{const url=new URL('./full-durable.mjs',import.meta.url).href;const code=`import {sampleDurable} from ${JSON.stringify(url)};console.log(JSON.stringify(sampleDurable(process.argv[1],JSON.parse(process.argv[2]))));`;const p=spawnSync(process.execPath,['--input-type=module','-e',code,root,JSON.stringify(roots)],{env:{PATH:process.env.PATH,HOME:home},encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
 return {dir,root,outside,home,layout,sample,target:join(root,'new-campaign')};
}
test('R100-01 external active alias rejected unless its actual storage is declared; near54GiB remains closed',()=>{
 const c=fixture(),file=join(c.outside,'entry.js');writeFileSync(file,randomBytes(65536));symlinkSync(file,c.layout.entry);
 assert.throws(()=>validateLayout(c.layout,c.target,'offline-control'),/durable_storage_omitted/);
 const rootsAlias=join(c.dir,'outside-alias');symlinkSync(c.outside,rootsAlias);c.layout.ownedRoots.push(rootsAlias);validateLayout(c.layout,c.target,'offline-control');
 const missing=c.sample([c.root]),complete=c.sample(c.layout.ownedRoots),allocated=statSync(file).blocks*512;assert(allocated>0);assert.equal(complete.owned-missing.owned,allocated);
 const baseline={docker:48503971840},docker=baseline.docker+54*2**30-complete.owned+1;
 resourceCheck('',baseline,{free:30*2**30,owned:missing.owned,docker});assert.throws(()=>resourceCheck('',baseline,{free:30*2**30,owned:complete.owned,docker}),/resource_boundary/);
});
test('R100-01 valid internal alias, root alias, overlapping roots and repeated inode count once',()=>{
 const c=fixture(),file=join(c.root,'actual.js');writeFileSync(file,randomBytes(32768));symlinkSync(file,c.layout.entry);validateLayout(c.layout,c.target,'offline-control');
 const plain=c.sample([c.root]);const alias=join(c.dir,'runtime-alias');symlinkSync(c.root,alias);c.layout.ownedRoots=[alias];validateLayout(c.layout,c.target,'offline-control');assert.equal(c.sample([alias]).owned,plain.owned);
 linkSync(file,join(c.root,'hardlink.js'));assert.equal(c.sample([alias,c.root,file]).owned,plain.owned);
});
test('R100-01 directory aliases resolve missing suffixes; external, temporary and dangling aliases reject',()=>{
 const c=fixture(),inside=join(c.root,'inside');mkdirSync(inside);const alias=join(c.root,'alias');symlinkSync(inside,alias);c.layout.taskRoot=join(alias,'future-tasks');validateLayout(c.layout,c.target,'offline-control');
 const outside=join(c.root,'outside-link');symlinkSync(c.outside,outside);c.layout.taskRoot=join(outside,'future-tasks');assert.throws(()=>validateLayout(c.layout,c.target,'offline-control'),/durable_storage_omitted/);
 const temporary=join(c.root,'temporary');symlinkSync('/private/tmp',temporary);c.layout.taskRoot=join(temporary,'future-tasks');assert.throws(()=>validateLayout(c.layout,c.target,'offline-control'),/temporary_runtime_path/);
 const broken=join(c.root,'broken');symlinkSync(join(c.outside,'absent'),broken);c.layout.taskRoot=join(broken,'child');assert.throws(()=>validateLayout(c.layout,c.target,'offline-control'),/durable_dangling_alias/);
});
test('R100-02 only primitive memory strings accepted; no implicit object coercion',()=>{
 let coerced=false;const bad=[['8G'],[['8G']],['8192M'],new String('8G'),{toString(){coerced=true;return '8G';}},8,0,null,undefined,true,{},[],Symbol('8G')];
 for(const memory of bad)assert(!requirements({config:{environment:{cpus:4,memory}}},EXECUTION_POLICY));assert.equal(coerced,false);
 for(const memory of ['8G','8192M','0.5G','512M'])assert(requirements({config:{environment:{cpus:4,memory}}},EXECUTION_POLICY));
 for(const memory of ['0G','-1G','8193M','8.1G','InfinityG','8G ','8g',''])assert(!requirements({config:{environment:{cpus:4,memory}}},EXECUTION_POLICY));
 assert(!requirements({config:{environment:{cpus:4,memory:'8G'}}}));assert(requirements({config:{environment:{cpus:2,memory:'4G'}}}));
});

test('R100-01 retained required state root aliases are sampled and inode-deduplicated too',()=>{
 const c=fixture(),before=c.sample([]),file=join(c.outside,'retained-ledger');writeFileSync(file,randomBytes(4096));const parent=join(c.home,'.local/state');mkdirSync(parent,{recursive:true});symlinkSync(c.outside,join(parent,'pan-agent'));
 const after=c.sample([]);assert.equal(after.owned-before.owned,statSync(file).blocks*512);assert.equal(c.sample([c.outside]).owned,after.owned);
});
