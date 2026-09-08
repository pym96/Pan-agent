import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { createHash } from "node:crypto";
import { createCompactPresentation, identifierPreview, terminalText, observeSafely } from "../src/tui/presentation.ts";
import { runCli } from "../src/cli.ts";
import { runTui, renderObservation, renderRunSummary, renderArchivedRecord } from "../src/tui/tui.ts";
import { FauxModelAdapter, FAUX_PENDING_EXCHANGE } from "../src/providers/faux/faux-model-adapter.ts";
import { RunArchiveStore } from "../src/memory/run-archive.ts";
import { GeneralAgentSession, type SessionObservation, type TaskRunResult } from "../src/runtime/session.ts";
import { createPanTrustedLocalTools } from "../src/tools/pan-trusted-local-tools.ts";
import type { ModelResponse, ToolCall } from "../src/protocol/canonical-protocol.ts";

const identity = {provider:{status:"reported" as const,value:"pan-faux"},model:{status:"reported" as const,value:"pan-faux-v1"},responseId:{status:"unavailable" as const}};
const response = (text: string, calls: ToolCall[] = []): ModelResponse => ({kind:"response",message:{role:"assistant",timestamp:0,content:[{type:"text",text},...calls]},stopReason:calls.length ? "tool_calls" : "stop",usage:{status:"unavailable"},identity});
const start = (runId = "one"): SessionObservation => ({type:"run.started",runId,task:"中文 task"});
const final = (runId = "one", status: TaskRunResult["status"] = "completed"): TaskRunResult => ({runId,status,reason:"fixture",finalText:"完整 final\n第二行",modelCalls:2,toolCalls:1,usage:{status:"unavailable"},archiveSealed:true});
const settledModel = (text: string): SessionObservation => ({type:"model.turn_settled",runId:"one",turn:1,identity,stopReason:"stop",usage:{status:"unavailable"},text});
const body = Array.from({length:200},(_,index)=>`line-${String(index+1).padStart(3,"0")}`).join("\n");
function capture() { const lines: string[] = []; const view = createCompactPresentation(line=>lines.push(line)); return {lines,view,text:()=>lines.join("\n")}; }

test("C-TUI-01 compact keeps full final once and zero tool-body lines; details retains permitted content without mutation", () => {
	const c = capture();
	const events: SessionObservation[] = [start(),settledModel("intermediate public text"),{type:"tool.started",runId:"one",toolName:"read",toolCallId:"private-call-id",arguments:{path:"中文".repeat(45)}},{type:"tool.settled",runId:"one",toolName:"read",toolCallId:"private-call-id",isError:false,text:body}];
	const before = JSON.stringify(events);
	for (const event of events) c.view.observe(event);
	assert.doesNotMatch(c.text(),/line-001|line-200|private-call-id|intermediate public text|USAGE|arguments=/);
	assert.match(c.text(),/… · Waiting for tool · :details/);
	c.view.settle(final());
	assert.equal(c.text().split("完整 final").length-1,1); assert.match(c.text(),/│ 第二行/);
	assert.match(c.text(),/Model calls 2 · Tool results 1/);
	c.lines.length=0; c.view.details(); const details=c.text();
	assert.match(details,/line-200/); assert.match(details,/intermediate public text/); assert.match(details,/private-call-id/); assert.match(details,/unavailable; total_tokens=unknown/);
	assert.match(details,new RegExp("中文".repeat(45))); assert.equal(JSON.stringify(events),before);
	c.lines.length=0; c.view.details(); assert.equal(c.text(),details);
	c.view.observe(start("two")); c.view.settle({...final("two"),toolCalls:0}); assert.match(c.text(),/Tool results 0/);
	c.lines.length=0; c.view.replay([],"incomplete"); assert.match(c.text(),/unavailable \(incomplete sequence\)/); assert.doesNotMatch(c.text(),/Tool results 0/);
});

test("C-TUI-01 exact 79/80/81 code-point preview and indivisible reversible escape tokens", () => {
	for (const n of [79,80,81]) assert.equal(identifierPreview("中".repeat(n)),"中".repeat(Math.min(80,n))+(n>80?"…":""));
	assert.equal(identifierPreview("a".repeat(77)+"\x1b"),"a".repeat(77)+"…");
	assert.equal(identifierPreview("a".repeat(74)+"\x1b"),"a".repeat(74)+"\\u001b");
	assert.equal(terminalText("\\u001b\x1b"),"\\\\u001b\\u001b");
});

test("C-TUI-01 failure, cancellation, incomplete, zero-tool and returned-error paths keep truthful status", () => {
	for (const status of ["completed","model_error","cancelled","incomplete"] as const) {
		const c=capture();c.view.observe(start());c.view.observe(settledModel("previous partial"));
		c.view.observe({type:"tool.started",runId:"one",toolName:"bash",toolCallId:"call",arguments:{command:"false"}});
		assert.doesNotMatch(c.text(),/✓|✗/);
		c.view.observe({type:"tool.settled",runId:"one",toolName:"bash",toolCallId:"call",isError:true,text:"error body"});
		c.view.settle(final("one",status));
		assert.match(c.text(),/✗ Error bash/);assert.match(c.text(),/Tool results 1/);assert.doesNotMatch(c.text(),/error body|次工具执行/);
		assert.equal(c.text().includes("Partial response"),status!=="completed");
	}
	const c=capture();c.view.observe(start());c.view.settle({...final(),finalText:"",toolCalls:0});assert.doesNotMatch(c.text(),/Final answer|Partial response/);assert.match(c.text(),/Tool results 0/);
});

test("C-TUI-05 all projections whitelist fields and reversibly frame external terminal controls", () => {
	const hostile="正常中文\x1b[2J\x1b]52;c;YQ==\x07\r你 › \b\x7f"+Array.from({length:32},(_,i)=>String.fromCodePoint(128+i)).join("")+"\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u2028\u2029\n已完成";
	const hidden={reasoning_content:"HIDDEN_REASON",thinking:"HIDDEN_THINK",authorization:"HIDDEN_AUTH",api_key:"HIDDEN_KEY",unknown:"HIDDEN_UNKNOWN"};
	const events=[{...start(),task:hostile,...hidden},{...settledModel(hostile),...hidden,identity:{...identity,...hidden},usage:{status:"unavailable",...hidden}},{type:"tool.started",runId:"one",toolName:hostile,toolCallId:hostile,arguments:{path:hostile,api_key:"HIDDEN_KEY"},...hidden},{type:"tool.settled",runId:"one",toolName:hostile,toolCallId:hostile,isError:true,text:hostile,details:hidden,...hidden},{type:"run.terminal",runId:"one",status:"model_error",reason:hostile,...hidden},{type:"run.settled",settled_state:"failed",reason:hostile,...hidden}];
	const before=JSON.stringify(events);const c=capture();
	for(const event of events.slice(0,-1))c.view.observe(event as SessionObservation);
	c.view.settle({...final(),status:"model_error",reason:hostile,finalText:hostile});c.view.details();c.view.replay(events,"archive");c.view.details();
	assert.doesNotMatch(c.text(),/HIDDEN_|[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u2028\u2029]/u);
	assert.match(c.text(),/正常中文/);assert.match(c.text(),/\\u001b\]52/);assert.match(c.text(),/│ 已完成/);assert.equal(JSON.stringify(events),before);
});

test("C-TUI-01/04 v1.1 cancelled batches preserve distinct live admissions and identical replay availability", async () => {
	const root=await mkdtemp(join(tmpdir(),"wo42-counts-"));
	try { for(const n of [2,3]) {
		const workspace=join(root,`workspace-${n}`);await mkdir(workspace);const store=await RunArchiveStore.open(join(root,`memory-${n}`));const c=capture();let executions=0;
		const calls:ToolCall[]=Array.from({length:n},(_,i)=>({type:"tool_call",id:`call-${i}`,name:"write",arguments:{path:`file-${i}`,content:"same"}}));
		const adapter=new FauxModelAdapter([response("",calls)]);let session:GeneralAgentSession;
		session=new GeneralAgentSession({kernel:"native",adapter,tools:createPanTrustedLocalTools(workspace).tools.map(tool=>({...tool,async execute(invocation){executions++;return tool.execute(invocation);}})),systemPrompt:"offline",memory:{archiveStore:store,runbook:async()=>({content:"test",revision:`sha256:${"0".repeat(64)}`})},onObservation(event){c.view.observe(event);if(event.type==="tool.started")session.cancel();}});
		const result=await session.runTask("cancel batch");await session.close();c.view.settle(result);c.view.details();
		assert.equal(executions,0);assert.equal(result.toolCalls,n);assert.match(c.text(),new RegExp(`Admitted tool calls ${n} · Tool start events 1 · Tool results 0`));assert.doesNotMatch(c.text(),/✓|次工具执行/);
		const retained=await store.readArchive(result.runId);c.lines.length=0;c.view.replay(retained,result.runId);c.view.details();const replay=c.text();
		assert.match(replay,/Admitted tool calls unavailable \(not recorded\) · Tool start events 1 · Tool results 0/);assert.match(replay,/Model calls unavailable \(not recorded\)/);
		const fresh=capture();fresh.view.replay(retained,result.runId);fresh.view.details();assert.equal(fresh.text(),replay);
		c.lines.length=0;c.view.replay(retained,result.runId);c.view.details();assert.equal(c.text(),replay);
	} } finally {await rm(root,{recursive:true,force:true});}
});

async function interactive(script: ConstructorParameters<typeof FauxModelAdapter>[0], drive: (chunk:string,input:PassThrough,adapter:FauxModelAdapter)=>void, factory?: Parameters<typeof runCli>[1]) {
	const root=await mkdtemp(join(tmpdir(),"wo42-cli-"));await mkdir(join(root,"workspace"));const input=new PassThrough(),output=new PassThrough();output.setEncoding("utf8");let text="";const adapter=new FauxModelAdapter(script);
	output.on("data",(chunk:string)=>{text+=chunk;drive(chunk,input,adapter);});
	try {const exit=await runCli(["--kernel","native","--workspace",join(root,"workspace"),"--memory-root",join(root,"memory")],{output,createNativeAdapter:()=>adapter,startTui:options=>runTui({...options,input}),...factory});return {exit,text,state:adapter.state};}
	finally {await rm(root,{recursive:true,force:true});}
}

test("C-TUI-02 non-TTY busy Enter preserves Chinese/ASCII draft and cursor until a new idle Enter", {timeout:10000}, async () => {
	let prompts=0,busy=false;
	const result=await interactive([FAUX_PENDING_EXCHANGE,response("second done")],(chunk,input)=>{
		if(chunk.includes("[y/N]> "))setImmediate(()=>input.write("y\n"));
		if(chunk==="You > ") {const n=prompts++;setImmediate(()=>input.write(n===0?"first\n":n===1?"\n":":exit\n"));}
		if(chunk.includes("Waiting for model")&&!busy){busy=true;setImmediate(()=>input.write("草稿ab\x1b[D中\n\x03"));}
	});
	assert.equal(result.state.exchangeCount,2);assert.match(result.text,/Busy — draft retained/);assert.match(result.text,/Cancelled/);
	assert.deepEqual(result.state.requests.map(request=>request.context.messages.filter(m=>m.role==="user").at(-1)?.content),[[{type:"text",text:"first"}],[{type:"text",text:"草稿a中b"}]]);
	assert.doesNotMatch(result.text,/\x1b/);
});

test("C-TUI-02 empty/local commands and pre/post-confirmation Ctrl-C admit no task", {timeout:10000}, async () => {
	for(const phase of ["before","after","commands"]){let prompts=0;const commands=["\n",":details\n",":unknown\n",":replay ../escape\n",":context\n",":help\n",":runs\n","\x03"];
		const r=await interactive([], (chunk,input)=>{if(chunk.includes("[y/N]> "))setImmediate(()=>input.write(phase==="before"?"\x03":"y\n"));if(chunk==="You > ")setImmediate(()=>input.write(phase==="after"?"\x03":commands[prompts++]!));});
		assert.equal(r.state.exchangeCount,0);if(phase==="commands"){assert.match(r.text,/No run selected/);assert.match(r.text,/Unknown command/);assert.match(r.text,/invalid ID/);}
	}
});

test("C-TUI-03 CLI catches synchronous projector failure without archive failure or cancelled execution", {timeout:10000}, async () => {
	let prompts=0;
	const r=await interactive([response("fault survived")],(chunk,input)=>{if(chunk.includes("[y/N]> "))setImmediate(()=>input.write("y\n"));if(chunk==="You > ")setImmediate(()=>input.write(prompts++?":exit\n":"one\n"));},{createPresentation:write=>({...createCompactPresentation(write),observe(){throw new Error("projector fault\x1b[2J");}})});
	assert.match(r.text,/Display error \(execution continues\)/);assert.match(r.text,/fault survived/);assert.match(r.text,/Completed/);assert.doesNotMatch(r.text,/archive_append_error|\x1b/);assert.equal(r.state.exchangeCount,1);
});

test("C-TUI-05 banner and validation diagnostics safely display hostile allowed fields", async () => {
	const output=new PassThrough();let text="";output.on("data",chunk=>{text+=chunk;});
	assert.equal(await runCli(["--kernel","bad\x1b]52;c;YQ==\x07\r你 › "],{output}),2);
	assert.doesNotMatch(text,/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);assert.match(text,/\\u001b/);
	const input=new PassThrough();const view=createCompactPresentation();const session={kernelKind:"native",close:async()=>{}} as GeneralAgentSession;
	output.on("data",chunk=>{if(String(chunk).includes("[y/N]> "))setImmediate(()=>input.write("n\n"));});
	await runTui({session,presentation:view,provider:"正常\x1b[2J",model:"模型\u202e",thinking:"HIDDEN_THINK",workspace:"目录\r你 › ",input,output});
	assert.doesNotMatch(text,/HIDDEN_THINK|[\x00-\x09\x0b-\x1f\u202e]/);assert.match(text,/host-user authority/);assert.match(text,/not containment or an OS sandbox/);
});

test("C-TUI-06 exported legacy renderers retain exact default behavior", () => {
	assert.deepEqual(renderObservation(start()),["RUN one","TASK 中文 task"]);
	assert.equal(renderRunSummary(final()),"RUN_SUMMARY run=one terminal=completed model_calls=2 tool_calls=1 total_tokens=unknown context_retained=true archive_sealed=true");
	assert.deepEqual(renderArchivedRecord({type:"unknown",value:42}),['RECORD {"type":"unknown","value":42}']);
	const c=capture();observeSafely(c.view,start(),()=>assert.fail("unexpected projection error"));
});
