// Actual pinned upstream SDK. This adapter disables all tools/resources/ambient configuration.
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createAgentSession,ModelRuntime,SettingsManager,SessionManager,DefaultResourceLoader} from '@earendil-works/pi-coding-agent';
const root=process.env.PI_DATA??'/data';
const endpoint=process.env.MODEL_URL??'http://127.0.0.1:8082/v1';
const modelID=process.env.MODEL_ID??'synthetic-142';
const runtime=await ModelRuntime.create({credentials:{async read(){return undefined},async list(){return []},async modify(){throw Error("credential writes disabled")},async delete(){throw Error("credential writes disabled")}},modelsPath:null,modelsStorePath:join(root,'catalog.json'),allowModelNetwork:false,refreshOnCreate:false});
runtime.registerProvider('pan-local',{baseUrl:endpoint,api:'openai-completions',apiKey:process.env.MODEL_API_KEY??'synthetic-not-a-secret',models:[{id:modelID,name:modelID,input:['text'],reasoning:false,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:512}]});
const model=runtime.getModel('pan-local',modelID);
const active=new Set();let requests=0,completed=0,failed=0;
http.createServer(async(req,res)=>{
 if(req.url==='/metrics'){res.end(JSON.stringify({active:active.size,requests,completed,failed,pi:'1.3.0',endpointKind:process.env.MODEL_KIND??'synthetic'}));return}
 if(req.method!=='POST'||req.url!=='/run'){res.writeHead(404).end();return}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384){res.writeHead(413).end();return}}
 let body;try{body=JSON.parse(raw)}catch{res.writeHead(400).end();return}
 if(typeof body.session!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(body.session)||typeof body.prompt!=='string'||body.prompt.length>8192){res.writeHead(400).end();return}
 if(active.size>=2||active.has(body.session)){res.writeHead(429).end();return}
 active.add(body.session);requests++;let session,timer;let closed=false;
 const emit=(kind,data)=>{if(closed||res.destroyed)return;const line=JSON.stringify({kind,data})+'\n';if(!res.write(line)){closed=true;session?.abort();res.destroy()}};
 res.on('close',()=>{closed=true;session?.abort()});
 try{
  const dir=join(root,'sessions',body.session),cwd=join(dir,'workspace'),agentDir=join(dir,'config');await mkdir(cwd,{recursive:true});await mkdir(agentDir,{recursive:true});
  const settingsManager=SettingsManager.inMemory({retry:{enabled:false,maxRetries:0,provider:{maxRetries:0,timeoutMs:45000}},compaction:{enabled:false},cacheWarming:'off',enableAnalytics:false,enableInstallTelemetry:false});
  const loader=new DefaultResourceLoader({cwd,agentDir,settingsManager,noExtensions:true,disabledBuiltinExtensions:['mcp'],noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,systemPrompt:'You are a text-only assistant. No tools are available.'});await loader.reload();
  ({session}=await createAgentSession({cwd,agentDir,modelRuntime:runtime,model,thinkingLevel:'off',tools:[],noTools:'all',resourceLoader:loader,settingsManager,sessionManager:SessionManager.continueRecent(cwd,join(dir,'history'))}));
  if(session.getActiveToolNames().length)throw Error('tools unexpectedly active');
  res.writeHead(200,{'Content-Type':'application/x-ndjson'});
  emit('runtime',{package:'@earendil-works/pi-coding-agent',version:'1.3.0',tools:[],contextOwner:'Pi SessionManager',session:body.session});
  let chunks=0;session.subscribe(event=>{if(event.type==='message_update'&&event.assistantMessageEvent.type==='text_delta'){if(++chunks>400){closed=true;session.abort();res.destroy();return}emit('text',{text:event.assistantMessageEvent.delta})}});
  timer=setTimeout(()=>session.abort(),45000);
  await session.prompt(body.prompt);
  const last=session.state.messages.at(-1);
  if(closed||last?.role!=='assistant'||['error','aborted'].includes(last.stopReason))throw Error('model did not complete');
  emit('result',{text:last.content.filter(x=>x.type==='text').map(x=>x.text).join(''),usage:last.usage,stopReason:last.stopReason});completed++;res.end();
 }catch{failed++;if(!res.headersSent)res.writeHead(502);res.end()}finally{clearTimeout(timer);session?.dispose();active.delete(body.session)}
}).listen(8081,'0.0.0.0',()=>console.log('Pi SDK executor ready; no tools; concurrency=2'));
