import {
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	type AgentHarnessTool,
	type AgentTool,
	type ExecutionToolContext,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { TSchema } from "@earendil-works/pi-ai";

export const TRUSTED_LOCAL_SHELL_LABEL =
	"trusted-local shell: host-user authority; selected workspace is the default cwd, not an OS sandbox";

const SAFE_SHELL_ENVIRONMENT_KEYS = [
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LOGNAME",
	"PATH",
	"SHELL",
	"TERM",
	"TMPDIR",
	"USER",
] as const;

function safeShellEnvironment(source: Readonly<NodeJS.ProcessEnv>): Record<string, string> {
	const environment: Record<string, string> = {};
	for (const key of SAFE_SHELL_ENVIRONMENT_KEYS) {
		const value = source[key];
		if (value !== undefined) environment[key] = value;
	}
	return environment;
}

function bindExecutionTool<TParameters extends TSchema, TDetails>(
	tool: AgentHarnessTool<ExecutionToolContext, TParameters, TDetails>,
	context: ExecutionToolContext,
): AgentTool<TParameters, TDetails> {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		prepareArguments: tool.prepareArguments,
		executionMode: "sequential",
		execute: (toolCallId, params, signal, onUpdate) =>
			tool.execute(toolCallId, params, signal, onUpdate, context),
	};
}

export interface TrustedLocalTools {
	readonly tools: AgentTool[];
	readonly environment: NodeExecutionEnv;
}

/**
 * Bind Pi's maintained tool Implementations to one selected host cwd.
 * This Interface intentionally does not claim path confinement or OS isolation.
 */
export function createTrustedLocalTools(
	workspace: string,
	sourceEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
): TrustedLocalTools {
	const environment = new NodeExecutionEnv({ cwd: workspace, shellPath: "/bin/bash" });
	const context = { env: environment } satisfies ExecutionToolContext;
	const bash = createBashTool({
		prepare(execution) {
			execution.inheritEnv = false;
			execution.env = safeShellEnvironment(sourceEnvironment);
		},
	});

	return {
		environment,
		tools: [
			bindExecutionTool(createReadTool(), context),
			bindExecutionTool(createWriteTool(), context),
			bindExecutionTool(createEditTool(), context),
			bindExecutionTool(
				{
					...bash,
					label: "trusted-local bash",
					description: `${TRUSTED_LOCAL_SHELL_LABEL}. ${bash.description}`,
				},
				context,
			),
		],
	};
}
