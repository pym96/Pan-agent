import {workspaceTrust, WorkspaceGrant, type GrantSelection} from "./config/workspace-trust.ts";
import {privateOrigin, type ResolveAddresses} from './sandbox/native/network.ts';
import {ManualFallback} from './sandbox/fallback.ts';
import {NativeLinuxSandbox} from './sandbox/native/linux.ts';
import {NativeMacSandbox} from './sandbox/native/macos.ts';
import { createReportTool, type ReportSelection } from "./mcp/report-tool.ts";
import { reportCommand, MCP_USAGE } from "./mcp/mcp-cli.ts";
import { deliveryCli } from "./execution/delivery-cli.ts";
import { executionCli } from "./execution/cli.ts";
import {SandboxSession} from './sandbox/session.ts';
import {sandboxCommand} from './sandbox/cli.ts';
import { createRetrievalTool } from './retrieval/tool.ts';
import { retrievalCommand } from './retrieval/config.ts';
import { access, lstat, mkdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
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
import { providerCredentialVariable, runFirstRunConfiguration } from "./config/first-run.ts";
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
  pan-agent [--workspace /absolute/path] [--memory-root /absolute/path] [--kernel native] [--model deepseek-v4-flash|deepseek-v4-pro] [--thinking low|high|max] [--max-attachment-bytes INTEGER]
  pan-agent trust --workspace PATH [--approve REVIEW_HASH]
  pan-agent --native-sandbox --native-resource ID (--grant-command EXACT_SHELL | --grant-task)
  Only authorized Shell and children receive PAN_GRANTED_VALUE. File tools still deny the protected path.
  pan-agent --mcp-report SERVER TOOL    (offer one operator-selected local report; approve each call)
  ${MCP_USAGE}
  pan-agent delivery --help   (bounded local delivery with independent checks)
  pan-agent settings path|show|validate   (read-only ordinary settings; no credential access)
  pan-agent configure   (first-run settings: provider/model/thinking and credential source; persists no secret)

The installed launcher selects Native; source/library callers pass --kernel native. NativeKernel receives Pan-owned typed read/write/edit/bash implementations directly.
Interactive tasks default to the native workspace sandbox. Explicit --trusted-local uses host-user tools and enables configured retrieval; workspace is its cwd.
Defaults: workspace = current directory (bare launch from home uses ~/pan-workspace); memory-root = ~/.pan-agent/archives. Explicit paths override defaults.
Every admitted run is durably archived under --memory-root (must be disjoint from the workspace) with the current Runbook revision; :details, :runs and :replay inspect sealed archives with zero Provider calls or tool effects.
Attachments use selection-time UTF-8 snapshots; default aggregate maxAttachmentBytes=1048576 (1 MiB local byte policy, not a model token limit). Saved maxAttachmentBytes overrides the default; --max-attachment-bytes overrides the saved value. Never truncates.
Ordinary settings persist at ~/.pan-agent/settings.json (mode 0600; provider/model/thinking, credential source kind, protectedPaths, permissions.deny and maxAttachmentBytes — never a secret). Run 'pan-agent configure' to update provider fields while preserving valid ordinary preferences; on a TTY first run without settings the same flow is offered. Explicit --model/--thinking flags override persisted values for that run.
Deny rules are frozen at TUI session creation, before tool execution and approval, including trusted Shell and sandbox tools. Whole tools: read/write/edit/bash/retrieve/mcp_report; bash(PATTERN) uses only literal characters and * wildcard. No shell semantic analysis or OS containment.
Credential source: bare interactive startup checks whether the selected environment variable is set (DEEPSEEK_API_KEY for DeepSeek or KIMI_API_KEY for Kimi). Provider calls use its value; keychain retrieves the macOS Keychain item named by the Pan service/account convention only when a Provider call is made. kimi-code selects the official OpenAI-compatible Kimi Code endpoint with explicit kimi-for-coding or k3-256k selection in configure (kimi-code:k3-256k); Kimi --model/--thinking overrides are unsupported; arbitrary endpoints and unknown models are rejected.
Native workspace sandbox (default): --native-sandbox shares --workspace through host-mediated files and OS-isolated Shell/descendants. Default bounded HTTP(S) GET through pan-fetch; --native-offline denies network. --native-grant ORIGIN permits one private IP service for the first task. No retrieval. On eligible native setup failure the interactive operator may cancel or select reviewed workspace file operations and exact pwd once or for one fresh task. Requires macOS sandbox-exec/otool or a supported x86-64 Linux Bubblewrap/FUSE setup. No Docker-equivalent resource quotas; see README.
Session-only --session-auto permits creating a new plain ASCII .txt or .md document at the native workspace root without individual approval (no protected-path overrides or resource grants). Other approvals and deny rules remain in force.
Sandbox (opt-in): add --sandbox-root DIR and optional repeated --sandbox-input FILE. One new fixed-profile Docker workspace per task; no retrieval. After exit: pan-agent sandbox list --root DIR; recover|export|verify|cleanup --run RUN_DIRECTORY (see README).
Retrieval (default off): pan-agent retrieval configure --workspace DIR --from selection.json; retrieval show|disable --workspace DIR. Each approved call refreshes selected sources.
No Provider call occurs for --help, configure, startup, idle cancellation, or TUI commands. Keychain writes require explicit save confirmation. Protected/outside/uncertain file operations and Shell require operation-scoped approval.`;

const RUNBOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "RUNBOOK.md");

export interface CliConfiguration {
	readonly help: boolean;
  readonly mcpReport?: ReportSelection;
	readonly maxAttachmentBytes?: number;
	readonly workspace?: string;
 readonly nativeSandbox?:boolean;
 readonly sessionAuto?:boolean;
 readonly nativeOffline?:boolean;
 readonly nativeGrant?:string;
 readonly credentialSelection?:GrantSelection;
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
  let mcpReport: ReportSelection | undefined;
 let nativeSandbox=false,nativeOffline=false,trustedLocal=false,sessionAuto=false;
 let nativeGrant:string|undefined;
 let resource:string|undefined,command:string|undefined,task=false;
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
		if(argument === "--trusted-local"){if(trustedLocal)throw Error("duplicate_trusted_local");trustedLocal=true;continue;}
  if(argument === "--session-auto"){if(sessionAuto)throw Error("duplicate_session_auto");sessionAuto=true;continue;}
  if(argument === "--native-sandbox"){if(nativeSandbox)throw Error("duplicate_native_sandbox");nativeSandbox=true;continue;}
		if(argument === "--native-offline"){if(nativeOffline)throw Error("duplicate_native_offline");nativeOffline=true;continue;}
  const value = args[index + 1];
  if (argument === "--mcp-report") {
    const server = value, tool = args[index + 2];
    if (mcpReport || !server || !tool || ![server, tool].every(v => /^[a-zA-Z0-9_.-]{1,128}$/.test(v) && !v.startsWith("--")))
      throw Error("expected one --mcp-report SERVER TOOL");
    mcpReport = {server, tool};
    index += 2;
    continue;
  }
  if(argument === "--grant-task"){
   if(task) throw Error("duplicate_grant_scope");
   task=true;continue;
  }
  if(argument === "--native-resource" || argument === "--grant-command"){
   if(!value || value.startsWith("--")) throw Error("missing_grant_argument");
   if(argument === "--native-resource"){if(resource)throw Error("duplicate_resource");resource=value;}
   else {if(command)throw Error("duplicate_grant_command");command=value;}
   index++;continue;
  }
  if(argument === "--native-grant"){
   if(nativeGrant || !value || value.startsWith("--"))throw Error("one --native-grant ORIGIN is supported");
   nativeGrant=privateOrigin(value);index++;continue;
  }
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
	if(trustedLocal && (nativeSandbox || nativeOffline || nativeGrant || resource || sandboxRoot || sessionAuto)) throw Error("--trusted-local conflicts with sandbox options");
 if (mcpReport && sandboxRoot) throw Error("--mcp-report uses a host process and cannot run inside the Docker profile");
 if(sessionAuto && (sandboxRoot || nativeGrant || resource)) throw Error("--session-auto requires native sandbox without resource grants");
 if ((nativeOffline || nativeGrant) && !nativeSandbox) throw Error("--native-offline/--native-grant require --native-sandbox");
 if ((resource || command || task) && (!nativeSandbox || !resource || (task ? command !== undefined : !command))) throw Error("credential grant requires --native-sandbox --native-resource ID and an exact --grant-command or --grant-task");
 if (nativeOffline && nativeGrant) throw Error("--native-offline cannot grant a network service");
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
  mcpReport,sandboxRoot,sandboxInputs,nativeSandbox:nativeSandbox||(!trustedLocal&&!sandboxRoot),sessionAuto,nativeOffline,nativeGrant,credentialSelection:resource?{resource,command,task}:undefined,
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
	/** Trusted composition seam for controlled DNS fixtures. Public address checks still apply. */
 readonly resolveNetworkName?: ResolveAddresses;
 readonly createTools?: typeof createPanTrustedLocalTools;
	readonly startTui?: typeof runTui;
	/** Optional presentation factory; execution stays in Session. */
	readonly createPresentation?: typeof createCompactPresentation;
}

// Archives may not exist yet. Resolve their existing ancestors and reject dangling links.
async function physicalPath(path: string): Promise<string> {
	try {
		await lstat(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path === dirname(path)) throw error;
		return join(await physicalPath(dirname(path)), basename(path));
	}
	return realpath(path);
}

function containsPath(parent: string, path: string): boolean {
	const suffix = relative(parent, path);
	return suffix !== ".." && !suffix.startsWith(".." + sep);
}

export async function runCli(args: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
	const output = dependencies.output ?? process.stdout;
	const writeLine = (line: string): void => {
		output.write(`${line}\n`);
	};
  if (args[0] === "mcp") {
    try { writeLine(await reportCommand(args.slice(1), dependencies.home)); return 0; }
    catch (error) { writeLine("MCP failed: " + terminalText(error instanceof Error ? error.message : "unknown")); return 2; }
  }
	if (args[0] === 'trust') {
    try {
      if (args[1] !== '--workspace' || !args[2] || !(args.length === 3 || (args.length === 5 && args[3] === '--approve'))) throw Error("usage: pan-agent trust --workspace PATH [--approve REVIEW_HASH]");
      const trust = workspaceTrust(args[2], dependencies.home, args[4]);
      writeLine(JSON.stringify({workspace: trust.root, review: trust.revision, requested: trust.declared, eligible: trust.eligible}, null, 2));
      return 0;
    } catch(error) {writeLine("Trust review failed: " + terminalText(String(error))); return 2;}
  }
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
	const input = dependencies.input ?? process.stdin;
	const terminal = (input as NodeJS.ReadStream).isTTY === true && (output as NodeJS.WriteStream).isTTY === true;
	// The installed launcher supplies --kernel native even when invoked without options.
	const bare = terminal && args.length === 2 && args[0] === "--kernel" && args[1] === "native";
	const home = dependencies.home ?? homedir();
	let workspace = resolve(configuration.workspace ?? process.cwd());
	try {
		const info = await stat(workspace);
		if (!info.isDirectory()) throw new Error("path is not a directory");
	} catch (error) {
		writeLine(`Validation failed: workspace is not an existing directory: ${terminalText(workspace)}`);
		return 2;
	}
	const memoryRoot = resolve(configuration.memoryRoot ?? resolve(home, ".pan-agent", "archives"));
	let archiveStore;
	try {
		let physicalWorkspace = await realpath(workspace);
		const archive = await physicalPath(memoryRoot);
		const runs = await physicalPath(join(memoryRoot, "runs"));
		const physicalHome = await realpath(home);
		const homeLaunch = bare && physicalWorkspace === physicalHome;
		if (homeLaunch) {
			workspace = join(physicalHome, "pan-workspace");
			physicalWorkspace = await physicalPath(workspace);
			if (physicalWorkspace !== workspace || archive !== join(physicalHome, ".pan-agent", "archives") || runs !== join(archive, "runs")) {
				throw new Error("home launch requires ordinary workspace and archive directories; remove the symlink or select another project");
			}
		}
		if ([archive, runs].some(path => containsPath(physicalWorkspace, path) || containsPath(path, physicalWorkspace))) {
			throw new Error("--memory-root must be disjoint from --workspace. Choose a project subdirectory or pass --memory-root outside the workspace.");
		}
		if (homeLaunch) {
			await mkdir(workspace, { recursive: true, mode: 0o700 });
			const info = await lstat(workspace);
			if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o022) || await realpath(workspace) !== workspace) {
				throw new Error("home workspace must be an ordinary directory owned by you and writable only by you");
			}
			writeLine(`Home launch workspace: ${terminalText(workspace)} (reused on your next home launch)`);
		}
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
 let fallback:ManualFallback|undefined;
 const sandbox=configuration.sandboxRoot?new SandboxSession({stateRoot:resolve(configuration.sandboxRoot),inputs:configuration.sandboxInputs},writeLine):undefined;
 const presentation: CompactPresentation = (dependencies.createPresentation ?? createCompactPresentation)(writeLine);
	const shared = {
		onProgress: (progress: import("./runtime/agent-kernel.ts").SessionProgress) => presentation.progress?.(progress),
		onProgressError: () => {
			if (presentation.progressError) presentation.progressError();
			else writeLine("Display error: progress observer failed; execution continues.");
		},
		systemPrompt: (configuration.nativeSandbox?"You are a coding agent in a shared live workspace. Use typed read/write/edit/bash tools and observations; protected/outside files are denied, Shell and descendants use a fixed OS sandbox. "+(configuration.nativeOffline?"Networking is offline.":"Use pan-fetch URL for bounded HTTP(S) GET and PAN_LOCAL_SOCKETS for local Unix services.")+" On native setup failure only the operator may start a fresh task with manual host fallback for reviewed workspace files and exact pwd. No retrieval. Return accurate results; never print secrets.":GENERAL_AGENT_SYSTEM_PROMPT)+(sandbox?"\nTools run ONLY in an isolated Docker workspace /workspace/task. Selected inputs are /inputs, read-only. No retrieval or host tool access. Each new task gets a new workspace.":""),
		memory: { archiveStore, runbook: () => loadRunbook(RUNBOOK_PATH) },
		onObservation(observation: SessionObservation) {
			observeSafely(presentation, observation, writeLine);
		},
	};
	let session: GeneralAgentSession;
  let reportNotice: string | undefined;
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
	let credentialGrant: WorkspaceGrant | undefined;
  try {
    const home = dependencies.home ?? homedir();
    const trust = workspaceTrust(workspace, home);
    if (trust.enrolled && !configuration.nativeSandbox) throw Error("enrolled workspace requires --native-sandbox");
    if (configuration.credentialSelection) {
      credentialGrant = new WorkspaceGrant(workspace, home, configuration.credentialSelection, settings?.protectedPaths ?? [], writeLine);
      writeLine("Native credential grant: " + configuration.credentialSelection.resource +
        (configuration.credentialSelection.task ? " for first task" : " for one exact command in first task") + "; granted command output suppressed.");
    }
  } catch(error) {writeLine("Trust validation failed: " + terminalText(String(error))); return 2;}
  const firstRunInput = input;
	const recover = bare && settings?.credentialSource === "environment" && !process.env[providerCredentialVariable(settings.provider)]?.trim();
	if ((!settings || recover) && !dependencies.createNativeAdapter && (firstRunInput as NodeJS.ReadStream).isTTY === true) {
		try {
			settings = await runFirstRunConfiguration({
				input: firstRunInput,
				output,
				home: dependencies.home,
				saveCredential: dependencies.saveCredential,
				keychainReference: dependencies.keychainReference,
			}, recover ? "recover" : "configure");
		} catch (error) {
			writeLine(`Configuration failed: ${terminalText(error instanceof Error ? error.message : "unknown")}`);
			return 2;
		}
	}
	const selectedProvider = settings?.provider ?? "deepseek";
	if (selectedProvider === "kimi-code" && (args.includes("--model") || args.includes("--thinking"))) {
		writeLine("Validation failed: kimi-code uses saved model/thinking settings; run pan-agent configure and remove --model/--thinking");
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
		nativeSandbox=configuration.nativeSandbox?new NativeSandbox({workspace,stateRoot:resolve(memoryRoot,"native-sandbox"),network:configuration.nativeOffline?"offline":"public",privateGrant:configuration.nativeGrant,credentialGrant,resolveNetworkName:dependencies.resolveNetworkName,protectedPaths:settings?.protectedPaths,notify:writeLine}):undefined;
        if(nativeSandbox) {
         const home=dependencies.home??homedir();
         const operatorAllowed=((dependencies.input??process.stdin) as NodeJS.ReadStream).isTTY===true && (output as NodeJS.WriteStream).isTTY===true && !configuration.sessionAuto && !configuration.credentialSelection && !configuration.nativeGrant;
         fallback=new ManualFallback(nativeSandbox, workspace, home, settings?.protectedPaths??[],operatorAllowed,configuration.sessionAuto===true);
        }
        const trustedLocal = sandbox??fallback??(dependencies.createTools ? dependencies.createTools(workspace) : createPanTrustedLocalTools(workspace));
		const tools = [...trustedLocal.tools];
        if (!sandbox && !nativeSandbox) tools.push(createRetrievalTool(workspace));
        if (configuration.mcpReport) {
          try {
            const {server, tool} = configuration.mcpReport;
            tools.push(await createReportTool(configuration.mcpReport, workspace, dependencies.home, tools,
              () => fallback?.identity.executionMode === "host-fallback"));
            reportNotice = `Local MCP report: ${server}/${tool} · approve each call`;
          } catch (error) {
            reportNotice = "Local MCP report disabled: " + terminalText(error instanceof Error ? error.message : "unavailable");
          }
        }
        session = new GeneralAgentSession({
			...shared,
            executionBoundary:sandbox??fallback,
			kernel: "native",
			adapter,
			tools,
			authorization: {sessionAuto:configuration.sessionAuto, protectedPaths: settings?.protectedPaths, permissions: settings?.permissions },
			...(adapter instanceof PanKimiModelAdapter ? { cleanup: () => adapter.dispose() } : {}),
		});
		provider = adapter.providerId;
		model = adapter.modelId;
		thinking = adapter.reasoningLevel;
	}

	writeLine(`Archives: ${terminalText(memoryRoot)}`);
	const credentialEnv = providerCredentialVariable(selectedProvider);
	writeLine(credentialSource === "keychain"
		? `CREDENTIAL keychain (macOS Keychain service ${keychainReference.service} account ${keychainReference.account}; retrieved only when a Provider call is made)`
		: `CREDENTIAL environment ${credentialEnv} (required at task time; never saved)`);
	return (dependencies.startTui ?? runTui)({
  input: dependencies.input,
  reportNotice,
  sessionAuto:configuration.sessionAuto,
  fallback,
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
