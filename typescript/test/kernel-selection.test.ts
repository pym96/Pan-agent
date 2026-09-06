import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { parseCliArgs } from "../src/cli.ts";
import type { PiModelAdapter } from "../src/model-adapter.ts";
import { RunArchiveStore } from "../src/run-archive.ts";
import {
	GENERAL_AGENT_SYSTEM_PROMPT,
	GeneralAgentSession,
	type KernelSelector,
	type SessionObservation,
} from "../src/session.ts";
import { createTrustedLocalTools } from "../src/tools.ts";

const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function runPiSelection(kernel?: KernelSelector): Promise<{
	readonly result: Awaited<ReturnType<GeneralAgentSession["runTask"]>>;
	readonly observations: SessionObservation[];
}> {
	const directory = await mkdtemp(join(tmpdir(), "pan-agent-kernel-select-"));
	temporaryDirectories.push(directory);
	const faux = fauxProvider({ models: [{ id: "faux-kernel-select", reasoning: true }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const model = faux.getModel("faux-kernel-select");
	assert.ok(model);
	const adapter: PiModelAdapter = {
		providerId: faux.provider.id,
		modelId: model.id,
		model,
		streamFn: models.streamSimple.bind(models),
		thinkingLevel: "high",
	};
	faux.setResponses([fauxAssistantMessage("same public answer", { responseId: "same-response" })]);
	const trustedLocal = createTrustedLocalTools(directory);
	const observations: SessionObservation[] = [];
	const session = new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: {
			archiveStore: await RunArchiveStore.open(join(directory, "memory")),
			runbook: async () => ({ content: "test", revision: TEST_RUNBOOK_REVISION }),
		},
		...(kernel === undefined ? {} : { kernel }),
		onObservation: (observation) => {
			observations.push(observation);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	try {
		return { result: await session.runTask("same task"), observations };
	} finally {
		await session.close();
	}
}

function normalize(observations: readonly SessionObservation[]): unknown[] {
	return observations.map(({ runId: _runId, ...observation }) => observation);
}

test("C-KER-02 omitted kernel and explicit pi have identical public behavior", async () => {
	const omitted = await runPiSelection();
	const explicit = await runPiSelection("pi");
	assert.deepEqual(
		{ ...omitted.result, runId: "normalized" },
		{ ...explicit.result, runId: "normalized" },
	);
	assert.deepEqual(normalize(omitted.observations), normalize(explicit.observations));
});

test("C-KER-02 CLI defaults to pi, accepts native, and rejects unknown selectors", () => {
	assert.equal(parseCliArgs(["--workspace", "/tmp/w", "--memory-root", "/tmp/m"]).kernel, "pi");
	assert.equal(
		parseCliArgs(["--workspace", "/tmp/w", "--memory-root", "/tmp/m", "--kernel", "native"]).kernel,
		"native",
	);
	assert.throws(
		() => parseCliArgs(["--workspace", "/tmp/w", "--memory-root", "/tmp/m", "--kernel", "other"]),
		/Unsupported kernel/,
	);
	assert.throws(
		() => new GeneralAgentSession({
			adapter: {} as PiModelAdapter,
			tools: [],
			systemPrompt: "test",
			kernel: "other" as KernelSelector,
			memory: {
				archiveStore: {} as never,
				runbook: async () => ({ content: "", revision: TEST_RUNBOOK_REVISION }),
			},
		}),
		/Unsupported kernel: other/,
	);
});
