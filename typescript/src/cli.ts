import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { Writable } from "node:stream";
import {
	createPiDeepSeekAdapter,
	DEFAULT_DEEPSEEK_PROFILE,
	isDeepSeekModelId,
	type DeepSeekProfile,
	type PiModelAdapter,
} from "./model-adapter.ts";
import { GENERAL_AGENT_SYSTEM_PROMPT, GeneralAgentSession } from "./session.ts";
import { createTrustedLocalTools, TRUSTED_LOCAL_SHELL_LABEL } from "./tools.ts";
import { renderObservation, runTui } from "./tui.ts";

export const CLI_USAGE = `Usage:
  npm run agent -- --workspace /absolute/path [--model deepseek-v4-flash|deepseek-v4-pro] [--thinking low|high|max]

The General Agent uses Pi-maintained context and typed read/write/edit/bash tools.
The bash tool is trusted-local: it has host-user authority; --workspace sets cwd but is not containment or an OS sandbox.
No Provider call occurs for --help, startup, cancellation before confirmation, or TUI commands.`;

export interface CliConfiguration {
	readonly help: boolean;
	readonly workspace?: string;
	readonly profile: DeepSeekProfile;
}

export function parseCliArgs(args: readonly string[]): CliConfiguration {
	let workspace: string | undefined;
	let modelId: string = DEFAULT_DEEPSEEK_PROFILE.modelId;
	let thinkingLevel: string = DEFAULT_DEEPSEEK_PROFILE.thinkingLevel;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--help" || argument === "-h") {
			return { help: true, profile: DEFAULT_DEEPSEEK_PROFILE };
		}
		const value = args[index + 1];
		if (argument === "--workspace" || argument === "--model" || argument === "--thinking") {
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
			index += 1;
			if (argument === "--workspace") workspace = value;
			if (argument === "--model") modelId = value;
			if (argument === "--thinking") thinkingLevel = value;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!isDeepSeekModelId(modelId)) throw new Error(`Unsupported DeepSeek model: ${modelId}`);
	if (thinkingLevel !== "low" && thinkingLevel !== "high" && thinkingLevel !== "max") {
		throw new Error(`Unsupported thinking level: ${thinkingLevel}`);
	}
	return {
		help: false,
		workspace,
		profile: { modelId, thinkingLevel },
	};
}

export interface CliDependencies {
	readonly output?: Writable;
	readonly createAdapter?: (profile: DeepSeekProfile) => PiModelAdapter;
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

	const workspace = resolve(configuration.workspace);
	try {
		const info = await stat(workspace);
		if (!info.isDirectory()) throw new Error("path is not a directory");
	} catch (error) {
		writeLine(`Validation failed: workspace is not an existing directory: ${workspace}`);
		return 2;
	}

	const adapterFactory = dependencies.createAdapter ?? createPiDeepSeekAdapter;
	const adapter = adapterFactory(configuration.profile);
	const trustedLocal = createTrustedLocalTools(workspace);
	const session = new GeneralAgentSession({
		adapter,
		tools: trustedLocal.tools,
		systemPrompt: GENERAL_AGENT_SYSTEM_PROMPT,
		onObservation(observation) {
			for (const line of renderObservation(observation)) writeLine(line);
		},
		cleanup: () => trustedLocal.environment.cleanup(),
	});
	writeLine(`BOUNDARY ${TRUSTED_LOCAL_SHELL_LABEL}`);
	return (dependencies.startTui ?? runTui)({
		session,
		provider: adapter.providerId,
		model: adapter.modelId,
		thinking: adapter.thinkingLevel,
		workspace,
		output,
	});
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
	process.exitCode = await runCli(process.argv.slice(2));
}
