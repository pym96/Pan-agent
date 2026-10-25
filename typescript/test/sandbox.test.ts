import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initTar,parseWorkspaceTar} from '../src/sandbox/archive.ts';
test('sandbox initialization archive is fixed and export rejects anything outside task',()=>{
 const tar=initTar(); assert.equal(tar.length%512,0);
 assert.deepEqual(parseWorkspaceTar(tar),[]);
 const bad=Buffer.from(tar);bad.write('../escape',0);assert.throws(()=>parseWorkspaceTar(bad));
});
import {assertSandboxFreeSpace} from '../src/sandbox/docker.ts';
import {panToolDefinitions} from '../src/tools/pan-trusted-local-tools.ts';
import {SandboxSession} from '../src/sandbox/session.ts';
function tarEntry(name:string,type='0',bytes=Buffer.from('ok')){
 const h=Buffer.from(initTar().subarray(0,512));h.fill(0,0,100);h.write(name);h.write(type,156);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.fill(32,148,156);h.write(h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return Buffer.concat([h,bytes,Buffer.alloc((512-bytes.length%512)%512),Buffer.alloc(1024)]);
}
test('export accepts bytes and rejects every link/special type and traversal before writes',()=>{
 assert.equal(parseWorkspaceTar(tarEntry('task/nested/file'))[0]?.bytes.toString(),'ok');
 for(const type of ['1','2','3','4','6','x','g','L','K'])assert.throws(()=>parseWorkspaceTar(tarEntry('task/name',type)),/unsafe_type/);
 for(const path of ['/absolute','task/../escape','task/a/../../escape','task/./a','task//a','task/back\\slash','task/line\nfeed'])assert.throws(()=>parseWorkspaceTar(tarEntry(path)));
 assert.throws(()=>parseWorkspaceTar(tarEntry('task/file').subarray(0,513)),/truncated|missing_end/);
});
test('free space threshold is inclusive and schema reuse never resolves a host workspace',()=>{
 assertSandboxFreeSpace(20*1024**3);assert.throws(()=>assertSandboxFreeSpace(20*1024**3-1));assert.throws(()=>assertSandboxFreeSpace(NaN));
 assert.deepEqual(panToolDefinitions().map(t=>t.name).sort(),['bash','edit','read','write']);
 assert.ok(panToolDefinitions().every(t=>!('execute' in t)));
 assert.deepEqual(new SandboxSession({stateRoot:'/not-created-by-construction'}).tools.map(t=>t.name).sort(),['bash','edit','read','write']);
});
