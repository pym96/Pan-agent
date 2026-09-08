import * as fs from "node:fs/promises";
import { constants, type BigIntStats } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { attachmentHash, eligibleRelativePath, type AttachmentSnapshot } from "./task-envelope.ts";

export const DEFAULT_MAX_ATTACHMENT_BYTES = 1_048_576;
export class AttachmentError extends Error {
	readonly code: string;
	constructor(code: string) { super(code); this.name = "AttachmentError"; this.code = code; }
}
export function validateAttachmentLimit(value: unknown = DEFAULT_MAX_ATTACHMENT_BYTES): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new AttachmentError("attachment_limit_invalid");
	return value;
}
const fail = (code: string): never => { throw new AttachmentError(code); };
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) fail("attachment_cancelled"); };
async function anchor(workspace: string): Promise<string> {
	const info = await fs.lstat(workspace);
	if (!info.isDirectory() || info.isSymbolicLink()) fail("attachment_workspace_invalid");
	return fs.realpath(workspace);
}
async function pathIdentity(root: string, path: string): Promise<BigIntStats[]> {
	if (!eligibleRelativePath(path)) fail("attachment_path_ineligible");
	let at = root; const identities: BigIntStats[] = [];
	const parts = path.split("/");
	for (let i = 0; i < parts.length; i++) {
		at = join(at, parts[i]!);
		const info = await fs.lstat(at, {bigint:true});
		if (info.isSymbolicLink() || (i === parts.length - 1 ? !info.isFile() : !info.isDirectory())) fail("attachment_path_ineligible");
		identities.push(info);
	}
	return identities;
}
async function gitWorkspace(root: string): Promise<boolean> {
	let at = root;
	while (true) {
		try { await fs.lstat(join(at, ".git")); return true; }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		const parent = dirname(at); if (parent === at) return false; at = parent;
	}
}
/** Names and metadata only; a Git listing failure never broadens to non-Git discovery. */
export async function discoverAttachmentPaths(workspace: string): Promise<readonly string[]> {
	try {
		const root = await anchor(workspace); let names: string[] = [];
		if (await gitWorkspace(root)) {
			const {stdout} = await promisify(execFile)("git", ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.excludesFile=/dev/null", "-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], {
				encoding:"buffer", maxBuffer:16 * 1024 * 1024,
				env:{PATH:process.env.PATH ?? "/usr/bin:/bin", LC_ALL:"C", GIT_CONFIG_NOSYSTEM:"1", GIT_CONFIG_GLOBAL:"/dev/null", GIT_TERMINAL_PROMPT:"0"},
			});
			names = new TextDecoder("utf-8", {fatal:true, ignoreBOM:true}).decode(stdout).split("\0").filter(Boolean);
		} else {
			async function visit(relative: string): Promise<void> {
				const info = await fs.lstat(join(root, relative));
				if (!info.isDirectory() || info.isSymbolicLink()) fail("attachment_path_ineligible");
				for (const entry of await fs.readdir(join(root, relative), {withFileTypes:true})) {
					if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
					const path = relative ? `${relative}/${entry.name}` : entry.name;
					if (entry.isDirectory()) await visit(path); else if (entry.isFile()) names.push(path);
				}
			}
			await visit("");
		}
		const eligible: string[] = [];
		for (const path of [...new Set(names)].sort()) {
			if (!eligibleRelativePath(path)) continue;
			try { await pathIdentity(root, path); eligible.push(path); }
			catch (error) { if (error instanceof AttachmentError || ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue; throw error; }
		}
		return eligible;
	} catch (error) { if (error instanceof AttachmentError) throw error; throw new AttachmentError("attachment_discovery_failed"); }
}
const sameFile = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
/** Explicit selection only. Reads at most remaining budget + 1 bytes; never truncates. */
export async function captureAttachment(workspace: string, path: string, remainingBytes: number, signal?: AbortSignal): Promise<AttachmentSnapshot> {
	if (!Number.isSafeInteger(remainingBytes) || remainingBytes < 0) fail("attachment_limit_invalid");
	cancelled(signal);
	try {
		if (!eligibleRelativePath(path)) fail("attachment_path_ineligible");
		const root = await anchor(workspace);
		if (!(await discoverAttachmentPaths(root)).includes(path)) fail("attachment_path_ineligible");
		const before = await pathIdentity(root, path); const last = before.at(-1)!;
		if (last.size > BigInt(remainingBytes)) fail("attachment_budget_exceeded");
		cancelled(signal);
		const file = await fs.open(resolve(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const opened = await file.stat({bigint:true});
			if (!opened.isFile() || !sameFile(last, opened)) fail("attachment_changed_during_capture");
			const chunks: Buffer[] = []; let total = 0;
			while (true) {
				cancelled(signal);
				const buffer = Buffer.alloc(Math.min(65_536, remainingBytes + 1 - total));
				const {bytesRead} = await file.read(buffer, 0, buffer.length, null);
				if (!bytesRead) break;
				total += bytesRead;
				if (total > remainingBytes) fail("attachment_budget_exceeded");
				chunks.push(buffer.subarray(0, bytesRead));
			}
			cancelled(signal);
			const after = await pathIdentity(root, path);
			if (!sameFile(opened, await file.stat({bigint:true})) || !sameFile(opened, after.at(-1)!) || before.some((entry, i) => entry.dev !== after[i]!.dev || entry.ino !== after[i]!.ino)) fail("attachment_changed_during_capture");
			const bytes = Buffer.concat(chunks, total);
			if (bytes.includes(0)) fail("attachment_binary_nul");
			let text: string;
			try { text = new TextDecoder("utf-8", {fatal:true, ignoreBOM:true}).decode(bytes); }
			catch { return fail("attachment_invalid_utf8"); }
			if (!Buffer.from(text, "utf8").equals(bytes)) fail("attachment_invalid_utf8");
			return Object.freeze({path,bytes:total,sha256:attachmentHash(bytes),text});
		} finally { await file.close(); }
	} catch (error) { if (error instanceof AttachmentError) throw error; throw new AttachmentError("attachment_capture_failed"); }
}
