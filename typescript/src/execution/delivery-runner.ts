import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identity, type Attempt, type TaskRunner, type Verdict } from './controller.ts';
import { boundedRead, digest, type DeliveryCriteria } from './delivery-contract.ts';
import { checkout, checkTargetSpelling, git, observed } from './delivery-git.ts';
import {
  ProcessTaskRunner,
  runVerifier,
  treeManifest,
  type ProcessRunnerConfig,
} from './process-runner.ts';
import type { AccountingSink } from './admission.ts';

const reviewFile = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './delivery-review.ts' : './delivery-review.js',
    import.meta.url
  )
);
export async function reviewerDigest() {
  const names = [
    'delivery-review',
    'delivery-git',
    'delivery-contract',
    'controller',
    'process-runner',
    'verifier-executor',
  ];
  const hashes = await Promise.all(
    names.map(async (name) =>
      digest(
        await boundedRead(
          fileURLToPath(
            new URL('./' + name + (import.meta.url.endsWith('.ts') ? '.ts' : '.js'), import.meta.url)
          ),
          262144
        )
      )
    )
  );
  return identity(hashes);
}
export interface DeliveryBinding {
  sha: string;
  tree: string;
  attemptId: string;
  builderPid: number;
}
interface Options {
  root: string;
  criteria: DeliveryCriteria;
  criteriaHash: string;
  reviewerHash: string;
  source: string;
  base: string;
  builder: ProcessRunnerConfig;
  record: AccountingSink;
}
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
export function checkReport(
  raw: string,
  expected: { dispatch: string; candidate: string; tree: string; criteriaHash: string; pid: number },
  ids: string[],
  code: number | null
) {
  const report = JSON.parse(raw);
  for (const [key, value] of Object.entries(expected))
    if (report?.[key] !== value) throw Error('review_binding_mismatch');
  if (!Array.isArray(report.checks) || report.checks.length !== ids.length)
    throw Error('missing_review_checks');
  for (const [i, entry] of report.checks.entries()) {
    if (
      !entry ||
      entry.id !== ids[i] ||
      typeof entry.pass !== 'boolean' ||
      !(
        (typeof entry.actualSha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.actualSha256)) ||
        (entry.reason === 'missing_file' && !entry.pass)
      )
    )
      throw Error('invalid_review_check');
  }
  const passed = report.checks.every((check: { pass: boolean }) => check.pass);
  if (code !== (passed ? 0 : 1)) throw Error('review_exit_disagrees');
  return { passed, checks: report.checks as { id: string; pass: boolean }[] };
}

export class DeliveryRunner implements TaskRunner {
  private readonly options: Options;
  private readonly worker: ProcessTaskRunner;
  private builderPid?: number;
  private count = 0;
  private reviewing?: Promise<Verdict>;
  private confirmed = true;
  private verifiedCheckout?: string;
  handoff?: DeliveryBinding;
  constructor(options: Options) {
    this.options = options;
    this.worker = new ProcessTaskRunner({
      ...options.builder,
      record: async (event) => {
        if (event.type === 'worker_identity') this.builderPid = Number(event.workerPid);
        await options.record({ ...event, channel: 'builder' });
      },
    });
  }
  async run(input: Parameters<TaskRunner['run']>[0]): Promise<Attempt> {
    const { root, criteria, record } = this.options;
    this.count++;
    const dir = join(root, 'builder');
    if (this.count === 1) {
      await record({ type: 'delivery.prepare', base: this.options.base, source: this.options.source });
      await checkout(this.options.source, dir, this.options.base, input.signal);
      await checkTargetSpelling(dir, criteria.files);
      for (const file of criteria.files) await boundedRead(join(dir, file), 131072);
    }
    await observed(dir, input.signal);
    const prior = await treeManifest(dir, true);
    const result = await this.worker.run({
      ...input,
      task: input.task + '\nAuthorized paths and required checks:\n' + JSON.stringify(criteria),
    });
    input.signal.throwIfAborted();
    if (result.status !== 'completed') return { status: result.status, reason: result.reason };
    if (!this.builderPid) throw Error('missing_builder_identity');
    const next = await treeManifest(dir, true);
    const allowed = new Set(criteria.files);
    if (
      identity(prior.filter((f) => !allowed.has(f.path))) !==
      identity(next.filter((f) => !allowed.has(f.path)))
    )
      throw Error('delivery_scope_changed');
    const changed = next
      .filter((file) => prior.find((old) => old.path === file.path)?.sha256 !== file.sha256)
      .map((file) => file.path);
    if (!changed.length) throw Error('builder_produced_no_candidate');
    await record({ type: 'delivery.commit_intent', attemptId: input.attemptId, files: changed });
    await git(dir, ['add', '-f', '--', ...changed], input.signal);
    await git(
      dir,
      ['commit', '--quiet', '--no-gpg-sign', '-m', 'Local delivery attempt ' + this.count],
      input.signal
    );
    const { sha, tree } = await observed(dir, input.signal);
    this.handoff = { sha, tree, attemptId: input.attemptId, builderPid: this.builderPid };
    await record({ type: 'delivery.handoff', ...this.handoff, criteriaHash: this.options.criteriaHash });
    return {
      status: 'completed',
      reason: 'handoff',
      candidate: { identity: sha, tree, attemptId: input.attemptId },
    };
  }
  verify(attempt: Attempt, signal: AbortSignal): Promise<Verdict> {
    this.reviewing = this.review(attempt, signal);
    return this.reviewing;
  }
  private async review(attempt: Attempt, signal: AbortSignal): Promise<Verdict> {
    const { root, criteria, criteriaHash, reviewerHash, record } = this.options;
    const current = this.handoff;
    if (
      !current ||
      attempt.candidate?.identity !== current.sha ||
      attempt.candidate.tree !== current.tree ||
      attempt.candidate.attemptId !== current.attemptId
    )
      throw Error('stale_delivery_handoff');
    const dir = join(root, 'builder'),
      spec = join(root, 'criteria.json');
    const assertCurrent = async () => {
      const state = await observed(dir, signal);
      if (this.handoff !== current || state.sha !== current.sha || state.tree !== current.tree)
        throw Error('delivery_candidate_changed');
      if (
        digest(await boundedRead(spec, 262144)) !== criteriaHash ||
        (await reviewerDigest()) !== reviewerHash
      )
        throw Error('delivery_oracle_changed');
    };
    await assertCurrent();
    const dispatch = randomUUID(),
      reviewDir = join(root, 'reviews', dispatch);
    await mkdir(join(root, 'reviews'), { recursive: true });
    await record({
      type: 'delivery.review_dispatch',
      dispatch,
      candidate: current.sha,
      tree: current.tree,
      criteriaHash,
      reviewerHash,
      checkout: reviewDir,
    });
    await checkout(dir, reviewDir, current.sha, signal);
    let pid: number | undefined;
    // Only package-selected code and quoted positional data enter the existing verifier. The candidate contributes no command.
    const command =
      'exec ' +
      [process.execPath, reviewFile, spec, criteriaHash, current.sha, current.tree, dispatch]
        .map(quote)
        .join(' ');
    const result = await runVerifier(command, reviewDir, 25, signal, async (event) => {
      if (event.type === 'verifier.owned') pid = Number(event.pid);
      if (event.type === 'verifier.stop' && event.confirmed !== true) this.confirmed = false;
      await record({ ...event, dispatch, channel: 'reviewer' });
    });
    await record({
      type: 'delivery.review_output',
      dispatch,
      pid,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    if (!pid || pid === current.builderPid) throw Error('reviewer_identity_unknown');
    const verified = checkReport(
      result.stdout,
      { dispatch, pid, candidate: current.sha, tree: current.tree, criteriaHash },
      criteria.checks.map((check) => check.id),
      result.code
    );
    const reviewed = await observed(reviewDir, signal);
    if (reviewed.sha !== current.sha || reviewed.tree !== current.tree)
      throw Error('changed_review_checkout');
    await assertCurrent();
    if (verified.passed) this.verifiedCheckout = reviewDir;
    return {
      status: verified.passed ? 'PASS' : 'FAIL',
      candidateIdentity: current.sha,
      criteriaVersion: criteria.version,
      verifierIdentity: identity([criteriaHash, reviewerHash]),
      detail: JSON.stringify({ dispatch, checks: verified.checks }),
    };
  }
  reconcile() {
    return this.worker.reconcile();
  }
  async stop(reason: string) {
    const worker = this.worker.stop(reason);
    await this.reviewing?.catch(() => {});
    return (await worker) && this.confirmed;
  }
  async preserve() {
    await this.worker.preserve();
    if (!this.verifiedCheckout || !this.handoff) return;
    // Recheck both trees after the builder is confirmed stopped, before publishing the terminal record.
    for (const path of [join(this.options.root, 'builder'), this.verifiedCheckout]) {
      const state = await observed(path);
      if (state.sha !== this.handoff.sha || state.tree !== this.handoff.tree)
        throw Error('delivery_candidate_changed_before_settlement');
    }
    if (
      digest(await boundedRead(join(this.options.root, 'criteria.json'), 262144)) !==
        this.options.criteriaHash ||
      (await reviewerDigest()) !== this.options.reviewerHash
    )
      throw Error('delivery_oracle_changed_before_settlement');
  }
}
