import {readFileSync,mkdirSync,existsSync,writeFileSync,linkSync,appendFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MODEL,METERED_LIMITS,authorize,Ledger,check,canonical,digest} from './policy.mjs';
import {selectTasks} from './selection.mjs';
import {Store,initialize,lock,durable,aggregate} from './full-store.mjs';
import {production,resourceCheck,projectFor} from './full-host.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const MANIFEST_HASH='bfb1b8f64ca539c9c9cc88de4450c0845c38dcc8d924a7d85c126b8794e3a403';
function manifest(){const raw=readFileSync(join(HERE,'full-manifest.json'));check(digest(raw)===MANIFEST_HASH,'full_manifest_identity');return JSON.parse(raw);}
const load=p=>JSON.parse(readFileSync(p));
function args(argv){const [command,...rest]=argv,options={};check(['init','prepare','status','run','cancel','recover'].includes(command),'full_command');for(let i=0;i<rest.length;i+=2){check(['--campaign','--task','--task-root','--activation','--entry'].includes(rest[i])&&rest[i+1]&&!options[rest[i]],'full_option');options[rest[i]]=rest[i+1];}check(options['--campaign'],'campaign_required');return {command,o:options,root:resolve(options['--campaign'])};}
const identity=(host,runnerSha,lock)=>({manifestHash:MANIFEST_HASH,panHash:lock.package_sha256,runnerSha,model:MODEL,budget:METERED_LIMITS,mode:host.mode});
function snapshot(store,host){const s=host.sample(store.root);appendFileSync(join(store.root,'resources.jsonl'),JSON.stringify(s)+'\n');resourceCheck(store.root,store.meta.resourceBaseline,s);return s;}
function lastPreparation(store,id){return store.rows.filter(r=>r.event==='preparation'&&r.task===id).at(-1);}
export function proposedBinding(store,m,ids){
 const ps=ids.map(id=>{check(m.tasks.some(t=>t.id===id)&&!store.reserved(id),'task_not_unstarted');const p=lastPreparation(store,id);check(p?.detail.ready===true,'task_not_prepared');return p;});
 check(ids.length>0&&new Set(ids).size===ids.length,'task_selection');
 return {...store.meta.identity,taskIds:ids,images:Object.fromEntries(ps.map(p=>[p.task,p.detail.image])),full:{campaignId:store.meta.campaignId,root:store.root,checkpoint:store.head,segmentIndex:store.rows.filter(r=>r.event==='segment_open').length+1,preparations:Object.fromEntries(ps.map(p=>[p.task,digest(canonical(p))]))}};
}
export async function main(argv=process.argv.slice(2),dependencies={}){
 const host={...production,...dependencies},m=manifest(),{command,o,root}=args(argv);
 if(command==='init'){
  check(o['--entry'],'entry_required');const pkg=host.verifyProduct(resolve(o['--entry'])),runnerSha=host.runnerSha();
  // The parent exists; no Docker or credential lookup is needed for initialization.
  host.internal(dirname(root));const baseline=host.sample(dirname(root));check(baseline.free>=60*2**30,'resource_boundary');
  const store=initialize(root,{schema:1,campaignId:crypto.randomUUID(),identity:identity(host,runnerSha,pkg),resourceBaseline:{...baseline,owned:0},createdUTC:new Date().toISOString()});console.log(JSON.stringify(aggregate(store,m)));return;
 }
 const store=new Store(root);check(canonical(store.meta.identity)===canonical(identity(host,host.runnerSha(),{package_sha256:load(join(HERE,'package-identity.json')).package_sha256})),'campaign_identity');host.internal(root);
 if(command==='status'){const out=aggregate(store,m);if(o['--task'])out.proposedBinding=proposedBinding(store,m,o['--task'].split(','));console.log(JSON.stringify(out));return out;}
 if(command==='cancel'){const pending=store.pending();check(pending.length===1,'no_active_segment');const path=join(root,'cancel-'+pending[0].runId+'.json');if(!existsSync(path))durable(path,{runId:pending[0].runId,requestedUTC:new Date().toISOString()});return;}
 const release=await lock(root);let controller,timer,ledger;
 try{
  store.reload();host.configure?.(root);
  if(command==='recover'){
   for(const segment of store.pending()){
    const owned=store.rows.filter(r=>r.event==='reserved'&&r.runId===segment.runId);let confirmed=true;
    for(const r of owned){const result=await host.reconcile(r.project,r.image,{stop:true,ticket:join(root,'segments',r.runId,r.task,'broker-ticket.json')});store.add('reconciliation',{runId:segment.runId,task:r.task,result});if(!result.confirmed)confirmed=false;}
    check(confirmed,'residual_stop_unknown');store.add('segment_reconciled',{runId:segment.runId,unknownResultsPreserved:true});
   }console.log(JSON.stringify(aggregate(store,m)));return;
  }
  check(store.pending().length===0,'reconciliation_required');snapshot(store,host);
  if(command==='prepare'){
   check(o['--task']&&o['--task-root'],'preparation_inputs');
   for(const id of o['--task'].split(',')){
    const task=m.tasks.find(t=>t.id===id);check(task&&!store.reserved(id),'task_not_unstarted');snapshot(store,host);
    const detail=await host.prepare(task,resolve(o['--task-root']));store.add('preparation',{task:id,detail});if(detail.global)break;
   }console.log(JSON.stringify(aggregate(store,m)));return;
  }
  check(o['--activation']&&o['--entry']&&o['--task-root'],'run_inputs');
  const a=load(o['--activation']),authority=load(join(host.home,'.local/state/pan-agent/wo75/authority.json'));
  const selected=selectTasks(m,a.binding?.taskIds,a.binding?.images);const expected=proposedBinding(store,m,selected.tasks.map(t=>t.id));
  controller=new AbortController();const cancel=()=>controller.abort();const gate=authorize(a,authority,expected,{signal:controller.signal});
  host.verifyProduct(resolve(o['--entry']));check(typeof host.credentialSource==='function','credential_source');
  // Read only after signature, immutable identities, selection and checkpoint pass.
  const globalLedger=join(host.home,'.local/state/pan-agent/wo75/ledger',gate.runId+'.jsonl');check(!existsSync(globalLedger)&&!store.rows.some(r=>r.event==='segment_open'&&r.runId===gate.runId),'run_already_consumed');
  const credential=host.credentialSource();check(typeof credential==='string'&&credential.trim(),'credential_missing');
  const dir=join(root,'segments',gate.runId);mkdirSync(dir,{recursive:false});
  durable(join(dir,'activation.json'),a);store.add('segment_open',{runId:gate.runId,taskIds:expected.taskIds,binding:expected});
  ledger=new Ledger(dirname(globalLedger),gate);linkSync(globalLedger,join(dir,'ledger.jsonl'));
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const poll=()=>{try{if(existsSync(join(root,'cancel-'+gate.runId+'.json')))controller.abort();snapshot(store,host);}catch{controller.abort();}};
  timer=setInterval(poll,1000);let uncertain=false;
  try{
   for(const task of selected.tasks){
    poll();if(controller.signal.aborted)break;gate.assert(controller.signal);
    const prepared=await host.prepare(task,resolve(o['--task-root']));
    if(!prepared.ready||prepared.image!==expected.images[task.id]){store.add('preparation',{task:task.id,detail:{...prepared,ready:false,reason:prepared.reason??'signed_image_changed'}});if(prepared.global){controller.abort();break;}continue;}
    poll();if(controller.signal.aborted)break;
    await host.checkpoint?.('before_reservation',task.id);poll();if(controller.signal.aborted)break;
    const project=projectFor(store.meta.campaignId,gate.runId,task.id,store.root),directory=join(dir,task.id);mkdirSync(directory);
    store.add('reserved',{task:task.id,runId:gate.runId,project,image:expected.images[task.id]});ledger.start(task.id);
    await host.checkpoint?.('after_reservation',task.id);
    let broker,report,classified,stopped=false;const start=performance.now();
    try{
     poll();gate.assert(controller.signal);
     const home=join(directory,'child-home'),dockerConfig=join(directory,'docker-config');mkdirSync(home);mkdirSync(dockerConfig);writeFileSync(join(dockerConfig,'config.json'),JSON.stringify({cliPluginsExtraDirs:['/Applications/Docker.app/Contents/Resources/cli-plugins']}));
     durable(join(directory,'broker-ticket.json'),{state:'pending'});
     broker=host.openBroker({python:load(join(HERE,'package-identity.json')).python,home,dockerConfig,config:{project,lifecycle_path:join(directory,'broker-ticket.json'),task,task_root:resolve(o['--task-root']),image:expected.images[task.id],output:join(directory,'harbor')}});
     const onAbort=()=>{void broker.stop('cancelled').catch(()=>{});};controller.signal.addEventListener('abort',onAbort,{once:true});
     try{
      const instruction=await broker.ready;gate.assert(controller.signal);
      report=await host.runAttempt({entry:resolve(o['--entry']),task,instruction,output:join(directory,'pan'),environment:broker,gate,ledger,credentialSource:()=>credential,fetchImplementation:host.fetchImplementation,signal:controller.signal,attemptAlreadyReserved:true});
      classified=host.scoreEvidence(directory,report);
      if(report.stopConfirmed!==true||report.globalStops?.length)controller.abort();
     }finally{controller.signal.removeEventListener('abort',onAbort);}
    }catch(error){
     const reason=error.diagnostic?.reason??(controller.signal.aborted?'cancelled':'environment_or_execution_failed');classified={state:'unscored',rawReward:null,validScore:null,reason,evidence:null};
     if(['docker_daemon_unavailable','docker_address_pool_exhausted','authentication','quota_exhausted'].includes(reason))controller.abort();
     durable(join(directory,'failure.json'),{reason,phase:report?'after_agent':'preparation_or_agent',usage:null});
    }finally{
     try{await broker?.close();}catch{controller.abort();uncertain=true;}
     const proof=await host.reconcile(project,expected.images[task.id],{stop:true,ticket:join(directory,'broker-ticket.json')});durable(join(directory,'cleanup.json'),proof);stopped=proof.confirmed===true;
     if(!stopped){controller.abort();uncertain=true;}
    }
    await host.checkpoint?.('before_result',task.id);
    store.add('result',{task:task.id,runId:gate.runId,...classified,stopConfirmed:stopped,elapsedSeconds:(performance.now()-start)/1000});
    await host.checkpoint?.('after_result',task.id);
    if(controller.signal.aborted)break;
   }
   if(!uncertain)store.add('segment_closed',{runId:gate.runId,paused:controller.signal.aborted});
  }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
  console.log(JSON.stringify(aggregate(store,m)));
 }finally{clearInterval(timer);ledger?.close();await release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.code==='ENOENT'?'required_input_missing':e.message);process.exitCode=1;});
