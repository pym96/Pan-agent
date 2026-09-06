import { randomUUID } from "node:crypto";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	validateToolCall,
	type AssistantMessage,
	type Context,
	type Message,
	type ToolCall,
	type ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "../model-adapter.ts";
import {
	addUsage,
	assistantPublicText,
	EMPTY_USAGE,
	validateSeededMessages,
	type AgentKernel,
	type KernelLimits,
	type KernelRunRequest,
	type KernelRunResult,
} from "./agent-kernel.ts";

function resultText(content: ToolResultMessage["content"]): string {
	return content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function toolCalls(message: AssistantMessage): ToolCall[] {
	return message.content.filter((block): block is ToolCall => block.type === "toolCall");
}

export interface NativeKernelOptions {
	readonly adapter: PiModelAdapter;
	readonly tools: AgentTool[];
	readonly limits: KernelLimits;
	readonly initialMessages?: readonly Message[];
}

/** Repository-owned loop. It uses the Adapter and AgentTool contracts, never Pi Agent orchestration. */
export class NativeKernel implements AgentKernel {
	readonly kind = "native" as const;
	private readonly adapter: PiModelAdapter;
	private readonly tools: AgentTool[];
	private readonly limits: KernelLimits;
	private readonly messages: Message[];
	private readonly sessionId = randomUUID();
	private readonly seededContextError?: string;
	private activeController?: AbortController;
	private idle?: Promise<void>;
	private settleIdle?: () => void;
	private running = false;
	private closed = false;

	constructor(options: NativeKernelOptions) {
		try {
			validateSeededMessages(options.initialMessages ?? []);
		} catch (error) {
			this.seededContextError = errorText(error);
		}
		this.adapter = options.adapter;
		this.tools = [...options.tools];
		this.limits = options.limits;
		this.messages = [...(options.initialMessages ?? [])];
	}

	get isRunning(): boolean { return this.running; }
	get contextMessageCount(): number { return this.messages.length; }

	async runTask(request: KernelRunRequest): Promise<KernelRunResult> {
		if (this.closed) throw new Error("NativeKernel is closed");
		if (this.running) throw new Error("A task is already running");
		this.running = true;
		this.idle = new Promise<void>((resolve) => { this.settleIdle = resolve; });
		const controller = new AbortController();
		this.activeController = controller;
		let modelCalls = 0;
		let admittedToolCalls = 0;
		let usage = EMPTY_USAGE;
		let finalText = "";
		const seenToolCallIds = new Set(
			this.messages
				.filter((message): message is AssistantMessage => message.role === "assistant")
				.flatMap((message) => toolCalls(message).map((call) => call.id)),
		);
		const terminal = (status: KernelRunResult["status"], reason: string): KernelRunResult => ({
			status, reason, finalText, modelCalls, toolCalls: admittedToolCalls, usage,
		});

		try {
			if (this.seededContextError) return terminal("model_error", this.seededContextError);
			this.messages.push({ role: "user", content: [{ type: "text", text: request.task }], timestamp: Date.now() });
			while (true) {
				if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				if (modelCalls >= this.limits.maxModelTurns) return terminal("incomplete", "turn_limit");

				const turn = modelCalls + 1;
				await request.onObservation({ type: "model.turn_started", runId: request.runId, turn });
				const context: Context = { systemPrompt: request.systemPrompt, messages: [...this.messages], tools: this.tools };
				const source = await this.adapter.streamFn(this.adapter.model, context, {
					sessionId: this.sessionId,
					signal: controller.signal,
					reasoning: this.adapter.thinkingLevel === "off" ? undefined : this.adapter.thinkingLevel,
				});
				const assistant = await source.result();
				modelCalls += 1;
				usage = addUsage(usage, assistant.usage);
				finalText = assistantPublicText(assistant);
				this.messages.push(assistant);
				await request.onObservation({
					type: "model.turn_settled",
					runId: request.runId,
					turn,
					provider: assistant.provider,
					model: assistant.responseModel ?? assistant.model,
					responseId: assistant.responseId,
					stopReason: assistant.stopReason,
					usage: assistant.usage,
					text: finalText,
				});

				if (controller.signal.aborted || assistant.stopReason === "aborted") {
					return terminal("cancelled", assistant.errorMessage ?? "operator_cancelled");
				}
				if (assistant.stopReason === "error") {
					return terminal("model_error", assistant.errorMessage ?? "provider_error");
				}
				if (assistant.stopReason === "length") return terminal("incomplete", "model_output_length");

				const calls = toolCalls(assistant);
				if (calls.length === 0) return terminal("completed", "assistant_completed");
				const ids = new Set<string>();
				for (const call of calls) {
					if (ids.has(call.id) || seenToolCallIds.has(call.id)) {
						this.messages[this.messages.length - 1] = {
							...assistant,
							content: assistant.content.filter((block) => block.type !== "toolCall"),
							stopReason: "error",
							errorMessage: `duplicate_tool_call_id:${call.id}`,
						};
						return terminal("model_error", `duplicate_tool_call_id:${call.id}`);
					}
					ids.add(call.id);
				}
				if (admittedToolCalls + calls.length > this.limits.maxToolSteps) {
					this.messages[this.messages.length - 1] = {
						...assistant,
						content: assistant.content.filter((block) => block.type !== "toolCall"),
						stopReason: "stop",
					};
					return terminal("incomplete", "step_limit");
				}
				admittedToolCalls += calls.length;
				for (const call of calls) seenToolCallIds.add(call.id);

				for (const call of calls) {
					if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
					await request.onObservation({ type: "tool.started", runId: request.runId, toolCallId: call.id, toolName: call.name, arguments: call.arguments });
					let result: ToolResultMessage;
					const tool = this.tools.find((candidate) => candidate.name === call.name);
					if (!tool) {
						result = this.errorResult(call, `Tool ${call.name} not found`);
					} else {
						try {
							const prepared: ToolCall = tool.prepareArguments
								? { ...call, arguments: tool.prepareArguments(call.arguments) as Record<string, unknown> }
								: call;
							const parameters = validateToolCall([tool], prepared);
							const executed = await tool.execute(call.id, parameters, controller.signal);
							result = {
								role: "toolResult", toolCallId: call.id, toolName: call.name,
								content: executed.content, details: executed.details, usage: executed.usage,
								addedToolNames: executed.addedToolNames, isError: false, timestamp: Date.now(),
							};
						} catch (error) {
							result = this.errorResult(call, errorText(error));
						}
					}
					this.messages.push(result);
					await request.onObservation({
						type: "tool.settled", runId: request.runId, toolCallId: call.id,
						toolName: call.name, isError: result.isError, text: resultText(result.content),
					});
					if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				}
			}
		} catch (error) {
			if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
			return terminal("model_error", errorText(error));
		} finally {
			this.running = false;
			this.activeController = undefined;
			this.settleIdle?.();
			this.settleIdle = undefined;
			this.idle = undefined;
		}
	}

	cancel(): void { this.activeController?.abort(); }

	async close(): Promise<void> {
		if (this.closed) return;
		const idle = this.idle;
		this.cancel();
		await idle;
		this.closed = true;
	}

	private errorResult(call: ToolCall, message: string): ToolResultMessage {
		return {
			role: "toolResult", toolCallId: call.id, toolName: call.name,
			content: [{ type: "text", text: message }], isError: true, timestamp: Date.now(),
		};
	}
}
