import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { RunArchiveStore } from "./run-archive.ts";
import type { GeneralAgentSession, SessionObservation, TaskRunResult } from "./session.ts";

export interface TuiOptions {
	readonly session: GeneralAgentSession;
	readonly provider: string;
	readonly model: string;
	readonly thinking: string;
	readonly workspace: string;
	readonly archiveStore?: RunArchiveStore;
	readonly input?: Readable;
	readonly output?: Writable;
}

function json(value: unknown): string {
	return JSON.stringify(value);
}

function isReadlineClosedError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ERR_USE_AFTER_CLOSE";
}

export function renderObservation(observation: SessionObservation): string[] {
	switch (observation.type) {
		case "run.started":
			return [`RUN ${observation.runId}`, `TASK ${observation.task}`];
		case "model.turn_started":
			return [`MODEL turn=${observation.turn} started`];
		case "model.turn_settled":
			return [
				`MODEL turn=${observation.turn} settled provider=${observation.provider} model=${observation.model} response_id=${observation.responseId ?? "unknown"} stop=${observation.stopReason}`,
				`USAGE input=${observation.usage.input} output=${observation.usage.output} cache_read=${observation.usage.cacheRead} cache_write=${observation.usage.cacheWrite} total=${observation.usage.totalTokens}`,
				...(observation.text ? [`ASSISTANT ${observation.text}`] : []),
			];
		case "tool.started":
			return [
				`TOOL started name=${observation.toolName} call=${observation.toolCallId} arguments=${json(observation.arguments)}`,
			];
		case "tool.settled":
			return [
				`TOOL settled name=${observation.toolName} call=${observation.toolCallId} status=${observation.isError ? "error" : "ok"}`,
				...(observation.text ? [`OBSERVATION ${observation.text}`] : []),
			];
		case "run.terminal":
			return [`TERMINAL ${observation.status}: ${observation.reason}`];
	}
}

export function renderRunSummary(result: TaskRunResult): string {
	return `RUN_SUMMARY run=${result.runId} terminal=${result.status} model_calls=${result.modelCalls} tool_calls=${result.toolCalls} total_tokens=${result.usage.totalTokens} context_retained=true archive_sealed=${result.archiveSealed}`;
}

/** Render one archived record for zero-effect replay; never executes anything. */
export function renderArchivedRecord(record: Record<string, unknown>): string[] {
	if (record.type === "run.settled") {
		return [`SETTLED state=${String(record.settled_state)} reason=${String(record.reason)}`];
	}
	const known = new Set([
		"run.started",
		"model.turn_started",
		"model.turn_settled",
		"tool.started",
		"tool.settled",
		"run.terminal",
	]);
	if (known.has(String(record.type))) {
		return renderObservation(record as unknown as SessionObservation);
	}
	return [`RECORD ${json(record)}`];
}

export async function runTui(options: TuiOptions): Promise<number> {
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stdout;
	const inputIsTty = "isTTY" in input && input.isTTY === true;
	const outputIsTty = "isTTY" in output && output.isTTY === true;
	const readline = createInterface({ input, output, terminal: inputIsTty && outputIsTty });
	let closing = false;
	let running = false;

	const writeLine = (line: string): void => {
		output.write(`${line}\n`);
	};
	const onInterrupt = (): void => {
		if (running) {
			writeLine("CANCEL requested; waiting for Pi and the active tool to settle.");
			options.session.cancel();
			return;
		}
		closing = true;
		readline.close();
	};
	readline.on("SIGINT", onInterrupt);

	writeLine("LIVE MODE: a Provider call occurs only after a non-empty task is submitted.");
	writeLine(`PROVIDER ${options.provider}`);
	writeLine(`MODEL ${options.model}`);
	writeLine(`THINKING ${options.thinking}`);
	writeLine(`WORKSPACE ${options.workspace}`);
	writeLine("SHELL trusted-local: host-user authority; workspace is cwd, not containment or an OS sandbox.");

	try {
		let confirmation: string;
		try {
			confirmation = await readline.question("Confirm provider and trusted-local workspace [y/N]> ");
		} catch (error) {
			if (!closing && !isReadlineClosedError(error)) throw error;
			writeLine("Cancelled before Provider use.");
			return 0;
		}
		const confirmed = confirmation.trim().toLowerCase();
		if (confirmed !== "y" && confirmed !== "yes") {
			writeLine("Cancelled before Provider use.");
			return 0;
		}
		writeLine("COMMANDS :help | :context | :runs | :replay RUN_ID | :exit");
		while (!closing) {
			let task: string;
			try {
				task = await readline.question("Task> ");
			} catch (error) {
				if (closing || isReadlineClosedError(error)) break;
				throw error;
			}
			const trimmed = task.trim();
			if (!trimmed) {
				writeLine("Task must not be blank; no Provider call was made.");
				continue;
			}
			if (trimmed === ":exit") break;
			if (trimmed === ":help") {
				writeLine("Submit a task, inspect retained Pi context with :context, list sealed Run Archives with :runs, replay one with :replay RUN_ID (zero Provider calls and zero tool effects), or exit with :exit.");
				continue;
			}
			if (trimmed === ":context") {
				writeLine(`CONTEXT messages=${options.session.contextMessageCount} owner=Pi truncation=none`);
				continue;
			}
			if (trimmed === ":runs") {
				if (!options.archiveStore) {
					writeLine("Memory is not configured; no Provider call was made.");
					continue;
				}
				try {
					const runs = await options.archiveStore.listRuns();
					if (runs.length === 0) {
						writeLine("ARCHIVES none");
						continue;
					}
					for (const run of runs) {
						writeLine(
							`ARCHIVE run=${run.runId} sealed=${run.sealed} state=${run.settledState ?? "unsealed"} records=${run.recordCount}`,
						);
					}
				} catch (error) {
					writeLine(`ARCHIVE_ERROR ${error instanceof Error ? error.message : String(error)}`);
				}
				continue;
			}
			if (trimmed.startsWith(":replay")) {
				if (!options.archiveStore) {
					writeLine("Memory is not configured; no Provider call was made.");
					continue;
				}
				const runId = trimmed.slice(":replay".length).trim();
				if (!runId) {
					writeLine("Usage: :replay RUN_ID; no Provider call was made.");
					continue;
				}
				try {
					const records = await options.archiveStore.readArchive(runId);
					writeLine(`REPLAY run=${runId} records=${records.length} (archived; zero effects)`);
					for (const record of records) {
						for (const line of renderArchivedRecord(record)) writeLine(line);
					}
				} catch (error) {
					writeLine(`ARCHIVE_ERROR ${error instanceof Error ? error.message : String(error)}`);
				}
				continue;
			}
			if (trimmed.startsWith(":")) {
				writeLine(`Unknown command: ${trimmed}; no Provider call was made.`);
				continue;
			}

			running = true;
			try {
				const result = await options.session.runTask(task);
				writeLine(renderRunSummary(result));
			} catch (error) {
				writeLine(`HARNESS_ERROR ${error instanceof Error ? error.message : String(error)}`);
			} finally {
				running = false;
			}
		}
		return 0;
	} finally {
		readline.off("SIGINT", onInterrupt);
		readline.close();
		await options.session.close();
		writeLine("General Agent TUI closed.");
	}
}
