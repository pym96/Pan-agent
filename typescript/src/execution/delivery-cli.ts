import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Writable } from 'node:stream';
import { RunArchiveStore, verifyArchiveBytes } from '../memory/run-archive.ts';
import { loadRunbook } from '../memory/runbook.ts';
import { loadPanSettings } from '../config/settings.ts';
import { protectedReason } from '../runtime/authorization.ts';
import { GoalController, identity, parseDuration, type ExecutionPlan } from './controller.ts';
import { boundedRead, digest, parseCriteria } from './delivery-contract.ts';
import { git, head, observed } from './delivery-git.ts';
import { DeliveryRunner, reviewerDigest } from './delivery-runner.ts';
import type { FauxScriptEntry } from '../providers/faux/faux-model-adapter.ts';
import type { ModelResponse } from '../protocol/canonical-protocol.ts';

const usage = `pan-agent delivery run --workspace LOCAL_GIT_ROOT --state NEW_DIRECTORY --task TEXT --criteria FILE [--fixture FILE] [--attempts 1..8] [--for 60s]
pan-agent delivery inspect --state DIRECTORY
pan-agent delivery demo --directory NEW_DIRECTORY
Run in the foreground. Ctrl-C cancels. Inspect reads the last recorded result and checks the current candidate. Criteria select writable files and mandatory equals/includes/excludes/json-equals checks. Omit --fixture for the configured provider. See the package README for schema, limits, trust and recovery.`;
function within(parent: string, child: string) {
  const path = relative(parent, child);
  return !path || (!isAbsolute(path) && path !== '..' && !path.startsWith('../'));
}
function options(args: readonly string[], allowed: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i]!,
      v = args[i + 1];
    if (!allowed.includes(k) || v === undefined || !v || values.has(k))
      throw Error('invalid_delivery_option:' + k);
    values.set(k, v);
  }
  return (key: string, defaultValue?: string) => {
    const v = values.get(key) ?? defaultValue;
    if (v === undefined) throw Error('missing:' + key);
    return v;
  };
}
async function newPath(path: string) {
  const abs = resolve(path);
  return join(await realpath(dirname(abs)), relative(dirname(abs), abs));
}
async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function demoScript(): FauxScriptEntry[] {
  const response = (
    content: ModelResponse['message']['content'],
    stopReason: 'stop' | 'tool_calls'
  ): ModelResponse => ({
    kind: 'response',
    message: { role: 'assistant', timestamp: 1, content },
    stopReason,
    usage: { status: 'unavailable' },
    identity: {
      provider: { status: 'unavailable' },
      model: { status: 'unavailable' },
      responseId: { status: 'unavailable' },
    },
  });
  return ['Draft\n', 'Office hours: Friday at 14:00.\n'].flatMap((content, i) => [
    response(
      [
        {
          type: 'tool_call',
          id: 'change-' + i,
          name: 'write',
          arguments: { path: 'hours.txt', content },
        },
      ],
      'tool_calls'
    ),
    response([{ type: 'text', text: 'Ready for independent review.' }], 'stop'),
  ]);
}
export async function deliveryCli(
  args: readonly string[],
  out: Writable = process.stdout
): Promise<number> {
  const emit = (value: unknown) => out.write(JSON.stringify(value) + '\n');
  if (!args.length || args.includes('--help')) {
    out.write(usage + '\n');
    return 0;
  }
  if (args[0] === 'demo') {
    const opt = options(args.slice(1), ['--directory']);
    const parent = await newPath(opt('--directory'));
    await mkdir(parent, { mode: 0o700 });
    const workspace = join(parent, 'project');
    await mkdir(workspace);
    await git(workspace, ['init', '--quiet', '--template=']);
    await writeFile(join(workspace, 'hours.txt'), 'Office hours pending.\n');
    await git(workspace, ['add', '--', 'hours.txt']);
    await git(workspace, ['commit', '--quiet', '-m', 'Original hours']);
    const spec = join(parent, 'criteria.json'),
      fixture = join(parent, 'fixture.json');
    await writeJson(spec, {
      version: 'hours-v1',
      files: ['hours.txt'],
      checks: [
        { id: 'weekday', file: 'hours.txt', kind: 'includes', value: 'Friday' },
        { id: 'time', file: 'hours.txt', kind: 'includes', value: '14:00' },
      ],
    });
    await writeJson(fixture, demoScript());
    return deliveryCli(
      [
        'run',
        '--workspace',
        workspace,
        '--state',
        join(parent, 'delivery'),
        '--task',
        'Update the posted office hours to Friday at 14:00.',
        '--criteria',
        spec,
        '--fixture',
        fixture,
      ],
      out
    );
  }
  if (args[0] === 'inspect') {
    const opt = options(args.slice(1), ['--state']),
      root = await realpath(opt('--state'));
    const meta = JSON.parse((await boundedRead(join(root, 'delivery.json'), 262144)).toString());
    if (
      typeof meta.archiveRunId !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(meta.archiveRunId)
    )
      throw Error('invalid_delivery_run_id');
    let result;
    try {
      result = JSON.parse((await boundedRead(join(root, 'result.json'), 262144)).toString());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    let status = result?.reason ?? 'interrupted_or_active';
    if (status === 'succeeded') {
      try {
        if (
          typeof result.review !== 'string' ||
          !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(result.review)
        )
          throw Error('invalid_delivery_review_id');
        const archive = join(root, 'archive', 'runs', meta.archiveRunId);
        const manifest = JSON.parse(
          (await boundedRead(join(archive, 'manifest.json'), 8192)).toString()
        );
        const events = (await boundedRead(join(archive, 'events.jsonl'), 64 * 1024 * 1024)).toString();
        verifyArchiveBytes(events, manifest);
        const records = events
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line).record);
        const handoff = records.reverse().find((record) => record.type === 'delivery.handoff');
        const verdict = records.find((record) => record.type === 'goal.verdict')?.verdict;
        if (
          manifest.run_id !== meta.archiveRunId ||
          manifest.settled_reason !== 'succeeded' ||
          verdict?.status !== 'PASS' ||
          handoff?.sha !== result.handoff.sha ||
          handoff?.tree !== result.handoff.tree ||
          handoff?.criteriaHash !== meta.criteriaHash ||
          verdict.candidateIdentity !== handoff.sha ||
          verdict.verifierIdentity !== identity([meta.criteriaHash, meta.reviewerHash]) ||
          JSON.parse(verdict.detail).dispatch !== result.review
        )
          throw Error('delivery_record_mismatch');
        const { sha, tree } = await observed(join(root, 'builder'));
        const reviewed = await observed(join(root, 'reviews', result.review));
        if (
          sha !== result.handoff.sha ||
          tree !== result.handoff.tree ||
          reviewed.sha !== sha ||
          reviewed.tree !== tree ||
          digest(await boundedRead(join(root, 'criteria.json'), 262144)) !== meta.criteriaHash ||
          (await reviewerDigest()) !== meta.reviewerHash
        )
          throw Error('binding_changed');
      } catch {
        status = 'candidate_or_evidence_changed';
      }
    }
    emit({
      status,
      metadata: meta,
      recorded: result ?? null,
      evidence: join(root, 'archive', 'runs', meta.archiveRunId, 'events.jsonl'),
      resume: 'inspect_only',
    });
    return status === 'candidate_or_evidence_changed' ? 1 : 0;
  }
  if (args[0] !== 'run') throw Error('invalid_delivery_command');
  const opt = options(args.slice(1), [
    '--task',
    '--workspace',
    '--state',
    '--criteria',
    '--fixture',
    '--attempts',
    '--for',
  ]);
  const workspace = await realpath(resolve(opt('--workspace'))),
    root = await newPath(opt('--state'));
  if ((await realpath((await git(workspace, ['rev-parse', '--show-toplevel'])).trimEnd())) !== workspace)
    throw Error('local_git_root_required');
  if (within(workspace, root) || within(root, workspace)) throw Error('delivery_state_overlap');
  const spec = await realpath(opt('--criteria')),
    fixturePath = opt('--fixture', '');
  if (within(workspace, spec) || within(root, spec)) throw Error('delivery_criteria_must_be_external');
  const bytes = await boundedRead(spec, 262144),
    criteria = parseCriteria(bytes),
    criteriaHash = digest(bytes),
    reviewerHash = await reviewerDigest();
  let fixture: FauxScriptEntry[] | undefined;
  if (fixturePath) {
    const path = await realpath(fixturePath);
    if (within(workspace, path) || within(root, path)) throw Error('delivery_fixture_must_be_external');
    fixture = JSON.parse((await boundedRead(path, 1048576)).toString());
    if (!Array.isArray(fixture) || !fixture.length) throw Error('invalid_delivery_fixture');
  }
  const settings = await loadPanSettings();
  for (const path of criteria.files) {
    const reason = protectedReason(workspace, join(workspace, path), settings?.protectedPaths ?? []);
    if (reason) throw Error('delivery_source_scope_denied:' + reason);
  }
  const attempts = opt('--attempts', '3'),
    duration = parseDuration(opt('--for', '60s')),
    task = opt('--task');
  if (!/^[1-8]$/.test(attempts) || duration > 300000 || !task.trim() || Buffer.byteLength(task) > 16384)
    throw Error('invalid_delivery_limits_or_task');
  const maxAttempts = Number(attempts),
    base = await head(workspace),
    builderDir = join(root, 'builder');
  const plan: ExecutionPlan = {
    mode: 'goal',
    objective: task,
    maxAttempts,
    durationMs: duration,
    everyMs: 5000,
    outer: { modelCalls: maxAttempts * 6, toolCalls: maxAttempts * 5 },
    criteria: { version: criteria.version, identity: identity([criteriaHash, reviewerHash]) },
  };
  await mkdir(root, { mode: 0o700 });
  const archive = await (await RunArchiveStore.open(join(root, 'archive'))).beginRun();
  const metadata = {
    version: 1,
    archiveRunId: archive.runId,
    base,
    criteriaHash,
    reviewerHash,
    maxAttempts,
    plan,
    controllerPid: process.pid,
    provider: fixture ? 'offline_fixture' : 'configured',
  };
  await writeJson(join(root, 'delivery.json'), metadata);
  await writeFile(join(root, 'criteria.json'), bytes, { flag: 'wx', mode: 0o400 });
  let chain = Promise.resolve(),
    review: string | undefined;
  const record = (event: Record<string, unknown>) => {
    const next = chain.then(async () => {
      await archive.append({ utc: new Date().toISOString(), ...event });
      if (event.type === 'delivery.review_dispatch') review = String(event.dispatch);
      emit(event);
    });
    chain = next;
    return next;
  };
  const abort = new AbortController(),
    cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const runbook = await loadRunbook(fileURLToPath(new URL('../../RUNBOOK.md', import.meta.url)));
    const runner = new DeliveryRunner({
      root,
      criteria,
      criteriaHash,
      reviewerHash,
      source: workspace,
      base,
      record,
      builder: {
        worker: {
          workspace: builderDir,
          memoryRoot: join(root, 'builder-archive'),
          limits: { maxModelTurns: 6, maxToolSteps: 5 },
          runbook,
          fixture,
          deliveryFiles: criteria.files,
        },
        durationMs: duration,
        root,
        record,
        approval: async (request) => ({ requestId: request.requestId, decision: 'deny' }),
      },
    });
    const result = await new GoalController(undefined, record).execute(plan, runner, abort.signal);
    await chain;
    await archive.settle(
      result.reason === 'succeeded'
        ? 'terminal'
        : result.reason === 'cancelled'
        ? 'cancelled'
        : 'failed',
      result.reason
    );
    await writeJson(join(root, 'result.json'), { ...result, handoff: runner.handoff, review });
    emit({ status: result.reason, state: root, candidate: runner.handoff?.sha });
    return result.reason === 'succeeded' ? 0 : 1;
  } catch (error) {
    const reason = abort.signal.aborted ? 'cancelled' : 'preparation_or_persistence_failed';
    await record({ type: 'delivery.error', reason, error: String(error) });
    await archive.settle(reason === 'cancelled' ? 'cancelled' : 'failed', reason);
    await writeJson(join(root, 'result.json'), { reason, error: String(error) });
    return 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}
