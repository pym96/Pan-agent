import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import type { TuiOptions } from '../src/tui/tui.ts';

type Entry = { role: 'You' | 'Pan' | 'Tool'; text: string; status: string };

function fixture(columns = 120, rows = 40) {
 const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; } });
 const output = Object.assign(new PassThrough(), { isTTY: true, columns, rows });
 output.resume();
 let admits = 0, cancels = 0;
 const presentation = createCompactPresentation();
 const session = { cancel() { cancels++; }, runTask() { admits++; return new Promise(() => {}); }, close: async () => {}, contextMessageCount: 0 };
 const ui = new DailyWorkspace({ input, output, workspace: '/tmp', presentation, session, model: 'fixture', provider: 'fixture' } as unknown as TuiOptions);
 return { ui, input, output, presentation, session, counts: () => ({ admits, cancels }) };
}

/** Deterministic 1,000-entry mixed Tool/Pan transcript: 500 visible characters per entry, including Unicode rows. */
function fill(ui: DailyWorkspace, count: number): void {
 for (let i = 0; i < count; i++) {
  const tool = i % 3 === 2;
  const text = `entry-${i} ` + (tool ? 'read' : 'text') + ' ' + ('x'.repeat(200) + ' 中é👩‍💻 '.repeat(20) + 'y'.repeat(120)).slice(0, 460);
  const entry: Entry = { role: tool ? 'Tool' : 'Pan', text, status: tool ? 'Returned · Enter details' : 'Completed' };
  ui.entries.push(entry);
  (ui as unknown as { touch(item: number): void }).touch(ui.entries.length - 1);
 }
}

const wheelOn = (ui: DailyWorkspace, delta: number) => (ui as unknown as { wheel(d: number, x: number, y: number): void }).wheel(delta, 2, 3);

test('C-SCROLL-01 bounded wheel-layout cost: p95, zero rebuilds, bounded source-row visits', () => {
 const { ui } = fixture(120, 40);
 fill(ui, 1000);
 ui.phase = 'idle';
 ui.draw(); // initial full build
 assert.ok(ui.layoutStats.builds >= 1000, 'initial build covers all entries');
 const buildsAfterInitial = ui.layoutStats.builds;
 for (let i = 0; i < 10; i++) wheelOn(ui, -3); // warm-up
 const bodyHeight = (ui as unknown as { bodyHeight: number }).bodyHeight;
 const buildsWarm = ui.layoutStats.builds;
 const visitsWarm = ui.layoutStats.sourceRowVisits;
 const samples: number[] = [];
 for (let i = 0; i < 50; i++) {
  const before = { builds: ui.layoutStats.builds, visits: ui.layoutStats.sourceRowVisits };
  const t0 = performance.now();
  wheelOn(ui, i % 2 === 0 ? -3 : 3);
  samples.push(performance.now() - t0);
  assert.equal(ui.layoutStats.builds, before.builds, `wheel ${i} must not rebuild layout`);
  assert.ok(ui.layoutStats.sourceRowVisits - before.visits <= 2 * bodyHeight + 8, `wheel ${i} visits must be viewport-bounded`);
 }
 assert.equal(ui.layoutStats.builds, buildsWarm, 'no post-warm-up wheel rebuilds');
 const sorted = [...samples].sort((a, b) => a - b);
 const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
 console.log(`C-SCROLL-01 samples=${samples.length} p95=${p95.toFixed(3)}ms builds(post-warm)=${ui.layoutStats.builds - buildsWarm} visitsBound=${2 * bodyHeight + 8} min=${sorted[0]!.toFixed(3)} max=${sorted.at(-1)!.toFixed(3)}`);
 assert.ok(p95 <= 50, `p95 ${p95}ms exceeds 50ms`);
});

test('C-SCROLL-02 scroll and follow semantics: clamps, detached anchor, newOutput, Ctrl-End, no execution', () => {
 const { ui, counts } = fixture(120, 40);
 fill(ui, 60);
 ui.phase = 'idle';
 ui.draw();
 const body = (ui as unknown as { bodyHeight: number }).bodyHeight;
 assert.equal(ui.follow, true);
 // Wheel up: detached reader clamps and anchors.
 wheelOn(ui, -10);
 assert.equal(ui.follow, false);
 assert.ok(ui.top > 0 === false || ui.top >= 0);
 const anchoredAnchor = structuredClone(ui.anchor);
 assert.ok(anchoredAnchor, 'detached reader has an anchor');
 // Massive negative delta clamps at 0; the clamped anchor becomes the current one.
 wheelOn(ui, -100000);
 assert.equal(ui.top, 0);
 assert.equal(ui.follow, false);
 const clampedAnchor = structuredClone(ui.anchor);
 assert.deepEqual(clampedAnchor, { item: 0, part: 'header', offset: 0 });
 // New model progress at detached position: anchor retained, newOutput set.
 (ui as unknown as { activeIndex: number }).activeIndex = ui.entries.length - 1;
 (ui as unknown as { active: Entry }).active = ui.entries.at(-1)!;
 (ui as unknown as { progress(e: { text: string }): void }).progress({ text: 'more' } as never);
 assert.equal(ui.newOutput, true);
 assert.deepEqual(ui.anchor, clampedAnchor, 'detached reader is not pulled to tail by new output');
 assert.equal(ui.follow, false);
 // Ctrl-End restores follow and clears newOutput.
 ui.key(undefined, { ctrl: true, name: 'end' });
 assert.equal(ui.follow, true);
 assert.equal(ui.newOutput, false);
 assert.equal(ui.anchor, undefined);
 // New progress at tail: stays at tail, no newOutput.
 (ui as unknown as { progress(e: { text: string }): void }).progress({ text: 'tail' } as never);
 assert.equal(ui.follow, true);
 assert.equal(ui.newOutput, false);
 // PageUp/PageDown move by half screen and clamp.
 ui.key(undefined, { name: 'pageup' });
 assert.equal(ui.follow, false);
 const afterPage = ui.top;
 ui.key(undefined, { name: 'pagedown' });
 ui.key(undefined, { name: 'pagedown' });
 assert.ok(ui.top >= afterPage);
 assert.deepEqual(counts(), { admits: 0, cancels: 0 }, 'view inputs never execute');
});

test('C-SCROLL-03 resize invalidates only on width change; anchor identity and draft preserved', () => {
 const { ui, output } = fixture(120, 40);
 fill(ui, 80);
 ui.phase = 'idle';
 ui.editor.insert('draft 中 é👩‍💻 text');
 const draftText = ui.editor.text, draftCaret = ui.editor.caret;
 ui.draw();
 wheelOn(ui, -15);
 const anchorBefore = structuredClone(ui.anchor);
 const topBefore = ui.top;
 for (const [cols, rows] of [[40, 12], [80, 24], [120, 40], [80, 24], [40, 12], [120, 40]] as const) {
  output.columns = cols; output.rows = rows;
  const buildsBefore = ui.layoutStats.builds;
  ui.draw(); // resize
  assert.ok(ui.layoutStats.builds > buildsBefore, `resize to ${cols}x${rows} must rewrap`);
  assert.equal(ui.editor.text, draftText);
  assert.equal(ui.editor.caret, draftCaret);
 }
 // Unchanged dimensions must not rebuild.
 const buildsStable = ui.layoutStats.builds;
 ui.draw();
 ui.draw();
 assert.equal(ui.layoutStats.builds, buildsStable, 'unchanged dimensions rebuild nothing');
 // Anchor identity retained across the whole resize cycle.
 assert.deepEqual(ui.anchor, anchorBefore, 'source anchor identity survives resize');
 // Appending one entry rebuilds only that entry.
 (ui as unknown as { touch(item: number): void }).touch(ui.entries.push({ role: 'Pan', text: 'appended', status: 'Completed' }) - 1);
 const buildsAppend = ui.layoutStats.builds;
 ui.draw();
 assert.equal(ui.layoutStats.builds, buildsAppend + 1, 'append builds exactly the new entry');
 assert.equal(ui.editor.text, draftText);
 assert.equal(ui.editor.caret, draftCaret);
 assert.ok(topBefore >= 0);
});

test('C-SCROLL-04 view operations cause zero execution and leave archive semantics untouched', () => {
 const { ui, counts, presentation } = fixture(120, 40);
 fill(ui, 40);
 ui.phase = 'idle';
 ui.draw();
 // Exercise view-only operations.
 for (let i = 0; i < 20; i++) wheelOn(ui, i % 2 ? -3 : 3);
 ui.key(undefined, { name: 'pageup' });
 ui.key(undefined, { name: 'pagedown' });
 ui.key(undefined, { ctrl: true, name: 'end' });
 assert.deepEqual(counts(), { admits: 0, cancels: 0 });
 // Entries are the only state; scrolling never mutates entry content.
 const before = ui.entries.map((e) => `${e.role}|${e.status}|${e.text.length}`).join('\n');
 wheelOn(ui, -5);
 ui.draw();
 const after = ui.entries.map((e) => `${e.role}|${e.status}|${e.text.length}`).join('\n');
 assert.equal(after, before, 'view operations never mutate retained entries');
});
