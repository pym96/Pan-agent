import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { keys, insist, digest, fileDigest, type Manifest, type Attempt } from './model.ts';
import { read } from './storage.ts';

export const responseSchema={type:'object',additionalProperties:false,required:['role','session','inputCandidate','outcome','blockers'],properties:{role:{type:'string',enum:['builder','regulator']},session:{type:'string'},inputCandidate:{type:'string'},outcome:{type:'string',enum:['handoff','accepted','criterion_failed','scope_challenge','quota_unavailable','evidence_incomplete']},blockers:{type:'array',items:{type:'string',enum:['C-SUM-01']}}}};
export function responseShape(x:any,a:Attempt):void {
 keys(x,['role','session','inputCandidate','outcome','blockers']);
 insist(x.role===a.role && x.session===a.session && x.inputCandidate===a.candidate,'codex_result_identity');
 insist((a.role==='builder'?['handoff','scope_challenge','quota_unavailable']:['accepted','criterion_failed','scope_challenge','quota_unavailable','evidence_incomplete']).includes(x.outcome),'codex_result_outcome');
 insist(Array.isArray(x.blockers) && (x.outcome==='criterion_failed'?JSON.stringify(x.blockers)==='["C-SUM-01"]':x.blockers.length===0),'unknown_criterion');
}
// Bounded UTF-8 JSONL adapter; raw event/error/tool text never becomes a public reason.
export class CodexEvents {
 private decoder=new StringDecoder('utf8');private pending='';private bytes=0;private thread:string|null=null;private started=false;private completed=false;private failed=false;private message:string|null=null;private usage:object|null=null;
 push(chunk:Buffer):void {this.bytes+=chunk.length;insist(this.bytes<=16*1024*1024,'codex_output_limit');this.pending+=this.decoder.write(chunk);let n:number;while((n=this.pending.indexOf('\n'))>=0){const line=this.pending.slice(0,n);this.pending=this.pending.slice(n+1);if(line.trim())this.event(JSON.parse(line));}}
 private event(x:any):void {
  insist(x && typeof x.type==='string' && !this.completed,'codex_stream_invalid');
  if(x.type==='thread.started'){insist(this.thread===null && typeof x.thread_id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x.thread_id),'codex_thread_identity');this.thread=x.thread_id;}
  else if(x.type==='turn.started'){insist(this.thread!==null && !this.started,'codex_stream_invalid');this.started=true;}
  else if(x.type==='turn.completed'){
   insist(this.started && !this.failed,'codex_stream_invalid');this.completed=true;
   if(x.usage!==undefined){keys(x.usage,['input_tokens','cached_input_tokens','output_tokens']);for(const n of Object.values(x.usage))insist(Number.isSafeInteger(n) && (n as number)>=0,'codex_usage_invalid');this.usage=x.usage;}
  } else if(x.type==='error'||x.type==='turn.failed'){this.failed=true;}
  else if(['item.started','item.updated','item.completed'].includes(x.type)){
   insist(this.started && x.item && typeof x.item.type==='string','codex_stream_invalid');
   if(x.type==='item.completed' && x.item.type==='agent_message'){insist(typeof x.item.text==='string','codex_stream_invalid');this.message=x.item.text;}
  } else insist(false,'codex_event_unsupported');
 }
 finish(exit:number|null,last:unknown,a:Attempt):{thread:string;usage:object|null} {
  this.pending+=this.decoder.end();if(this.pending.trim())this.event(JSON.parse(this.pending));this.pending='';
  insist(exit===0 && this.completed && !this.failed && this.thread && this.message,'codex_incomplete');
  responseShape(last,a);insist(digest(JSON.parse(this.message!))===digest(last),'codex_final_message_mismatch');
  return {thread:this.thread!,usage:this.usage};
 }
}
export function inspectOutput(dir:string,a:Attempt,exit:number|null):{thread:string;usage:object|null} {
 const events=new CodexEvents();events.push(readFileSync(join(dir,'private-events.jsonl')));return events.finish(exit,read(join(dir,'last-message.json')),a);
}
export function validateConnectorEvidence(m:Manifest,a:Attempt,dir:string):void {
 const r=read(join(dir,'codex-session.json'));keys(r,['thread','requestSession','rawDigest','lastDigest','exit','usage']);
 insist(r.requestSession===a.session && r.exit===0 && r.rawDigest===fileDigest(join(dir,'private-events.jsonl')) && r.lastDigest===fileDigest(join(dir,'last-message.json')),'codex_evidence_changed');
 const observed=inspectOutput(dir,a,r.exit);insist(digest(observed)===digest({thread:r.thread,usage:r.usage}),'codex_session_changed');
 insist(read(join(dir,'evidence.json')).connector===fileDigest(join(dir,'codex-session.json')),'codex_evidence_changed');
}
