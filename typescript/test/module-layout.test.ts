// The original #41 relocation/graph tests run unchanged at their accepted SHA
// through scripts/history-replay/run.py layout41. They do not describe today's
// expanded Product graph. Keep this locator for historical design links and
// check the replay inputs that are part of the current checkout.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";

const history = fileURLToPath(new URL("../../scripts/history-replay/", import.meta.url));

test("historical replay manifest pins full revisions and intact local criteria snapshots", async () => {
  const manifest = JSON.parse(await readFile(join(history, "manifest.json"), "utf8"));
  assert.equal(manifest.schema, "pan-historical-assertions/v1");
  assert.ok(Object.keys(manifest.proofs).length > 0, "empty historical inventory");
  for (const proof of Object.values(manifest.proofs) as Array<{
    source_sha: string; required_git: string[]; test_file: string;
    files: Record<string, string>; criteria: Array<{file: string; sha256: string; url: string}>;
  }>) {
    for (const revision of [proof.source_sha, ...proof.required_git]) {
      assert.match(revision, /^[0-9a-f]{40}$/, "mutable or abbreviated historical revision");
    }
    assert.ok(proof.files[proof.test_file], "original test must be content-pinned");
    for (const hash of Object.values(proof.files)) assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(proof.criteria.length > 0, "missing original criteria");
    for (const criterion of proof.criteria) {
      assert.match(criterion.file, /^criteria\/[^/]+\.md$/);
      assert.match(criterion.url, /^https:\/\/github\.com\/pym96\/Pan-agent\/issues\/\d+(#issuecomment-\d+)?$/);
      assert.equal(createHash("sha256").update(await readFile(join(history, criterion.file))).digest("hex"), criterion.sha256);
    }
  }
});
