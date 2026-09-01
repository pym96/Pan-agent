import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, test } from "node:test";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxThinking,
	fauxToolCall,
	type FauxProviderHandle,
} from "@earendil-works/pi-ai";
import { runCli } from "../src/cli.ts";
import { createPiDeepSeekAdapter, type PiModelAdapter } from "../src/model-adapter.ts";
import {
	GENERAL_AGENT_SYSTEM_PROMPT,
	GeneralAgentSession,
	type SessionObservation,
} from "../src/session.ts";
import { createTrustedLocalTools } from "../src/tools.ts";
import { renderObservation, runTui } from "../src/tui.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "wah-pi-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

function fauxAdapter(): { adapter: PiModelAdapter; faux: FauxProviderHandle } {
	const faux = fauxProvider({ models: [{ id: "faux-general", reasoning: true }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const model = faux.getModel("faux-general");
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

function harness(directory: string, adapter: PiModelAdapter, observations: SessionObservation[]): GeneralAgentSession {
	const trustedLocal = createTrustedLocalTools(directory);
	return new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		onObservation: (observation) => {
			observations.push(observation);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
}

test("one Pi session performs read/write/edit/trusted-local shell and exposes typed observations", async () => {
	const directory = await workspace();
	await writeFile(join(directory, "input.txt"), "alpha\n", "utf8");
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(fauxToolCall("read", { path: "input.txt" }, { id: "read-1" }), {
			stopReason: "toolUse",
			responseId: "response-read",
		}),
		fauxAssistantMessage(
			fauxToolCall("write", { path: "program.js", content: 'console.log("one");\n' }, { id: "write-1" }),
			{ stopReason: "toolUse", responseId: "response-write" },
		),
		fauxAssistantMessage(
			fauxToolCall(
				"edit",
				{
					path: "program.js",
					edits: [{ oldText: 'console.log("one");', newText: 'console.log("two");' }],
				},
				{ id: "edit-1" },
			),
			{ stopReason: "toolUse", responseId: "response-edit" },
		),
		fauxAssistantMessage(
			fauxToolCall("bash", { command: "node --check program.js && node program.js" }, { id: "bash-1" }),
			{ stopReason: "toolUse", responseId: "response-bash" },
		),
		fauxAssistantMessage("Created and verified program.js.", { responseId: "response-final" }),
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	try {
		const result = await session.runTask("Read input.txt, create and edit program.js, then run it.");
		assert.equal(result.status, "completed");
		assert.equal(result.modelCalls, 5);
		assert.equal(result.toolCalls, 4);
		assert.equal(await readFile(join(directory, "program.js"), "utf8"), 'console.log("two");\n');
		assert.ok(
			observations.some(
				(observation) => observation.type === "tool.settled" && observation.toolName === "bash" && observation.text.includes("two"),
			),
		);
		assert.ok(
			observations.some(
				(observation) =>
					observation.type === "model.turn_settled" && observation.responseId === "response-final",
			),
		);
		assert.ok(result.usage.totalTokens > 0);
	} finally {
		await session.close();
	}
});

test("nonzero trusted-local shell exit remains an attributable tool error instead of crashing the harness", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall("bash", { command: "printf 'failure-output\\n'; exit 7" }, { id: "bash-fail" }),
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("The command failed with exit code 7; no retry was needed."),
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	try {
		const result = await session.runTask("Run the failing command and explain the observation.");
		assert.equal(result.status, "completed");
		const failure = observations.find(
			(observation) => observation.type === "tool.settled" && observation.toolCallId === "bash-fail",
		);
		assert.ok(failure?.type === "tool.settled");
		assert.equal(failure.isError, true);
		assert.match(failure.text, /failure-output/);
		assert.match(failure.text, /code 7/);
	} finally {
		await session.close();
	}
});

test("malformed and unknown ToolCalls are rejected before filesystem effects", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(
			[
				fauxToolCall("write", { path: "forbidden.txt" }, { id: "malformed-write" }),
				fauxToolCall("host_magic", { path: "also-forbidden.txt" }, { id: "unknown-tool" }),
			],
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("Both invalid calls were rejected."),
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	try {
		const result = await session.runTask("Attempt malformed operations.");
		assert.equal(result.status, "completed");
		await assert.rejects(readFile(join(directory, "forbidden.txt"), "utf8"), /ENOENT/);
		await assert.rejects(readFile(join(directory, "also-forbidden.txt"), "utf8"), /ENOENT/);
		const failures = observations.filter(
			(observation) => observation.type === "tool.settled" && observation.isError,
		);
		assert.equal(failures.length, 2);
	} finally {
		await session.close();
	}
});

test("successive tasks retain Pi-owned context without application truncation", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage("I will remember cobalt."),
		(context) => {
			const serialized = JSON.stringify(context.messages);
			return fauxAssistantMessage(serialized.includes("cobalt") ? "The retained word is cobalt." : "Context missing.");
		},
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	try {
		const first = await session.runTask("Remember cobalt.");
		const second = await session.runTask("What word did I ask you to remember?");
		assert.equal(first.status, "completed");
		assert.equal(second.finalText, "The retained word is cobalt.");
		assert.notEqual(first.runId, second.runId);
		assert.equal(session.contextMessageCount, 4);
	} finally {
		await session.close();
	}
});

test("hidden thinking stays out of observable projections", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage([fauxThinking("PRIVATE_REASONING_CANARY"), fauxText("Public answer")]),
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	try {
		await session.runTask("Answer publicly.");
		const rendered = observations.flatMap(renderObservation).join("\n");
		assert.match(rendered, /Public answer/);
		assert.doesNotMatch(rendered, /PRIVATE_REASONING_CANARY/);
	} finally {
		await session.close();
	}
});

test("shell receives an allowlisted environment rather than Provider credentials", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall(
				"bash",
				{ command: "if test -z \"${DEEPSEEK_API_KEY:-}\"; then printf credential-absent; else printf credential-leaked; fi" },
				{ id: "env-check" },
			),
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("Environment checked."),
	]);
	const observations: SessionObservation[] = [];
	const trustedLocal = createTrustedLocalTools(directory, {
		PATH: process.env.PATH,
		DEEPSEEK_API_KEY: "TEST_PROVIDER_SECRET_CANARY",
	});
	const session = new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		onObservation(observation) {
			observations.push(observation);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	try {
		await session.runTask("Check shell credential inheritance.");
		const settled = observations.find(
			(observation) => observation.type === "tool.settled" && observation.toolCallId === "env-check",
		);
		assert.ok(settled?.type === "tool.settled");
		assert.equal(settled.text, "credential-absent");
	} finally {
		await session.close();
	}
});

test("cancellation settles an active trusted-local shell task with an explicit terminal", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall("bash", { command: "sleep 5; printf late > cancelled.txt" }, { id: "slow-shell" }),
			{ stopReason: "toolUse" },
		),
	]);
	const observations: SessionObservation[] = [];
	let session: GeneralAgentSession;
	const trustedLocal = createTrustedLocalTools(directory);
	session = new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		onObservation(observation) {
			observations.push(observation);
			if (observation.type === "tool.started" && observation.toolCallId === "slow-shell") {
				setTimeout(() => session.cancel(), 50);
			}
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	try {
		const result = await session.runTask("Start the slow command.");
		assert.equal(result.status, "cancelled");
		assert.ok(
			observations.some(
				(observation) => observation.type === "run.terminal" && observation.status === "cancelled",
			),
		);
		await assert.rejects(readFile(join(directory, "cancelled.txt"), "utf8"), /ENOENT/);
	} finally {
		await session.close();
	}
});

test("Provider failure becomes an attributable model_error terminal", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage("", { stopReason: "error", errorMessage: "synthetic-provider-failure" }),
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	try {
		const result = await session.runTask("Trigger the deterministic failure.");
		assert.equal(result.status, "model_error");
		assert.equal(result.reason, "synthetic-provider-failure");
		assert.ok(
			observations.some(
				(observation) => observation.type === "run.terminal" && observation.status === "model_error",
			),
		);
	} finally {
		await session.close();
	}
});

test("real DeepSeek Adapter construction selects Pi model/profile with zero network calls", () => {
	const adapter = createPiDeepSeekAdapter();
	assert.equal(adapter.providerId, "deepseek");
	assert.equal(adapter.modelId, "deepseek-v4-flash");
	assert.equal(adapter.thinkingLevel, "high");
	assert.equal(adapter.model.api, "openai-completions");
});

test("TUI returns control for successive tasks in one Pi session", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage("first complete"),
		fauxAssistantMessage("second complete"),
	]);
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	const input = new PassThrough();
	const output = new PassThrough();
	let text = "";
	const scriptedInput = ["y\n", "first task\n", "second task\n", ":exit\n"];
	output.setEncoding("utf8");
	output.on("data", (chunk: string) => {
		text += chunk;
		if (chunk.includes("[y/N]> ") || chunk.includes("Task> ")) {
			const line = scriptedInput.shift();
			if (line) setImmediate(() => input.write(line));
		}
	});
	const exitCode = await runTui({
		session,
		provider: adapter.providerId,
		model: adapter.modelId,
		thinking: adapter.thinkingLevel,
		workspace: directory,
		input,
		output,
	});
	assert.equal(exitCode, 0);
	assert.equal(faux.state.callCount, 2);
	assert.equal(observations.filter((observation) => observation.type === "run.terminal").length, 2);
	assert.equal(text.match(/Task> /g)?.length, 3);
	assert.match(text, /General Agent TUI closed/);
});

test("TUI confirmation rejection closes with zero Faux Provider calls", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	const observations: SessionObservation[] = [];
	const session = harness(directory, adapter, observations);
	const input = new PassThrough();
	const output = new PassThrough();
	let text = "";
	output.setEncoding("utf8");
	output.on("data", (chunk: string) => {
		text += chunk;
		if (chunk.includes("[y/N]> ")) setImmediate(() => input.write("n\n"));
	});
	const exitCode = await runTui({
		session,
		provider: adapter.providerId,
		model: adapter.modelId,
		thinking: adapter.thinkingLevel,
		workspace: directory,
		input,
		output,
	});
	assert.equal(exitCode, 0);
	assert.equal(faux.state.callCount, 0);
	assert.equal(observations.length, 0);
	assert.match(text, /Cancelled before Provider use/);
});

test("CLI help returns before Adapter construction and therefore makes zero calls", async () => {
	const output = new PassThrough();
	let text = "";
	output.setEncoding("utf8");
	output.on("data", (chunk: string) => {
		text += chunk;
	});
	let adapterConstructions = 0;
	const exitCode = await runCli(["--help"], {
		output,
		createAdapter() {
			adapterConstructions += 1;
			throw new Error("Adapter must not be constructed for help");
		},
	});
	assert.equal(exitCode, 0);
	assert.equal(adapterConstructions, 0);
	assert.match(text, /trusted-local/);
	assert.match(text, /No Provider call/);
});
