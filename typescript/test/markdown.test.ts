import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markdownRows, paintMarkdown } from '../src/tui/markdown.ts';
import { width, graphemes } from '../src/tui/daily-editor.ts';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import type { TuiOptions } from '../src/tui/tui.ts';
const sample='# Recovery report\n- **Passed**: 7 tests\n1. Read `main.db`\n```python\nprint("**literal**")\n```\n中文 👩‍💻 🇨🇳 1️⃣';
const plain=(s:string,w=77)=>markdownRows(s,w).map(r=>r.text).join('\n');
test('Markdown subset, literal fenced contents, safe partial delimiters and fallback',()=>{
 assert.equal(plain(sample),'▌ Recovery report\n• Passed: 7 tests\n1. Read ‹main.db›\n┌ code · python\nprint("**literal**")\n└\n中文 👩‍💻 🇨🇳 1️⃣');
 for(const text of ['**partial','`partial','##','```js\n**literal','[link](https://example.com)','<script>literal</script>'])assert.ok(plain(text).includes(text.startsWith('```')?'**literal':text));
 for(let i=0;i<=sample.length;i++)assert.doesNotThrow(()=>markdownRows(sample.slice(0,i),37));
 const rows=markdownRows('**strong** and `code`',80);assert.ok(rows[0]!.cells.some(c=>c.style==='bold'));assert.ok(rows[0]!.cells.some(c=>c.style==='code'));
});
test('cell-aware wrapping keeps CJK/emoji/code intact, source anchors ordered, and escapes hostile controls',()=>{
 const text='# 中文👩‍💻🇨🇳1️⃣\n```js\n'+'中👩‍💻🇨🇳1️⃣'.repeat(60)+'\n```\n\x1b]52;c;attack\x07\x1b[2J\u202e';
 for(const cols of [10,37,77,117]){
  const rows=markdownRows(text,cols);
  assert.ok(rows.every(r=>graphemes(r.text).reduce((n,g)=>n+width(g),0)<=cols));
  assert.ok(rows.every((r,i)=>i===0||r.start>=rows[i-1]!.start));
  const rendered=rows.map(r=>paintMarkdown(r.cells,cols,false).text).join('');
  assert.ok(!rendered.includes('\x1b'));assert.ok(!rendered.includes('\x07'));assert.ok(rendered.includes('\\u001b'));assert.ok(rendered.includes('\\u202e'));
  assert.ok(rendered.includes('中👩‍💻🇨🇳1️⃣'.repeat(60)));
 }
});
function fixture(extra:Partial<TuiOptions>={}){
 const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode(v:boolean){this.isRaw=v;}});
 const output=Object.assign(new PassThrough(),{isTTY:true,columns:80,rows:35});let frame='';output.on('data',b=>{frame=String(b);});
 const presentation=createCompactPresentation();let requests=0;let approval:((r:unknown,s:AbortSignal)=>Promise<unknown>)|undefined;const session={setApprovalChannel(channel:typeof approval){approval=channel;},cancel(){},close:async()=>{},contextMessageCount:0,runTask(){requests++;throw Error('No calls');}};
 const ui=new DailyWorkspace({input,output,presentation,session,workspace:'/tmp',provider:'fixture',model:'fixture',...extra} as unknown as TuiOptions);
 return {ui,presentation,output,frame:()=>frame,requests:()=>requests,approval:()=>approval};
}
test('actual workspace renders assistant only, retains raw input and tool rows, handles stream/resize/NO_COLOR',()=>{
 const old=process.env.NO_COLOR;process.env.NO_COLOR='';const f=fixture();if(old===undefined)delete process.env.NO_COLOR;else process.env.NO_COLOR=old;
 f.presentation.observe({type:'run.started',runId:'fixture',task:'**raw user**'});
 f.presentation.observe({type:'model.turn_started',runId:'fixture',turn:1} as never);
 for(const text of ['# Hello\n**str','ong**\n```js\n**literal**\n```'])f.presentation.progress!({type:'text_delta',text,runId:'fixture',turn:1} as never);
 assert.ok(f.frame().includes('▌ Hello'));assert.ok(f.frame().includes('**raw user**'));assert.ok(f.frame().includes('**literal**'));
 assert.ok(!f.frame().includes('\x1b[1m'));assert.ok(!f.frame().includes('\x1b[36m'));
 f.ui.entries.push({role:'Tool',status:'Returned',text:'**literal tool** `command`'});f.ui.draw();assert.ok(f.frame().includes('**literal tool** `command`'));
 const raw=f.ui.entries.find(e=>e.role==='Pan')!.text;
 for(const columns of [40,120,80]){f.output.columns=columns;f.ui.draw();assert.equal(f.ui.entries.find(e=>e.role==='Pan')!.text,raw);}
 assert.equal(f.requests(),0);
});
test('actual replay final response uses same Markdown projection without rewriting records or calling session',async()=>{
 const root=await mkdtemp(join(tmpdir(),'md-replay-'));await mkdir(join(root,'runs/r'),{recursive:true});await writeFile(join(root,'runs/r/manifest.json'),'{}');await writeFile(join(root,'runs/r/events.jsonl'),'');
 const records=[{type:'model.turn_settled',runId:'r',text:sample}];const before=JSON.stringify(records);
 const f=fixture({archiveStore:{root,readArchive:async()=>records} as never});f.ui.editor.insert(':replay r');f.ui.key(undefined,{name:'return'});
 for(let i=0;i<100&&!f.ui.overlay?.assistantText;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(f.ui.overlay?.assistantText,sample);assert.ok(f.frame().includes('▌ Recovery report'));assert.ok(f.frame().includes('print("**literal**")'));assert.equal(JSON.stringify(records),before);assert.equal(f.requests(),0);
});

test('approval prompts remain literal and TERM=dumb suppresses generated Markdown styles',async()=>{
 const term=process.env.TERM;const color=process.env.NO_COLOR;process.env.TERM='dumb';delete process.env.NO_COLOR;const f=fixture();if(term===undefined)delete process.env.TERM;else process.env.TERM=term;if(color!==undefined)process.env.NO_COLOR=color;
 f.ui.entries=[{role:'Pan',text:'# Heading\n**bold**',status:'Completed'}];f.ui.draw();assert.ok(f.frame().includes('▌ Heading'));assert.ok(!f.frame().includes('\x1b[1m'));
 const pending=f.approval()!({requestId:'approval',tool:'bash',workspace:'/tmp',reason:'test',target:'**remove** `file`',metadata:[]},new AbortController().signal);
 assert.ok(f.frame().includes('**remove** `file`'));f.ui.key(undefined,{name:'g',ctrl:true});await pending;assert.equal(f.requests(),0);
});
