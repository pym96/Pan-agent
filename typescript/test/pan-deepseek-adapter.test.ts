import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { setImmediate as waitImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { AgentToolDefinition } from "../src/agent-tool.ts";
import { runCli } from "../src/cli.ts";
import {
	UNAVAILABLE,
	type AssistantMessage,
	type Message,
	type ModelFailure,
	type ModelOutcome,
} from "../src/canonical-protocol.ts";
import type { DeepSeekProfile } from "../src/deepseek-profile.ts";
import {
	DeepSeekFetchTransport,
	type DeepSeekTransport,
	type DeepSeekTransportRequest,
	type DeepSeekTransportResponse,
} from "../src/deepseek-transport.ts";
import {
	DEEPSEEK_CONTEXT_OVERFLOW_CODES,
	DEEPSEEK_HTTP_FAILURE_TABLE,
	DEEPSEEK_OFFICIAL_CONTRACT,
	PanDeepSeekModelAdapter,
} from "../src/pan-deepseek-model-adapter.ts";
import { createPanTrustedLocalTools } from "../src/pan-trusted-local-tools.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import { GeneralAgentSession, type SessionObservation } from "../src/session.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_ROOT = join(REPOSITORY_ROOT, "typescript/test/fixtures/pan-deepseek-v1");
const TEST_RUNBOOK_REVISION = `sha256:${"3".repeat(64)}`;
const encoder = new TextEncoder();
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function sha256(body: string | Uint8Array): string {
	return createHash("sha256").update(body).digest("hex");
}

async function fixture(name: string): Promise<string> {
	return readFile(join(FIXTURE_ROOT, name), "utf8");
}

async function* chunks(...values: readonly Uint8Array[]): AsyncIterable<Uint8Array> {
	for (const value of values) yield value;
}

function response(status: number, body: string | readonly Uint8Array[]): DeepSeekTransportResponse {
	const values = typeof body === "string" ? [encoder.encode(body)] : body;
	return { status, body: chunks(...values) };
}

class ScriptedTransport implements DeepSeekTransport {
	readonly requests: DeepSeekTransportRequest[] = [];
	private readonly script: readonly (DeepSeekTransportResponse | Error | ((request: DeepSeekTransportRequest) => Promise<DeepSeekTransportResponse>))[];
	private cursor = 0;

	constructor(script: readonly (DeepSeekTransportResponse | Error | ((request: DeepSeekTransportRequest) => Promise<DeepSeekTransportResponse>))[]) {
		this.script = script;
	}

	async send(request: DeepSeekTransportRequest): Promise<DeepSeekTransportResponse> {
		this.requests.push(request);
		const entry = this.script[this.cursor];
		this.cursor += 1;
		if (entry === undefined) throw new Error("offline transport script exhausted");
		if (entry instanceof Error) throw entry;
		return typeof entry === "function" ? entry(request) : entry;
	}
}

function user(text: string, timestamp = 1): Message {
	return { role: "user", content: [{ type: "text", text }], timestamp };
}

const readDefinition: AgentToolDefinition = {
	name: "read",
	description: "Read one file.",
	parameters: {
		type: "object",
		properties: { path: { type: "string" } },
		required: ["path"],
		additionalProperties: false,
	},
};

function request(
	signal: AbortSignal,
	options: {
		sessionId?: string;
		messages?: readonly Message[];
		tools?: readonly AgentToolDefinition[];
		systemPrompt?: string;
	} = {},
) {
	return {
		sessionId: options.sessionId ?? "session-a",
		context: {
			systemPrompt: options.systemPrompt ?? "You are Pan.",
			messages: options.messages ?? [user("请读取。")],
			tools: options.tools ?? [readDefinition],
		},
		signal,
	};
}

function assertFailure(outcome: ModelOutcome, category: ModelFailure["category"], detail?: string): asserts outcome is ModelFailure {
	assert.equal(outcome.kind, "failure");
	assert.equal(outcome.category, category);
	if (detail !== undefined) assert.equal(outcome.detail, detail);
}

function wireEvent(value: Record<string, unknown>): string {
	return `data: ${JSON.stringify(value)}\n\n`;
}

function terminalSse(options: {
	id?: string;
	model?: string;
	fingerprint?: string;
	created?: number;
	content?: string;
	reasoning?: string;
	finishReason?: string;
	usage?: unknown;
	toolArguments?: string;
} = {}): string {
	const identity = {
		...(options.id === undefined ? { id: "ds-minimal" } : options.id.length === 0 ? {} : { id: options.id }),
		object: "chat.completion.chunk",
		created: options.created ?? 1788742805,
		...(options.model === undefined ? { model: "deepseek-v4-flash" } : options.model.length === 0 ? {} : { model: options.model }),
		...(options.fingerprint === undefined ? {} : { system_fingerprint: options.fingerprint }),
	};
	const toolCalls = options.toolArguments === undefined ? undefined : [{
		index: 0,
		id: "call-minimal",
		type: "function",
		function: { name: "read", arguments: options.toolArguments },
	}];
	const first = {
		...identity,
		choices: [{
			index: 0,
			delta: {
				role: "assistant",
				...(options.content === undefined ? {} : { content: options.content }),
				...(options.reasoning === undefined ? {} : { reasoning_content: options.reasoning }),
				...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
			},
			finish_reason: null,
		}],
		usage: null,
	};
	const terminal = {
		...identity,
		choices: [{ index: 0, delta: {}, finish_reason: options.finishReason ?? (toolCalls ? "tool_calls" : "stop") }],
		usage: options.usage ?? {
			prompt_tokens: 2,
			completion_tokens: 3,
			prompt_cache_hit_tokens: 0,
			prompt_cache_miss_tokens: 2,
			total_tokens: 5,
			completion_tokens_details: { reasoning_tokens: 1 },
		},
	};
	return `${wireEvent(first)}${wireEvent(terminal)}data: [DONE]\n\n`;
}

function toolSse(tag: string, reasoning: string, callId: string): string {
	const created = 1788742900;
	const base = {
		id: `ds-${tag}`,
		object: "chat.completion.chunk",
		created,
		model: "deepseek-v4-flash",
		system_fingerprint: `fp-${tag}`,
	};
	return `${wireEvent({
		...base,
		choices: [{
			index: 0,
			delta: {
				role: "assistant",
				reasoning_content: reasoning,
				tool_calls: [{ index: 0, id: callId, type: "function", function: { name: "read", arguments: "{\"path\":\"a.txt\"}" } }],
			},
			finish_reason: null,
		}],
		usage: null,
	})}${wireEvent({
		...base,
		choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
		usage: {
			prompt_tokens: 3, completion_tokens: 2, prompt_cache_hit_tokens: 0,
			prompt_cache_miss_tokens: 3, total_tokens: 5,
		},
	})}data: [DONE]\n\n`;
}

test("C-PFREE-C101 direct Pan Adapter construction and explicit Native CLI composition are inert and Pi-free", async () => {
	let credentialReads = 0;
	let fetchCalls = 0;
	const transport = new DeepSeekFetchTransport({
		credentialSource() { credentialReads += 1; return "synthetic-unit-token"; },
		fetchImplementation: (async () => {
			fetchCalls += 1;
			throw new Error("must not execute");
		}) as typeof fetch,
	});
	const adapter = new PanDeepSeekModelAdapter(undefined, { transport });
	assert.equal(adapter.providerId, "deepseek");
	assert.equal(credentialReads, 0);
	assert.equal(fetchCalls, 0);

	const root = await mkdtemp(join(tmpdir(), "pan-deepseek-cli-"));
	temporaryDirectories.push(root);
	const workspace = join(root, "workspace");
	await mkdir(workspace);
	let nativeConstructions = 0;
	const forbiddenFactory = () => { throw new Error("removed factory must not run"); };
	const exitCode = await runCli([
		"--workspace", workspace,
		"--memory-root", join(root, "memory"),
		"--kernel", "native",
	], {
		...{ createAdapter: forbiddenFactory },
		createNativeAdapter(profile) {
			nativeConstructions += 1;
			return new PanDeepSeekModelAdapter(profile, { transport });
		},
		startTui: async ({ session }) => {
			assert.equal(session.kernelKind, "native");
			return 0;
		},
	});
	assert.equal(exitCode, 0);
	assert.equal(nativeConstructions, 1);
	assert.doesNotMatch(await readFile(join(REPOSITORY_ROOT, "typescript/src/cli.ts"), "utf8"), /dependencies\.createAdapter/);
	assert.equal(credentialReads, 0);
	assert.equal(fetchCalls, 0);

	for (const name of ["deepseek-profile.ts", "deepseek-transport.ts", "pan-deepseek-model-adapter.ts"]) {
		const source = await readFile(join(REPOSITORY_ROOT, "typescript/src", name), "utf8");
		assert.doesNotMatch(source, /@earendil-works\/pi|adaptPi|PiModel|openai|anthropic/i, name);
	}
	const cli = await readFile(join(REPOSITORY_ROOT, "typescript/src/cli.ts"), "utf8");
	assert.match(cli, /createPanDeepSeekAdapter/);
	assert.doesNotMatch(cli, /adaptPiModelAdapter|createPiDeepSeekAdapter/);
});

test("C-PFREE-C101 Fetch transport resolves synthetic auth only at send and preserves the one-request envelope", async () => {
	let syntheticCredentialReads = 0;
	let syntheticFetchCalls = 0;
	let observedUrl = "";
	let observedInit: RequestInit | undefined;
	const transport = new DeepSeekFetchTransport({
		baseUrl: "https://offline.invalid/",
		credentialSource() { syntheticCredentialReads += 1; return "unit-only-token"; },
		fetchImplementation: (async (input, init) => {
			syntheticFetchCalls += 1;
			observedUrl = String(input);
			observedInit = init;
			return new Response("offline-response", { status: 201 });
		}) as typeof fetch,
	});
	assert.equal(syntheticCredentialReads, 0);
	assert.equal(syntheticFetchCalls, 0);
	const controller = new AbortController();
	const transportResponse = await transport.send({
		method: "POST",
		path: "/chat/completions",
		headers: { accept: "text/event-stream", "content-type": "application/json" },
		body: "{\"offline\":true}",
		signal: controller.signal,
	});
	assert.equal(syntheticCredentialReads, 1);
	assert.equal(syntheticFetchCalls, 1);
	assert.equal(observedUrl, "https://offline.invalid/chat/completions");
	assert.equal(observedInit?.method, "POST");
	assert.deepEqual(observedInit?.headers, {
		accept: "text/event-stream",
		"content-type": "application/json",
		authorization: "Bearer unit-only-token",
	});
	assert.equal(observedInit?.body, "{\"offline\":true}");
	let body = "";
	for await (const part of transportResponse.body) body += new TextDecoder().decode(part);
	assert.equal(body, "offline-response");
});

test("C-PFREE-C102 exact Context encoding, private reasoning replay and session isolation", async () => {
	const single = await fixture("single-tool.sse");
	const final = await fixture("final.sse");
	const transport = new ScriptedTransport([response(200, single), response(200, final)]);
	const adapter = new PanDeepSeekModelAdapter(undefined, { transport });
	const controller = new AbortController();
	const first = await adapter.exchange(request(controller.signal));
	assert.equal(first.kind, "response");
	assert.equal(first.stopReason, "tool_calls");
	assert.deepEqual(first.message.content, [
		{ type: "tool_call", id: "call-1", name: "read", arguments: { path: "a.txt" } },
	]);
	assert.deepEqual(first.diagnostics, { reasoning: { state: "present" } });
	assert.doesNotMatch(JSON.stringify(first), /private-r1/);

	const toolResult: Message = {
		role: "tool_result", toolCallId: "call-1", toolName: "read",
		content: [{ type: "text", text: "A" }], isError: false, timestamp: 3,
	};
	await adapter.exchange(request(controller.signal, { messages: [user("请读取。"), first.message, toolResult] }));
	assert.equal(transport.requests.length, 2);
	const emitted = transport.requests.map((item) => JSON.parse(item.body) as Record<string, unknown>);
	const expected = JSON.parse(await fixture("request-history.expected.json"));
	assert.deepEqual(emitted[1], expected);
	for (const item of transport.requests) {
		assert.equal(item.method, "POST");
		assert.equal(item.path, "/chat/completions");
		assert.deepEqual(item.headers, { accept: "text/event-stream", "content-type": "application/json" });
		const body = JSON.parse(item.body) as Record<string, unknown>;
		assert.equal(body.tool_choice, undefined);
		assert.equal(body.temperature, undefined);
		assert.equal(body.max_tokens, undefined);
	}
	for (const thinkingLevel of ["low", "high", "max"] as const) {
		const levelTransport = new ScriptedTransport([response(200, final)]);
		const profile: DeepSeekProfile = { modelId: "deepseek-v4-flash", thinkingLevel };
		await new PanDeepSeekModelAdapter(profile, { transport: levelTransport })
			.exchange(request(controller.signal, { tools: [] }));
		const levelBody = JSON.parse(levelTransport.requests[0]?.body ?? "{}") as Record<string, unknown>;
		assert.equal(levelBody.reasoning_effort, thinkingLevel);
		assert.deepEqual(levelBody.thinking, { type: "enabled" });
	}

	const finalThenNoTools = new ScriptedTransport([response(200, final), response(200, final)]);
	const noToolsAdapter = new PanDeepSeekModelAdapter(undefined, { transport: finalThenNoTools });
	const finalOutcome = await noToolsAdapter.exchange(request(controller.signal, { sessionId: "no-tools", tools: [] }));
	assert.equal(finalOutcome.kind, "response");
	await noToolsAdapter.exchange(request(controller.signal, {
		sessionId: "no-tools",
		tools: [],
		messages: [user("请读取。"), finalOutcome.message, user("continue", 4)],
	}));
	const noToolsBody = JSON.parse(finalThenNoTools.requests[1]?.body ?? "{}") as { messages: Record<string, unknown>[] };
	assert.equal(noToolsBody.messages[2]?.content, "你好，Pan。");
	assert.equal(noToolsBody.messages[2]?.reasoning_content, undefined);

	const interleavedTransport = new ScriptedTransport([
		response(200, toolSse("a", "reason-a", "call-a")),
		response(200, toolSse("b", "reason-b", "call-b")),
		response(200, final),
		response(200, final),
	]);
	const interleaved = new PanDeepSeekModelAdapter(undefined, { transport: interleavedTransport });
	const a = await interleaved.exchange(request(controller.signal, { sessionId: "A" }));
	const b = await interleaved.exchange(request(controller.signal, { sessionId: "B" }));
	assert.equal(a.kind, "response");
	assert.equal(b.kind, "response");
	const settle = (outcome: typeof a, sessionId: string, callId: string) => request(controller.signal, {
		sessionId,
		messages: [
			user("请读取。"),
			(outcome as Extract<ModelOutcome, { kind: "response" }>).message,
			{ role: "tool_result", toolCallId: callId, toolName: "read", content: [{ type: "text", text: sessionId }], isError: false, timestamp: 3 },
		],
	});
	await interleaved.exchange(settle(a, "A", "call-a"));
	await interleaved.exchange(settle(b, "B", "call-b"));
	const aBody = JSON.parse(interleavedTransport.requests[2]?.body ?? "{}") as { messages: Record<string, unknown>[] };
	const bBody = JSON.parse(interleavedTransport.requests[3]?.body ?? "{}") as { messages: Record<string, unknown>[] };
	assert.equal(aBody.messages[2]?.reasoning_content, "reason-a");
	assert.equal(bBody.messages[2]?.reasoning_content, "reason-b");
	assert.doesNotMatch(JSON.stringify(aBody), /reason-b/);
	assert.doesNotMatch(JSON.stringify(bBody), /reason-a/);

	const beforeMismatch = interleavedTransport.requests.length;
	const changedAssistant = structuredClone((a as Extract<ModelOutcome, { kind: "response" }>).message);
	(changedAssistant.content[0] as { arguments: Record<string, string> }).arguments.path = "changed.txt";
	const mismatch = await interleaved.exchange(request(controller.signal, {
		sessionId: "A",
		messages: [user("请读取。"), changedAssistant, {
			role: "tool_result", toolCallId: "call-a", toolName: "read",
			content: [{ type: "text", text: "A" }], isError: false, timestamp: 3,
		}],
	}));
	assertFailure(mismatch, "protocol", "deepseek_session_history_length_mismatch");
	assert.equal(interleavedTransport.requests.length, beforeMismatch);

	const imageTransport = new ScriptedTransport([]);
	const imageAdapter = new PanDeepSeekModelAdapter(undefined, { transport: imageTransport });
	const image = await imageAdapter.exchange(request(controller.signal, {
		messages: [{ role: "user", content: [{ type: "image", data: "x", mediaType: "image/png" }], timestamp: 1 }],
	}));
	assertFailure(image, "protocol", "deepseek_image_input_unsupported");
	assert.equal(imageTransport.requests.length, 0);
});

test("C-PFREE-C103 every valid SSE fixture is byte-split invariant", async () => {
	for (const name of ["final.sse", "single-tool.sse", "multiple-tools.sse", "empty-reasoning.sse", "length.sse"]) {
		const body = encoder.encode(await fixture(name));
		const baselineTransport = new ScriptedTransport([response(200, [body])]);
		const baseline = await new PanDeepSeekModelAdapter(undefined, { transport: baselineTransport })
			.exchange(request(new AbortController().signal));
		assert.equal(baseline.kind, "response", name);
		for (let boundary = 0; boundary <= body.byteLength; boundary += 1) {
			const splitTransport = new ScriptedTransport([response(200, [body.slice(0, boundary), body.slice(boundary)])]);
			const outcome = await new PanDeepSeekModelAdapter(undefined, { transport: splitTransport })
				.exchange(request(new AbortController().signal));
			assert.deepEqual(outcome, baseline, `${name} byte boundary ${boundary}`);
		}
	}
});

test("C-PFREE-C103 malformed stream table settles typed without partial response", async () => {
	const final = await fixture("final.sse");
	const single = await fixture("single-tool.sse");
	const firstIdOffset = final.indexOf('"id":"ds-final-1"');
	const secondIdOffset = final.indexOf('"id":"ds-final-1"', firstIdOffset + 1);
	const secondId = `${final.slice(0, secondIdOffset)}${final.slice(secondIdOffset).replace('"id":"ds-final-1"', '"id":"changed"')}`;
	const terminalLine = final.split("\n").find((line) => line.includes('"finish_reason":"stop"')) ?? "";
	const normalLine = final.split("\n").find((line) => line.includes("你好")) ?? "";
	const cases: readonly [string, string | Uint8Array[]][] = [
		["invalid-json", "data: {\n\ndata: [DONE]\n\n"],
		["invalid-utf8", [new Uint8Array([0xc3, 0x28])]],
		["missing-done", final.replace("data: [DONE]\n", "")],
		["duplicate-done", `${final}data: [DONE]\n\n`],
		["data-after-terminal", final.replace("data: [DONE]", `${normalLine}\n\ndata: [DONE]`)],
		["duplicate-terminal", final.replace("data: [DONE]", `${terminalLine}\n\ndata: [DONE]`)],
		["inconsistent-identity", secondId],
		["unknown-finish", final.replace('"finish_reason":"stop"', '"finish_reason":"future"')],
		["incomplete-tool", terminalSse({ toolArguments: "" })],
		["invalid-tool-json", terminalSse({ toolArguments: "{" })],
		["non-object-tool-json", terminalSse({ toolArguments: "[]" })],
		["truncated", single.slice(0, Math.floor(single.length / 2))],
		["usage-before-terminal", final.replace('"usage":null}', '"usage":{"prompt_tokens":1}}')],
	];
	for (const [name, body] of cases) {
		const transport = new ScriptedTransport([response(200, typeof body === "string" ? body : body)]);
		const outcome = await new PanDeepSeekModelAdapter(undefined, { transport })
			.exchange(request(new AbortController().signal));
		assert.equal(outcome.kind, "failure", name);
		assertFailure(outcome, "protocol");
		assert.equal(transport.requests.length, 1, name);
		assert.equal(outcome.usage, UNAVAILABLE, name);
	}
});

test("C-PFREE-C104 usage and response identity preserve reported, absent and malformed meanings", async () => {
	const final = await fixture("final.sse");
	const transport = new ScriptedTransport([response(200, final)]);
	const outcome = await new PanDeepSeekModelAdapter(undefined, { transport })
		.exchange(request(new AbortController().signal));
	assert.equal(outcome.kind, "response");
	assert.deepEqual(outcome.usage, {
		status: "reported",
		value: { input: 11, output: 7, cacheRead: 3, reasoning: 4, totalTokens: 18 },
	});
	assert.deepEqual(outcome.identity, {
		provider: { status: "reported", value: "deepseek" },
		model: { status: "reported", value: "deepseek-v4-flash" },
		responseId: { status: "reported", value: "ds-final-1" },
		backendFingerprint: { status: "reported", value: "fp-final" },
	});
	assert.equal("cacheWrite" in outcome.usage.value, false);
	assert.equal("cost" in outcome.usage.value, false);

	const zeroBody = terminalSse({ id: "", model: "", content: "zero", usage: {
		prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0,
		prompt_cache_miss_tokens: 0, total_tokens: 0,
	} });
	const zero = await new PanDeepSeekModelAdapter(undefined, { transport: new ScriptedTransport([response(200, zeroBody)]) })
		.exchange(request(new AbortController().signal));
	assert.equal(zero.kind, "response");
	assert.deepEqual(zero.identity.model, UNAVAILABLE);
	assert.deepEqual(zero.identity.responseId, UNAVAILABLE);
	assert.deepEqual(zero.identity.backendFingerprint, UNAVAILABLE);
	assert.deepEqual(zero.usage, { status: "reported", value: { input: 0, output: 0, cacheRead: 0, totalTokens: 0 } });

	for (const [name, usage] of [
		["missing", undefined],
		["malformed", { prompt_tokens: 1, completion_tokens: -1, prompt_cache_hit_tokens: 0, total_tokens: 0 }],
	] as const) {
		const body = terminalSse({ content: name, usage: usage as unknown });
		const adjusted = usage === undefined ? body.replace(/,"usage":\{[^\n]+?\}\n\ndata: \[DONE\]/, "\n\ndata: [DONE]") : body;
		const malformed = await new PanDeepSeekModelAdapter(undefined, { transport: new ScriptedTransport([response(200, adjusted)]) })
			.exchange(request(new AbortController().signal));
		assertFailure(malformed, "protocol");
	}
});

test("C-PFREE-C105 cancellation, transport and exact HTTP failures settle once without retry or canary leakage", async () => {
	const preTransport = new ScriptedTransport([]);
	const preController = new AbortController();
	preController.abort();
	const pre = await new PanDeepSeekModelAdapter(undefined, { transport: preTransport }).exchange(request(preController.signal));
	assertFailure(pre, "cancelled");
	assert.equal(preTransport.requests.length, 0);

	let headerStarted!: () => void;
	const headerReady = new Promise<void>((resolveReady) => { headerStarted = resolveReady; });
	const headerTransport = new ScriptedTransport([async (transportRequest) => {
		headerStarted();
		await new Promise<never>((_resolve, reject) => {
			transportRequest.signal.addEventListener("abort", () => reject(new DOMException("secret-header", "AbortError")), { once: true });
		});
		throw new Error("unreachable");
	}]);
	const headerController = new AbortController();
	const pendingHeaders = new PanDeepSeekModelAdapter(undefined, { transport: headerTransport }).exchange(request(headerController.signal));
	await headerReady;
	headerController.abort();
	assertFailure(await pendingHeaders, "cancelled");
	assert.equal(headerTransport.requests.length, 1);

	let streamStarted!: () => void;
	const streamReady = new Promise<void>((resolveReady) => { streamStarted = resolveReady; });
	const midstreamTransport = new ScriptedTransport([async (transportRequest) => ({
		status: 200,
		body: (async function* () {
			yield encoder.encode("data: ");
			streamStarted();
			await new Promise<never>((_resolve, reject) => {
				transportRequest.signal.addEventListener(
					"abort",
					() => reject(new DOMException("private-reason-canary", "AbortError")),
					{ once: true },
				);
			});
		})(),
	})]);
	const streamController = new AbortController();
	const pendingStream = new PanDeepSeekModelAdapter(undefined, { transport: midstreamTransport }).exchange(request(streamController.signal));
	await streamReady;
	streamController.abort();
	const cancelled = await pendingStream;
	assertFailure(cancelled, "cancelled");
	assert.doesNotMatch(JSON.stringify(cancelled), /private-reason-canary/);
	assert.equal(midstreamTransport.requests.length, 1);

	const network = new ScriptedTransport([new Error("credential-secret-canary")]);
	const networkFailure = await new PanDeepSeekModelAdapter(undefined, { transport: network })
		.exchange(request(new AbortController().signal));
	assertFailure(networkFailure, "transport", "deepseek_transport_failure");
	assert.doesNotMatch(JSON.stringify(networkFailure), /credential-secret-canary/);
	assert.equal(network.requests.length, 1);

	const bodyFailureTransport = new ScriptedTransport([{
		status: 200,
		body: (async function* () {
			yield encoder.encode("data: ");
			throw new Error("midstream-secret-canary");
		})(),
	}]);
	const bodyFailure = await new PanDeepSeekModelAdapter(undefined, { transport: bodyFailureTransport })
		.exchange(request(new AbortController().signal));
	assertFailure(bodyFailure, "transport", "deepseek_transport_failure");
	assert.doesNotMatch(JSON.stringify(bodyFailure), /midstream-secret-canary/);
	assert.equal(bodyFailureTransport.requests.length, 1);

	for (const [finishReason, retryable] of [["content_filter", false], ["insufficient_system_resource", true]] as const) {
		const providerOutcome = await new PanDeepSeekModelAdapter(undefined, {
			transport: new ScriptedTransport([response(200, terminalSse({ content: "filtered", finishReason }))]),
		}).exchange(request(new AbortController().signal));
		assertFailure(providerOutcome, "provider");
		assert.equal(providerOutcome.retryable, retryable);
	}

	const failureCases = JSON.parse(await fixture("failure-cases.json")) as {
		http: Array<{ status: number; body: unknown; category: ModelFailure["category"]; retryable: boolean; detail: string }>;
	};
	for (const entry of failureCases.http) {
		const body = typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body);
		const httpTransport = new ScriptedTransport([response(entry.status, body)]);
		const outcome = await new PanDeepSeekModelAdapter(undefined, { transport: httpTransport })
			.exchange(request(new AbortController().signal));
		assertFailure(outcome, entry.category, entry.detail);
		assert.equal(outcome.retryable, entry.retryable);
		assert.equal(httpTransport.requests.length, 1);
		assert.doesNotMatch(JSON.stringify(outcome), /secret-canary/);
	}
	assert.deepEqual(DEEPSEEK_CONTEXT_OVERFLOW_CODES, ["context_length_exceeded", "context_overflow"]);
	assert.deepEqual(Object.keys(DEEPSEEK_HTTP_FAILURE_TABLE).map(Number), [400, 401, 402, 422, 429, 500, 503]);
});

async function publicHarness(
	transport: DeepSeekTransport,
	options: { onObservation?: (observation: SessionObservation) => void } = {},
) {
	const root = await mkdtemp(join(tmpdir(), "pan-deepseek-public-"));
	temporaryDirectories.push(root);
	const workspace = join(root, "workspace");
	const memory = join(root, "memory");
	await mkdir(workspace);
	await writeFile(join(workspace, "a.txt"), "A", "utf8");
	const archiveStore = await RunArchiveStore.open(memory);
	const observations: SessionObservation[] = [];
	const session = new GeneralAgentSession({
		kernel: "native",
		adapter: new PanDeepSeekModelAdapter(undefined, { transport }),
		tools: createPanTrustedLocalTools(workspace, { PATH: process.env.PATH }).tools,
		systemPrompt: "Pan direct DeepSeek public tracer",
		memory: {
			archiveStore,
			runbook: async () => ({ content: "offline", revision: TEST_RUNBOOK_REVISION }),
		},
		onObservation(observation) {
			observations.push(observation);
			options.onObservation?.(observation);
		},
	});
	return { root, workspace, memory, archiveStore, observations, session };
}

test("C-PFREE-C106 public Native Session traverses direct final, Tool, batch, length and failure fixtures", async () => {
	const final = await fixture("final.sse");
	const single = await fixture("single-tool.sse");
	const multiple = await fixture("multiple-tools.sse");
	for (const scenario of [
		{ name: "final", script: [response(200, final)], status: "completed", toolCalls: 0 },
		{ name: "single", script: [response(200, single), response(200, final)], status: "completed", toolCalls: 1 },
		{ name: "multiple", script: [response(200, multiple), response(200, final)], status: "completed", toolCalls: 2 },
		{ name: "length", script: [response(200, await fixture("length.sse"))], status: "incomplete", toolCalls: 0 },
		{ name: "http", script: [response(429, "{}")], status: "model_error", toolCalls: 0 },
		{ name: "malformed", script: [response(200, "data: {\n\ndata: [DONE]\n\n")], status: "model_error", toolCalls: 0 },
	] as const) {
		const transport = new ScriptedTransport(scenario.script);
		const harness = await publicHarness(transport);
		try {
			const result = await harness.session.runTask(`scenario ${scenario.name}`);
			assert.equal(result.status, scenario.status, scenario.name);
			assert.equal(result.toolCalls, scenario.toolCalls, scenario.name);
			assert.equal(result.archiveSealed, true, scenario.name);
			assert.equal(transport.requests.length, scenario.name === "single" || scenario.name === "multiple" ? 2 : 1);
			const records = await harness.archiveStore.readArchive(result.runId);
			assert.equal(records[0]?.type, "run.started");
			assert.equal(records.at(-1)?.type, "run.settled");
			assert.equal(records.filter((record) => record.type === "run.terminal").length, 1);
			assert.equal(records.filter((record) => record.type === "tool.started").length, scenario.toolCalls);
			assert.equal(records.filter((record) => record.type === "tool.settled").length, scenario.toolCalls);
			assert.doesNotMatch(JSON.stringify(records), /private-final|private-r1/);
			if (scenario.name === "final") {
				const settlement = records.find((record) => record.type === "model.turn_settled") as { identity: { backendFingerprint: unknown } };
				assert.deepEqual(settlement.identity.backendFingerprint, { status: "reported", value: "fp-final" });
			}
			if (scenario.name === "multiple") {
				assert.deepEqual(
					harness.observations.filter((event) => event.type === "tool.started").map((event) => event.type === "tool.started" ? event.toolCallId : ""),
					["call-a", "call-b"],
				);
				assert.equal(await readFile(join(harness.workspace, "b.txt"), "utf8"), "B");
			}
		} finally {
			await harness.session.close();
		}
	}
});

test("C-PFREE-C106 public active cancellation reaches transport, seals once and executes no Tool", async () => {
	let transportStarted!: () => void;
	const started = new Promise<void>((resolveStarted) => { transportStarted = resolveStarted; });
	const transport = new ScriptedTransport([async (transportRequest) => {
		transportStarted();
		return new Promise<DeepSeekTransportResponse>((_resolve, reject) => {
			transportRequest.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
		});
	}]);
	const harness = await publicHarness(transport);
	try {
		const pending = harness.session.runTask("cancel active request");
		await started;
		harness.session.cancel();
		const result = await pending;
		assert.equal(result.status, "cancelled");
		assert.equal(result.toolCalls, 0);
		assert.equal(transport.requests.length, 1);
		const records = await harness.archiveStore.readArchive(result.runId);
		assert.equal(records.filter((record) => record.type === "run.terminal").length, 1);
		assert.equal(records.at(-1)?.type, "run.settled");
		await waitImmediate();
		assert.equal((await harness.archiveStore.readArchive(result.runId)).length, records.length);
	} finally {
		await harness.session.close();
	}
});

test("C-PFREE-C108 fixture and official-contract identities are content-pinned and secret-free", async () => {
	const manifest = JSON.parse(await fixture("manifest.json")) as {
		files: Record<string, string>;
		provider_calls: number;
		credential_reads: number;
		balance_queries: number;
		paid_or_formal_runs: number;
		cost_cny: number;
	};
	for (const [name, expected] of Object.entries(manifest.files)) {
		const body = await readFile(join(FIXTURE_ROOT, name));
		assert.equal(sha256(body), expected, name);
		assert.doesNotMatch(body.toString("utf8"), /sk-[a-z0-9]{12,}|DEEPSEEK_API_KEY=/i, name);
	}
	assert.deepEqual(
		{
			provider_calls: manifest.provider_calls,
			credential_reads: manifest.credential_reads,
			balance_queries: manifest.balance_queries,
			paid_or_formal_runs: manifest.paid_or_formal_runs,
			cost_cny: manifest.cost_cny,
		},
		{ provider_calls: 0, credential_reads: 0, balance_queries: 0, paid_or_formal_runs: 0, cost_cny: 0 },
	);
	assert.deepEqual([
		DEEPSEEK_OFFICIAL_CONTRACT.chatCompletions.sha256,
		DEEPSEEK_OFFICIAL_CONTRACT.thinkingMode.sha256,
		DEEPSEEK_OFFICIAL_CONTRACT.toolCalls.sha256,
		DEEPSEEK_OFFICIAL_CONTRACT.errorCodes.sha256,
	], [
		"67b6a6c8ab70f51ad56f6018077ac58768d95f73b53639b4d00b3f6d57a4fad9",
		"f28c43248d26db1f27af0cb082abb00326c957d560d33a21839736edd1d10724",
		"41420d8609a15ff13afd5b82a66ea1b2a5440a59787718ade7f48230b660bcfa",
		"0dd0c3c189933e69d1de6be900f6a1653ab2b543dd3a720baf1eb48c19dff916",
	]);
});
