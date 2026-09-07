/** Distribution facade: existing public lifecycle, injection and inspection interfaces. */
export { runCli, parseCliArgs, CLI_USAGE } from "./cli.ts";
export type { CliDependencies, CliConfiguration } from "./cli.ts";
export { FauxModelAdapter, FAUX_PENDING_EXCHANGE, fauxUserMessage } from "./faux-model-adapter.ts";
export type { FauxScriptEntry } from "./faux-model-adapter.ts";
export { GeneralAgentSession, GENERAL_AGENT_SYSTEM_PROMPT } from "./session.ts";
export type { GeneralAgentSessionOptions, TaskRunResult, SessionObservation } from "./session.ts";
export { runTui, renderObservation, renderRunSummary, renderArchivedRecord } from "./tui.ts";
export { RunArchiveStore, verifyArchiveBytes } from "./run-archive.ts";
export { loadRunbook } from "./runbook.ts";
export type * from "./canonical-protocol.ts";
export type * from "./model-adapter-contract.ts";
export type * from "./agent-tool.ts";
