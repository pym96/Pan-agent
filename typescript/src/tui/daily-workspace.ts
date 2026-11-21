import { copyOutput } from './copy-output.ts';
import { credentialGuidance } from './credential-guidance.ts';
import { markdownRows, paintMarkdown, type StyledCell } from './markdown.ts';
import { StringDecoder } from 'node:string_decoder';
import type { ReadStream, WriteStream } from 'node:tty';
import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureAttachment, discoverAttachmentPaths, validateAttachmentLimit } from '../input/attachments.ts';
import { prepareAttachedTask, decodeAttachedTask, type AttachmentSnapshot } from '../input/task-envelope.ts';
import type { SessionObservation, TaskRunResult } from '../runtime/session.ts';
import type { SessionProgress } from '../runtime/agent-kernel.ts';
import type { TuiOptions } from './tui.ts';
import { terminalText, attachWorkspace } from './presentation.ts';
import { DailyEditor, clip, clipCells, wrap, graphemes, width } from './daily-editor.ts';
import { FramedInput } from './framed-input.ts';
import { ToolActivity } from './tool-activity.ts';
import type { InputKey } from './terminal-input.ts';
import type { ApprovalRequest, ApprovalDecision, ApprovalChoice } from '../runtime/authorization.ts';

type Focus='composer'|'attachments'|'transcript';
type Entry={role:'You'|'Pan'|'Tool'|'Notice';text:string;status:string};
type Picker={editor:DailyEditor;names:readonly string[];index:number;loading:boolean;capturing:boolean;abort:AbortController};
/** TTY-only projection. Session, capture authority and archive implementation remain external. */
export class DailyWorkspace {
 readonly editor=new DailyEditor();
 phase:'idle'|'running'|'cancelling'|'command'|'closed'='idle';
 focus:Focus='composer'; selected:AttachmentSnapshot[]=[]; chip=0;
 entries:Entry[]=[]; picker?:Picker; overlay?:{title:string;lines:string[];offset:number;focus:Focus;assistantText?:string;copyLines?:()=>readonly string[]};
 safePaste=false; notice='Ready · Operations requiring permission ask before execution';
 approval?:{request:ApprovalRequest;choice:number;choices:ApprovalChoice[];settle:(choice:ApprovalChoice)=>void};
 toolCursor=0;
 private readonly activities=new Map<Entry,ToolActivity>();
 private activityEntry?:Entry;
 private activityView?:ToolActivity;
 private copyReceipt?:{lines:string[];offset:number};
 private lastCopyFile?:string;
 readonly history:string[]=[];historyIndex?:number;private stash?:{text:string;caret:number;selected:AttachmentSnapshot[];chip:number};
 runId='none';
 private committed=0;
 private modal=false;
 private active?:Entry;private closing=false;private turnText='';
 private readonly input:ReadStream;private readonly output:WriteStream;
 private barrier=false;private readonly raw:boolean;
 private replaying=false;
 private done!:()=>void;readonly closed=new Promise<void>(resolve=>{this.done=resolve;});
 private readonly limit:number;private readonly color:boolean;
 private readonly options:TuiOptions;
 private readonly decoder=new StringDecoder("utf8");
 constructor(options:TuiOptions) {
  this.options=options;
  this.input=(options.input??process.stdin) as ReadStream;this.output=(options.output??process.stdout) as WriteStream;this.raw=this.input.isRaw===true;
  this.limit=validateAttachmentLimit(options.maxAttachmentBytes);this.color=process.env.NO_COLOR===undefined && process.env.TERM!=='dumb';
  options.presentation!.attach(line=>{if(this.replaying)return;if(this.overlay)this.overlay.lines.push(line);else this.notice=line;this.draw();});
  attachWorkspace(options.presentation!,{observe:e=>this.observe(e),progress:e=>this.progress(e),settle:r=>this.settle(r)});
  options.session.setApprovalChannel?.((request,signal)=>this.requestApproval(request,signal));
 }
 private requestApproval(request:ApprovalRequest,signal:AbortSignal):Promise<ApprovalDecision>{
  if(this.closing||this.phase==='cancelling'||signal.aborted)return Promise.resolve({requestId:request.requestId,decision:'deny'});
  this.copyReceipt=undefined;const previous=this.overlay,focus=this.focus;
  const choices:ApprovalChoice[]=request.tool==='bash'&&request.reason!=='sandbox_fixed_container'&&request.reason!=='host_fallback_operation'?['deny','allow-once','trust-shell']:['deny','allow-once'];
  this.overlay={title:'Approval required',lines:['Choices: Deny / Allow once',...(request.tool==='bash'&&request.reason!=='sandbox_fixed_container'&&request.reason!=='host_fallback_operation'?['Or: Trust shell for this session']:[]),`Tool: ${terminalText(request.tool)}`,`Workspace: ${terminalText(request.workspace)}`,`Reason: ${request.reason}`,'Operation / target (scroll to inspect all):',terminalText(request.target),...request.metadata,`Request: ${request.requestId}`,...(request.tool==='bash'&&request.reason==='shell_host_authority'?['Shell has host-user file/process/network authority, including protected and outside-workspace resources. Session trust applies ONLY to Shell; :trust off revokes it.']:[]),'End of operation details'],offset:0,focus};
  return new Promise(resolve=>{
   let settled=false;
   const settle=(decision:ApprovalChoice)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);this.approval=undefined;this.overlay=previous;this.focus=focus;this.barrier=true;resolve({requestId:request.requestId,decision});this.draw();};
   const abort=()=>settle('deny');this.approval={request,choice:0,choices,settle};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();this.draw();
  });
 }
 start():void {this.input.setRawMode(true);this.output.write('\x1b[?2004h\x1b[?25h\r'+this.header()+'\r\n'+this.intro().join('\r\n')+'\r\n');this.input.on('data',this.data);this.input.on('end',this.end);this.output.on('resize',this.resize);this.input.resume();this.draw();}
 dispose():void {this.picker?.abort.abort();this.input.off('data',this.data);this.input.off('end',this.end);this.output.off('resize',this.resize);this.input.setRawMode(this.raw);this.input.pause();this.output.write(this.primaryLine()+this.commitTranscript()+'\x1b[0m\x1b[?2004l\x1b[?25h');if(this.lastCopyFile)this.output.write(`Last copied text file: ${terminalText(this.lastCopyFile)}\n`);this.output.write(`Pan closed · Run ${terminalText(this.runId)} · Archives ${terminalText(this.options.archiveStore?.root??'not configured')}\n`);}
 private readonly resize=()=>this.draw();
 exitCode = 0;
 readonly interruptAndExit = () => {
  this.exitCode = 130;
  this.end();
 };
 private readonly end=()=>{
  this.closing=true;
  if(this.options.executionMode==='trusted-local')this.options.session.stopAcceptingTasks();
  if(this.phase==='running'||this.phase==='cancelling')this.cancel();else this.finish();
 };
 private finish():void {this.phase='closed';this.picker?.abort.abort();this.done();}
 private readonly parser=new FramedInput(event=>{
  if(event.type==='key')this.key(event.text,event.key);
  else if(event.type==='paste-start'){if(!this.approval&&!this.copyReceipt){this.closePicker(false);this.overlay=undefined;}}
  else {if(this.approval||this.copyReceipt)return;this.editor.insert(event.text);this.focus='composer';this.notice='Pasted draft · Not submitted';this.draw();}
 });
 get inputState(){return this.parser.state;}
 private readonly data=(data:Buffer|string):void=>{
  this.barrier=false;const before=this.inputState;this.parser.feed(typeof data==='string'?data:this.decoder.write(data));const after=this.inputState;
  if(before.pending!==after.pending||(before.mode==='paste')!==(after.mode==='paste'))this.draw();
 };
 private restoreHistory():void {
  if(this.stash){this.editor.text=this.stash.text;this.editor.caret=this.stash.caret;this.selected=this.stash.selected;this.chip=this.stash.chip;}
  this.stash=undefined;this.historyIndex=undefined;this.notice='Not submitted · draft restored';
 }
 private recall(delta:number):void {
  if(!this.history.length)return;
  if(this.historyIndex===undefined){if(delta>0)return;this.stash={text:this.editor.text,caret:this.editor.caret,selected:this.selected,chip:this.chip};this.historyIndex=this.history.length;}
  const next=Math.max(0,this.historyIndex+delta);if(next>=this.history.length){this.restoreHistory();return;}
  this.historyIndex=next;this.editor.text=this.history[next]!;this.editor.caret=delta<0?0:this.editor.text.length;this.selected=[];this.chip=0;this.notice='History draft — not submitted';
 }
 private supported():boolean{return (this.output.columns??80)>=40&&(this.output.rows??24)>=12;}
 private cancel():void {
  if(this.phase!=='running')return;
  this.phase='cancelling';
  this.options.session.cancel();
  this.approval?.settle('deny');
  this.closePicker(false);
  this.overlay=undefined;
  this.notice='Cancelling · Ctrl-C to exit';
  this.draw();
 }
 private cycle(reverse=false):void {const choices:Focus[]=['composer',...(this.selected.length?['attachments' as const]:[]),...(this.entries.length?['transcript' as const]:[])];const i=choices.indexOf(this.focus);this.focus=choices[(i+(reverse?-1:1)+choices.length)%choices.length]!;this.draw();}
 private activityOverlay():void {const entry=this.entries.filter(e=>this.activities.has(e))[this.toolCursor];const a=entry&&this.activities.get(entry);if(!a)return;this.activityView=a;this.overlay={title:'Tool activity · view only',lines:a.lines,copyLines:()=>a.copyLines,offset:0,focus:this.focus};this.draw();}
 private updateActivity():void {const entry=this.activityEntry,a=entry&&this.activities.get(entry);if(!a||!entry)return;entry.text=a.summary;if(this.overlay?.title==='Tool activity · view only'&&this.activityView===a)this.overlay.lines=a.lines;}
 private matches():readonly string[]{return this.picker?.names.filter(n=>n.includes(this.picker!.editor.text))??[];}
 private openPicker():void {const p:Picker={editor:new DailyEditor(),names:[],index:0,loading:true,capturing:false,abort:new AbortController()};this.picker=p;this.draw();void discoverAttachmentPaths(this.options.workspace).then(names=>{if(this.picker!==p)return;p.names=names;p.loading=false;this.draw();},()=>{if(this.picker!==p)return;this.picker=undefined;this.notice='Attachment discovery failed · draft retained';this.draw();});}
 private closePicker(literal:boolean):void {const p=this.picker;if(!p)return;this.picker=undefined;p.abort.abort();if(literal)this.editor.insert('@'+p.editor.text);this.notice='Not submitted · picker closed';this.draw();}
 private select():void {const p=this.picker;if(!p||p.loading||p.capturing)return;const path=this.matches()[p.index];if(path===undefined)return;this.barrier=true;if(this.selected.some(s=>s.path===path)){this.closePicker(false);this.notice='Already selected · Not submitted';return;}
  p.capturing=true;this.draw();void captureAttachment(this.options.workspace,path,this.limit-this.selected.reduce((n,s)=>n+s.bytes,0),p.abort.signal).then(snapshot=>{if(this.picker!==p)return;this.selected.push(snapshot);this.picker=undefined;this.focus='composer';this.notice='Attached · Not submitted · Enter Send';this.draw();},()=>{if(this.picker!==p)return;this.picker=undefined;this.notice='Attachment capture denied · draft retained';this.draw();});
 }
 private preview():void {const item=this.selected[this.chip]??this.selected.at(-1);if(!item){this.notice='No attachments selected';this.draw();return;}this.overlay={title:'Snapshot preview · Not submitted',lines:[terminalText(item.path),`${item.bytes} bytes`,`SHA-256 ${item.sha256}`,'Send includes this snapshot as user data and stores it in the Run Archive.',...item.text.split('\n').map(s=>'│ '+terminalText(s))],copyLines:()=>[item.path,`${item.bytes} bytes`,'SHA-256 '+item.sha256,item.text],offset:0,focus:this.focus};this.draw();}
 private remove():void {this.selected.splice(this.chip,1);this.chip=Math.min(this.chip,Math.max(0,this.selected.length-1));if(!this.selected.length)this.focus='composer';this.notice='Not submitted · attachment removed';this.draw();}
 private intro():string[] {return ['Write a task. Ctrl-Y copies output; :help lists commands. @ opens files; Tab attaches; Enter sends.','Provider: '+terminalText(this.options.provider),'Workspace: '+terminalText(this.options.workspace),this.options.executionMode?.startsWith('native-')?`NATIVE ${this.options.executionMode.startsWith('native-linux')?'LINUX':'MACOS'} SANDBOX · shared workspace · ${this.options.executionMode.endsWith('offline')?'offline':'bounded HTTP(S) GET'} · retrieval disabled`:this.options.executionMode==='sandbox'?'DOCKER SANDBOX · offline container · retrieval disabled':'Host-user tools; Ctrl-D revokes this host session and exits.',this.options.executionMode?.startsWith('native-')?'Each task verifies its backend before the model runs. Sensitive/outside files are denied.':'Protected/outside/uncertain files and Shell ask before execution.',...(this.options.reportNotice?[this.options.reportNotice]:[])];}
 private copyView():void {
  let lines:string[];
  if(this.overlay){
   const view=this.overlay;
   lines=[view.title,...(view.copyLines?.()??view.lines)];
   if(view.assistantText!==undefined)lines.push(view.assistantText);
  }else if(this.picker){
   lines=['File picker',...this.matches()];
  }else{
   lines=this.entries.map(entry=>{
    const activity=this.activities.get(entry);
    const content=activity?[entry.text,...activity.copyLines].join('\n'):entry.text;
    return [entry.role+(entry.status?' · '+entry.status:''),content].join('\n');
   });
   if(!lines.length)lines=this.intro();
   lines.push(this.notice);
  }
  const receipt=copyOutput(lines.join(this.overlay||this.picker?'\n':'\n\n'),control=>this.output.write(control));
  if(receipt.file)this.lastCopyFile=receipt.file;
  this.copyReceipt={lines:receipt.lines.map(terminalText),offset:0};
  this.draw();
 }
 key(text:string|undefined,key:InputKey={}):void {
  if(this.closing||this.phase==='closed')return;
  const enter=key.name==='return'||key.name==='enter';
  if((enter||key.name==='tab')&&this.barrier)return;
  if(key.ctrl&&key.name==='d'){this.end();return;}
  if(key.ctrl&&key.name==='c'){
   if(this.phase==='running'){this.cancel();return;}
   this.interruptAndExit();return;
  }
  if(this.copyReceipt){
   if(enter||key.ctrl&&key.name==='g'){this.copyReceipt=undefined;this.barrier=true;}
   else if(key.name==='up'||key.name==='pageup')this.copyReceipt.offset=Math.max(0,this.copyReceipt.offset-1);
   else if(key.name==='down'||key.name==='pagedown')this.copyReceipt.offset++;
   this.draw();return;
  }
  if(key.ctrl&&key.name==='y'){this.copyView();return;}
  if(this.approval){const p=this.approval;
   if(key.ctrl&&key.name==='g'){p.settle('deny');return;}
   if(enter){p.settle(p.choices[p.choice]!);return;}
   if(key.name==='up'||key.name==='left')p.choice=Math.max(0,p.choice-1);
   else if(key.name==='down'||key.name==='right')p.choice=Math.min(p.choices.length-1,p.choice+1);
   else if(this.overlay&&(key.name==='pageup'||key.name==='pagedown'))this.overlay.offset=Math.max(0,this.overlay.offset+(key.name==='pageup'?-5:5));
   this.draw();return;
  }
  if(key.ctrl&&key.name==='v'&&!this.picker&&!this.overlay){this.safePaste=!this.safePaste;this.focus='composer';this.draw();return;}
  if(this.overlay){if(enter||key.ctrl&&key.name==='g'){this.focus=this.overlay.focus;this.overlay=undefined;this.barrier=true;}else if(key.name==='up'||key.name==='pageup')this.overlay.offset=Math.max(0,this.overlay.offset-(key.name==='up'?1:5));else if(key.name==='down'||key.name==='pagedown')this.overlay.offset=Math.min(Math.max(0,this.overlay.lines.length-1),this.overlay.offset+(key.name==='down'?1:5));this.draw();return;}
  if(this.picker){const p=this.picker;if(key.ctrl&&key.name==='g'){this.closePicker(true);return;}if(enter){this.notice='Tab Attach · Ctrl-G Back';this.draw();return;}if(p.capturing)return;if(key.name==='tab'&&!key.shift){this.select();return;}
   if(key.name==='up'||key.name==='tab'&&key.shift)p.index=Math.max(0,p.index-1);else if(key.name==='down')p.index=Math.min(Math.max(0,this.matches().length-1),p.index+1);else if(key.name==='left')p.editor.move(-1);else if(key.name==='right')p.editor.move(1);else if(key.name==='backspace'){p.editor.backspace();p.index=0;}else if(this.printable(text,key)){p.editor.insert(text!);p.index=0;}this.draw();return;}
  if(key.ctrl&&key.name==='g'){if(this.historyIndex!==undefined)this.restoreHistory();this.focus='composer';this.safePaste=false;this.draw();return;}
  if(key.name==='tab'){this.cycle(key.shift);return;}
  if(key.ctrl&&key.name==='p'){this.preview();return;}if(key.ctrl&&key.name==='r'){if(this.selected.length){this.chip=this.selected.length-1;this.remove();}return;}
  if(this.focus!=='composer'){
   if(enter){if(this.focus==='attachments')this.preview();else if(this.entries.some(e=>this.activities.has(e)))this.activityOverlay();else void this.command(':details');this.barrier=true;}
   else if(key.name==='backspace'&&this.focus==='attachments')this.remove();
   else if(key.name==='up'||key.name==='down'){
    const delta=key.name==='up'?-1:1;
    if(this.focus==='attachments')this.chip=Math.max(0,Math.min(this.selected.length-1,this.chip+delta));
    else {const tools=this.entries.filter(e=>e.role==='Tool');this.toolCursor=Math.max(0,Math.min(tools.length-1,this.toolCursor+delta));}
   }
   this.draw();return;
  }
  if(enter){if(key.meta||this.safePaste){this.editor.insert('\n');this.draw();return;}this.send();return;}
  if(text==='@'&&!this.safePaste&&!key.meta&&!key.ctrl&&/(?:^|\s)$/.test(this.editor.text.slice(0,this.editor.caret))){this.openPicker();return;}
  if(key.name==='left')this.editor.move(-1);else if(key.name==='right')this.editor.move(1);else if(key.name==='up'||key.name==='down'){const delta=key.name==='up'?-1:1;if(!this.editor.vertical(delta,Math.max(1,(this.output.columns??80)-3)))this.recall(delta);}else if(key.name==='backspace')this.editor.backspace();else if(key.ctrl&&key.name==='u')this.editor.clear();else if(key.name==='home'||key.ctrl&&key.name==='a')this.editor.caret=0;else if(key.name==='end'||key.ctrl&&key.name==='e')this.editor.caret=this.editor.text.length;else if(this.printable(text,key))this.editor.insert(text!);this.draw();
 }
 private printable(text:string|undefined,key:InputKey):boolean{return !!text&&!key.ctrl&&!key.meta&&!/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(text)&&(!key.name||key.name==='space'||Array.from(key.name).length===1);}
 private send():void {
  if(!this.supported()){this.notice='Resize terminal · Not submitted';this.draw();return;}
  if(['running','cancelling','command'].includes(this.phase)){this.notice='Busy — draft retained';this.draw();return;}
  const text=this.editor.text;
  if(!text.trim()){this.notice='Write a task · Not submitted';this.draw();return;}
  this.barrier=true;
  // Pasted multiline colon text is a task on explicit send, never a command script.
  if(text.trim().startsWith(':')&&!text.includes('\n')){this.editor.clear();void this.command(text.trim());return;}
  let prepared:string;try{prepared=prepareAttachedTask(text,this.selected);}catch{this.notice='Task preparation denied · draft retained';this.draw();return;}
  const before={text:this.editor.text,caret:this.editor.caret,selected:this.selected,chip:this.chip},admitted=this.history.length;
  this.editor.clear();this.selected=[];this.chip=0;this.phase='running';this.notice='Running · next draft is not submitted';this.draw();
  void this.options.session.runTask(prepared).then(result=>this.options.presentation!.settle(result),error=>{if(this.history.length===admitted){this.editor.text=before.text;this.editor.caret=before.caret;this.selected=before.selected;this.chip=before.chip;}if(this.active){this.active.status='Partial response · local failure';this.active.text=error instanceof Error?error.message:String(error);this.active=undefined;}this.notice='Local error · inspect the diagnostic';}).finally(()=>{if(this.closing)this.finish();else{this.phase='idle';this.draw();}});
 }
 private async command(text:string):Promise<void> {
  if(text===':copy'){this.copyView();return;}
  if(text===':exit'){this.end();return;}
  if(text===':preview'||text===':attachments'){this.preview();return;}
  const focus=this.focus;this.overlay={title:'View only · '+text.split(' ')[0],lines:[],offset:0,focus};
  try{
   if(text===':fallback'||text.startsWith(':fallback ')){
    const choice=text.slice(10);
    this.overlay.lines.push(this.options.fallback?.choose(choice)??'Fallback unavailable for this execution mode.');
   }
   else if(text===':trust off'){this.options.session.revokeShellTrust();this.overlay.lines.push('Shell session trust revoked. Next command requires Allow once.');}
   else if(text===':details'){const lines:string[]=[];this.overlay.copyLines=()=>lines;this.options.presentation!.details(line=>lines.push(line));if(focus==='transcript'){const tool=this.entries.filter(e=>e.role==='Tool')[this.toolCursor];if(tool)this.overlay.offset=Math.max(0,this.overlay.lines.findIndex(line=>line.includes(tool.text)));}}
   else if(text===':help')this.overlay.lines.push('Public GitHub overview: /repo https://github.com/OWNER/REPO (read-only).','After native setup is unavailable: :fallback cancel / once / task; select a scope and submit a new task. Each host action needs approval.','Enter sends an idle nonblank draft; busy Enter never queues.','Alt-Enter: newline. Ctrl-V: safe paste/edit mode; Ctrl-G exits it.','@ file picker; arrows choose; Tab attaches; Enter only hints; Ctrl-P preview; Ctrl-R remove.','Drag to select text. Ctrl-Y copies the full transcript or current view (including retained tool output). :copy also works from the composer.','Use the terminal scrollbar or wheel to read earlier conversation. Up/Down: prompt history at draft edges.','Compatibility: raw Esc reserves a frame prefix, never Back. Ctrl-G backs out; pending tails drain before raw typing resumes. Paste enters literal data.','Ctrl-C exits while idle, including pickers and views. During a task Ctrl-C cancels, then Ctrl-C exits. Ctrl-D exits even with pending input; :exit quits. :details / :runs / :replay ID are view only.');
   else if(text===':context')this.overlay.lines.push(`Context messages ${this.options.session.contextMessageCount}`);
   else if(text===':runs'){const store=this.options.archiveStore;if(!store)this.overlay.lines.push('Archives not configured');else{const entries=await readdir(join(store.root,'runs'),{withFileTypes:true});this.overlay.lines.push('Archived records · view only');if(!entries.length)this.overlay.lines.push('No submitted run yet');for(const e of entries)if(e.isDirectory()&&/^[A-Za-z0-9_-]+$/.test(e.name))this.overlay.lines.push(terminalText(e.name));}}
   else if(text.startsWith(':replay ')){const id=text.slice(8).trim(),store=this.options.archiveStore;if(!store||!/^[A-Za-z0-9_-]+$/.test(id))throw Error();const dir=join(store.root,'runs',id);if(!(await lstat(dir)).isDirectory())throw Error();for(const f of ['manifest.json','events.jsonl'])if(!(await lstat(join(dir,f))).isFile())throw Error();const records=await store.readArchive(id);this.replaying=true;try{this.options.presentation!.replay(records,id);}finally{this.replaying=false;}const activity=ToolActivity.replay(records,id);this.overlay.lines=['REPLAY · view only',activity.summary,...activity.lines];this.overlay.copyLines=()=>['REPLAY · view only',activity.summary,...activity.copyLines,...(final?['Final response']:[])];const final=records.filter(e=>(e.type==='model.turn_settled'||e.type==='repository.overview')&&typeof e.text==='string').at(-1);if(final){this.overlay.lines.push('Final response');this.overlay.assistantText=String(final.text);}}
   else this.overlay.lines.push('Unknown command · no execution');
  }catch{if(this.overlay)this.overlay.lines.push('Archive unavailable · no execution');}this.draw();
 }
 private observe(event:SessionObservation):void {
  if(event.type==='run.started'){this.runId=event.runId;const decoded=decodeAttachedTask(event.task);this.history.push(decoded?.prompt??event.task);if(this.historyIndex!==undefined)this.restoreHistory();this.entries.push({role:'You',text:decoded?.prompt??event.task,status:decoded?`${decoded.attachments.length} attached snapshot(s)`:''});this.active={role:'Pan',text:'',status:event.taskKind==='repository_overview'?'Reading public repository':'Waiting for model'};this.entries.push(this.active);}
  if(event.type==='model.turn_started'){this.turnText='';if(this.active){this.active.text='';this.active.status='Responding · provisional';}}
  if(event.type==='model.turn_settled'&&this.active){if(!event.failure)this.active.text=event.text;this.active.status=event.failure?'Partial response':'Response received · provisional';const hint=credentialGuidance(event.failure,this.options.provider,this.options.credentialSource);if(hint){this.entries.push({role:'Notice',status:'Configuration required',text:hint});}}
  if(event.type==='tool.started'&&event.runId===this.runId){if(!this.activityEntry||this.activities.get(this.activityEntry)?.runId!==event.runId){const entry:Entry={role:'Tool',text:'',status:'Activity'};this.entries.push(entry);this.activityEntry=entry;this.activities.set(entry,new ToolActivity(event.runId));}this.activities.get(this.activityEntry)!.observe(event);this.updateActivity();}
  if(event.type==='tool.settled'&&this.activityEntry&&this.activities.get(this.activityEntry)?.runId===event.runId){this.activities.get(this.activityEntry)!.observe(event);this.updateActivity();}
  this.draw();
 }
 private progress(event:SessionProgress):void {if(!this.active)return;this.turnText+=event.text;this.active.text=this.turnText;this.draw();}
 private settle(result:TaskRunResult):void {
  if(result.status!=='completed' && result.toolCalls>0){
   this.entries.push({role:'Notice',status:'Check prior effects',text:`${result.toolCalls} admitted tool call(s). Inspect :replay ${result.runId} and the workspace before submitting another task. Pan has not retried these actions.`});
  }
  if(this.active){if(result.finalText)this.active.text=result.finalText;this.active.status=result.status==='completed'?'Completed':`Partial response · ${terminalText(result.status)}`;this.active=undefined;}this.notice=result.status==='completed'?'Completed · next draft Not submitted':`Partial response · ${terminalText(result.status)}`;this.draw();}
 private chips():string[]{return this.selected.map((item,i)=>{const parts=item.path.split('/');let n=1;while(n<parts.length&&this.selected.some((other,j)=>j!==i&&other.path.split('/').slice(-n).join('/')===parts.slice(-n).join('/')))n++;return `${this.focus==='attachments'&&i===this.chip?'>':''}[${terminalText(parts.slice(-n).join('/'))}]`;});}
 private primaryLine():string {
  const restore=this.modal?'\x1b[?1049l':'';
  this.modal=false;
  return restore+'\r\x1b[2K';
 }
 private header():string {
  const host=this.options.executionMode==='trusted-local'?' · HOST (trusted-local)':'';
  const mode=this.options.fallback?.status||(this.options.executionMode?.startsWith('native-')?(this.options.executionMode.endsWith('offline')?'Native offline':'Native GET'):'');
  return ['Pan · Compat'+host,this.options.sessionTaskLabel,this.options.sessionNpmTest?'NPM TEST':'',this.options.sessionAuto?'SESSION AUTO':'',mode,terminalText(this.options.model)].filter(Boolean).join(' · ');
 }
 private commitTranscript():string {
  const lines:string[]=[];
  while(this.committed<this.entries.length){
   const entry=this.entries[this.committed]!;
   if(entry===this.active)break;
   const role=this.activities.has(entry)?'Tools':entry.role;
   lines.push(`${role} · ${entry.status}`);
   // The terminal wraps logical lines and reflows them when the window changes.
   if(entry.role==='Pan'){
    for(const row of markdownRows(entry.text,Infinity))lines.push('│ '+paintMarkdown(row.cells,Infinity,this.color).text);
   }else if(this.activities.has(entry))lines.push('│ '+entry.text);
   else for(const line of entry.text.split('\n'))lines.push('│ '+terminalText(line));
   this.committed++;
  }
  return lines.length?lines.join('\r\n')+'\r\n':'';
 }
 private drawConversation(columns:number, view:ReturnType<DailyEditor['visual']>):void {
  const current=view.lines[view.row]??'';
  const prompt='> '+current;
  const state=`  · ${this.focus} · ${this.phase} · `;
  let info=this.notice;
  if(!this.supported())info='Pan · Resize terminal (min 40 x 12)';
  else if(this.inputState.pending)info=this.inputState.mode==='paste'?'Pasting · literal data':'Input sequence pending · Ctrl-G Back';
  else if(this.focus==='attachments')info=this.chips().join(' ')+' · Enter Preview';
  else if(this.focus==='transcript'){
   const tools=this.entries.filter(e=>e.role==='Tool');
   info=tools.length?`Tool activity ${this.toolCursor+1}/${tools.length} · Enter to inspect`:'Enter: Run details';
  }else if(this.active){
   const activity=this.activityEntry&&this.activities.get(this.activityEntry);
   // The model may replace a provisional turn. Only settled output enters
   // scrollback; show the tail of the current line as deltas arrive.
   const response=this.active.text.trimEnd();
   if(this.phase==='cancelling')info=this.notice;
   else if(response){
    const lastLine=response.slice(Math.max(response.lastIndexOf('\n')+1,response.length-columns*4));
    const tail=graphemes(terminalText(lastLine));
    let available=columns-clipCells(prompt+state+'Pan · ',columns).used;
    let start=tail.length;
    while(start>0&&width(tail[start-1]!)<=available)available-=width(tail[--start]!);
    info='Pan · '+tail.slice(start).join('');
   }else info=activity?.runId===this.runId?activity.summary:this.active.status;
  }else if(this.historyIndex!==undefined)info='History draft — not submitted';
  else if(current)info='Not submitted · Enter Send';
  const prefix=this.primaryLine()+this.commitTranscript();
  const chips=this.selected.length?' '+this.chips().join(' '):'';
  const line=clip(this.supported()?prompt+state+info+chips:info,columns);
  const column=Math.min(columns-1,view.col+2);
  this.output.write(prefix+line+'\r'+(column?`\x1b[${column}C`:'')+'\x1b[?25h');
 }
 draw():void {
  if(this.phase==='closed')return;
  const w=Math.max(1,this.output.columns??80),h=Math.max(1,this.output.rows??24);
  const view=this.editor.visual(Math.max(1,w-3));
  if(!this.overlay&&!this.copyReceipt&&!this.picker&&!this.safePaste&&!this.editor.text.includes('\n')){
   this.drawConversation(w,view);return;
  }
  // Temporary, potentially sensitive views occupy a separate buffer. The
  // primary line and its terminal-owned scrollback survive opening and resize.
  const enter=this.modal?'':'\r\x1b[2K\x1b[?1049h';
  this.modal=true;
  const composer=Math.min(view.lines.length,Math.max(1,Math.floor(h/3)));
  const rows:{text:string;kind?:string;cells?:StyledCell[]}[]=[];
  let cursor={row:0,col:0};
  if(!this.supported())rows.push({text:'Pan · Resize terminal (min 40 x 12)'});
  else {
   rows.push({text:this.header()+' · '+(this.overlay?'preview':this.picker?'picker':'composer')+' · '+this.phase});
   const matches=this.matches(),p=this.picker;const pickerRows=p?Math.min(7,Math.max(3,h-5-composer-1)):0;const bodyRows=h-5-composer-pickerRows;
   let body:{text:string;kind?:string;cells?:StyledCell[]}[]=[];
   if(this.copyReceipt){
    const receipt=this.copyReceipt,lines=['Copy output',...receipt.lines].flatMap(line=>wrap(line,w-3));
    receipt.offset=Math.min(receipt.offset,Math.max(0,lines.length-bodyRows));
    body=lines.slice(receipt.offset,receipt.offset+bodyRows).map(text=>({text}));
   }else if(this.overlay){const lines:{text:string;cells?:StyledCell[]}[]=[this.overlay.title,...this.overlay.lines].flatMap(s=>wrap(s,w-3).map(t=>({text:'│ '+t})));if(this.overlay.assistantText!==undefined)for(const r of markdownRows(this.overlay.assistantText,w-3))lines.push({text:'│ '+r.text,cells:[{text:'│'},{text:' '},...r.cells]});this.overlay.offset=Math.min(this.overlay.offset,Math.max(0,lines.length-bodyRows));body=lines.slice(this.overlay.offset,this.overlay.offset+bodyRows);}
   rows.push(...body.slice(-bodyRows));
   if(p){const safe=terminalText(p.editor.text),before=terminalText(p.editor.text.slice(0,p.editor.caret));const col=graphemes(before).reduce((n,g)=>n+width(g),0);const start=Math.max(0,col-(w-5));let off=0,skipped=0;const visible=graphemes(safe).filter(g=>{const n=off;off+=width(g);if(n<start){skipped=off;return false;}return true;}).join('');rows.push({text:`File ${p.capturing?'Capturing':p.loading?'Loading':`${matches.length? p.index+1:0}/${matches.length}`} · Tab Attach · Ctrl-G Back`});cursor={row:rows.length,col:Math.min(w-1,2+col-skipped)};rows.push({text:'@ '+visible,kind:'focus'});const count=pickerRows-2;const begin=Math.max(0,p.index-count+1);for(let i=0;i<count;i++){const index=begin+i;rows.push({text:matches[index]===undefined?'':`${index===p.index?'>':' '} ${terminalText(matches[index]!)}`,kind:index===p.index?'focus':undefined});}}
   rows.push({text:'─'.repeat(w),kind:'secondary'});
   const chips=this.chips();let chipText=chips.join(' ');if(this.focus==='attachments')chipText=chips.slice(this.chip).join(' ');rows.push({text:chipText?clip(chipText,w-1)+(graphemes(chipText).reduce((n,g)=>n+width(g),0)>w-1?'…':''):'No attachments',kind:this.focus==='attachments'?'focus':'secondary'});
   const busy=this.phase==='running'||this.phase==='cancelling';rows.push({text:this.approval?'Selected: '+({'deny':'Deny','allow-once':'Allow once','trust-shell':'Trust shell for this session'}[this.approval.choices[this.approval.choice]!]):busy?(this.phase==='cancelling'?'Cancelling · Ctrl-C to exit':'Busy — draft retained · Ctrl-C cancel'):this.historyIndex!==undefined?'History draft — not submitted':this.safePaste?'SAFE PASTE / EDIT · Ctrl-G exits; then Enter Send':this.editor.text.trim()?'Not submitted · Enter Send':'Not submitted · Write a task',kind:'secondary'});
   const start=Math.max(0,view.row-composer+1);const editorRow=rows.length;for(let i=0;i<composer;i++)rows.push({text:(i===0?'> ':'  ')+(view.lines[start+i]??''),kind:this.focus==='composer'?'focus':undefined});
   if(!p)cursor={row:editorRow+view.row-start,col:2+view.col};
   rows.push({text:this.copyReceipt?'Enter/Ctrl-G Back · Up/Down Scroll':this.approval?'Arrows choose · Enter confirm · PgUp/Dn scroll · Ctrl-G Deny · Ctrl-C Cancel':this.inputState.pending?(this.inputState.mode==='paste'?'Pasting · literal data':'Input sequence pending · Ctrl-G Back'):this.overlay?'Enter/Ctrl-G Close · Up/Down Scroll · Ctrl-Y Copy view':p?'Tab Attach · Ctrl-G Back · Enter Hint':this.safePaste?'SAFE PASTE: Enter newline · Ctrl-G exits':this.focus==='attachments'?'Enter Preview · Backspace Remove · Tab Focus':/:exit|denied|failed|Already selected|^Partial response|^Completed/.test(this.notice)?this.notice:'Ctrl-C Quit · Ctrl-Y Copy · Ctrl-G Back · @ Files · Ctrl-V Paste',kind:'secondary'});
  }
  let frame=enter+'\x1b[?25l\x1b[H\x1b[J';
  for(const [i,row] of rows.slice(0,h).entries()){
   const style=!this.color?'':row.kind==='focus'?'\x1b[38;2;0;215;215m':row.kind==='secondary'?'\x1b[38;2;155;155;155m':'';
   frame+=`\x1b[${i+1};1H`+style+(row.cells?paintMarkdown(row.cells,w,this.color).text:clip(row.text,w))+'\x1b[0m';
  }
  this.output.write(frame+`\x1b[${Math.min(h,cursor.row+1)};${Math.min(w,cursor.col+1)}H\x1b[?25h`);
 }
}
export async function runDailyWorkspace(options:TuiOptions):Promise<number>{
 const ui=new DailyWorkspace(options);
 process.on('SIGINT',ui.interruptAndExit);
 try {
  try { ui.start(); await ui.closed; }
  finally { ui.dispose(); await options.session.close(); }
  return ui.exitCode;
 } finally { process.off('SIGINT',ui.interruptAndExit); }
}
