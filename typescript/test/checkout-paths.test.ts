import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Copy the actual affected fixtures and Runtime bytes, rather than testing URL
// decoding in isolation. Explicit filenames prevent recursive self-invocation.
const source = fileURLToPath(new URL("../", import.meta.url));
const fixtures = ["kimi-adapter.test.ts", "kimi-k3.test.ts", "kimi-continuation-94.test.ts"];
const cases = ["ascii", "中文", "with space", "percent%", "hash#", "literal%20", "中文 space %# literal%20"];
for (const name of cases) {
  test(`checkout paths: actual Kimi fixtures in ${name}`, async (t) => {
    const owned = await mkdtemp(join(tmpdir(), "pan-checkout-path-"));
    try {
      const repo = join(owned, name);
      const ts = join(repo, "typescript");
      await mkdir(join(ts, "test"), { recursive: true });
      await mkdir(join(repo, "tmp"), { recursive: true });
      await cp(join(source, "src"), join(ts, "src"), { recursive: true });
      for (const file of ["package.json", "RUNBOOK.md"]) await cp(join(source, file), join(ts, file));
      for (const file of fixtures) await cp(join(source, "test", file), join(ts, "test", file));
      await cp(new URL("../../scripts/fixtures/kimi/", import.meta.url), join(repo, "scripts/fixtures/kimi"), { recursive: true });
      const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: join(repo, "tmp"), TMP: join(repo, "tmp"), TEMP: join(repo, "tmp") };
      delete env.PAN_TEST_ENTRY;
      // A nested Node test runner must not inherit its parent IPC test context.
      delete env.NODE_TEST_CONTEXT;
      const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ["--experimental-strip-types", "--test", "--test-reporter=tap", ...fixtures.map(file => join(ts, "test", file))], {
          cwd: ts, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "", stderr = "", failure: Error | undefined;
        const stop = (error: Error) => {
          failure ??= error;
          if (child.pid) {
            try { process.kill(-child.pid, "SIGKILL"); } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure = error as Error;
            }
          }
        };
        const timer = setTimeout(() => stop(new Error("nested fixture deadline exceeded")), 20_000);
        child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
        child.stdout.on("data", data => { stdout += data; if (stdout.length > 4 * 1024 * 1024) stop(new Error("nested stdout limit")); });
        child.stderr.on("data", data => { stderr += data; if (stderr.length > 4 * 1024 * 1024) stop(new Error("nested stderr limit")); });
        child.on("error", error => { failure = error; });
        child.on("close", status => {
          clearTimeout(timer);
          if (failure) reject(failure); else resolve({ status, stdout, stderr });
        });
      });
      assert.equal(result.status, 0, `affected fixtures failed in ${repo}\n${result.stdout}\n${result.stderr}`);
      const counts = Object.fromEntries([...result.stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map(match => [match[1], Number(match[2])]));
      assert.ok(counts.tests > 0, "missing nested test collection");
      assert.equal(counts.pass, counts.tests);
      for (const key of ["fail", "cancelled", "skipped", "todo"]) assert.equal(counts[key], 0, key);
      t.diagnostic(JSON.stringify({ path: name, ...counts }));
    } finally {
      await rm(owned, { recursive: true, force: true });
    }
  });
}
