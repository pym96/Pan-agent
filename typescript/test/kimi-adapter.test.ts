import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PanKimiModelAdapter, createPanKimiAdapter, KimiFetchTransport, KIMI_OFFICIAL_CONTRACT, KIMI_MODEL_ID } from "../src/index.ts";
import type { ModelExchangeRequest, ModelOutcome, ModelTextDelta } from "../src/index.ts";
import { GeneralAgentSession, RunArchiveStore } from "../src/index.ts";
import { loadRunbook } from "../src/index.ts";
import type { AgentTool } from "../src/protocol/agent-tool.ts";

const enc = new TextEncoder();
const request = (signal = new AbortController().signal, tools: AgentTool[] = []): ModelExchangeRequest => ({
	sessionId: "kimi-test",
	signal,
	context: { systemPrompt: "offline", messages: [{ role: "user", content: [{ type: "text", text: "task" }], timestamp: 0 }], tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) },
});
const event = (delta: Record<string, unknown>, finish: string | null = null, extra: Record<string, unknown> = {}) =>
	`data: ${JSON.stringify({ id: "kimi-1", object: "chat.completion.chunk", created: 1, model: "kimi-for-coding", choices: [{ index: 0, delta, finish_reason: finish }], usage: finish === null ? null : undefined, ...extra })}\n\n`;
const end = event({}, "stop") + "data: [DONE]\n\n";
const withUsage = { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 };
const endWithUsage = event({}, "stop", { usage: withUsage }) + "data: [DONE]\n\n";
const wire = (texts: readonly string[]) => texts.map((content) => event({ content })).join("") + end;
const wireWithUsage = (texts: readonly string[]) => texts.map((content) => event({ content })).join("") + endWithUsage;
const callDelta = (index: number, part: Record<string, unknown>) => event({ tool_calls: [{ index, ...part }] });
const wireCalls = (calls: ReadonlyArray<{ id: string; name: string; arguments: string }>) =>
	calls.map((c, i) => callDelta(i, { id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })).join("") + event({}, "tool_calls") + "data: [DONE]\n\n";
const direct = (parts: readonly Uint8Array[], status = 200) =>
	new PanKimiModelAdapter(undefined, { transport: { async send() { return { status, body: (async function* () { yield* parts; })() }; } } });
const directText = (text: string, status = 200) => direct([enc.encode(text)], status);

test("C-KIMI-01 request shape: frozen official endpoint, fixed model, Pan identity, no DeepSeek fields", async () => {
	const captured: Array<{ method: string; path: string; headers: Record<string, string>; body: string }> = [];
	const transport = { async send(r: { method: string; path: string; headers: Record<string, string>; body: string }) { captured.push({ method: r.method, path: r.path, headers: { ...r.headers }, body: r.body }); return { status: 200, body: (async function* () { yield enc.encode(wire(["ok"])); })() }; } };
	const adapter = new PanKimiModelAdapter(undefined, { transport });
	assert.equal(adapter.providerId, "kimi-code");
	assert.equal(adapter.modelId, "kimi-for-coding");
	assert.equal(adapter.reasoningLevel, "off");
	const outcome = await adapter.exchange(request());
	assert.equal(outcome.kind, "response");
	assert.equal(captured.length, 1);
	const req = captured[0]!;
	assert.equal(req.method, "POST");
	assert.equal(req.path, "/chat/completions");
	const body = JSON.parse(req.body);
	assert.equal(body.model, "kimi-for-coding");
	assert.equal(body.stream, true);
	assert.ok(!("thinking" in body) && !("reasoning_effort" in body), "no DeepSeek thinking fields");
	assert.ok(!JSON.stringify(body).includes("reasoning_content"), "no reasoning_content continuation field");
	assert.ok(!JSON.stringify(body).includes("deepseek"), "no DeepSeek model/profile in the request");
	// Transport holds the frozen official base URL; only /chat/completions is allowed.
	const boundary = new KimiFetchTransport({ credentialSource: () => "CANARY-KIMI-UNIT", fetchImplementation: async () => { throw new Error("capture"); } });
	await assert.rejects(boundary.send({ method: "POST", path: "/messages", headers: {}, body: "{}", signal: new AbortController().signal }), /kimi_endpoint_not_supported/);
	assert.equal(KIMI_OFFICIAL_CONTRACT.baseUrl, "https://api.kimi.com/coding/v1");
	assert.ok(KIMI_OFFICIAL_CONTRACT.docsOverview.sha256.length === 64 && KIMI_OFFICIAL_CONTRACT.membershipGuide.sha256.length === 64);
});

test("C-KIMI-02 final text and streamed public progress, split at every byte boundary", async () => {
	const baseline = wireWithUsage(["Hello", "，世界", "!\n"]);
	const expected = await directText(baseline).exchange(request());
	assert.equal(expected.kind, "response");
	if (expected.kind !== "response") return;
	assert.equal(expected.message.content[0]?.type, "text");
	assert.equal(expected.message.content[0]?.text ?? "", "Hello，世界!\n");
	assert.deepEqual(expected.usage, { status: "reported", value: { input: 3, output: 4, cacheRead: 0, totalTokens: 7 } });
	assert.equal(expected.identity.provider.status, "reported");
	const bytes = enc.encode(baseline);
	const partitions = [Array.from(bytes, (b) => Uint8Array.of(b)), [bytes], ...Array.from({ length: bytes.length + 1 }, (_, i) => [bytes.slice(0, i), bytes.slice(i)])];
	for (const parts of partitions) {
		const progress: ModelTextDelta[] = [];
		const actual = await direct(parts).exchange({ ...request(), onProgress: (e) => progress.push(e) });
		assert.deepEqual(actual, expected);
		assert.equal(progress.map((e) => e.text).join(""), "Hello，世界!\n");
	}
});

test("C-KIMI-02 one and multiple ordered ToolCalls with exact canonical correlation", async () => {
	const single = wireCalls([{ id: "call-1", name: "write", arguments: '{"path":"a.txt","content":"x"}' }]);
	const outcome1 = await directText(single).exchange(request());
	assert.equal(outcome1.kind, "response");
	if (outcome1.kind !== "response") return;
	const calls1 = outcome1.message.content.filter((c) => c.type === "tool_call");
	assert.deepEqual(calls1, [{ type: "tool_call", id: "call-1", name: "write", arguments: { path: "a.txt", content: "x" } }]);
	assert.equal(outcome1.stopReason, "tool_calls");
	// Multiple ordered calls with fragmented arguments.
	const multi = callDelta(0, { id: "call-a", type: "function", function: { name: "write", arguments: '{"path":"a' } })
		+ callDelta(0, { function: { arguments: '.txt","content":"x"}' } })
		+ callDelta(1, { id: "call-b", type: "function", function: { name: "read", arguments: '{"path":"a.txt"}' } })
		+ event({}, "tool_calls") + "data: [DONE]\n\n";
	const outcome2 = await directText(multi).exchange(request());
	assert.equal(outcome2.kind, "response");
	if (outcome2.kind !== "response") return;
	const calls2 = outcome2.message.content.filter((c) => c.type === "tool_call");
	assert.deepEqual(calls2.map((c) => c.id), ["call-a", "call-b"]);
	assert.deepEqual(calls2.map((c) => c.name), ["write", "read"]);
});

test("C-KIMI-02 missing usage stays unavailable; malformed/duplicate/orphan fixtures fail once, attributably", async () => {
	const missingUsage = await directText(wire(["ok"])).exchange(request());
	assert.equal(missingUsage.kind, "response");
	if (missingUsage.kind === "response") assert.deepEqual(missingUsage.usage, { status: "unavailable" });
	for (const [name, broken, code] of [
		["bad json", "data: {not json}\n\ndata: [DONE]\n\n", "kimi_sse_json_invalid"],
		["data after done", end + event({ content: "late" }), "kimi_sse_data_after_done"],
		["duplicate done", end + "data: [DONE]\n\n", "kimi_sse_done_duplicate"],
		["unknown finish", event({}, "explode") + "data: [DONE]\n\n", "kimi_finish_reason_unknown"],
		["orphan tool call (stop with calls)", callDelta(0, { id: "x", type: "function", function: { name: "write", arguments: "{}" } }) + end, "kimi_partial_tool_call_not_admitted"],
		["reasoning field", event({ reasoning_content: "hidden" }) + end, "kimi_reasoning_field_unsupported"],
		["index gap", callDelta(1, { id: "x", type: "function", function: { name: "write", arguments: "{}" } }) + event({}, "tool_calls") + "data: [DONE]\n\n", "kimi_tool_call_index_gap"],
		["bad arguments json", wireCalls([{ id: "c", name: "write", arguments: "not-json" }]), "kimi_tool_call_arguments_json_invalid"],
	] as const) {
		const outcome = await directText(broken).exchange(request());
		assert.equal(outcome.kind, "failure", name);
		if (outcome.kind === "failure") assert.equal(outcome.detail, code, name);
	}
});

test("C-KIMI-03 status-only error classification; the provider error body never becomes detail", async () => {
	const hostileBody = JSON.stringify({ error: { code: "CANARY-ERROR-BODY-SECRET", message: "CANARY-ERROR-BODY-SECRET verbose provider detail" } });
	for (const [status, category, detail, retryable] of [
		[401, "authentication", "kimi_http_401_authentication", false],
		[429, "rate_limit", "kimi_http_429_rate_limit", true],
		[500, "provider", "kimi_http_500", true],
		[418, "provider", "kimi_http_418", false],
	] as const) {
		const outcome = await directText(hostileBody, status).exchange(request());
		assert.equal(outcome.kind, "failure", String(status));
		if (outcome.kind !== "failure") continue;
		assert.equal(outcome.category, category);
		assert.equal(outcome.detail, detail);
		assert.equal(outcome.retryable, retryable);
		assert.ok(!JSON.stringify(outcome).includes("CANARY-ERROR-BODY-SECRET"), "error body must never become detail");
	}
});

test("C-KIMI-04 cancellation before admission: no tool start, no marker, one cancelled terminal", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "wo53-kimi-cancel-"));
	const memory = await mkdtemp(join(tmpdir(), "wo53-kimi-mem-"));
	let releaseBody!: () => void;
	const gate = new Promise<void>((r) => { releaseBody = r; });
	let bodyObservedCancel = false;
	const transport = {
		async send() {
			return {
				status: 200,
				body: (async function* () {
					yield enc.encode(event({ content: "partial" }));
					await gate;
					yield enc.encode(wireCalls([{ id: "call-x", name: "write", arguments: '{"path":"MARKER.txt","content":"x"}' }]).split("data: [DONE]")[0] + "");
				})(),
			};
		},
	};
	let toolStarts = 0;
	const markerTool: AgentTool = {
		name: "write",
		description: "marker",
		parameters: { type: "object" },
		validate: (value) => ({ ok: true, value: value as never }),
		execute: async () => { toolStarts += 1; throw new Error("must never run"); },
	};
	const archiveStore = await RunArchiveStore.open(memory);
	const runbook = await loadRunbook(new URL("../RUNBOOK.md", import.meta.url).pathname);
	const session = new GeneralAgentSession({
		kernel: "native",
		adapter: new PanKimiModelAdapter(undefined, { transport }),
		tools: [markerTool],
		systemPrompt: "offline",
		memory: { archiveStore, runbook: async () => runbook },
	});
	let cancelled = false;
	const settled = session.runTask("write the marker");
	setTimeout(() => { cancelled = true; session.cancel(); }, 20);
	const result = await settled;
	setTimeout(() => releaseBody(), 0);
	assert.ok(cancelled);
	assert.equal(result.status, "cancelled");
	assert.equal(toolStarts, 0, "a Tool must never start after abort");
	assert.equal(result.archiveSealed, true);
	const runs = await archiveStore.listRuns();
	assert.equal(runs.length, 1);
	const records = await archiveStore.readArchive(runs[0]!.runId);
	assert.equal(records.filter((r) => r.type === "tool.started").length, 0);
	assert.equal(records.filter((r) => r.type === "run.terminal").length, 1);
	assert.equal(records.filter((r) => r.type === "run.terminal")[0]?.status, "cancelled");
	await session.close();
});

test("C-KIMI-01 kimi settings select the fixed model; DeepSeek settings are untouched", async () => {
	const { parsePanSettings } = await import("../src/config/settings.ts");
	const kimi = parsePanSettings(JSON.stringify({ schemaVersion: 1, provider: "kimi-code", modelId: "kimi-for-coding", thinkingLevel: "high", credentialSource: "environment" }));
	assert.equal(kimi.provider, "kimi-code");
	assert.equal(kimi.modelId, KIMI_MODEL_ID);
	assert.throws(() => parsePanSettings(JSON.stringify({ schemaVersion: 1, provider: "kimi-code", modelId: "kimi-other", thinkingLevel: "high", credentialSource: "environment" })), /fixed model/);
	assert.throws(() => parsePanSettings(JSON.stringify({ schemaVersion: 1, provider: "moonshot", modelId: "kimi-for-coding", thinkingLevel: "high", credentialSource: "environment" })), /provider_unavailable/);
});
