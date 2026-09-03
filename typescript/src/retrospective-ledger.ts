/**
 * Retrospective Ledger — the WorkOrder #25 interpretation memory lane.
 *
 * Post-run conclusions and corrections, stored append-only and separately
 * from the raw Run Archive. Every entry references a sealed Run Archive
 * identity plus its sealed head hash. A correction is a new entry carrying
 * an explicit `supersedes` reference; earlier entries are never edited or
 * deleted, and no update/delete interface exists.
 *
 * A retrospective entry is not raw trajectory and is not automatically a
 * Verified Project Fact; fact promotion follows verification governance.
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const RETROSPECTIVE_ENTRY_SCHEMA = "retrospective-entry/v1";

export class LedgerReferenceError extends Error {}

export interface RetrospectiveEntry {
	readonly schema: typeof RETROSPECTIVE_ENTRY_SCHEMA;
	readonly entry_id: string;
	readonly sequence: number;
	readonly run_id: string;
	readonly archive_head_hash: string;
	readonly kind: "note" | "correction";
	readonly body: string;
	readonly supersedes: string | null;
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

export interface LedgerEntryInput {
	readonly runId: string;
	readonly archiveHeadHash: string;
	readonly kind: "note" | "correction";
	readonly body: string;
	readonly supersedes?: string;
}

export class RetrospectiveLedger {
	private readonly ledgerPath: string;

	private constructor(ledgerPath: string) {
		this.ledgerPath = ledgerPath;
	}

	static async open(root: string): Promise<RetrospectiveLedger> {
		const ledgerPath = join(root, "retrospective-ledger.jsonl");
		try {
			await readFile(ledgerPath, "utf8");
		} catch {
			await writeFile(ledgerPath, "", "utf8");
		}
		return new RetrospectiveLedger(ledgerPath);
	}

	/**
	 * Append one entry. The referenced Run Archive must exist, be sealed, and
	 * match the declared head hash; a correction must supersede an existing
	 * entry. Admission failures are typed; nothing is edited or deleted.
	 */
	async append(
		input: LedgerEntryInput,
		sealedHeadHash: (runId: string) => Promise<string | null>,
	): Promise<RetrospectiveEntry> {
		if (typeof input.body !== "string" || input.body.trim().length === 0) {
			throw new LedgerReferenceError("retrospective entry body must be non-empty text");
		}
		const sealedHash = await sealedHeadHash(input.runId);
		if (sealedHash === null) {
			throw new LedgerReferenceError(
				`retrospective entry references a nonexistent or unsealed archive: ${input.runId}`,
			);
		}
		if (sealedHash !== input.archiveHeadHash) {
			throw new LedgerReferenceError(
				`retrospective entry archive head hash mismatch for run ${input.runId}`,
			);
		}
		const entries = await this.list();
		let supersedes: string | null = null;
		if (input.kind === "correction") {
			if (!input.supersedes) {
				throw new LedgerReferenceError("a correction must name the entry it supersedes");
			}
			if (!entries.some((entry) => entry.entry_id === input.supersedes)) {
				throw new LedgerReferenceError(`superseded entry does not exist: ${input.supersedes}`);
			}
			supersedes = input.supersedes;
		} else if (input.supersedes !== undefined) {
			throw new LedgerReferenceError("only a correction may carry a supersedes reference");
		}
		const entry: RetrospectiveEntry = {
			schema: RETROSPECTIVE_ENTRY_SCHEMA,
			entry_id: `retro-${randomUUID()}`,
			sequence: entries.length,
			run_id: input.runId,
			archive_head_hash: input.archiveHeadHash,
			kind: input.kind,
			body: input.body,
			supersedes,
		};
		await appendFile(this.ledgerPath, `${canonicalJson(entry)}\n`, "utf8");
		return entry;
	}

	async list(): Promise<RetrospectiveEntry[]> {
		const body = await readFile(this.ledgerPath, "utf8");
		return body
			.split("\n")
			.filter((line) => line.length > 0)
			.map((line) => {
				const parsed = JSON.parse(line) as RetrospectiveEntry;
				if (parsed.schema !== RETROSPECTIVE_ENTRY_SCHEMA) {
					throw new LedgerReferenceError("ledger line is not a retrospective-entry/v1 record");
				}
				return parsed;
			});
	}

	/** Content identity of the whole ledger, for provenance references. */
	async identity(): Promise<string> {
		const body = await readFile(this.ledgerPath, "utf8");
		return `sha256:${sha256Hex(body)}`;
	}
}
