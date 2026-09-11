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

export { captureAttachment, discoverAttachmentPaths, validateAttachmentLimit, DEFAULT_MAX_ATTACHMENT_BYTES, AttachmentError } from "./input/attachments.ts";
export { prepareAttachedTask, decodeAttachedTask } from "./input/task-envelope.ts";
export type { AttachmentSnapshot, AttachedTask } from "./input/task-envelope.ts";
export { loadPanSettings, savePanSettings, parsePanSettings, panSettingsPath, PAN_SETTINGS_SCHEMA_VERSION, PAN_CREDENTIAL_SOURCES } from "./config/settings.ts";
export type { PanSettings, PanCredentialSource } from "./config/settings.ts";
export { saveKeychainCredential, readKeychainCredential, deleteKeychainCredential, keychainCredentialExists, PanKeychainError, PAN_KEYCHAIN_SERVICE, PAN_KEYCHAIN_ACCOUNT } from "./config/keychain.ts";
export type { KeychainReference, PanKeychainErrorCode } from "./config/keychain.ts";
export { runFirstRunConfiguration } from "./config/first-run.ts";
export type { FirstRunDependencies } from "./config/first-run.ts";
export { PanKimiModelAdapter, createPanKimiAdapter, KIMI_HTTP_FAILURE_TABLE } from "./providers/kimi/pan-kimi-model-adapter.ts";
export type { PanKimiModelAdapterOptions } from "./providers/kimi/pan-kimi-model-adapter.ts";
export { KimiFetchTransport, KimiTransportConfigurationError, abortableKimiBody } from "./providers/kimi/kimi-transport.ts";
export type { KimiTransport, KimiTransportRequest, KimiTransportResponse, KimiCredentialSource, KimiFetchTransportOptions } from "./providers/kimi/kimi-transport.ts";
export { DEFAULT_KIMI_PROFILE, KIMI_MODEL_ID, KIMI_OFFICIAL_CONTRACT, isKimiModelId } from "./providers/kimi/kimi-profile.ts";
export type { KimiProfile, KimiModelId } from "./providers/kimi/kimi-profile.ts";
