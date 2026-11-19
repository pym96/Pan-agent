// Installed synthetic report peer. No files, credentials or network needed.
import { createInterface } from "node:readline";

const report = {run: "sample-001", completed: 3, failed: 0};
for await (const line of createInterface({input: process.stdin, crlfDelay: Infinity})) {
  const {id, method, params} = JSON.parse(line);
  if (method === "notifications/cancelled") continue;
  let result;
  let error;
  if (params?._meta?.["io.modelcontextprotocol/protocolVersion"] !== "2026-07-28")
    error = {code: -32022, message: "Unsupported protocol version", data: {supported: ["2026-07-28"]}};
  else if (method === "server/discover")
    result = {supportedVersions: ["2026-07-28"], capabilities: {tools: {}},
      _meta: {"io.modelcontextprotocol/serverInfo": {name: "synthetic-report", version: "1.0.0"}}};
  else if (method === "tools/list")
    result = {tools: [{name: "run_summary", inputSchema: {type: "object", additionalProperties: false}}]};
  else if (method === "tools/call" && params.name === "run_summary" && Object.keys(params.arguments).length === 0)
    result = {content: [{type: "text", text: "Synthetic run sample-001"}], structuredContent: report};
  else error = {code: -32601, message: "Unknown method or tool"};
  process.stdout.write(JSON.stringify({jsonrpc: "2.0", id, ...(error ? {error} : {result: {resultType: "complete", ...result}})}) + "\n");
}
