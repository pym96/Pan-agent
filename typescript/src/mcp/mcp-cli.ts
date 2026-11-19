import { fileURLToPath } from "node:url";
import { localReports } from "./mcp-reports.ts";

export const MCP_USAGE = "pan-agent mcp example-config | list SERVER | call SERVER TOOL";
export async function reportCommand(args: readonly string[], home?: string): Promise<string> {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) return MCP_USAGE;
  if (args.length === 1 && args[0] === "example-config") {
    const example = fileURLToPath(new URL("../../bin/mcp-report-example.mjs", import.meta.url));
    return JSON.stringify({servers: [{name: "example", command: process.execPath, args: [example], tools: ["run_summary"]}]}, null, 2);
  }
  if (!(args[0] === "list" && args.length === 2 || args[0] === "call" && args.length === 3)) throw Error(MCP_USAGE);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const report = await localReports({server: args[1]!, tool: args[2], home, signal: controller.signal});
    // Keep CLI output parseable while escaping terminal controls outside JSON's default escape set.
    return JSON.stringify(report).replace(/[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g,
      character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
