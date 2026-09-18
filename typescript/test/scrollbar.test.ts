import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { FramedInput, type FramedEvent } from '../src/tui/framed-input.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import { graphemes, width } from '../src/tui/daily-editor.ts';
import { scrollbarGeometry, scrollbarDragTop, scrollbarCapturedDragTop } from '../src/tui/scrollbar.ts';
import type { TuiOptions } from '../src/tui/tui.ts';
import { GeneralAgentSession } from '../src/runtime/session.ts';
import { RunArchiveStore } from '../src/memory/run-archive.ts';
import { createPanTrustedLocalTools } from '../src/tools/pan-trusted-local-tools.ts';
import { scriptedAdapter, response, call } from './pan-fixture.ts';

type Entry = { role: 'You' | 'Pan' | 'Tool'; text: string; status: string };
type WorkspacePrivates = {
 bodyHeight: number; dragging: boolean; grabOffset: number;
 contentRows: { text: string; anchor: { item: number; part: string; offset: number } }[];
 wheel(d: number, x: number, y: number): void;
 mouse(a: 'press' | 'drag' | 'release', x: number, y: number): void;
 parser: FramedInput;
};

function fixture(columns = 120, rows = 40) {
 const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; } });
 const output = Object.assign(new PassThrough(), { isTTY: true, columns, rows });
 let painted = '';
 output.on('data', (chunk) => { painted += chunk; });
 output.resume();
 let admits = 0, cancels = 0;
 const presentation = createCompactPresentation();
 const session = { cancel() { cancels++; }, runTask() { admits++; return new Promise(() => {}); }, close: async () => {}, contextMessageCount: 0 };
 const ui = new DailyWorkspace({ input, output, workspace: '/tmp', presentation, session, model: 'fixture', provider: 'fixture' } as unknown as TuiOptions);
 return { ui, input, output, presentation, painted: () => painted, counts: () => ({ admits, cancels }) };
}

/** Mixed Tool/Pan entries with short, long-wrapped and Unicode source rows. `newlines` adds empty-line rows. */
function fill(ui: DailyWorkspace, count: number, newlines = false): void {
 for (let i = 0; i < count; i++) {
  const tool = i % 3 === 2;
  const body = ('x'.repeat(200) + ' 中é👩‍💻 '.repeat(20) + 'y'.repeat(120)).slice(0, i % 7 === 3 ? 240 : 460);
  const text = newlines && i % 7 === 3
   ? `entry-${i} 中é👩‍💻\n\n` + body
   : `entry-${i} ` + (tool ? 'read' : 'text') + ' ' + body;
  const entry: Entry = { role: tool ? 'Tool' : 'Pan', text, status: tool ? 'Returned · Enter details' : 'Completed' };
  ui.entries.push(entry);
  (ui as unknown as { touch(item: number): void }).touch(ui.entries.length - 1);
 }
}

const priv = (ui: DailyWorkspace) => ui as unknown as WorkspacePrivates;
const press = (ui: DailyWorkspace, x: number, y: number) => priv(ui).mouse('press', x, y);
const dragTo = (ui: DailyWorkspace, x: number, y: number) => priv(ui).mouse('drag', x, y);
const release = (ui: DailyWorkspace, x: number, y: number) => priv(ui).mouse('release', x, y);
const wheelOn = (ui: DailyWorkspace, delta: number) => priv(ui).wheel(delta, 2, 3);
const cells = (s: string) => graphemes(s).reduce((n, g) => n + width(g), 0);

/** Independent restatement of the frozen #60 geometry, used as the test oracle. */
function expectedGeometry(N: number, V: number, top: number) {
 const maxTop = Math.max(0, N - V);
 if (maxTop === 0) return undefined;
 const track = V;
 const thumbSize = Math.max(1, Math.min(track, Math.ceil((V * V) / N)));
 const thumbStart = Math.max(0, Math.min(track - thumbSize, Math.round(((track - thumbSize) * top) / maxTop)));
 return { thumbSize, thumbStart, maxTop, track };
}
function expectedDragTop(N: number, V: number, y: number) {
 const g = expectedGeometry(N, V, 0);
 if (!g) return undefined;
 const thumbStart = Math.max(0, Math.min(g.track - g.thumbSize, y - 2 - Math.floor(g.thumbSize / 2)));
 return g.track === g.thumbSize ? 0 : Math.round((thumbStart * g.maxTop) / (g.track - g.thumbSize));
}
function expectedCapturedDragTop(N: number, V: number, y: number, grabOffset: number) {
 const g = expectedGeometry(N, V, 0);
 if (!g) return undefined;
 const p = Math.max(0, Math.min(g.track - 1, y - 2));
 const thumbStart = Math.max(0, Math.min(g.track - g.thumbSize, p - grabOffset));
 return g.track === g.thumbSize ? 0 : Math.round((thumbStart * g.maxTop) / (g.track - g.thumbSize));
}

/** Parse the most recent painted frame into visible row text keyed by 1-based terminal row. */
function frameRows(painted: string): Map<number, string> {
 const start = painted.lastIndexOf('\x1b[?25l');
 const frame = painted.slice(start + 6);
 const marks: { y: number; end: number }[] = [];
 const re = /\x1b\[(\d+);1H/g;
 let m: RegExpExecArray | null;
 while ((m = re.exec(frame))) marks.push({ y: Number(m[1]), end: re.lastIndex });
 const rows = new Map<number, string>();
 for (let k = 0; k < marks.length; k++) {
  const seg = frame.slice(marks[k]!.end, k + 1 < marks.length ? marks[k + 1]!.end - `\x1b[${marks[k + 1]!.y};1H`.length : frame.length);
  rows.set(marks[k]!.y, seg.replace(/\x1b\[\??[0-9;]*[A-Za-z]/g, ''));
 }
 return rows;
}

/** Track glyph at a 1-based terminal row: the last grapheme, which must sit at the final column. */
function trackGlyphAt(rows: Map<number, string>, y: number, columns: number): string | undefined {
 const text = rows.get(y);
 if (!text) return undefined;
 const parts = graphemes(text);
 const last = parts.at(-1);
 if (last !== '█' && last !== '│') return undefined;
 assert.equal(cells(parts.slice(0, -1).join('')), columns - 1, `track glyph must sit at the final column (row ${y})`);
 return last;
}

test('C-SBAR-01 frozen geometry formulas: table, no-overflow blank, rendered-row basis', () => {
 // Literal frozen-formula table (independently recomputed expectations).
 assert.deepEqual(scrollbarGeometry(20, 10, 0), { thumbSize: 5, thumbStart: 0, maxTop: 10, track: 10 });
 assert.deepEqual(scrollbarGeometry(20, 10, 5), { thumbSize: 5, thumbStart: 3, maxTop: 10, track: 10 }); // round(2.5)=3
 assert.deepEqual(scrollbarGeometry(20, 10, 10), { thumbSize: 5, thumbStart: 5, maxTop: 10, track: 10 });
 assert.deepEqual(scrollbarGeometry(100, 10, 45), { thumbSize: 1, thumbStart: 5, maxTop: 90, track: 10 }); // round(4.5)=5
 assert.deepEqual(scrollbarGeometry(100, 10, 90), { thumbSize: 1, thumbStart: 9, maxTop: 90, track: 10 });
 assert.deepEqual(scrollbarGeometry(1000, 34, 0), { thumbSize: 2, thumbStart: 0, maxTop: 966, track: 34 });
 assert.equal(scrollbarGeometry(10, 10, 0), undefined, 'N=V: no overflow, blank track');
 assert.equal(scrollbarGeometry(8, 10, 0), undefined, 'N<V: no overflow, blank track');
 assert.equal(scrollbarGeometry(0, 10, 0), undefined, 'empty transcript: blank track');
 // Drag mapping table.
 assert.equal(scrollbarDragTop(100, 10, 2), 0);
 assert.equal(scrollbarDragTop(100, 10, 11), 90, 'bottom of track maps to maxTop');
 assert.equal(scrollbarDragTop(20, 10, 6), 4); // thumbSize 5, p=4, start=2, round(2*10/5)=4
 assert.equal(scrollbarDragTop(10, 10, 7), undefined, 'no overflow: inert');
 // Cross-check against the independent oracle over a wider grid.
 for (const N of [11, 20, 57, 100, 341, 1000]) for (const V of [10, 24, 34]) for (const top of [0, 1, Math.floor(Math.max(0, N - V) / 2), Math.max(0, N - V)]) {
  assert.deepEqual(scrollbarGeometry(N, V, top) ?? null, expectedGeometry(N, V, top) ?? null, `geometry ${N}/${V}/${top}`);
  for (const y of [2, 2 + Math.floor(V / 2), V + 1]) assert.equal(scrollbarDragTop(N, V, y), expectedDragTop(N, V, y), `drag ${N}/${V}/y${y}`);
  for (const y of [-100, 2, 2 + Math.floor(V / 2), V + 1, 999]) assert.equal(scrollbarCapturedDragTop(N, V, y, Math.floor((expectedGeometry(N, V, 0)?.thumbSize ?? 1) / 2)), expectedCapturedDragTop(N, V, y, Math.floor((expectedGeometry(N, V, 0)?.thumbSize ?? 1) / 2)), `captured drag ${N}/${V}/y${y}`);
 }
});

test('C-SBAR-01 rendered track: thumb extent/position, reserved final column, navigation identical to #62', () => {
 const { ui, painted, counts } = fixture(120, 40);
 fill(ui, 300);
 ui.phase = 'idle';
 ui.draw();
 const V = priv(ui).bodyHeight;
 const N = priv(ui).contentRows.length;
 assert.ok(N > V, 'transcript overflows');
 const check = (label: string) => {
  const rows = frameRows(painted());
  const g = expectedGeometry(N, V, ui.top)!;
  for (let y = 2; y <= V + 1; y++) {
   const want = y - 2 >= g.thumbStart && y - 2 < g.thumbStart + g.thumbSize ? '█' : '│';
   assert.equal(trackGlyphAt(rows, y, 120), want, `${label}: track row ${y}`);
  }
  for (const [y, text] of rows) {
   if (y >= 2 && y <= V + 1) assert.equal(cells(text), 120, `${label}: body row ${y} = content+track`);
   else assert.ok(cells(text) <= 119, `${label}: non-body row ${y} leaves the final column unused`);
  }
 };
 // Tail follow: thumb at the bottom of the track.
 assert.equal(ui.follow, true);
 check('tail');
 // Wheel to head: thumb at the top.
 wheelOn(ui, -100000);
 assert.equal(ui.top, 0);
 assert.equal(ui.follow, false);
 check('head');
 // Middle: wheel then PageDown keep #62 semantics and move the thumb.
 wheelOn(ui, 30);
 const mid = ui.top;
 assert.ok(mid > 0 && ui.follow === false);
 check('middle');
 ui.key(undefined, { name: 'pagedown' });
 assert.ok(ui.top > mid);
 check('pagedown');
 // Ctrl-End restores tail follow and the bottom thumb.
 ui.key(undefined, { ctrl: true, name: 'end' });
 assert.equal(ui.follow, true);
 assert.equal(ui.newOutput, false);
 check('ctrl-end');
 assert.deepEqual(counts(), { admits: 0, cancels: 0 });
});

test('C-SBAR-01 no-overflow blank track and resize recomputes geometry from rendered rows', () => {
 const { ui, output, painted } = fixture(120, 40);
 fill(ui, 5);
 ui.phase = 'idle';
 ui.draw();
 const V = priv(ui).bodyHeight;
 const rows = frameRows(painted());
 for (let y = 2; y <= V + 1; y++) assert.equal(trackGlyphAt(rows, y, 120), undefined, `blank track row ${y}`);
 for (const [, text] of rows) assert.ok(cells(text) <= 119, 'every row leaves the final column blank');
 // Overflow, detach inside a long Unicode entry, then resize: anchor identity and formula survive.
 fill(ui, 300, true);
 ui.draw();
 wheelOn(ui, -50);
 const anchorBefore = structuredClone(ui.anchor);
 assert.ok(anchorBefore);
 const counts: [number, number][] = [];
 for (const [cols, rowsN] of [[40, 12], [80, 24], [120, 40], [80, 24], [40, 12], [120, 40]] as const) {
  output.columns = cols; output.rows = rowsN;
  ui.draw();
  const v2 = priv(ui).bodyHeight, n2 = priv(ui).contentRows.length;
  counts.push([cols, n2]);
  const g = expectedGeometry(n2, v2, ui.top)!;
  const paintedRows = frameRows(painted());
  for (let y = 2; y <= v2 + 1; y++) {
   const want = y - 2 >= g.thumbStart && y - 2 < g.thumbStart + g.thumbSize ? '█' : '│';
   assert.equal(trackGlyphAt(paintedRows, y, cols), want, `resize ${cols}x${rowsN} track row ${y}`);
  }
  assert.deepEqual(ui.anchor, anchorBefore, `resize ${cols}x${rowsN} preserves the source anchor`);
 }
 assert.ok(counts[0]![1] !== counts[2]![1], 'rendered-row count responds to width');
});

test('C-SBAR-02 primary press/drag/release position the viewport by the frozen mapping', () => {
 const { ui, counts } = fixture(120, 40);
 fill(ui, 300);
 ui.phase = 'idle';
 ui.editor.insert('draft 中 é👩‍💻 text');
 const draft = ui.editor.text, caret = ui.editor.caret;
 ui.draw();
 const V = priv(ui).bodyHeight;
 const N = priv(ui).contentRows.length;
 const columns = 120;
 // Press at the top of the track: drag starts, head position, detached.
 press(ui, columns, 2);
 assert.equal(priv(ui).dragging, true);
 assert.equal(ui.top, 0);
 assert.equal(ui.follow, false);
 assert.ok(ui.anchor);
 // Drag to the middle and the bottom of the track.
 const midY = 2 + Math.floor(V / 2);
 dragTo(ui, columns, midY);
 assert.equal(ui.top, expectedDragTop(N, V, midY));
 assert.equal(ui.follow, false);
 dragTo(ui, columns, V + 1);
 assert.equal(ui.top, Math.max(0, N - V), 'bottom of the track maps to maxTop');
 assert.equal(ui.follow, true, 'tail target restores follow');
 assert.equal(ui.newOutput, false);
 // Matching release applies the mapping and ends the drag.
 release(ui, columns, V + 1);
 assert.equal(priv(ui).dragging, false);
 assert.equal(ui.top, Math.max(0, N - V));
 // A press inside the track detaches again by the same mapping.
 press(ui, columns, 2 + 4);
 assert.equal(ui.top, expectedDragTop(N, V, 2 + 4));
 assert.equal(ui.follow, false);
 release(ui, columns, 2 + 4);
 assert.equal(priv(ui).dragging, false);
 // Draft untouched, no execution.
 assert.equal(ui.editor.text, draft);
 assert.equal(ui.editor.caret, caret);
 assert.deepEqual(counts(), { admits: 0, cancels: 0 });
});

test('C-SBAR-02@1.1 only in-track presses capture; horizontal drift and y overshoot remain captured; release/cancel clear it', () => {
 const { ui, counts } = fixture(120, 40);
 fill(ui, 300);
 ui.phase = 'idle';
 ui.editor.insert('keep me');
 const draft = ui.editor.text, caret = ui.editor.caret;
 ui.draw();
 const V = priv(ui).bodyHeight;
 const top0 = ui.top;
 // Release without press, drag without press: inert.
 release(ui, 120, 10);
 dragTo(ui, 120, 10);
 assert.equal(ui.top, top0);
 assert.equal(priv(ui).dragging, false);
 // Out-of-track presses never start a drag: wrong column, header row, separator row.
 for (const [x, y] of [[119, 10], [1, 10], [120, 1], [120, V + 2], [120, 0]] as const) {
  press(ui, x, y);
  assert.equal(priv(ui).dragging, false, `press ${x},${y} must not start a drag`);
  assert.equal(ui.top, top0);
 }
 // A real press starts capture; wheel keeps its #62 behavior. Captured drags deliberately tolerate x drift.
 press(ui, 120, 8);
 assert.equal(priv(ui).dragging, true);
 const topDrag = ui.top;
 wheelOn(ui, -3);
 assert.equal(ui.top, Math.max(0, topDrag - 3), 'wheel during a drag scrolls exactly as #62');
 assert.equal(priv(ui).dragging, true, 'wheel does not end the drag');
 wheelOn(ui, 3);
 assert.equal(ui.top, topDrag);
 dragTo(ui, 1, 20);
 assert.equal(ui.top, expectedCapturedDragTop(priv(ui).contentRows.length, V, 20, priv(ui).grabOffset), 'horizontal drift cannot freeze a captured drag');
 dragTo(ui, 999999, -20);
 assert.equal(ui.top, 0, 'vertical overshoot clamps to the track head');
 // Ctrl-G cancels the drag without scrolling; later drag reports are inert.
 const topCaptured = ui.top;
 ui.key(undefined, { ctrl: true, name: 'g' });
 assert.equal(priv(ui).dragging, false);
 assert.equal(ui.top, topCaptured, 'Ctrl-G does not scroll');
 dragTo(ui, 120, 2);
 assert.equal(ui.top, topCaptured, 'drag after cancellation is inert');
 // Ctrl-C likewise ends a drag; in idle phase it admits and cancels nothing.
 press(ui, 120, 8);
 assert.equal(priv(ui).dragging, true);
 const topDrag2 = ui.top;
 ui.key(undefined, { ctrl: true, name: 'c' });
 assert.equal(priv(ui).dragging, false);
 assert.equal(ui.top, topDrag2);
 dragTo(ui, 120, 2);
 assert.equal(ui.top, topDrag2);
 // Apple Terminal-compatible button=0/m release clears capture without repositioning.
 press(ui, 120, 8);
 assert.equal(priv(ui).dragging, true);
 priv(ui).parser.feed('\x1b[<0;1;999999m');
 assert.equal(priv(ui).dragging, false, 'alternate declared release clears capture regardless of coordinates');
 assert.equal(ui.editor.text, draft);
 assert.equal(ui.editor.caret, caret);
 assert.deepEqual(counts(), { admits: 0, cancels: 0 });
});

test('C-SBAR-02 drag repaints only when the viewport state changes (motion flood stays bounded)', () => {
 const { ui, painted } = fixture(120, 40);
 fill(ui, 300);
 ui.phase = 'idle';
 ui.draw();
 const frames = () => painted().split('\x1b[?25l').length - 1;
 const base = frames();
 press(ui, 120, 10);
 const afterPress = frames();
 assert.ok(afterPress <= base + 1, 'press draws at most once');
 // Many motion reports mapping to the same track row: zero additional frames.
 for (let i = 0; i < 50; i++) dragTo(ui, 120, 10);
 assert.equal(frames(), afterPress, 'same-row motions repaint nothing');
 // A motion crossing the track repaints only on the actual change.
 const V = priv(ui).bodyHeight;
 dragTo(ui, 120, V + 1);
 assert.equal(ui.follow, true);
 assert.ok(frames() <= afterPress + 2, 'cross-row drag repaints on change only');
 release(ui, 120, V + 1);
 assert.equal(priv(ui).dragging, false);
});

test('C-SBAR-02 blank track and modal overlay are inert for press/drag/release', () => {
 const { ui, counts } = fixture(120, 40);
 fill(ui, 5); // no overflow
 ui.phase = 'idle';
 ui.draw();
 const top0 = ui.top;
 press(ui, 120, 2);
 dragTo(ui, 120, 10);
 release(ui, 120, 10);
 assert.equal(priv(ui).dragging, false, 'blank track starts no drag');
 assert.equal(ui.top, top0);
 assert.equal(ui.follow, true, 'blank track never detaches the reader');
 // Overflow again, then an overlay makes track reports inert.
 fill(ui, 300);
 ui.draw();
 ui.overlay = { title: 'View only', lines: ['line one', 'line two'], offset: 0, focus: 'composer' };
 ui.draw();
 const topOverlay = ui.top;
 press(ui, 120, 2);
 dragTo(ui, 120, 5);
 release(ui, 120, 5);
 assert.equal(priv(ui).dragging, false, 'overlay press starts no drag');
 assert.equal(ui.top, topOverlay, 'overlay track reports are inert');
 assert.deepEqual(counts(), { admits: 0, cancels: 0 });
});

test('C-SBAR-02/03 framed input: exact SGR grammar, every split reconstructs, variants and malformed frames inert', () => {
 const collect = () => {
  const events: FramedEvent[] = [];
  const parser = new FramedInput((event) => events.push(event));
  return { parser, events };
 };
 const valid: [string, FramedEvent][] = [
  ['\x1b[<0;120;5M', { type: 'mouse', action: 'press', x: 120, y: 5 }],
  ['\x1b[<32;120;21M', { type: 'mouse', action: 'drag', x: 120, y: 21 }],
  ['\x1b[<3;120;35m', { type: 'mouse', action: 'release', x: 120, y: 35 }],
  ['\x1b[<0;120;35m', { type: 'mouse', action: 'release', x: 120, y: 35 }],
  ['\x1b[<0;999999;999999M', { type: 'mouse', action: 'press', x: 999999, y: 999999 }],
 ];
 for (const [frame, expected] of valid) {
  for (let split = 0; split <= frame.length; split++) {
   const { parser, events } = collect();
   parser.feed(frame.slice(0, split));
   parser.feed(frame.slice(split));
   assert.deepEqual(events, [expected], `split at ${split}`);
   assert.equal(parser.state.quarantined, false);
  }
 }
 // Button/terminator/coordinate variants and malformed frames emit nothing.
 const inert = [
  '\x1b[<1;120;5M', '\x1b[<2;120;5M', '\x1b[<8;120;5M', '\x1b[<35;120;5M', // other buttons/motion
  '\x1b[<3;120;5M', // release code with press terminator
  '\x1b[<32;120;5m', // drag code with release terminator
  '\x1b[<0;1234567;5M', // 7-digit coordinate beyond the parser bound
  '\x1b[<0;;5M', '\x1b[<0;120M', '\x1b[<0;120;5', '\x1b[<a;120;5M', '\x1b[<0;120;5;2M',
 ];
 for (const frame of inert) {
  const { parser, events } = collect();
  parser.feed(frame);
  assert.deepEqual(events, [], `inert ${JSON.stringify(frame)}`);
 }
 // Control strings, paste and SS3 stay under the existing #47 framing rules; a valid press still works after them.
 const { parser, events } = collect();
 parser.feed('\x1b]0;title \x1b[<0;120;5M\x07'); // OSC payload containing a forged mouse report
 parser.feed('\x1b]8;;https://example.invalid\x1b\\'); // OSC with ST
 parser.feed('\x1bP1$r\x1b\\'); // DCS control string
 parser.feed('\x1bOA'); // SS3
 parser.feed('\x1b[200~pasted \x1b[<0;9;9M text\x1b[201~'); // bracketed paste stays literal
 parser.feed('\x1b[<0;120;5M');
 const mouse = events.filter((event) => event.type === 'mouse');
 assert.deepEqual(mouse, [{ type: 'mouse', action: 'press', x: 120, y: 5 }]);
 const paste = events.find((event) => event.type === 'paste');
 assert.ok(paste && paste.type === 'paste' && paste.text.includes('pasted'), 'paste text retained literally');
 // Oversized frames hit the retained-byte ceiling mid-frame and quarantine the payload only.
 const { parser: big, events: bigEvents } = collect();
 big.feed('\x1b[<' + '1'.repeat(5000));
 assert.equal(big.state.quarantined, true, 'oversized payload is quarantined mid-frame');
 big.feed('M');
 assert.deepEqual(bigEvents.filter((event) => event.type === 'mouse'), [], 'quarantined frame emits nothing');
 assert.equal(big.state.quarantined, false, 'quarantine clears with the frame');
 big.feed('\x1b[<0;120;5M');
 assert.deepEqual(bigEvents.filter((event) => event.type === 'mouse'), [{ type: 'mouse', action: 'press', x: 120, y: 5 }], 'quarantine resets with the frame');
});

test('C-SBAR-03 fragmented press/drag/release integrate identically; drained fragments never reposition', () => {
 const { ui, counts } = fixture(120, 40);
 fill(ui, 300);
 ui.phase = 'idle';
 ui.editor.insert('draft');
 ui.draw();
 const V = priv(ui).bodyHeight;
 const seq = (yPress: number, yDrag: number, yRelease: number) => `\x1b[<0;120;${yPress}M\x1b[<32;120;${yDrag}M\x1b[<3;120;${yRelease}m`;
 // Whole-frame baseline through the real parser.
 priv(ui).parser.feed(seq(2, 18, 30));
 const expected = { top: ui.top, follow: ui.follow, dragging: priv(ui).dragging };
 assert.equal(expected.dragging, false);
 assert.equal(ui.top, expectedCapturedDragTop(priv(ui).contentRows.length, V, 18, Math.floor((scrollbarGeometry(priv(ui).contentRows.length, V, 0)?.thumbSize ?? 1) / 2)));
 // Byte-wise splits of the same sequence reproduce identical state.
 ui.key(undefined, { ctrl: true, name: 'end' }); // reset the same tail state as the whole-frame baseline
 for (const byte of seq(2, 18, 30)) priv(ui).parser.feed(byte);
 assert.equal(ui.top, expected.top);
 assert.equal(ui.follow, expected.follow);
 // Fragmented then drained by Ctrl-G: the pending frame never becomes a report.
 press(ui, 120, 2); release(ui, 120, 2);
 const topBeforeDrain = ui.top;
 priv(ui).parser.feed('\x1b[<32;120;2'); // incomplete drag frame
 ui.key(undefined, { ctrl: true, name: 'g' });
 assert.equal(ui.top, topBeforeDrain, 'drained fragment never repositions');
 assert.deepEqual(counts(), { admits: 0, cancels: 0 });
 assert.equal(ui.editor.text, 'draft');
});

test('C-SBAR-03 painted frame escapes hostile entry text and reserves the final column', () => {
 const { ui, painted } = fixture(80, 24);
 ui.phase = 'idle';
 ui.entries.push({ role: 'Pan', text: 'forge \x1b[2J bidi \u202e bell \x07 osc \x1b]52;c;YQ==\x07', status: 'Completed' });
 (ui as unknown as { touch(item: number): void }).touch(0);
 ui.draw();
 const frame = painted().slice(painted().lastIndexOf('\x1b[?25l'));
 const body = frame.split(/\x1b\[\d+;1H/).slice(2).join('\n');
 assert.ok(body.includes('\\u001b[2J'), 'ANSI in content is escaped');
 assert.ok(body.includes('\\u202e'), 'bidi control is escaped');
 assert.ok(body.includes('\\u0007'), 'BEL in content is escaped');
 // Content rows carry no raw control characters of their own (frame control codes stripped above).
 const stripped = body.replace(/\x1b\[\??[0-9;]*[A-Za-z]/g, '');
 assert.ok(!/[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(stripped), 'no raw control text painted');
 for (const [y, text] of frameRows(painted())) assert.ok(cells(text) <= 79, `row ${y} within the reserved-column bound`);
});

test('C-SBAR-04 view interactions add zero execution; sealed archive and replay stay identical', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'wo60-sbar04-'));
 try {
  // #49 Criteria 1.2: this view-only regression uses an existing ordinary file.
  await writeFile(join(directory, 'note.txt'), 'seed');
  const archiveStore = await RunArchiveStore.open(join(directory, 'memory'));
  const { adapter, faux } = scriptedAdapter();
  faux.setResponses([
   response(call('write', { path: 'note.txt', content: 'alpha 中' }, { id: 'c1' }), { stopReason: 'tool_calls' }),
   response(call('read', { path: 'note.txt' }, { id: 'c2' }), { stopReason: 'tool_calls' }),
   response('final answer é👩‍💻'),
  ]);
  const presentation = createCompactPresentation();
  const session = new GeneralAgentSession({
   kernel: 'native', adapter, tools: createPanTrustedLocalTools(directory).tools, systemPrompt: 'offline',
   memory: { archiveStore, runbook: async () => ({ content: 'test runbook', revision: `sha256:${'0'.repeat(64)}` }) },
   onObservation: (observation) => presentation.observe(observation),
   onProgress: (progress) => presentation.progress?.(progress),
  });
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; } });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120, rows: 40 });
  output.resume();
  const ui = new DailyWorkspace({ input, output, workspace: directory, presentation, session, archiveStore, model: 'pan-faux-v1', provider: 'pan-faux' } as unknown as TuiOptions);
  ui.phase = 'idle';
  const result = await session.runTask('demo task');
  presentation.settle(result);
  assert.equal(result.status, 'completed');
  const exchangesAfterRun = faux.state.callCount;
  const archiveBytes = async () => {
   const dir = join(directory, 'memory', 'runs', result.runId);
   const names = (await readdir(dir)).sort();
   const hash = createHash('sha256');
   for (const name of names) hash.update(name).update(await readFile(join(dir, name)));
   return names.join(',') + ':' + hash.digest('hex');
  };
  const bytesBefore = await archiveBytes();
  const recordsBefore = JSON.stringify(await archiveStore.readArchive(result.runId));
  const entriesBefore = ui.entries.map((e) => `${e.role}|${e.status}|${e.text}`).join('\n');
  // View-only interactions: wheel, full drag cycles, resize round trip, Ctrl-End.
  ui.draw();
  for (let i = 0; i < 10; i++) wheelOn(ui, i % 2 ? -3 : 3);
  press(ui, 120, 2); dragTo(ui, 120, 12); dragTo(ui, 120, 35); release(ui, 120, 35);
  press(ui, 120, 8); release(ui, 120, 8);
  for (const [cols, rowsN] of [[40, 12], [80, 24], [120, 40]] as const) { output.columns = cols; output.rows = rowsN; ui.draw(); }
  ui.key(undefined, { ctrl: true, name: 'end' });
  // Zero execution/persistence effects; archive bytes and event meaning unchanged.
  assert.equal(faux.state.callCount, exchangesAfterRun, 'no additional model exchange');
  assert.equal(await archiveBytes(), bytesBefore, 'archive bytes unchanged');
  assert.equal(JSON.stringify(await archiveStore.readArchive(result.runId)), recordsBefore, 'archive records unchanged');
  assert.equal(ui.entries.map((e) => `${e.role}|${e.status}|${e.text}`).join('\n'), entriesBefore, 'entries unchanged');
  // Replay through the zero-effect presentation surface.
  const lines: string[] = [];
  const replayView = createCompactPresentation((line) => lines.push(line));
  replayView.replay(await archiveStore.readArchive(result.runId), result.runId);
  assert.ok(lines.join('\n').includes('archived · zero execution'), 'replay declares zero execution');
  assert.equal(faux.state.callCount, exchangesAfterRun, 'replay makes no exchange');
  await session.close();
 } finally {
  await rm(directory, { recursive: true, force: true });
 }
});

test('C-SBAR-04 #62 harness bounds continue to pass and drags never rebuild the layout', () => {
 const { ui } = fixture(120, 40);
 fill(ui, 1000);
 ui.phase = 'idle';
 ui.draw();
 for (let i = 0; i < 10; i++) wheelOn(ui, -3); // warm-up
 const V = priv(ui).bodyHeight;
 const buildsWarm = ui.layoutStats.builds;
 const samples: number[] = [];
 for (let i = 0; i < 50; i++) {
  const before = { builds: ui.layoutStats.builds, visits: ui.layoutStats.sourceRowVisits };
  const t0 = performance.now();
  if (i % 5 === 4) { press(ui, 120, 2 + (i % V)); dragTo(ui, 120, 2 + ((i * 7) % V)); release(ui, 120, 2 + ((i * 7) % V)); }
  else wheelOn(ui, i % 2 === 0 ? -3 : 3);
  samples.push(performance.now() - t0);
  assert.equal(ui.layoutStats.builds, before.builds, `interaction ${i} must not rebuild layout`);
  assert.ok(ui.layoutStats.sourceRowVisits - before.visits <= 2 * V + 8, `interaction ${i} visits must be viewport-bounded`);
 }
 assert.equal(ui.layoutStats.builds, buildsWarm, 'no post-warm-up rebuilds across wheels and drags');
 const sorted = [...samples].sort((a, b) => a - b);
 const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
 console.log(`C-SBAR-04 samples=${samples.length} p95=${p95.toFixed(3)}ms builds(post-warm)=${ui.layoutStats.builds - buildsWarm} visitsBound=${2 * V + 8} min=${sorted[0]!.toFixed(3)} max=${sorted.at(-1)!.toFixed(3)}`);
 assert.ok(p95 <= 50, `p95 ${p95}ms exceeds 50ms`);
});
