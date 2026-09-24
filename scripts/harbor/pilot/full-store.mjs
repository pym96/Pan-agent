import {openSync,closeSync,writeFileSync,fsyncSync,linkSync,unlinkSync,readFileSync,mkdirSync,readdirSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {check,canonical,digest} from './policy.mjs';
export function durable(path,value){
 const temp=path+'.pending-'+process.pid;const fd=openSync(temp,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 linkSync(temp,path);unlinkSync(temp);const d=openSync(join(path,'..'),'r');try{fsyncSync(d);}finally{closeSync(d);}
}
export async function lock(root,ticket){
 const child=spawn('python3',[fileURLToPath(new URL('./full-lock.py',import.meta.url)),ticket??join(root,'.lock'),...(ticket?['--fence']:[])],{stdio:['pipe','pipe','pipe'],env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin'}});
 await new Promise((resolve,reject)=>{child.stdout.once('data',b=>b.toString().trim()==='locked'?resolve():reject(Error('campaign_lock')));child.once('error',reject);child.once('exit',()=>reject(Error('campaign_locked')));});
 return async()=>{child.stdin.end();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);});};
}
export class Store{
 constructor(root){this.root=realpathSync(root);this.meta=JSON.parse(readFileSync(join(root,'campaign.json')));check(this.meta.root===this.root,'campaign_location');this.reload();}
 reload(){this.rows=[];this.head=digest(canonical(this.meta));const dir=join(this.root,'journal');
  for(const name of readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort()){
   const r=JSON.parse(readFileSync(join(dir,name)));check(name===String(this.rows.length).padStart(8,'0')+'.json'&&r.previous===this.head,'journal_chain');
   if(r.event==='segment_open'){
    check(!this.rows.some(x=>x.event==='segment_open'&&x.runId===r.runId),'duplicate_segment');
    check(r.binding?.full?.campaignId===this.meta.campaignId&&r.binding.full.root===this.root&&r.binding.full.checkpoint===this.head,'segment_campaign_identity');
    for(const [k,v] of Object.entries(this.meta.identity))check(canonical(r.binding[k])===canonical(v),'segment_identity');
   }
   if(r.event==='reserved'){
    const segment=this.rows.find(x=>x.event==='segment_open'&&x.runId===r.runId);
    check(segment?.taskIds.includes(r.task)&&segment.binding.images[r.task]===r.image&&!this.rows.some(x=>x.event==='reserved'&&x.task===r.task),'reservation_identity');
    check(r.project==='wo78-'+digest(this.meta.campaignId+'\n'+this.root+'\n'+r.runId+'\n'+r.task).slice(0,16),'foreign_project');
   }
   if(r.event==='result')check(this.rows.some(x=>x.event==='reserved'&&x.task===r.task&&x.runId===r.runId)&&!this.rows.some(x=>x.event==='result'&&x.task===r.task),'result_identity');
this.head=digest(canonical(r));this.rows.push(r);
  }
 }
 add(event,data={}){const row={event,...data,previous:this.head,utc:new Date().toISOString()};durable(join(this.root,'journal',String(this.rows.length).padStart(8,'0')+'.json'),row);this.rows.push(row);this.head=digest(canonical(row));return row;}
 reserved(id){return this.rows.find(r=>r.event==='reserved'&&r.task===id);}
 pending(){return this.rows.filter(r=>r.event==='segment_open'&&!this.rows.some(x=>['segment_closed','segment_reconciled'].includes(x.event)&&x.runId===r.runId));}
}
export function initialize(root,meta){mkdirSync(root,{recursive:false});mkdirSync(join(root,'journal'));mkdirSync(join(root,'segments'));durable(join(root,'campaign.json'),{...meta,root:realpathSync(root)});return new Store(root);}
export function rawAccounting(root,runId,task){
 const p=join(root,'segments',runId,'ledger.jsonl');if(!existsSync(p))return {counts:null,usage:null,incomplete:true};
 const all=readFileSync(p,'utf8').split('\n');let incomplete=all.pop()!=='';const rows=[];
 for(const line of all){try{rows.push(JSON.parse(line));}catch{incomplete=true;}}
 const rs=rows.filter(r=>r.task===task),c=event=>rs.filter(r=>r.event===event).length;
 const rounds=new Set(rs.filter(r=>r.event==='exchange_started').map(r=>r.modelRound));const usages=rs.filter(r=>r.event==='usage');const known=usages.filter(r=>Number.isFinite(r.input)&&Number.isFinite(r.output));
 const outstanding=c('exchange_started')-usages.length;
 return {counts:{modelRounds:rounds.size,exchanges:c('exchange_started'),reservations:c('dispatch_reserved'),sendEntries:c('send_entered'),tools:c('tool_reserved'),retries:c('retry_scheduled')},usage:{known:known.length,unknown:usages.length-known.length,unsettled:outstanding,input:known.reduce((n,r)=>n+r.input,0),output:known.reduce((n,r)=>n+r.output,0)},incomplete:incomplete||outstanding>0||!rs.some(r=>r.event==='attempt_finished')};
}
export function aggregate(store,manifest){
 const rows=manifest.tasks.map(t=>{const reservation=store.reserved(t.id),result=store.rows.find(r=>r.event==='result'&&r.task===t.id),preparations=store.rows.filter(r=>r.event==='preparation'&&r.task===t.id);
  return {task:t.id,state:!reservation?'not_started':result?.state??'unknown_interrupted',rawReward:result?.rawReward??null,validScore:result?.validScore??null,reason:result?.reason??null,runId:reservation?.runId??null,preparations:preparations.map(p=>p.detail),accounting:reservation?rawAccounting(store.root,reservation.runId,t.id):null,elapsedSeconds:result?.elapsedSeconds??null,evidence:result?.evidence??null};});
 const successes=rows.filter(r=>r.validScore===1).length,scored=rows.filter(r=>r.validScore!==null).length;
 const observed=rows.filter(r=>r.accounting?.counts),knownObservedTotals={counts:Object.fromEntries(['modelRounds','exchanges','reservations','sendEntries','tools','retries'].map(k=>[k,observed.reduce((n,r)=>n+r.accounting.counts[k],0)])),usage:Object.fromEntries(['known','unknown','unsettled','input','output'].map(k=>[k,observed.reduce((n,r)=>n+r.accounting.usage[k],0)])),unavailableTasks:rows.filter(r=>r.runId&&!r.accounting?.counts).map(r=>r.task),incompleteTasks:rows.filter(r=>r.accounting?.incomplete).map(r=>r.task),recordedElapsedSeconds:rows.reduce((n,r)=>n+(r.elapsedSeconds??0),0),unknownElapsedTasks:rows.filter(r=>r.runId&&r.elapsedSeconds===null).map(r=>r.task)};
 return {knownObservedTotals,campaignId:store.meta.campaignId,identity:store.meta.identity,checkpoint:store.head,denominator:89,successes,validScored:scored,successFraction:`${successes}/89`,validScoredFraction:`${scored}/89`,notStarted:rows.filter(r=>r.state==='not_started').length,unscored:rows.filter(r=>r.runId&&r.validScore===null).length,pendingSegments:store.pending().map(r=>r.runId),rows,label:'frozen 89-task population; raw reward is not automatically a valid score; unknown is not zero'};
}
