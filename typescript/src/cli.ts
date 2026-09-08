import { stat } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Writable } from "node:stream";
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

export const CLI_USAGE = `Usage:
  npm run agent -- --workspace /absolute/path --memory-root /absolute/path --kernel native [--model deepseek-v4-flash|deepseek-v4-pro] [--thinking low|high|max] [--max-attachment-bytes INTEGER]

The Product requires explicit --kernel native; NativeKernel receives Pan-owned typed read/write/edit/bash implementations directly.
The bash tool is trusted-local: it has host-user authority; --workspace sets cwd but is not containment or an OS sandbox.
Every admitted run is durably archived under --memory-root (must be disjoint from the workspace) with the current Runbook revision; :details, :runs and :replay inspect sealed archives with zero Provider calls or tool effects.
Attachments use selection-time UTF-8 snapshots; default aggregate maxAttachmentBytes=1048576 (1 MiB local byte policy, not a model token limit). Override with --max-attachment-bytes; never truncates.
No Provider call occurs for --help, startup, cancellation before confirmation, or TUI commands.`;

const RUNBOOK_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "RUNBOOK.md");

export interface CliConfiguration {
	readonly help: boolean;
	readonly maxAttachmentBytes?: number;
	readonly workspace?: string;
	readonly memoryRoot?: string;
	readonly kernel: KernelSelector;
	readonly profile: DeepSeekProfile;
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
	/** Pan-owned injection seam for deterministic Native composition tests. */
	readonly createNativeAdapter?: (profile: DeepSeekProfile) => ModelAdapter;
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
	{
		const adapterFactory = dependencies.createNativeAdapter ?? createPanDeepSeekAdapter;
		const adapter = adapterFactory(configuration.profile);
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
