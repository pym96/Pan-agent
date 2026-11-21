import assert from 'node:assert/strict';
import headless from '@xterm/headless';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DailyWorkspace } from '../src/tui/daily-workspace.ts';
import { createCompactPresentation } from '../src/tui/presentation.ts';
import type { TuiOptions } from '../src/tui/tui.ts';
import { GeneralAgentSession } from '../src/runtime/session.ts';
import { RunArchiveStore } from '../src/memory/run-archive.ts';
import { createPanTrustedLocalTools } from '../src/tools/pan-trusted-local-tools.ts';
import { scriptedAdapter, response, call } from './pan-fixture.ts';

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
  // Editing focus and resizing must leave the sealed archive unchanged.
  ui.key(undefined,{ name: 'tab' });
  for (const [cols, rowsN] of [[40, 12], [80, 24], [120, 40]] as const) { output.columns = cols; output.rows = rowsN; ui.draw(); }
  ui.key(undefined, { ctrl: true, name: 'g' });
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


test('native buffer preserves shell and finalized logical lines through streams, edits, overlays, resize and exit', async () => {
 const terminal = new headless.Terminal({ cols: 83, rows: 22, scrollback: 2500, allowProposedApi: true });
 const write = (s: string) => new Promise<void>(done => terminal.write(s, done));
 const text = () => {
  const buffer = terminal.buffer.normal;
  let result = '';
  for (let i = 0; i < buffer.length; i++) {
   const line = buffer.getLine(i)!;
   result += (line.isWrapped ? '' : '\n') + line.translateToString(true);
  }
  return result;
 };
 const input = Object.assign(new PassThrough(), {isTTY: true, isRaw: false, setRawMode(v:boolean){this.isRaw=v;}});
 const output = Object.assign(new PassThrough(), {isTTY: true, columns:83, rows:22});
 output.on('data', chunk => terminal.write(chunk));
 const presentation = createCompactPresentation();
 const ui = new DailyWorkspace({input, output, workspace:'/tmp', presentation, session:{}, model:'fake', provider:'fake'} as unknown as TuiOptions);
 const resize = async (cols:number, rows:number) => {
  await write('');
  terminal.resize(cols,rows); output.columns=cols; output.rows=rows; output.emit('resize');
  await write('');
 };
 const show = (type:string, fields:object) => presentation.observe({type,...fields} as never);
 const markers = Array.from({length:110}, (_,i) => 'row-'+String(i).padStart(3,'0')+' 中 e\u0301 '+('xy'.repeat(30)));
 try {
  await write('earlier shell output\r\n'); ui.start();
  for(const [index,reply] of [markers.join('\n'),'second answer'].entries()){
   const id=String(index);
   show('run.started',{runId:id,task:'question '+id}); show('model.turn_started',{runId:id,turn:1});
   for(const part of [reply.slice(0,45),reply.slice(45)])presentation.progress!({runId:id,turn:1,text:part} as never);
   if(!index){await resize(44,13);await resize(86,24);}
   show('model.turn_settled',{runId:id,text:reply});
   presentation.settle({runId:id,status:'completed',finalText:reply,toolCalls:0} as never);
   await write('');
   assert.equal(terminal.buffer.active.type,'normal');
   assert.ok(terminal.buffer.normal.baseY>0);
   const history=terminal.buffer.normal;
   const first=Array.from({length:history.length},(_,i)=>history.getLine(i)!.translateToString(true)).findIndex(line=>line.startsWith('│ row-000'));
   assert.ok(first>=0&&first<history.baseY);
   terminal.scrollToLine(first);
   assert.match(history.getLine(history.viewportY)!.translateToString(true),/row-000/);
   terminal.scrollToBottom();
   assert.equal(history.viewportY,history.baseY);
  }
  input.write('draft-marker'+'中e\u0301'.repeat(20));await write('');
  await resize(52,17);
  input.write('\x15:help\r');await write('');
  assert.equal(terminal.buffer.active.type,'alternate');
  await resize(40,12);await resize(94,27);
  input.write('\x07');await write('');
  await resize(94,27);
  ui.dispose();await write('');
  assert.equal(terminal.buffer.active.type,'normal');
  const retained=text();
  const lines=retained.split('\n');
  assert.ok(lines.includes('earlier shell output'));
  const answers=lines.filter(line=>line.startsWith('│ row-'));
  assert.deepEqual(answers,markers.map(m=>'│ '+m));
  assert.ok(retained.indexOf(markers[109]!)<retained.indexOf('second answer'));
  assert.equal(retained.split('second answer').length,2);
  assert.doesNotMatch(retained,/draft-marker|View only · :help/);
  assert.match(retained,/Pan closed/);
  assert.equal(input.isRaw,false);
 } finally {terminal.dispose();}
});
