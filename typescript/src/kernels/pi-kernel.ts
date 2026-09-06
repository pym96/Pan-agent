import { randomUUID } from "node:crypto";
import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	type StreamFn,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import {
	createAssistantMessageEventStream,
	type AssistantMessage,
	type Message,
	type Model,
} from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "../model-adapter.ts";
import type { Usage } from "../canonical-protocol.ts";
import {
	piAssistantIdentity,
	piAssistantPublicText,
	piMessagesToPan,
	piUsageToPan,
} from "../pi-compatibility.ts";
import { validateCanonicalContext } from "../canonical-protocol.ts";
import {
	addUsage,
	EMPTY_USAGE,
	type AgentKernel,
	type KernelLimits,
	type KernelRunRequest,
	type KernelRunResult,
} from "./agent-kernel.ts";

function resultText(result: unknown): string {
	if (!result || typeof result !== "object" || !("content" in result) || !Array.isArray(result.content)) return "";
	return result.content
		.filter((block): block is { type: "text"; text: string } =>
			typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string")
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

export interface PiKernelOptions {
	readonly adapter: PiModelAdapter;
	readonly tools: AgentTool[];
	readonly systemPrompt: string;
	readonly limits: KernelLimits;
	readonly initialMessages?: readonly Message[];
}

/** Pi-backed compatibility implementation. This is the only Kernel importing Pi's Agent loop. */
export class PiKernel implements AgentKernel {
	readonly kind = "pi" as const;
	private readonly agent: Agent;
	private readonly limits: KernelLimits;
	private activeRequest?: KernelRunRequest;
	private activeTurn = 0;
	private activeToolCalls = 0;
	private activeModelCalls = 0;
	private activeUsage: Usage = EMPTY_USAGE;
	private cancellationRequested = false;
	private readonly seenToolCallIds = new Set<string>();
	private activeToolSteps = 0;
	private preflightFailure?: string;
	private stepLimitReached = false;
	private readonly seededContextError?: string;

	constructor(options: PiKernelOptions) {
		try {
			validateCanonicalContext(piMessagesToPan(options.initialMessages ?? []));
		} catch (error) {
			this.seededContextError = error instanceof Error ? error.message : String(error);
		}
		this.limits = options.limits;
		for (const message of options.initialMessages ?? []) {
			if (message.role !== "assistant") continue;
			for (const block of message.content) if (block.type === "toolCall") this.seenToolCallIds.add(block.id);
		}
		const guardedStreamFn: StreamFn = async (model, context, streamOptions) => {
			const source = await options.adapter.streamFn(model, context, streamOptions);
			const assistant = await source.result();
			const guarded = this.preflight(assistant);
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				stream.push({ type: "start", partial: guarded });
				if (guarded.stopReason === "error" || guarded.stopReason === "aborted") {
					stream.push({ type: "error", reason: guarded.stopReason, error: guarded });
				} else if (guarded.stopReason === "stop" || guarded.stopReason === "length" || guarded.stopReason === "toolUse" || guarded.stopReason === "deferred") {
					stream.push({ type: "done", reason: guarded.stopReason, message: guarded });
				} else {
					const error = { ...guarded, stopReason: "error" as const, errorMessage: "invalid_provider_stop_reason" };
					stream.push({ type: "error", reason: "error", error });
				}
			});
			return stream;
		};
		this.agent = new Agent({
			streamFn: guardedStreamFn,
			initialState: {
				systemPrompt: options.systemPrompt,
				model: options.adapter.model as Model<string>,
				thinkingLevel: options.adapter.thinkingLevel as ThinkingLevel,
				tools: options.tools,
				messages: [...(options.initialMessages ?? [])],
			},
			sessionId: randomUUID(),
			toolExecution: "sequential",
			shouldStopAfterTurn: () => this.activeTurn >= this.limits.maxModelTurns,
		});
		this.agent.subscribe((event) => this.observe(event));
	}

	get isRunning(): boolean { return this.agent.state.isStreaming; }
	get contextMessageCount(): number { return this.agent.state.messages.length; }

	async runTask(request: KernelRunRequest): Promise<KernelRunResult> {
		if (this.isRunning) throw new Error("A task is already running");
		this.activeRequest = request;
		this.activeTurn = 0;
		this.activeToolCalls = 0;
		this.activeModelCalls = 0;
		this.activeUsage = EMPTY_USAGE;
		this.cancellationRequested = false;
		this.activeToolSteps = 0;
		this.preflightFailure = undefined;
		this.stepLimitReached = false;
		this.agent.state.systemPrompt = request.systemPrompt;
		if (this.seededContextError) {
			this.activeRequest = undefined;
			return {
				status: "model_error",
				reason: this.seededContextError,
				finalText: "",
				modelCalls: 0,
				toolCalls: 0,
				usage: EMPTY_USAGE,
			};
		}
		await this.agent.prompt(request.task);
		const final = finalAssistant(this.agent.state.messages);
		const finalText = final ? piAssistantPublicText(final) : "";
		let status: KernelRunResult["status"];
		let reason: string;
		if (this.cancellationRequested || final?.stopReason === "aborted") {
			status = "cancelled";
			reason = final?.errorMessage ?? "operator_cancelled";
		} else if (this.preflightFailure) {
			status = "model_error";
			reason = this.preflightFailure;
		} else if (!final || final.stopReason === "error") {
			status = "model_error";
			reason = final?.errorMessage ?? "missing_final_assistant_message";
		} else if (this.stepLimitReached) {
			status = "incomplete";
			reason = "step_limit";
		} else if (final.stopReason === "length" || this.activeTurn >= this.limits.maxModelTurns) {
			status = "incomplete";
			reason = final.stopReason === "length" ? "model_output_length" : "turn_limit";
		} else {
			status = "completed";
			reason = "assistant_completed";
		}
		this.activeRequest = undefined;
		return { status, reason, finalText, modelCalls: this.activeModelCalls, toolCalls: this.activeToolCalls, usage: this.activeUsage };
	}

	cancel(): void {
		if (!this.isRunning) return;
		this.cancellationRequested = true;
		this.agent.abort();
	}

	async close(): Promise<void> {
		if (!this.isRunning) return;
		this.cancel();
		await this.agent.waitForIdle();
	}

	private preflight(assistant: AssistantMessage): AssistantMessage {
		if (assistant.stopReason === "error" || assistant.stopReason === "aborted") return assistant;
		const calls = assistant.content.filter((block) => block.type === "toolCall");
		const current = new Set<string>();
		for (const call of calls) {
			if (current.has(call.id) || this.seenToolCallIds.has(call.id)) {
				this.preflightFailure = `duplicate_tool_call_id:${call.id}`;
				return {
					...assistant,
					content: assistant.content.filter((block) => block.type !== "toolCall"),
					stopReason: "error",
					errorMessage: this.preflightFailure,
				};
			}
			current.add(call.id);
		}
		if (this.activeToolSteps + calls.length > this.limits.maxToolSteps) {
			this.stepLimitReached = true;
			return {
				...assistant,
				content: assistant.content.filter((block) => block.type !== "toolCall"),
				stopReason: "stop",
			};
		}
		this.activeToolSteps += calls.length;
		for (const call of calls) this.seenToolCallIds.add(call.id);
		return assistant;
	}

	private async observe(event: AgentEvent): Promise<void> {
		const request = this.activeRequest;
		if (!request) return;
		const { runId, onObservation } = request;
		switch (event.type) {
			case "turn_start":
				this.activeTurn += 1;
				await onObservation({ type: "model.turn_started", runId, turn: this.activeTurn });
				break;
			case "message_end":
				if (event.message.role === "assistant") {
					this.activeModelCalls += 1;
					const eventUsage = piUsageToPan(event.message.usage);
					const identity = piAssistantIdentity(event.message);
					this.activeUsage = addUsage(this.activeUsage, eventUsage);
					await onObservation({
						type: "model.turn_settled", runId, turn: this.activeTurn,
						provider: event.message.provider, model: event.message.responseModel ?? event.message.model,
						responseId: event.message.responseId, stopReason: event.message.stopReason,
						identity,
						usage: eventUsage, text: piAssistantPublicText(event.message),
					});
				}
				break;
			case "tool_execution_start":
				this.activeToolCalls += 1;
				await onObservation({ type: "tool.started", runId, toolCallId: event.toolCallId, toolName: event.toolName, arguments: event.args });
				break;
			case "tool_execution_end":
				await onObservation({ type: "tool.settled", runId, toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError, text: resultText(event.result) });
				break;
		}
	}
}
