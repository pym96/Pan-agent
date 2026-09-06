import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import type { AgentTool } from "../src/agent-tool.ts";
import {
	UNAVAILABLE,
	validateCanonicalContext,
	validateModelOutcome,
	type JsonObject,
	type Message,
	type ModelFailure,
	type ModelOutcome,
	type ModelResponse,
	type ResponseIdentity,
	type Usage,
} from "../src/canonical-protocol.ts";
import type { ModelAdapter, ModelExchangeRequest } from "../src/model-adapter-contract.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import { GeneralAgentSession, type SessionObservation } from "../src/session.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "pan-agent-contracts-"));
	temporaryDirectories.push(path);
	return path;
}

function reportedIdentity(responseId?: string): ResponseIdentity {
	return {
		provider: { status: "reported", value: "scripted" },
		model: { status: "reported", value: "scripted-v1" },
		responseId: responseId === undefined ? UNAVAILABLE : { status: "reported", value: responseId },
	};
}

function reportedUsage(totalTokens = 0): Usage {
	return {
		status: "reported",
		value: {
			input: totalTokens,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
}

function response(
	content: ModelResponse["message"]["content"],
	options: { responseId?: string; usage?: Usage; reasoning?: "present" | "redacted"; timestamp?: number } = {},
): ModelResponse {
	return {
		kind: "response",
		message: { role: "assistant", content, timestamp: options.timestamp ?? 1 },
		stopReason: content.some((item) => item.type === "tool_call") ? "tool_calls" : "stop",
		usage: options.usage ?? reportedUsage(1),
		identity: reportedIdentity(options.responseId),
		...(options.reasoning ? { diagnostics: { reasoning: { state: options.reasoning } } } : {}),
	};
}

type ScriptEntry = ModelOutcome | ((request: ModelExchangeRequest) => Promise<ModelOutcome> | ModelOutcome);

class ScriptedAdapter implements ModelAdapter {
	readonly providerId = "scripted";
	readonly modelId = "scripted-v1";
	readonly reasoningLevel = "test";
	readonly requests: ModelExchangeRequest[] = [];
	private readonly script: ScriptEntry[];

	constructor(script: readonly ScriptEntry[]) {
		this.script = [...script];
	}

	async exchange(request: ModelExchangeRequest): Promise<ModelOutcome> {
		this.requests.push(request);
		const entry = this.script.shift();
		if (!entry) throw new Error("script_exhausted");
		return typeof entry === "function" ? entry(request) : entry;
	}
}

type RecordArguments = JsonObject & { readonly value: string };

function recordTool(effect: (argumentsValue: RecordArguments, signal: AbortSignal) => void | Promise<void>): AgentTool<RecordArguments> {
	return {
		name: "record",
		description: "Record a deterministic string.",
		parameters: {
			type: "object",
			properties: { value: { type: "string" } },
			required: ["value"],
			additionalProperties: false,
		},
		validate(argumentsValue) {
			return typeof argumentsValue.value === "string" && Object.keys(argumentsValue).length === 1
				? { ok: true, value: argumentsValue as RecordArguments }
				: { ok: false, error: "schema_invalid:record" };
		},
		async execute({ arguments: argumentsValue, signal }) {
			await effect(argumentsValue, signal);
			return { content: [{ type: "text", text: `recorded:${argumentsValue.value}` }] };
		},
	};
}

async function nativeSession(
	root: string,
	adapter: ModelAdapter,
	tools: readonly AgentTool[] = [],
	observations: SessionObservation[] = [],
	onObservation: (observation: SessionObservation) => void = () => {},
): Promise<{ session: GeneralAgentSession; archiveStore: RunArchiveStore }> {
	const archiveStore = await RunArchiveStore.open(join(root, "memory"));
	return {
		archiveStore,
		session: new GeneralAgentSession({
			kernel: "native",
			adapter,
			tools,
			systemPrompt: "Pan canonical contract test",
			memory: {
				archiveStore,
				runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
			},
			onObservation(observation) {
				observations.push(observation);
				onObservation(observation);
			},
		}),
	};
}

test("C-PFREE-A01 canonical values stay structural and reject invalid correlation/arguments", () => {
	const valid = response([
		{ type: "text", text: "I will use two tools." },
		{ type: "tool_call", id: "call-1", name: "record", arguments: { value: "one", nested: { n: 1 } } },
		{ type: "tool_call", id: "call-2", name: "record", arguments: { value: "two" } },
	], { responseId: "response-1", reasoning: "present" });
	validateModelOutcome(valid, []);
	const roundTrip = JSON.parse(JSON.stringify(valid)) as ModelResponse;
	assert.deepEqual(roundTrip, valid);
	const roundTripCall = roundTrip.message.content[1];
	assert.equal(roundTripCall?.type, "tool_call");
	assert.equal(typeof (roundTripCall?.type === "tool_call" ? roundTripCall.arguments.nested : undefined), "object");
	assert.doesNotMatch(JSON.stringify(valid.message.content), /PRIVATE_REASONING/);

	const duplicate = response([
		{ type: "tool_call", id: "same", name: "record", arguments: {} },
		{ type: "tool_call", id: "same", name: "record", arguments: {} },
	]);
	assert.throws(() => validateModelOutcome(duplicate, []), /duplicate_tool_call_id:same/);
	assert.throws(
		() => validateModelOutcome(response([{ type: "tool_call", id: "array", name: "record", arguments: [] as unknown as JsonObject }]), []),
		/json_object_required:arguments/,
	);
	assert.throws(
		() => validateModelOutcome(response([{
			type: "tool_call", id: "undefined", name: "record",
			arguments: { value: undefined } as unknown as JsonObject,
		}]), []),
		/json_incompatible:arguments.value/,
	);

	const orphan: Message[] = [{
		role: "tool_result", toolCallId: "orphan", toolName: "record",
		content: [{ type: "text", text: "no call" }], isError: true, timestamp: 1,
	}];
	assert.throws(() => validateCanonicalContext(orphan), /orphan_tool_result:orphan/);
	const mismatch: Message[] = [
		{ role: "assistant", content: [{ type: "tool_call", id: "call", name: "record", arguments: {} }], timestamp: 1 },
		{ role: "tool_result", toolCallId: "call", toolName: "other", content: [], isError: true, timestamp: 2 },
	];
	assert.throws(() => validateCanonicalContext(mismatch), /tool_result_name_mismatch:call/);
});

test("C-PFREE-A02 unavailable usage/identity stay distinct from reported zero and failures are not assistant content", async () => {
	const unavailableFailure: ModelFailure = {
		kind: "failure",
		category: "transport",
		detail: "synthetic_transport_failure",
		retryable: true,
		usage: UNAVAILABLE,
		identity: { provider: UNAVAILABLE, model: UNAVAILABLE, responseId: UNAVAILABLE },
	};
	validateModelOutcome(unavailableFailure, []);
	assert.notDeepEqual(UNAVAILABLE, reportedUsage(0));
	assert.equal("value" in unavailableFailure.usage, false);
	assert.equal("value" in unavailableFailure.identity.responseId, false);

	const root = await temporaryRoot();
	const observations: SessionObservation[] = [];
	const adapter = new ScriptedAdapter([unavailableFailure]);
	const harness = await nativeSession(root, adapter, [], observations);
	try {
		const result = await harness.session.runTask("retain an honest model failure");
		assert.equal(result.status, "model_error");
		assert.equal(result.finalText, "");
		assert.deepEqual(result.usage, UNAVAILABLE);
		const settlement = observations.find((event) => event.type === "model.turn_settled");
		assert.ok(settlement?.type === "model.turn_settled");
		assert.deepEqual(settlement.failure, unavailableFailure);
		assert.equal(settlement.provider, undefined);
		assert.equal(settlement.responseId, undefined);
		const archive = await harness.archiveStore.readArchive(result.runId);
		const archivedSettlement = archive.find((event) => event.type === "model.turn_settled");
		assert.deepEqual(archivedSettlement?.failure, unavailableFailure);
	} finally {
		await harness.session.close();
	}
});

test("C-PFREE-A03/A05 Native session uses one Pan ModelAdapter seam for final and ToolResult feedback", async () => {
	const finalRoot = await temporaryRoot();
	const finalObservations: SessionObservation[] = [];
	const finalAdapter = new ScriptedAdapter([
		response([{ type: "text", text: "direct final" }], { responseId: "final-id", usage: reportedUsage(0) }),
	]);
	const finalHarness = await nativeSession(finalRoot, finalAdapter, [], finalObservations);
	try {
		const result = await finalHarness.session.runTask("finish directly");
		assert.equal(result.finalText, "direct final");
		assert.equal(result.modelCalls, 1);
		assert.deepEqual(result.usage, reportedUsage(0));
		assert.equal(finalAdapter.requests.length, 1);
		assert.deepEqual(finalAdapter.requests[0]?.context.messages.map((message) => message.role), ["user"]);
		const settlement = finalObservations.find((event) => event.type === "model.turn_settled");
		assert.ok(settlement?.type === "model.turn_settled");
		assert.deepEqual(settlement.usage, reportedUsage(0));
		assert.deepEqual(settlement.identity, reportedIdentity("final-id"));
		assert.equal(finalObservations.filter((event) => event.type === "run.terminal").length, 1);
		assert.equal((await finalHarness.archiveStore.readArchive(result.runId)).at(-1)?.type, "run.settled");
	} finally {
		await finalHarness.session.close();
	}

	const toolRoot = await temporaryRoot();
	const toolObservations: SessionObservation[] = [];
	let effects = 0;
	const toolAdapter = new ScriptedAdapter([
		response([
			{ type: "text", text: "Calling the tool is compatible with public text." },
			{ type: "tool_call", id: "record-1", name: "record", arguments: { value: "alpha" } },
		], { responseId: "tool-id" }),
		(request) => {
			const result = request.context.messages.at(-1);
			assert.equal(result?.role, "tool_result");
			assert.equal(result?.role === "tool_result" ? result.toolCallId : undefined, "record-1");
			assert.equal(result?.role === "tool_result" ? result.content[0]?.type === "text" && result.content[0].text : undefined, "recorded:alpha");
			return response([{ type: "text", text: "tool complete" }], { responseId: "complete-id" });
		},
	]);
	const tool = recordTool(() => { effects += 1; });
	const toolHarness = await nativeSession(toolRoot, toolAdapter, [tool], toolObservations);
	try {
		const result = await toolHarness.session.runTask("use the record tool");
		assert.equal(result.status, "completed");
		assert.equal(result.finalText, "tool complete");
		assert.equal(result.modelCalls, 2);
		assert.equal(result.toolCalls, 1);
		assert.equal(effects, 1);
		assert.equal(toolAdapter.requests.length, 2);
		assert.deepEqual(toolAdapter.requests[0]?.context.tools, [{
			name: "record",
			description: "Record a deterministic string.",
			parameters: tool.parameters,
		}]);
		assert.equal(toolObservations.at(-1)?.type, "run.terminal");
		assert.equal((await toolHarness.archiveStore.readArchive(result.runId)).at(-1)?.type, "run.settled");
	} finally {
		await toolHarness.session.close();
	}
});

test("C-PFREE-A03 cancellation reaches the active adapter and admits no later exchange", async () => {
	const root = await temporaryRoot();
	let exchangeStarted!: () => void;
	const started = new Promise<void>((resolve) => { exchangeStarted = resolve; });
	let abortObserved = false;
	const adapter = new ScriptedAdapter([
		(request) => new Promise<ModelOutcome>((resolve) => {
			exchangeStarted();
			request.signal.addEventListener("abort", () => {
				abortObserved = true;
				resolve({
					kind: "failure", category: "cancelled", detail: "operator_cancelled", retryable: false,
					usage: UNAVAILABLE, identity: { provider: UNAVAILABLE, model: UNAVAILABLE, responseId: UNAVAILABLE },
				});
			}, { once: true });
		}),
		response([{ type: "text", text: "must not run" }]),
	]);
	const harness = await nativeSession(root, adapter);
	try {
		const pending = harness.session.runTask("wait for cancellation");
		await started;
		harness.session.cancel();
		const result = await pending;
		assert.equal(result.status, "cancelled");
		assert.equal(result.modelCalls, 1);
		assert.equal(abortObserved, true);
		assert.equal(adapter.requests.length, 1);
	} finally {
		await harness.session.close();
	}
});

test("C-PFREE-A04 unknown/schema-invalid/cancelled ToolCalls have zero implementation effects", async () => {
	const invalidRoot = await temporaryRoot();
	let effects = 0;
	const invalidAdapter = new ScriptedAdapter([
		response([
			{ type: "tool_call", id: "unknown", name: "missing", arguments: {} },
			{ type: "tool_call", id: "invalid", name: "record", arguments: {} },
		]),
		(request) => {
			const results = request.context.messages.filter((message) => message.role === "tool_result");
			assert.deepEqual(results.map((result) => [result.toolCallId, result.isError]), [
				["unknown", true], ["invalid", true],
			]);
			return response([{ type: "text", text: "rejections observed" }]);
		},
	]);
	const invalidHarness = await nativeSession(invalidRoot, invalidAdapter, [recordTool(() => { effects += 1; })]);
	try {
		const result = await invalidHarness.session.runTask("reject invalid tools");
		assert.equal(result.status, "completed");
		assert.equal(effects, 0);
	} finally {
		await invalidHarness.session.close();
	}

	const cancelledRoot = await temporaryRoot();
	let cancelledEffects = 0;
	const cancelledObservations: SessionObservation[] = [];
	const cancelledAdapter = new ScriptedAdapter([
		response([{ type: "tool_call", id: "cancelled", name: "record", arguments: { value: "late" } }]),
	]);
	let cancelledSession: GeneralAgentSession;
	const cancelledHarness = await nativeSession(
		cancelledRoot,
		cancelledAdapter,
		[recordTool(() => { cancelledEffects += 1; })],
		cancelledObservations,
		(observation) => {
			if (observation.type === "tool.started") cancelledSession.cancel();
		},
	);
	cancelledSession = cancelledHarness.session;
	try {
		const result = await cancelledSession.runTask("cancel before effect");
		assert.equal(result.status, "cancelled");
		assert.equal(cancelledEffects, 0);
		assert.equal(cancelledObservations.filter((event) => event.type === "tool.settled").length, 0);
	} finally {
		await cancelledSession.close();
	}
});

test("C-PFREE-A03/A06 Pan seams and NativeKernel have no Pi import or hidden Pi model/tool decision", async () => {
	const paths = [
		"typescript/src/canonical-protocol.ts",
		"typescript/src/model-adapter-contract.ts",
		"typescript/src/agent-tool.ts",
		"typescript/src/kernels/native-kernel.ts",
	];
	for (const path of paths) {
		const source = await readFile(join(REPOSITORY_ROOT, path), "utf8");
		assert.doesNotMatch(source, /@earendil-works\/pi|PiModelAdapter|validatePiToolCall|\.streamFn\b/, path);
	}
	const nativeSource = await readFile(join(REPOSITORY_ROOT, "typescript/src/kernels/native-kernel.ts"), "utf8");
	assert.match(nativeSource, /this\.adapter\.exchange/);
	assert.match(nativeSource, /tool\.validate\(call\.arguments\)/);
	const compatibilitySource = await readFile(join(REPOSITORY_ROOT, "typescript/src/pi-compatibility.ts"), "utf8");
	assert.match(compatibilitySource, /Transitional Pan↔Pi compatibility boundary/);
	assert.match(compatibilitySource, /#32 replaces/);
	assert.match(compatibilitySource, /#33 replaces/);
});
