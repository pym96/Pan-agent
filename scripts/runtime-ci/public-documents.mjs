/** Installed product fixtures. --live-macos additionally uses the host's real network, with no model provider. */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {realpath, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [packagePath, mode] = process.argv.slice(2);
assert.ok(packagePath && (!mode || mode === '--live-macos'));
const installed = await realpath(packagePath);
await assert.rejects(stat(join(installed, 'src')), {code:'ENOENT'});
const load = file => import(pathToFileURL(join(installed, 'dist', file)).href);
const {discoverSystemProxy, parseSystemProxy} = await load('sandbox/native/system-proxy.js');
const {dnsAnswers, fetchPublicDocument, fetchRepositoryPart, UpstreamHttpError} = await load('sandbox/native/network.js');
const {createWebFetch} = await load('tools/web-fetch.js');
const {repositoryQuestion, licenseSourceHint} = await load('runtime/repository-overview.js');
const signal = () => AbortSignal.timeout(15000);
const source = 'https://raw.githubusercontent.com/cli/cli/HEAD/LICENSE';
const original = '帮我查一下 https://github.com/cli/cli 用的是什么许可证，并给出来源。';

for (const prompt of [original, '帮我查查许可证 https://github.com/cli/cli.git']) {
  assert.deepEqual(repositoryQuestion(prompt), {modelRead:true});
  assert.ok(licenseSourceHint(prompt).includes(source));
}
assert.deepEqual(repositoryQuestion('/repo https://github.com/cli/cli.git'), {slug:'cli/cli'});
const observed = [];
const fixtureBytes = Buffer.from('Fixture License v12.8\nUse under the terms printed by this test.');
const fixture = createWebFetch({mode: () => 'native-macos-public', githubProxy:false,
  repository: async (slug, part) => { observed.push([slug,part]); throw new UpstreamHttpError(403,true); },
  document: async url => {observed.push(url.href); return {body:fixtureBytes, finalUrl:url.href, transport:'fixture'};}});
const call = (tool, url) => tool.execute({arguments:{url}, toolCallId:'source', signal:signal()});
const api = 'https://api.github.com/repos/other/repository';
const fallback = await call(fixture, api+'/license');
const contents = JSON.parse(fallback.content[0].text);
assert.equal(contents.untrustedDocument, fixtureBytes.toString());
assert.equal(contents.source, 'https://raw.githubusercontent.com/other/repository/HEAD/LICENSE');
assert.match(contents.notice,/403.*rate limited/);
assert.deepEqual(observed, [['other/repository','license'],contents.source]);
for (const [url, part] of [[api, 'metadata'],[api+'/readme','readme'],['https://github.com/other/repository.git','metadata']]) {
  observed.length = 0;
  const result = await call(fixture, url);
  assert.ok(result.isError);
  assert.match(result.content[0].text,/403/);
  assert.deepEqual(observed, [['other/repository',part]]);
}

const settings = (port, extra = '') => '<dictionary> {\n  HTTPSEnable : 1\n  HTTPSProxy : 127.0.0.1\n  HTTPSPort : '+port+
  '\n  ExceptionsList : <array> {\n    0 : *.bypass.example.com,*.local,10.0.0.0/8\n  }\n'+extra+'}';
assert.equal(parseSystemProxy('<dictionary> {\n  HTTPSEnable : 0\n}').endpoint,undefined);
for (const raw of [settings(7890,'  ProxyAutoConfigEnable : 1\n'), settings(7890).replace('127.0.0.1','203.0.113.3'), settings(65536)])
  assert.ok(parseSystemProxy(raw).limitation);
assert.ok(parseSystemProxy(settings(7890)).bypass('node.bypass.example.com.'));
if (process.platform === 'linux') assert.equal((await discoverSystemProxy()).endpoint,undefined);

const proxy = createServer();
const connections = [];
proxy.on('connection', socket => socket.on('error', error => { if (error.code !== 'ECONNRESET') throw error; }));
proxy.on('connect',(req,socket) => {
  connections.push(req.url);
  assert.equal(req.headers.authorization, undefined);
  assert.equal(req.headers['proxy-authorization'], undefined);
  socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
});
proxy.listen(0,'127.0.0.1');
await once(proxy,'listening');
try {
  const system = parseSystemProxy(settings(proxy.address().port));
  for (const [name, ips] of [
    ['127.0.0.1',[]], ['198.18.0.1',[]], ['169.254.2.1',[]],['machine.local',[]],
    ['doc.example.com',['198.18.0.2','10.0.0.1']], ['doc.example.com',['198.18.0.2','1.1.1.1']],
    ['doc.example.com',['192.168.1.1']], ['doc.bypass.example.com',['198.18.0.5']],
    ['raw.githubusercontent.com',['127.0.0.1']],
  ]) {
    await assert.rejects(fetchPublicDocument(new URL('https://'+name+'/a/b/HEAD/LICENSE'),signal(),async()=>ips,{system}),/denied/);
  }
  assert.deepEqual(connections,[]);
  await assert.rejects(fetchPublicDocument(new URL('https://example.com/guide'),signal(),async()=>['1.1.1.1'],{system}),/local proxy/);
  assert.deepEqual(connections,['1.1.1.1:443']);
  await assert.rejects(fetchPublicDocument(new URL(source),signal(),async()=>['198.18.0.5'],{system}),/local proxy/);
  assert.deepEqual(connections.slice(-1),['raw.githubusercontent.com:443']);
  await assert.rejects(fetchPublicDocument(new URL('https://example.com/guide'),signal(),async()=>['198.18.0.2'],{system}),/local proxy/);
  assert.ok(connections.slice(2).length >= 1 && connections.slice(2).every(target => target === '8.8.8.8:443'));
} finally { await new Promise(resolve => proxy.close(resolve)); }

const name = 'public.example.com';
const answer = (data, overrides = {}) => Buffer.from(JSON.stringify({
  Question:[{name:name+'.',type:1}], Answer:data, Status:0,TC:false,...overrides,
}));
const ip = data => ({name,type:1,data});
assert.deepEqual(dnsAnswers(answer([ip('1.1.1.1')]),name,1),['1.1.1.1']);
assert.deepEqual(dnsAnswers(answer([]),name,1),[]);
for (const body of [answer([ip('1.1.1.1'),ip('10.0.0.1')]), answer([ip('1.1.1.1')],{Status:2}),
  answer([ip('1.1.1.1')],{TC:true}), answer([ip('1.1.1.1')],{Question:[{name:'other.example.com',type:1}]}),
  answer([{...ip('1.1.1.1'),name:'unrelated.example.com'}]),answer([{name,type:5,data:'a.local.'}])])
  assert.throws(()=>dnsAnswers(body,name,1),/DNS/);
console.log(JSON.stringify({fixture:'installed offline', platform:process.platform, fallback:contents.source, checkedConnect:connections}));

if (mode === '--live-macos') {
  assert.equal(process.platform,'darwin');
  const system = await discoverSystemProxy();
  assert.ok(system.endpoint && !system.limitation);
  const live = createWebFetch({mode:()=>'native-macos-public', githubProxy:true,
    document:(url, s)=>fetchPublicDocument(url,s,undefined,{system}),
    repository:(slug,part,s)=>fetchRepositoryPart(slug,part,s,system)});
  for (const [url,expected] of [[source,/^MIT License/], ['https://example.com/', /Example Domain/i],
    ['https://api.github.com/repos/cli/cli/license',/MIT License/]]) {
    const result = await call(live,url);
    assert.ok(!result.isError,result.content[0].text);
    const record = JSON.parse(result.content[0].text);
    assert.match(record.untrustedDocument,expected);
    assert.equal(record.truncated,false);
    console.log(JSON.stringify({source:record.source, upstream:record.notice, transport:result.details.transport,
      bytes:Buffer.byteLength(record.untrustedDocument), sha256:createHash('sha256').update(record.untrustedDocument).digest('hex')}));
  }
}
