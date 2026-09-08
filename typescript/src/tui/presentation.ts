import { decodeAttachedTask } from "../input/task-envelope.ts";
import type { SessionProgress } from "../runtime/agent-kernel.ts";
import type { SessionObservation, TaskRunResult } from "../runtime/session.ts";

/** External terminal text is reversible. LF is only admitted by framed(). */
export function terminalText(value: string): string {
	return Array.from(value, escapePoint).join("");
}
function escapePoint(point: string): string {
	const n = point.codePointAt(0)!;
	if (point === "\\") return "\\\\";
	if (n < 32 || (n >= 127 && n <= 159) || (n >= 0x202a && n <= 0x202e)
		|| (n >= 0x2066 && n <= 0x2069) || n === 0x2028 || n === 0x2029
		|| (n >= 0xd800 && n <= 0xdfff)) return `\\u${n.toString(16).padStart(4, "0")}`;
	return point;
}
export function identifierPreview(value: string): string {
	const tokens = Array.from(value, escapePoint);
	let length = 0, result = "";
	for (const token of tokens) {
		const size = Array.from(token).length;
		if (length + size > 80) return result + "…";
		result += token; length += size;
	}
	return result;
}
export function framed(label: string, text: string): string[] {
	return [label, ...text.split("\n").map(line => `│ ${terminalText(line)}`), "└─"];
}
const missing = "unavailable (not recorded)";
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string => typeof value === "string" ? value : "unavailable";
const restricted = new Set(["reasoning_content", "thinking", "authorization", "api_key"]);
/** Canonical arguments are public JSON; envelope fields are never selected. */
function publicArguments(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(publicArguments);
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !restricted.has(key.toLowerCase())).map(([key, item]) => [key, publicArguments(item)]));
	return value;
}
function selected(value: unknown, keys: readonly string[]): Record<string, unknown> {
	const source = object(value);
	return Object.fromEntries(keys.filter(key => source[key] === null || ["string", "number", "boolean"].includes(typeof source[key])).map(key => [key, source[key]]));
}
function usageText(value: unknown): string {
	const usage = object(value);
	if (usage.status !== "reported") return "unavailable; total_tokens=unknown";
	return JSON.stringify({...selected(usage.value, ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]), cost: selected(object(usage.value).cost, ["input", "output", "cacheRead", "cacheWrite", "total"])});
}
function identityText(value: unknown): string {
	const source = object(value);
	return ["provider", "model", "responseId"].map(key => {
		const item = object(source[key]);
		return `${key}=${item.status === "reported" ? str(item.value) : "unavailable"}`;
	}).join(" · ");
}
const disposition = (value: unknown): string => ({completed:"Completed", cancelled:"Cancelled", model_error:"Model error", incomplete:"Incomplete", interrupted:"Interrupted"}[str(value)] ?? "Archive terminal unavailable");

export interface CompactPresentation {
	observe(observation: SessionObservation): void;
	settle(result: TaskRunResult): void;
	replay(records: readonly Record<string, unknown>[], runId: string): void;
	details(): void;
	attach(write: (line: string) => void, activity?: () => void, append?: (fragment: string) => void): void;
	progress?(progress: SessionProgress): void;
	progressError?(): void;
}

/** Projection owns only display state, never execution or persistence. */
export function createCompactPresentation(initialWrite: (line: string) => void = () => {}): CompactPresentation {
	let write = initialWrite, activity = () => {};
	let append = (fragment: string) => write(fragment);
	let turn = 0, preview = "", unicodeTail = "", previewOpen = false;
	let renderedAccepted: string | undefined;
	let transientFailed = "";
	function safeFragment(text: string, finish = false): void {
		let value = unicodeTail + text; unicodeTail = "";
		if (!finish && /[\ud800-\udbff]$/.test(value)) { unicodeTail = value.slice(-1); value = value.slice(0, -1); }
		if (value) append(value.split("\n").map(terminalText).join("\n│ "));
	}
	function endPreview(): void {
		if (!previewOpen) return;
		safeFragment("", true); append("\n└─\n"); previewOpen = false;
	}
	let records: Record<string, unknown>[] = [];
	let result: TaskRunResult | undefined;
	let selectedId: string | undefined;
	let archived = false;
	const emit = (lines: readonly string[]) => { for (const line of lines) write(line); };
	const count = (type: string) => records[0]?.type === "run.started" ? records.filter(record => record.type === type).length : "unavailable (incomplete sequence)";
	const identifier = (record: Record<string, unknown>) => {
		const args = object(record.arguments);
		return typeof args.path === "string" ? args.path : typeof args.command === "string" ? args.command : "";
	};
	function attachedTask(task: string, full: boolean): void {
		const decoded = decodeAttachedTask(task);
		if (!decoded) { if (full) emit(framed("Task", task)); return; }
		if (full) emit(framed("Original prompt (user data)", decoded.prompt));
		write(`Recorded attachments ${decoded.attachments.length} · selection-time snapshots · user data`);
		for (const item of decoded.attachments) {
			emit(framed("Snapshot identity", `${item.path}\n${item.bytes} bytes\nSHA-256 ${item.sha256}`));
			if (full) emit(framed("Recorded snapshot content", item.text));
		}
	}
	function progress(record: Record<string, unknown>): void {
		if (record.type === "run.started") { write("Task running"); attachedTask(str(record.task), false); }
		if (record.type === "model.turn_started") write("  · Waiting for model");
		if (record.type === "tool.started") write(`  · ${terminalText(str(record.toolName))} ${identifierPreview(identifier(record))} · Waiting for tool · :details`);
		if (record.type === "tool.settled") write(`  ${record.isError === true ? "✗ Error" : "✓ Returned"} ${terminalText(str(record.toolName))} · :details`);
	}
	function summary(): void {
		const terminal = [...records].reverse().find(record => record.type === "run.terminal");
		const seal = [...records].reverse().find(record => record.type === "run.settled");
		const status = result?.status ?? terminal?.status ?? seal?.settled_state;
		const finalText = result?.finalText ?? str([...records].reverse().find(record => record.type === "model.turn_settled" && !record.failure)?.text ?? "");
		if (finalText && (archived || finalText !== renderedAccepted)) emit(framed(status === "completed" ? "Final answer" : "Partial response (task incomplete)", finalText));
		if (!archived && status !== "completed" && renderedAccepted && !transientFailed) write("Partial response — Run not completed");
		write(`${disposition(status)} (${terminalText(str(status))}) · Model calls ${result?.modelCalls ?? missing} · Tool results ${count("tool.settled")} · :details for details`);
		if (status !== "completed") emit(framed("Terminal reason", str(result?.reason ?? terminal?.reason ?? seal?.reason)));
	}
	return {
		attach(nextWrite, nextActivity = () => {}, nextAppend = fragment => nextWrite(fragment)) { write = nextWrite; activity = nextActivity; append = nextAppend; },
		progressError() { endPreview(); write("Display error: progress observer failed; execution continues."); },
		progress(event) {
			if (archived || result || event.runId !== selectedId || event.turn !== turn || !event.text) return;
			if (!previewOpen) { write("Responding… (provisional)"); append("│ "); previewOpen = true; }
			preview += event.text; safeFragment(event.text);
		},
		observe(observation) {
			if (observation.type === "run.started") { records = []; result = undefined; archived = false; selectedId = observation.runId; turn = 0; preview = ""; unicodeTail = ""; previewOpen = false; renderedAccepted = undefined; transientFailed = ""; }
			if (observation.type === "model.turn_started") { turn = observation.turn; preview = ""; unicodeTail = ""; }
			if (observation.type === "model.turn_settled") {
				endPreview();
				if (preview) {
					if (observation.failure || observation.stopReason === "length") {
						write("Partial response — interrupted (preview is not a completed response)");
						transientFailed = preview;
					} else write("Response received (provisional until Run settlement)");
				}
				if (!observation.failure) renderedAccepted = preview === observation.text && preview ? preview : undefined;
				turn = 0;
			}
			records.push(structuredClone(observation) as unknown as Record<string, unknown>);
			activity(); progress(observation as unknown as Record<string, unknown>);
		},
		settle(value) { endPreview(); result = structuredClone(value); summary(); },
		replay(retained, runId) {
			records = structuredClone([...retained]); result = undefined; archived = true; selectedId = runId; renderedAccepted = undefined; transientFailed = ""; preview = ""; turn = 0;
			write(`Archived replay ${terminalText(runId)} · archived · zero execution`);
			write("Transient previews are not recorded; replay shows retained settled data only.");
			for (const record of records) progress(record);
			summary();
		},
		details() {
			if (!selectedId) { write("No submitted run yet. No run selected; submit a task or use :replay RUN_ID."); return; }
			write(`Run details ${terminalText(selectedId)} · ${archived ? "archived" : "live"}`);
			write(`Admitted tool calls ${result?.toolCalls ?? missing} · Tool start events ${count("tool.started")} · Tool results ${count("tool.settled")}`);
			write(`Model calls ${result?.modelCalls ?? missing} · Model start events ${count("model.turn_started")} · Model result events ${count("model.turn_settled")}`);
			for (const record of records) {
				switch (record.type) {
					case "run.started":
						attachedTask(str(record.task), true);
						emit(framed("Archive identity", JSON.stringify(selected(record, ["provider", "model", "runbook_revision"])))); break;
					case "model.turn_settled":
						emit(framed("Model identity and stop reason", `${identityText(record.identity)} · stop=${str(record.stopReason)}`));
						emit(framed("Usage", usageText(record.usage)));
						emit(framed("Public model text", str(record.text)));
						if (record.failure) emit(framed("Model error", JSON.stringify(selected(record.failure, ["category", "detail", "retryable"])))); break;
					case "tool.started":
						emit(framed("Tool start event (not proof of execution)", `${str(record.toolName)} · call=${str(record.toolCallId)}`));
						emit(framed("Full arguments", JSON.stringify(publicArguments(record.arguments), null, 2))); break;
					case "tool.settled":
						emit(framed(record.isError === true ? "Tool result: error" : "Tool result: success", `${str(record.toolName)} · call=${str(record.toolCallId)}`));
						emit(framed("Full tool result", str(record.text)));
						emit(framed("Tool result metadata", JSON.stringify(selected(record.details, ["path", "bytes", "edits", "command", "cwd", "stdout", "stderr", "exitCode", "signal", "status", "spawned"])))); break;
					case "run.terminal": emit(framed("Terminal", `${str(record.status)} · ${str(record.reason)}`)); break;
					case "run.settled": emit(framed("Archive settlement", `${str(record.settled_state)} · ${str(record.reason)}`)); break;
				}
			}
			if (transientFailed) emit(framed("Transient unfinished preview (not archived)", transientFailed));
			if (result) { write(`Archive sealed ${result.archiveSealed}`); emit(framed("Total Usage", usageText(result.usage))); }
		},
	};
}

/** Session treats observer exceptions as archive errors, so catch at the UI boundary. */
export function observeSafely(presentation: CompactPresentation, observation: SessionObservation, diagnostic: (line: string) => void): void {
	try { presentation.observe(observation); }
	catch (error) { try { diagnostic(`Display error (execution continues): ${terminalText(error instanceof Error ? error.message : "unknown")}`); } catch { /* An unwritable display cannot change execution. */ } }
}
