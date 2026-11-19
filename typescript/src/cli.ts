import {NativeLinuxSandbox} from './sandbox/native/linux.ts';
import {NativeMacSandbox} from './sandbox/native/macos.ts';
import { deliveryCli } from "./execution/delivery-cli.ts";
import { executionCli } from "./execution/cli.ts";
import {SandboxSession} from './sandbox/session.ts';
import {sandboxCommand} from './sandbox/cli.ts';
import { createRetrievalTool } from './retrieval/tool.ts';
import { retrievalCommand } from './retrieval/config.ts';
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { homedir } from "node:os";
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
import { loadPanSettings, panSettingsPath, type PanSettings } from "./config/settings.ts";
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
import { createPanKimiAdapter, PanKimiModelAdapter } from "./providers/kimi/pan-kimi-model-adapter.ts";
import { DEFAULT_KIMI_PROFILE, KIMI_K3_MODEL_ID, type KimiProfile } from "./providers/kimi/kimi-profile.ts";

export const CLI_USAGE = `Usage:
  pan-agent [--workspace /absolute/path] [--memory-root /absolute/path] --kernel native [--model deepseek-v4-flash|deepseek-v4-pro] [--thinking low|high|max] [--max-attachment-bytes INTEGER]
  pan-agent delivery --help   (bounded local delivery with independent checks)
  pan-agent settings path|show|validate   (read-only ordinary settings; no credential access)
  npm run agent -- configure   (first-run settings: provider/model/thinking and credential source; persists no secret)

The installed launcher selects Native; source/library callers pass --kernel native. NativeKernel receives Pan-owned typed read/write/edit/bash implementations directly.
By default the bash tool is trusted-local: it has host-user authority; --workspace sets cwd but is not containment or an OS sandbox.
Defaults: workspace = current directory; memory-root = ~/.pan-agent/archives. Explicit paths override defaults.
Every admitted run is durably archived under --memory-root (must be disjoint from the workspace) with the current Runbook revision; :details, :runs and :replay inspect sealed archives with zero Provider calls or tool effects.
Attachments use selection-time UTF-8 snapshots; default aggregate maxAttachmentBytes=1048576 (1 MiB local byte policy, not a model token limit). Saved maxAttachmentBytes overrides the default; --max-attachment-bytes overrides the saved value. Never truncates.
Ordinary settings persist at ~/.pan-agent/settings.json (mode 0600; provider/model/thinking, credential source kind, protectedPaths, permissions.deny and maxAttachmentBytes — never a secret). Run 'configure' to update provider fields while preserving valid ordinary preferences; on a TTY first run without settings the same flow is offered. Explicit --model/--thinking flags override persisted values for that run.
Deny rules are frozen at TUI session creation, before tool execution and approval, including trusted Shell and sandbox tools. Whole tools: read/write/edit/bash/retrieve; bash(PATTERN) uses only literal characters and * wildcard. No shell semantic analysis or OS containment.
Credential source: environment reads DEEPSEEK_API_KEY (deepseek) or KIMI_API_KEY (kimi-code) only when a Provider call is made; keychain retrieves the macOS Keychain item named by the Pan service/account convention only when a Provider call is made. kimi-code selects the official OpenAI-compatible Kimi Code endpoint with explicit kimi-for-coding or k3-256k selection in configure (kimi-code:k3-256k); Kimi --model/--thinking overrides are unsupported; arbitrary endpoints and unknown models are rejected.
Native workspace sandbox (opt-in): --native-sandbox shares --workspace through host-mediated files and OS-isolated Shell/descendants; offline, no retrieval, no host fallback. Requires macOS sandbox-exec/otool or a supported x86-64 Linux Bubblewrap/FUSE setup. No Docker-equivalent resource quotas; see README.
Sandbox (opt-in): add --sandbox-root DIR and optional repeated --sandbox-input FILE. One new fixed-profile Docker workspace per task; no retrieval. After exit: pan-agent sandbox list --root DIR; recover|export|verify|cleanup --run RUN_DIRECTORY (see README).
Retrieval (default off): pan-agent retrieval configure --workspace DIR --from selection.json; retrieval show|disable --workspace DIR. Each approved call refreshes selected sources.
No Provider call occurs for --help, configure, startup, idle cancellation, or TUI commands. Startup has no y; protected/outside/uncertain file operations and Shell require operation-scoped approval.`;

const RUNBOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "RUNBOOK.md");

export interface CliConfiguration {
	readonly help: boolean;
	readonly maxAttachmentBytes?: number;
	readonly workspace?: string;
 readonly nativeSandbox?:boolean;
 readonly sandboxRoot?:string;
 readonly sandboxInputs?:readonly string[];
	readonly memoryRoot?: string;
	readonly kernel: KernelSelector;
	readonly profile: DeepSeekProfile;
	/** First-run/settings flow without starting a session. */
	readonly configure?: boolean;
}

export function parseCliArgs(args: readonly string[]): CliConfiguration {
	let maxAttachmentBytes = validateAttachmentLimit();
	let workspace: string | undefined;
 let nativeSandbox=false;
 let sandboxRoot:string|undefined;const sandboxInputs:string[]=[];
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
		if(argument === "--native-sandbox"){if(nativeSandbox)throw Error("duplicate_native_sandbox");nativeSandbox=true;continue;}
		const value = args[index + 1];
		if (argument === "--sandbox-root" || argument === "--sandbox-input" || argument === "--workspace" || argument === "--memory-root" || argument === "--kernel" || argument === "--model" || argument === "--thinking" || argument === "--max-attachment-bytes") {
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
			index += 1;
			if (argument === "--max-attachment-bytes") {
				if (!/^[0-9]+$/.test(value)) throw new Error("attachment_limit_invalid");
				maxAttachmentBytes = validateAttachmentLimit(Number(value));
			}
			if (argument === "--sandbox-root") sandboxRoot=value;
   if (argument === "--sandbox-input") sandboxInputs.push(value);
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
  sandboxRoot,sandboxInputs,nativeSandbox,
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
	if (args[0] === 'settings') {
		if (args.length !== 2 || !['path', 'show', 'validate'].includes(args[1]!)) { writeLine('settings_usage: pan-agent settings path|show|validate'); return 2; }
		if (args[1] === 'path') { writeLine(panSettingsPath(dependencies.home)); return 0; }
		try {
			const stored = await loadPanSettings(dependencies.home);
			if (!stored) { writeLine('settings_absent: run pan-agent configure to create settings'); return args[1] === 'show' ? 0 : 2; }
			writeLine(args[1] === 'show' ? JSON.stringify(stored, null, 2) : 'settings_valid');
			return 0;
		} catch (error) { writeLine(`Settings validation failed: ${terminalText(error instanceof Error ? error.message : 'unknown')}`); return 2; }
	}
	if(args[0]==='delivery'){try{return await deliveryCli(args.slice(1),output);}catch(error){writeLine('Delivery error: '+terminalText(String(error)));return 2;}}
	if(['loop','goal','execution'].includes(args[0]??'')){try{return await executionCli(args,output,dependencies.input??process.stdin);}catch(error){writeLine('Execution error: '+terminalText(String(error)));return 2;}}
	if(args[0]==='sandbox'){try{writeLine(await sandboxCommand(args.slice(1)));return 0;}catch(error){writeLine('Sandbox error: '+terminalText(String(error)));return 2;}}
	if(args[0]==='retrieval') {try{writeLine(retrievalCommand(args.slice(1)));return 0;}catch(error){writeLine(`Retrieval configuration failed: ${terminalText(error instanceof Error?error.message:'unknown')}`);return 2;}}
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
	// Interactive onboarding owns defaults; explicit paths remain authoritative.
	if (!configuration.workspace && !configuration.memoryRoot && !dependencies.startTui
		&& ((dependencies.input ?? process.stdin) as NodeJS.ReadStream).isTTY !== true) {
		writeLine("Interactive startup requires a terminal. Run pan-agent in a terminal, or use --help / demo; use explicit --workspace and --memory-root for automated runs.");
		return 2;
	}
	const workspace = resolve(configuration.workspace ?? process.cwd());
	try {
		const info = await stat(workspace);
		if (!info.isDirectory()) throw new Error("path is not a directory");
	} catch (error) {
		writeLine(`Validation failed: workspace is not an existing directory: ${terminalText(workspace)}`);
		return 2;
	}
	const memoryRoot = resolve(configuration.memoryRoot ?? resolve(dependencies.home ?? homedir(), ".pan-agent", "archives"));
	if (workspace === memoryRoot || workspace.startsWith(`${memoryRoot}/`) || memoryRoot.startsWith(`${workspace}/`)) {
		writeLine("Validation failed: --memory-root must be disjoint from --workspace. Choose a project subdirectory or pass --memory-root outside the workspace.");
		return 2;
	}

	let archiveStore;
	try {
		await loadRunbook(RUNBOOK_PATH);
		archiveStore = await RunArchiveStore.open(memoryRoot);
		await access(resolve(memoryRoot, "runs"), constants.W_OK);
	} catch (error) {
		writeLine(`Validation failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
		return 2;
	}

	if(configuration.sandboxInputs?.length&&!configuration.sandboxRoot){writeLine("Validation failed: sandbox inputs require --sandbox-root");return 2;}
 if(configuration.nativeSandbox&&(configuration.sandboxRoot||configuration.sandboxInputs?.length)){writeLine("Validation failed: native sandbox cannot combine with Docker flags");return 2;}
 if(configuration.nativeSandbox&&process.platform!=='darwin'&&process.platform!=='linux'){writeLine("Validation failed: native_sandbox_unsupported_platform: requires macOS or supported Linux");return 2;}
 const NativeSandbox=process.platform==='linux'?NativeLinuxSandbox:NativeMacSandbox;
 let nativeSandbox:NativeLinuxSandbox|NativeMacSandbox|undefined;
 const sandbox=configuration.sandboxRoot?new SandboxSession({stateRoot:resolve(configuration.sandboxRoot),inputs:configuration.sandboxInputs},writeLine):undefined;
 const presentation: CompactPresentation = (dependencies.createPresentation ?? createCompactPresentation)(writeLine);
	const shared = {
		onProgress: (progress: import("./runtime/agent-kernel.ts").SessionProgress) => presentation.progress?.(progress),
		onProgressError: () => {
			if (presentation.progressError) presentation.progressError();
			else writeLine("Display error: progress observer failed; execution continues.");
		},
		systemPrompt: (configuration.nativeSandbox?"You are a coding agent in a shared live workspace. Use typed read/write/edit/bash tools and observations; protected/outside files are denied, Shell and descendants use a fixed offline OS sandbox. No host fallback, no retrieval. Return accurate results; never print secrets.":GENERAL_AGENT_SYSTEM_PROMPT)+(sandbox?"\nTools run ONLY in an isolated Docker workspace /workspace/task. Selected inputs are /inputs, read-only. No retrieval or host tool access. Each new task gets a new workspace.":""),
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
		writeLine("Validation failed: kimi-code uses saved model/thinking settings; run configure and remove --model/--thinking");
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
			adapter = kimiFactory(settings?.modelId === KIMI_K3_MODEL_ID
				? { modelId: KIMI_K3_MODEL_ID, thinkingLevel: settings.thinkingLevel } : DEFAULT_KIMI_PROFILE);
		} else {
			const adapterFactory = dependencies.createNativeAdapter ?? ((selected: DeepSeekProfile) => createPanDeepSeekAdapter(selected, credentialSource === "keychain"
				? { transport: new DeepSeekFetchTransport({ credentialSource: () => readKeychainCredential(keychainReference) }) }
				: {}));
			adapter = adapterFactory(profile);
		}
		nativeSandbox=configuration.nativeSandbox?new NativeSandbox({workspace,stateRoot:resolve(memoryRoot,"native-sandbox"),protectedPaths:settings?.protectedPaths,notify:writeLine}):undefined;
        const trustedLocal = sandbox??nativeSandbox??(dependencies.createTools ? dependencies.createTools(workspace) : createPanTrustedLocalTools(workspace));
		session = new GeneralAgentSession({
			...shared,
            executionBoundary:sandbox??nativeSandbox,
			kernel: "native",
			adapter,
			tools: (sandbox||nativeSandbox)?trustedLocal.tools:[...trustedLocal.tools, createRetrievalTool(workspace)],
			authorization: { protectedPaths: settings?.protectedPaths, permissions: settings?.permissions },
			...(adapter instanceof PanKimiModelAdapter ? { cleanup: () => adapter.dispose() } : {}),
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
  ...(sandbox?{executionMode:"sandbox" as const}:nativeSandbox?{executionMode:nativeSandbox.executionMode}:{}),
		credentialSource,
		session,
		presentation,
		provider,
		model,
		thinking,
		workspace,
		output,
		archiveStore,
		maxAttachmentBytes: args.includes("--max-attachment-bytes") ? configuration.maxAttachmentBytes : validateAttachmentLimit(settings?.maxAttachmentBytes),
	});
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
	process.exitCode = await runCli(process.argv.slice(2));
}
