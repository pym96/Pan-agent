import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { AuthorizedFile } from "../tools/authorized-file.ts";
import { MCP_REVISION, openReportPeer, record, type ReportCallReceipt } from "./mcp-stdio.ts";

const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,128}$/.test(value);
const contains = (parent: string, child: string) => {
  const rel = relative(parent, child);
  return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
};

function declaration(server: string, tool: string | undefined, home: string, workspace: string) {
  const root = realpathSync(home);
  const directory = join(root, ".pan-agent");
  const path = join(directory, "mcp-reports.json");
  const cwd = realpathSync(workspace);
  if (contains(cwd, directory) || contains(directory, cwd)) throw Error("MCP authority: workspace overlaps policy");
  for (const target of [root, directory, path]) {
    const info = lstatSync(target);
    if (info.uid !== process.getuid?.() || (info.mode & 0o022) ||
        (target === path ? !info.isFile() || info.nlink !== 1 : !info.isDirectory()))
      throw Error("MCP authority: unsafe operator file or directory");
  }
  const config = new AuthorizedFile(path, new AbortController().signal);
  let value: unknown;
  try { value = JSON.parse(config.readBounded(32 * 1024)); }
  finally { config.close(); }
  if (!record(value) || !Array.isArray(value.servers) || !value.servers.every(record))
    throw Error("MCP authority: invalid servers");
  const entries = value.servers.filter(entry => entry.name === server);
  const entry = entries[0];
  if (!identifier(server) || entries.length !== 1 || !entry) throw Error("MCP authority: server not uniquely approved");
  if (typeof entry.command !== "string" || !isAbsolute(entry.command) || !Array.isArray(entry.args) ||
      !entry.args.every((arg): arg is string => typeof arg === "string" && !arg.includes("\0")) ||
      !Array.isArray(entry.tools) || !entry.tools.length || !entry.tools.every(identifier))
    throw Error("MCP authority: invalid command, arguments or tool selection");
  if (tool !== undefined && !entry.tools.includes(tool)) throw Error("MCP authority: tool not approved");
  return {directory, command: entry.command, args: entry.args, tools: new Set(entry.tools as string[])};
}

// This client sends {} and admits only input schemas whose empty-object case is decidable here.
function acceptsNoArguments(schema: unknown): boolean {
  if (!record(schema) || schema.type !== "object" ||
      Object.keys(schema).some(key => !["type", "properties", "required", "additionalProperties", "description", "title", "$schema"].includes(key)))
    return false;
  return (schema.$schema === undefined || schema.$schema === "https://json-schema.org/draft/2020-12/schema") &&
    (schema.properties === undefined || record(schema.properties)) &&
    (schema.required === undefined || (Array.isArray(schema.required) && schema.required.length === 0)) &&
    (schema.additionalProperties === undefined || typeof schema.additionalProperties === "boolean");
}

export interface ReportRequest {
  server: string;
  /** Omit to discover approved callable reports; include to call one exactly once. */
  tool?: string;
  home?: string;
  workspace?: string;
  signal?: AbortSignal;
}

export interface ReportResponse {
  server: string;
  revision: string;
  tools: string[];
  result?: {content: {type: "text"; text: string}[]; structuredContent?: unknown};
}

/** No policy or executable selection comes from tool results or workspace declarations. */
export async function localReports(request: ReportRequest): Promise<ReportResponse> {
  return operate(request, readPolicy(request));
}

type Policy = ReturnType<typeof declaration>;
function readPolicy(request: ReportRequest): Policy {
  return declaration(request.server, request.tool, request.home ?? homedir(), request.workspace ?? process.cwd());
}

export class ReportToolError extends Error {}

/** Pin the operator's executable selection for this TUI. Rediscover on each use. */
export async function selectReport(request: ReportRequest & {tool: string}) {
  const policy = readPolicy(request);
  const identity = (value: Policy) => createHash("sha256").update(JSON.stringify(
    [value.directory, value.command, value.args, request.server, request.tool])).digest("hex");
  const revision = identity(policy);
  const check = () => {
    if (identity(readPolicy(request)) !== revision) throw Error("MCP authority: selected command changed");
  };
  const listed = await operate({...request, tool: undefined}, policy, true);
  if (!listed.tools.includes(request.tool)) throw Error("MCP protocol: approved report absent or unsupported declaration");
  return {revision, async call(signal: AbortSignal, receipt: ReportCallReceipt) {
    check();
    return operate({...request, signal}, policy, true, {
      correlationId: receipt.correlationId,
      sending(id) { check(); receipt.sending(id); },
    });
  }};
}

async function operate(request: ReportRequest, policy: Policy, readOnly = false, receipt?: ReportCallReceipt): Promise<ReportResponse> {
  const peer = openReportPeer(policy.command, policy.args, policy.directory, request.signal);
  try {
    const discovery = await peer.request("server/discover");
    if (!Array.isArray(discovery.supportedVersions) || !discovery.supportedVersions.every(v => typeof v === "string") ||
        !discovery.supportedVersions.includes(MCP_REVISION)) throw Error("MCP protocol: unsupported server revision");
    if (!record(discovery.capabilities) || !record(discovery.capabilities.tools)) throw Error("MCP protocol: no tools capability");
    const tools: string[] = [];
    const names = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await peer.request("tools/list", cursor === undefined ? {} : {cursor});
      if (!Array.isArray(page.tools)) throw Error("MCP protocol: invalid tools/list");
      for (const tool of page.tools) {
        if (!record(tool) || !identifier(tool.name) || names.has(tool.name) || !record(tool.inputSchema) || tool.inputSchema.type !== "object")
          throw Error("MCP protocol: invalid or duplicate tool");
        names.add(tool.name);
        if (readOnly && tool.annotations !== undefined &&
            (!record(tool.annotations) || (tool.annotations.readOnlyHint !== undefined && tool.annotations.readOnlyHint !== true) ||
             (tool.annotations.destructiveHint !== undefined && tool.annotations.destructiveHint !== false))) continue;
        if (policy.tools.has(tool.name) && acceptsNoArguments(tool.inputSchema) && tool.outputSchema === undefined)
          tools.push(tool.name);
      }
      if (page.nextCursor !== undefined && (typeof page.nextCursor !== "string" || cursors.has(page.nextCursor) || cursors.size >= 7))
        throw Error("MCP protocol: invalid cursor or pagination limit");
      cursor = page.nextCursor as string | undefined;
      if (cursor !== undefined) cursors.add(cursor);
    } while (cursor !== undefined);
    const response: ReportResponse = {server: request.server, revision: MCP_REVISION, tools};
    if (request.tool === undefined) return response;
    if (!tools.includes(request.tool)) throw Error("MCP protocol: approved report absent or unsupported schema");
    const result = await peer.request("tools/call", {name: request.tool, arguments: {}}, receipt);
    if (result.isError === true) throw new ReportToolError("MCP tool execution error: " + request.tool);
    if ((result.isError !== undefined && result.isError !== false) || !Array.isArray(result.content))
      throw Error("MCP protocol: invalid tool result");
    const content = result.content.map(block => {
      if (!record(block) || block.type !== "text" || typeof block.text !== "string")
        throw Error("MCP protocol: unsupported tool content");
      return {type: "text" as const, text: block.text};
    });
    response.result = {content, ...(Object.hasOwn(result, "structuredContent") ? {structuredContent: result.structuredContent} : {})};
    return response;
  } finally { await peer.close(); }
}
