import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	Type,
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	type Message,
} from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "../src/model-adapter.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import { GeneralAgentSession, type SessionObservation } from "../src/session.ts";
import type { KernelSelector } from "../src/session.ts";

const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function root(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "pan-agent-native-"));
	temporaryDirectories.push(path);
	return path;
}

function fauxAdapter() {
	const faux = fauxProvider({ models: [{ id: "faux-native", reasoning: true }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const model = faux.getModel("faux-native");
	assert.ok(model);
	const adapter: PiModelAdapter = {
		providerId: faux.provider.id,
		modelId: model.id,
		model,
		streamFn: models.streamSimple.bind(models),
		thinkingLevel: "high",
	};
	return { faux, adapter };
}

function semanticHistory(messages: readonly Message[]): unknown[] {
	return messages.map((message) => {
		if (message.role === "user") return { role: "user", text: typeof message.content === "string" ? message.content : message.content[0]?.type === "text" ? message.content[0].text : "" };
		if (message.role === "assistant") return {
			role: "assistant",
			calls: message.content.filter((block) => block.type === "toolCall").map((block) => ({ id: block.id, name: block.name })),
		};
		return { role: "toolResult", id: message.toolCallId, name: message.toolName, error: message.isError };
	});
}

test("C-KER-03/04 NativeKernel retains typed Context and settles a ToolCall batch sequentially", async () => {
	const directory = await root();
	const { faux, adapter } = fauxAdapter();
	const executionOrder: string[] = [];
	const parameters = Type.Object({ value: Type.String() }, { additionalProperties: false });
	const tool: AgentTool<typeof parameters> = {
		name: "record",
		label: "record",
		description: "record a deterministic value",
		parameters,
		async execute(toolCallId, args) {
			executionOrder.push(`${toolCallId}:${args.value}`);
			if (args.value === "second") throw new Error("fixture execution error");
			return { content: [{ type: "text", text: `recorded:${args.value}` }], details: {} };
		},
	};
	const providerHistories: unknown[][] = [];
	faux.setResponses([
		fauxAssistantMessage([
			fauxToolCall("record", { value: "first" }, { id: "call-1" }),
			fauxToolCall("record", { value: "second" }, { id: "call-2" }),
		], { stopReason: "toolUse" }),
		(context) => {
			providerHistories.push(semanticHistory(context.messages));
			return fauxAssistantMessage("batch complete");
		},
		(context) => {
			providerHistories.push(semanticHistory(context.messages));
			return fauxAssistantMessage("context retained");
		},
	]);
	const observations: SessionObservation[] = [];
	const session = new GeneralAgentSession({
		adapter,
		tools: [tool],
		systemPrompt: "test",
		kernel: "native",
		memory: {
			archiveStore: await RunArchiveStore.open(join(directory, "memory")),
			runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
		},
		onObservation(observation) { observations.push(observation); },
	});
	try {
		const first = await session.runTask("run two tools");
		const second = await session.runTask("recall prior work");
		assert.equal(first.status, "completed");
		assert.equal(second.finalText, "context retained");
		assert.deepEqual(executionOrder, ["call-1:first", "call-2:second"]);
		assert.deepEqual(
			observations.filter((event) => event.type === "tool.settled").map((event) => event.toolCallId),
			["call-1", "call-2"],
		);
		assert.deepEqual(providerHistories[0], [
			{ role: "user", text: "run two tools" },
			{ role: "assistant", calls: [{ id: "call-1", name: "record" }, { id: "call-2", name: "record" }] },
			{ role: "toolResult", id: "call-1", name: "record", error: false },
			{ role: "toolResult", id: "call-2", name: "record", error: true },
		]);
		assert.deepEqual(
			observations.filter((event) => event.type === "tool.settled").map((event) => event.isError),
			[false, true],
		);
		assert.deepEqual(providerHistories[1]?.at(-1), { role: "user", text: "recall prior work" });
		assert.equal(session.contextMessageCount, 7);
	} finally {
		await session.close();
	}
});

test("C-KER-05 both Kernels return one correlated typed error per unknown or schema-invalid call", async () => {
	for (const kernel of ["pi", "native"] as const) {
		const directory = await root();
		const { faux, adapter } = fauxAdapter();
		let executions = 0;
		const parameters = Type.Object({ value: Type.String() }, { additionalProperties: false });
		const tool: AgentTool<typeof parameters> = {
			name: "record", label: "record", description: "record", parameters,
			async execute() {
				executions += 1;
				return { content: [{ type: "text", text: "unexpected" }], details: {} };
			},
		};
		let providerResults: Array<{ id: string; name: string; error: boolean }> = [];
		faux.setResponses([
			fauxAssistantMessage([
				fauxToolCall("missing", {}, { id: "unknown-1" }),
				fauxToolCall("record", {}, { id: "invalid-1" }),
			], { stopReason: "toolUse" }),
			(context) => {
				providerResults = context.messages
					.filter((message) => message.role === "toolResult")
					.map((message) => ({ id: message.toolCallId, name: message.toolName, error: message.isError }));
				return fauxAssistantMessage("errors observed");
			},
		]);
		const observations: SessionObservation[] = [];
		const session = await kernelSession(directory, kernel, adapter, [tool], observations);
		try {
			const result = await session.runTask("invalid calls");
			assert.equal(result.status, "completed", kernel);
			assert.equal(executions, 0, kernel);
			assert.deepEqual(providerResults, [
				{ id: "unknown-1", name: "missing", error: true },
				{ id: "invalid-1", name: "record", error: true },
			], kernel);
			assert.deepEqual(
				observations.filter((event) => event.type === "tool.settled").map((event) => [event.toolCallId, event.isError]),
				[["unknown-1", true], ["invalid-1", true]],
				kernel,
			);
		} finally {
			await session.close();
		}
	}
});

test("C-KER-05 both Kernels reject duplicate ToolCall ids before tool effects", async () => {
	for (const kernel of ["pi", "native"] as const) {
		const directory = await root();
		const { faux, adapter } = fauxAdapter();
		let executions = 0;
		const parameters = Type.Object({}, { additionalProperties: false });
		const tool: AgentTool<typeof parameters> = {
			name: "effect", label: "effect", description: "effect", parameters,
			async execute() {
				executions += 1;
				return { content: [{ type: "text", text: "effect" }], details: {} };
			},
		};
		faux.setResponses([
			fauxAssistantMessage([
				fauxToolCall("effect", {}, { id: "duplicate" }),
				fauxToolCall("effect", {}, { id: "duplicate" }),
			], { stopReason: "toolUse" }),
		]);
		const observations: SessionObservation[] = [];
		const session = await kernelSession(directory, kernel, adapter, [tool], observations);
		try {
			const result = await session.runTask("duplicate calls");
			assert.equal(result.status, "model_error", kernel);
			assert.match(result.reason, /duplicate_tool_call_id:duplicate/, kernel);
			assert.equal(executions, 0, kernel);
			assert.equal(observations.filter((event) => event.type === "tool.settled").length, 0, kernel);
		} finally {
			await session.close();
		}
	}
});

test("C-KER-05 orphan seeded ToolResults settle model_error before model or tool effects", async () => {
	for (const kernel of ["pi", "native"] as const) {
		const directory = await root();
		const { faux, adapter } = fauxAdapter();
		const observations: SessionObservation[] = [];
		const session = new GeneralAgentSession({
			adapter,
			tools: [],
			systemPrompt: "test",
			kernel,
			initialMessages: [{
				role: "toolResult", toolCallId: "orphan", toolName: "missing",
				content: [{ type: "text", text: "orphan" }], isError: true, timestamp: 1,
			}],
			memory: {
				archiveStore: await RunArchiveStore.open(join(directory, "memory")),
				runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
			},
			onObservation(observation) { observations.push(observation); },
		});
		try {
			const result = await session.runTask("reject orphan context");
			assert.equal(result.status, "model_error", kernel);
			assert.equal(result.reason, "orphan_tool_result:orphan", kernel);
			assert.equal(faux.state.callCount, 0, kernel);
			assert.equal(observations.filter((event) => event.type === "run.terminal").length, 1, kernel);
		} finally {
			await session.close();
		}
	}
});

async function kernelSession(
	directory: string,
	kernel: KernelSelector,
	adapter: PiModelAdapter,
	tools: AgentTool[],
	observations: SessionObservation[],
): Promise<GeneralAgentSession> {
	return new GeneralAgentSession({
		adapter,
		tools,
		systemPrompt: "test",
		kernel,
		memory: {
			archiveStore: await RunArchiveStore.open(join(directory, "memory")),
			runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
		},
		onObservation(observation) { observations.push(observation); },
	});
}

test("C-KER-06 both Kernels cancel the active tool with no late effect and one final archived terminal", async () => {
	for (const kernel of ["pi", "native"] as const) {
		const directory = await root();
		const { faux, adapter } = fauxAdapter();
		const marker = join(directory, "late-marker.txt");
		const parameters = Type.Object({}, { additionalProperties: false });
		const tool: AgentTool<typeof parameters> = {
			name: "slow", label: "slow", description: "abort-aware delayed effect", parameters,
			async execute(_id, _args, signal) {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(async () => {
						await writeFile(marker, "late", "utf8");
						resolve();
					}, 250);
					signal?.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(new Error("Operation aborted"));
					}, { once: true });
				});
				return { content: [{ type: "text", text: "late" }], details: {} };
			},
		};
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("slow", {}, { id: "slow-1" }), { stopReason: "toolUse" }),
		]);
		const observations: SessionObservation[] = [];
		let session: GeneralAgentSession;
		session = await kernelSession(directory, kernel, adapter, [tool], observations);
		const cancelOnStart = (observation: SessionObservation): void => {
			if (observation.type === "tool.started") setTimeout(() => session.cancel(), 20);
		};
		await session.close();
		observations.length = 0;
		const archiveStore = await RunArchiveStore.open(join(directory, "memory-2"));
		session = new GeneralAgentSession({
			adapter, tools: [tool], systemPrompt: "test", kernel,
			memory: { archiveStore, runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }) },
			onObservation(observation) { observations.push(observation); cancelOnStart(observation); },
		});
		try {
			const result = await session.runTask("cancel active tool");
			assert.equal(result.status, "cancelled", kernel);
			await new Promise((resolve) => setTimeout(resolve, 300));
			await assert.rejects(readFile(marker, "utf8"), /ENOENT/, kernel);
			const terminals = observations.filter((event) => event.type === "run.terminal");
			assert.equal(terminals.length, 1, kernel);
			assert.equal(observations.at(-1)?.type, "run.terminal", kernel);
			const archived = await archiveStore.readArchive(result.runId);
			assert.equal(archived.filter((event) => event.type === "run.terminal").length, 1, kernel);
			assert.equal(archived.at(-2)?.type, "run.terminal", kernel);
			assert.equal(archived.at(-1)?.type, "run.settled", kernel);
		} finally {
			await session.close();
		}
	}
});

test("C-KER-07 both Kernels enforce exact model-turn and atomic tool-step budgets", async () => {
	for (const kernel of ["pi", "native"] as const) {
		const turnDirectory = await root();
		const turnFaux = fauxAdapter();
		let turnEffects = 0;
		const parameters = Type.Object({}, { additionalProperties: false });
		const tool: AgentTool<typeof parameters> = {
			name: "tick", label: "tick", description: "tick", parameters,
			async execute() {
				turnEffects += 1;
				return { content: [{ type: "text", text: "tick" }], details: {} };
			},
		};
		turnFaux.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("tick", {}, { id: "turn-1" }), { stopReason: "toolUse" }),
			fauxAssistantMessage(fauxToolCall("tick", {}, { id: "turn-2" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("must not be consumed"),
		]);
		const turnSession = await limitedSession(turnDirectory, kernel, turnFaux.adapter, [tool], { maxModelTurns: 2 });
		try {
			const result = await turnSession.runTask("loop forever");
			assert.equal(result.status, "incomplete", kernel);
			assert.equal(result.reason, "turn_limit", kernel);
			assert.equal(result.modelCalls, 2, kernel);
			assert.equal(turnFaux.faux.state.callCount, 2, kernel);
			assert.equal(turnEffects, 2, kernel);
		} finally { await turnSession.close(); }

		const stepDirectory = await root();
		const stepFaux = fauxAdapter();
		let stepEffects = 0;
		const stepTool: AgentTool<typeof parameters> = {
			...tool,
			async execute() {
				stepEffects += 1;
				return { content: [{ type: "text", text: "effect" }], details: {} };
			},
		};
		stepFaux.faux.setResponses([
			fauxAssistantMessage([
				fauxToolCall("tick", {}, { id: "step-1" }),
				fauxToolCall("tick", {}, { id: "step-2" }),
				fauxToolCall("tick", {}, { id: "step-3" }),
			], { stopReason: "toolUse" }),
		]);
		const stepSession = await limitedSession(stepDirectory, kernel, stepFaux.adapter, [stepTool], { maxToolSteps: 2 });
		try {
			const result = await stepSession.runTask("oversized batch");
			assert.equal(result.status, "incomplete", kernel);
			assert.equal(result.reason, "step_limit", kernel);
			assert.equal(result.toolCalls, 0, kernel);
			assert.equal(stepEffects, 0, kernel);
		} finally { await stepSession.close(); }
	}
});

test("C-KER-07 invalid budgets fail before model, tool, or archive effects", () => {
	const { faux, adapter } = fauxAdapter();
	let toolEffects = 0;
	let archiveEffects = 0;
	const values: unknown[] = [true, 1.5, 0, -1];
	for (const value of values) {
		assert.throws(() => new GeneralAgentSession({
			adapter,
			tools: [{
				name: "effect", label: "effect", description: "effect", parameters: Type.Object({}),
				async execute() { toolEffects += 1; return { content: [], details: {} }; },
			}],
			systemPrompt: "test",
			limits: { maxModelTurns: value as number },
			memory: {
				archiveStore: { beginRun() { archiveEffects += 1; } } as never,
				runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
			},
		}), /positive integer/);
	}
	assert.equal(faux.state.callCount, 0);
	assert.equal(toolEffects, 0);
	assert.equal(archiveEffects, 0);
});

async function limitedSession(
	directory: string,
	kernel: KernelSelector,
	adapter: PiModelAdapter,
	tools: AgentTool[],
	limits: { maxModelTurns?: number; maxToolSteps?: number },
): Promise<GeneralAgentSession> {
	return new GeneralAgentSession({
		adapter, tools, systemPrompt: "test", kernel, limits,
		memory: {
			archiveStore: await RunArchiveStore.open(join(directory, "memory")),
			runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
		},
	});
}
