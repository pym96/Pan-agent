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
const disposition = (value: unknown): string => ({completed:"已完成", cancelled:"已取消", model_error:"模型错误", incomplete:"未完成", interrupted:"已中断"}[str(value)] ?? "归档终态不可用");

export interface CompactPresentation {
	observe(observation: SessionObservation): void;
	settle(result: TaskRunResult): void;
	replay(records: readonly Record<string, unknown>[], runId: string): void;
	details(): void;
	attach(write: (line: string) => void, activity?: () => void): void;
}

/** Projection owns only display state, never execution or persistence. */
export function createCompactPresentation(initialWrite: (line: string) => void = () => {}): CompactPresentation {
	let write = initialWrite, activity = () => {};
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
	function progress(record: Record<string, unknown>): void {
		if (record.type === "run.started") write("任务进行中");
		if (record.type === "model.turn_started") write("  · 等待模型返回");
		if (record.type === "tool.started") write(`  · ${terminalText(str(record.toolName))} ${identifierPreview(identifier(record))} · 等待工具返回 · :details`);
		if (record.type === "tool.settled") write(`  ${record.isError === true ? "✗ 错误" : "✓ 已返回"} ${terminalText(str(record.toolName))} · :details`);
	}
	function summary(): void {
		const terminal = [...records].reverse().find(record => record.type === "run.terminal");
		const seal = [...records].reverse().find(record => record.type === "run.settled");
		const status = result?.status ?? terminal?.status ?? seal?.settled_state;
		const finalText = result?.finalText ?? str([...records].reverse().find(record => record.type === "model.turn_settled" && !record.failure)?.text ?? "");
		if (finalText) emit(framed(status === "completed" ? "最终回答" : "部分回答（任务未完成）", finalText));
		write(`${disposition(status)} (${terminalText(str(status))}) · 模型调用 ${result?.modelCalls ?? missing} · 工具已返回 ${count("tool.settled")} 次 · :details 查看详情`);
		if (status !== "completed") emit(framed("终态原因", str(result?.reason ?? terminal?.reason ?? seal?.reason)));
	}
	return {
		attach(nextWrite, nextActivity = () => {}) { write = nextWrite; activity = nextActivity; },
		observe(observation) {
			if (observation.type === "run.started") { records = []; result = undefined; archived = false; selectedId = observation.runId; }
			records.push(structuredClone(observation) as unknown as Record<string, unknown>);
			activity(); progress(observation as unknown as Record<string, unknown>);
		},
		settle(value) { result = structuredClone(value); summary(); },
		replay(retained, runId) {
			records = structuredClone([...retained]); result = undefined; archived = true; selectedId = runId;
			write(`归档回放 ${terminalText(runId)} · archived · 零执行`);
			for (const record of records) progress(record);
			summary();
		},
		details() {
			if (!selectedId) { write("暂无可查看的运行；先提交任务或 :replay RUN_ID。"); return; }
			write(`运行详情 ${terminalText(selectedId)} · ${archived ? "archived" : "live"}`);
			write(`工具接纳数 ${result?.toolCalls ?? missing} · 工具启动事件数 ${count("tool.started")} · 工具返回数 ${count("tool.settled")}`);
			write(`模型调用 ${result?.modelCalls ?? missing} · 模型启动事件数 ${count("model.turn_started")} · 模型返回事件数 ${count("model.turn_settled")}`);
			for (const record of records) {
				switch (record.type) {
					case "run.started":
						emit(framed("任务", str(record.task)));
						emit(framed("归档身份", JSON.stringify(selected(record, ["provider", "model", "runbook_revision"])))); break;
					case "model.turn_settled":
						emit(framed("模型身份与停止原因", `${identityText(record.identity)} · stop=${str(record.stopReason)}`));
						emit(framed("Usage", usageText(record.usage)));
						emit(framed("模型公开文本", str(record.text)));
						if (record.failure) emit(framed("模型错误", JSON.stringify(selected(record.failure, ["category", "detail", "retryable"])))); break;
					case "tool.started":
						emit(framed("工具启动事件（不证明实现已执行）", `${str(record.toolName)} · call=${str(record.toolCallId)}`));
						emit(framed("完整参数", JSON.stringify(publicArguments(record.arguments), null, 2))); break;
					case "tool.settled":
						emit(framed(record.isError === true ? "工具返回：错误" : "工具返回：成功", `${str(record.toolName)} · call=${str(record.toolCallId)}`));
						emit(framed("完整工具结果", str(record.text)));
						emit(framed("工具结果元数据", JSON.stringify(selected(record.details, ["path", "bytes", "edits", "command", "cwd", "stdout", "stderr", "exitCode", "signal", "status", "spawned"])))); break;
					case "run.terminal": emit(framed("终态", `${str(record.status)} · ${str(record.reason)}`)); break;
					case "run.settled": emit(framed("归档结算", `${str(record.settled_state)} · ${str(record.reason)}`)); break;
				}
			}
			if (result) { write(`归档封存 ${result.archiveSealed}`); emit(framed("累计 Usage", usageText(result.usage))); }
		},
	};
}

/** Session treats observer exceptions as archive errors, so catch at the UI boundary. */
export function observeSafely(presentation: CompactPresentation, observation: SessionObservation, diagnostic: (line: string) => void): void {
	try { presentation.observe(observation); }
	catch (error) { try { diagnostic(`显示错误（执行继续）：${terminalText(error instanceof Error ? error.message : "unknown")}`); } catch { /* An unwritable display cannot change execution. */ } }
}
