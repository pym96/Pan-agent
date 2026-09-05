/**
 * Run Archive — the WorkOrder #25 raw-trajectory memory lane.
 *
 * One archive per run: an append-only `events.jsonl` hash chain plus a
 * `manifest.json` seal written at settlement. A sealed archive is read-only
 * through every application-owned write interface; byte-level tampering is
 * detectable by integrity verification. An unsealed archive (process
 * interruption) is settled with a distinct interrupted marker during
 * recovery and then sealed; its identity is never reused.
 *
 * Application-owned write interfaces (exhaustive enumeration):
 *   1. `RunArchiveStore.beginRun(...)` — creates a new archive; refuses an
 *      existing run identity.
 *   2. `RunArchiveWriter.append(...)` — appends while active; refuses after
 *      sealing.
 *   3. `RunArchiveWriter.settle(...)` — seals once; refuses a second seal.
 *   4. `RunArchiveStore.recoverRun(...)` — settles an unsealed archive as
 *      interrupted; refuses sealed archives.
 * No overwrite or delete interface exists; raw bytes are never rewritten.
 *
 * This is an application-level contract, not a filesystem-immutability or
 * OS-isolation claim.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, open as openFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const RUN_ARCHIVE_RECORD_SCHEMA = "run-archive-record/v1";
export const RUN_ARCHIVE_MANIFEST_SCHEMA = "run-archive-manifest/v1";

export type ArchiveSettledState = "terminal" | "cancelled" | "failed" | "interrupted";

export class ArchiveIdentityError extends Error {}
export class ArchiveSealedError extends Error {}
export class ArchiveIntegrityError extends Error {}
export class ArchiveNotFoundError extends Error {}

interface ArchiveRecordLine {
	schema: typeof RUN_ARCHIVE_RECORD_SCHEMA;
	sequence: number;
	run_id: string;
	previous_hash: string | null;
	record: Record<string, unknown>;
}

export interface RunArchiveManifest {
	readonly schema: typeof RUN_ARCHIVE_MANIFEST_SCHEMA;
	readonly run_id: string;
	readonly record_count: number;
	readonly head_hash: string | null;
	readonly events_sha256: string;
	readonly settled_state: ArchiveSettledState;
	readonly settled_reason: string;
}

export interface RunSummaryEntry {
	readonly runId: string;
	readonly sealed: boolean;
	readonly settledState?: ArchiveSettledState;
	readonly recordCount: number;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") {
		const input = value as Record<string, unknown>;
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(input).sort()) output[key] = sortKeys(input[key]);
		return output;
	}
	return value;
}

function sha256Hex(body: string): string {
	return createHash("sha256").update(body, "utf8").digest("hex");
}

function parseLine(line: string, lineNumber: number): ArchiveRecordLine {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		throw new ArchiveIntegrityError(`archive line ${lineNumber} is not valid JSON`);
	}
	const record = parsed as Partial<ArchiveRecordLine>;
	if (
		record === null ||
		typeof record !== "object" ||
		record.schema !== RUN_ARCHIVE_RECORD_SCHEMA ||
		typeof record.sequence !== "number" ||
		typeof record.run_id !== "string" ||
		!("previous_hash" in record) ||
		typeof record.record !== "object" ||
		record.record === null
	) {
		throw new ArchiveIntegrityError(`archive line ${lineNumber} is not a ${RUN_ARCHIVE_RECORD_SCHEMA} record`);
	}
	return record as ArchiveRecordLine;
}

/** Verify every line's chain linkage against the file bytes and manifest. */
export function verifyArchiveBytes(eventsBody: string, manifest: RunArchiveManifest): void {
	if (manifest.schema !== RUN_ARCHIVE_MANIFEST_SCHEMA) {
		throw new ArchiveIntegrityError("archive manifest schema mismatch");
	}
	if (sha256Hex(eventsBody) !== manifest.events_sha256) {
		throw new ArchiveIntegrityError("archive events bytes diverge from the sealed manifest");
	}
	const lines = eventsBody.length === 0 ? [] : eventsBody.split("\n").filter((line) => line.length > 0);
	let previousHash: string | null = null;
	lines.forEach((line, index) => {
		const parsed = parseLine(line, index + 1);
		if (parsed.sequence !== index) {
			throw new ArchiveIntegrityError(`archive line ${index + 1} sequence ${parsed.sequence} != ${index}`);
		}
		if (parsed.run_id !== manifest.run_id) {
			throw new ArchiveIntegrityError(`archive line ${index + 1} run identity mismatch`);
		}
		if (parsed.previous_hash !== previousHash) {
			throw new ArchiveIntegrityError(`archive line ${index + 1} hash chain is broken`);
		}
		previousHash = `sha256:${sha256Hex(line)}`;
	});
	if (lines.length !== manifest.record_count) {
		throw new ArchiveIntegrityError(
			`archive record count ${lines.length} diverges from sealed ${manifest.record_count}`,
		);
	}
	if (previousHash !== manifest.head_hash) {
		throw new ArchiveIntegrityError("archive head hash diverges from the sealed manifest");
	}
}

export class RunArchiveWriter {
	readonly runId: string;
	private sealed = false;
	private readonly eventsPath: string;
	private readonly manifestPath: string;
	private sequence: number;
	private previousHash: string | null;

	private constructor(
		runId: string,
		eventsPath: string,
		manifestPath: string,
		sequence: number,
		previousHash: string | null,
	) {
		this.runId = runId;
		this.eventsPath = eventsPath;
		this.manifestPath = manifestPath;
		this.sequence = sequence;
		this.previousHash = previousHash;
	}

	/** Create a new archive exclusively; an existing directory is an identity collision. */
	static async create(runRoot: string, runId: string): Promise<RunArchiveWriter> {
		await mkdir(runRoot, { recursive: false });
		return new RunArchiveWriter(runId, join(runRoot, "events.jsonl"), join(runRoot, "manifest.json"), 0, null);
	}

	/** Resume a recovered unsealed archive at its verified causal prefix. */
	static resume(
		runId: string,
		eventsPath: string,
		manifestPath: string,
		sequence: number,
		previousHash: string | null,
	): RunArchiveWriter {
		return new RunArchiveWriter(runId, eventsPath, manifestPath, sequence, previousHash);
	}

	get isSealed(): boolean {
		return this.sealed;
	}

	/** Append one canonical record; durable (flushed) before returning. */
	async append(record: Record<string, unknown>): Promise<void> {
		await this.requireUnsealed();
		const line: ArchiveRecordLine = {
			schema: RUN_ARCHIVE_RECORD_SCHEMA,
			sequence: this.sequence,
			run_id: this.runId,
			previous_hash: this.previousHash,
			record,
		};
		const body = `${canonicalJson(line)}\n`;
		const handle = await openFile(this.eventsPath, "a");
		try {
			await handle.appendFile(body, "utf8");
			await handle.sync();
		} finally {
			await handle.close();
		}
		this.previousHash = `sha256:${sha256Hex(canonicalJson(line))}`;
		this.sequence += 1;
	}

	/**
	 * Refuse writes once sealed — including staleness from a concurrent or
	 * recovered writer, detected through the durable manifest's existence.
	 */
	private async requireUnsealed(): Promise<void> {
		if (this.sealed) {
			throw new ArchiveSealedError(`archive ${this.runId} is sealed; append refused`);
		}
		try {
			await readFile(this.manifestPath, "utf8");
			this.sealed = true;
			throw new ArchiveSealedError(
				`archive ${this.runId} was sealed elsewhere; write refused`,
			);
		} catch (error) {
			if (error instanceof ArchiveSealedError) throw error;
			// Manifest absent: still active.
		}
	}

	/** Seal the archive exactly once with its settlement state. */
	async settle(state: ArchiveSettledState, reason: string): Promise<RunArchiveManifest> {
		if (this.sealed) {
			throw new ArchiveSealedError(`archive ${this.runId} is already sealed; re-settle refused`);
		}
		await this.requireUnsealed();
		await this.append({
			type: "run.settled",
			settled_state: state,
			reason,
		});
		const eventsBody = await readFile(this.eventsPath, "utf8");
		const manifest: RunArchiveManifest = {
			schema: RUN_ARCHIVE_MANIFEST_SCHEMA,
			run_id: this.runId,
			record_count: this.sequence,
			head_hash: this.previousHash,
			events_sha256: sha256Hex(eventsBody),
			settled_state: state,
			settled_reason: reason,
		};
		await writeFile(this.manifestPath, `${canonicalJson(manifest)}\n`, "utf8");
		this.sealed = true;
		return manifest;
	}
}

export class RunArchiveStore {
	readonly root: string;

	private constructor(root: string) {
		this.root = root;
	}

	/** Open (creating if needed) an archive root and recover any unsealed runs. */
	static async open(root: string): Promise<RunArchiveStore> {
		const runsRoot = join(root, "runs");
		await mkdir(runsRoot, { recursive: true });
		const store = new RunArchiveStore(root);
		for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			try {
				await store.readManifest(entry.name);
			} catch (error) {
				// Only a missing manifest means the run was interrupted before
				// sealing. A present-but-corrupted manifest belongs to a settled
				// archive: it is left byte-untouched here so one corrupted
				// archive never blocks startup, and every read path
				// (readManifest/readArchive/listRuns) reports it as a typed
				// ArchiveIntegrityError instead.
				if (error instanceof ArchiveNotFoundError) await store.recoverRun(entry.name);
				else if (error instanceof ArchiveIntegrityError) continue;
				else throw error;
			}
		}
		return store;
	}

	/**
	 * Settle an unsealed archive as interrupted: verify the causal prefix,
	 * truncate torn tail bytes from a mid-write crash (their count is disclosed
	 * in the marker, never silently dropped), append the interrupted
	 * settlement, and seal.
	 */
	async recoverRun(runId: string): Promise<RunArchiveManifest> {
		const runRoot = join(this.root, "runs", runId);
		const eventsPath = join(runRoot, "events.jsonl");
		const manifestPath = join(runRoot, "manifest.json");
		try {
			await readFile(manifestPath, "utf8");
			throw new ArchiveSealedError(`archive ${runId} is sealed; recovery write refused`);
		} catch (error) {
			if (error instanceof ArchiveSealedError) throw error;
		}
		let raw: Buffer = Buffer.alloc(0);
		try {
			raw = await readFile(eventsPath);
		} catch {
			// No events file: the run was interrupted before its first record.
		}
		const text = raw.toString("utf8");
		const lines = text.length === 0 ? [] : text.split("\n");
		let sequence = 0;
		let previousHash: string | null = null;
		let validPrefixBytes = 0;
		let torn = false;
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index] ?? "";
			const isTrailingNewline = index === lines.length - 1 && line.length === 0;
			if (isTrailingNewline) break;
			try {
				const parsed = parseLine(line, index + 1);
				if (parsed.sequence !== sequence || parsed.run_id !== runId || parsed.previous_hash !== previousHash) {
					torn = true;
					break;
				}
				previousHash = `sha256:${sha256Hex(line)}`;
				sequence += 1;
				validPrefixBytes += Buffer.byteLength(line, "utf8") + 1;
			} catch {
				// Torn or non-record bytes are not records; their byte count is
				// disclosed in the interrupted marker rather than silently dropped.
				torn = true;
				break;
			}
		}
		const tornTailBytes = torn ? raw.length - validPrefixBytes : 0;
		if (torn) {
			const handle = await openFile(eventsPath, "r+");
			try {
				await handle.truncate(validPrefixBytes);
			} finally {
				await handle.close();
			}
		}
		const writer = RunArchiveWriter.resume(runId, eventsPath, manifestPath, sequence, previousHash);
		return writer.settle("interrupted", `recovered_unsealed_run torn_tail_bytes=${tornTailBytes}`);
	}

	/** Begin a new run archive; the run identity must be unique and unused. */
	async beginRun(runId: string = randomUUID()): Promise<RunArchiveWriter> {
		try {
			return await RunArchiveWriter.create(join(this.root, "runs", runId), runId);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "EEXIST") {
				throw new ArchiveIdentityError(`run identity already exists: ${runId}`);
			}
			throw error;
		}
	}

	async listRuns(): Promise<RunSummaryEntry[]> {
		const runsRoot = join(this.root, "runs");
		const entries = await readdir(runsRoot, { withFileTypes: true });
		const runs: RunSummaryEntry[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			try {
				const manifest = await this.readManifest(entry.name);
				runs.push({
					runId: entry.name,
					sealed: true,
					settledState: manifest.settled_state,
					recordCount: manifest.record_count,
				});
			} catch (error) {
				if (error instanceof ArchiveNotFoundError) {
					runs.push({ runId: entry.name, sealed: false, recordCount: 0 });
					continue;
				}
				throw error;
			}
		}
		return runs.sort((left, right) => left.runId.localeCompare(right.runId));
	}

	async readManifest(runId: string): Promise<RunArchiveManifest> {
		let body: string;
		try {
			body = await readFile(join(this.root, "runs", runId, "manifest.json"), "utf8");
		} catch {
			throw new ArchiveNotFoundError(`no sealed archive for run ${runId}`);
		}
		let manifest: unknown;
		try {
			manifest = JSON.parse(body);
		} catch {
			throw new ArchiveIntegrityError(`archive ${runId} manifest is not valid JSON`);
		}
		const candidate = manifest as Partial<RunArchiveManifest>;
		if (
			candidate === null ||
			typeof candidate !== "object" ||
			candidate.schema !== RUN_ARCHIVE_MANIFEST_SCHEMA ||
			typeof candidate.run_id !== "string" ||
			typeof candidate.record_count !== "number" ||
			!("head_hash" in candidate) ||
			typeof candidate.events_sha256 !== "string" ||
			typeof candidate.settled_state !== "string" ||
			typeof candidate.settled_reason !== "string"
		) {
			throw new ArchiveIntegrityError(`archive ${runId} manifest is not a ${RUN_ARCHIVE_MANIFEST_SCHEMA} record`);
		}
		return candidate as RunArchiveManifest;
	}

	/** Read and verify a sealed archive; any byte deviation fails typed. */
	async readArchive(runId: string): Promise<Record<string, unknown>[]> {
		const manifest = await this.readManifest(runId);
		const eventsBody = await readFile(join(this.root, "runs", runId, "events.jsonl"), "utf8");
		verifyArchiveBytes(eventsBody, manifest);
		return eventsBody
			.split("\n")
			.filter((line) => line.length > 0)
			.map((line, index) => parseLine(line, index + 1).record);
	}
}
