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
import { DailyEditor, clip, clipCells, wrap, graphemes, width, sourceRows } from './daily-editor.ts';
import { scrollbarGeometry, scrollbarDragTop, scrollbarCapturedDragTop, type ScrollbarGeometry } from './scrollbar.ts';
import { FramedInput } from './framed-input.ts';
import type { InputKey } from './terminal-input.ts';

type Focus='composer'|'attachments'|'transcript';
type Entry={role:'You'|'Pan'|'Tool';text:string;status:string};
type Anchor={item:number;part:'header'|'text';offset:number};
type ContentRow={text:string;kind:string;anchor:Anchor;end:number};
type Picker={editor:DailyEditor;names:readonly string[];index:number;loading:boolean;capturing:boolean;abort:AbortController};
/** TTY-only projection. Session, capture authority and archive implementation remain external. */
export class DailyWorkspace {
 readonly editor=new DailyEditor();
 phase:'confirm'|'idle'|'running'|'cancelling'|'command'|'closed'='confirm';
 focus:Focus='composer'; selected:AttachmentSnapshot[]=[]; chip=0;
 entries:Entry[]=[]; picker?:Picker; overlay?:{title:string;lines:string[];offset:number;focus:Focus};
 safePaste=false; notice='Confirm provider and trusted-local workspace: type y then Enter';
 toolCursor=0; private revealTool=false;
 anchor?:Anchor;private contentRows:ContentRow[]=[];private bodyHeight=0;
 // #60 Criteria 1.1 pointer capture: only an in-track primary press starts it.
 private dragging=false;
 private grabOffset=0;
 // #62 viewport-bounded layout: per-entry wrap cache keyed by width and per-entry stamps.
 private layoutWidth=0;private layoutRows:ContentRow[]=[];private layoutStarts:number[]=[];private layoutStamps:number[]=[];private entryStamps:number[]=[];private layoutClock=0;
 /** Structural instrumentation for the deterministic scroll harness. */
 readonly layoutStats={builds:0,sourceRowVisits:0};
 readonly history:string[]=[];historyIndex?:number;private stash?:{text:string;caret:number;selected:AttachmentSnapshot[];chip:number};
 top=0; follow=true; newOutput=false; runId='none';
 private active?:Entry;private activeIndex=-1;private closing=false;private turnText='';
 private readonly input:ReadStream;private readonly output:WriteStream;
 private barrier=false;private readonly raw:boolean;
 private done!:()=>void;readonly closed=new Promise<void>(resolve=>{this.done=resolve;});
 private readonly limit:number;private readonly color:boolean;
 private readonly options:TuiOptions;
 private readonly decoder=new StringDecoder("utf8");
 constructor(options:TuiOptions) {
  this.options=options;
  this.input=(options.input??process.stdin) as ReadStream;this.output=(options.output??process.stdout) as WriteStream;this.raw=this.input.isRaw===true;
  this.limit=validateAttachmentLimit(options.maxAttachmentBytes);this.color=!process.env.NO_COLOR && process.env.TERM!=='dumb';
  options.presentation!.attach(line=>{if(this.overlay)this.overlay.lines.push(line);else this.notice=line;this.draw();});
  attachWorkspace(options.presentation!,{observe:e=>this.observe(e),progress:e=>this.progress(e),settle:r=>this.settle(r)});
 }
 start():void {this.input.setRawMode(true);this.output.write('\x1b[?1049h\x1b[?2004h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?25h');this.input.on('data',this.data);this.input.on('end',this.end);this.output.on('resize',this.resize);this.input.resume();this.draw();}
 dispose():void {this.clearDrag();this.picker?.abort.abort();this.input.off('data',this.data);this.input.off('end',this.end);this.output.off('resize',this.resize);this.input.setRawMode(this.raw);this.input.pause();this.output.write('\x1b[0m\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l');this.output.write(`Pan closed · Run ${terminalText(this.runId)} · Archives ${terminalText(this.options.archiveStore?.root??'not configured')}\n`);}
 private readonly resize=()=>this.draw();
 private readonly end=()=>{this.closing=true;if(this.phase==='running'||this.phase==='cancelling')this.cancel();else this.finish();};
 private finish():void {this.phase='closed';this.picker?.abort.abort();this.done();}
 private readonly parser=new FramedInput(event=>{
  if(event.type==='key')this.key(event.text,event.key);
  else if(event.type==='wheel')this.wheel(event.delta,event.x,event.y);
  else if(event.type==='mouse')this.mouse(event.action,event.x,event.y);
  else if(event.type==='paste-start'){this.closePicker(false);this.overlay=undefined;}
  else {this.editor.insert(event.text);this.focus='composer';this.notice='Pasted draft · Not submitted';this.draw();}
 });
 get inputState(){return this.parser.state;}
 private readonly data=(data:Buffer|string):void=>{
  this.barrier=false;const before=this.inputState;this.parser.feed(typeof data==='string'?data:this.decoder.write(data));const after=this.inputState;
  if(before.pending!==after.pending||(before.mode==='paste')!==(after.mode==='paste'))this.draw();
 };
 private scroll(delta:number):void {
  if(!this.supported())return;this.ensureLayout((this.output.columns??80)-3);const tail=Math.max(0,this.contentRows.length-this.bodyHeight);
  this.top=Math.max(0,Math.min(tail,this.top+delta));this.follow=delta>0&&this.top===tail;
  this.anchor=this.follow?undefined:this.contentRows[this.top]?.anchor;if(this.follow)this.newOutput=false;this.draw();
 }
 private wheel(delta:number,x:number,y:number):void {
  // Wheel keeps its #62 behavior unconditionally, including during an active drag (C-SBAR-01);
  // the drag state itself is only ended by a matching release or Ctrl-G/C.
  if(!this.supported()||x<1||x>(this.output.columns??80)||y<2||y>this.bodyHeight+1)return;
  if(this.overlay){this.overlay.offset=Math.max(0,this.overlay.offset+delta);this.draw();}else this.scroll(delta);
 }
 // #60 Criteria 1.1 primary-button capture. The initial press must be on the track; after that,
 // drag x is deliberately ignored and y is clamped, matching native scrollbar capture semantics.
 private mouse(action:'press'|'drag'|'release',x:number,y:number):void {
  if(!this.supported()){this.clearDrag();return;}
  const columns=this.output.columns??80;
  const inside=x===columns&&y>=2&&y<=this.bodyHeight+1;
  if(action==='release'){if(this.dragging)this.clearDrag();return;}
  if(this.overlay)return;
  if(action==='press'){
   if(!inside)return;this.ensureLayout(columns-3);
   const geometry=scrollbarGeometry(this.contentRows.length,this.bodyHeight,this.top);
   if(!geometry)return; // blank track: no thumb to drag
   const p=y-2;
   if(p>=geometry.thumbStart&&p<geometry.thumbStart+geometry.thumbSize){this.grabOffset=p-geometry.thumbStart;}
   else {this.dragTo(y);this.grabOffset=Math.floor(geometry.thumbSize/2);}
   this.dragging=true;this.drawIfMoved();return;
  }
  if(!this.dragging)return;this.dragCapturedTo(y);this.drawIfMoved();
 }
 // Motion reports fire per pixel; repaint only when the viewport state actually changed.
 private movedMark='';private drawIfMoved():void {
  const mark=`${this.top}|${this.follow}|${this.newOutput}|${this.anchor?`${this.anchor.item}:${this.anchor.part}:${this.anchor.offset}`:''}`;
  if(mark!==this.movedMark){this.movedMark=mark;this.draw();}
 }
 private dragTo(y:number):void {
  const next=scrollbarDragTop(this.contentRows.length,this.bodyHeight,y);
  if(next===undefined)return;
  this.setTopFromDrag(next);
 }
 private dragCapturedTo(y:number):void {
  const next=scrollbarCapturedDragTop(this.contentRows.length,this.bodyHeight,y,this.grabOffset);
  if(next===undefined)return;
  this.setTopFromDrag(next);
 }
 private setTopFromDrag(next:number):void {
  this.top=next;
  const tail=Math.max(0,this.contentRows.length-this.bodyHeight);
  if(this.top>=tail){this.top=tail;this.follow=true;this.anchor=undefined;this.newOutput=false;}
  else{this.follow=false;this.anchor=this.contentRows[this.top]?.anchor;}
 }
 private clearDrag():void {this.dragging=false;this.grabOffset=0;}
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
 private touch(item:number):void{while(this.entryStamps.length<=item)this.entryStamps.push(0);this.entryStamps[item]=++this.layoutClock;}
 private buildEntryRows(e:Entry,item:number,w:number):ContentRow[]{
  const rows:ContentRow[]=[{text:`${e.role} · ${e.status}`,kind:e.role,anchor:{item,part:'header' as const,offset:0},end:1}];
  for(const r of sourceRows(e.text,w)){this.layoutStats.sourceRowVisits++;rows.push({text:'│ '+r.text,kind:e.role,anchor:{item,part:'text' as const,offset:r.start},end:r.end});}
  this.layoutStats.builds++;return rows;
 }
 private ensureLayout(w:number):void{
  const changed=this.layoutStamps.length!==this.entryStamps.length||this.entryStamps.some((s,i)=>s!==this.layoutStamps[i]);
  if(w===this.layoutWidth&&!changed&&this.layoutStarts.length===this.entries.length){this.contentRows=this.layoutRows;return;}
  if(w!==this.layoutWidth){
   this.layoutRows=[];this.layoutStarts=[];
   this.entries.forEach((e,item)=>{this.layoutStarts.push(this.layoutRows.length);this.layoutRows.push(...this.buildEntryRows(e,item,w));});
   this.layoutWidth=w;
  }else{
   // Build newly appended tail entries; splice-rebuild only entries whose stamp changed.
   const existing=this.layoutStarts.length;
   for(let i=existing;i<this.entries.length;i++){this.layoutStarts.push(this.layoutRows.length);this.layoutRows.push(...this.buildEntryRows(this.entries[i]!,i,w));}
   for(let i=0;i<existing;i++){
    if(this.entryStamps[i]===this.layoutStamps[i])continue;
    const start=this.layoutStarts[i]!;const end=i+1<this.layoutStarts.length?this.layoutStarts[i+1]!:this.layoutRows.length;
    const rebuilt=this.buildEntryRows(this.entries[i]!,i,w);
    this.layoutRows.splice(start,end-start,...rebuilt);
    const delta=rebuilt.length-(end-start);
    for(let j=i+1;j<this.layoutStarts.length;j++)this.layoutStarts[j]=(this.layoutStarts[j]??0)+delta;
   }
  }
  this.layoutStamps=[...this.entryStamps];this.contentRows=this.layoutRows;
 }
 private findAnchorRow(a:Anchor):number{
  if(a.item<0||a.item>=this.layoutStarts.length)return -1;
  const start=this.layoutStarts[a.item]!;const end=a.item+1<this.layoutStarts.length?this.layoutStarts[a.item+1]!:this.layoutRows.length;
  const visit=(i:number)=>{this.layoutStats.sourceRowVisits++;return this.layoutRows[i]!;};
  const matches=(r:ContentRow):boolean=>r.anchor.part===a.part&&r.anchor.offset<=a.offset&&(a.offset<r.end||r.anchor.offset===r.end&&a.offset===r.end);
  // Offsets are non-decreasing within an entry: binary search the last row with offset<=a.offset.
  let lo=start,hi=end-1,found=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(visit(mid).anchor.offset<=a.offset){found=mid;lo=mid+1;}else hi=mid-1;}
  if(found>=0){
   const row=visit(found);
   if(matches(row))return found;
   // A part mismatch can only mean the header row (always the entry's first row).
   if(visit(start).anchor.part===a.part&&matches(this.layoutRows[start]!))return start;
  }else if(visit(start).anchor.offset<=a.offset&&matches(this.layoutRows[start]!))return start;
  return -1;
 }
 private supported():boolean{return (this.output.columns??80)>=40&&(this.output.rows??24)>=12;}
 private cancel():void {if(this.phase==='running'){this.phase='cancelling';this.options.session.cancel();this.notice='Cancelling · draft retained';}else if(this.phase!=='cancelling')this.notice='Draft retained · :exit to quit';this.draw();}
 private cycle(reverse=false):void {const choices:Focus[]=['composer',...(this.selected.length?['attachments' as const]:[]),...(this.entries.length?['transcript' as const]:[])];const i=choices.indexOf(this.focus);this.focus=choices[(i+(reverse?-1:1)+choices.length)%choices.length]!;if(this.focus==='transcript')this.revealTool=true;this.draw();}
 private matches():readonly string[]{return this.picker?.names.filter(n=>n.includes(this.picker!.editor.text))??[];}
 private openPicker():void {const p:Picker={editor:new DailyEditor(),names:[],index:0,loading:true,capturing:false,abort:new AbortController()};this.picker=p;this.draw();void discoverAttachmentPaths(this.options.workspace).then(names=>{if(this.picker!==p)return;p.names=names;p.loading=false;this.draw();},()=>{if(this.picker!==p)return;this.picker=undefined;this.notice='Attachment discovery failed · draft retained';this.draw();});}
 private closePicker(literal:boolean):void {const p=this.picker;if(!p)return;this.picker=undefined;p.abort.abort();if(literal)this.editor.insert('@'+p.editor.text);this.notice='Not submitted · picker closed';this.draw();}
 private select():void {const p=this.picker;if(!p||p.loading||p.capturing)return;const path=this.matches()[p.index];if(path===undefined)return;this.barrier=true;if(this.selected.some(s=>s.path===path)){this.closePicker(false);this.notice='Already selected · Not submitted';return;}
  p.capturing=true;this.draw();void captureAttachment(this.options.workspace,path,this.limit-this.selected.reduce((n,s)=>n+s.bytes,0),p.abort.signal).then(snapshot=>{if(this.picker!==p)return;this.selected.push(snapshot);this.picker=undefined;this.focus='composer';this.notice='Attached · Not submitted · Enter Send';this.draw();},()=>{if(this.picker!==p)return;this.picker=undefined;this.notice='Attachment capture denied · draft retained';this.draw();});
 }
 private preview():void {const item=this.selected[this.chip]??this.selected.at(-1);if(!item){this.notice='No attachments selected';this.draw();return;}this.overlay={title:'Snapshot preview · Not submitted',lines:[...wrap(terminalText(item.path),Math.max(10,(this.output.columns??80)-4)),`${item.bytes} bytes`,`SHA-256 ${item.sha256}`,'Send includes this snapshot as user data and stores it in the Run Archive.',...item.text.split('\n').map(s=>'│ '+terminalText(s))],offset:0,focus:this.focus};this.draw();}
 private remove():void {this.selected.splice(this.chip,1);this.chip=Math.min(this.chip,Math.max(0,this.selected.length-1));if(!this.selected.length)this.focus='composer';this.notice='Not submitted · attachment removed';this.draw();}
 key(text:string|undefined,key:InputKey={}):void {
  if(this.phase==='closed')return;
  if(key.ctrl&&(key.name==='g'||key.name==='c'))this.clearDrag(); // Cancellation always ends capture without scrolling.
  const enter=key.name==='return'||key.name==='enter';
  if((enter||key.name==='tab')&&this.barrier)return;
  if(key.ctrl&&key.name==='d'){this.end();return;}
  if(key.ctrl&&key.name==='v'&&!this.picker&&!this.overlay){this.safePaste=!this.safePaste;this.focus='composer';this.draw();return;}
  if(this.overlay){if(enter||key.ctrl&&key.name==='g'||key.ctrl&&key.name==='c'){this.focus=this.overlay.focus;this.overlay=undefined;this.barrier=true;}else if(key.name==='up'||key.name==='pageup')this.overlay.offset=Math.max(0,this.overlay.offset-(key.name==='up'?1:5));else if(key.name==='down'||key.name==='pagedown')this.overlay.offset=Math.min(Math.max(0,this.overlay.lines.length-1),this.overlay.offset+(key.name==='down'?1:5));this.draw();return;}
  if(this.picker){const p=this.picker;if(key.ctrl&&key.name==='g'){this.closePicker(true);return;}if(key.ctrl&&key.name==='c'){this.closePicker(false);return;}if(enter){this.notice='Tab Attach · Ctrl-G Back';this.draw();return;}if(p.capturing)return;if(key.name==='tab'&&!key.shift){this.select();return;}
   if(key.name==='up'||key.name==='tab'&&key.shift)p.index=Math.max(0,p.index-1);else if(key.name==='down')p.index=Math.min(Math.max(0,this.matches().length-1),p.index+1);else if(key.name==='left')p.editor.move(-1);else if(key.name==='right')p.editor.move(1);else if(key.name==='backspace'){p.editor.backspace();p.index=0;}else if(this.printable(text,key)){p.editor.insert(text!);p.index=0;}this.draw();return;}
  if(key.ctrl&&key.name==='c'){this.cancel();return;}
  if(key.ctrl&&key.name==='g'){if(this.historyIndex!==undefined)this.restoreHistory();this.focus='composer';this.safePaste=false;this.draw();return;}
  if(key.name==='pageup'||key.name==='pagedown'){this.scroll((key.name==='pageup'?-1:1)*Math.max(1,Math.floor((this.output.rows??24)/2)));return;}
  if(key.ctrl&&key.name==='end'){this.follow=true;this.anchor=undefined;this.newOutput=false;this.draw();return;}
  if(key.name==='tab'){this.cycle(key.shift);return;}
  if(key.ctrl&&key.name==='p'){this.preview();return;}if(key.ctrl&&key.name==='r'){if(this.selected.length){this.chip=this.selected.length-1;this.remove();}return;}
  if(this.focus!=='composer'){if(enter){if(this.focus==='attachments')this.preview();else void this.command(':details');this.barrier=true;}else if(key.name==='backspace'&&this.focus==='attachments')this.remove();else if(key.name==='up'||key.name==='down'){if(this.focus==='attachments')this.chip=Math.max(0,Math.min(this.selected.length-1,this.chip+(key.name==='up'?-1:1)));else{this.follow=false;const tools=this.entries.filter(e=>e.role==='Tool');if(tools.length){this.toolCursor=Math.max(0,Math.min(tools.length-1,this.toolCursor+(key.name==='up'?-1:1)));this.revealTool=true;}else this.scroll(key.name==='up'?-1:1);}}this.draw();return;}
  if(enter){if(key.meta||this.safePaste){this.editor.insert('\n');this.draw();return;}this.send();return;}
  if(text==='@'&&!this.safePaste&&!key.meta&&!key.ctrl&&/(?:^|\s)$/.test(this.editor.text.slice(0,this.editor.caret))){this.openPicker();return;}
  if(key.name==='left')this.editor.move(-1);else if(key.name==='right')this.editor.move(1);else if(key.name==='up'||key.name==='down'){const delta=key.name==='up'?-1:1;if(!this.editor.vertical(delta,Math.max(1,(this.output.columns??80)-3)))this.recall(delta);}else if(key.name==='backspace')this.editor.backspace();else if(key.ctrl&&key.name==='u')this.editor.clear();else if(key.name==='home'||key.ctrl&&key.name==='a')this.editor.caret=0;else if(key.name==='end'||key.ctrl&&key.name==='e')this.editor.caret=this.editor.text.length;else if(this.printable(text,key))this.editor.insert(text!);this.draw();
 }
 private printable(text:string|undefined,key:InputKey):boolean{return !!text&&!key.ctrl&&!key.meta&&!/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(text)&&(!key.name||key.name==='space'||Array.from(key.name).length===1);}
 private send():void {
  if(!this.supported()){this.notice='Resize terminal · Not submitted';this.draw();return;}
  if(['running','cancelling','command'].includes(this.phase)){this.notice='Busy — draft retained';this.draw();return;}
  const text=this.editor.text;if(this.phase==='confirm'){if(text.trim().toLowerCase()==='y'||text.trim().toLowerCase()==='yes'){this.phase='idle';this.editor.clear();this.barrier=true;this.notice='Ready · Not submitted';}else this.notice='Type y to confirm; :exit to quit';if(text.trim()===':exit')this.finish();this.draw();return;}
  if(!text.trim()){this.notice='Write a task · Not submitted';this.draw();return;}
  this.barrier=true;
  // Pasted multiline colon text is a task on explicit send, never a command script.
  if(text.trim().startsWith(':')&&!text.includes('\n')){this.editor.clear();void this.command(text.trim());return;}
  let prepared:string;try{prepared=prepareAttachedTask(text,this.selected);}catch{this.notice='Task preparation denied · draft retained';this.draw();return;}
  const before={text:this.editor.text,caret:this.editor.caret,selected:this.selected,chip:this.chip},admitted=this.history.length;
  this.editor.clear();this.selected=[];this.chip=0;this.clearDrag();this.phase='running';this.notice='Running · next draft is not submitted';this.draw();
  void this.options.session.runTask(prepared).then(result=>this.options.presentation!.settle(result),()=>{if(this.history.length===admitted){this.editor.text=before.text;this.editor.caret=before.caret;this.selected=before.selected;this.chip=before.chip;}if(this.active)this.active.status='Partial response · local failure';this.notice='Local error · draft retained';}).finally(()=>{if(this.closing)this.finish();else{this.phase='idle';this.draw();}});
 }
 private async command(text:string):Promise<void> {
  if(text===':exit'){this.end();return;}
  if(text===':preview'||text===':attachments'){this.preview();return;}
  const focus=this.focus;this.overlay={title:'View only · '+text.split(' ')[0],lines:[],offset:0,focus};
  try{
   if(text===':details'){this.options.presentation!.details();if(focus==='transcript'){const tool=this.entries.filter(e=>e.role==='Tool')[this.toolCursor];if(tool)this.overlay.offset=Math.max(0,this.overlay.lines.findIndex(line=>line.includes(tool.text)));}}
   else if(text===':help')this.overlay.lines.push('Enter sends an idle nonblank draft; busy Enter never queues.','Alt-Enter: newline. Ctrl-V: safe paste/edit mode; Ctrl-G exits it.','@ file picker; arrows choose; Tab attaches; Enter only hints; Ctrl-P preview; Ctrl-R remove.','Wheel/PageUp/Down: conversation. Ctrl-End: follow tail. Up/Down: prompt history at draft edges.','Scrollbar: the final column is the track; primary press/drag jumps, release ends. A terminal without drag motion still positions on press.','Compatibility: raw Esc reserves a frame prefix, never Back. Ctrl-G backs out; pending tails drain before raw typing resumes. Paste enters literal data.','Ctrl-C cancels once; Ctrl-D exits even with pending input; :exit quits. :details / :runs / :replay ID are view only.');
   else if(text===':context')this.overlay.lines.push(`Context messages ${this.options.session.contextMessageCount}`);
   else if(text===':runs'){const store=this.options.archiveStore;if(!store)this.overlay.lines.push('Archives not configured');else{const entries=await readdir(join(store.root,'runs'),{withFileTypes:true});this.overlay.lines.push('Archived records · view only');if(!entries.length)this.overlay.lines.push('No submitted run yet');for(const e of entries)if(e.isDirectory()&&/^[A-Za-z0-9_-]+$/.test(e.name))this.overlay.lines.push(terminalText(e.name));}}
   else if(text.startsWith(':replay ')){const id=text.slice(8).trim(),store=this.options.archiveStore;if(!store||!/^[A-Za-z0-9_-]+$/.test(id))throw Error();const dir=join(store.root,'runs',id);if(!(await lstat(dir)).isDirectory())throw Error();for(const f of ['manifest.json','events.jsonl'])if(!(await lstat(join(dir,f))).isFile())throw Error();this.options.presentation!.replay(await store.readArchive(id),id);}
   else this.overlay.lines.push('Unknown command · no execution');
  }catch{if(this.overlay)this.overlay.lines.push('Archive unavailable · no execution');}this.draw();
 }
 private observe(event:SessionObservation):void {
  if(event.type==='run.started'){this.runId=event.runId;const decoded=decodeAttachedTask(event.task);this.history.push(decoded?.prompt??event.task);if(this.historyIndex!==undefined)this.restoreHistory();this.entries.push({role:'You',text:decoded?.prompt??event.task,status:decoded?`${decoded.attachments.length} attached snapshot(s)`:''});this.touch(this.entries.length-1);this.active={role:'Pan',text:'',status:'Waiting for model'};this.entries.push(this.active);this.activeIndex=this.entries.length-1;this.touch(this.activeIndex);}
  if(event.type==='model.turn_started'){this.turnText='';if(this.active){this.active.status='Responding · provisional';this.touch(this.activeIndex);}}
  if(event.type==='model.turn_settled'&&this.active){if(!event.failure)this.active.text=event.text;this.active.status=event.failure?'Partial response':'Response received · provisional';this.touch(this.activeIndex);}
  if(event.type==='tool.started'){this.entries.push({role:'Tool',text:terminalText(event.toolName),status:'Running · Enter details'});this.touch(this.entries.length-1);}
  if(event.type==='tool.settled'){const e=this.entries.at(-1);if(e?.role==='Tool'){e.status=event.isError?'Error · Enter details':'Returned · Enter details';this.touch(this.entries.length-1);}}
  if(!this.follow)this.newOutput=true;this.draw();
 }
 private progress(event:SessionProgress):void {if(!this.active)return;this.turnText+=event.text;this.active.text=this.turnText;this.touch(this.activeIndex);if(!this.follow)this.newOutput=true;this.draw();}
 private settle(result:TaskRunResult):void {if(this.active){if(result.finalText)this.active.text=result.finalText;this.active.status=result.status==='completed'?'Completed':`Partial response · ${terminalText(result.status)}`;this.touch(this.activeIndex);}this.notice=result.status==='completed'?'Completed · next draft Not submitted':`Partial response · ${terminalText(result.status)}`;this.draw();}
 private chips():string[]{return this.selected.map((item,i)=>{const parts=item.path.split('/');let n=1;while(n<parts.length&&this.selected.some((other,j)=>j!==i&&other.path.split('/').slice(-n).join('/')===parts.slice(-n).join('/')))n++;return `${this.focus==='attachments'&&i===this.chip?'>':''}[${terminalText(parts.slice(-n).join('/'))}]`;});}
 draw():void {
  if(this.phase==='closed')return;const w=Math.max(1,this.output.columns??80),h=Math.max(1,this.output.rows??24);const view=this.editor.visual(Math.max(1,w-3));const composer=Math.min(view.lines.length,Math.max(1,Math.floor(h/3)));
  const rows:{text:string;kind?:string}[]=[];let cursor={row:h-1,col:0};
  let trackRows=0;let trackGeom:ScrollbarGeometry|undefined;
  if(!this.supported()){rows.push({text:'Pan · Resize terminal (min 40 x 12)'},{text:'Draft retained · Ctrl-C cancel'});cursor={row:Math.min(h-1,2),col:0};}
  else {
   rows.push({text:`Pan · Compat · ${this.overlay?'preview':this.picker?'picker':this.focus}${this.newOutput?' · New output':''} · ${this.phase} · ${terminalText(this.options.model)}`,kind:'header'});
   const matches=this.matches(),p=this.picker;const pickerRows=p?Math.min(7,Math.max(3,h-5-composer-1)):0;const bodyRows=h-5-composer-pickerRows;this.bodyHeight=bodyRows;trackRows=bodyRows;
   let body:{text:string;kind?:string}[]=[];
   if(this.overlay){const lines=[this.overlay.title,...this.overlay.lines].flatMap(s=>wrap(s,w-3).map(t=>'│ '+t));this.overlay.offset=Math.min(this.overlay.offset,Math.max(0,lines.length-bodyRows));body=lines.slice(this.overlay.offset,this.overlay.offset+bodyRows).map(text=>({text}));}
   else {
    const selectedTool=this.entries.filter(e=>e.role==='Tool')[this.toolCursor];
    this.ensureLayout(w-3);
    const all=this.contentRows;
    const toolMarkerRow=selectedTool?this.layoutStarts[this.entries.indexOf(selectedTool)]!:-1;
    if(!all.length){const intro=this.phase==='confirm'?['Confirm provider and trusted-local workspace [y/N]','Provider: '+terminalText(this.options.provider),'Workspace: '+terminalText(this.options.workspace),'Host-user tools; cwd is not an OS sandbox.']:['Write a task. @ opens files; Tab attaches; Enter sends.'];body=intro.flatMap(s=>wrap(s,w-3).map(text=>({text,kind:'Pan'})));}
    else {
     if(this.revealTool&&selectedTool){this.follow=false;this.top=Math.max(0,(toolMarkerRow>=0?toolMarkerRow:0)-Math.floor(bodyRows/2));this.anchor=all[this.top]?.anchor;}
     this.revealTool=false;
     if(this.follow)this.top=Math.max(0,all.length-bodyRows);
     else {if(this.anchor){const a=this.anchor;const index=this.findAnchorRow(a);if(index>=0)this.top=index;}this.top=Math.min(this.top,Math.max(0,all.length-bodyRows));if(!this.anchor)this.anchor=all[this.top]?.anchor;}
     body=all.slice(this.top,this.top+bodyRows).map((row,i)=>i+this.top===toolMarkerRow&&this.focus==='transcript'?{...row,text:'> '+row.text}:row);
    }
    trackGeom=scrollbarGeometry(all.length,bodyRows,this.top);
   }

   for(let i=0;i<bodyRows;i++)rows.push(body[i]??{text:''});
   if(p){const safe=terminalText(p.editor.text),before=terminalText(p.editor.text.slice(0,p.editor.caret));const col=graphemes(before).reduce((n,g)=>n+width(g),0);const start=Math.max(0,col-(w-5));let off=0,skipped=0;const visible=graphemes(safe).filter(g=>{const n=off;off+=width(g);if(n<start){skipped=off;return false;}return true;}).join('');rows.push({text:`File ${p.capturing?'Capturing':p.loading?'Loading':`${matches.length? p.index+1:0}/${matches.length}`} · Tab Attach · Ctrl-G Back`});cursor={row:rows.length,col:Math.min(w-1,2+col-skipped)};rows.push({text:'@ '+visible,kind:'focus'});const count=pickerRows-2;const begin=Math.max(0,p.index-count+1);for(let i=0;i<count;i++){const index=begin+i;rows.push({text:matches[index]===undefined?'':`${index===p.index?'>':' '} ${terminalText(matches[index]!)}`,kind:index===p.index?'focus':undefined});}}
   rows.push({text:'─'.repeat(w),kind:'secondary'});
   const chips=this.chips();let chipText=chips.join(' ');if(this.focus==='attachments')chipText=chips.slice(this.chip).join(' ');rows.push({text:chipText?clip(chipText,w-1)+(graphemes(chipText).reduce((n,g)=>n+width(g),0)>w-1?'…':''):'No attachments',kind:this.focus==='attachments'?'focus':'secondary'});
   const busy=this.phase==='running'||this.phase==='cancelling';rows.push({text:this.phase==='confirm'?this.notice:busy?`${this.phase==='cancelling'?'Cancelling':'Busy'} — draft retained · Ctrl-C cancel`:this.historyIndex!==undefined?'History draft — not submitted':this.safePaste?'SAFE PASTE / EDIT · Ctrl-G exits; then Enter Send':this.editor.text.trim()?'Not submitted · Enter Send':'Not submitted · Write a task',kind:'secondary'});
   const start=Math.max(0,view.row-composer+1);const editorRow=rows.length;for(let i=0;i<composer;i++)rows.push({text:(i===0?'> ':'  ')+(view.lines[start+i]??''),kind:this.focus==='composer'?'focus':undefined});
   if(!p)cursor={row:editorRow+view.row-start,col:2+view.col};
   rows.push({text:this.inputState.pending?(this.inputState.mode==='paste'?'Pasting · literal data':'Input sequence pending · Ctrl-G Back'):this.overlay?'Enter/Ctrl-G Close · Up/Down Scroll':p?'Tab Attach · Ctrl-G Back · Enter Hint':this.safePaste?'SAFE PASTE: Enter newline · Ctrl-G exits':this.focus==='attachments'?'Enter Preview · Backspace Remove · Tab Focus':/:exit|denied|failed|Already selected|^Partial response|^Completed/.test(this.notice)?this.notice:'Ctrl-G Back · @ Files · Ctrl-V Paste',kind:'secondary'});
  }
  let frame='\x1b[?25l';for(let i=0;i<h;i++){const row=rows[i]??{text:''};const style=!this.color?'':row.kind==='You'?'\x1b[48;2;48;48;48m':row.kind==='focus'?'\x1b[38;2;0;215;215m':row.kind==='secondary'?'\x1b[38;2;155;155;155m':'';
   // #60: at supported viewports the final column is reserved for the body-row scrollbar track.
   const clipped=clipCells(row.text,this.supported()?w-1:w);
   const glyph=this.supported()&&trackGeom&&i>=1&&i<=trackRows?(i-1>=trackGeom.thumbStart&&i-1<trackGeom.thumbStart+trackGeom.thumbSize?'█':'│'):'';
   frame+=`\x1b[${i+1};1H\x1b[0m`+(this.color?'\x1b[48;2;30;30;30m\x1b[38;2;230;230;230m':'')+style+'\x1b[2K'+clipped.text+(glyph?' '.repeat(Math.max(0,w-1-clipped.used))+(this.color?glyph==='█'?'\x1b[38;2;0;215;215m':'\x1b[38;2;155;155;155m':'')+glyph:'');
  }
  frame+=`\x1b[${Math.max(1,Math.min(h,cursor.row+1))};${Math.max(1,Math.min(w,cursor.col+1))}H\x1b[?25h`;this.output.write(frame);
  this.movedMark=`${this.top}|${this.follow}|${this.newOutput}|${this.anchor?`${this.anchor.item}:${this.anchor.part}:${this.anchor.offset}`:''}`;
 }
}
export async function runDailyWorkspace(options:TuiOptions):Promise<number>{const ui=new DailyWorkspace(options);try{ui.start();await ui.closed;return 0;}finally{ui.dispose();await options.session.close();}}
