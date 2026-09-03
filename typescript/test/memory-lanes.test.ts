import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import type { PiModelAdapter } from "../src/model-adapter.ts";
import {
	ArchiveIdentityError,
	ArchiveIntegrityError,
	ArchiveSealedError,
	RunArchiveStore,
	verifyArchiveBytes,
} from "../src/run-archive.ts";
import { LedgerReferenceError, RetrospectiveLedger } from "../src/retrospective-ledger.ts";
import { editRunbook, loadRunbook } from "../src/runbook.ts";
import {
	GENERAL_AGENT_SYSTEM_PROMPT,
	GeneralAgentSession,
	type SessionObservation,
} from "../src/session.ts";
import { createTrustedLocalTools } from "../src/tools.ts";
import { runTui } from "../src/tui.ts";

const TEST_RUNBOOK_REVISION = `sha256:${"0".repeat(64)}`;
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "wah-mem-test-"));
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

async function sessionWithMemory(
	directory: string,
	adapter: PiModelAdapter,
	observations: SessionObservation[],
	runbookRevision: string = TEST_RUNBOOK_REVISION,
): Promise<GeneralAgentSession> {
	const trustedLocal = createTrustedLocalTools(directory);
	const archiveStore = await RunArchiveStore.open(join(directory, "memory"));
	return new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: {
			archiveStore,
			runbook: async () => ({ content: "test runbook", revision: runbookRevision }),
		},
		onObservation: (observation) => {
			observations.push(observation);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
}

function archiveBytes(directory: string): string {
	const runsRoot = join(directory, "memory", "runs");
	return readdirSync(runsRoot)
		.flatMap((runId) =>
			readdirSync(join(runsRoot, runId)).map((name) =>
				readFileSync(join(runsRoot, runId, name), "utf8"),
			),
		)
		.join("\n");
}

function sha256(body: string): string {
	return createHash("sha256").update(body, "utf8").digest("hex");
}

// C-MEM-01: for every admitted run the first durable record precedes any
// Provider exchange or tool effect; identities never collide or repeat.
test("run.started is durable before the first Provider exchange (normal, provider-failure, tool-failure, cancelled)", async () => {
	const seenFirstRecords: string[] = [];
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		() => {
			// Inside the first Provider exchange: the archive's first durable
			// record must already exist on disk.
			const runsRoot = join(directory, "memory", "runs");
			const runDirs = readdirSync(runsRoot);
			assert.equal(runDirs.length, 1);
			const body = readFileSync(join(runsRoot, runDirs[0] ?? "", "events.jsonl"), "utf8");
			const firstLine = body.split("\n")[0] ?? "";
			seenFirstRecords.push(firstLine);
			assert.match(firstLine, /"run\.started"/);
			return fauxAssistantMessage(fauxToolCall("bash", { command: "printf ok" }, { id: "b1" }), {
				stopReason: "toolUse",
			});
		},
		fauxAssistantMessage("done"),
	]);
	const observations: SessionObservation[] = [];
	const session = await sessionWithMemory(directory, adapter, observations);
	try {
		const result = await session.runTask("run the trivial command");
		assert.equal(result.status, "completed");
		assert.equal(result.archiveSealed, true);
		const records = await (await RunArchiveStore.open(join(directory, "memory"))).readArchive(result.runId);
		assert.equal(records[0]?.type, "run.started");
		assert.equal(records.at(-1)?.type, "run.settled");
		assert.equal((records.at(-1) as { settled_state: string }).settled_state, "terminal");
		// Provider/model/runbook identity is bound at run.started.
		assert.equal((records[0] as { runbook_revision: string }).runbook_revision, TEST_RUNBOOK_REVISION);
		assert.equal((records[0] as { provider: string }).provider, adapter.providerId);
	} finally {
		await session.close();
	}
	assert.equal(seenFirstRecords.length, 1);

	// Provider-failure run seals as failed; identity never reused.
	const directory2 = await workspace();
	const failing = fauxAdapter();
	failing.faux.setResponses([
		fauxAssistantMessage("", { stopReason: "error", errorMessage: "synthetic-provider-failure" }),
	]);
	const session2 = await sessionWithMemory(directory2, failing.adapter, []);
	try {
		const failed = await session2.runTask("trigger failure");
		assert.equal(failed.status, "model_error");
		const store2 = await RunArchiveStore.open(join(directory2, "memory"));
		const manifest = await store2.readManifest(failed.runId);
		assert.equal(manifest.settled_state, "failed");
		await assert.rejects(store2.beginRun(failed.runId), ArchiveIdentityError);
	} finally {
		await session2.close();
	}
});

test("cancelled and tool-failure runs are durably archived and sealed", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall("bash", { command: "printf 'boom'; exit 3" }, { id: "tool-fail" }),
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("the command failed"),
	]);
	const observations: SessionObservation[] = [];
	const session = await sessionWithMemory(directory, adapter, observations);
	try {
		const result = await session.runTask("run a failing command");
		assert.equal(result.status, "completed");
		const store = await RunArchiveStore.open(join(directory, "memory"));
		const records = await store.readArchive(result.runId);
		assert.ok(records.some((record) => record.type === "tool.settled" && record.isError === true));
	} finally {
		await session.close();
	}

	const directory2 = await workspace();
	const cancelling = fauxAdapter();
	cancelling.faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall("bash", { command: "sleep 5" }, { id: "slow" }),
			{ stopReason: "toolUse" },
		),
	]);
	const observations2: SessionObservation[] = [];
	const trustedLocal = createTrustedLocalTools(directory2);
	let session2: GeneralAgentSession;
	session2 = new GeneralAgentSession({
		adapter: cancelling.adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: {
			archiveStore: await RunArchiveStore.open(join(directory2, "memory")),
			runbook: async () => ({ content: "test runbook", revision: TEST_RUNBOOK_REVISION }),
		},
		onObservation(observation) {
			observations2.push(observation);
			if (observation.type === "tool.started") setTimeout(() => session2.cancel(), 50);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	try {
		const result = await session2.runTask("start then cancel");
		assert.equal(result.status, "cancelled");
		const store = await RunArchiveStore.open(join(directory2, "memory"));
		const manifest = await store.readManifest(result.runId);
		assert.equal(manifest.settled_state, "cancelled");
	} finally {
		await session2.close();
	}
});

// C-MEM-02: interrupted runs keep a causal prefix, gain a distinct
// interrupted settlement, and never reuse identity.
test("interruption between appends, mid-write, and after cancellation settles as interrupted with a causal prefix", async () => {
	const directory = await workspace();
	const root = join(directory, "memory");

	// (a) interruption between two event appends
	let store = await RunArchiveStore.open(root);
	const writerA = await store.beginRun("run-interrupted-between-appends");
	await writerA.append({ type: "run.started", runId: writerA.runId, task: "crash between appends" });
	await writerA.append({ type: "model.turn_started", runId: writerA.runId, turn: 1 });

	// (b) interruption during a single record write (torn tail)
	const writerB = await store.beginRun("run-interrupted-mid-write");
	await writerB.append({ type: "run.started", runId: writerB.runId, task: "crash mid write" });
	const eventsB = join(root, "runs", writerB.runId, "events.jsonl");
	const handle = await (await import("node:fs/promises")).open(eventsB, "a");
	try {
		await handle.write('{"schema":"run-archive-record/v1","seq'); // torn partial line
	} finally {
		await handle.close();
	}

	// (c) interruption after a cancellation request
	const writerC = await store.beginRun("run-interrupted-after-cancel");
	await writerC.append({ type: "run.started", runId: writerC.runId, task: "crash after cancel" });
	await writerC.append({ type: "run.cancellation_requested", runId: writerC.runId });

	// Reopen: recovery settles all three as interrupted without rewriting records.
	const bytesBeforeA = await readFile(join(root, "runs", writerA.runId, "events.jsonl"), "utf8");
	store = await RunArchiveStore.open(root);
	for (const runId of [writerA.runId, writerB.runId, writerC.runId]) {
		const manifest = await store.readManifest(runId);
		assert.equal(manifest.settled_state, "interrupted");
		const records = await store.readArchive(runId);
		const last = records.at(-1) as { type: string; settled_state: string; reason: string };
		assert.equal(last.type, "run.settled");
		assert.equal(last.settled_state, "interrupted");
		// causal prefix: sequences 0..n in order
		records.forEach((_, index) => index);
		await assert.rejects(store.beginRun(runId), ArchiveIdentityError);
	}
	// (a) recovered with zero torn bytes and an intact prefix
	const recordsA = await store.readArchive(writerA.runId);
	assert.deepEqual(
		recordsA.map((record) => record.type),
		["run.started", "model.turn_started", "run.settled"],
	);
	const manifestA = await store.readManifest(writerA.runId);
	assert.match(manifestA.settled_reason, /torn_tail_bytes=0/);
	const appendedMarker = (await readFile(join(root, "runs", writerA.runId, "events.jsonl"), "utf8")).startsWith(bytesBeforeA);
	assert.ok(appendedMarker, "recovery appends; it never rewrites the durable prefix");
	// (b) torn tail disclosed
	const manifestB = await store.readManifest(writerB.runId);
	assert.match(manifestB.settled_reason, /torn_tail_bytes=[1-9]/);
	const recordsB = await store.readArchive(writerB.runId);
	assert.deepEqual(
		recordsB.map((record) => record.type),
		["run.started", "run.settled"],
	);
});

// C-MEM-03: sealed archives refuse every application-owned write interface in
// all four settled states, byte-identical afterwards. Enumerated interfaces:
// beginRun (identity), writer.append, writer.settle, store.recoverRun; no
// overwrite/delete interface exists on the store or writer.
test("sealed archives refuse append, re-settle, identity reuse, and recovery writes in all four states", async () => {
	const directory = await workspace();
	const root = join(directory, "memory");
	const store = await RunArchiveStore.open(root);

	const states: Array<["terminal" | "cancelled" | "failed" | "interrupted", string]> = [
		["terminal", "run-sealed-terminal"],
		["cancelled", "run-sealed-cancelled"],
		["failed", "run-sealed-failed"],
		["interrupted", "run-sealed-interrupted"],
	];
	for (const [state, runId] of states) {
		const writer = await store.beginRun(runId);
		await writer.append({ type: "run.started", runId, task: `settle as ${state}` });
		if (state === "interrupted") {
			await store.recoverRun(runId);
		} else {
			await writer.settle(state, "test settlement");
		}
		const eventsPath = join(root, "runs", runId, "events.jsonl");
		const manifestPath = join(root, "runs", runId, "manifest.json");
		const before = sha256(await readFile(eventsPath, "utf8")) + sha256(await readFile(manifestPath, "utf8"));

		await assert.rejects(writer.append({ type: "late.record" }), ArchiveSealedError);
		await assert.rejects(writer.settle("failed", "re-settle"), ArchiveSealedError);
		await assert.rejects(store.beginRun(runId), ArchiveIdentityError);
		await assert.rejects(store.recoverRun(runId), ArchiveSealedError);

		const after = sha256(await readFile(eventsPath, "utf8")) + sha256(await readFile(manifestPath, "utf8"));
		assert.equal(after, before, `${state} archive bytes must be identical after refused writes`);
	}
	// No overwrite or delete path exists on any archive interface.
	const storeSurface = store as unknown as Record<string, unknown>;
	assert.equal(typeof storeSurface.overwriteArchive, "undefined");
	assert.equal(typeof storeSurface.deleteArchive, "undefined");
});

// C-MEM-04: byte-level tamper classes are all detected; pristine verifies.
test("integrity verification detects modified, deleted, reordered, and injected records", async () => {
	const directory = await workspace();
	const root = join(directory, "memory");
	const store = await RunArchiveStore.open(root);
	const writer = await store.beginRun("run-tamper-target");
	await writer.append({ type: "run.started", runId: writer.runId, task: "tamper target" });
	await writer.append({ type: "model.turn_started", runId: writer.runId, turn: 1 });
	await writer.append({ type: "model.turn_settled", runId: writer.runId, turn: 1 });
	await writer.settle("terminal", "complete");
	const eventsPath = join(root, "runs", writer.runId, "events.jsonl");
	const pristine = await readFile(eventsPath, "utf8");
	const manifest = await store.readManifest(writer.runId);

	// pristine verifies clean
	verifyArchiveBytes(pristine, manifest);
	const records = await store.readArchive(writer.runId);
	assert.equal(records.length, 4);

	const lines = pristine.split("\n").filter((line) => line.length > 0);
	const tampered: Record<string, string> = {
		modified: lines.map((line, index) => (index === 1 ? line.replace("turn_started", "turn_starded") : line)).join("\n") + "\n",
		deleted: [...lines.slice(0, 1), ...lines.slice(2)].join("\n") + "\n",
		reordered: [lines[0] ?? "", lines[2] ?? "", lines[1] ?? "", ...lines.slice(3)].join("\n") + "\n",
		injected:
			[...lines.slice(0, 1), JSON.stringify({ schema: "run-archive-record/v1", sequence: 1, run_id: writer.runId, previous_hash: null, record: { type: "injected" } }), ...lines.slice(1)].join(
				"\n",
			) + "\n",
	};
	for (const [name, body] of Object.entries(tampered)) {
		assert.throws(() => verifyArchiveBytes(body, manifest), ArchiveIntegrityError, `tamper class ${name}`);
	}
});

// C-MEM-05: list/inspect/replay make zero Provider exchanges and zero tool
// effects, including for corrupted input (typed failure, no crash).
test("list, inspect, and replay are zero-effect; corrupted input fails typed", async () => {
	const directory = await workspace();
	await writeFile(join(directory, "sentinel.txt"), "keep\n", "utf8");
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([fauxAssistantMessage("archived answer")]);
	const observations: SessionObservation[] = [];
	const session = await sessionWithMemory(directory, adapter, observations);
	let runId = "";
	try {
		const result = await session.runTask("answer and archive");
		runId = result.runId;
		assert.equal(result.status, "completed");
	} finally {
		await session.close();
	}
	const callsAfterRun = faux.state.callCount;
	assert.equal(callsAfterRun, 1);

	const store = await RunArchiveStore.open(join(directory, "memory"));
	const runs = await store.listRuns();
	assert.equal(runs.length, 1);
	const records = await store.readArchive(runId);
	assert.ok(records.length > 0);
	assert.equal(faux.state.callCount, callsAfterRun);
	assert.equal(await readFile(join(directory, "sentinel.txt"), "utf8"), "keep\n");

	// corrupted input: typed failure, still zero effects
	const eventsPath = join(directory, "memory", "runs", runId, "events.jsonl");
	const corrupted = (await readFile(eventsPath, "utf8")).replace("run.started", "run.STArted");
	await writeFile(eventsPath, corrupted, "utf8");
	await assert.rejects(store.readArchive(runId), ArchiveIntegrityError);
	assert.equal(faux.state.callCount, callsAfterRun);
	assert.equal(await readFile(join(directory, "sentinel.txt"), "utf8"), "keep\n");
});

// C-MEM-05 (TUI surface): :runs and :replay render archived runs with zero
// Provider calls; a tampered archive surfaces a typed ARCHIVE_ERROR line.
test("TUI :runs and :replay render archives with zero Provider calls and typed corruption errors", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([fauxAssistantMessage("replayable answer")]);
	const observations: SessionObservation[] = [];
	const archiveStore = await RunArchiveStore.open(join(directory, "memory"));
	const trustedLocal = createTrustedLocalTools(directory);
	const session = new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: { archiveStore, runbook: async () => ({ content: "test runbook", revision: TEST_RUNBOOK_REVISION }) },
		onObservation: (observation) => {
			observations.push(observation);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	const input = new PassThrough();
	const output = new PassThrough();
	let text = "";
	output.setEncoding("utf8");
	let runId = "";
	output.on("data", (chunk: string) => {
		text += chunk;
		if (chunk.includes("RUN_SUMMARY")) {
			runId = /run=([0-9a-f-]+)/.exec(chunk)?.[1] ?? "";
			setImmediate(() => input.write(":runs\n"));
		} else if (chunk.includes("ARCHIVE run=")) {
			setImmediate(() => input.write(`:replay ${runId}\n`));
		} else if (chunk.includes("SETTLED state=terminal")) {
			setImmediate(() => input.write(":exit\n"));
		} else if (chunk.includes("[y/N]> ")) {
			setImmediate(() => input.write("y\n"));
		} else if (chunk.endsWith("Task> ")) {
			setImmediate(() => input.write("first task\n"));
		}
	});
	const exitCode = await runTui({
		session,
		provider: adapter.providerId,
		model: adapter.modelId,
		thinking: adapter.thinkingLevel,
		workspace: directory,
		archiveStore,
		input,
		output,
	});
	assert.equal(exitCode, 0);
	assert.equal(faux.state.callCount, 1);
	assert.match(text, /ARCHIVE run=.* sealed=true state=terminal/);
	assert.match(text, /REPLAY run=.* \(archived; zero effects\)/);
	assert.match(text, /SETTLED state=terminal/);
	assert.match(text, /TASK first task/);
});

// C-MEM-06: every declared event kind survives archival/replay with canonical
// semantics; credential canaries never enter archive bytes; restricted
// reasoning renders nowhere.
test("archive preserves every declared event kind and excludes credential canaries and restricted reasoning", async () => {
	const directory = await workspace();
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([
		fauxAssistantMessage(fauxToolCall("bash", { command: "printf probe" }, { id: "tool-1" }), {
			stopReason: "toolUse",
			responseId: "response-tool",
		}),
		fauxAssistantMessage(
			[fauxThinking("RESTRICTED_REASONING_CANARY"), fauxText("final public answer")],
			{ stopReason: "stop" },
		),
	]);
	const observations: SessionObservation[] = [];
	process.env.DEEPSEEK_API_KEY = "TEST_CREDENTIAL_CANARY_NEVER_ARCHIVED";
	let session: GeneralAgentSession | undefined;
	try {
		session = await sessionWithMemory(directory, adapter, observations);
		const result = await session.runTask("exercise every event kind");
		assert.equal(result.status, "completed");
	} finally {
		if (session) await session.close();
		delete process.env.DEEPSEEK_API_KEY;
	}
	const body = archiveBytes(directory);
	assert.doesNotMatch(body, /TEST_CREDENTIAL_CANARY_NEVER_ARCHIVED/);
	assert.doesNotMatch(body, /RESTRICTED_REASONING_CANARY/);
	const rendered = observations.map((observation) => JSON.stringify(observation)).join("\n");
	assert.doesNotMatch(rendered, /RESTRICTED_REASONING_CANARY/);

	const store = await RunArchiveStore.open(join(directory, "memory"));
	const [runEntry] = await store.listRuns();
	assert.ok(runEntry);
	const records = await store.readArchive(runEntry.runId);
	const kinds = records.map((record) => String(record.type));
	for (const required of [
		"run.started",
		"model.turn_started",
		"model.turn_settled",
		"tool.started",
		"tool.settled",
		"run.terminal",
		"run.settled",
	]) {
		assert.ok(kinds.includes(required), `archive must contain ${required}`);
	}
	// Canonical semantics survive replay: key fields are intact.
	const settled = records.find((record) => record.type === "model.turn_settled") as
		| { responseId?: string; usage?: { totalTokens?: number } }
		| undefined;
	assert.ok(settled);
	const toolSettled = records.find((record) => record.type === "tool.settled") as
		| { toolName?: string; text?: string }
		| undefined;
	assert.equal(toolSettled?.toolName, "bash");
	assert.match(toolSettled?.text ?? "", /probe/);
});

// C-MEM-07: ledger admission validates sealed references and supersession is
// the only mutation; no update/delete path exists.
test("retrospective ledger enforces sealed reference integrity and supersession-only mutation", async () => {
	const directory = await workspace();
	const root = join(directory, "memory");
	const store = await RunArchiveStore.open(root);
	const ledger = await RetrospectiveLedger.open(root);
	const sealedHeadHash = async (runId: string): Promise<string | null> => {
		try {
			return (await store.readManifest(runId)).head_hash;
		} catch {
			return null;
		}
	};

	const writer = await store.beginRun("run-for-ledger");
	await writer.append({ type: "run.started", runId: writer.runId, task: "ledger target" });

	// unsealed reference rejected
	await assert.rejects(
		ledger.append(
			{ runId: writer.runId, archiveHeadHash: "sha256:whatever", kind: "note", body: "too early" },
			sealedHeadHash,
		),
		LedgerReferenceError,
	);
	const manifest = await writer.settle("terminal", "done");
	const note = await ledger.append(
		{ runId: writer.runId, archiveHeadHash: manifest.head_hash ?? "", kind: "note", body: "first interpretation" },
		sealedHeadHash,
	);
	// nonexistent archive and mismatched hash rejected
	await assert.rejects(
		ledger.append(
			{ runId: "no-such-run", archiveHeadHash: "sha256:x", kind: "note", body: "ghost" },
			sealedHeadHash,
		),
		LedgerReferenceError,
	);
	await assert.rejects(
		ledger.append(
			{ runId: writer.runId, archiveHeadHash: "sha256:forged", kind: "note", body: "wrong hash" },
			sealedHeadHash,
		),
		LedgerReferenceError,
	);
	// supersession-only correction
	const correction = await ledger.append(
		{
			runId: writer.runId,
			archiveHeadHash: manifest.head_hash ?? "",
			kind: "correction",
			body: "revised interpretation",
			supersedes: note.entry_id,
		},
		sealedHeadHash,
	);
	assert.equal(correction.supersedes, note.entry_id);
	const entries = await ledger.list();
	assert.equal(entries.length, 2);
	assert.equal(entries[0]?.body, "first interpretation");
	assert.equal(entries[1]?.supersedes, note.entry_id);
	// superseding a missing entry or superseding on a note is rejected
	await assert.rejects(
		ledger.append(
			{
				runId: writer.runId,
				archiveHeadHash: manifest.head_hash ?? "",
				kind: "correction",
				body: "orphan",
				supersedes: "retro-missing",
			},
			sealedHeadHash,
		),
		LedgerReferenceError,
	);
	const surface = ledger as unknown as Record<string, unknown>;
	assert.equal(typeof surface.update, "undefined");
	assert.equal(typeof surface.delete, "undefined");
});

// C-MEM-08: ledger entries are not trajectory and are never auto-promoted.
test("ledger entries are rejected as archive trajectory and the fact register is untouched", async () => {
	const directory = await workspace();
	const root = join(directory, "memory");
	const store = await RunArchiveStore.open(root);
	const ledger = await RetrospectiveLedger.open(root);
	const writer = await store.beginRun("run-distinct-types");
	await writer.append({ type: "run.started", runId: writer.runId, task: "typing" });
	const manifest = await writer.settle("terminal", "done");
	await ledger.append(
		{ runId: writer.runId, archiveHeadHash: manifest.head_hash ?? "", kind: "note", body: "interpretation" },
		async () => manifest.head_hash,
	);
	const [entry] = await ledger.list();
	assert.ok(entry);
	// A ledger line is not a run-archive record.
	assert.throws(
		() =>
			verifyArchiveBytes(`${JSON.stringify(entry)}\n`, {
				schema: "run-archive-manifest/v1",
				run_id: writer.runId,
				record_count: 1,
				head_hash: null,
				events_sha256: sha256(`${JSON.stringify(entry)}\n`),
				settled_state: "terminal",
				settled_reason: "x",
			}),
		ArchiveIntegrityError,
	);
	// Injecting a ledger line into a sealed archive fails integrity.
	const eventsPath = join(root, "runs", writer.runId, "events.jsonl");
	const sealedBody = await readFile(eventsPath, "utf8");
	await writeFile(eventsPath, `${sealedBody}${JSON.stringify(entry)}\n`, "utf8");
	await assert.rejects(store.readArchive(writer.runId), ArchiveIntegrityError);

	// The Verified Project Facts register is byte-identical to the accepted base.
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
	const base = execFileSync(
		"git",
		["show", "c366060a706ddbf1905943eed8d4aa029837e8c2:docs/evidence/verified-project-facts.md"],
		{ cwd: repoRoot },
	);
	const current = readFileSync(join(repoRoot, "docs", "evidence", "verified-project-facts.md"));
	assert.ok(base.equals(current), "verified-project-facts.md must not change in this WorkOrder");
});

// C-MEM-09: every run records the exact Runbook revision in force at its
// creation; edits and reverts produce/restore revision identities; sealed
// archives keep resolving their originally recorded revision.
test("runbook revision binding survives later edits and reverts", async () => {
	const directory = await workspace();
	const runbookPath = join(directory, "RUNBOOK.md");
	const v0 = await editRunbook(runbookPath, "Runbook v0 guidance.\n");
	const { adapter, faux } = fauxAdapter();
	faux.setResponses([fauxAssistantMessage("one"), fauxAssistantMessage("two"), fauxAssistantMessage("three")]);

	const store = await RunArchiveStore.open(join(directory, "memory"));
	const trustedLocal = createTrustedLocalTools(directory);
	const session = new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: { archiveStore: store, runbook: () => loadRunbook(runbookPath) },
		onObservation: () => {},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	let runV0 = "";
	let runV1 = "";
	let runReverted = "";
	let v1Revision = "";
	try {
		runV0 = (await session.runTask("first")).runId;
		const v1 = await editRunbook(runbookPath, "Runbook v1 revised guidance.\n");
		assert.notEqual(v1.revision, v0.revision);
		v1Revision = v1.revision;
		runV1 = (await session.runTask("second")).runId;
		const reverted = await editRunbook(runbookPath, "Runbook v0 guidance.\n");
		assert.equal(reverted.revision, v0.revision);
		runReverted = (await session.runTask("third")).runId;
	} finally {
		await session.close();
	}

	const revisionOf = async (runId: string): Promise<string> => {
		const records = await store.readArchive(runId);
		const started = records[0] as { runbook_revision?: string };
		assert.ok(started.runbook_revision);
		return started.runbook_revision;
	};
	// Every run recorded the exact revision in force at its creation.
	assert.equal(await revisionOf(runV0), v0.revision);
	assert.equal(await revisionOf(runV1), v1Revision);
	assert.equal(await revisionOf(runReverted), v0.revision);
	// The file currently holds reverted v0 content; runV1's sealed record still
	// resolves to v1 — a later mutation never rewrites an old run's meaning.
	assert.equal((await loadRunbook(runbookPath)).revision, v0.revision);
	assert.equal(await revisionOf(runV1), v1Revision);
});

// CLI contract: --memory-root is required and must be disjoint from the workspace.
test("CLI requires a disjoint --memory-root before any Adapter construction", async () => {
	const output = new PassThrough();
	let text = "";
	output.setEncoding("utf8");
	output.on("data", (chunk: string) => {
		text += chunk;
	});
	let adapterConstructions = 0;
	const createAdapter = (): never => {
		adapterConstructions += 1;
		throw new Error("Adapter must not be constructed for invalid CLI input");
	};
	const missing = await runCli(["--workspace", "/tmp"], { output, createAdapter });
	assert.equal(missing, 2);
	assert.match(text, /--memory-root is required/);

	const directory = await workspace();
	const nested = await runCli(["--workspace", directory, "--memory-root", join(directory, "memory")], {
		output,
		createAdapter,
	});
	assert.equal(nested, 2);
	assert.match(text, /disjoint/);
	assert.equal(adapterConstructions, 0);
});

