import type { ModelTextDelta } from "../protocol/model-adapter-contract.ts";
import {
	addUsage,
	ZERO_REPORTED_USAGE,
	type JsonValue,
	type ModelFailure,
	type ResponseIdentity,
	type Usage,
} from "../protocol/canonical-protocol.ts";

export type KernelSelector = "pi" | "native";
export type TerminalStatus = "completed" | "cancelled" | "model_error" | "incomplete";

export type SessionObservation =
	| { type: "run.started"; runId: string; task: string }
	| { type: "model.turn_started"; runId: string; turn: number }
	| {
			type: "model.turn_settled";
			runId: string;
			turn: number;
			provider?: string;
			model?: string;
			responseId?: string;
			identity: ResponseIdentity;
			stopReason: string;
			usage: Usage;
			text: string;
			failure?: ModelFailure;
	  }
	| { type: "tool.started"; runId: string; toolCallId: string; toolName: string; arguments: unknown }
	| {
			type: "tool.settled";
			runId: string;
			toolCallId: string;
			toolName: string;
			isError: boolean;
			text: string;
			details?: JsonValue;
	  }
	| { type: "run.terminal"; runId: string; status: TerminalStatus; reason: string };

export type ObservationSink = (observation: SessionObservation) => Promise<void> | void;

export interface KernelLimits {
	readonly mode?: "bounded" | "metered";
	readonly maxModelTurns: number | null;
	readonly maxToolSteps: number | null;
}

export const DEFAULT_KERNEL_LIMITS: KernelLimits = {
	maxModelTurns: 64,
	// Preserve the accepted Pi default while allowing an explicit finite budget.
	maxToolSteps: Number.MAX_SAFE_INTEGER,
};

export const EMPTY_USAGE = ZERO_REPORTED_USAGE;
export { addUsage };

/** Transient route, deliberately separate from persisted SessionObservation. */
export type SessionProgress = ModelTextDelta & { readonly runId: string; readonly turn: number };
export type ProgressSink = (progress: SessionProgress) => void;

export interface KernelRunRequest {
	readonly onProgress?: ProgressSink;
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
	if (input.mode === "metered") {
        if (input.maxModelTurns !== null || input.maxToolSteps !== null) throw new Error("metered limits must explicitly be null");
        return { mode: "metered", maxModelTurns: null, maxToolSteps: null };
    }
    if (input.mode !== undefined && input.mode !== "bounded") throw new Error("unknown limit mode");
    if (input.maxModelTurns === null || input.maxToolSteps === null) throw new Error("bounded limits cannot be null");
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
