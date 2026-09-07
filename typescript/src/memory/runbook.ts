/**
 * Runbook — the WorkOrder #25 current-guidance memory lane.
 *
 * The Runbook is the current best operating instructions: intentionally
 * mutable through ordinary version-controlled edits, diffs, and reverts.
 * Its revision identity is the content hash in force at run creation, and
 * every Run Archive records that exact identity, so later Runbook changes
 * never rewrite the meaning of an old run.
 *
 * A Retrospective Ledger entry may propose a Runbook change, but nothing in
 * this module mutates the Runbook implicitly; edits are ordinary,
 * operator-visible file changes.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export class RunbookNotFoundError extends Error {}

export interface RunbookSnapshot {
	readonly content: string;
	readonly revision: string;
}

function revisionOf(content: string): string {
	return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

/** Load the Runbook at path; absence fails typed rather than inventing content. */
export async function loadRunbook(path: string): Promise<RunbookSnapshot> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch {
		throw new RunbookNotFoundError(`Runbook not found: ${path}`);
	}
	return { content, revision: revisionOf(content) };
}

/**
 * Apply an operator edit, returning the new revision identity. An edit
 * produces a new revision; reverting to earlier content restores that
 * earlier revision identity.
 */
export async function editRunbook(path: string, content: string): Promise<RunbookSnapshot> {
	if (content.trim().length === 0) {
		throw new RunbookNotFoundError("Runbook content must not be empty");
	}
	await writeFile(path, content, "utf8");
	return { content, revision: revisionOf(content) };
}
