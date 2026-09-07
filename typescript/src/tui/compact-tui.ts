import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import type { TuiOptions } from "./tui.ts";
import { terminalText } from "./presentation.ts";
import { TerminalInput } from "./terminal-input.ts";

export async function runCompactTui(options: TuiOptions): Promise<number> {
	const presentation = options.presentation!;
	let phase: "confirm" | "idle" | "running" | "command" | "closed" = "confirm";
	let cancelled = false, ending = false;
	let resolveClosed!: () => void;
	const closed = new Promise<void>(resolve => { resolveClosed = resolve; });
	let terminal: TerminalInput;
	const write = (line: string) => terminal.write(line);
	function finish(): void { phase = "closed"; terminal.setPrompt(""); resolveClosed(); }
	function interrupt(): void {
		if (phase === "running") { cancelled = true; write("正在请求取消；等待运行结算。"); options.session.cancel(); }
		else if (phase !== "command") { if (phase === "confirm") write("Cancelled before Provider use."); finish(); }
	}
	function end(): void { ending = true; if (phase === "running") interrupt(); else if (phase !== "command") finish(); }
	async function command(text: string): Promise<void> {
		const store = options.archiveStore;
		if (text === ":exit") { finish(); return; }
		if (text === ":help") { write(":details 详情 · :context 上下文 · :runs 历史 · :replay RUN_ID 回放 · :exit 退出；运行中 Ctrl-C 取消，输入保留为草稿。"); return; }
		if (text === ":details") { presentation.details(); return; }
		if (text === ":context") { write(`CONTEXT messages=${options.session.contextMessageCount} owner=${options.session.kernelKind} truncation=none`); return; }
		if (text === ":runs") {
			if (!store) { write("Memory is not configured."); return; }
			const entries = (await readdir(join(store.root, "runs"), {withFileTypes:true})).filter(entry => entry.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
			if (!entries.length) write("ARCHIVES none");
			for (const entry of entries) {
				try {
					if (!/^[A-Za-z0-9_-]+$/.test(entry.name)) throw new Error("invalid archive ID");
					const manifest = await store.readManifest(entry.name);
					write(`ARCHIVE ${terminalText(entry.name)} · ${terminalText(manifest.settled_state)} · ${manifest.record_count} records`);
				} catch (error) { write(`ARCHIVE_ERROR ${terminalText(entry.name)}: ${terminalText(error instanceof Error ? error.message : "unknown")}`); }
			}
			return;
		}
		if (text === ":replay" || text.startsWith(":replay ")) {
			const id = text.slice(7).trim();
			if (!/^[A-Za-z0-9_-]+$/.test(id)) { write("ARCHIVE_ERROR invalid ID; Usage: :replay RUN_ID"); return; }
			if (!store) { write("Memory is not configured."); return; }
			// Inspect only regular archive files, never a symlink into current task files.
			const directory = join(store.root, "runs", id);
			if (!(await lstat(directory)).isDirectory()) throw new Error("invalid archive directory");
			for (const file of ["manifest.json", "events.jsonl"]) if (!(await lstat(join(directory, file))).isFile()) throw new Error("invalid archive file");
			presentation.replay(await store.readArchive(id), id); return;
		}
		write(`Unknown command: ${terminalText(text)}; no Provider call was made.`);
	}
	async function execute(text: string): Promise<void> {
		try { if (text.trim().startsWith(":")) await command(text.trim()); else presentation.settle(await options.session.runTask(text)); }
		catch (error) { write(`LOCAL_ERROR ${terminalText(error instanceof Error ? error.message : "unknown")}`); }
		finally { if (phase !== "closed") { if (ending) finish(); else { phase = "idle"; terminal.setPrompt("你 › "); } } }
	}
	terminal = new TerminalInput(options.input ?? process.stdin, options.output ?? process.stdout, text => {
		if (phase === "running" || phase === "command") { write("忙碌中：草稿已保留；空闲后再次按 Enter 提交。"); return false; }
		if (phase === "closed") return false;
		if (phase === "confirm") {
			if (!["y", "yes"].includes(text.trim().toLowerCase())) { write("Cancelled before Provider use."); finish(); }
			else { phase = "idle"; write(":help 查看命令 · :details 查看运行详情"); terminal.setPrompt("你 › "); }
			return true;
		}
		if (!text.trim()) { write("Task must not be blank; no Provider call was made."); return true; }
		phase = text.trim().startsWith(":") ? "command" : "running"; cancelled = false;
		terminal.setPrompt(phase === "running" ? "草稿 › " : "");
		// Start after TerminalInput has synchronously committed/cleared the submitted draft.
		queueMicrotask(() => { void execute(text); });
		return true;
	}, interrupt, end);
	presentation.attach(write, () => { if (cancelled) options.session.cancel(); });
	write(`Pan Agent · Native · ${terminalText(options.provider)}`);
	write(`模型：${terminalText(options.model)}`);
	write(`工作目录：${terminalText(options.workspace)}`);
	write("SHELL trusted-local: host-user authority; workspace is cwd, not containment or an OS sandbox.");
	write("仅在确认后提交非空任务时请求所选模型；命令不调用模型。");
	terminal.setPrompt("Confirm provider and trusted-local workspace [y/N]> ");
	try { await closed; return 0; }
	finally { terminal.close(); await options.session.close(); (options.output ?? process.stdout).write("General Agent TUI closed.\n"); }
}
