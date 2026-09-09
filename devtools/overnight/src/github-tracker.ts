import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, fileDigest, insist, hash, keys, hex, safe, type Result } from './model.ts';
import { atomic, read, type Tracker } from './storage.ts';
import { CONTRACT, type Binding } from './connector-authority.ts';

export interface Comment { id:number;body:string;author:string;url:string; }
export interface IssueTransport { list():Comment[]; post(body:string):void; }
export function activationBody(b:Binding):string {
 return 'WorkOrder #46 Stage B activation\n'+safe({connectorSha:b.connectorSha,manifestDigest:b.manifestDigest,contract:CONTRACT,delegation:b.delegation,roles:b.roles,campaign:b.campaign,cli:{sha256:b.cli.sha256,version:b.cli.version},model:b.model,auth:b.auth,codexHomeDigest:digest(b.codexHome),github:{repository:b.github.repository,issue:b.github.issue,author:b.github.author,executableDigest:b.github.sha256},stageAReview:b.stageAReview,humanReview:b.humanReview});
}
export function stageAReviewBody(sha:string):string {
 return 'WorkOrder #46 Stage A review\n'+safe({candidateSha:sha,criteriaVersion:'1.0',role:'Regulator Agent',result:'PASS',outputs:['L-AUTH','L-RESULT','L-TRACKER','L-STOP','L-CONTAINMENT','L-PACKAGE']});
}
export function humanReviewBody(sha:string):string {
 return 'WorkOrder #46 Human review\n'+safe({candidateSha:sha,criteriaVersion:'1.0',role:'Human',result:'PASS',outputs:['L-AUTH','L-STOP','L-CONTAINMENT']});
}
export function verifyRemoteAuthority(comments:Comment[],b:Binding):void {
 const get=(url:string|null)=>{const rows=comments.filter(c=>c.url===url);insist(rows.length===1 && rows[0]!.author===b.github.author,'remote_authorization_unconfirmed');return rows[0]!;};
 const contract=get('https://github.com/pym96/Pan-agent/issues/46#issuecomment-5595244988');
 insist(digest(contract.body)===CONTRACT,'contract_drift');
 insist(get(b.masterActivation).body===activationBody(b),'activation_changed');
 insist(get(b.stageAReview).body===stageAReviewBody(b.connectorSha) && get(b.humanReview).body===humanReviewBody(b.connectorSha),'review_identity_changed');
}
export class GhIssueTransport implements IssueTransport {
 private binding:Binding;private directory:string;
 constructor(binding:Binding,directory:string){this.binding=binding;this.directory=directory;}
 private invoke(args:string[],input?:string):string {
  const b=this.binding;insist(b.stage==='B','stage_b_not_activated');insist(fileDigest(b.github.executable)===b.github.sha256,'executable_changed');
  // Only gh receives its existing official auth context; never forward it to Codex or tools.
  const env:NodeJS.ProcessEnv={PATH:'/usr/bin:/bin',HOME:process.env.HOME,GH_PROMPT_DISABLED:'1',GH_HOST:'github.com'};
  for(const k of ['GH_CONFIG_DIR','GH_TOKEN','GITHUB_TOKEN'])if(process.env[k])env[k]=process.env[k];
  const p=spawnSync(b.github.executable,args,{input,env,encoding:'utf8',timeout:1500,maxBuffer:4*1024*1024});
  insist(p.status===0,'tracker_unknown');return p.stdout;
 }
 list():Comment[] {
  const b=this.binding;const x=JSON.parse(this.invoke(['api','--hostname','github.com',`repos/pym96/Pan-agent/issues/46/comments?per_page=100`,'--paginate','--slurp']));
  insist(Array.isArray(x) && x.every(Array.isArray),'tracker_unknown');
  const comments=x.flat().map((c:any)=>({id:c.id,body:c.body,author:c.user?.login,url:c.html_url}));
  verifyRemoteAuthority(comments,b);return comments;
 }
 post(body:string):void {this.invoke(['api','--hostname','github.com','repos/pym96/Pan-agent/issues/46/comments','--method','POST','--input','-'],JSON.stringify({body}));}
}
const PREFIX='WorkOrder #46 trial-target result; not acceptance of the connector.\n';
export function publication(key:string,result:any):string {
 // Strict structured result fields; no raw stdout, arbitrary text, paths, or error messages.
 keys(result,['simulation','kind','job','repository','issue','version','contractDigest','authorization','role','template','session','key','candidate','outcome','blockers','evidence']);
 insist(hash(key) && result.key===key && result.issue===46 && result.repository==='sum-integers-trial' && ['SIMULATED','TRIAL'].includes(result.simulation),'tracker_identity');
 insist(['handoff','verdict'].includes(result.kind) && ['builder','regulator'].includes(result.role) && /^[a-zA-Z0-9_-]{1,100}$/.test(result.session) && /^[a-zA-Z0-9_-]{1,80}$/.test(result.job),'tracker_identity');
 insist(result.version==='1.0' && [result.contractDigest,result.authorization,result.template].every(hash) && hex(result.candidate),'tracker_identity');
 insist(['handoff','accepted','criterion_failed','scope_challenge','quota_unavailable','evidence_incomplete'].includes(result.outcome) && Array.isArray(result.blockers) && result.blockers.every((v:unknown)=>v==='C-SUM-01'),'tracker_identity');
 keys(result.evidence,['name','digest']);insist(result.evidence.name==='evidence.json' && hash(result.evidence.digest),'tracker_identity');
 return PREFIX+safe({deliveryKey:key,resultDigest:digest(result),result});
}
export class GitHubTracker implements Tracker {
 private transport:IssueTransport;private root:string;private binding:Binding;
 constructor(transport:IssueTransport,root:string,binding:Binding){this.transport=transport;this.root=root;this.binding=binding;mkdirSync(root,{recursive:true,mode:0o700});}
 private readBack(key:string):{result:Result;receipt:Comment}|null {
  const matches=this.transport.list().filter(c=>typeof c.body==='string' && c.body.startsWith(PREFIX) && c.body.includes(key));
  if(matches.length===0)return null;insist(matches.length===1,'publication_conflict');const c=matches[0]!;
  insist(c.author===this.binding.github.author && Number.isSafeInteger(c.id) && c.url===`https://github.com/pym96/Pan-agent/issues/46#issuecomment-${c.id}`,'tracker_identity');
  const x=JSON.parse(c.body.slice(PREFIX.length));keys(x,['deliveryKey','resultDigest','result']);
  insist(x.deliveryKey===key && digest(x.result)===x.resultDigest && publication(key,x.result)===c.body,'publication_conflict');
  const local=join(this.root,key+'.json');if(existsSync(local)){const r=read(local);insist(r.id===c.id && r.digest===x.resultDigest,'publication_conflict');}
  return {result:x.result,receipt:c};
 }
 lookup(key:string):Result|null {const r=this.readBack(key);return r?.result??null;}
  publish(key:string,result:unknown):void {
  const body=publication(key,result),intent=join(this.root,key+'.intent.json');let old=this.readBack(key);
  if(!old) {
   // A durable write intent with no observable comment is ambiguous; never blindly POST again.
   insist(!existsSync(intent),'tracker_unknown');atomic(intent,{digest:digest(result),key});
   try{this.transport.post(body);}catch{/* A committed write may have lost its response. Read back, never retry POST. */}
   old=this.readBack(key);insist(old,'tracker_unknown');
  }
  insist(digest(old!.result)===digest(result),'publication_conflict');
  const path=join(this.root,key+'.json');if(!existsSync(path))atomic(path,{id:old!.receipt.id,url:old!.receipt.url,digest:digest(result)});
  }
 publishSummary(summary:any,manifestDigest:string):void {
  insist(['SIMULATED','TRIAL'].includes(summary.simulation) && hash(manifestDigest) && hex(summary.candidate) && summary.issue===46 && summary.repository==='sum-integers-trial' && ['accepted_pending_master','needs_human','cancelled','timed_out','cleanup_failed'].includes(summary.state),'summary_identity');
  insist(Array.isArray(summary.attempts) && summary.attempts.length<=6 && Number.isSafeInteger(summary.repairs) && summary.repairs>=0 && summary.repairs<=2,'summary_identity');
  const key=digest({manifestDigest,type:'trial-summary'});
  const body='WorkOrder #46 trial-target summary; not acceptance of the connector.\n'+safe({deliveryKey:key,simulation:summary.simulation,connectorSha:this.binding.connectorSha,candidate:summary.candidate,state:summary.state,attempts:summary.attempts.length,repairs:summary.repairs,accountUsage:'available per-attempt CLI usage remains in local evidence; subscription cost unavailable; no API fallback'});
  const intent=join(this.root,'summary.intent.json'),receipt=join(this.root,'summary.json');
  const lookup=()=>this.transport.list().filter(c=>c.body.startsWith('WorkOrder #46 trial-target summary;') && c.body.includes(key));
  let matches=lookup();
  if(matches.length===0){insist(!existsSync(intent),'tracker_unknown');atomic(intent,{key,digest:digest(body)});try{this.transport.post(body);}catch{}matches=lookup();}
  insist(matches.length===1 && matches[0]!.body===body && matches[0]!.author===this.binding.github.author && matches[0]!.url===`https://github.com/pym96/Pan-agent/issues/46#issuecomment-${matches[0]!.id}`,'publication_conflict');
  if(existsSync(receipt))insist(read(receipt).id===matches[0]!.id,'publication_conflict');
  else atomic(receipt,{key,id:matches[0]!.id,url:matches[0]!.url,digest:digest(body)});
 }
}
