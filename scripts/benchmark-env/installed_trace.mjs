// Deterministic fixture adapter, public installed Session only. No real model.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input);
const {GeneralAgentSession,FauxModelAdapter,RunArchiveStore}=await import(pathToFileURL(config.installedEntry));
const observations=[],effects=[],pendingTools=[];
let commandList=config.task==='swe'?[
 'pwd; head -c 256 README*',
 "printf 'scripted environment fixture\\n' > wo71-fixture.txt; cat wo71-fixture.txt",
 'git diff --no-index /dev/null wo71-fixture.txt',
 "printf 'deliberate exit\\n'; exit 7",
 "printf '%05000d' 0",
]:[
 'pwd; head -c 256 README.md',
 "printf 'result\\nscripted-fixture-not-an-answer\\n' > result.csv; cat result.csv",
 "printf 'deliberate exit\\n'; exit 7",
 "printf '%05000d' 0",
];
if(config.mode==='timeout'||config.mode==='cancel')commandList=['sleep 20; printf should-not-complete'];
const usage={status:'reported',value:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
const identity={provider:{status:'reported',value:'synthetic-fixture'},model:{status:'reported',value:'wo71-script'},responseId:{status:'unavailable'}};
const response=content=>({kind:'response',message:{role:'assistant',content,timestamp:10},stopReason:content[0].type==='tool_call'?'tool_calls':'stop',usage,identity});
const script=commandList.map((command,i)=>response([{type:'tool_call',id:'fixture-'+i,name:'benchmark_command',arguments:{command,timeout:config.mode==='timeout'?1:10}}]));
script.push(response([{type:'text',text:'Synthetic environment trace complete; no task-success claim.'}]));
const tool={name:'benchmark_command',description:'Execute a command in the declared isolated task via SWE-ReX',parameters:{type:'object',properties:{command:{type:'string'},timeout:{type:'number'}},required:['command','timeout'],additionalProperties:false},validate:value=>typeof value?.command==='string'&&value.command.length<=32768&&value.timeout>0&&value.timeout<=30?{ok:true,value}:{ok:false,error:'invalid command'},execute:({toolCallId,arguments:args,signal})=>{const pending=(async()=>{
 let cancellation;const stop=()=>{cancellation=fetch(config.endpoint+'/cancel',{method:'POST',headers:{'Authorization':'Bearer '+config.token}})};
 signal.addEventListener('abort',stop,{once:true});
 const timer=config.mode==='cancel'?setTimeout(()=>session.cancel(),500):null;
 let r;try{r=await fetch(config.endpoint+'/execute',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.token},body:JSON.stringify(args),signal});}catch(error){await cancellation;effects.push({toolCallId,arguments:args,error:'cancelled',observedOutput:null});throw error;}finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',stop);}
 if(!r.ok)throw Error('controller transport failure '+r.status);
 const result=await r.json();effects.push({toolCallId,arguments:args,result});
 const full=JSON.stringify(result);const shown=full.length>2048?full.slice(0,2048)+'\n[truncated; complete fixture evidence retained]':full;
 return {content:[{type:'text',text:shown}],isError:result.exit_code!==0,details:{exitCode:result.exit_code,truncated:full.length>2048,fullSha256:createHash('sha256').update(full).digest('hex')}};
})();pendingTools.push(pending);return pending;}};
await mkdir(config.output,{recursive:true});
const session=new GeneralAgentSession({kernel:'native',adapter:new FauxModelAdapter(script),tools:[tool],systemPrompt:'Synthetic environment fixture. No hidden answer. No model invocation.',limits:{maxModelTurns:10,maxToolSteps:10},memory:{archiveStore:await RunArchiveStore.open(config.output+'/archive'),runbook:async()=>({content:'synthetic fixture',revision:'sha256:'+createHash('sha256').update('synthetic fixture').digest('hex')})},onObservation:event=>observations.push(event)});
let result;
try{result=await session.runTask('Run the supplied environment fixture.');}
finally{await session.close();await Promise.allSettled(pendingTools);}
await writeFile(config.output+'/trace.json',JSON.stringify({kind:'scripted fixture; not learned benchmark performance',task:config.task,realProviderCalls:0,result,observations,effects},null,2)+'\n');
if(config.mode==='cancel'&&result.status!=='cancelled')throw Error('cancellation missing');
if(config.mode==='timeout'&&!effects.some(e=>e.result?.exit_code===null))throw Error('timeout missing');
if(!config.mode&&(effects.length!==commandList.length||!effects.some(e=>e.result.exit_code===7)||!effects.some(e=>e.result.stdout.length>=5000)))throw Error('fixture effect coverage missing');
console.log(JSON.stringify({task:config.task,status:result.status,fixtureExchanges:result.modelCalls,realProviderCalls:0,tools:effects.length}));
