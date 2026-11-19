import { spawn } from "node:child_process";

export const MCP_REVISION = "2026-07-28";
const metadata = {
  "io.modelcontextprotocol/protocolVersion": MCP_REVISION,
  "io.modelcontextprotocol/clientInfo": {name: "pan-agent", version: "0.1.9"},
  "io.modelcontextprotocol/clientCapabilities": {},
};
const FRAME_BYTES = 256 * 1024;
const REQUEST_MS = 3000;
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface Pending {
  id: number;
  chunks: Buffer[];
  bytes: number;
  resolve: (line: Buffer) => void;
  reject: (error: Error) => void;
}

async function exitedWithin(exit: Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      exit.then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

export class ReportRpcError extends Error {}
export interface ReportCallReceipt {
  correlationId: string;
  sending: (requestId: number) => void;
}

/** One local child, one outstanding request, and one bounded response frame. */
export function openReportPeer(command: string, args: string[], cwd: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  // Node and platform launchers may propagate special variables even with env: {}.
  // env execs the absolute server in place, so its PID remains the PID we supervise.
  const child = spawn("/usr/bin/env", ["-i", command, ...args], {cwd, env: {}, shell: false, stdio: ["pipe", "pipe", "ignore"]});
  let pending: Pending | undefined;
  let failure: Error | undefined;
  let sequence = 0;
  const fail = (error: Error) => {
    failure ??= error;
    pending?.reject(failure);
    child.stdout.pause();
  };
  const exit = new Promise<void>(resolve => {
    child.once("exit", () => resolve());
    child.once("error", error => { fail(Error("MCP transport launch: " + error.message)); resolve(); });
  });
  child.stdin.on("error", () => fail(Error("MCP transport: server input closed")));
  child.stdout.on("error", () => fail(Error("MCP transport: server output failed")));
  child.stdout.on("end", () => {
    if (pending) fail(Error("MCP transport: server exited before a complete response"));
  });
  child.stdout.on("data", (chunk: Buffer) => {
    const request = pending;
    if (!request || failure) return fail(Error("MCP protocol: unsolicited response"));
    request.bytes += chunk.length;
    if (request.bytes > FRAME_BYTES) return fail(Error("MCP transport: response exceeds frame limit"));
    const lf = chunk.indexOf(10);
    if (lf < 0) { request.chunks.push(chunk); return; }
    if (lf !== chunk.length - 1) return fail(Error("MCP protocol: extra data after response"));
    request.chunks.push(chunk.subarray(0, lf));
    pending = undefined;
    request.resolve(Buffer.concat(request.chunks));
  });
  const cancel = () => {
    if (pending && child.stdin.writable) {
      child.stdin.write(JSON.stringify({jsonrpc: "2.0", method: "notifications/cancelled",
        params: {requestId: pending.id}}) + "\n");
    }
  };
  const abort = () => { cancel(); fail(Error("MCP transport: cancelled")); };
  signal?.addEventListener("abort", abort, {once: true});
  return {
    async request(method: string, params: Record<string, unknown> = {}, receipt?: ReportCallReceipt) {
      if (failure) throw failure;
      if (child.stdout.readableEnded || !child.stdin.writable) throw Error("MCP transport: peer closed");
      const id = ++sequence;
      const meta = receipt ? {...metadata, "io.github.pym96/pan-call": receipt.correlationId} : metadata;
      let timer: NodeJS.Timeout | undefined;
      let bytes: Buffer;
      try {
        bytes = await new Promise<Buffer>((resolve, reject) => {
          receipt?.sending(id);
          pending = {id, chunks: [], bytes: 0, resolve, reject};
          timer = setTimeout(() => { cancel(); fail(Error("MCP transport timeout: " + method)); }, REQUEST_MS);
          child.stdin.write(JSON.stringify({jsonrpc: "2.0", id, method, params: {...params, _meta: meta}}) + "\n");
        });
      } finally { pending = undefined; clearTimeout(timer); }
      let reply: unknown;
      try { reply = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)); }
      catch { throw Error("MCP protocol: invalid UTF-8 or JSON"); }
      if (!record(reply) || reply.jsonrpc !== "2.0" || reply.id !== id || "method" in reply ||
          ("error" in reply) === ("result" in reply)) throw Error("MCP protocol: invalid response envelope or ID");
      if ("error" in reply) {
        const error = reply.error;
        if (!record(error) || !Number.isInteger(error.code) || typeof error.message !== "string")
          throw Error("MCP protocol: invalid RPC error");
        throw new ReportRpcError("MCP RPC " + error.code + " in " + method + ": " + error.message.slice(0, 512));
      }
      if (!record(reply.result) || reply.result.resultType !== "complete")
        throw Error("MCP protocol: unsupported resultType in " + method);
      return reply.result;
    },
    async close() {
      signal?.removeEventListener("abort", abort);
      child.stdin.end();
      try {
        if (!await exitedWithin(exit, 150)) {
          child.kill("SIGTERM");
          if (!await exitedWithin(exit, 200)) {
            child.kill("SIGKILL");
            if (!await exitedWithin(exit, 1000)) throw Error("MCP transport: server exit unconfirmed");
          }
        }
      } finally { child.stdout.destroy(); child.stdin.destroy(); }
      if (failure) throw failure;
    },
  };
}
