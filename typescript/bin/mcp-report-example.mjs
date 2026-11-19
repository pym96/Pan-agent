// Installed synthetic report peer. No files, credentials or network needed.
import { createInterface } from "node:readline";

const revision = "2026-07-28";
const cacheHints = {ttlMs: 0, cacheScope: "public"};
const serverMeta = {"io.modelcontextprotocol/serverInfo": {name: "synthetic-report", version: "1.0.0"}};
const report = {run: "sample-001", completed: 3, failed: 0};
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const complete = fields => ({result: {resultType: "complete", _meta: serverMeta, ...fields}});
const invalidParams = message => ({error: {code: -32602, message}});

function respond(method, params) {
  const meta = params?._meta;
  const requested = meta?.["io.modelcontextprotocol/protocolVersion"];
  if (typeof requested !== "string" || !object(meta["io.modelcontextprotocol/clientCapabilities"]))
    return invalidParams("Required protocol version or client capabilities missing or malformed");
  const identity = meta["io.modelcontextprotocol/clientInfo"];
  if (identity !== undefined && (!object(identity) || typeof identity.name !== "string" || typeof identity.version !== "string"))
    return invalidParams("Invalid client identity");
  if (requested !== revision)
    return {error: {code: -32022, message: "Unsupported protocol version", data: {requested, supported: [revision]}}};
  if (method === "server/discover")
    return complete({...cacheHints, supportedVersions: [revision], capabilities: {tools: {}}});
  if (method === "tools/list") {
    if (params.cursor !== undefined) return invalidParams("Unknown cursor");
    return complete({...cacheHints, tools: [{name: "run_summary", inputSchema: {type: "object", additionalProperties: false}}]});
  }
  if (method !== "tools/call") return {error: {code: -32601, message: "Unknown method"}};
  if (params.name !== "run_summary") return invalidParams("Unknown report tool");
  if (params.arguments !== undefined && !object(params.arguments)) return invalidParams("Expected object arguments");
  if (Object.keys(params.arguments ?? {}).length)
    return complete({isError: true, content: [{type: "text", text: "run_summary takes no arguments"}]});
  return complete({content: [{type: "text", text: "Synthetic run sample-001 has no score because its scoring rubric was not supplied."}], structuredContent: report});
}

const send = fields => process.stdout.write(JSON.stringify({jsonrpc: "2.0", ...fields}) + "\n");
for await (const line of createInterface({input: process.stdin, crlfDelay: Infinity})) {
  let request;
  try { request = JSON.parse(line); }
  catch { send({error: {code: -32700, message: "Invalid JSON"}}); continue; }
  if (object(request) && request.jsonrpc === "2.0" && !("id" in request) && typeof request.method === "string") continue;
  if (!object(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string" ||
      !(typeof request.id === "string" || Number.isSafeInteger(request.id))) {
    send({error: {code: -32600, message: "Invalid request"}});
    continue;
  }
  send({id: request.id, ...respond(request.method, request.params)});
}
