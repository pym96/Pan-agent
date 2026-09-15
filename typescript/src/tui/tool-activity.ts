import { basename } from 'node:path';
import { terminalText } from './presentation.ts';

type Call = { id: string; name: string; label: string; status: 'Running'|'Returned'|'Error' };
/** Display-only state. Retains safe labels and correlation, never raw arguments/results. */
export class ToolActivity {
 readonly calls: Call[] = [];
 private invalid = false;
 private latest?: Call;
 readonly runId: string;
 constructor(runId: string) {this.runId=runId;}
 observe(event: Record<string, unknown>): void {
  if(event.type!=='tool.started'&&event.type!=='tool.settled')return;
  if(event.runId!==this.runId||typeof event.toolCallId!=='string'||!event.toolCallId||typeof event.toolName!=='string'||!event.toolName){this.invalid=true;return;}
  const previous=this.calls.find(call=>call.id===event.toolCallId);
  if(event.type==='tool.started'){
   if(previous){this.invalid=true;return;}
   const name=event.toolName;
   const args=event.arguments;
   const path=args&&typeof args==='object'&&!Array.isArray(args)?(args as Record<string,unknown>).path:undefined;
   const label=['read','write','edit'].includes(name)&&typeof path==='string'&&path.length>0?`${terminalText(name)} · ${terminalText(basename(path))}`:terminalText(name);
   this.calls.push({id:event.toolCallId,name,label,status:'Running'});
  }else{
   if(!previous||previous.name!==event.toolName||previous.status!=='Running'||typeof event.isError!=='boolean'){this.invalid=true;return;}
   previous.status=event.isError?'Error':'Returned';this.latest=previous;
  }
 }
 seal(): void {if(this.calls.some(call=>call.status==='Running'))this.invalid=true;}
 get summary(): string {
  if(this.invalid)return 'Activity unavailable · inconsistent records · View activity';
  const settled=this.calls.filter(call=>call.status!=='Running').length;
  const errors=this.calls.filter(call=>call.status==='Error').length;
  const running=this.calls.find(call=>call.status==='Running');
  return running?`running ${terminalText(running.name)} · ${settled} completed · ${errors} failed · View activity`:`${settled} completed · ${errors} failed · latest ${this.latest?.label??'unavailable'} · View activity`;
 }
 get lines(): string[] {
  if(this.invalid)return ['Activity unavailable · inconsistent records'];
  return this.calls.map((call,i)=>`${i+1}. ${terminalText(call.name)} · ${call.label} · ${call.status}`);
 }
 static replay(records: readonly Record<string,unknown>[],runId:string): ToolActivity {
  const result=new ToolActivity(runId);
  if(records.filter(e=>e.type==='run.started'&&e.runId===runId).length!==1||records.filter(e=>e.type==='run.terminal'&&e.runId===runId).length!==1)result.invalid=true;
  for(const record of records)result.observe(record);
  result.seal();return result;
 }
}
