#!/usr/bin/env node
/** Executed inside a private fixture where Bubblewrap is absent or user namespaces are disabled. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
const [pkg, output] = process.argv.slice(2);
if (process.platform !== "linux" || !pkg || !output)
  throw Error("requires Linux, installed package path and new fixture path");
const root = path.resolve(output);
fs.mkdirSync(root, { mode: 0o700 });
const work = path.join(root, "work"),
  home = path.join(root, "home"),
  archives = path.join(root, "archives");
fs.mkdirSync(work, { mode: 0o700 });
fs.mkdirSync(home, { mode: 0o700 });
const { runCli, FauxModelAdapter } = await import(
  pathToFileURL(path.resolve(pkg, "dist/index.js"))
);
const adapter = new FauxModelAdapter([]);
let entered = false;
const code = await runCli(
  [
    "--kernel",
    "native",
    "--native-sandbox",
    "--workspace",
    work,
    "--memory-root",
    archives,
  ],
  {
    home,
    output: new PassThrough(),
    createNativeAdapter: () => adapter,
    startTui: async (options) => {
      entered = true;
      assert.equal(options.executionMode, "native-linux-offline");
      let diagnostic;
      try {
        await options.session.runTask("Write a marker file in the workspace");
      } catch (error) {
        diagnostic = String(error);
      }
      assert.match(diagnostic, /native_sandbox_linux_unavailable/);
      assert.equal(adapter.state.exchangeCount, 0);
      assert.deepEqual(fs.readdirSync(work), []);
      const runs = await options.archiveStore.listRuns();
      assert.equal(runs.length, 1);
      const archive = await options.archiveStore.readArchive(runs[0].runId);
      assert.equal(
        archive.some(
          (event) =>
            event.type === "execution.boundary" ||
            event.type === "tool.settled",
        ),
        false,
      );
      const taskState = path.join(archives, "native-sandbox", runs[0].runId);
      assert.equal(fs.existsSync(path.join(taskState, "temporary")), false);
      fs.writeFileSync(
        path.join(root, "archive.json"),
        JSON.stringify(archive, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          diagnostic,
          modelCalls: adapter.state.exchangeCount,
          workspace: fs.readdirSync(work),
          temporaryRemoved: true,
        }),
      );
      await options.session.close();
      return 0;
    },
  },
);

assert.equal(code, 0);
assert.equal(entered, true);
