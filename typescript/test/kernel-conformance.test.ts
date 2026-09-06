import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	Type,
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	type FauxProviderHandle,
	type Usage,
} from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "../src/model-adapter.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import {
	GeneralAgentSession,
	type KernelLimits,
	type KernelSelector,
	type SessionObservation,
	type TaskRunResult,
} from "../src/session.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_ROOT = join(REPOSITORY_ROOT, "conformance", "fixtures", "kernel-v1");
const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const temporaryDirectories: string[] = [];
const kernels = ["pi", "native"] as const;

type JsonObject = Record<string, any>;

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(name: string): Promise<JsonObject> {
	return JSON.parse(await readFile(join(FIXTURE_ROOT, name), "utf8")) as JsonObject;
}

async function temporaryRoot(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "pan-agent-kernel-conformance-"));
	temporaryDirectories.push(path);
	return path;
}

function adapter(): { adapter: PiModelAdapter; faux: FauxProviderHandle } {
	const faux = fauxProvider({ models: [{ id: "faux-kernel-conformance", reasoning: true }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const model = faux.getModel("faux-kernel-conformance");
	assert.ok(model);
	return {
		faux,
		adapter: {
			providerId: faux.provider.id,
			modelId: model.id,
			model,
			streamFn: models.streamSimple.bind(models),
			thinkingLevel: "high",
		},
	};
}

async function session(
	root: string,
	kernel: KernelSelector,
	modelAdapter: PiModelAdapter,
	tools: AgentTool[],
	observations: SessionObservation[],
	options: { limits?: Partial<KernelLimits>; onObservation?: (observation: SessionObservation) => void } = {},
): Promise<{ session: GeneralAgentSession; archiveStore: RunArchiveStore }> {
	const archiveStore = await RunArchiveStore.open(join(root, "memory"));
	return {
		archiveStore,
		session: new GeneralAgentSession({
			adapter: modelAdapter,
			tools,
			systemPrompt: "kernel conformance",
			kernel,
			limits: options.limits,
			memory: {
				archiveStore,
				runbook: async () => ({ content: "conformance", revision: TEST_RUNBOOK_REVISION }),
			},
			onObservation(observation) {
				observations.push(observation);
				options.onObservation?.(observation);
			},
		}),
	};
}

const recordParameters = Type.Object({ value: Type.String() }, { additionalProperties: false });

function recordTool(effect: (id: string, value: string, signal?: AbortSignal) => Promise<void> | void): AgentTool<typeof recordParameters> {
	return {
		name: "record",
		label: "record",
		description: "record a value",
		parameters: recordParameters,
		async execute(id, parameters, signal) {
			await effect(id, parameters.value, signal);
			return { content: [{ type: "text", text: `recorded:${parameters.value}` }], details: {} };
		},
	};
}

function sumUsage(events: readonly SessionObservation[]): Usage {
	return events.reduce<Usage>((total, event) => {
		if (event.type !== "model.turn_settled") return total;
		return {
			input: total.input + event.usage.input,
			output: total.output + event.usage.output,
			cacheRead: total.cacheRead + event.usage.cacheRead,
			cacheWrite: total.cacheWrite + event.usage.cacheWrite,
			totalTokens: total.totalTokens + event.usage.totalTokens,
			cost: {
				input: total.cost.input + event.usage.cost.input,
				output: total.cost.output + event.usage.cost.output,
				cacheRead: total.cost.cacheRead + event.usage.cost.cacheRead,
				cacheWrite: total.cost.cacheWrite + event.usage.cost.cacheWrite,
				total: total.cost.total + event.usage.cost.total,
			},
		};
	}, {
		input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	});
}

async function assertTerminalAccounting(
	result: TaskRunResult,
	observations: readonly SessionObservation[],
	archiveStore: RunArchiveStore,
	label: string,
): Promise<void> {
	const terminals = observations.filter((event) => event.type === "run.terminal");
	assert.equal(observations.filter((event) => event.type === "run.started").length, 1, label);
	assert.equal(terminals.length, 1, label);
	assert.equal(observations.at(-1)?.type, "run.terminal", label);
	assert.equal(terminals[0]?.status, result.status, label);
	assert.equal(terminals[0]?.reason, result.reason, label);
	assert.equal(result.modelCalls, observations.filter((event) => event.type === "model.turn_settled").length, label);
	assert.equal(result.toolCalls, observations.filter((event) => event.type === "tool.started").length, label);
	assert.deepEqual(result.usage, sumUsage(observations), label);
	assert.equal(result.archiveSealed, true, label);
	const archived = await archiveStore.readArchive(result.runId);
	const archivedTerminals = archived.filter((event) => event.type === "run.terminal") as JsonObject[];
	assert.equal(archivedTerminals.length, 1, label);
	assert.equal(archivedTerminals[0]?.status, result.status, label);
	assert.equal(archivedTerminals[0]?.reason, result.reason, label);
	const settlement = archived.at(-1) as JsonObject;
	assert.equal(settlement.type, "run.settled", label);
	assert.equal(settlement.reason, result.reason, label);
	assert.equal(
		settlement.settled_state,
		result.status === "completed" ? "terminal" : result.status === "cancelled" ? "cancelled" : "failed",
		label,
	);
}

test("C-KER-01 AgentKernel is the sole Session orchestration seam and only PiKernel invokes Pi orchestration", async () => {
	const [sessionSource, piSource, nativeSource, tuiSource, archiveSource] = await Promise.all([
		readFile(join(REPOSITORY_ROOT, "typescript/src/session.ts"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "typescript/src/kernels/pi-kernel.ts"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "typescript/src/kernels/native-kernel.ts"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "typescript/src/tui.ts"), "utf8"),
		readFile(join(REPOSITORY_ROOT, "typescript/src/run-archive.ts"), "utf8"),
	]);
	assert.match(sessionSource, /private readonly kernel: AgentKernel/);
	assert.match(sessionSource, /this\.kernel\.runTask/);
	assert.doesNotMatch(sessionSource, /new Agent\b|runAgentLoop/);
	assert.match(piSource, /new Agent\b/);
	const legacyPythonPackage = ["workspace", "agent", "harness"].join("_");
	assert.doesNotMatch(nativeSource, new RegExp(`new Agent\\b|runAgentLoop|${legacyPythonPackage}|\\.py\\b`));
	assert.doesNotMatch(tuiSource, /new PiKernel|new NativeKernel/);
	assert.doesNotMatch(archiveSource, /new PiKernel|new NativeKernel|KernelSelector/);
});

test("C-KER-09 kernel manifest is versioned, language-neutral, complete, and preserves v1 fixture bytes", async () => {
	const manifest = await fixture("manifest.json");
	assert.equal(manifest.schema, "pan-agent-kernel-conformance-manifest/v1");
	assert.deepEqual(new Set(manifest.cases.flatMap((entry: JsonObject) => entry.covers)), new Set([
		"C-KER-02", "C-KER-03", "C-KER-04", "C-KER-05", "C-KER-06", "C-KER-07", "C-KER-08",
	]));
	for (const entry of manifest.cases) {
		const body = await readFile(join(FIXTURE_ROOT, entry.file), "utf8");
		assert.doesNotMatch(body, /typescript|python|pi[-_ ]kernel|native[-_ ]kernel/i);
		const selected = JSON.parse(body) as JsonObject;
		assert.equal(selected.id, entry.id);
		assert.deepEqual(selected.covers, entry.covers);
	}
	const retainedHashes: Record<string, string> = {
		"active-tool-cancellation.json": "3b6d02fd59cd5f42d09a787fba09e169c1d4cac67b83b1def55f8e44ea1a04c5",
		"cross-task-context.json": "0b5c466b9f1bfe7075691f434fef00e9a09fec31e48ff0079cc2f73406f25469",
		"manifest.json": "07bcf57392b401c5f36d402e1390d8d1315f82bf6aed2820b33e2f683745d292",
		"terminal-settlements.json": "59c8b45363515e9b3f386b03ef550c96427dfcda2f5eca5e2803e69f4a9a2c88",
		"tool-semantics.json": "4f14a60283bfc7fe92aa2afa80ffa2edb3d297c70de705f9da58d59ef209d50d",
	};
	for (const [name, expected] of Object.entries(retainedHashes)) {
		const body = await readFile(join(REPOSITORY_ROOT, "conformance/fixtures/v1", name));
		assert.equal(createHash("sha256").update(body).digest("hex"), expected, name);
	}
});

test("C-KER-02 selection fixture runs through the same public Session interface for both Kernels", async () => {
	const selected = await fixture("selection.json");
	for (const kernel of kernels) {
		const root = await temporaryRoot();
		const model = adapter();
		model.faux.setResponses([fauxAssistantMessage(selected.response)]);
		const harness = await session(root, kernel, model.adapter, [], []);
		try {
			const result = await harness.session.runTask(selected.task);
			assert.equal(result.status, selected.expected.terminal, kernel);
			assert.equal(result.reason, selected.expected.reason, kernel);
		} finally { await harness.session.close(); }
	}
});

test("C-KER-03/04 context-and-batch fixture runs unchanged against both Kernels", async () => {
	const selected = await fixture("context-and-batch.json");
	for (const kernel of kernels) {
		const root = await temporaryRoot();
		const model = adapter();
		const order: string[] = [];
		let roles: string[] = [];
		let resultErrors: boolean[] = [];
		model.faux.setResponses([
			fauxAssistantMessage(selected.calls.map((call: JsonObject) => fauxToolCall(call.name, call.arguments, { id: call.id })), { stopReason: "toolUse" }),
			(context) => {
				roles = context.messages.map((message) => message.role);
				resultErrors = context.messages
					.filter((message) => message.role === "toolResult")
					.map((message) => message.isError);
				return fauxAssistantMessage(selected.first_final);
			},
			fauxAssistantMessage(selected.second_final),
		]);
		const harness = await session(root, kernel, model.adapter, [recordTool((id, value) => {
			order.push(`${id}:${value}`);
			const configured = selected.calls.find((call: JsonObject) => call.id === id);
			if (configured?.settlement === "error") throw new Error("fixture execution error");
		})], []);
		try {
			const first = await harness.session.runTask(selected.first_task);
			const second = await harness.session.runTask(selected.second_task);
			assert.deepEqual([first.status, second.status], selected.expected.terminals, kernel);
			assert.deepEqual(order, selected.expected.execution_order, kernel);
			assert.deepEqual(resultErrors, selected.expected.result_errors, kernel);
			assert.deepEqual(roles, selected.expected.roles_before_first_final, kernel);
			assert.equal(second.finalText, selected.second_final, kernel);
		} finally { await harness.session.close(); }
	}
});

test("C-KER-05 invalid-correlation fixture runs unchanged against both Kernels", async () => {
	const selected = await fixture("invalid-correlation.json");
	for (const kernel of kernels) {
		const recoverRoot = await temporaryRoot();
		const recoverModel = adapter();
		let effects = 0;
		let errors: string[] = [];
		recoverModel.faux.setResponses([
			fauxAssistantMessage(selected.recoverable_calls.map((call: JsonObject) => fauxToolCall(call.name, call.arguments, { id: call.id })), { stopReason: "toolUse" }),
			(context) => {
				errors = context.messages.flatMap((message) => message.role === "toolResult" && message.isError ? [message.toolCallId] : []);
				return fauxAssistantMessage("invalid calls observed");
			},
		]);
		const recover = await session(recoverRoot, kernel, recoverModel.adapter, [recordTool(() => { effects += 1; })], []);
		try {
			const result = await recover.session.runTask("recover invalid calls");
			assert.equal(result.status, selected.expected.recoverable_terminal, kernel);
			assert.deepEqual(errors, selected.expected.recoverable_error_ids, kernel);
			assert.equal(effects, 0, kernel);
		} finally { await recover.session.close(); }

		const duplicateRoot = await temporaryRoot();
		const duplicateModel = adapter();
		duplicateModel.faux.setResponses([
			fauxAssistantMessage(selected.duplicate_calls.map((call: JsonObject) => fauxToolCall(call.name, call.arguments, { id: call.id })), { stopReason: "toolUse" }),
		]);
		const duplicate = await session(duplicateRoot, kernel, duplicateModel.adapter, [recordTool(() => { effects += 1; })], []);
		try {
			const result = await duplicate.session.runTask("reject duplicate ids");
			assert.equal(result.status, selected.expected.duplicate_terminal, kernel);
			assert.equal(result.reason, selected.expected.duplicate_reason, kernel);
			assert.equal(effects, 0, kernel);
		} finally { await duplicate.session.close(); }

		const orphan = selected.orphan_result;
		const orphanRoot = await temporaryRoot();
		const orphanModel = adapter();
		const orphanObservations: SessionObservation[] = [];
		const orphanStore = await RunArchiveStore.open(join(orphanRoot, "memory"));
		const orphanSession = new GeneralAgentSession({
			adapter: orphanModel.adapter, tools: [], systemPrompt: "test", kernel,
			initialMessages: [{ role: "toolResult", toolCallId: orphan.call_id, toolName: orphan.tool, content: [{ type: "text", text: orphan.text }], isError: true, timestamp: 1 }],
			memory: { archiveStore: orphanStore, runbook: async () => ({ content: "", revision: TEST_RUNBOOK_REVISION }) },
			onObservation(observation) { orphanObservations.push(observation); },
		});
		try {
			const result = await orphanSession.runTask("reject orphan result");
			assert.equal(result.status, "model_error", kernel);
			assert.match(result.reason, new RegExp(selected.expected.orphan_error), kernel);
			assert.equal(orphanModel.faux.state.callCount, 0, kernel);
			assert.equal(orphanObservations.filter((event) => event.type === "run.terminal").length, 1, kernel);
		} finally { await orphanSession.close(); }
	}
});

test("C-KER-06 active-cancellation fixture runs unchanged against both Kernels", async () => {
	const selected = await fixture("active-cancellation.json");
	for (const kernel of kernels) {
		const root = await temporaryRoot();
		const model = adapter();
		let lateEffect = false;
		const parameters = Type.Object({}, { additionalProperties: false });
		const tool: AgentTool<typeof parameters> = {
			name: selected.call.name, label: selected.call.name, description: "delayed effect", parameters,
			async execute(_id, _arguments, signal) {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(() => { lateEffect = true; resolve(); }, selected.effect_after_ms);
					signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Operation aborted")); }, { once: true });
				});
				return { content: [{ type: "text", text: "late" }], details: {} };
			},
		};
		model.faux.setResponses([fauxAssistantMessage(fauxToolCall(selected.call.name, selected.call.arguments, { id: selected.call.id }), { stopReason: "toolUse" })]);
		const observations: SessionObservation[] = [];
		let active: GeneralAgentSession;
		const harness = await session(root, kernel, model.adapter, [tool], observations, {
			onObservation(event) {
				if (event.type === "tool.started") setTimeout(() => active.cancel(), selected.cancel_after_start_ms);
			},
		});
		active = harness.session;
		try {
			const result = await active.runTask(selected.task);
			await new Promise((resolve) => setTimeout(resolve, selected.effect_after_ms + 20));
			assert.equal(result.status, selected.expected.terminal, kernel);
			assert.equal(lateEffect, selected.expected.late_effect, kernel);
			assert.equal(observations.filter((event) => event.type === "run.terminal").length, selected.expected.terminal_events, kernel);
			assert.equal(observations.at(-1)?.type, "run.terminal", kernel);
			await assertTerminalAccounting(result, observations, harness.archiveStore, `${kernel}:cancelled`);
		} finally { await active.close(); }
	}
});

test("C-KER-07 budget fixture runs unchanged against both Kernels", async () => {
	const selected = await fixture("budgets.json");
	for (const kernel of kernels) {
		const turnRoot = await temporaryRoot();
		const turnModel = adapter();
		let effects = 0;
		const turnObservations: SessionObservation[] = [];
		turnModel.faux.setResponses(Array.from({ length: selected.turn_limit.scripted_turns }, (_, index) =>
			fauxAssistantMessage(fauxToolCall("record", { value: String(index) }, { id: `turn-${index}` }), { stopReason: "toolUse" })));
		const turn = await session(turnRoot, kernel, turnModel.adapter, [recordTool(() => { effects += 1; })], turnObservations, { limits: { maxModelTurns: selected.turn_limit.maximum } });
		try {
			const result = await turn.session.runTask("turn limit");
			assert.equal(result.reason, selected.turn_limit.expected_reason, kernel);
			assert.equal(result.modelCalls, selected.turn_limit.maximum, kernel);
			assert.equal(turnModel.faux.state.callCount, selected.turn_limit.maximum, kernel);
			await assertTerminalAccounting(result, turnObservations, turn.archiveStore, `${kernel}:turn_limit`);
		} finally { await turn.session.close(); }

		const stepRoot = await temporaryRoot();
		const stepModel = adapter();
		const stepObservations: SessionObservation[] = [];
		stepModel.faux.setResponses([fauxAssistantMessage(Array.from({ length: selected.step_limit.batch_size }, (_, index) =>
			fauxToolCall("record", { value: String(index) }, { id: `step-${index}` })), { stopReason: "toolUse" })]);
		const step = await session(stepRoot, kernel, stepModel.adapter, [recordTool(() => { effects += 1; })], stepObservations, { limits: { maxToolSteps: selected.step_limit.maximum } });
		try {
			const before = effects;
			const result = await step.session.runTask("step limit");
			assert.equal(result.reason, selected.step_limit.expected_reason, kernel);
			assert.equal(result.toolCalls, 0, kernel);
			assert.equal(effects, before, kernel);
			await assertTerminalAccounting(result, stepObservations, step.archiveStore, `${kernel}:step_limit`);
		} finally { await step.session.close(); }
	}
	for (const value of selected.invalid_values) {
		assert.throws(() => new GeneralAgentSession({
			adapter: adapter().adapter, tools: [], systemPrompt: "test", limits: { maxToolSteps: value },
			memory: { archiveStore: {} as never, runbook: async () => ({ content: "", revision: TEST_RUNBOOK_REVISION }) },
		}), /positive integer/);
	}
});

test("C-KER-08 terminal-accounting fixture runs unchanged against both Kernels", async () => {
	const selected = await fixture("terminal-accounting.json");
	for (const kernel of kernels) {
		for (const terminalCase of selected.cases) {
			const root = await temporaryRoot();
			const model = adapter();
			model.faux.setResponses([
				terminalCase.response === "error"
					? fauxAssistantMessage("", { stopReason: "error", errorMessage: terminalCase.expected_reason })
					: fauxAssistantMessage(terminalCase.id, terminalCase.response === "length" ? { stopReason: "length" } : {}),
			]);
			const observations: SessionObservation[] = [];
			const harness = await session(root, kernel, model.adapter, [], observations);
			try {
				const result = await harness.session.runTask(terminalCase.id);
				assert.equal(result.status, terminalCase.expected_terminal, `${kernel}:${terminalCase.id}`);
				assert.equal(result.reason, terminalCase.expected_reason, `${kernel}:${terminalCase.id}`);
				await assertTerminalAccounting(result, observations, harness.archiveStore, `${kernel}:${terminalCase.id}`);
			} finally { await harness.session.close(); }
		}
	}
});
