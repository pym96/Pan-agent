#!/usr/bin/env node
/** Only model replies and the optional public-DNS fixture are injected. All reads cross the installed boundary. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {lookup} from 'node:dns/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';

const [installedPath, evidencePath, resolverMode] = process.argv.slice(2);
if (!installedPath || !evidencePath || (resolverMode && resolverMode !== '--pages-address-fixture'))
  throw Error('usage: native-network.mjs INSTALLED_PACKAGE NEW_OUTPUT [--pages-address-fixture]');
const installed = fs.realpathSync(installedPath);
assert.equal(fs.existsSync(path.join(installed,'src')),false);
fs.mkdirSync(evidencePath,{mode:0o700});
const out = fs.realpathSync(evidencePath);
const api = await import(pathToFileURL(path.join(installed,'dist/index.js')).href);
const publicUrl = 'https://pym96.github.io/Pan-agent/LICENSE';
const digest = 'ad6a59bed78e555088706cbf91314ceec9bb36caf451eff374b49875248ddda8';
const tag = randomUUID();
const write = (name, value) => fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const receipts = [];
const services = [];
async function listener(ip) {
  const service = http.createServer((req,res) => {
    receipts.push({ip,method:req.method,path:req.url});
    if (req.url === '/redirect/'+tag) res.writeHead(302,{Location:services[1].origin+'/outside/'+tag});
    res.end('owned-'+tag);
  });
  service.listen(0,ip);
  await once(service,'listening');
  const origin = 'http://'+(ip.includes(':')?'['+ip+']':ip)+':'+service.address().port;
  services.push({service,origin});
  // Ordinary host socket with no environment proxy.
  assert.equal(await new Promise((ok,fail) => http.get(origin+'/control/'+tag,{agent:false},r=>{
    let body='';r.on('data',d=>body+=d);r.on('end',()=>ok(body));
  }).on('error',fail)), 'owned-'+tag);
}
const id = {provider:{status:'reported',value:'pan-faux'},model:{status:'reported',value:'pan-faux-v1'},responseId:{status:'unavailable'}};
function reply(content,stopReason) {
  return {kind:'response',message:{role:'assistant',timestamp:0,content},stopReason,usage:{status:'unavailable'},identity:id};
}
const records = [];
async function scenario(label, commands, {grant,pin,offline=false}={}) {
  const base = path.join(out,label), workspace = path.join(base,'work'), memory = path.join(base,'archives');
  fs.mkdirSync(workspace,{recursive:true,mode:0o700});
  const script = [];
  for (const [i,command] of commands.entries()) {
    script.push(reply([{type:'tool_call',id:'step'+i,name:'bash',arguments:{command}}],'tool_calls'));
    script.push(reply([{type:'text',text:'Fixture task settled.'}],'stop'));
  }
  const output = new PassThrough();let transcript='';
  output.on('data',b=>transcript+=b);
  const options = {home:base,output,createNativeAdapter:()=>new api.FauxModelAdapter(script),
    startTui:async tui=>{
      tui.session.setApprovalChannel(async request=>({requestId:request.requestId,decision:'allow-once'}));
      const expectedMode='native-'+(process.platform==='darwin'?'macos':'linux')+'-'+(offline?'offline':'public');
      assert.equal(tui.executionMode,expectedMode);
      try {
        for(const i of commands.keys()) {
          const run=await tui.session.runTask('Execute owned fixture '+label+' '+i);
          const archive=await tui.archiveStore.readArchive(run.runId);
          write(label+'/archive-'+i+'.json',archive);
          assert.equal(run.archiveSealed,true);
          const boundary=archive.find(row=>row.type==='execution.boundary');
          assert.equal(boundary?.executionMode,expectedMode,JSON.stringify(archive));
          const tool=archive.find(row=>row.type==='tool.settled'&&row.toolCallId==='step'+i);
          assert.ok(tool,JSON.stringify(archive));
          assert.equal(tool.isError,false,tool.text);
          assert.match(tool.text,/FIXTURE_OK/);
          const audit = path.join(memory,'native-sandbox',run.runId,'network.jsonl');
          const events=fs.existsSync(audit)?fs.readFileSync(audit,'utf8').trim().split('\n').map(JSON.parse):[];
          if (!offline) {
            assert.equal(events[0].event,'opened');
            assert.equal(events.at(-1).event,'closed');
            assert.equal(events[0].grant,i===0&&grant?grant:null);
          }
          records.push({label,i,run:run.runId,boundary,events,tool:tool.text});
        }
      } finally { await tui.session.close(); }
      return 0;
    }};
  if(pin) {
    let call=0;
    options.resolveNetworkName=async name=>{
      assert.equal(name,'pym96.github.io');
      return call++ === 0 ? ['185.199.108.153'] : ['127.0.0.1'];
    };
  }
  try {
    const code=await api.runCli(['--kernel','native','--native-sandbox','--workspace',workspace,
      '--memory-root',memory,...(grant?['--native-grant',grant]:[]),...(offline?['--native-offline']:[])],options);
    assert.equal(code,0,transcript);
  } finally { fs.writeFileSync(path.join(base,'cli.stdout'),transcript); }
}
const sh = s=>"'"+s.replaceAll("'","'\\''")+"'";
try {
  await listener('127.0.0.1'); await listener('::1');
  const [v4,v6]=services.map(s=>s.origin);
  const defaultAnswers=await lookup('pym96.github.io',{all:true});
  write('resolver.json',{defaultAnswers,resolverMode:resolverMode??'system',tag});
  const publicGet='pan-fetch '+sh(publicUrl)+' > license && node -e '+sh(
    'const h=require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync("license")).digest("hex"); console.log(h); if (h!=='+JSON.stringify(digest)+') process.exit(1)')+' && echo FIXTURE_OK';
  if(resolverMode) {
    assert.ok(defaultAnswers.some(record=>/^198\.(18|19)\./.test(record.address)));
    await scenario('system-reserved-denial',['! pan-fetch '+sh(publicUrl)+' && echo FIXTURE_OK']);
  }
  await scenario('public-read',resolverMode?[publicGet,'! pan-fetch '+sh(publicUrl)+' && echo FIXTURE_OK']:[publicGet],{pin:!!resolverMode});
  const localScript = `const {createServer}=require('node:net'),{spawn}=require('node:child_process');
const endpoint=process.env.PAN_LOCAL_SOCKETS+'/owned.sock';
const srv=createServer(c=>c.end('${tag}'));
srv.listen(endpoint,()=>{const kid=spawn(process.execPath,['-e',\`const c=require('node:net').connect(process.argv[1]);let bytes='';c.on('data',x=>bytes+=x);c.on('end',()=>{if(bytes!==process.argv[2]) process.exitCode=3; else console.log('child-received',bytes)})\`,endpoint,'${tag}'],{stdio:'inherit'});
kid.on('exit',code=>{process.exitCode=code??1;srv.close()})});`;
  const socketChecks = `const net=require('node:net'),http=require('node:http');
(async()=>{for (const origin of ${JSON.stringify([v4,v6])}) {
 await new Promise((ok,fail)=>{const q=http.get(origin+'/direct/${tag}',res=>{res.resume();fail(Error('unexpected direct response'))});
 q.setTimeout(3000,()=>q.destroy(Error('unexpected timeout')));q.on('error',e=>['EACCES','EPERM','ENETUNREACH','EAFNOSUPPORT'].includes(e.code)?ok():fail(e))});
}console.log('direct IPv4 and IPv6 denied')})().catch(e=>{console.error(e);process.exitCode=1});`;
  await scenario('local-and-ungranted',[
    'node -e '+sh(localScript)+' && node -e '+sh(socketChecks)+' && ! pan-fetch '+sh(v4+'/denied/'+tag)+' && ! pan-fetch '+sh(v6+'/denied/'+tag)+' && echo FIXTURE_OK'
  ]);
  await scenario('unsupported-method',['test "$(curl -q -sS --noproxy '+sh('*')+' --unix-socket "$PAN_NETWORK_SOCKET" -o /dev/null -w "%{http_code}" -X POST --get --data-urlencode '+
    sh('url='+v4+'/outside/'+tag)+' http://localhost/fetch)" = 403 && echo FIXTURE_OK']);
  for (const [i,target] of [v4,v6].entries()) {
    const outside=i?v4:v6;
    const standardCurl='curl -q -fsS --noproxy '+sh('*')+' --unix-socket "$PAN_NETWORK_SOCKET" --get --data-urlencode '+
      sh('url='+target+'/allowed/'+tag)+' http://localhost/fetch';
    await scenario('grant-'+i,[
      'test "$('+standardCurl+')" = '+sh('owned-'+tag)+' && ! pan-fetch '+sh(outside+'/outside/'+tag)+
      (i?'':' && ! pan-fetch '+sh(target+'/redirect/'+tag))+' && echo FIXTURE_OK',
      '! pan-fetch '+sh(target+'/expired/'+tag)+' && echo FIXTURE_OK',
    ],{grant:target});
  }
  await scenario('explicit-offline',['test -z "$PAN_NETWORK_SOCKET" && ! command -v pan-fetch && echo FIXTURE_OK'],{offline:true});
  for(const ip of ['127.0.0.1','::1']) {
    const observed=receipts.filter(r=>r.ip===ip).map(r=>r.path);
    assert.deepEqual(observed,['/control/'+tag,'/allowed/'+tag,...(ip==='127.0.0.1'?['/redirect/'+tag]:[])]);
  }
  write('summary.json',{status:'PASS',platform:process.platform,tag,publicUrl,digest,records,receipts});
  console.log('PASS',process.platform,tag);
} finally {
  write('receipts.json',receipts);
  write('completed-records.json',records);
  for(const {service} of services) { service.closeAllConnections();service.close(); }
}
