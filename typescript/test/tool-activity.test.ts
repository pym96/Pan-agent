import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import type { TuiOptions } from '../src/tui/tui.ts';

type Priv={observe(e:unknown):void;activityOverlay():void;overlay?:{title:string;lines:string[];focus:string}};
function fixture(){const input=Object.assign(new PassThrough(),{isTTY:true,isRaw:false,setRawMode() {}});const output=Object.assign(new PassThrough(),{isTTY:true,columns:120,rows:40});const session={cancel(){},runTask(){return new Promise(()=>{});},close:async()=>{},contextMessageCount:0};return new DailyWorkspace({input,output,workspace:'/tmp',presentation:createCompactPresentation(),session,model:'faux',provider:'faux'} as unknown as TuiOptions);}
test('C-ACT-01/02/03 one safe Tools digest replaces returned rows and opens chronological view-only activity',()=>{const ui=fixture(),p=ui as unknown as Priv;const secret='CANARY_COMMAND_FULL_PATH_RESULT_CALL_ID_SHA';p.observe({type:'run.started',runId:'r',task:'x'});for(let i=0;i<12;i++){const name=i===1?'bash':i===2?'unknown':'read',args=name==='read'?{path:`/private/${secret}/file-${i}\u202e.txt`}:{command:secret};p.observe({type:'tool.started',runId:'r',toolCallId:`${secret}-${i}`,toolName:name,arguments:args});if(i<11)p.observe({type:'tool.settled',runId:'r',toolCallId:`${secret}-${i}`,toolName:name,isError:i===3,text:secret});}
 assert.equal(ui.entries.filter(e=>e.role==='Tool'&&e.status==='Activity').length,1);const digest=ui.entries.find(e=>e.role==='Tool'&&e.status==='Activity')!;assert.match(digest.text,/running read · 11 completed · 1 failed · View activity/);assert.doesNotMatch(digest.text,new RegExp(secret));
 p.activityOverlay();assert.equal(p.overlay?.title,'Tool activity · view only');assert.equal(p.overlay?.lines.length,12);assert.match(p.overlay?.lines[0]??'',/^1\. read · read · file-0\\u202e\.txt · Returned$/);assert.match(p.overlay?.lines[11]??'',/Running$/);assert.doesNotMatch(p.overlay?.lines.join('\n')??'',new RegExp(secret));
 p.observe({type:'tool.settled',runId:'r',toolCallId:`${secret}-11`,toolName:'read',isError:false,text:secret});assert.match(digest.text,/12 completed · 1 failed · latest read · file-11\\u202e\.txt · View activity/);
});
test('C-ACT-01 zero-call run creates no digest',()=>{const ui=fixture(),p=ui as unknown as Priv;p.observe({type:'run.started',runId:'none',task:'x'});assert.equal(ui.entries.filter(e=>e.role==='Tool'&&e.status==='Activity').length,0);});
