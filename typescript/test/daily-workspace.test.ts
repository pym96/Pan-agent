import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DailyEditor,graphemes,sourceRows} from '../src/tui/daily-editor.ts';
import {DailyWorkspace} from '../src/tui/daily-workspace.ts';
import {createCompactPresentation} from '../src/tui/presentation.ts';
import type {TuiOptions} from '../src/tui/tui.ts';
const wait=async(fn:()=>boolean)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('barrier timeout');};
function fixture(workspace:string){const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(value:boolean){this.isRaw=value;}}),output=Object.assign(new PassThrough(),{isTTY:true,columns:80,rows:24});output.resume();let admits=0,cancels=0;const presentation=createCompactPresentation();const session={cancel(){cancels++;},runTask(){admits++;return new Promise(()=>{});},close:async()=>{},contextMessageCount:0};const ui=new DailyWorkspace({input,output,workspace,presentation,session,model:'fixture',provider:'fixture'} as unknown as TuiOptions);return {ui,input,output,presentation,session,counts:()=>({admits,cancels})};}
test('C-TUI-A02 grapheme editing and 500-line draft remain exact through narrow wrapping',()=>{const e=new DailyEditor();e.insert('中e\u0301👩‍💻\n'+'next\n'.repeat(500));const original=e.text;for(const n of [37,77,117]){const v=e.visual(n);assert.ok(v.lines.length>=501);assert.equal(e.text,original);}e.caret='中e\u0301👩‍💻'.length;e.backspace();assert.ok(e.text.startsWith('中e\u0301\n'));e.move(-1);e.backspace();assert.ok(e.text.startsWith('e\u0301'));assert.deepEqual(graphemes('中e\u0301👩‍💻'),['中','e\u0301','👩‍💻']);});
test('C-TUI-A02 safe edit, busy Enter, cancellation once and unsupported viewport never admit',()=>{const f=fixture('/tmp');const u=f.ui;u.phase='idle';u.key(undefined,{ctrl:true,name:'v'});u.key('@',{name:'@'});u.key(undefined,{name:'return'});u.key(':exit',{});assert.equal(u.editor.text,'@\n:exit');assert.equal(u.picker,undefined);u.key(undefined,{name:'g',ctrl:true});u.phase='running';u.key(undefined,{name:'return'});u.key(undefined,{ctrl:true,name:'c'});u.key(undefined,{ctrl:true,name:'c'});assert.deepEqual(f.counts(),{admits:0,cancels:1});assert.equal(u.editor.text,'@\n:exit');u.phase='idle';f.output.columns=30;u.key(undefined,{name:'return'});assert.deepEqual(f.counts(),{admits:0,cancels:1});});
test('C-TUI-A01 selection is inline and stale discovery/capture never overwrites cancelled state',async()=>{const root=await mkdtemp(join(tmpdir(),'wo47-state-'));await mkdir(join(root,'a'));await mkdir(join(root,'b'));await writeFile(join(root,'a/same.txt'),'first');await writeFile(join(root,'b/same.txt'),'second');const {ui}=fixture(root);ui.phase='idle';ui.editor.insert('review ');ui.key('@',{});ui.key(undefined,{name:'g',ctrl:true});assert.equal(ui.editor.text,'review @');await new Promise(r=>setTimeout(r,20));assert.equal(ui.picker,undefined);ui.editor.insert(' ');ui.key('@',{});await wait(()=>!!ui.picker&&!ui.picker.loading);ui.key('a/',{});ui.key(undefined,{name:'tab'});await wait(()=>!ui.picker);assert.equal(ui.selected[0]?.text,'first');assert.equal(ui.entries.length,0);ui.key(undefined,{ctrl:true,name:'p'});assert.ok(ui.overlay?.lines.includes('SHA-256 '+ui.selected[0]!.sha256));ui.key(undefined,{name:'g',ctrl:true});assert.equal(ui.entries.length,0);});
test('C-TUI-A01 transcript focus selects tool items; overlay keys never admit or edit source',()=>{const f=fixture('/tmp');f.ui.phase='idle';f.ui.entries=[{role:'Tool',text:'read',status:'Returned'},{role:'Tool',text:'bash',status:'Returned'}];f.ui.key(undefined,{name:'tab'});assert.equal(f.ui.focus,'transcript');f.ui.key(undefined,{name:'down'});assert.equal(f.ui.toolCursor,1);f.ui.key(undefined,{name:'down'});assert.equal(f.ui.toolCursor,1);f.ui.key(undefined,{name:'return'});assert.match(f.ui.overlay!.title,/View only/);assert.deepEqual(f.counts(),{admits:0,cancels:0});});
test('C-TUI-A02 actual input parser buffers split UTF-8 and bracketed paste without interpreting commands',async()=>{const f=fixture('/tmp');f.ui.start();f.ui.phase='idle';const text='中e\u0301👩‍💻\n@file\n:exit',bytes=Buffer.from('\x1b[200~'+text+'\x1b[201~');for(const byte of bytes)f.input.write(Buffer.from([byte]));await wait(()=>f.ui.editor.text===text);assert.equal(f.ui.picker,undefined);assert.deepEqual(f.counts(),{admits:0,cancels:0});f.ui.dispose();assert.equal(f.input.isRaw,false);});

test('C-TUI-A-R01 SGR wheel is scoped, fragmented reports never edit, paste stays literal',async()=>{
 const f=fixture('/tmp');f.ui.entries=[{role:'Pan',status:'Completed',text:Array.from({length:500},(_,i)=>`line ${i}`).join('\n')}];f.ui.start();f.ui.phase='idle';const tail=f.ui.top;
 for(const c of '\x1b[<64;3;3M')f.input.write(c);assert.equal(f.ui.top,tail-3);assert.equal(f.ui.follow,false);
 for(const value of ['\x1b[<65;3;23M','\x1b[<66;3;3M','\x1b[<64;bad;3M','\x1b[<64;3;\rM'])f.input.write(value);
 assert.equal(f.ui.editor.text,'');assert.equal(f.ui.top,tail-3);assert.equal(f.counts().admits,0);
 f.input.write('\x1b[<65;3;3M');assert.equal(f.ui.follow,true);
 const literal='\x1b[<64;3;3M';f.input.write('\x1b[200~'+literal+'\x1b[201~');assert.equal(f.ui.editor.text,literal);f.ui.dispose();
});
test('C-TUI-A-R02 detached resize retains source content rather than rendered row',()=>{
 const f=fixture('/tmp');f.ui.phase='idle';f.ui.entries=[{role:'Pan',status:'Completed',text:Array.from({length:120},(_,i)=>`ID${i}: `+'中e\u0301👩‍💻'.repeat(30)).join('\n')}];f.ui.draw();f.ui.key(undefined,{name:'pageup'});
 const u=f.ui as unknown as {anchor:{item:number;offset:number;part:string}};const anchor=structuredClone(u.anchor);assert.ok(anchor);
 for(const [columns,rows] of [[40,12],[80,24],[30,8],[120,40]]){f.output.columns=columns!;f.output.rows=rows!;f.ui.draw();assert.deepEqual(u.anchor,anchor);assert.equal(f.ui.follow,false);}
});
test('C-TUI-A-R03 admitted history restores original draft caret and snapshots',()=>{
 const f=fixture('/tmp');f.ui.phase='idle';const emit=(prompt:string)=>f.presentation.observe({type:'run.started',runId:prompt,task:prompt});emit('first');emit('second');emit('second');
 f.ui.editor.insert('unsent');f.ui.editor.caret=2;const snap={path:'file',bytes:1,sha256:'hash',text:'x'};f.ui.selected=[snap];f.ui.key(undefined,{name:'up'});assert.equal(f.ui.editor.text,'second');assert.deepEqual(f.ui.selected,[]);
 f.ui.key(undefined,{name:'up'});assert.equal(f.ui.editor.text,'second');f.ui.key(undefined,{name:'up'});assert.equal(f.ui.editor.text,'first');f.ui.key(undefined,{name:'g',ctrl:true});assert.equal(f.ui.editor.text,'unsent');assert.equal(f.ui.editor.caret,2);assert.deepEqual(f.ui.selected,[snap]);
});
test('C-TUI-A-R04 picker Enter hints only, Tab captures once without admission',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wo47-tab-'));await writeFile(join(root,'a.txt'),'snapshot');const f=fixture(root);f.ui.start();f.ui.phase='idle';f.input.write('task @');await wait(()=>!!f.ui.picker&&!f.ui.picker.loading);
 f.input.write('\r');await new Promise(r=>setTimeout(r,20));assert.ok(f.ui.picker);assert.equal(f.ui.picker.capturing,false);assert.equal(f.ui.selected.length,0);f.input.write('\t\r\t');await wait(()=>!f.ui.picker);assert.equal(f.ui.selected[0]?.text,'snapshot');assert.equal(f.ui.focus,'composer');assert.equal(f.counts().admits,0);f.ui.dispose();
});

test('C-TUI-A-R03 visual wraps take priority, no-history boundaries retain caret',()=>{
 const f=fixture('/tmp');f.ui.phase='idle';f.ui.editor.insert('中'.repeat(60));const before=f.ui.editor.visual(77);assert.ok(before.row>0);f.ui.key(undefined,{name:'up'});assert.equal(f.ui.editor.visual(77).row,before.row-1);const caret=f.ui.editor.caret;f.ui.key(undefined,{name:'up'});assert.equal(f.ui.editor.caret,caret);assert.equal(f.ui.editor.text,'中'.repeat(60));
});
test('C-TUI-A-R01 quarantines oversized malformed mouse payload and preserves paste',()=>{
 const f=fixture('/tmp');f.ui.start();f.ui.phase='idle';f.input.write('\x1b[<'+('9'.repeat(10000)));f.input.write('\r\t@ignored');f.input.write('M');assert.equal(f.ui.editor.text,'');assert.equal(f.ui.picker,undefined);assert.equal(f.counts().admits,0);f.input.write('safe');assert.equal(f.ui.editor.text,'safe');f.ui.dispose();
});

test('C-TUI-A-R02 CRLF is one source grapheme but retains an inert CR and visible line break',()=>{
 const rows=sourceRows('one\r\ntwo',40);assert.deepEqual(rows.map(r=>r.text),['one\\u000d','two']);assert.equal(rows[1]!.start,4);
});

test('C-TUI-A-R05 every frame split is clock-independent; Ctrl-G drains and paste BEL is literal',async t=>{
 const {FramedInput}=await import('../src/tui/framed-input.ts');t.mock.timers.enable({apis:['setTimeout','Date']});
 const frames=['\x1b[<64;3;3M','\x1b[<65;3;3M','\x1b[A','\x1b[1;5F','\x1b\r','\x1b[200~x\x07\x1b[<64;3;3M\x1b[201~'];
 for(const frame of frames){const expected:unknown[]=[];new FramedInput(e=>expected.push(e)).feed(frame);
  for(let split=1;split<frame.length;split++){const events:unknown[]=[];const p=new FramedInput(e=>events.push(e));p.feed(frame.slice(0,split));for(const delay of [50,350,800,1200,2**40])t.mock.timers.tick(delay);p.feed(frame.slice(split));assert.deepEqual(events,expected);assert.equal(p.state.pending,false);}
 }
 const events:unknown[]=[];const p=new FramedInput(e=>events.push(e));p.feed('\x1b');p.feed('\x07');assert.equal(p.state.pending,true);p.feed('[<64;3;3M');assert.deepEqual(events,[{type:'key',text:undefined,key:{name:'g',ctrl:true}}]);assert.equal(p.state.pending,false);
 events.length=0;p.feed('\x1b[');p.feed('\x07');p.feed('200~ignored\x07\r@\x1b[201~');assert.equal(events.length,1);assert.equal(p.state.pending,false);
});
test('C-TUI-A-R05 frame ceiling and unsupported CSI SS3 control strings quarantine all payload',async()=>{
 const {FramedInput}=await import('../src/tui/framed-input.ts');
 for(const length of [4095,4096,4097,100000]){const events:unknown[]=[];const p=new FramedInput(e=>events.push(e));p.feed('\x1b[<');for(let n=3;n<length;n++){p.feed('9');assert.ok(p.state.retainedBytes<=4096);}assert.equal(p.state.quarantined,length>4096);p.feed('\r\t@');p.feed('M');assert.equal(p.state.pending,false);assert.deepEqual(events,[]);}
 for(const frame of ['\x1b[999~','\x1bOA','\x1bx','\x1b]title\x1b\\','\x1bPbody\r\t@\x1b\\','\x1bXbody\x1b\\','\x1b^body\x1b\\','\x1b_body\x1b\\']){const events:unknown[]=[];const p=new FramedInput(e=>events.push(e));for(const c of frame)p.feed(c);assert.deepEqual(events,[],frame);assert.equal(p.state.pending,false,frame);}
});
test('C-TUI-A-R05 pending ESC keeps picker intact; Ctrl-G closes without late wheel or text; cancellation remains effective',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const f=fixture('/tmp');f.ui.start();f.ui.phase='idle';f.ui.editor.insert('draft');f.input.write('\x1b');t.mock.timers.tick(2**40);assert.equal(f.ui.editor.text,'draft');assert.equal(f.ui.inputState.pending,true);f.input.write('\x07');f.input.write('[<64;3;3M');assert.equal(f.ui.editor.text,'draft');assert.equal(f.ui.inputState.pending,false);
 f.ui.phase='running';f.input.write('\x1b[<');f.input.write('\x03');f.input.write('\x03');assert.equal(f.counts().cancels,1);f.input.write('64;3;3M');assert.equal(f.ui.editor.text,'draft');f.ui.dispose();
});
