/** Installed independent reviewer. No candidate modules are loaded, and criteria cannot name commands. */
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { boundedRead, digest, parseCriteria, parseExactJson } from './delivery-contract.ts';
import { observed } from './delivery-git.ts';

async function review() {
  const [file, criteriaHash, candidate, tree, dispatch] = process.argv.slice(2);
  if (!file || !dispatch) throw Error('review_dispatch_required');
  const bytes = await boundedRead(file, 262144);
  if (digest(bytes) !== criteriaHash) throw Error('changed_review_criteria');
  const criteria = parseCriteria(bytes);
  const before = await observed(process.cwd());
  if (before.sha !== candidate || before.tree !== tree) throw Error('stale_review_checkout');
  const checks = [];
  for (const check of criteria.checks) {
    let actual: Buffer;
    try {
      actual = await boundedRead(join(process.cwd(), check.file), 131072);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      checks.push({ id: check.id, pass: false, reason: 'missing_file' });
      continue;
    }
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(actual);
    let pass: boolean;
    switch (check.kind) {
      case 'equals':
        pass = text === check.value;
        break;
      case 'includes':
        pass = text.includes(check.value);
        break;
      case 'excludes':
        pass = !text.includes(check.value);
        break;
      case 'json-equals':
        try {
          pass = isDeepStrictEqual(parseExactJson(text), parseExactJson(check.value));
        } catch {
          pass = false;
        }
        break;
    }
    checks.push({ id: check.id, pass, actualSha256: digest(actual) });
  }
  const after = await observed(process.cwd());
  if (after.sha !== candidate || after.tree !== tree) throw Error('review_checkout_changed');
  process.stdout.write(
    JSON.stringify({ dispatch, pid: process.pid, candidate, tree, criteriaHash, checks }) + '\n'
  );
  process.exitCode = checks.every((check) => check.pass) ? 0 : 1;
}
review().catch((error) => {
  process.stderr.write(String(error) + '\n');
  process.exitCode = 2;
});
