// Test-only peer. The installed client supplies no environment or special fixture hooks.
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const [mode, log, reportPath] = process.argv.slice(2);
const write = event => appendFileSync(log, JSON.stringify(event) + "\n");
const previous = existsSync(log);
write({pid: process.pid, env: Object.keys(process.env), cwd: process.cwd()});
const input = createInterface({input: process.stdin, crlfDelay: Infinity});
for await (const line of input) {
  const message = JSON.parse(line);
  write({fromClient: line});
  const {method, id} = message;
  if (method === "notifications/cancelled") continue;
  let result;
  let error;
  if (mode === "unavailable" && previous && method === "server/discover") process.exit(0);
  if (method === "server/discover") result = {supportedVersions: [mode === "legacy" ? "2025-11-25" : "2026-07-28"], capabilities: {tools: {}}};
  if (method === "tools/list") {
    const tool = name => ({name, annotations: {readOnlyHint: true}, inputSchema: {type: "object"}});
    if (mode === "unsupported") result = {tools: [{...tool("summary"), inputSchema: {type: "object", required: ["path"]}}]};
    else if (mode === "contradiction") result = {tools: [{...tool("summary"), annotations: {readOnlyHint: false}}]};
    else if (mode === "duplicate") result = {tools: [tool("summary"), tool("summary")]};
    else result = message.params.cursor ? {tools: [tool("summary")]} : {tools: [tool("denied")], nextCursor: "second-page"};
  }
  if (method === "tools/call") {
    if (mode === "exit") process.exit(0);
    if (mode === "stall") {
      process.on("SIGTERM", () => {});
      setInterval(() => {}, 30000);
      continue;
    }
    if (mode === "oversize") { process.stdout.write(" ".repeat(256 * 1024 + 1)); continue; }
    if (mode === "malformed") { process.stdout.write("{bad json}\n"); continue; }
    if (mode === "rpc") error = {code: -32602, message: "test RPC error"};
    result = {content: [{type: "text", text: "完成"}], structuredContent: {jobs: 2}};
    if (mode === "report") result = {content: [], structuredContent: JSON.parse(readFileSync(reportPath, "utf8"))};
    if (mode === "content") result = {content: [{type: "audio"}]};
    if (mode === "tool-error") result.isError = true;
    if (mode === "structured") result = {content: [], structuredContent: null};
    if (mode === "missing") delete result.content;
  }
  if (method === "server/discover" || method === "tools/list") Object.assign(result, {ttlMs: 0, cacheScope: "public"});
  const resultType = mode === "input-required" && method === "tools/call" ? "input_required" : "complete";
  const answer = JSON.stringify({jsonrpc: "2.0", id: mode === "id" && method === "tools/call" ? id + 1 : id,
    ...(error ? {error} : {result: {resultType, ...result}})});
  write({fromPeer: answer});
  // Split at a byte boundary inside a multibyte UTF-8 code point on success.
  const bytes = Buffer.from(answer + "\n");
  const split = bytes.indexOf(Buffer.from("完")) + 1;
  process.stdout.write(bytes.subarray(0, split));
  setImmediate(() => process.stdout.write(bytes.subarray(split)));
}
