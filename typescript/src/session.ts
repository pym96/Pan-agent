import type { AgentTool as PanAgentTool } from "./agent-tool.ts";
import type { Message as PanMessage, Usage } from "./canonical-protocol.ts";
import type { ModelAdapter } from "./model-adapter-contract.ts";
import {
	type AgentKernel,
	type KernelLimits,
	type KernelSelector,
	type ObservationSink,
	resolveKernelLimits,
	type SessionObservation,
	type TerminalStatus,
} from "./kernels/agent-kernel.ts";
import { NativeKernel } from "./kernels/native-kernel.ts";
import type { ArchiveSettledState, RunArchiveStore, RunArchiveWriter } from "./run-archive.ts";
import type { RunbookSnapshot } from "./runbook.ts";

export type {
	AgentKernel,
	KernelLimits,
	KernelSelector,
	ObservationSink,
	SessionObservation,
	TerminalStatus,
} from "./kernels/agent-kernel.ts";

function archiveStateFor(status: TerminalStatus): ArchiveSettledState {
	switch (status) {
		case "completed": return "terminal";
		case "cancelled": return "cancelled";
		case "model_error":
		case "incomplete": return "failed";
	}
}

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

/** Memory-lane binding: every admitted run is durably archived before effects. */
export interface SessionMemory {
	readonly archiveStore: RunArchiveStore;
	readonly runbook: () => Promise<RunbookSnapshot>;
}

interface GeneralAgentSessionOptionsBase {
	readonly systemPrompt: string;
	readonly memory: SessionMemory;
	readonly limits?: Partial<KernelLimits>;
	readonly onObservation?: ObservationSink;
	readonly cleanup?: () => Promise<void> | void;
}

/** An independently composed implementation enters only through the existing kernel seam. */
export interface InjectedGeneralAgentSessionOptions extends GeneralAgentSessionOptionsBase {
	readonly kernel: AgentKernel;
	readonly adapterIdentity: { readonly provider: string; readonly modelId: string; readonly thinkingLevel: string };
}

export interface NativeGeneralAgentSessionOptions extends GeneralAgentSessionOptionsBase {
	readonly kernel: "native";
	readonly adapter: ModelAdapter;
	readonly tools: readonly PanAgentTool[];
	readonly initialMessages?: readonly PanMessage[];
}

export type GeneralAgentSessionOptions = InjectedGeneralAgentSessionOptions | NativeGeneralAgentSessionOptions;

/** Product boundary for admission, Runbook binding and durable Run Archive settlement. */
export class GeneralAgentSession {
	private readonly kernel: AgentKernel;
	private readonly onObservation: ObservationSink;
	private readonly cleanup?: () => Promise<void> | void;
	private readonly memory: SessionMemory;
	private readonly baseSystemPrompt: string;
	private readonly adapterIdentity: { readonly provider: string; readonly modelId: string; readonly thinkingLevel: string };
	private activeWriter?: RunArchiveWriter;
	private archiveChain: Promise<void> = Promise.resolve();
	private archiveError?: unknown;
	private closed = false;

	constructor(options: GeneralAgentSessionOptions) {
		const selector = (options as { readonly kernel?: unknown }).kernel;
		if (selector === undefined) throw new Error("kernel_selection_required: select kernel native explicitly");
		if (selector === "pi") throw new Error("kernel_not_in_product: see references/pi/README.md");
		if (selector !== "native" && !(selector !== null && typeof selector === "object"
			&& ((selector as AgentKernel).kind === "pi" || (selector as AgentKernel).kind === "native")
			&& typeof (selector as AgentKernel).runTask === "function"
			&& typeof (selector as AgentKernel).cancel === "function"
			&& typeof (selector as AgentKernel).close === "function")) {
			throw new Error(`Unsupported kernel: ${String(selector)}`);
		}
		const limits = resolveKernelLimits(options.limits);
		if (selector === "native") {
			const nativeOptions = options as NativeGeneralAgentSessionOptions;
			this.kernel = new NativeKernel({
				adapter: nativeOptions.adapter,
				tools: nativeOptions.tools,
				limits,
				initialMessages: nativeOptions.initialMessages,
			});
		} else {
			this.kernel = selector as AgentKernel;
		}
		this.onObservation = options.onObservation ?? (() => {});
		this.cleanup = options.cleanup;
		this.memory = options.memory;
		this.baseSystemPrompt = options.systemPrompt;
		this.adapterIdentity = selector === "native"
			? {
				provider: (options as NativeGeneralAgentSessionOptions).adapter.providerId,
				modelId: (options as NativeGeneralAgentSessionOptions).adapter.modelId,
				thinkingLevel: (options as NativeGeneralAgentSessionOptions).adapter.reasoningLevel,
			}
			: (options as InjectedGeneralAgentSessionOptions).adapterIdentity;
	}

	get isRunning(): boolean { return this.kernel.isRunning; }
	get kernelKind(): KernelSelector { return this.kernel.kind; }
	get contextMessageCount(): number { return this.kernel.contextMessageCount; }

	async runTask(task: string): Promise<TaskRunResult> {
		if (this.closed) throw new Error("GeneralAgentSession is closed");
		if (task.trim().length === 0) throw new Error("Task must not be blank");
		if (this.isRunning) throw new Error("A task is already running");

		const runbook = await this.memory.runbook();
		const writer = await this.memory.archiveStore.beginRun();
		this.activeWriter = writer;
		this.archiveChain = Promise.resolve();
		this.archiveError = undefined;
		await this.emit(
			{ type: "run.started", runId: writer.runId, task },
			{
				type: "run.started", runId: writer.runId, task,
				provider: this.adapterIdentity.provider, model: this.adapterIdentity.modelId,
				thinking: this.adapterIdentity.thinkingLevel, runbook_revision: runbook.revision,
			},
		);

		let outcome;
		try {
			outcome = await this.kernel.runTask({
				runId: writer.runId,
				task,
				systemPrompt: `${this.baseSystemPrompt}\n\nRUNBOOK (revision ${runbook.revision}):\n${runbook.content}`,
				onObservation: (observation) => this.emit(observation),
			});
		} catch (error) {
			await this.settleArchive("failed", `kernel_error: ${error instanceof Error ? error.message : String(error)}`);
			this.activeWriter = undefined;
			throw error;
		}
		if (this.archiveError) {
			await this.settleArchive("failed", "archive_append_error");
			this.activeWriter = undefined;
			throw this.archiveError instanceof Error ? this.archiveError : new Error(`archive append failed: ${String(this.archiveError)}`);
		}

		await this.emit({ type: "run.terminal", runId: writer.runId, status: outcome.status, reason: outcome.reason });
		const sealed = await this.settleArchive(archiveStateFor(outcome.status), outcome.reason);
		this.activeWriter = undefined;
		return { runId: writer.runId, ...outcome, archiveSealed: sealed !== undefined };
	}

	cancel(): void { this.kernel.cancel(); }

	async close(): Promise<void> {
		if (this.closed) return;
		await this.kernel.close();
		await this.cleanup?.();
		this.closed = true;
	}

	private async emit(observation: SessionObservation, archiveRecord?: Record<string, unknown>): Promise<void> {
		try {
			if (this.activeWriter) await this.archiveAppend(archiveRecord ?? (observation as unknown as Record<string, unknown>));
			await this.onObservation(observation);
		} catch (error) {
			this.archiveError = error;
			this.kernel.cancel();
			throw error;
		}
	}

	private archiveAppend(record: Record<string, unknown>): Promise<void> {
		const writer = this.activeWriter;
		if (!writer) return Promise.resolve();
		const appended = this.archiveChain.then(() => writer.append(record));
		this.archiveChain = appended.catch(() => {});
		return appended;
	}

	private async settleArchive(state: ArchiveSettledState, reason: string): Promise<Awaited<ReturnType<RunArchiveWriter["settle"]>> | undefined> {
		await this.archiveChain;
		const writer = this.activeWriter;
		if (!writer) return undefined;
		return writer.settle(state, reason);
	}
}

export const GENERAL_AGENT_SYSTEM_PROMPT = `You are a general coding agent operating in a Human-selected trusted local workspace.

Use the selected Kernel's typed read, write, edit, and bash tools to inspect and change the workspace, run programs, install task-scoped dependencies when needed, and use each Observation to decide the next Action. Return a concise final answer only after the task is complete or clearly blocked.

The bash tool is trusted-local: it runs with the host user's authority. The selected workspace is its default cwd, not a security boundary or OS sandbox. Do not access unrelated host paths unless the Human's task explicitly requires it. Never print credentials or hidden reasoning. Treat tool errors as observations, correct the plan when safe, and report unresolved failures accurately.`;
