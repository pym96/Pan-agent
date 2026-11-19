import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [cli, output] = process.argv.slice(2);
mkdirSync(output);
const home = join(output, "home");
const workspace = join(output, "workspace");
const policy = join(home, ".pan-agent");
const config = join(policy, "mcp-reports.json");
const peer = fileURLToPath(new URL("./mcp-report-peer.mjs", import.meta.url));
mkdirSync(policy, {recursive: true, mode: 0o700});
mkdirSync(workspace);
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args], {cwd: workspace,
    env: {...process.env, HOME: home, MCP_SYNTHETIC_SECRET: "test-only"}, encoding: "utf8", timeout: 8000});
  if (result.error) throw result.error;
  return result;
};
const policyData = (mode, log) => JSON.stringify({servers: [{name: "reports", command: process.execPath,
  args: [peer, mode, log], tools: ["summary"]}]});
const marker = join(output, "no-authority.jsonl");
const project = join(workspace, ".pan-agent");
mkdirSync(project);
const projectConfig = join(project, "mcp-reports.json");
writeFileSync(projectConfig, policyData("ok", marker));
assert.equal(run("--help").status, 0);
assert.equal(run().status, 2);
assert.equal(run("mcp", "call", "reports", "summary").status, 2);
symlinkSync(projectConfig, config);
assert.equal(run("mcp", "call", "reports", "summary").status, 2);
unlinkSync(config);
writeFileSync(config, policyData("ok", marker), {mode: 0o600});
assert.equal(run("mcp", "call", "absent", "summary").status, 2);
assert.equal(run("mcp", "call", "reports", "denied").status, 2);
assert.equal(existsSync(marker), false);

const configPrint = run("mcp", "example-config");
assert.equal(configPrint.status, 0);
writeFileSync(config, configPrint.stdout);
const demo = run("mcp", "call", "example", "run_summary");
assert.equal(demo.status, 0, demo.stdout);
assert.deepEqual(JSON.parse(demo.stdout).result.structuredContent, {run: "sample-001", completed: 3, failed: 0});
const results = [];
for (const [mode, diagnostic] of [
  ["list", null], ["ok", null], ["structured", null], ["id", "invalid response envelope or ID"],
  ["legacy", "unsupported server revision"], ["rpc", "MCP RPC -32602"], ["tool-error", "MCP tool execution error"],
  ["input-required", "unsupported resultType"], ["content", "unsupported tool content"], ["missing", "invalid tool result"],
  ["exit", "exited before"], ["oversize", "frame limit"], ["malformed", "invalid UTF-8 or JSON"], ["stall", "timeout"],
]) {
  const log = join(output, mode + ".jsonl");
  writeFileSync(config, policyData(mode, log));
  const started = Date.now();
  const result = mode === "list" ? run("mcp", "list", "reports") : run("mcp", "call", "reports", "summary");
  const elapsed = Date.now() - started;
  const events = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const [launch] = events;
  assert.deepEqual(launch.env.filter(name => process.platform !== "darwin" || name !== "__CF_USER_TEXT_ENCODING"), []);
  assert.equal(launch.cwd, realpathSync(policy));
  assert.throws(() => process.kill(launch.pid, 0), {code: "ESRCH"});
  const wire = events.filter(event => event.fromClient).map(event => JSON.parse(event.fromClient));
  const messages = wire.filter(message => message.method !== "notifications/cancelled");
  const expected = ["server/discover"];
  if (mode !== "legacy") expected.push("tools/list", "tools/list");
  if (!["legacy", "list"].includes(mode)) expected.push("tools/call");
  assert.deepEqual(messages.map(message => message.method), expected);
  assert.equal(new Set(messages.map(message => message.id)).size, expected.length);
  for (const message of messages) {
    assert.equal(message.jsonrpc, "2.0");
    const meta = message.params._meta;
    assert.equal(meta["io.modelcontextprotocol/protocolVersion"], "2026-07-28");
    assert.deepEqual(meta["io.modelcontextprotocol/clientCapabilities"], {});
    assert.ok(meta["io.modelcontextprotocol/clientInfo"].name && meta["io.modelcontextprotocol/clientInfo"].version);
    if (message.method === "tools/call") {
      assert.equal(message.params.name, "summary");
      assert.deepEqual(message.params.arguments, {});
    }
  }
  if (diagnostic) {
    assert.equal(result.status, 2, result.stdout);
    assert.ok(result.stdout.includes(diagnostic), result.stdout);
  } else {
    assert.equal(result.status, 0, result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.deepEqual(parsed.tools, ["summary"]);
    if (mode === "ok") assert.deepEqual(parsed.result, {content: [{type: "text", text: "完成"}], structuredContent: {jobs: 2}});
    if (mode === "structured") assert.deepEqual(parsed.result, {content: [], structuredContent: null});
  }
  if (mode === "stall") assert.equal(wire.at(-1).params.requestId, messages.at(-1).id);
  results.push({mode, elapsed, code: result.status, output: result.stdout.trim()});
}
writeFileSync(join(output, "summary.json"), JSON.stringify({status: "PASS", demo: JSON.parse(demo.stdout), results}, null, 2) + "\n");
