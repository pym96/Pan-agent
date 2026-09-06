import type { AssistantMessage, Message, Usage } from "@earendil-works/pi-ai";

export type KernelSelector = "pi" | "native";
export type TerminalStatus = "completed" | "cancelled" | "model_error" | "incomplete";

export type SessionObservation =
	| { type: "run.started"; runId: string; task: string }
	| { type: "model.turn_started"; runId: string; turn: number }
	| {
			type: "model.turn_settled";
			runId: string;
			turn: number;
			provider: string;
			model: string;
			responseId?: string;
			stopReason: string;
			usage: Usage;
			text: string;
	  }
	| { type: "tool.started"; runId: string; toolCallId: string; toolName: string; arguments: unknown }
	| {
			type: "tool.settled";
			runId: string;
			toolCallId: string;
			toolName: string;
			isError: boolean;
			text: string;
	  }
	| { type: "run.terminal"; runId: string; status: TerminalStatus; reason: string };

export type ObservationSink = (observation: SessionObservation) => Promise<void> | void;

export interface KernelLimits {
	readonly maxModelTurns: number;
	readonly maxToolSteps: number;
}

export const DEFAULT_KERNEL_LIMITS: KernelLimits = {
	maxModelTurns: 64,
	// Preserve the accepted Pi default while allowing an explicit finite budget.
	maxToolSteps: Number.MAX_SAFE_INTEGER,
};

export const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function addUsage(left: Usage, right: Usage): Usage {
	const cacheWrite1h = left.cacheWrite1h === undefined && right.cacheWrite1h === undefined
		? undefined
		: (left.cacheWrite1h ?? 0) + (right.cacheWrite1h ?? 0);
	const reasoning = left.reasoning === undefined && right.reasoning === undefined
		? undefined
		: (left.reasoning ?? 0) + (right.reasoning ?? 0);
	return {
		input: left.input + right.input,
		output: left.output + right.output,
		cacheRead: left.cacheRead + right.cacheRead,
		cacheWrite: left.cacheWrite + right.cacheWrite,
		...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
		...(reasoning === undefined ? {} : { reasoning }),
		totalTokens: left.totalTokens + right.totalTokens,
		cost: {
			input: left.cost.input + right.cost.input,
			output: left.cost.output + right.cost.output,
			cacheRead: left.cost.cacheRead + right.cost.cacheRead,
			cacheWrite: left.cost.cacheWrite + right.cost.cacheWrite,
			total: left.cost.total + right.cost.total,
		},
	};
}

export function assistantPublicText(message: AssistantMessage): string {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
}

export interface KernelRunRequest {
	readonly runId: string;
	readonly task: string;
	readonly systemPrompt: string;
	readonly onObservation: ObservationSink;
}

export interface KernelRunResult {
	readonly status: TerminalStatus;
	readonly reason: string;
	readonly finalText: string;
	readonly modelCalls: number;
	readonly toolCalls: number;
	readonly usage: Usage;
}

/**
 * Stable orchestration seam below GeneralAgentSession.
 *
 * A Kernel owns iterative model/tool semantics, retained Context, cancellation,
 * budgets, terminal classification and canonical model/tool observations. It
 * does not own Provider wire translation, concrete tools, durable memory, TUI,
 * evaluation or product composition.
 */
export interface AgentKernel {
	readonly kind: KernelSelector;
	readonly isRunning: boolean;
	readonly contextMessageCount: number;
	runTask(request: KernelRunRequest): Promise<KernelRunResult>;
	cancel(): void;
	close(): Promise<void>;
}

export function resolveKernelLimits(input: Partial<KernelLimits> = {}): KernelLimits {
	const limits = {
		maxModelTurns: input.maxModelTurns ?? DEFAULT_KERNEL_LIMITS.maxModelTurns,
		maxToolSteps: input.maxToolSteps ?? DEFAULT_KERNEL_LIMITS.maxToolSteps,
	};
	for (const [name, value] of Object.entries(limits)) {
		if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
			throw new Error(`${name} must be a positive integer`);
		}
	}
	return limits;
}

export function isKernelSelector(value: string): value is KernelSelector {
	return value === "pi" || value === "native";
}

/** Validate externally seeded canonical Context before any model, tool, or archive effect. */
export function validateSeededMessages(messages: readonly Message[]): void {
	const pending = new Map<string, string>();
	const settled = new Set<string>();
	for (const message of messages) {
		if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				if (pending.has(block.id) || settled.has(block.id)) throw new Error(`duplicate_tool_call_id:${block.id}`);
				pending.set(block.id, block.name);
			}
			continue;
		}
		if (message.role !== "toolResult") continue;
		const expectedName = pending.get(message.toolCallId);
		if (expectedName === undefined) throw new Error(`orphan_tool_result:${message.toolCallId}`);
		if (expectedName !== message.toolName) throw new Error(`tool_result_name_mismatch:${message.toolCallId}`);
		pending.delete(message.toolCallId);
		settled.add(message.toolCallId);
	}
	const unmatched = pending.keys().next().value as string | undefined;
	if (unmatched !== undefined) throw new Error(`unmatched_tool_call:${unmatched}`);
}
