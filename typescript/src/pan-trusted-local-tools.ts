import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { AgentTool, AgentToolExecutionResult, ToolValidation } from "./agent-tool.ts";
import { assertJsonObject, type JsonObject, type JsonValue } from "./canonical-protocol.ts";

export const PAN_TRUSTED_LOCAL_LABEL =
	"trusted-local shell: host-user authority; selected workspace is the default cwd and relative-path base, not an OS sandbox";

const SAFE_SHELL_ENVIRONMENT_KEYS = [
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LOGNAME",
	"PATH",
	"SHELL",
	"TERM",
	"TMPDIR",
	"USER",
] as const;

type ReadArguments = JsonObject & { readonly path: string; readonly offset?: number; readonly limit?: number };
type WriteArguments = JsonObject & { readonly path: string; readonly content: string };
type EditOperation = { readonly oldText: string; readonly newText: string };
type EditArguments = JsonObject & { readonly path: string; readonly edits: readonly EditOperation[] };
type BashArguments = JsonObject & { readonly command: string; readonly timeout?: number };

export interface PanTrustedLocalTools {
	readonly tools: readonly AgentTool[];
}

function schema(properties: JsonObject, required: readonly string[]): JsonObject {
	return { type: "object", properties, required, additionalProperties: false };
}

function invalid(error: string): ToolValidation<never> {
	return { ok: false, error };
}

function hasOnlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
	const allowedSet = new Set(allowed);
	return Object.keys(value).every((key) => allowedSet.has(key));
}

function validPath(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}

function positiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function positiveFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateJsonObject(value: JsonObject, toolName: string): string | undefined {
	try {
		assertJsonObject(value, `${toolName}.arguments`);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

function toolPath(workspace: string, requestedPath: string): string {
	return isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(workspace, requestedPath);
}

function failure(message: string, details?: JsonValue): AgentToolExecutionResult {
	return {
		content: [{ type: "text", text: message }],
		isError: true,
		...(details === undefined ? {} : { details }),
	};
}

function success(message: string, details?: JsonValue): AgentToolExecutionResult {
	return {
		content: [{ type: "text", text: message }],
		isError: false,
		...(details === undefined ? {} : { details }),
	};
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function safeShellEnvironment(source: Readonly<NodeJS.ProcessEnv>): Record<string, string> {
	const environment: Record<string, string> = {};
	for (const key of SAFE_SHELL_ENVIRONMENT_KEYS) {
		const value = source[key];
		if (value !== undefined) environment[key] = value;
	}
	return environment;
}

function terminateProcessGroup(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
	if (child.pid === undefined) return;
	try {
		if (process.platform === "win32") child.kill(signal);
		else process.kill(-child.pid, signal);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) child.kill(signal);
	}
}

function readTool(workspace: string): AgentTool<ReadArguments> {
	return {
		name: "read",
		description: "Read UTF-8 text from a relative or absolute path. Relative paths resolve from the selected workspace.",
		parameters: schema({
			path: { type: "string", description: "Relative or absolute file path." },
			offset: { type: "number", description: "Optional 1-indexed starting line." },
			limit: { type: "number", description: "Optional maximum line count." },
		}, ["path"]),
		validate(value) {
			const jsonError = validateJsonObject(value, "read");
			if (jsonError) return invalid(jsonError);
			if (!hasOnlyKeys(value, ["path", "offset", "limit"]) || !validPath(value.path)) return invalid("schema_invalid:read");
			if (value.offset !== undefined && !positiveInteger(value.offset)) return invalid("schema_invalid:read.offset");
			if (value.limit !== undefined && !positiveInteger(value.limit)) return invalid("schema_invalid:read.limit");
			return { ok: true, value: value as ReadArguments };
		},
		async execute({ arguments: value, signal }) {
			if (signal.aborted) return failure("read_cancelled_before_effect", { status: "cancelled" });
			const resolvedPath = toolPath(workspace, value.path);
			try {
				const source = await readFile(resolvedPath, { encoding: "utf8", signal });
				const selected = value.offset === undefined && value.limit === undefined
					? source
					: source.split("\n").slice(
						(value.offset ?? 1) - 1,
						(value.offset ?? 1) - 1 + (value.limit ?? Number.MAX_SAFE_INTEGER),
					).join("\n");
				return success(selected, { path: resolvedPath, bytes: Buffer.byteLength(selected, "utf8") });
			} catch (error) {
				return failure(`read_failed:${errorText(error)}`, {
					path: resolvedPath,
					status: signal.aborted ? "cancelled" : "failed",
				});
			}
		},
	};
}

function writeTool(workspace: string): AgentTool<WriteArguments> {
	return {
		name: "write",
		description: "Write exact UTF-8 content to a relative or absolute path. Relative paths resolve from the selected workspace.",
		parameters: schema({
			path: { type: "string", description: "Relative or absolute file path." },
			content: { type: "string", description: "Exact UTF-8 content to write." },
		}, ["path", "content"]),
		validate(value) {
			const jsonError = validateJsonObject(value, "write");
			if (jsonError) return invalid(jsonError);
			if (!hasOnlyKeys(value, ["path", "content"]) || !validPath(value.path) || typeof value.content !== "string") {
				return invalid("schema_invalid:write");
			}
			return { ok: true, value: value as WriteArguments };
		},
		async execute({ arguments: value, signal }) {
			if (signal.aborted) return failure("write_cancelled_before_effect", { status: "cancelled" });
			const resolvedPath = toolPath(workspace, value.path);
			try {
				await mkdir(dirname(resolvedPath), { recursive: true });
				if (signal.aborted) return failure("write_cancelled_before_effect", { path: resolvedPath, status: "cancelled" });
				await writeFile(resolvedPath, value.content, { encoding: "utf8", signal });
				return success(`Wrote ${Buffer.byteLength(value.content, "utf8")} bytes to ${value.path}`, {
					path: resolvedPath,
					bytes: Buffer.byteLength(value.content, "utf8"),
				});
			} catch (error) {
				return failure(`write_failed:${errorText(error)}`, {
					path: resolvedPath,
					status: signal.aborted ? "cancelled" : "failed",
				});
			}
		},
	};
}

function validateEditOperations(value: JsonValue | undefined): value is readonly EditOperation[] {
	return Array.isArray(value) && value.length > 0 && value.every((entry) => {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
		const operation = entry as JsonObject;
		return hasOnlyKeys(operation, ["oldText", "newText"])
			&& typeof operation.oldText === "string"
			&& operation.oldText.length > 0
			&& typeof operation.newText === "string";
	});
}

function editTool(workspace: string): AgentTool<EditArguments> {
	return {
		name: "edit",
		description: "Apply non-overlapping unique UTF-8 replacements matched against the original file.",
		parameters: schema({
			path: { type: "string", description: "Relative or absolute file path." },
			edits: {
				type: "array",
				minItems: 1,
				items: schema({
					oldText: { type: "string", description: "Non-empty text appearing exactly once in the original file." },
					newText: { type: "string", description: "Exact replacement text." },
				}, ["oldText", "newText"]),
			},
		}, ["path", "edits"]),
		validate(value) {
			const jsonError = validateJsonObject(value, "edit");
			if (jsonError) return invalid(jsonError);
			if (!hasOnlyKeys(value, ["path", "edits"]) || !validPath(value.path) || !validateEditOperations(value.edits)) {
				return invalid("schema_invalid:edit");
			}
			return { ok: true, value: value as EditArguments };
		},
		async execute({ arguments: value, signal }) {
			if (signal.aborted) return failure("edit_cancelled_before_effect", { status: "cancelled" });
			const resolvedPath = toolPath(workspace, value.path);
			try {
				const original = await readFile(resolvedPath, { encoding: "utf8", signal });
				const matches = value.edits.map((operation) => {
					const start = original.indexOf(operation.oldText);
					if (start === -1) throw new Error("edit_target_not_found");
					if (original.indexOf(operation.oldText, start + operation.oldText.length) !== -1) {
						throw new Error("edit_target_not_unique");
					}
					return { ...operation, start, end: start + operation.oldText.length };
				}).sort((left, right) => right.start - left.start);
				for (let index = 1; index < matches.length; index += 1) {
					const later = matches[index - 1];
					const earlier = matches[index];
					if (later && earlier && earlier.end > later.start) throw new Error("edit_targets_overlap");
				}
				let updated = original;
				for (const match of matches) {
					updated = `${updated.slice(0, match.start)}${match.newText}${updated.slice(match.end)}`;
				}
				if (signal.aborted) return failure("edit_cancelled_before_effect", { path: resolvedPath, status: "cancelled" });
				await writeFile(resolvedPath, updated, { encoding: "utf8", signal });
				return success(`Applied ${matches.length} edit(s) to ${value.path}`, {
					path: resolvedPath,
					edits: matches.length,
					bytes: Buffer.byteLength(updated, "utf8"),
				});
			} catch (error) {
				return failure(`edit_failed:${errorText(error)}`, {
					path: resolvedPath,
					status: signal.aborted ? "cancelled" : "failed",
				});
			}
		},
	};
}

function bashTool(workspace: string, sourceEnvironment: Readonly<NodeJS.ProcessEnv>): AgentTool<BashArguments> {
	return {
		name: "bash",
		description: `${PAN_TRUSTED_LOCAL_LABEL}. Execute one Bash command and retain stdout, stderr, exit status, and cancellation settlement.`,
		parameters: schema({
			command: { type: "string", description: "Non-empty Bash command." },
			timeout: { type: "number", description: "Optional positive timeout in seconds." },
		}, ["command"]),
		validate(value) {
			const jsonError = validateJsonObject(value, "bash");
			if (jsonError) return invalid(jsonError);
			if (!hasOnlyKeys(value, ["command", "timeout"]) || typeof value.command !== "string" || value.command.trim().length === 0) {
				return invalid("schema_invalid:bash");
			}
			if (value.timeout !== undefined && !positiveFinite(value.timeout)) return invalid("schema_invalid:bash.timeout");
			return { ok: true, value: value as BashArguments };
		},
		async execute({ arguments: value, signal }) {
			if (signal.aborted) return failure("bash_cancelled_before_spawn", { status: "cancelled", spawned: false });
			return executeBash(workspace, sourceEnvironment, value, signal);
		},
	};
}

async function executeBash(
	workspace: string,
	sourceEnvironment: Readonly<NodeJS.ProcessEnv>,
	value: BashArguments,
	signal: AbortSignal,
): Promise<AgentToolExecutionResult> {
	let child: ChildProcessWithoutNullStreams;
	try {
		child = spawn("/bin/bash", ["-c", value.command], {
			cwd: workspace,
			env: safeShellEnvironment(sourceEnvironment),
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (error) {
		return failure(`bash_spawn_failed:${errorText(error)}`, {
			cwd: workspace,
			status: "spawn_failed",
			spawned: false,
		});
	}
	child.stdin.end();
	let stdout = "";
	let stderr = "";
	let cancelled = false;
	let timedOut = false;
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => { stdout += chunk; });
	child.stderr.on("data", (chunk: string) => { stderr += chunk; });

	let forceTimer: NodeJS.Timeout | undefined;
	const terminate = (reason: "cancelled" | "timeout"): void => {
		if (reason === "cancelled") cancelled = true;
		else timedOut = true;
		terminateProcessGroup(child, "SIGTERM");
		forceTimer = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), 250);
		forceTimer.unref();
	};
	const onAbort = (): void => terminate("cancelled");
	signal.addEventListener("abort", onAbort, { once: true });
	const timeoutTimer = value.timeout === undefined
		? undefined
		: setTimeout(() => terminate("timeout"), Math.ceil(value.timeout * 1000));
	timeoutTimer?.unref();

	const settlement = await new Promise<{
		code: number | null;
		signal: NodeJS.Signals | null;
		spawnError?: string;
	}>((resolveSettlement) => {
		let settled = false;
		const settle = (value: { code: number | null; signal: NodeJS.Signals | null; spawnError?: string }): void => {
			if (settled) return;
			settled = true;
			resolveSettlement(value);
		};
		child.once("error", (error) => settle({ code: null, signal: null, spawnError: errorText(error) }));
		child.once("close", (code, processSignal) => settle({ code, signal: processSignal }));
	});
	signal.removeEventListener("abort", onAbort);
	if (timeoutTimer) clearTimeout(timeoutTimer);
	if (cancelled || timedOut) terminateProcessGroup(child, "SIGKILL");
	if (forceTimer) clearTimeout(forceTimer);

	const status = cancelled
		? "cancelled"
		: timedOut
			? "timed_out"
			: settlement.spawnError
				? "spawn_failed"
				: settlement.code === 0
					? "completed"
					: "failed";
	const details: JsonValue = {
		command: value.command,
		cwd: workspace,
		stdout,
		stderr,
		exitCode: settlement.code,
		signal: settlement.signal,
		status,
		spawned: true,
	};
	const text = [
		stdout,
		stderr,
		`[bash status=${status} exit_code=${settlement.code === null ? "null" : settlement.code} signal=${settlement.signal ?? "none"}]`,
	].filter((part) => part.length > 0).join("\n");
	return {
		content: [{ type: "text", text }],
		isError: status !== "completed",
		details,
	};
}

/** Create four Pan-owned host-authority Tools bound to one selected cwd/base. */
export function createPanTrustedLocalTools(
	workspace: string,
	sourceEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
): PanTrustedLocalTools {
	const resolvedWorkspace = resolve(workspace);
	return {
		tools: [
			readTool(resolvedWorkspace),
			writeTool(resolvedWorkspace),
			editTool(resolvedWorkspace),
			bashTool(resolvedWorkspace, sourceEnvironment),
		],
	};
}
