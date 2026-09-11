import { stat } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { isKernelSelector, type KernelSelector } from "./runtime/agent-kernel.ts";
import {
	DEFAULT_DEEPSEEK_PROFILE,
	isDeepSeekModelId,
	type DeepSeekProfile,
} from "./providers/deepseek/deepseek-profile.ts";
import type { ModelAdapter } from "./protocol/model-adapter-contract.ts";
import { createPanDeepSeekAdapter } from "./providers/deepseek/pan-deepseek-model-adapter.ts";
import { RunArchiveStore } from "./memory/run-archive.ts";
import { loadRunbook } from "./memory/runbook.ts";
import { createPanTrustedLocalTools } from "./tools/pan-trusted-local-tools.ts";
import { GENERAL_AGENT_SYSTEM_PROMPT, GeneralAgentSession } from "./runtime/session.ts";
import { runTui } from "./tui/tui.ts";

import { createCompactPresentation, observeSafely, terminalText, type CompactPresentation } from "./tui/presentation.ts";
import type { SessionObservation } from "./runtime/session.ts";

import { validateAttachmentLimit } from "./input/attachments.ts";
import { loadPanSettings, type PanSettings } from "./config/settings.ts";
import { runFirstRunConfiguration } from "./config/first-run.ts";
import {
	PAN_KEYCHAIN_ACCOUNT,
	PAN_KEYCHAIN_KIMI_ACCOUNT,
	PAN_KEYCHAIN_SERVICE,
	readKeychainCredential,
	type KeychainReference,
} from "./config/keychain.ts";
import { DeepSeekFetchTransport } from "./providers/deepseek/deepseek-transport.ts";
import { KimiFetchTransport } from "./providers/kimi/kimi-transport.ts";
import { createPanKimiAdapter } from "./providers/kimi/pan-kimi-model-adapter.ts";
import { DEFAULT_KIMI_PROFILE, KIMI_MODEL_ID, type KimiProfile } from "./providers/kimi/kimi-profile.ts";

export const CLI_USAGE = `Usage:
  npm run agent -- --workspace /absolute/path --memory-root /absolute/path --kernel native [--model deepseek-v4-flash|deepseek-v4-pro] [--thinking low|high|max] [--max-attachment-bytes INTEGER]
  npm run agent -- configure   (first-run settings: provider/model/thinking and credential source; persists no secret)

The Product requires explicit --kernel native; NativeKernel receives Pan-owned typed read/write/edit/bash implementations directly.
The bash tool is trusted-local: it has host-user authority; --workspace sets cwd but is not containment or an OS sandbox.
Every admitted run is durably archived under --memory-root (must be disjoint from the workspace) with the current Runbook revision; :details, :runs and :replay inspect sealed archives with zero Provider calls or tool effects.
Attachments use selection-time UTF-8 snapshots; default aggregate maxAttachmentBytes=1048576 (1 MiB local byte policy, not a model token limit). Override with --max-attachment-bytes; never truncates.
Ordinary settings persist at ~/.pan-agent/settings.json (mode 0600; schema version, provider/model/thinking and the literal credential source kind only — never a secret). Run 'configure' to create or replace them; on a TTY first run without settings the same flow is offered. Explicit --model/--thinking flags override persisted values for that run.
Credential source: environment reads DEEPSEEK_API_KEY (deepseek) or KIMI_API_KEY (kimi-code) only when a Provider call is made; keychain retrieves the macOS Keychain item named by the Pan service/account convention only when a Provider call is made. kimi-code selects the official OpenAI-compatible Kimi Code endpoint with its fixed model kimi-for-coding; arbitrary endpoints and unknown models are rejected.
No Provider call occurs for --help, configure, startup, cancellation before confirmation, or TUI commands.`;

const RUNBOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "RUNBOOK.md");

export interface CliConfiguration {
	readonly help: boolean;
	readonly maxAttachmentBytes?: number;
	readonly workspace?: string;
	readonly memoryRoot?: string;
	readonly kernel: KernelSelector;
	readonly profile: DeepSeekProfile;
	/** First-run/settings flow without starting a session. */
	readonly configure?: boolean;
}

export function parseCliArgs(args: readonly string[]): CliConfiguration {
	let maxAttachmentBytes = validateAttachmentLimit();
	let workspace: string | undefined;
	let memoryRoot: string | undefined;
	let kernel: string | undefined;
	let modelId: string = DEFAULT_DEEPSEEK_PROFILE.modelId;
	let thinkingLevel: string = DEFAULT_DEEPSEEK_PROFILE.thinkingLevel;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--help" || argument === "-h") {
			return { help: true, kernel: "native", profile: DEFAULT_DEEPSEEK_PROFILE };
		}
		if (argument === "configure" && index === 0) {
			if (args.length !== 1) throw new Error("configure takes no further arguments");
			return { help: false, configure: true, kernel: "native", profile: DEFAULT_DEEPSEEK_PROFILE };
		}
		const value = args[index + 1];
		if (argument === "--workspace" || argument === "--memory-root" || argument === "--kernel" || argument === "--model" || argument === "--thinking" || argument === "--max-attachment-bytes") {
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
			index += 1;
			if (argument === "--max-attachment-bytes") {
				if (!/^[0-9]+$/.test(value)) throw new Error("attachment_limit_invalid");
				maxAttachmentBytes = validateAttachmentLimit(Number(value));
			}
			if (argument === "--workspace") workspace = value;
			if (argument === "--memory-root") memoryRoot = value;
			if (argument === "--kernel") kernel = value;
			if (argument === "--model") modelId = value;
			if (argument === "--thinking") thinkingLevel = value;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (kernel === undefined) throw new Error("kernel_selection_required: pass --kernel native");
	if (kernel === "pi") throw new Error("kernel_not_in_product: see references/pi/README.md");
	if (!isKernelSelector(kernel)) throw new Error(`Unsupported kernel: ${kernel}`);
	if (!isDeepSeekModelId(modelId)) throw new Error(`Unsupported DeepSeek model: ${modelId}`);
	if (thinkingLevel !== "low" && thinkingLevel !== "high" && thinkingLevel !== "max") {
		throw new Error(`Unsupported thinking level: ${thinkingLevel}`);
	}
	return {
		help: false,
		maxAttachmentBytes,
		workspace,
		memoryRoot,
		kernel,
		profile: { modelId, thinkingLevel },
	};
}

export interface CliDependencies {
	readonly output?: Writable;
	/** Input for the first-run/configuration flow; defaults to process.stdin. */
	readonly input?: Readable;
	/** Overrides the settings home (tests use a fresh temporary directory). */
	readonly home?: string;
	/** Test seam for Keychain writes; production uses the real Keychain. */
	readonly saveCredential?: (secret: string, reference: KeychainReference) => void;
	readonly keychainReference?: KeychainReference;
	/** Pan-owned injection seam for deterministic Native composition tests. */
	readonly createNativeAdapter?: (profile: DeepSeekProfile) => ModelAdapter;
	/** Pan-owned injection seam for deterministic Kimi composition tests (#53). */
	readonly createKimiAdapter?: (profile: KimiProfile) => ModelAdapter;
	readonly createTools?: typeof createPanTrustedLocalTools;
	readonly startTui?: typeof runTui;
	/** Optional presentation factory; execution stays in Session. */
	readonly createPresentation?: typeof createCompactPresentation;
}

export async function runCli(args: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
	const output = dependencies.output ?? process.stdout;
	const writeLine = (line: string): void => {
		output.write(`${line}\n`);
	};
	let configuration: CliConfiguration;
	try {
		configuration = parseCliArgs(args);
	} catch (error) {
		writeLine(`Validation failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
		writeLine(CLI_USAGE);
		return 2;
	}
	if (configuration.help) {
		writeLine(CLI_USAGE);
		return 0;
	}
	if (configuration.configure) {
		try {
			await runFirstRunConfiguration({
				input: dependencies.input ?? process.stdin,
				output,
				home: dependencies.home,
				saveCredential: dependencies.saveCredential,
				keychainReference: dependencies.keychainReference,
			});
			return 0;
		} catch (error) {
			writeLine(`Configuration failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
			return 2;
		}
	}
	if (!configuration.workspace) {
		writeLine("Validation failed: --workspace is required");
		writeLine(CLI_USAGE);
		return 2;
	}
	if (!configuration.memoryRoot) {
		writeLine("Validation failed: --memory-root is required");
		writeLine(CLI_USAGE);
		return 2;
	}

	const workspace = resolve(configuration.workspace);
	try {
		const info = await stat(workspace);
		if (!info.isDirectory()) throw new Error("path is not a directory");
	} catch (error) {
		writeLine(`Validation failed: workspace is not an existing directory: ${terminalText(workspace)}`);
		return 2;
	}
	const memoryRoot = resolve(configuration.memoryRoot);
	if (workspace === memoryRoot || workspace.startsWith(`${memoryRoot}/`) || memoryRoot.startsWith(`${workspace}/`)) {
		writeLine("Validation failed: --memory-root must be disjoint from --workspace");
		return 2;
	}

	let archiveStore;
	try {
		await loadRunbook(RUNBOOK_PATH);
		archiveStore = await RunArchiveStore.open(memoryRoot);
	} catch (error) {
		writeLine(`Validation failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
		return 2;
	}

	const presentation: CompactPresentation = (dependencies.createPresentation ?? createCompactPresentation)(writeLine);
	const shared = {
		onProgress: (progress: import("./runtime/agent-kernel.ts").SessionProgress) => presentation.progress?.(progress),
		onProgressError: () => {
			if (presentation.progressError) presentation.progressError();
			else writeLine("Display error: progress observer failed; execution continues.");
		},
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: { archiveStore, runbook: () => loadRunbook(RUNBOOK_PATH) },
		onObservation(observation: SessionObservation) {
			observeSafely(presentation, observation, writeLine);
		},
	};
	let session: GeneralAgentSession;
	let provider: string;
	let model: string;
	let thinking: string;
	// #52: persisted ordinary settings supply defaults; explicit flags win; no silent fallback.
	let settings: PanSettings | undefined;
	try {
		settings = await loadPanSettings(dependencies.home);
	} catch (error) {
		writeLine(`Validation failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
		return 2;
	}
	const firstRunInput = dependencies.input ?? process.stdin;
	if (!settings && !dependencies.createNativeAdapter && (firstRunInput as NodeJS.ReadStream).isTTY === true) {
		try {
			settings = await runFirstRunConfiguration({
				input: firstRunInput,
				output,
				home: dependencies.home,
				saveCredential: dependencies.saveCredential,
				keychainReference: dependencies.keychainReference,
			});
		} catch (error) {
			writeLine(`Configuration failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
			return 2;
		}
	}
	const selectedProvider = settings?.provider ?? "deepseek";
	if (selectedProvider === "kimi-code" && (args.includes("--model") || args.includes("--thinking"))) {
		writeLine(`Validation failed: kimi-code uses the fixed model ${KIMI_MODEL_ID}; remove --model/--thinking`);
		return 2;
	}
	const profile: DeepSeekProfile = {
		modelId: args.includes("--model") ? configuration.profile.modelId : (settings?.modelId ?? configuration.profile.modelId) as DeepSeekProfile["modelId"],
		thinkingLevel: args.includes("--thinking") ? configuration.profile.thinkingLevel : (settings?.thinkingLevel ?? configuration.profile.thinkingLevel),
	};
	const credentialSource = settings?.credentialSource ?? "environment";
	const keychainReference: KeychainReference = dependencies.keychainReference ?? { service: PAN_KEYCHAIN_SERVICE, account: selectedProvider === "kimi-code" ? PAN_KEYCHAIN_KIMI_ACCOUNT : PAN_KEYCHAIN_ACCOUNT };
	{
		let adapter: ModelAdapter;
		if (selectedProvider === "kimi-code") {
			const kimiFactory = dependencies.createKimiAdapter ?? ((selected: KimiProfile) => createPanKimiAdapter(selected, credentialSource === "keychain"
				? { transport: new KimiFetchTransport({ credentialSource: () => readKeychainCredential(keychainReference) }) }
				: {}));
			adapter = kimiFactory(DEFAULT_KIMI_PROFILE);
		} else {
			const adapterFactory = dependencies.createNativeAdapter ?? ((selected: DeepSeekProfile) => createPanDeepSeekAdapter(selected, credentialSource === "keychain"
				? { transport: new DeepSeekFetchTransport({ credentialSource: () => readKeychainCredential(keychainReference) }) }
				: {}));
			adapter = adapterFactory(profile);
		}
		const trustedLocal = dependencies.createTools ? dependencies.createTools(workspace) : createPanTrustedLocalTools(workspace);
		session = new GeneralAgentSession({
			...shared,
			kernel: "native",
			adapter,
			tools: trustedLocal.tools,
		});
		provider = adapter.providerId;
		model = adapter.modelId;
		thinking = adapter.reasoningLevel;
	}

	writeLine(`Archives: ${terminalText(memoryRoot)}`);
	const credentialEnv = selectedProvider === "kimi-code" ? "KIMI_API_KEY" : "DEEPSEEK_API_KEY";
	writeLine(credentialSource === "keychain"
		? `CREDENTIAL keychain (macOS Keychain service ${keychainReference.service} account ${keychainReference.account}; retrieved only when a Provider call is made)`
		: `CREDENTIAL environment ${credentialEnv} (required at task time; never saved)`);
	return (dependencies.startTui ?? runTui)({
		session,
		presentation,
		provider,
		model,
		thinking,
		workspace,
		output,
		archiveStore,
		maxAttachmentBytes: configuration.maxAttachmentBytes,
	});
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
	process.exitCode = await runCli(process.argv.slice(2));
}
