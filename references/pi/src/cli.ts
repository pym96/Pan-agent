import { stat } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Writable } from "node:stream";
import { isKernelSelector, type KernelSelector } from "../../../typescript/src/kernels/agent-kernel.ts";
import {
	createPiDeepSeekAdapter,
	type PiModelAdapter,
} from "./model-adapter.ts";
import {
	DEFAULT_DEEPSEEK_PROFILE,
	isDeepSeekModelId,
	type DeepSeekProfile,
} from "../../../typescript/src/deepseek-profile.ts";
import type { ModelAdapter } from "../../../typescript/src/model-adapter-contract.ts";
import { createPanDeepSeekAdapter } from "../../../typescript/src/pan-deepseek-model-adapter.ts";
import { RunArchiveStore } from "../../../typescript/src/run-archive.ts";
import { loadRunbook } from "../../../typescript/src/runbook.ts";
import { createPanTrustedLocalTools, PAN_TRUSTED_LOCAL_LABEL } from "../../../typescript/src/pan-trusted-local-tools.ts";
import { GENERAL_AGENT_SYSTEM_PROMPT, GeneralAgentSession } from "./session.ts";
import { createTrustedLocalTools, TRUSTED_LOCAL_SHELL_LABEL } from "./tools.ts";
import { renderObservation, runTui } from "../../../typescript/src/tui.ts";

export const CLI_USAGE = `Usage:
  npm run agent -- --workspace /absolute/path --memory-root /absolute/path [--kernel pi|native] [--model deepseek-v4-flash|deepseek-v4-pro] [--thinking low|high|max]

The General Agent defaults to PiKernel and accepts explicit --kernel native; NativeKernel receives Pan-owned typed read/write/edit/bash implementations directly.
The bash tool is trusted-local: it has host-user authority; --workspace sets cwd but is not containment or an OS sandbox.
Every admitted run is durably archived under --memory-root (must be disjoint from the workspace) with the current Runbook revision; :runs and :replay inspect sealed archives with zero Provider calls or tool effects.
No Provider call occurs for --help, startup, cancellation before confirmation, or TUI commands.`;

const RUNBOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "typescript", "RUNBOOK.md");

export interface CliConfiguration {
	readonly help: boolean;
	readonly workspace?: string;
	readonly memoryRoot?: string;
	readonly kernel: KernelSelector;
	readonly profile: DeepSeekProfile;
}

export function parseCliArgs(args: readonly string[]): CliConfiguration {
	let workspace: string | undefined;
	let memoryRoot: string | undefined;
	let kernel: string = "pi";
	let modelId: string = DEFAULT_DEEPSEEK_PROFILE.modelId;
	let thinkingLevel: string = DEFAULT_DEEPSEEK_PROFILE.thinkingLevel;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--help" || argument === "-h") {
			return { help: true, kernel: "pi", profile: DEFAULT_DEEPSEEK_PROFILE };
		}
		const value = args[index + 1];
		if (argument === "--workspace" || argument === "--memory-root" || argument === "--kernel" || argument === "--model" || argument === "--thinking") {
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
			index += 1;
			if (argument === "--workspace") workspace = value;
			if (argument === "--memory-root") memoryRoot = value;
			if (argument === "--kernel") kernel = value;
			if (argument === "--model") modelId = value;
			if (argument === "--thinking") thinkingLevel = value;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!isKernelSelector(kernel)) throw new Error(`Unsupported kernel: ${kernel}`);
	if (!isDeepSeekModelId(modelId)) throw new Error(`Unsupported DeepSeek model: ${modelId}`);
	if (thinkingLevel !== "low" && thinkingLevel !== "high" && thinkingLevel !== "max") {
		throw new Error(`Unsupported thinking level: ${thinkingLevel}`);
	}
	return {
		help: false,
		workspace,
		memoryRoot,
		kernel,
		profile: { modelId, thinkingLevel },
	};
}

export interface CliDependencies {
	readonly output?: Writable;
	/** Transitional Pi-only injection seam retained for the default reference path. */
	readonly createAdapter?: (profile: DeepSeekProfile) => PiModelAdapter;
	/** Pan-owned injection seam for deterministic Native composition tests. */
	readonly createNativeAdapter?: (profile: DeepSeekProfile) => ModelAdapter;
	readonly startTui?: typeof runTui;
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
		writeLine(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
		writeLine(CLI_USAGE);
		return 2;
	}
	if (configuration.help) {
		writeLine(CLI_USAGE);
		return 0;
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
		writeLine(`Validation failed: workspace is not an existing directory: ${workspace}`);
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
		writeLine(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
		return 2;
	}

	const shared = {
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		memory: { archiveStore, runbook: () => loadRunbook(RUNBOOK_PATH) },
		onObservation(observation: Parameters<typeof renderObservation>[0]) {
			for (const line of renderObservation(observation)) writeLine(line);
		},
	};
	let session: GeneralAgentSession;
	let boundaryLabel: string;
	let provider: string;
	let model: string;
	let thinking: string;
	if (configuration.kernel === "native") {
		const adapterFactory = dependencies.createNativeAdapter ?? createPanDeepSeekAdapter;
		const adapter = adapterFactory(configuration.profile);
		const trustedLocal = createPanTrustedLocalTools(workspace);
		session = new GeneralAgentSession({
			...shared,
			kernel: "native",
			adapter,
			tools: trustedLocal.tools,
		});
		boundaryLabel = PAN_TRUSTED_LOCAL_LABEL;
		provider = adapter.providerId;
		model = adapter.modelId;
		thinking = adapter.reasoningLevel;
	} else {
		const adapterFactory = dependencies.createAdapter ?? createPiDeepSeekAdapter;
		const adapter = adapterFactory(configuration.profile);
		const trustedLocal = createTrustedLocalTools(workspace);
		session = new GeneralAgentSession({
			...shared,
			kernel: "pi",
			adapter,
			tools: trustedLocal.tools,
			cleanup: () => trustedLocal.environment.cleanup(),
		});
		boundaryLabel = TRUSTED_LOCAL_SHELL_LABEL;
		provider = adapter.providerId;
		model = adapter.modelId;
		thinking = adapter.thinkingLevel;
	}
	writeLine(`BOUNDARY ${boundaryLabel}`);
	writeLine(`MEMORY ${memoryRoot}`);
	return (dependencies.startTui ?? runTui)({
		session,
		provider,
		model,
		thinking,
		workspace,
		output,
		archiveStore,
	});
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
	process.exitCode = await runCli(process.argv.slice(2));
}
