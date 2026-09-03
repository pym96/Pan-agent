import { randomUUID } from "node:crypto";
import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model, Usage } from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "./model-adapter.ts";
import type { ArchiveSettledState, RunArchiveStore, RunArchiveWriter } from "./run-archive.ts";
import type { RunbookSnapshot } from "./runbook.ts";

const MAX_TURNS_PER_TASK = 64;

function archiveStateFor(status: TerminalStatus): ArchiveSettledState {
	switch (status) {
		case "completed":
			return "terminal";
		case "cancelled":
			return "cancelled";
		case "model_error":
		case "incomplete":
			return "failed";
	}
}

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

export interface TaskRunResult {
	readonly runId: string;
	readonly status: TerminalStatus;
	readonly reason: string;
	readonly finalText: string;
	readonly modelCalls: number;
	readonly toolCalls: number;
	readonly usage: Usage;
	readonly archiveSealed: boolean;
}

export type ObservationSink = (observation: SessionObservation) => Promise<void> | void;

/** Memory-lane binding: every admitted run is durably archived before effects. */
export interface SessionMemory {
	readonly archiveStore: RunArchiveStore;
	/** Resolve the Runbook snapshot in force for each run at its creation. */
	readonly runbook: () => Promise<RunbookSnapshot>;
}

export interface GeneralAgentSessionOptions {
	readonly adapter: PiModelAdapter;
	readonly tools: AgentTool[];
	readonly systemPrompt: string;
	readonly memory: SessionMemory;
	readonly onObservation?: ObservationSink;
	readonly cleanup?: () => Promise<void> | void;
}

const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function addUsage(left: Usage, right: Usage): Usage {
	const cacheWrite1h =
		left.cacheWrite1h === undefined && right.cacheWrite1h === undefined
			? undefined
			: (left.cacheWrite1h ?? 0) + (right.cacheWrite1h ?? 0);
	const reasoning =
		left.reasoning === undefined && right.reasoning === undefined
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

function publicText(message: AssistantMessage): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function resultText(result: unknown): string {
	if (!result || typeof result !== "object" || !("content" in result) || !Array.isArray(result.content)) return "";
	return result.content
		.filter(
			(block): block is { type: "text"; text: string } =>
				typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string",
		)
		.map((block) => block.text)
		.join("\n");
}

function finalAssistant(messages: AgentMessage[]): AssistantMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role === "assistant") return message;
	}
	return undefined;
}

/**
 * Deep Module owning Pi transcript state, tool execution, cancellation and a
 * language-neutral observation Interface. The complete Pi transcript is kept;
 * this tracer bullet performs no application-level truncation or compaction.
 */
export class GeneralAgentSession {
	private readonly agent: Agent;
	private readonly onObservation: ObservationSink;
	private readonly cleanup?: () => Promise<void> | void;
	private readonly memory: SessionMemory;
	private readonly baseSystemPrompt: string;
	private readonly adapterIdentity: {
		readonly provider: string;
		readonly modelId: string;
		readonly thinkingLevel: string;
	};
	private activeRunId?: string;
	private activeWriter?: RunArchiveWriter;
	private archiveChain: Promise<void> = Promise.resolve();
	private archiveError?: unknown;
	private activeTurn = 0;
	private activeToolCalls = 0;
	private activeModelCalls = 0;
	private activeUsage: Usage = EMPTY_USAGE;
	private cancellationRequested = false;
	private closed = false;

	constructor(options: GeneralAgentSessionOptions) {
		this.onObservation = options.onObservation ?? (() => {});
		this.cleanup = options.cleanup;
		this.memory = options.memory;
		this.baseSystemPrompt = options.systemPrompt;
		this.adapterIdentity = {
			provider: options.adapter.providerId,
			modelId: options.adapter.modelId,
			thinkingLevel: options.adapter.thinkingLevel,
		};
		this.agent = new Agent({
			streamFn: options.adapter.streamFn,
			initialState: {
				systemPrompt: options.systemPrompt,
				model: options.adapter.model as Model<string>,
				thinkingLevel: options.adapter.thinkingLevel as ThinkingLevel,
				tools: options.tools,
			},
			sessionId: randomUUID(),
			toolExecution: "sequential",
			shouldStopAfterTurn: () => this.activeTurn >= MAX_TURNS_PER_TASK,
		});
		this.agent.subscribe((event) => this.observe(event));
	}

	get isRunning(): boolean {
		return this.agent.state.isStreaming;
	}

	get contextMessageCount(): number {
		return this.agent.state.messages.length;
	}

	async runTask(task: string): Promise<TaskRunResult> {
		if (this.closed) throw new Error("GeneralAgentSession is closed");
		if (task.trim().length === 0) throw new Error("Task must not be blank");
		if (this.isRunning) throw new Error("A task is already running");

		// Archive-before-side-effect: the durable run.started record is
		// appended and flushed before any Provider exchange or tool effect.
		// The Runbook snapshot in force at run creation is resolved per run and
		// bound into both the archive identity and the model-visible prompt.
		const runbook = await this.memory.runbook();
		const writer = await this.memory.archiveStore.beginRun();
		this.activeRunId = writer.runId;
		this.activeWriter = writer;
		this.archiveError = undefined;
		this.activeTurn = 0;
		this.activeToolCalls = 0;
		this.activeModelCalls = 0;
		this.activeUsage = EMPTY_USAGE;
		this.cancellationRequested = false;
		this.agent.state.systemPrompt = `${this.baseSystemPrompt}\n\nRUNBOOK (revision ${runbook.revision}):\n${runbook.content}`;
		await this.emit(
			{ type: "run.started", runId: writer.runId, task },
			{
				type: "run.started",
				runId: writer.runId,
				task,
				provider: this.adapterIdentity.provider,
				model: this.adapterIdentity.modelId,
				thinking: this.adapterIdentity.thinkingLevel,
				runbook_revision: runbook.revision,
			},
		);
		try {
			await this.agent.prompt(task);
		} catch (error) {
			await this.settleArchive("failed", `prompt_error: ${error instanceof Error ? error.message : String(error)}`);
			this.activeWriter = undefined;
			throw error;
		}
		if (this.archiveError) {
			await this.settleArchive("failed", "archive_append_error");
			this.activeWriter = undefined;
			throw this.archiveError instanceof Error
				? this.archiveError
				: new Error(`archive append failed: ${String(this.archiveError)}`);
		}

		const final = finalAssistant(this.agent.state.messages);
		const finalText = final ? publicText(final) : "";
		let status: TerminalStatus;
		let reason: string;
		if (this.cancellationRequested || final?.stopReason === "aborted") {
			status = "cancelled";
			reason = final?.errorMessage ?? "operator_cancelled";
		} else if (!final || final.stopReason === "error") {
			status = "model_error";
			reason = final?.errorMessage ?? "missing_final_assistant_message";
		} else if (final.stopReason === "length" || this.activeTurn >= MAX_TURNS_PER_TASK) {
			status = "incomplete";
			reason = final.stopReason === "length" ? "model_output_length" : "turn_limit";
		} else {
			status = "completed";
			reason = "assistant_completed";
		}

		const runId = this.activeRunId;
		await this.emit({ type: "run.terminal", runId, status, reason });
		const sealed = await this.settleArchive(archiveStateFor(status), reason);
		this.activeWriter = undefined;
		return {
			runId,
			status,
			reason,
			finalText,
			modelCalls: this.activeModelCalls,
			toolCalls: this.activeToolCalls,
			usage: this.activeUsage,
			archiveSealed: sealed !== undefined,
		};
	}

	cancel(): void {
		if (!this.isRunning) return;
		this.cancellationRequested = true;
		this.agent.abort();
	}

	async close(): Promise<void> {
		if (this.closed) return;
		if (this.isRunning) {
			this.cancel();
			await this.agent.waitForIdle();
		}
		await this.cleanup?.();
		this.closed = true;
	}

	private async emit(observation: SessionObservation, archiveRecord?: Record<string, unknown>): Promise<void> {
		if (this.activeWriter) {
			await this.archiveAppend(archiveRecord ?? (observation as unknown as Record<string, unknown>));
		}
		await this.onObservation(observation);
	}

	/** Serialize archive appends so durable causal order matches emit order. */
	private archiveAppend(record: Record<string, unknown>): Promise<void> {
		const writer = this.activeWriter;
		if (!writer) return Promise.resolve();
		const appended = this.archiveChain.then(() => writer.append(record));
		this.archiveChain = appended.catch(() => {});
		return appended;
	}

	private async settleArchive(
		state: ArchiveSettledState,
		reason: string,
	): Promise<Awaited<ReturnType<RunArchiveWriter["settle"]>> | undefined> {
		await this.archiveChain;
		const writer = this.activeWriter;
		if (!writer) return undefined;
		return writer.settle(state, reason);
	}

	private async observe(event: AgentEvent): Promise<void> {
		const runId = this.activeRunId;
		if (!runId) return;
		try {
			await this.observeEvent(event, runId);
		} catch (error) {
			// An archive failure must not silently drop records: flag it, abort
			// the model loop, and let runTask settle the run as failed.
			this.archiveError = error;
			this.agent.abort();
		}
	}

	private async observeEvent(event: AgentEvent, runId: string): Promise<void> {
		switch (event.type) {
			case "turn_start":
				this.activeTurn += 1;
				await this.emit({ type: "model.turn_started", runId, turn: this.activeTurn });
				break;
			case "message_end":
				if (event.message.role === "assistant") {
					this.activeModelCalls += 1;
					this.activeUsage = addUsage(this.activeUsage, event.message.usage);
					await this.emit({
						type: "model.turn_settled",
						runId,
						turn: this.activeTurn,
						provider: event.message.provider,
						model: event.message.responseModel ?? event.message.model,
						responseId: event.message.responseId,
						stopReason: event.message.stopReason,
						usage: event.message.usage,
						text: publicText(event.message),
					});
				}
				break;
			case "tool_execution_start":
				this.activeToolCalls += 1;
				await this.emit({
					type: "tool.started",
					runId,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					arguments: event.args,
				});
				break;
			case "tool_execution_end":
				await this.emit({
					type: "tool.settled",
					runId,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					isError: event.isError,
					text: resultText(event.result),
				});
				break;
		}
	}
}

export const GENERAL_AGENT_SYSTEM_PROMPT = `You are a general coding agent operating in a Human-selected trusted local workspace.

Use Pi's typed read, write, edit, and bash tools to inspect and change the workspace, run programs, install task-scoped dependencies when needed, and use each Observation to decide the next Action. Return a concise final answer only after the task is complete or clearly blocked.

The bash tool is trusted-local: it runs with the host user's authority. The selected workspace is its default cwd, not a security boundary or OS sandbox. Do not access unrelated host paths unless the Human's task explicitly requires it. Never print credentials or hidden reasoning. Treat tool errors as observations, correct the plan when safe, and report unresolved failures accurately.`;
