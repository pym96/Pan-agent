import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setImmediate as waitImmediate } from "node:timers/promises";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { AgentTool } from "../src/agent-tool.ts";
import {
	UNAVAILABLE,
	type JsonObject,
	type JsonValue,
	type ModelFailure,
	type ModelResponse,
	type ToolCall,
} from "../src/canonical-protocol.ts";
import {
	FAUX_PENDING_EXCHANGE,
	FauxModelAdapter,
	fauxUserMessage,
	type FauxScriptEntry,
} from "../src/faux-model-adapter.ts";
import { PAN_TRUSTED_LOCAL_LABEL, createPanTrustedLocalTools } from "../src/pan-trusted-local-tools.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import { GeneralAgentSession, type SessionObservation } from "../src/session.ts";

const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<{ root: string; workspace: string; memory: string }> {
	const root = await mkdtemp(join(tmpdir(), "pan-faux-tools-"));
	temporaryDirectories.push(root);
	const workspace = join(root, "workspace");
	const memory = join(root, "memory");
	await mkdir(workspace);
	return { root, workspace, memory };
}

function reportedUsage(totalTokens = 0) {
	return {
		status: "reported" as const,
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

function response(content: ModelResponse["message"]["content"], responseId: string): ModelResponse {
	return {
		kind: "response",
		message: { role: "assistant", content, timestamp: 10 },
		stopReason: content.some((item) => item.type === "tool_call") ? "tool_calls" : "stop",
		usage: reportedUsage(1),
		identity: {
			provider: { status: "reported", value: "pan-faux" },
			model: { status: "reported", value: "pan-faux-v1" },
			responseId: { status: "reported", value: responseId },
		},
	};
}

function failure(category: ModelFailure["category"], detail: string): ModelFailure {
	return {
		kind: "failure",
		category,
		detail,
		retryable: false,
		usage: UNAVAILABLE,
		identity: {
			provider: { status: "reported", value: "pan-faux" },
			model: { status: "reported", value: "pan-faux-v1" },
			responseId: UNAVAILABLE,
		},
	};
}

function call(id: string, name: string, argumentsValue: JsonObject): ToolCall {
	return { type: "tool_call", id, name, arguments: argumentsValue };
}

async function sessionFor(
	root: Awaited<ReturnType<typeof temporaryRoot>>,
	adapter: FauxModelAdapter,
	tools: readonly AgentTool[],
	observations: SessionObservation[] = [],
	options: {
		limits?: { maxModelTurns?: number; maxToolSteps?: number };
		onObservation?: (observation: SessionObservation) => void;
	} = {},
): Promise<{ session: GeneralAgentSession; archiveStore: RunArchiveStore }> {
	const archiveStore = await RunArchiveStore.open(root.memory);
	const session = new GeneralAgentSession({
		kernel: "native",
		adapter,
		tools,
		systemPrompt: "Pan Faux/Tool product test",
		limits: options.limits,
		memory: {
			archiveStore,
			runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
		},
		onObservation(observation) {
			observations.push(observation);
			options.onObservation?.(observation);
		},
	});
	return { session, archiveStore };
}

function modelRequest(signal: AbortSignal) {
	return {
		sessionId: "deterministic-session",
		context: { systemPrompt: "test", messages: [fauxUserMessage("task", 1)], tools: [] },
		signal,
	};
}

function detailsOf(observation: SessionObservation | undefined): Record<string, JsonValue> {
	assert.ok(observation?.type === "tool.settled");
	assert.ok(observation.details && typeof observation.details === "object" && !Array.isArray(observation.details));
	return observation.details as Record<string, JsonValue>;
}

test("C-PFREE-B101 Faux consumes deterministic canonical scripts and fails typed on exhaustion", async () => {
	const script: FauxScriptEntry[] = [
		response([{ type: "text", text: "final" }], "response-final"),
		response([call("single", "read", { path: "one.txt" })], "response-single"),
		response([
			call("multi-1", "write", { path: "one.txt", content: "one" }),
			call("multi-2", "write", { path: "two.txt", content: "two" }),
		], "response-multiple"),
		failure("provider", "synthetic_provider_failure"),
	];
	const first = new FauxModelAdapter(script);
	const second = new FauxModelAdapter(script);
	const firstController = new AbortController();
	const secondController = new AbortController();
	const firstOutcomes = [];
	const secondOutcomes = [];
	for (let index = 0; index < script.length + 1; index += 1) {
		firstOutcomes.push(await first.exchange(modelRequest(firstController.signal)));
		secondOutcomes.push(await second.exchange(modelRequest(secondController.signal)));
	}
	assert.deepEqual(firstOutcomes, secondOutcomes);
	assert.deepEqual(first.state, second.state);
	assert.equal(first.state.cursor, 4);
	assert.equal(first.state.exchangeCount, 5);
	assert.equal(first.state.requests.length, 5);
	assert.deepEqual(firstOutcomes.at(-1), failure("protocol", "faux_script_exhausted"));
	assert.doesNotMatch(JSON.stringify(first.state.requests), /openai|anthropic|deepseek|api[_-]?key/i);
});

test("C-PFREE-B101 pending and pre-aborted Faux exchanges consume no later script entry", async () => {
	const adapter = new FauxModelAdapter([
		FAUX_PENDING_EXCHANGE,
		response([{ type: "text", text: "must remain unconsumed" }], "later"),
	]);
	const controller = new AbortController();
	const pending = adapter.exchange(modelRequest(controller.signal));
	assert.equal(adapter.state.cursor, 1);
	assert.equal(adapter.state.exchangeCount, 1);
	controller.abort();
	assert.deepEqual(await pending, failure("cancelled", "faux_exchange_cancelled"));
	assert.equal(adapter.state.cursor, 1);
	assert.equal(adapter.state.exchangeCount, 1);

	const preAborted = new FauxModelAdapter([response([{ type: "text", text: "unused" }], "unused")]);
	const preAbortedController = new AbortController();
	preAbortedController.abort();
	assert.deepEqual(
		await preAborted.exchange(modelRequest(preAbortedController.signal)),
		failure("cancelled", "faux_exchange_cancelled"),
	);
	assert.equal(preAborted.state.cursor, 0);
	assert.equal(preAborted.state.exchangeCount, 0);
});

test("C-PFREE-B101 Faux rejects noncanonical requests before admission and types invalid script outcomes", async () => {
	const requestAdapter = new FauxModelAdapter([response([{ type: "text", text: "unused" }], "unused")]);
	const controller = new AbortController();
	const request = modelRequest(controller.signal);
	await assert.rejects(
		requestAdapter.exchange({
			...request,
			context: {
				...request.context,
				tools: [
					{ name: "duplicate", description: "first", parameters: { type: "object" } },
					{ name: "duplicate", description: "second", parameters: { type: "object" } },
				],
			},
		}),
		/duplicate_tool_name:duplicate/,
	);
	assert.equal(requestAdapter.state.cursor, 0);
	assert.equal(requestAdapter.state.exchangeCount, 0);

	const invalidOutcome: ModelResponse = {
		...response([{ type: "text", text: "not a ToolCall" }], "invalid-script"),
		stopReason: "tool_calls",
	};
	const scriptAdapter = new FauxModelAdapter([invalidOutcome]);
	const outcome = await scriptAdapter.exchange(modelRequest(controller.signal));
	assert.equal(outcome.kind, "failure");
	assert.equal(outcome.category, "protocol");
	assert.match(outcome.detail, /^faux_script_invalid:/);
	assert.equal(scriptAdapter.state.cursor, 1);
	assert.equal(scriptAdapter.state.exchangeCount, 1);
});

test("C-PFREE-B101/B102 Faux and Pan Tool graphs contain no Pi or Provider transport delegation", async () => {
	const fauxSource = await readFile(join(REPOSITORY_ROOT, "typescript/src/faux-model-adapter.ts"), "utf8");
	const toolSource = await readFile(join(REPOSITORY_ROOT, "typescript/src/pan-trusted-local-tools.ts"), "utf8");
	const cliSource = await readFile(join(REPOSITORY_ROOT, "typescript/src/cli.ts"), "utf8");
	for (const [name, source] of [["Faux", fauxSource], ["Pan Tools", toolSource]] as const) {
		assert.doesNotMatch(source, /@earendil-works\/pi|PiModelAdapter|validatePi|NodeExecutionEnv|create(?:Read|Write|Edit|Bash)Tool/, name);
	}
	assert.doesNotMatch(fauxSource, /node:https?|\bfetch\s*\(|process\.env|Date\.|randomUUID|Math\.random/);
	assert.match(cliSource, /createPanTrustedLocalTools\(workspace\)/);
	assert.doesNotMatch(cliSource, /adaptPiAgentTools/);
});

test("C-PFREE-B102/B103 Pan read-write-edit-bash complete through Native Events and Archive", async () => {
	const root = await temporaryRoot();
	await writeFile(join(root.workspace, "input.txt"), "alpha\n", "utf8");
	const tools = createPanTrustedLocalTools(root.workspace, { PATH: process.env.PATH }).tools;
	assert.deepEqual(tools.map((tool) => tool.name), ["read", "write", "edit", "bash"]);
	assert.ok(tools.every((tool) => tool.description.length > 0 && tool.parameters.type === "object"));
	const adapter = new FauxModelAdapter([
		response([call("read-1", "read", { path: "input.txt" })], "read-response"),
		response([call("write-1", "write", { path: "program.js", content: 'console.log("one");\n' })], "write-response"),
		response([call("edit-1", "edit", {
			path: "program.js",
			edits: [{ oldText: 'console.log("one");', newText: 'console.log("two");' }],
		})], "edit-response"),
		response([call("bash-1", "bash", {
			command: "node --check program.js && node program.js && printf diagnostic >&2",
		})], "bash-response"),
		response([{ type: "text", text: "complete" }], "final-response"),
	]);
	const observations: SessionObservation[] = [];
	const harness = await sessionFor(root, adapter, tools, observations);
	try {
		const result = await harness.session.runTask("exercise all Pan product Tools");
		assert.equal(result.status, "completed");
		assert.equal(result.modelCalls, 5);
		assert.equal(result.toolCalls, 4);
		assert.equal(await readFile(join(root.workspace, "program.js"), "utf8"), 'console.log("two");\n');
		assert.deepEqual(
			observations.filter((event) => event.type === "tool.settled").map((event) => event.toolCallId),
			["read-1", "write-1", "edit-1", "bash-1"],
		);
		const bashSettlement = observations.find((event) => event.type === "tool.settled" && event.toolCallId === "bash-1");
		const bashDetails = detailsOf(bashSettlement);
		assert.equal(bashDetails.cwd, resolve(root.workspace));
		assert.equal(bashDetails.stdout, "two\n");
		assert.equal(bashDetails.stderr, "diagnostic");
		assert.equal(bashDetails.exitCode, 0);
		assert.equal(bashDetails.status, "completed");
		const lastModelContext = adapter.state.requests.at(-1)?.context.messages ?? [];
		const bashResult = lastModelContext.find((message) => message.role === "tool_result" && message.toolCallId === "bash-1");
		assert.ok(bashResult?.role === "tool_result");
		assert.equal((bashResult.details as Record<string, JsonValue>).exitCode, 0);
		const archive = await harness.archiveStore.readArchive(result.runId);
		const archivedBash = archive.find((event) => event.type === "tool.settled" && event.toolCallId === "bash-1");
		assert.deepEqual(archivedBash?.details, bashSettlement?.type === "tool.settled" ? bashSettlement.details : undefined);
		assert.equal(archive.filter((event) => event.type === "run.terminal").length, 1);
		assert.equal(archive.at(-1)?.type, "run.settled");
	} finally {
		await harness.session.close();
	}
});

test("C-PFREE-B103 nonzero Bash and missing edit remain attributable without Harness crash or partial edit", async () => {
	const root = await temporaryRoot();
	await writeFile(join(root.workspace, "stable.txt"), "unchanged\n", "utf8");
	const tools = createPanTrustedLocalTools(root.workspace, { PATH: process.env.PATH }).tools;
	const adapter = new FauxModelAdapter([
		response([call("edit-missing", "edit", {
			path: "stable.txt",
			edits: [{ oldText: "absent", newText: "changed" }],
		})], "edit-missing-response"),
		response([call("bash-fail", "bash", {
			command: "printf standard-output; printf standard-error >&2; exit 7",
		})], "bash-fail-response"),
		response([{ type: "text", text: "failures observed" }], "final"),
	]);
	const observations: SessionObservation[] = [];
	const harness = await sessionFor(root, adapter, tools, observations);
	try {
		const result = await harness.session.runTask("observe expected Tool failures");
		assert.equal(result.status, "completed");
		assert.equal(await readFile(join(root.workspace, "stable.txt"), "utf8"), "unchanged\n");
		const editSettlement = observations.find((event) => event.type === "tool.settled" && event.toolCallId === "edit-missing");
		assert.ok(editSettlement?.type === "tool.settled" && editSettlement.isError);
		assert.match(editSettlement.text, /edit_target_not_found/);
		const bashSettlement = observations.find((event) => event.type === "tool.settled" && event.toolCallId === "bash-fail");
		assert.ok(bashSettlement?.type === "tool.settled" && bashSettlement.isError);
		assert.deepEqual(
			Object.fromEntries(Object.entries(detailsOf(bashSettlement)).filter(([key]) => ["stdout", "stderr", "exitCode", "status"].includes(key))),
			{ stdout: "standard-output", stderr: "standard-error", exitCode: 7, status: "failed" },
		);
	} finally {
		await harness.session.close();
	}
});

test("C-PFREE-B104 malformed and cancel-before-effect calls have zero implementations and effects", async () => {
	const root = await temporaryRoot();
	const productTools = createPanTrustedLocalTools(root.workspace, { PATH: process.env.PATH }).tools;
	let implementations = 0;
	const countedTools = productTools.map((tool): AgentTool => ({
		...tool,
		async execute(invocation) {
			implementations += 1;
			return tool.execute(invocation);
		},
	}));
	const adapter = new FauxModelAdapter([
		response([
			call("bad-write", "write", { path: "bad.txt" }),
			call("bad-edit", "edit", { path: "bad.txt", edits: [] }),
			call("bad-bash", "bash", { command: "" }),
			call("unknown", "unknown", { path: "unknown.txt" }),
		], "invalid-batch"),
		response([{ type: "text", text: "invalid calls rejected" }], "invalid-final"),
	]);
	const observations: SessionObservation[] = [];
	const harness = await sessionFor(root, adapter, countedTools, observations);
	try {
		const result = await harness.session.runTask("reject malformed batch");
		assert.equal(result.status, "completed");
		assert.equal(implementations, 0);
		await assert.rejects(access(join(root.workspace, "bad.txt")), /ENOENT/);
		await assert.rejects(access(join(root.workspace, "unknown.txt")), /ENOENT/);
		assert.equal(observations.filter((event) => event.type === "tool.settled" && event.isError).length, 4);
	} finally {
		await harness.session.close();
	}

	const cancelledRoot = await temporaryRoot();
	const bash = createPanTrustedLocalTools(cancelledRoot.workspace).tools.find((tool) => tool.name === "bash");
	assert.ok(bash);
	let cancelledImplementations = 0;
	const countedBash: AgentTool = {
		...bash,
		async execute(invocation) {
			cancelledImplementations += 1;
			return bash.execute(invocation);
		},
	};
	const cancelledAdapter = new FauxModelAdapter([
		response([call("cancelled-bash", "bash", { command: "printf late > late.txt" })], "cancel-bash"),
	]);
	let cancelledSession!: GeneralAgentSession;
	const cancelledHarness = await sessionFor(cancelledRoot, cancelledAdapter, [countedBash], [], {
		onObservation(observation) {
			if (observation.type === "tool.started") cancelledSession.cancel();
		},
	});
	cancelledSession = cancelledHarness.session;
	try {
		const result = await cancelledSession.runTask("cancel before Bash implementation or spawn");
		assert.equal(result.status, "cancelled");
		assert.equal(cancelledImplementations, 0);
		await assert.rejects(access(join(cancelledRoot.workspace, "late.txt")), /ENOENT/);
	} finally {
		await cancelledSession.close();
	}
});

test("C-PFREE-B104 Bash excludes Provider secrets and kills descendants before settlement", async () => {
	const root = await temporaryRoot();
	const tools = createPanTrustedLocalTools(root.workspace, {
		HOME: "/tmp/pan-safe-home",
		PATH: process.env.PATH,
		DEEPSEEK_API_KEY: "PROVIDER_SECRET_CANARY",
		ANTHROPIC_API_KEY: "SECOND_PROVIDER_SECRET_CANARY",
	}).tools;
	const environmentAdapter = new FauxModelAdapter([
		response([call("environment", "bash", {
			command: "printf 'home=%s deepseek=%s anthropic=%s' \"$HOME\" \"${DEEPSEEK_API_KEY:-absent}\" \"${ANTHROPIC_API_KEY:-absent}\"",
		})], "environment-response"),
		response([{ type: "text", text: "environment observed" }], "environment-final"),
	]);
	const environmentObservations: SessionObservation[] = [];
	const environmentHarness = await sessionFor(root, environmentAdapter, tools, environmentObservations);
	try {
		const result = await environmentHarness.session.runTask("inspect inherited environment");
		assert.equal(result.status, "completed");
		const settlement = environmentObservations.find((event) => event.type === "tool.settled");
		assert.ok(settlement?.type === "tool.settled");
		assert.match(settlement.text, /home=\/tmp\/pan-safe-home deepseek=absent anthropic=absent/);
		assert.doesNotMatch(settlement.text, /PROVIDER_SECRET_CANARY/);
	} finally {
		await environmentHarness.session.close();
	}

	const cancellationRoot = await temporaryRoot();
	const marker = join(cancellationRoot.workspace, "late-marker.txt");
	const cancellationTools = createPanTrustedLocalTools(cancellationRoot.workspace, { PATH: process.env.PATH }).tools;
	const cancellationAdapter = new FauxModelAdapter([
		response([call("slow-bash", "bash", {
			command: "(sleep 0.30; printf late > late-marker.txt) & wait",
		})], "slow-bash-response"),
	]);
	const cancellationObservations: SessionObservation[] = [];
	let cancellationSession!: GeneralAgentSession;
	const cancellationHarness = await sessionFor(cancellationRoot, cancellationAdapter, cancellationTools, cancellationObservations, {
		onObservation(observation) {
			if (observation.type === "tool.started") setTimeout(() => cancellationSession.cancel(), 30);
		},
	});
	cancellationSession = cancellationHarness.session;
	try {
		const result = await cancellationSession.runTask("cancel shell and descendant");
		assert.equal(result.status, "cancelled");
		const settlement = cancellationObservations.find((event) => event.type === "tool.settled" && event.toolCallId === "slow-bash");
		assert.ok(settlement?.type === "tool.settled" && settlement.isError);
		assert.equal(detailsOf(settlement).status, "cancelled");
		assert.equal(cancellationObservations.filter((event) => event.type === "run.terminal").length, 1);
		assert.equal(cancellationObservations.at(-1)?.type, "run.terminal");
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
		await assert.rejects(access(marker), /ENOENT/);
		const archive = await cancellationHarness.archiveStore.readArchive(result.runId);
		assert.equal(archive.filter((event) => event.type === "run.terminal").length, 1);
		assert.equal(archive.at(-1)?.type, "run.settled");
	} finally {
		await cancellationSession.close();
	}
	assert.match(PAN_TRUSTED_LOCAL_LABEL, /host-user authority/);
	assert.match(PAN_TRUSTED_LOCAL_LABEL, /not an OS sandbox/);
});

test("C-PFREE-B105 Pan Faux/Tools preserve multi-call order, typed failure, cancellation, and budgets", async () => {
	const multiRoot = await temporaryRoot();
	const multiTools = createPanTrustedLocalTools(multiRoot.workspace).tools;
	const multiAdapter = new FauxModelAdapter([
		response([
			call("multi-a", "write", { path: "a.txt", content: "a" }),
			call("multi-b", "write", { path: "b.txt", content: "b" }),
		], "multi-response"),
		response([{ type: "text", text: "multi complete" }], "multi-final"),
	]);
	const multiObservations: SessionObservation[] = [];
	const multiHarness = await sessionFor(multiRoot, multiAdapter, multiTools, multiObservations);
	try {
		const result = await multiHarness.session.runTask("execute ordered batch");
		assert.equal(result.status, "completed");
		assert.deepEqual(
			multiObservations.filter((event) => event.type === "tool.settled").map((event) => event.toolCallId),
			["multi-a", "multi-b"],
		);
		assert.equal(await readFile(join(multiRoot.workspace, "a.txt"), "utf8"), "a");
		assert.equal(await readFile(join(multiRoot.workspace, "b.txt"), "utf8"), "b");
		const secondContext = multiAdapter.state.requests[1]?.context.messages ?? [];
		assert.deepEqual(
			secondContext.filter((message) => message.role === "tool_result").map((message) => message.toolCallId),
			["multi-a", "multi-b"],
		);
	} finally { await multiHarness.session.close(); }

	const failureRoot = await temporaryRoot();
	const failureAdapter = new FauxModelAdapter([failure("provider", "typed_provider_failure")]);
	const failureHarness = await sessionFor(failureRoot, failureAdapter, []);
	try {
		const result = await failureHarness.session.runTask("retain typed failure");
		assert.equal(result.status, "model_error");
		assert.equal(result.reason, "typed_provider_failure");
		assert.equal((await failureHarness.archiveStore.readArchive(result.runId)).at(-1)?.type, "run.settled");
	} finally { await failureHarness.session.close(); }

	const cancellationRoot = await temporaryRoot();
	const cancellationAdapter = new FauxModelAdapter([FAUX_PENDING_EXCHANGE, response([{ type: "text", text: "late" }], "late")]);
	const cancellationHarness = await sessionFor(cancellationRoot, cancellationAdapter, []);
	try {
		const pending = cancellationHarness.session.runTask("cancel pending Faux exchange");
		while (cancellationAdapter.state.exchangeCount === 0) await waitImmediate();
		cancellationHarness.session.cancel();
		const result = await pending;
		assert.equal(result.status, "cancelled");
		assert.equal(cancellationAdapter.state.exchangeCount, 1);
		assert.equal(cancellationAdapter.state.cursor, 1);
	} finally { await cancellationHarness.session.close(); }

	const turnRoot = await temporaryRoot();
	const turnTools = createPanTrustedLocalTools(turnRoot.workspace).tools;
	const turnAdapter = new FauxModelAdapter([
		response([call("turn-1", "write", { path: "one.txt", content: "one" })], "turn-one"),
		response([call("turn-2", "write", { path: "two.txt", content: "two" })], "turn-two"),
		response([{ type: "text", text: "must not run" }], "turn-three"),
	]);
	const turnHarness = await sessionFor(turnRoot, turnAdapter, turnTools, [], { limits: { maxModelTurns: 2 } });
	try {
		const result = await turnHarness.session.runTask("reach turn limit");
		assert.equal(result.status, "incomplete");
		assert.equal(result.reason, "turn_limit");
		assert.equal(result.modelCalls, 2);
		assert.equal(turnAdapter.state.exchangeCount, 2);
	} finally { await turnHarness.session.close(); }

	const stepRoot = await temporaryRoot();
	let stepImplementations = 0;
	const stepTools = createPanTrustedLocalTools(stepRoot.workspace).tools.map((tool): AgentTool => ({
		...tool,
		async execute(invocation) {
			stepImplementations += 1;
			return tool.execute(invocation);
		},
	}));
	const stepAdapter = new FauxModelAdapter([
		response([
			call("step-1", "write", { path: "one.txt", content: "one" }),
			call("step-2", "write", { path: "two.txt", content: "two" }),
			call("step-3", "write", { path: "three.txt", content: "three" }),
		], "step-batch"),
	]);
	const stepHarness = await sessionFor(stepRoot, stepAdapter, stepTools, [], { limits: { maxToolSteps: 2 } });
	try {
		const result = await stepHarness.session.runTask("reject oversized batch atomically");
		assert.equal(result.status, "incomplete");
		assert.equal(result.reason, "step_limit");
		assert.equal(result.toolCalls, 0);
		assert.equal(stepImplementations, 0);
		for (const name of ["one.txt", "two.txt", "three.txt"]) {
			await assert.rejects(access(join(stepRoot.workspace, name)), /ENOENT/);
		}
	} finally { await stepHarness.session.close(); }
});
