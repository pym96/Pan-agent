import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "../src/model-adapter.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import {
	GENERAL_AGENT_SYSTEM_PROMPT,
	GeneralAgentSession,
	type SessionObservation,
} from "../src/session.ts";
import { createTrustedLocalTools } from "../src/tools.ts";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_ROOT = join(REPOSITORY_ROOT, "conformance", "fixtures", "v1");
const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const temporaryDirectories: string[] = [];

interface ToolCallStep {
	readonly kind: "tool_call";
	readonly call_id: string;
	readonly tool: string;
	readonly arguments: Record<string, unknown>;
}

interface FinalStep {
	readonly kind: "final";
	readonly text: string;
}

interface ToolSemanticsCase {
	readonly schema: "pan-agent-conformance-case/v1";
	readonly id: "tool-semantics";
	readonly covers: string[];
	readonly workspace: Record<string, string>;
	readonly task: {
		readonly prompt: string;
		readonly model_script: Array<ToolCallStep | FinalStep>;
		readonly expected: {
			readonly terminal: "completed";
			readonly tool_sequence: string[];
			readonly files: Record<string, string>;
			readonly observation_contains: string[];
		};
	};
}

interface TerminalSettlementsFixture {
	readonly schema: "pan-agent-conformance-case/v1";
	readonly id: "terminal-settlements";
	readonly covers: string[];
	readonly cases: Array<{
		readonly id: string;
		readonly task: string;
		readonly response: {
			readonly kind: "final" | "error" | "length";
			readonly text?: string;
			readonly error?: string;
		};
		readonly expected: {
			readonly terminal: "completed" | "model_error" | "incomplete";
			readonly reason: string;
		};
	}>;
}

interface CancellationFixture {
	readonly schema: "pan-agent-conformance-case/v1";
	readonly id: "active-tool-cancellation";
	readonly covers: string[];
	readonly task: string;
	readonly tool_call: ToolCallStep;
	readonly cancel_on: {
		readonly observation: "tool.started";
		readonly call_id: string;
		readonly delay_ms: number;
	};
	readonly expected: {
		readonly terminal: "cancelled";
		readonly absent_paths: string[];
	};
}

interface ContextFixture {
	readonly schema: "pan-agent-conformance-case/v1";
	readonly id: "cross-task-context";
	readonly covers: string[];
	readonly tasks: [
		{
			readonly prompt: string;
			readonly response: { readonly kind: "final"; readonly text: string };
		},
		{
			readonly prompt: string;
			readonly response: {
				readonly kind: "context_probe";
				readonly contains: string;
				readonly if_present: string;
				readonly if_absent: string;
			};
		},
	];
	readonly expected: {
		readonly terminals: ["completed", "completed"];
		readonly second_final: string;
		readonly minimum_context_messages: number;
		readonly distinct_run_ids: true;
	};
}

interface ConformanceManifest {
	readonly schema: "pan-agent-conformance-manifest/v1";
	readonly cases: Array<{
		readonly id: string;
		readonly file: string;
		readonly covers: string[];
	}>;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) =>
			rm(directory, { recursive: true, force: true }),
		),
	);
});

async function loadToolCase(): Promise<ToolSemanticsCase> {
	const body = await readFile(join(FIXTURE_ROOT, "tool-semantics.json"), "utf8");
	return JSON.parse(body) as ToolSemanticsCase;
}

function fauxAdapter(): {
	readonly adapter: PiModelAdapter;
	readonly faux: ReturnType<typeof fauxProvider>;
} {
	const faux = fauxProvider({ models: [{ id: "faux-conformance", reasoning: true }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const model = faux.getModel("faux-conformance");
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

async function harness(
	root: string,
	workspace: string,
	adapter: PiModelAdapter,
	observations: SessionObservation[],
	afterObservation: (observation: SessionObservation) => void = () => {},
): Promise<GeneralAgentSession> {
	const trustedLocal = createTrustedLocalTools(workspace);
	return new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: {
			archiveStore: await RunArchiveStore.open(join(root, "memory")),
			runbook: async () => ({ content: "conformance", revision: TEST_RUNBOOK_REVISION }),
		},
		onObservation: (observation) => {
			observations.push(observation);
			afterObservation(observation);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
}

test("conformance manifest freezes the language-neutral case set and retained semantics", async () => {
	const body = await readFile(join(FIXTURE_ROOT, "manifest.json"), "utf8");
	const manifest = JSON.parse(body) as ConformanceManifest;
	assert.equal(manifest.schema, "pan-agent-conformance-manifest/v1");
	assert.deepEqual(
		manifest.cases.map(({ id, file }) => ({ id, file })),
		[
			{ id: "tool-semantics", file: "tool-semantics.json" },
			{ id: "terminal-settlements", file: "terminal-settlements.json" },
			{ id: "active-tool-cancellation", file: "active-tool-cancellation.json" },
			{ id: "cross-task-context", file: "cross-task-context.json" },
		],
	);
	assert.deepEqual(
		[...new Set(manifest.cases.flatMap((entry) => entry.covers))].sort(),
		[
			"cancellation.active_tool",
			"context.cross_task_retention",
			"context.no_application_truncation",
			"terminal.cancelled",
			"terminal.completed",
			"terminal.incomplete",
			"terminal.model_error",
			"tool.bash",
			"tool.edit",
			"tool.read",
			"tool.write",
		],
	);
	for (const entry of manifest.cases) {
		const selected = JSON.parse(
			await readFile(join(FIXTURE_ROOT, entry.file), "utf8"),
		) as { id: string; covers: string[] };
		assert.equal(selected.id, entry.id);
		assert.deepEqual(selected.covers, entry.covers);
	}
});

test("language-neutral tool semantics fixture passes through the TypeScript product", async () => {
	const fixture = await loadToolCase();
	assert.equal(fixture.schema, "pan-agent-conformance-case/v1");
	assert.deepEqual(fixture.covers, [
		"tool.read",
		"tool.write",
		"tool.edit",
		"tool.bash",
		"terminal.completed",
	]);

	const root = await mkdtemp(join(tmpdir(), "pan-agent-conformance-"));
	temporaryDirectories.push(root);
	const workspace = join(root, "workspace");
	await mkdir(workspace);
	for (const [path, content] of Object.entries(fixture.workspace)) {
		await writeFile(join(workspace, path), content, "utf8");
	}

	const { adapter, faux } = fauxAdapter();
	faux.setResponses(
		fixture.task.model_script.map((step) =>
			step.kind === "tool_call"
				? fauxAssistantMessage(
						fauxToolCall(step.tool, step.arguments, { id: step.call_id }),
						{ stopReason: "toolUse" },
					)
				: fauxAssistantMessage(step.text),
		),
	);
	const observations: SessionObservation[] = [];
	const session = await harness(root, workspace, adapter, observations);
	try {
		const result = await session.runTask(fixture.task.prompt);
		assert.equal(result.status, fixture.task.expected.terminal);
		assert.deepEqual(
			observations
				.filter((observation) => observation.type === "tool.started")
				.map((observation) => observation.toolName),
			fixture.task.expected.tool_sequence,
		);
		for (const [path, content] of Object.entries(fixture.task.expected.files)) {
			assert.equal(await readFile(join(workspace, path), "utf8"), content);
		}
		const observationText = observations
			.filter((observation) => observation.type === "tool.settled")
			.map((observation) => observation.text)
			.join("\n");
		for (const expected of fixture.task.expected.observation_contains) {
			assert.match(observationText, new RegExp(expected));
		}
	} finally {
		await session.close();
	}
});

test("language-neutral terminal fixtures cover completed, model-error, and incomplete settlements", async () => {
	const body = await readFile(join(FIXTURE_ROOT, "terminal-settlements.json"), "utf8");
	const fixture = JSON.parse(body) as TerminalSettlementsFixture;
	assert.equal(fixture.schema, "pan-agent-conformance-case/v1");
	assert.deepEqual(fixture.covers, [
		"terminal.completed",
		"terminal.model_error",
		"terminal.incomplete",
	]);

	for (const selected of fixture.cases) {
		const root = await mkdtemp(join(tmpdir(), "pan-agent-conformance-terminal-"));
		temporaryDirectories.push(root);
		const workspace = join(root, "workspace");
		await mkdir(workspace);
		const { adapter, faux } = fauxAdapter();
		const response = selected.response;
		faux.setResponses([
			response.kind === "error"
				? fauxAssistantMessage("", {
						stopReason: "error",
						errorMessage: response.error,
					})
				: fauxAssistantMessage(response.text ?? "", {
						...(response.kind === "length" ? { stopReason: "length" as const } : {}),
					}),
		]);
		const session = await harness(root, workspace, adapter, []);
		try {
			const result = await session.runTask(selected.task);
			assert.equal(result.status, selected.expected.terminal, selected.id);
			assert.equal(result.reason, selected.expected.reason, selected.id);
		} finally {
			await session.close();
		}
	}
});

test("language-neutral cancellation fixture settles the active tool and prevents its late effect", async () => {
	const body = await readFile(join(FIXTURE_ROOT, "active-tool-cancellation.json"), "utf8");
	const fixture = JSON.parse(body) as CancellationFixture;
	assert.equal(fixture.schema, "pan-agent-conformance-case/v1");
	assert.deepEqual(fixture.covers, [
		"cancellation.active_tool",
		"terminal.cancelled",
	]);

	const root = await mkdtemp(join(tmpdir(), "pan-agent-conformance-cancel-"));
	temporaryDirectories.push(root);
	const workspace = join(root, "workspace");
	await mkdir(workspace);
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall(
				fixture.tool_call.tool,
				fixture.tool_call.arguments,
				{ id: fixture.tool_call.call_id },
			),
			{ stopReason: "toolUse" },
		),
	]);
	const observations: SessionObservation[] = [];
	let session: GeneralAgentSession;
	session = await harness(root, workspace, adapter, observations, (observation) => {
		if (
			observation.type === fixture.cancel_on.observation
			&& observation.toolCallId === fixture.cancel_on.call_id
		) {
			setTimeout(() => session.cancel(), fixture.cancel_on.delay_ms);
		}
	});
	try {
		const result = await session.runTask(fixture.task);
		assert.equal(result.status, fixture.expected.terminal);
		for (const path of fixture.expected.absent_paths) {
			await assert.rejects(readFile(join(workspace, path), "utf8"), /ENOENT/);
		}
	} finally {
		await session.close();
	}
});

test("language-neutral Context fixture remains visible across successive tasks", async () => {
	const body = await readFile(join(FIXTURE_ROOT, "cross-task-context.json"), "utf8");
	const fixture = JSON.parse(body) as ContextFixture;
	assert.equal(fixture.schema, "pan-agent-conformance-case/v1");
	assert.deepEqual(fixture.covers, [
		"context.cross_task_retention",
		"context.no_application_truncation",
	]);

	const root = await mkdtemp(join(tmpdir(), "pan-agent-conformance-context-"));
	temporaryDirectories.push(root);
	const workspace = join(root, "workspace");
	await mkdir(workspace);
	const { adapter, faux } = fauxAdapter();
	const [firstTask, secondTask] = fixture.tasks;
	faux.setResponses([
		fauxAssistantMessage(firstTask.response.text),
		(context) => {
			const retained = JSON.stringify(context.messages).includes(
				secondTask.response.contains,
			);
			return fauxAssistantMessage(
				retained
					? secondTask.response.if_present
					: secondTask.response.if_absent,
			);
		},
	]);
	const session = await harness(root, workspace, adapter, []);
	try {
		const first = await session.runTask(firstTask.prompt);
		const second = await session.runTask(secondTask.prompt);
		assert.deepEqual(
			[first.status, second.status],
			fixture.expected.terminals,
		);
		assert.equal(second.finalText, fixture.expected.second_final);
		assert.ok(
			session.contextMessageCount >= fixture.expected.minimum_context_messages,
		);
		if (fixture.expected.distinct_run_ids) assert.notEqual(first.runId, second.runId);
	} finally {
		await session.close();
	}
});
