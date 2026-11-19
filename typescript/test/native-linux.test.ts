import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { JsonObject } from "../src/protocol/canonical-protocol.ts";
import { SessionAuthorization } from "../src/runtime/authorization.ts";
import {
  compileLinuxProtectedPaths,
  NativeLinuxSandbox,
} from "../src/sandbox/native/linux.ts";

const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("Linux policy compilation maps every accepted configured root and rejects ambiguous metadata", async () => {
  const base = fs.realpathSync(
    fs.mkdtempSync(join(tmpdir(), "pan-linux-policy-")),
  );
  try {
    const workspace = join(base, "project"),
      outside = join(base, "outside");
    fs.mkdirSync(workspace);
    fs.mkdirSync(outside);
    fs.mkdirSync(join(workspace, "existing"));
    fs.closeSync(fs.openSync(join(workspace, "empty-file"), "wx"));
    fs.symlinkSync(join(workspace, "existing"), join(base, "alias"));
    fs.symlinkSync("existing", join(workspace, "alias"));
    fs.symlinkSync("missing", join(workspace, "dangling"));
    fs.linkSync(join(workspace, "empty-file"), join(workspace, "hardlink"));

    const inputs = [
      "existing",
      join(workspace, "existing", "future", "deep"),
      "future-root/leaf",
      "./literal space/next",
    ];
    const rules = compileLinuxProtectedPaths(workspace, inputs, []);
    assert.deepEqual(rules.child, [
      "existing",
      "existing/future/deep",
      "future-root/leaf",
      "literal space/next",
    ]);
    assert.deepEqual(
      rules.host,
      rules.child.map((rule) => join(workspace, rule)),
    );
    assert.equal(rules.child.length, inputs.length);
    for (const root of [
      outside,
      join(outside, "future"),
      join(base, "alias"),
      join(base, "alias", "future"),
      workspace,
      "alias",
      "alias/future",
      "dangling/future",
      "hardlink",
      "empty-file/future",
      "alias/../existing",
    ]) {
      assert.throws(
        () => compileLinuxProtectedPaths(workspace, [...inputs, root], []),
        /native_sandbox_protected_path_(scope|alias)/,
      );
    }
    assert.throws(
      () =>
        compileLinuxProtectedPaths(
          workspace,
          ["existing/future"],
          [join(workspace, "existing")],
        ),
      /nested mount/,
    );
    if (process.platform === "linux" && process.arch === "x64") {
      const stateRoot = join(base, "unused-state");
      const sandbox = new NativeLinuxSandbox({
        workspace,
        stateRoot,
        protectedPaths: [join(base, "alias", "future")],
      });
      await assert.rejects(
        sandbox.start("metadata"),
        /native_sandbox_protected_path_scope/,
      );
      assert.equal(fs.existsSync(stateRoot), false);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test(
  "Linux native admission and live workspace use a real OS boundary or report unavailability",
  { timeout: 45000 },
  async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(join(tmpdir(), "pan-linux-native-")),
    );
    const workspace = join(dir, "work"),
      stateRoot = join(dir, "state");
    fs.mkdirSync(workspace);
    const box = new NativeLinuxSandbox({
      workspace,
      stateRoot,
      protectedPaths: ["private/config"],
    });
    const auth = new SessionAuthorization({
      approval: async (r) => ({
        requestId: r.requestId,
        decision: "allow-once",
      }),
    });
    let sequence = 0;
    const run = (
      name: string,
      args: JsonObject,
      signal = new AbortController().signal,
    ) =>
      auth
        .wrap(box.tools.find((tool) => tool.name === name)!, () => "run")
        .execute({ toolCallId: "call" + ++sequence, arguments: args, signal });
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.end("listener-controlled");
    });
    try {
      try {
        await box.start("run");
        const configured = JSON.parse(
          fs.readFileSync(join(stateRoot, "run", "policy.json"), "utf8"),
        ).protected;
        assert.deepEqual(configured, ["private/config"]);
        assert.deepEqual(
          box.identity.protectedRoots,
          configured.map((entry: string) => join(workspace, entry)),
        );
      } catch (error) {
        if (process.env.PAN_REQUIRE_NATIVE_LINUX === "1") throw error;
        assert.match(String(error), /native_sandbox_linux_unavailable/);
        assert.equal(
          (await run("bash", { command: "echo BAD > unavailable" })).isError,
          true,
        );
        assert.equal(fs.existsSync(join(workspace, "unavailable")), false);
        console.log(
          "Linux native unavailable on this runner; fail-closed path observed:",
          String(error),
        );
        return;
      }
      assert.equal(
        (await run("write", { path: "source", content: "before" })).isError,
        false,
      );
      assert.equal(
        (
          await run("edit", {
            path: "source",
            edits: [{ oldText: "before", newText: "after" }],
          })
        ).isError,
        false,
      );
      const useful = await run("bash", {
        command:
          'test "$(cat source)" = after && mkdir output && echo old > output/result && node -p "21*2" > output/tmp && mv -f output/tmp output/result && touch disposable && rm disposable && printf temp > "$TMPDIR/data"',
      });
      assert.equal(useful.isError, false, JSON.stringify(useful));
      assert.equal(
        (useful.details as JsonObject).executionMode,
        "native-linux-offline",
      );
      assert.deepEqual((await run("read", { path: "output/result" })).content, [
        { type: "text", text: "42\n" },
      ]);
      assert.equal(
        fs.readFileSync(join(String(box.identity.temporary), "data"), "utf8"),
        "temp",
      );

      const content = "SYNTHETIC_PRIVATE_FIXTURE",
        outside = join(dir, "outside");
      const protectedFiles = [
        ".env",
        ".ENV.local",
        ".npmrc",
        ".git/config",
        ".ssh/example",
        "nested/private.KEY",
        "private/config/setting",
      ];
      for (const name of protectedFiles) {
        fs.mkdirSync(join(workspace, name, ".."), { recursive: true });
        fs.writeFileSync(join(workspace, name), content);
      }
      fs.writeFileSync(outside, content);
      fs.symlinkSync(".env", join(workspace, "env-alias"));
      fs.symlinkSync(outside, join(workspace, "outside-alias"));
      fs.linkSync(outside, join(workspace, "hard-alias"));
      const hash = (path: string) =>
        createHash("sha256").update(fs.readFileSync(path)).digest("hex");
      const resources = [
        outside,
        ...protectedFiles.map((name) => join(workspace, name)),
      ];
      const before = resources.map(hash);
      const denied = [
        ...protectedFiles,
        outside,
        "../outside",
        "env-alias",
        "outside-alias",
        "hard-alias",
      ];
      for (const path of denied) {
        for (const [tool, args] of [
          ["read", { path }],
          ["write", { path, content: "changed" }],
        ] as const) {
          const r = await run(tool, args);
          assert.equal(r.isError, true, path + " " + tool);
          assert.doesNotMatch(JSON.stringify(r), /SYNTHETIC_PRIVATE_FIXTURE/);
        }
      }
      // Run each operation in a separate ordinary child and retain its exit status.
      const operations = denied.map(
        (path) =>
          `if /bin/sh -c ${quote("cat " + quote(path))} || /bin/sh -c ${quote("printf changed > " + quote(path))}; then exit 19; fi`,
      );
      operations.push(
        "if printf BAD > .env.future; then exit 20; fi",
        "if mv source .SSH; then exit 21; fi",
        "echo ALL_DENIED",
      );
      const result = await run("bash", { command: operations.join("\n") });
      assert.equal(result.isError, false, JSON.stringify(result));
      assert.match(JSON.stringify(result.content), /ALL_DENIED/);
      assert.doesNotMatch(
        JSON.stringify(result.content),
        /SYNTHETIC_PRIVATE_FIXTURE/,
      );
      const after = resources.map(hash);
      assert.deepEqual(after, before);
      console.log(
        JSON.stringify({
          operation: "synthetic access controls",
          protectedFiles,
          hostToolDenials: denied.length * 2,
          childReadWriteDenials: denied.length * 2,
          before,
          after,
          childStatus: (result.details as JsonObject).status,
        }),
      );
      assert.equal(fs.existsSync(join(workspace, ".env.future")), false);
      assert.equal(fs.readFileSync(join(workspace, "source"), "utf8"), "after");

      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const hostControl = await new Promise<string>((resolve, reject) => {
        const sock = connect(address.port, "127.0.0.1");
        let body = "";
        sock.on("data", (chunk) => (body += chunk));
        sock.on("end", () => resolve(body));
        sock.on("error", reject);
      });
      assert.equal(hostControl, "listener-controlled");
      fs.writeFileSync(
        join(workspace, "regular-script"),
        "#!/bin/sh\necho OK-SCRIPT\n",
        { mode: 0o700 },
      );
      fs.writeFileSync(
        join(workspace, ".env.script"),
        "#!/bin/sh\necho forbidden > exec-marker\n",
        { mode: 0o700 },
      );
      const execution = await run("bash", {
        command: "./regular-script && ! ./.env.script",
      });
      assert.equal(execution.isError, false, JSON.stringify(execution));
      assert.match(JSON.stringify(execution.content), /OK-SCRIPT/);
      assert.equal(fs.existsSync(join(workspace, "exec-marker")), false);
      const fd = fs.openSync(outside, "r");
      const envKey = "PAN173_SYNTHETIC_PARENT_ONLY";
      const old = process.env[envKey];
      process.env[envKey] = "SYNTHETIC_ENV_VALUE";
      try {
        const probe = `const fs=require('node:fs'),net=require('node:net');if(process.env.${envKey})process.exit(2);try{if(fs.fstatSync(${fd}).isFile()&&fs.readFileSync(${fd},'utf8').includes('SYNTHETIC_PRIVATE_FIXTURE'))process.exit(3)}catch{};const s=net.connect(${address.port},'127.0.0.1');s.on('connect',()=>process.exit(4));s.on('error',e=>{console.log('NETWORK_DENIED',e.code);process.exit(0)});setTimeout(()=>process.exit(5),1500);`;
        const r = await run("bash", { command: "node -e " + quote(probe) });
        assert.equal(r.isError, false, JSON.stringify(r));
        assert.match(JSON.stringify(r.content), /NETWORK_DENIED/);
        assert.equal(connections, 1);
        console.log(
          JSON.stringify({
            operation: "offline listener",
            hostControl,
            connections,
            child: r.content,
          }),
        );
      } finally {
        fs.closeSync(fd);
        if (old === undefined) delete process.env[envKey];
        else process.env[envKey] = old;
      }
      const controller = new AbortController();
      const pending = run(
        "bash",
        {
          command: "(sleep 1; echo late > delayed) & echo yes > started; wait",
        },
        controller.signal,
      );
      for (
        let attempts = 0;
        attempts < 80 && !fs.existsSync(join(workspace, "started"));
        attempts++
      )
        await pause(25);
      assert.ok(fs.existsSync(join(workspace, "started")));
      controller.abort();
      assert.equal(((await pending).details as JsonObject).status, "cancelled");
      await pause(1050);
      assert.equal(fs.existsSync(join(workspace, "delayed")), false);
      const temp = String(box.identity.temporary);
      await box.stop("done");
      assert.equal(fs.existsSync(temp), false);
      console.log(
        "Linux native real host: live edit, atomic replacement and typed readback, project/temp writes, protected executable denied after ordinary script worked, environment/fd isolation, controlled cancellation and temp teardown",
      );
    } finally {
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      await box.stop("done");
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
