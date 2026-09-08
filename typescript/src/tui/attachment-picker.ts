import { captureAttachment, discoverAttachmentPaths, validateAttachmentLimit } from "../input/attachments.ts";
import { prepareAttachedTask, type AttachmentSnapshot } from "../input/task-envelope.ts";
import { framed, identifierPreview } from "./presentation.ts";
import type { InputKey, TerminalInput } from "./terminal-input.ts";

/** Idle input preparation only. Selection, inspection and submission are separate actions. */
const segmenter = new Intl.Segmenter("en", {granularity:"grapheme"});
const boundaries = (text: string): number[] => [...segmenter.segment(text)].map(s => s.index).concat(text.length);

export class AttachmentPicker {
	private selected: AttachmentSnapshot[] = [];
	private picker?: {query:string; cursor:number; index:number; names:readonly string[]; loading:boolean; capturing:boolean; controller:AbortController};
	readonly maxAttachmentBytes: number;
	private readonly workspace: string;
	private readonly terminal: TerminalInput;
	private readonly write: (line:string)=>void;
	constructor(workspace: string, terminal: TerminalInput, write: (line:string)=>void, maxAttachmentBytes?: number) {
		this.workspace = workspace; this.terminal = terminal; this.write = write; this.maxAttachmentBytes = validateAttachmentLimit(maxAttachmentBytes);
	}
	get count(): number { return this.selected.length; }
	get active(): boolean { return this.picker !== undefined; }
	private get total(): number { return this.selected.reduce((sum, item) => sum + item.bytes, 0); }
	private emit(lines: readonly string[]): void { for (const line of lines) this.write(line); }
	summary(): void {
		this.write(`Attachments ${this.selected.length} · ${this.total}/${this.maxAttachmentBytes} bytes · selection-time snapshots`);
		this.selected.forEach((item,i) => this.write(`│ ${i+1}. ${identifierPreview(item.path)} · ${item.bytes} bytes · SHA-256 ${item.sha256}`));
		this.write("Submit sends these snapshots as user data and stores them in the Run Archive. Ctrl-P: full preview; Ctrl-R: remove last.");
	}
	preview(): void {
		if (!this.count) { this.write("No attachments selected."); return; }
		for (const item of this.selected) {
			this.emit(framed("Selected snapshot identity (user data)", `${item.path}\n${item.bytes} bytes\nSHA-256 ${item.sha256}`));
			this.emit(framed("Snapshot content (sent and archived on submit)", item.text));
		}
	}
	remove(index = this.selected.length - 1): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.selected.length) { this.write("Attachment removal requires an existing index."); return; }
		this.selected.splice(index, 1); this.summary();
	}
	prepare(prompt: string): string { const task = prepareAttachedTask(prompt, this.selected); this.selected = []; return task; }
	cancel(literal = false): void {
		const picker = this.picker; if (!picker) return;
		this.picker = undefined; picker.controller.abort();
		if (literal) this.terminal.insert("@" + picker.query);
		this.write(literal ? "Picker dismissed; @query is literal draft text. No attachment added." : "Picker cancelled; draft and selected snapshots retained.");
	}
	close(): void { this.picker?.controller.abort(); this.picker = undefined; }
	open(): void {
		if (this.picker) return;
		const picker = {query:"",cursor:0,index:0,names:[] as readonly string[],loading:true,capturing:false,controller:new AbortController()}; this.picker = picker;
		this.write("File picker: literal search; Up/Down or Tab/Shift-Tab; Left/Right edit; Enter selects only; Esc inserts literal @query; Ctrl-C dismisses.");
		this.show();
		void discoverAttachmentPaths(this.workspace).then(names => {
			if (this.picker !== picker) return;
			picker.names = names; picker.loading = false; this.show();
		}, () => { if (this.picker === picker) { this.picker = undefined; this.write("Attachment error: attachment_discovery_failed. Draft and attachments retained."); } });
	}
	private matches(): readonly string[] { return this.picker?.names.filter(name => name.includes(this.picker!.query)) ?? []; }
	private show(): void {
		const picker = this.picker; if (!picker || picker.capturing) return;
		const matches = this.matches(); picker.index = Math.max(0, Math.min(picker.index, matches.length-1));
		this.emit(framed("File search (literal)", picker.query));
		const stops = boundaries(picker.query);
		this.write(`Query cursor: ${stops.indexOf(picker.cursor)}/${stops.length-1} graphemes`);
		if (picker.loading) { this.write("Listing eligible file names only…"); return; }
		if (!matches.length) { this.write("No eligible matching files. Esc keeps @query as literal text."); return; }
		const start = Math.floor(picker.index/5)*5;
		this.write(`Matches ${matches.length} · showing ${start+1}–${Math.min(start+5,matches.length)} · Up/Down to select`);
		matches.slice(start,start+5).forEach((path,i) => this.write(`│ ${start+i===picker.index?">":" "} ${identifierPreview(path)}`));
	}
	private select(): void {
		const picker = this.picker; if (!picker || picker.loading) return;
		const path = this.matches()[picker.index]; if (path === undefined) { this.show(); return; }
		if (this.selected.some(item => item.path === path)) { this.write("Already selected. Remove it and reselect to refresh explicitly."); this.picker = undefined; return; }
		picker.loading = true; picker.capturing = true; this.write("Capturing selected snapshot…");
		void captureAttachment(this.workspace, path, this.maxAttachmentBytes-this.total, picker.controller.signal).then(snapshot => {
			if (this.picker !== picker) return;
			this.selected.push(snapshot); this.picker = undefined; this.summary();
		}, error => {
			if (this.picker !== picker) return;
			this.picker = undefined; this.emit(framed("Attachment error; draft and attachments retained", `${path}\n${error instanceof Error ? error.message : "attachment_capture_failed"}`));
		});
	}
	handleKey(text: string | undefined, key: InputKey): boolean {
		const picker = this.picker;
		if (!picker) {
			if (key.ctrl && key.name === "p") { this.preview(); return true; }
			if (key.ctrl && key.name === "r") { this.remove(); return true; }
			if (text === "@" && !key.ctrl && !key.meta && /(?:^|\s)$/.test(this.terminal.beforeCursor())) { this.open(); return true; }
			return false;
		}
		if (key.name === "escape") { this.cancel(true); return true; }
		if (key.ctrl && key.name === "c") { this.cancel(); return true; }
		if (key.ctrl && key.name === "d") return false;
		if (key.name === "return" || key.name === "enter") { this.select(); return true; }
		if (picker.capturing) return true;
		const stops = boundaries(picker.query), position = stops.indexOf(picker.cursor);
		if (key.name === "up" || (key.name === "tab" && key.shift)) picker.index = Math.max(0, picker.index-1);
		else if (key.name === "down" || key.name === "tab") picker.index = Math.max(0, Math.min(this.matches().length-1, picker.index+1));
		else if (key.name === "left") picker.cursor = stops[Math.max(0,position-1)]!;
		else if (key.name === "right") picker.cursor = stops[Math.min(stops.length-1,position+1)]!;
		else if (key.name === "home") picker.cursor = 0;
		else if (key.name === "end") picker.cursor = picker.query.length;
		else {
			let insertion = picker.cursor;
			if (key.name === "backspace") {
				const previous = stops[Math.max(0,position-1)]!;
				picker.query = picker.query.slice(0,previous) + picker.query.slice(picker.cursor); insertion = previous;
			} else if (!key.ctrl && !key.meta && text && !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(text)
				&& (!key.name || key.name === "space" || Array.from(key.name).length === 1)) {
				picker.query = picker.query.slice(0,picker.cursor) + text + picker.query.slice(picker.cursor); insertion += text.length;
			} else return true;
			// Inserting a combining mark or ZWJ can merge adjacent clusters. Stay on a boundary.
			picker.cursor = boundaries(picker.query).find(offset => offset >= insertion)!;
			picker.index = 0;
		}
		this.show(); return true;
	}
}
