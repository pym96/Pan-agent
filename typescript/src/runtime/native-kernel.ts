import { randomUUID } from "node:crypto";
import {
	describeAgentTool,
	validateAgentTools,
	type AgentTool,
} from "../protocol/agent-tool.ts";
import {
	CanonicalProtocolError,
	UNAVAILABLE,
	addUsage,
	assertJsonObject,
	assistantPublicText,
	validateCanonicalContext,
	validateModelOutcome,
	validateToolResult,
	type AssistantMessage,
	type Availability,
	type Message,
	type ModelFailure,
	type ModelOutcome,
	type ResponseIdentity,
	type ToolCall,
	type ToolResultMessage,
} from "../protocol/canonical-protocol.ts";
import type { ModelAdapter } from "../protocol/model-adapter-contract.ts";
import {
	EMPTY_USAGE,
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
	return message.content.filter((block): block is ToolCall => block.type === "tool_call");
}

function reportedValue(value: Availability<string>): string | undefined {
	return value.status === "reported" ? value.value : undefined;
}

export interface NativeKernelOptions {
	readonly adapter: ModelAdapter;
	readonly tools: readonly AgentTool[];
	readonly limits: KernelLimits;
	readonly initialMessages?: readonly Message[];
}

/** Repository-owned loop. Its only model/tool dependencies are Pan-owned semantic contracts. */
export class NativeKernel implements AgentKernel {
	readonly kind = "native" as const;
	private readonly adapter: ModelAdapter;
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
		validateAgentTools(options.tools);
		try {
			validateCanonicalContext(options.initialMessages ?? []);
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
		const terminal = (status: KernelRunResult["status"], reason: string): KernelRunResult => ({
			status, reason, finalText, modelCalls, toolCalls: admittedToolCalls, usage,
		});

		try {
			if (this.seededContextError) return terminal("model_error", this.seededContextError);
			this.messages.push({ role: "user", content: [{ type: "text", text: request.task }], timestamp: Date.now() });
			while (true) {
				if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				if (modelCalls >= this.limits.maxModelTurns) return terminal("incomplete", "turn_limit");
				validateCanonicalContext(this.messages);

				const turn = modelCalls + 1;
				await request.onObservation({ type: "model.turn_started", runId: request.runId, turn });
				if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				modelCalls += 1;
				let outcome: ModelOutcome;
				try {
					outcome = await this.adapter.exchange({
						sessionId: this.sessionId,
						context: {
							systemPrompt: request.systemPrompt,
							messages: [...this.messages],
							tools: this.tools.map(describeAgentTool),
						},
						signal: controller.signal,
					});
				} catch (error) {
					const cancelled = controller.signal.aborted;
					const failure: ModelFailure = {
						kind: "failure",
						category: cancelled ? "cancelled" : "unknown",
						detail: cancelled ? "operator_cancelled" : `adapter_exception:${errorText(error)}`,
						retryable: false,
						usage: UNAVAILABLE,
						identity: {
							provider: { status: "reported", value: this.adapter.providerId },
							model: { status: "reported", value: this.adapter.modelId },
							responseId: UNAVAILABLE,
						},
					};
					usage = addUsage(usage, failure.usage);
					await this.observeModelSettlement(request, turn, failure, cancelled ? "aborted" : "error", "");
					return terminal(cancelled ? "cancelled" : "model_error", failure.detail);
				}
				usage = addUsage(usage, outcome.usage);

				try {
					validateModelOutcome(outcome, this.messages);
				} catch (error) {
					const failure = this.protocolFailure(error, outcome.identity, outcome.usage);
					await this.observeModelSettlement(request, turn, failure, "error", "");
					return terminal("model_error", failure.detail);
				}

				if (outcome.kind === "failure") {
					await this.observeModelSettlement(
						request,
						turn,
						outcome,
						outcome.category === "cancelled" ? "aborted" : "error",
						"",
					);
					return terminal(
						outcome.category === "cancelled" || controller.signal.aborted ? "cancelled" : "model_error",
						outcome.detail,
					);
				}

				finalText = assistantPublicText(outcome.message);
				this.messages.push(outcome.message);
				await this.observeModelSettlement(request, turn, outcome, outcome.stopReason, finalText);
				if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				if (outcome.stopReason === "length") return terminal("incomplete", "model_output_length");

				const calls = toolCalls(outcome.message);
				if (calls.length === 0) return terminal("completed", "assistant_completed");
				if (admittedToolCalls + calls.length > this.limits.maxToolSteps) {
					this.messages.pop();
					return terminal("incomplete", "step_limit");
				}
				admittedToolCalls += calls.length;

				for (const call of calls) {
					if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
					await request.onObservation({
						type: "tool.started",
						runId: request.runId,
						toolCallId: call.id,
						toolName: call.name,
						arguments: call.arguments,
					});
					if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
					const result = await this.executeTool(call, controller.signal);
					this.messages.push(result);
					await request.onObservation({
						type: "tool.settled",
						runId: request.runId,
						toolCallId: call.id,
						toolName: call.name,
						isError: result.isError,
						text: resultText(result.content),
						...(result.details === undefined ? {} : { details: result.details }),
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

	private async executeTool(call: ToolCall, signal: AbortSignal): Promise<ToolResultMessage> {
		const tool = this.tools.find((candidate) => candidate.name === call.name);
		if (!tool) return this.errorResult(call, `Tool ${call.name} not found`);
		try {
			const validation = tool.validate(call.arguments);
			if (!validation.ok) return this.errorResult(call, validation.error);
			assertJsonObject(validation.value, `validated_arguments:${call.name}`);
			if (signal.aborted) throw new Error("Operation aborted before Tool effect");
			const executed = await tool.execute({ toolCallId: call.id, arguments: validation.value, signal });
			const result: ToolResultMessage = {
				role: "tool_result",
				toolCallId: call.id,
				toolName: call.name,
				content: executed.content,
				...(executed.details === undefined ? {} : { details: executed.details }),
				isError: executed.isError ?? false,
				timestamp: Date.now(),
			};
			validateToolResult(result);
			return result;
		} catch (error) {
			return this.errorResult(call, errorText(error));
		}
	}

	private errorResult(call: ToolCall, message: string): ToolResultMessage {
		return {
			role: "tool_result",
			toolCallId: call.id,
			toolName: call.name,
			content: [{ type: "text", text: message }],
			isError: true,
			timestamp: Date.now(),
		};
	}

	private protocolFailure(error: unknown, identity: ResponseIdentity, failureUsage: ModelOutcome["usage"]): ModelFailure {
		const detail = error instanceof CanonicalProtocolError ? error.code : errorText(error);
		return { kind: "failure", category: "protocol", detail, retryable: false, usage: failureUsage, identity };
	}

	private async observeModelSettlement(
		request: KernelRunRequest,
		turn: number,
		outcome: ModelOutcome,
		stopReason: string,
		text: string,
	): Promise<void> {
		const identity = outcome.identity;
		const provider = reportedValue(identity.provider);
		const model = reportedValue(identity.model);
		const responseId = reportedValue(identity.responseId);
		await request.onObservation({
			type: "model.turn_settled",
			runId: request.runId,
			turn,
			...(provider === undefined ? {} : { provider }),
			...(model === undefined ? {} : { model }),
			...(responseId === undefined ? {} : { responseId }),
			identity,
			stopReason,
			usage: outcome.usage,
			text,
			...(outcome.kind === "failure" ? { failure: outcome } : {}),
		});
	}
}
