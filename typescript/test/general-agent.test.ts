import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, test } from "node:test";
import { runCli } from "../src/cli.ts";
import { GeneralAgentSession, type GeneralAgentSessionOptions, type SessionObservation } from "../src/runtime/session.ts";
import { NativeKernel } from "../src/runtime/native-kernel.ts";
import { RunArchiveStore } from "../src/memory/run-archive.ts";
import { runTui } from "../src/tui/tui.ts";
import { FauxModelAdapter } from "../src/providers/faux/faux-model-adapter.ts";
import { createPanTrustedLocalTools } from "../src/tools/pan-trusted-local-tools.ts";
import { PanDeepSeekModelAdapter } from "../src/providers/deepseek/pan-deepseek-model-adapter.ts";
import type { ModelAdapter } from "../src/protocol/model-adapter-contract.ts";
import type { AgentTool } from "../src/protocol/agent-tool.ts";
import { response, call } from "./pan-fixture.ts";
const revision = `sha256:${"0".repeat(64)}`;
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function root() { const dir = await mkdtemp(join(tmpdir(), "wo34-product-")); roots.push(dir); await mkdir(join(dir, "workspace")); return dir; }
function capture() { const output = new PassThrough(); let text = ""; output.setEncoding("utf8"); output.on("data", (chunk) => { text += chunk; }); return { output, text: () => text }; }

test("C-PFREE-D103 Product help and invalid selectors fail before setup; explicit injection keeps one lifecycle", async () => {
 const dir = await root();
 const effects = { adapters: 0, tools: 0, credentials: 0, transport: 0, archive: 0, tui: 0 };
 const originalOpen = RunArchiveStore.open;
 RunArchiveStore.open = async () => { effects.archive++; throw new Error("archive factory forbidden"); };
 try {
  for (const [selector, code, diagnostic] of [
   [[], 2, "kernel_selection_required"], [["--kernel", "pi"], 2, "kernel_not_in_product"],
   [["--kernel", "unknown"], 2, "Unsupported kernel"], [["--help"], 0, "Usage:"],
  ] as const) {
   const out = capture();
   const exit = await runCli([...selector, "--workspace", join(dir, "workspace"), "--memory-root", join(dir, "memory")], {
    output: out.output,
    createNativeAdapter() { effects.adapters++; throw new Error("adapter factory forbidden"); },
    createTools() { effects.tools++; throw new Error("tool factory forbidden"); },
    startTui: async () => { effects.tui++; return 0; },
   });
   assert.equal(exit, code); assert.ok(out.text().includes(diagnostic));
  }
  for (const selector of [undefined, "pi", "other", null, 12, {}, {kind: "native"}]) {
   const options = {
    kernel: selector,
    get adapter() { effects.adapters++; throw new Error("adapter access forbidden"); },
    get tools() { effects.tools++; throw new Error("tools access forbidden"); },
    get memory() { effects.archive++; throw new Error("memory access forbidden"); },
   } as unknown as GeneralAgentSessionOptions;
   assert.throws(() => new GeneralAgentSession(options), /kernel_selection_required|kernel_not_in_product|Unsupported kernel/);
  }
 } finally { RunArchiveStore.open = originalOpen; }
 assert.deepEqual(effects, { adapters: 0, tools: 0, credentials: 0, transport: 0, archive: 0, tui: 0 });
 await assert.rejects(access(join(dir, "memory")), /ENOENT/);
 const adapter = new FauxModelAdapter([response("injected")]);
 const kernel = new NativeKernel({ adapter, tools: [], limits: { maxModelTurns: 2, maxToolSteps: 2 } });
 const store = await RunArchiveStore.open(join(dir, "injected-memory"));
 const session = new GeneralAgentSession({ kernel, adapterIdentity: {provider: adapter.providerId, modelId: adapter.modelId, thinkingLevel: adapter.reasoningLevel}, systemPrompt: "injected", memory: { archiveStore: store, runbook: async () => ({content: "test", revision}) } });
 try { const result = await session.runTask("injected lifecycle"); assert.equal(result.finalText, "injected"); assert.equal(result.archiveSealed, true); } finally { await session.close(); }
 console.log("D103 observed", JSON.stringify(effects));
});

test("C-PFREE-D102 explicit Native CLI and real TUI complete write/read/verify with sealed public archive", async () => {
 const dir = await root(); const input = new PassThrough(); const out = capture();
 const adapter = new FauxModelAdapter([
  response(call("write", {path: "proof.txt", content: "product-isolated\n"}, {id: "write-1"}), {stopReason: "tool_calls"}),
  response(call("read", {path: "proof.txt"}, {id: "read-1"}), {stopReason: "tool_calls"}),
  response(call("bash", {command: "test \"$(cat proof.txt)\" = product-isolated && printf verified"}, {id: "verify-1"}), {stopReason: "tool_calls"}),
  response("verified product-isolated"),
 ]);
 let tasks = 0;
 out.output.on("data", (chunk: string) => {
  if (chunk.includes("[y/N]> ")) setImmediate(() => input.write("y\n"));
  else if (chunk.endsWith("You > ")) setImmediate(() => input.write(tasks++ === 0 ? "write/read/verify proof.txt\n" : ":exit\n"));
 });
 const code = await runCli(["--kernel", "native", "--workspace", join(dir,"workspace"), "--memory-root", join(dir,"memory")], {
  output: out.output, createNativeAdapter: () => adapter,
  startTui: (options) => runTui({...options, input}),
 });
 assert.equal(code, 0); assert.equal(await readFile(join(dir, "workspace/proof.txt"), "utf8"), "product-isolated\n");
 assert.equal(adapter.state.exchangeCount, 4);
 const store = await RunArchiveStore.open(join(dir, "memory")); const runs = await store.listRuns(); assert.equal(runs.length, 1);
 const records = await store.readArchive(runs[0]!.runId);
 assert.deepEqual(records.filter((r) => r.type === "tool.started").map((r) => r.toolName), ["write", "read", "bash"]);
 assert.equal(records.filter((r) => r.type === "run.terminal").length, 1);
 assert.equal(records.find((r) => r.type === "run.terminal")?.status, "completed");
 assert.equal(records.at(-1)?.type, "run.settled");
 assert.match(out.text(), /completed/); assert.match(out.text(), /verified/);
 console.log("D102 observed", JSON.stringify({cli_exit: code, synthetic_exchanges: adapter.state.exchangeCount, admitted_tools: 3, terminals: 1, sealed: true, file: "product-isolated\\n"}));
});

async function harness(adapter: ModelAdapter, configure?: (tools: readonly AgentTool[]) => readonly AgentTool[], observe?: (event: SessionObservation, session: GeneralAgentSession) => void) {
 const dir = await root(); const store = await RunArchiveStore.open(join(dir,"memory")); const events: SessionObservation[] = [];
 const tools = createPanTrustedLocalTools(join(dir,"workspace"), {HOME: "/tmp/pan-safe-home", PATH: process.env.PATH, DEEPSEEK_API_KEY: "PROVIDER_SECRET_CANARY", ANTHROPIC_API_KEY: "SECOND_PROVIDER_SECRET_CANARY"}).tools;
 const session = new GeneralAgentSession({kernel: "native", adapter, tools: configure?.(tools) ?? tools, systemPrompt: "offline P-D6", memory: { archiveStore: store, runbook: async () => ({content: "test", revision}) }, onObservation(event) { events.push(event); observe?.(event, session); } });
 return {dir, store, events, session};
}

test("C-PFREE-D106 P-D6 admission, secret exclusion, process cancellation and malformed offline transport observations", async () => {
 const report: Record<string, unknown> = {};
 const originalSpawn = cp.spawn; const originalKill = process.kill;
 const spawns: Array<{pid?: number; detached: boolean; childCanary: boolean}> = [];
 const kills: Array<{pid: number; signal: unknown}> = [];
 cp.spawn = ((...args: Parameters<typeof cp.spawn>) => {
  const child = originalSpawn(...args);
  const options = args[2] as import("node:child_process").SpawnOptions | undefined;
  spawns.push({pid: child.pid, detached: options?.detached === true, childCanary: JSON.stringify(options?.env).includes("PROVIDER_SECRET_CANARY")});
  return child;
 }) as typeof cp.spawn;
 process.kill = ((pid: number, signal?: NodeJS.Signals | number) => { kills.push({pid,signal}); return originalKill(pid,signal); }) as typeof process.kill;
 syncBuiltinESMExports();
 try {
 for (const scenario of ["valid", "schema-invalid", "unknown", "pre-cancel"] as const) {
  let implementations = 0; const spawnBefore = spawns.length;
  const name = scenario === "unknown" ? "missing" : "bash";
  const args: import("../src/protocol/canonical-protocol.ts").JsonObject = scenario === "schema-invalid" ? {} : {command: "printf once > admitted.txt"};
  const adapter = new FauxModelAdapter([response(call(name, args, {id: "admit-1"}), {stopReason: "tool_calls"}), response("done")]);
  const h = await harness(adapter, (tools) => tools.map((tool) => ({...tool, async execute(invocation) { implementations++; return tool.execute(invocation); }})),
   (event, session) => { if (scenario === "pre-cancel" && event.type === "tool.started") session.cancel(); });
  try {
   const result = await h.session.runTask(scenario); const expected = scenario === "valid" ? 1 : 0;
   assert.equal(implementations, expected); assert.equal(spawns.length - spawnBefore, expected);
   const markerPresent = await access(join(h.dir, "workspace/admitted.txt")).then(() => true, () => false);
   assert.equal(markerPresent, scenario === "valid");
   const records = await h.store.readArchive(result.runId);
   assert.equal(records.filter((r) => r.type === "run.terminal").length, 1);
   report[scenario] = {admitted_implementations: implementations, process_starts: spawns.length - spawnBefore, marker_present: markerPresent, status: result.status, terminal_count: 1};
  } finally { await h.session.close(); }
 }
 const envAdapter = new FauxModelAdapter([
  response(call("bash", {command: "printf 'home=%s deepseek=%s anthropic=%s' \"$HOME\" \"${DEEPSEEK_API_KEY:-absent}\" \"${ANTHROPIC_API_KEY:-absent}\""}, {id: "environment"}), {stopReason: "tool_calls"}), response("environment observed"),
 ]);
 const env = await harness(envAdapter);
 try {
  const result = await env.session.runTask("environment"); const settled = env.events.find((e) => e.type === "tool.settled");
  assert.ok(settled?.type === "tool.settled"); assert.match(settled.text, /home=\/tmp\/pan-safe-home deepseek=absent anthropic=absent/);
  const records = await env.store.readArchive(result.runId);
  const publicBytes = JSON.stringify({result, events: env.events, records}); assert.doesNotMatch(publicBytes, /PROVIDER_SECRET_CANARY/);
  report.environment = {child_output: settled.text, child_canary_present: false, public_canary_present: false, terminal_count: records.filter((r) => r.type === "run.terminal").length};
 } finally { await env.session.close(); }
 const active = await harness(new FauxModelAdapter([response(call("bash", {command: "(sleep 0.30; printf late > late-marker.txt) & wait"}, {id:"slow-bash"}), {stopReason:"tool_calls"})]), undefined,
  (event, session) => { if (event.type === "tool.started") setTimeout(() => session.cancel(), 30); });
 try {
  const result = await active.session.runTask("cancel shell and descendant"); assert.equal(result.status,"cancelled");
  const settled = active.events.find((e) => e.type === "tool.settled"); assert.ok(settled?.type === "tool.settled"); assert.equal((settled.details as {status: string}).status,"cancelled");
  await new Promise((resolve) => setTimeout(resolve,1000));
  await assert.rejects(access(join(active.dir,"workspace/late-marker.txt")),/ENOENT/);
  const records = await active.store.readArchive(result.runId); assert.equal(records.filter((r) => r.type === "run.terminal").length,1); assert.equal(records.at(-1)?.type,"run.settled");
  const spawned = spawns.at(-1)!;
  assert.equal(spawned.detached, true); assert.ok(kills.some((k) => k.pid === -spawned.pid!));
  report.active_cancel = {detached_process: spawned.detached, negative_group_signal_observed: kills.some((k) => k.pid === -spawned.pid!), status: result.status, tool_status: (settled.details as {status:string}).status, process_group_probe: "(sleep 0.30; printf late > late-marker.txt) & wait", observation_ms:1000, delayed_marker_present:false, terminal_count:1};
 } finally { await active.session.close(); }
 let syntheticSends = 0;
 const malformed = await harness(new PanDeepSeekModelAdapter(undefined, {transport: {async send() {syntheticSends++; return { status:200, headers:{}, body:(async function*() {yield new TextEncoder().encode('data: {"PROVIDER_SECRET_CANARY":\n\ndata: [DONE]\n\n');})() }; }}}));
 try {
  const result = await malformed.session.runTask("malformed offline DeepSeek"); assert.equal(result.status,"model_error"); assert.equal(result.toolCalls,0);
  const records = await malformed.store.readArchive(result.runId); assert.equal(records.filter((r) => r.type === "run.terminal").length,1);
  assert.doesNotMatch(JSON.stringify({result,events:malformed.events,records}),/PROVIDER_SECRET_CANARY/);
  report.malformed = {synthetic_sends:syntheticSends, status:result.status, tool_calls:result.toolCalls, public_canary_present:false, terminal_count:1};
 } finally { await malformed.session.close(); }
 assert.equal(spawns.some((spawn) => spawn.childCanary), false);
 report.spawn_summary = {process_starts: spawns.length, child_environment_canary_present: spawns.some((spawn) => spawn.childCanary)};
 console.log("P-D6 actual observations", JSON.stringify(report, null, 2));
 } finally { cp.spawn = originalSpawn; process.kill = originalKill; syncBuiltinESMExports(); }
});
