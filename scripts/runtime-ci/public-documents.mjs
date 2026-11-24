/** Installed product fixtures. Optional live modes use the host network without a model provider. */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
import {createServer} from 'node:http';
import {realpath, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [packagePath, mode] = process.argv.slice(2);
assert.ok(packagePath && (!mode || ['--live-macos','--live-queries'].includes(mode)));
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
  document: async url => {observed.push(url.href); return {text:fixtureBytes.toString(), finalUrl:url.href, transport:'fixture'};}});
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

// The fixture substitutes the TCP peer only in this process. Real HTTP parsing,
// redirect handling, stream decoding and the installed tool all run unchanged.
const profile = 'https://github.com/pym96?tab=overview&from=2026-11-01&to=2026-11-23';
const ordinary = 'http://documents.example.com';
const queries = ['?z=1&Z=&z=two+words&%61=%2f%2F&opaque&=value&&',
  '?api_key=fixture-only&ref=https://github.com&cursor=last?', '?', '?参数=值'];
const profiles = ['https://github.com/pym96?tab=repositories', 'https://api.github.com/users/pym96/repos?per_page=100'];
for (const url of [...profiles, profile, api+'?v=1', api+'/readme?ref=dev', api+'/license?ref=dev',
  'https://github.com/other/repository?', 'https://github.com?tab=dashboard']) {
  assert.deepEqual(repositoryQuestion('Summarize '+url), {modelRead:true});
  assert.equal(licenseSourceHint('Which license '+url), '');
  assert.ok(fixture.validate({url}).ok);
  observed.length = 0;
  const reply = await call(fixture,url);
  const href = new URL(url).href;
  assert.deepEqual(observed,[href]);
  assert.equal(JSON.parse(reply.content[0].text).source,href);
}
assert.ok(repositoryQuestion('/repo https://github.com/other/repository?ref=dev').problem);
const requests = [];
const largeText = 'a'.repeat(11999) + '🌍' + '汉字🌏'.repeat(16000) + ' END';
const page = '<html><head><script>' + 'ignored'.repeat(22000) + '</script></head>' +
  '<body><main><h1>Activity &amp; contributions</h1><p>Real page body</p></main></body></html>';
const site = createServer((req, res) => {
  requests.push(req.url);
  assert.equal(req.headers['user-agent'], 'pan-agent-web-fetch');
  if (req.url.startsWith('/echo?')) {
    res.writeHead(200, {'Content-Type':'text/plain'}).end(req.url);
    return;
  }
  if (req.url === '/move?old=1') {
    res.writeHead(302, {Location:'/echo'+queries[0]}).end();
    return;
  }
  if (req.url === '/move') { res.writeHead(302, {Location: '/page'}).end(); return; }
  if (req.url === '/partial') { res.writeHead(206, {'Content-Type':'text/plain'}).end('partial'); return; }
  if (req.url === '/denied') { res.writeHead(403).end(); return; }
  if (req.url === '/timeout') return;
  if (req.url === '/broken') { req.socket.destroy(); return; }
  if (req.url === '/private') { res.writeHead(302, {Location:'http://127.0.0.1/'}).end(); return; }
  res.writeHead(200, {'Content-Type':req.url === '/page' ? 'text/html' : 'text/plain'});
  const bytes = Buffer.from(req.url === '/page' ? page : largeText);
  res.write(bytes.subarray(0, 12000)); // split the four-byte character
  setImmediate(() => res.end(bytes.subarray(12000)));
});
site.listen(0, '127.0.0.1');
await once(site, 'listening');
const connect = net.connect;
net.connect = options => {
  assert.equal(options.host, '1.1.1.1');
  assert.equal(options.port, 80);
  const socket = connect({...options, host:'127.0.0.1', port:site.address().port});
  Object.defineProperty(socket, 'remoteAddress', {value:'1.1.1.1'});
  return socket;
};
syncBuiltinESMExports();
try {
  const platformMode = process.platform === 'darwin' ? 'native-macos-public' : 'native-linux-public';
  const tool = createWebFetch({mode:() => platformMode, githubProxy:false, repository:async () => assert.fail(),
    document:(url, signal, offset) => fetchPublicDocument(url, signal, async () => ['1.1.1.1'], {offset})});
  async function window(url, offset) {
    const args = offset === undefined ? {url} : {url, offset};
    assert.ok(tool.validate(args).ok);
    const result = await tool.execute({arguments:args, signal:signal(), toolCallId:'page'});
    assert.ok(!result.isError, result.content[0].text);
    return JSON.parse(result.content[0].text);
  }
  const html = await window(ordinary+'/move');
  assert.equal(html.source, ordinary+'/page');
  assert.match(html.untrustedDocument, /Activity & contributions/);
  assert.match(html.untrustedDocument, /Real page body/);
  assert.doesNotMatch(html.untrustedDocument, /ignored|<script>/);
  assert.equal(html.truncated, false);
  for (const query of queries) {
    const target = '/echo'+query;
    const href = new URL(ordinary+target).href;
    const record = await window(ordinary+target);
    assert.equal(record.untrustedDocument,href.slice(ordinary.length));
    assert.equal(record.requestedUrl,href);
    assert.equal(record.source,href);
  }
  const redirect = await window(ordinary+'/move?old=1');
  assert.deepEqual(requests.slice(-2), ['/move?old=1','/echo'+queries[0]]);
  assert.equal(redirect.source,ordinary+'/echo'+queries[0]);
  assert.equal(redirect.untrustedDocument,'/echo'+queries[0]);
  let assembled = '', offset, pages = 0;
  do {
    const result = await window(ordinary+'/text'+queries[0], offset);
    assert.equal(requests.at(-1),'/text'+queries[0]);
    assert.equal(result.source,ordinary+'/text'+queries[0]);
    assembled += result.untrustedDocument;
    assert.equal(result.truncated, assembled !== largeText);
    if (result.truncated) assert.ok(Number.isSafeInteger(result.nextOffset) && result.nextOffset > (offset ?? 0));
    offset = result.nextOffset;
    assert.ok(++pages < 20);
  } while (offset !== undefined);
  assert.ok(pages >= 2);
  assert.equal(assembled, largeText);
  assert.deepEqual(repositoryQuestion('Summarize '+profile), {modelRead:true});
  assert.ok(tool.validate({url:profile}).ok);
  for (const offset of [-1, 1.1, '12000', Number.MAX_SAFE_INTEGER+1]) assert.equal(tool.validate({url:ordinary,offset}).ok,false);
  for (const [path,pattern] of [['/denied',/403/],['/private',/denied/],['/broken',/request failed/],['/partial',/partial document/]]) {
    const result = await call(tool,ordinary+path);
    assert.ok(result.isError);
    assert.match(result.content[0].text,pattern);
  }
  const controller = new AbortController();
  const pending = tool.execute({arguments:{url:ordinary+'/timeout'},signal:controller.signal,toolCallId:'stop'});
  setTimeout(() => controller.abort(), 10);
  assert.match((await pending).content[0].text,/cancelled/);
  console.log(JSON.stringify({fixture:'installed large documents', platform:process.platform, bytes:Buffer.byteLength(largeText), pages, html:html.untrustedDocument}));
} finally {
  net.connect = connect;
  syncBuiltinESMExports();
  site.closeAllConnections();
  await new Promise(resolve => site.close(resolve));
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

if (mode) {
  assert.equal(process.platform,'darwin');
  const system = await discoverSystemProxy();
  assert.ok(system.endpoint && !system.limitation);
  const live = createWebFetch({mode:()=>'native-macos-public', githubProxy:true,
    document:(url, s, offset)=>fetchPublicDocument(url,s,undefined,{system,offset}),
    repository:(slug,part,s)=>fetchRepositoryPart(slug,part,s,system)});
  for (const url of profiles) {
    assert.ok(live.validate({url}).ok);
    const result = await call(live,url);
    if (result.isError) {
      assert.match(result.content[0].text,/HTTP [45]\d\d/);
      console.log(JSON.stringify({requestedUrl:url,error:result.content[0].text}));
    } else {
      const record = JSON.parse(result.content[0].text);
      assert.equal(record.requestedUrl,url);
      assert.match(record.untrustedDocument, url === profiles[0] ? /repositories/i : /"full_name"\s*:\s*"pym96\//i);
      console.log(JSON.stringify({requestedUrl:url,source:record.source,bytes:Buffer.byteLength(record.untrustedDocument),transport:result.details.transport}));
    }
  }
  const extra = mode === '--live-macos' ? [[profile,/Pan-agent/i], [source,/^MIT License/], ['https://example.com/', /Example Domain/i],
    ['https://api.github.com/repos/cli/cli/license',/MIT License/]] : [];
  for (const [url,expected] of extra) {
    const result = await call(live,url);
    assert.ok(!result.isError,result.content[0].text);
    const record = JSON.parse(result.content[0].text);
    assert.match(record.untrustedDocument,expected);
    if (url === profile) {
      assert.equal(record.requestedUrl,profile);
      assert.equal(record.source,profile);
    }
    assert.equal(record.truncated,false);
    console.log(JSON.stringify({source:record.source, upstream:record.notice, transport:result.details.transport,
      bytes:Buffer.byteLength(record.untrustedDocument), sha256:createHash('sha256').update(record.untrustedDocument).digest('hex')}));
  }
}
