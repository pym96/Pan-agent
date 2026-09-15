import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import type { TuiOptions } from '../src/tui/tui.ts';
import { ToolActivity } from '../src/tui/tool-activity.ts';

type Priv={observe(e:unknown):void;activityOverlay():void;overlay?:{title:string;lines:string[];focus:string}};
function fixture(){const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode() {}});const output=Object.assign(new PassThrough(),{isTTY:true,columns:120,rows:40});const session={cancel(){},runTask(){return new Promise(()=>{});},close:async()=>{},contextMessageCount:0};return new DailyWorkspace({input,output,workspace:'/tmp',presentation:createCompactPresentation(),session,model:'faux',provider:'faux'} as unknown as TuiOptions);}
test('C-ACT-01/02/03 one safe Tools digest replaces returned rows and opens chronological view-only activity',()=>{const ui=fixture(),p=ui as unknown as Priv;const secret='CANARY_COMMAND_FULL_PATH_RESULT_CALL_ID_SHA';p.observe({type:'run.started',runId:'r',task:'x'});for(let i=0;i<12;i++){const name=i===1?'bash':i===2?'unknown':'read',args=name==='read'?{path:`/private/${secret}/file-${i}\u202e.txt`}:{command:secret};p.observe({type:'tool.started',runId:'r',toolCallId:`${secret}-${i}`,toolName:name,arguments:args});if(i<11)p.observe({type:'tool.settled',runId:'r',toolCallId:`${secret}-${i}`,toolName:name,isError:i===3,text:secret});}
 assert.equal(ui.entries.filter(e=>e.role==='Tool'&&e.status==='Activity').length,1);const digest=ui.entries.find(e=>e.role==='Tool'&&e.status==='Activity')!;assert.match(digest.text,/running read · 11 completed · 1 failed · View activity/);assert.doesNotMatch(digest.text,new RegExp(secret));
 p.activityOverlay();assert.equal(p.overlay?.title,'Tool activity · view only');assert.equal(p.overlay?.lines.length,12);assert.match(p.overlay?.lines[0]??'',/^1\. read · read · file-0\\u202e\.txt · Returned$/);assert.match(p.overlay?.lines[11]??'',/Running$/);assert.doesNotMatch(p.overlay?.lines.join('\n')??'',new RegExp(secret));
 p.observe({type:'tool.settled',runId:'r',toolCallId:`${secret}-11`,toolName:'read',isError:false,text:secret});assert.match(digest.text,/12 completed · 1 failed · latest read · file-11\\u202e\.txt · View activity/);
});
test('C-ACT-01 zero-call run creates no digest',()=>{const ui=fixture(),p=ui as unknown as Priv;p.observe({type:'run.started',runId:'none',task:'x'});assert.equal(ui.entries.filter(e=>e.role==='Tool'&&e.status==='Activity').length,0);});

test('C-ACT-01/02 prior runs select their own activity; long safe labels use two rows and live overlay updates',()=>{
 const ui=fixture(),p=ui as unknown as Priv;
 for(const [run,name] of [['a','read'],['b','write']]){
  p.observe({type:'run.started',runId:run,task:'task'});
  p.observe({type:'tool.started',runId:run,toolCallId:run,toolName:name,arguments:{path:'/private/'+('中'.repeat(200))+'.txt'}});
  p.observe({type:'tool.settled',runId:run,toolCallId:run,toolName:name,isError:false,text:'HIDDEN_RESULT'});
 }
 const rows=(ui as unknown as {contentRows:{text:string;anchor:{item:number}}[]}).contentRows;
 ui.entries.forEach((entry,item)=>{if(entry.status==='Activity')assert.equal(rows.filter(row=>row.anchor.item===item).length,2);});
 ui.toolCursor=0;p.activityOverlay();assert.match(p.overlay!.lines[0]!,/^1\. read/);
 ui.toolCursor=1;p.activityOverlay();assert.match(p.overlay!.lines[0]!,/^1\. write/);
 p.observe({type:'tool.started',runId:'b',toolCallId:'next',toolName:'bash',arguments:{command:'HIDDEN_COMMAND'}});
 assert.match(p.overlay!.lines[1]!,/Running$/);
 p.observe({type:'tool.settled',runId:'b',toolCallId:'next',toolName:'bash',isError:true,text:'HIDDEN_RESULT'});
 assert.match(p.overlay!.lines[1]!,/Error$/);
});

test('C-ACT-03/04 archive activity rejects missing, duplicate, orphan and inconsistent records without mutation',()=>{
 const events=[{type:'run.started',runId:'r'},{type:'tool.started',runId:'r',toolCallId:'c',toolName:'read',arguments:{path:'/HIDDEN_DIRECTORY/safe.txt',sha:'HIDDEN_SHA'}},{type:'tool.settled',runId:'r',toolCallId:'c',toolName:'read',isError:false,text:'HIDDEN_RESULT'},{type:'run.terminal',runId:'r'}];
 const before=JSON.stringify(events),good=ToolActivity.replay(events,'r');
 assert.equal(good.summary,'1 completed · 0 failed · latest read · safe.txt · View activity');
 assert.deepEqual(good.lines,['1. read · read · safe.txt · Returned']);assert.equal(JSON.stringify(events),before);
 const variants=[[],events.slice(1),events.filter(e=>e.type!=='tool.started'),events.filter(e=>e.type!=='tool.settled'),[...events,events[2]!],[...events.slice(0,2),{...events[2],toolName:'write'},events[3]!]];
 for(const records of variants){const view=ToolActivity.replay(records,'r');assert.match(view.summary,/unavailable/);assert.deepEqual(view.lines,['Activity unavailable · inconsistent records']);}
});

test('C-ACT-01/03 one and five call runs use exact totals and escaped basename rules',()=>{
 for(const count of [1,5]){
  const a=new ToolActivity('r');
  for(let i=0;i<count;i++){a.observe({type:'tool.started',runId:'r',toolCallId:String(i),toolName:'read',arguments:{path:'/HIDDEN/a\u202e\x1b.txt'}});assert.match(a.summary,new RegExp(`running read · ${i} completed`));a.observe({type:'tool.settled',runId:'r',toolCallId:String(i),toolName:'read',isError:i===0});}
  assert.equal(a.summary,`${count} completed · 1 failed · latest read · a\\u202e\\u001b.txt · View activity`);
  assert.doesNotMatch(a.lines.join('\n'),/HIDDEN|[\u202e\x1b]/);
 }
});

test('C-ACT-04 one digest among 1000 entries retains warm layout and scrollbar drag bounds',()=>{
 const ui=fixture(),p=ui as unknown as Priv;
 const local=ui as unknown as {touch(n:number):void;wheel(d:number,x:number,y:number):void;mouse(action:string,x:number,y:number):void;bodyHeight:number};
 for(let i=0;i<997;i++){ui.entries.push({role:'Pan',text:'historical '+i+' '+('x'.repeat(160)),status:'Completed'});local.touch(i);}
 p.observe({type:'run.started',runId:'r',task:'current'});p.observe({type:'tool.started',runId:'r',toolCallId:'one',toolName:'read',arguments:{path:'a'}});p.observe({type:'tool.settled',runId:'r',toolCallId:'one',toolName:'read',isError:false});
 assert.equal(ui.entries.length,1000);ui.phase='idle';ui.draw();local.wheel(-3,2,3);
 const builds=ui.layoutStats.builds,samples:number[]=[];
 for(let i=0;i<50;i++){const visits=ui.layoutStats.sourceRowVisits,t=performance.now();if(i%5===0){local.mouse('press',120,2);local.mouse('drag',1,20);local.mouse('release',1,20);}else local.wheel(i%2?3:-3,2,3);samples.push(performance.now()-t);assert.ok(ui.layoutStats.sourceRowVisits-visits<=2*local.bodyHeight+8);}
 assert.equal(ui.layoutStats.builds,builds);const sorted=[...samples].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]!;
 console.log('C-ACT-04 '+JSON.stringify({samples,p95,postWarmBuilds:ui.layoutStats.builds-builds,visitsBound:2*local.bodyHeight+8}));assert.ok(p95<=50);
});
