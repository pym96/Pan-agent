/** Distribution facade: existing public lifecycle, injection and inspection interfaces. */
export { runCli, parseCliArgs, CLI_USAGE } from "./cli.ts";
export type { CliDependencies, CliConfiguration } from "./cli.ts";
export { FauxModelAdapter, FAUX_PENDING_EXCHANGE, fauxUserMessage } from "./providers/faux/faux-model-adapter.ts";
export type { FauxScriptEntry } from "./providers/faux/faux-model-adapter.ts";
export { GeneralAgentSession, GENERAL_AGENT_SYSTEM_PROMPT } from "./runtime/session.ts";
export type { GeneralAgentSessionOptions, TaskRunResult, SessionObservation } from "./runtime/session.ts";
export { runTui, renderObservation, renderRunSummary, renderArchivedRecord } from "./tui/tui.ts";
export { RunArchiveStore, verifyArchiveBytes } from "./memory/run-archive.ts";
export { loadRunbook } from "./memory/runbook.ts";
export type * from "./protocol/canonical-protocol.ts";
export type * from "./protocol/model-adapter-contract.ts";
export type * from "./protocol/agent-tool.ts";

export { createCompactPresentation } from "./tui/presentation.ts";
export type { CompactPresentation } from "./tui/presentation.ts";

export type { ModelTextDelta, ModelProgressSink } from "./protocol/model-adapter-contract.ts";
export type { SessionProgress, ProgressSink } from "./runtime/agent-kernel.ts";
export { PanDeepSeekModelAdapter, createPanDeepSeekAdapter } from "./providers/deepseek/pan-deepseek-model-adapter.ts";
export { DeepSeekFetchTransport } from "./providers/deepseek/deepseek-transport.ts";
