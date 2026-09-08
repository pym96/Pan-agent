import { emitKeypressEvents } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ReadStream } from "node:tty";
import { terminalText } from "./presentation.ts";

export interface InputKey {name?: string; ctrl?: boolean; meta?: boolean; sequence?: string}

/** One editable draft; Enter delegates admission and never creates a queue. */
export class TerminalInput {
	private draft: string[] = [];
	private cursor = 0;
	private prompt = "";
	private visible = false;
	private row = 0;
	private editing = false;
	private partial = "";
	private readonly tty: boolean;
	private readonly wasRaw: boolean;
	private readonly input: Readable;
	private readonly output: Writable;
	private readonly enter: (text: string) => boolean;
	private readonly interrupt: () => void;
	private readonly ended: () => void;
	private readonly intercept?: (text: string | undefined, key: InputKey) => boolean;
	constructor(input: Readable, output: Writable, enter: (text: string) => boolean, interrupt: () => void, ended: () => void, intercept?: (text: string | undefined, key: InputKey) => boolean) {
		this.intercept = intercept;
		this.input = input; this.output = output; this.enter = enter; this.interrupt = interrupt; this.ended = ended;
		this.tty = (input as ReadStream).isTTY === true && (output as {isTTY?: boolean}).isTTY === true;
		this.wasRaw = (input as ReadStream).isRaw === true;
		emitKeypressEvents(input);
		if (this.tty) (input as ReadStream).setRawMode(true);
		input.on("keypress", this.key); input.on("end", this.ended);
		input.resume();
	}
	beforeCursor(): string { return this.draft.slice(0, this.cursor).join(""); }
	insert(text: string): void { this.clear(); const points = Array.from(text); this.draft.splice(this.cursor, 0, ...points); this.cursor += points.length; this.draw(); }
	/** Append already-safe framed model data; only the unfinished visual line is redrawn. */
	append(fragment: string): void {
		if (!this.tty) { this.output.write(fragment); this.partial = (this.partial + fragment).split("\n").at(-1)!; return; }
		this.clear();
		const lines = (this.partial + fragment).split("\n");
		this.partial = lines.pop()!;
		for (const line of lines) this.output.write(line + "\n");
		// Commit complete visual rows so a long response never needs cursor-up beyond the viewport.
		const columns = Math.max(4, (this.output as {columns?: number}).columns ?? 80);
		while (true) {
			let cells = 0, cut = 0;
			for (const point of this.partial) {
				const size = cellWidth(point);
				if (cells + size > columns) break;
				cells += size; cut += point.length;
			}
			if (cut === this.partial.length) break;
			this.output.write(this.partial.slice(0, cut) + "\n");
			this.partial = "│ " + this.partial.slice(cut);
		}
		this.draw();
	}
	setPrompt(prompt: string): void { this.clear(); this.prompt = prompt; this.draw(); }
	write(line: string): void {
		this.clear();
		if (!this.tty && this.partial) {
			this.output.write("\n└─\n" + line + "\nResponding… (provisional, continued)\n│ "); this.partial = "│ ";
		} else this.output.write(line + "\n");
		this.draw();
	}
	close(): void {
		this.clear(); this.input.off("keypress", this.key); this.input.off("end", this.ended);
		if (this.tty) (this.input as ReadStream).setRawMode(this.wasRaw);
		this.input.pause();
	}
	private readonly key = (text: string | undefined, key: InputKey = {}): void => {
		if (this.intercept?.(text, key)) return;
		if (key.ctrl && key.name === "c") { this.interrupt(); return; }
		if (key.ctrl && key.name === "d") { this.ended(); return; }
		if (key.name === "return" || key.name === "enter") {
			const value = this.draft.join("");
			this.clear(); this.editing = true;
			// Admission is synchronous. A busy Enter retains draft and cursor.
			if (this.enter(value)) { this.draft = []; this.cursor = 0; }
			this.editing = false; this.draw(); return;
		}
		if (this.tty) this.clear();
		if (key.name === "left") this.cursor = Math.max(0, this.cursor - 1);
		else if (key.name === "right") this.cursor = Math.min(this.draft.length, this.cursor + 1);
		else if (key.name === "home" || (key.ctrl && key.name === "a")) this.cursor = 0;
		else if (key.name === "end" || (key.ctrl && key.name === "e")) this.cursor = this.draft.length;
		else if (key.name === "backspace") { if (this.cursor) this.draft.splice(--this.cursor, 1); }
		else if (key.name === "delete") this.draft.splice(this.cursor, 1);
		else if (key.ctrl && key.name === "u") { this.draft.splice(0, this.cursor); this.cursor = 0; }
		else if (!key.ctrl && !key.meta && text && key.name !== "escape") { const points = Array.from(text); this.draft.splice(this.cursor, 0, ...points); this.cursor += points.length; }
		this.draw();
	};
	private clear(): void {
		if (!this.visible) return;
		if (this.tty) this.output.write(`\r${this.row ? `\x1b[${this.row}A` : ""}\x1b[J`);
		this.visible = false;
	}
	private draw(): void {
		if (this.editing || (!this.prompt && !this.partial) || this.visible) return;
		if (!this.tty) { if (this.prompt !== "Draft > ") this.output.write(this.prompt); this.visible = true; return; }
		const stream = this.partial ? this.partial + "\n" : "";
		const full = stream + this.prompt + terminalText(this.draft.join(""));
		const prefix = stream + this.prompt + terminalText(this.draft.slice(0, this.cursor).join(""));
		const columns = Math.max(1, (this.output as {columns?: number}).columns ?? 80);
		const position = (value: string) => {
			let row = 0, column = 0;
			for (const point of value) {
				if (point === "\n") { row++; column = 0; continue; }
				const size = cellWidth(point);
				if (column + size > columns) { row++; column = 0; }
				column += size;

			}
			return {row, column};
		};
		const end = position(full), cursor = position(prefix);
		const pendingWrap = end.column === columns;
		if (pendingWrap) { end.row++; end.column = 0; }
		if (cursor.column === columns) { cursor.row++; cursor.column = 0; }
		this.output.write(full);
		if (pendingWrap) this.output.write(" \r"); // resolve terminal's pending wrap
		this.output.write(`\r${end.row > cursor.row ? `\x1b[${end.row - cursor.row}A` : ""}${cursor.column ? `\x1b[${cursor.column}C` : ""}`);
		this.row = cursor.row; this.visible = true;
	}
}

function cellWidth(point: string): number {
	const n = point.codePointAt(0)!;
	return /\p{Mark}/u.test(point) ? 0 : n >= 0x1100 && (n <= 0x115f || n >= 0x2e80 && n <= 0xa4cf || n >= 0xac00 && n <= 0xd7a3 || n >= 0xf900 && n <= 0xfaff || n >= 0xfe10 && n <= 0xfe6f || n >= 0xff00 && n <= 0xff60 || n >= 0x1f300) ? 2 : 1;
}
