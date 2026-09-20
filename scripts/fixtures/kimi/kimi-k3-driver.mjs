/** #68 installed CLI -> Session -> real Kimi adapter, synthetic wire only. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
const [product,root,phase,effort='high']=process.argv.slice(2);
const {runCli,runTui,PanKimiModelAdapter,KimiFetchTransport,RunArchiveStore,loadPanSettings}=await import(pathToFileURL(join(product,'dist/index.js')));
const fixture=JSON.parse(await readFile(join(root,'kimi-k3-wire-v1.json'),'utf8'));
const home=join(root,'home'),workspace=join(root,'workspace'),memory=join(root,'memory');
for(const directory of [home,workspace])await mkdir(directory,{recursive:true});
const input=new PassThrough(),output=new PassThrough();let rendered='';output.on('data',chunk=>{rendered+=chunk;});
let requests=[],syntheticReads=0;const credential='SYNTHETIC-K3-HEADER-ONLY';let composed,adapter;
const factory=profile=>{
 composed=profile;
 adapter=new PanKimiModelAdapter(profile,{transport:new KimiFetchTransport({credentialSource:()=>{syntheticReads++;return credential;},fetchImplementation:async(url,options)=>{
  assert.equal(url,'https://api.kimi.com/coding/v1/chat/completions');assert.equal(options.headers.authorization,`Bearer ${credential}`);
  assert.ok(!options.body.includes(credential));requests.push({url,body:JSON.parse(options.body),authorization:'synthetic header matched (redacted)'});
  const name=requests.length===1?'single':'usage-tail';
  const wire=fixture.valid.find(row=>row.name===name).wire;
  return new Response(new ReadableStream({start(controller){const bytes=Buffer.from(wire);for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.subarray(i,i+3));controller.close();}}),{status:200});
 }})});return adapter;
};
const args=['--kernel','native','--workspace',workspace,'--memory-root',memory];
const hash=b=>createHash('sha256').update(b).digest('hex');
async function hashes(directory){const result={};for(const file of await readdir(directory,{recursive:true})){try{result[file]=hash(await readFile(join(directory,file)));}catch(error){if(error.code!=='EISDIR')throw error;}}return result;}
if(phase==='configure'){
 const pending=runCli(['configure'],{home,input,output,saveCredential:()=>{throw new Error('forbidden Keychain write');}});
 input.end(`kimi-code:k3-256k\n${effort}\nenvironment\n`);assert.equal(await pending,0);
 assert.equal((await loadPanSettings(home)).modelId,'k3-256k');assert.equal(requests.length,0);assert.equal(syntheticReads,0);
}else if(phase==='startup'){
 assert.equal(await runCli(args,{home,output,createKimiAdapter:factory,startTui:async options=>{assert.equal(options.model,'k3-256k');assert.equal(options.thinking,effort);await options.session.close();return 0;}}),0);
 assert.equal(requests.length,0);assert.equal(syntheticReads,0);
}else if(phase==='task'){
 await writeFile(join(workspace,'sample.txt'),'SYNTHETIC SAMPLE\n');
 assert.equal(await runCli(args,{home,output,createKimiAdapter:factory,startTui:async options=>{
  assert.equal(options.model,'k3-256k');assert.equal(options.thinking,effort);
  const result=await options.session.runTask('Read sample.txt.');assert.equal(result.status,'completed');assert.equal(result.modelCalls,2);assert.equal(result.toolCalls,1);
  await writeFile(join(root,'run.json'),JSON.stringify(result,null,2));await options.session.close();return 0;
 }}),0);
 assert.deepEqual(composed,{modelId:'k3-256k',thinkingLevel:effort});assert.equal(requests.length,2);assert.equal(syntheticReads,2);
 for(const {body} of requests){assert.equal(body.model,'k3-256k');assert.equal(body.reasoning_effort,effort);assert.ok(!('thinking' in body));}
 const history=requests[1].body.messages;assert.equal(history[2].reasoning_content,'PRIVATE-K3-思考-片0');assert.equal(history[3].tool_call_id,'call-0');assert.match(history[3].content,/SYNTHETIC SAMPLE/);
 const store=await RunArchiveStore.open(memory);const result=JSON.parse(await readFile(join(root,'run.json'),'utf8'));const records=await store.readArchive(result.runId);
 assert.equal(records.filter(r=>r.type==='run.terminal').length,1);assert.equal(records.filter(r=>r.type==='tool.started').length,1);
 assert.deepEqual(records.filter(r=>r.type==='model.turn_settled').at(-1).identity.model,{status:'reported',value:'observed-k3-build'});
 assert.ok(!JSON.stringify(records).includes('PRIVATE'));assert.ok(!JSON.stringify(records).includes(credential));
 const afterDispose=await adapter.exchange({sessionId:'fresh',signal:new AbortController().signal,context:{systemPrompt:'offline',messages:[],tools:[]}});assert.equal(afterDispose.kind,'failure');assert.equal(requests.length,2);
 await writeFile(join(root,'synthetic-wire-captures.json'),JSON.stringify({synthetic:true,requests},null,2));
}else if(phase==='replay'){
 const result=JSON.parse(await readFile(join(root,'run.json'),'utf8'));const before=await hashes(memory),workspaceBefore=await hashes(workspace);let prompts=0;
 output.on('data',chunk=>{if(String(chunk).endsWith('You > '))setImmediate(()=>input.write(prompts++===0?`:replay ${result.runId}\n`:':exit\n'));});
 // Constructing an adapter is inert; replay must never invoke exchange or tools.
 assert.equal(await runCli(args,{home,output,createKimiAdapter:factory,startTui:options=>runTui({...options,input})}),0);
 assert.match(rendered,/Archived replay/);assert.equal(requests.length,0);assert.equal(syntheticReads,0);assert.deepEqual(await hashes(memory),before);assert.deepEqual(await hashes(workspace),workspaceBefore);
}else if(phase==='invalid'){
 for(const settings of [
 {modelId:'k3'}, {modelId:'k3-256k',thinkingLevel:'none'}, {modelId:'k3-256k',endpoint:'https://invalid'}
 ]){
  await mkdir(join(home,'.pan-agent'),{recursive:true});await writeFile(join(home,'.pan-agent/settings.json'),JSON.stringify({schemaVersion:1,provider:'kimi-code',modelId:'k3-256k',thinkingLevel:'high',credentialSource:'environment',...settings}));
  assert.equal(await runCli(args,{home,output,createKimiAdapter:()=>{throw new Error('invalid selection reached factory');},startTui:async()=>{throw new Error('invalid startup');}}),2);
 }
 assert.equal(requests.length,0);assert.equal(syntheticReads,0);
}else throw new Error('unknown phase');
assert.ok(!rendered.includes('PRIVATE'));assert.ok(!rendered.includes(credential));
await writeFile(join(root,`${phase}-${effort}.json`),JSON.stringify({phase,effort,composed,syntheticReads,syntheticRequests:requests.length,rendered,realProviderCalls:0,realCredentialReads:0,quotaCalls:0,cost:0},null,2)+'\n');
console.log(`PASS installed K3 ${phase} ${effort}`);
