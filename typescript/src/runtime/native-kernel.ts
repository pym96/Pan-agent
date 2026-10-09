import type { NativeCheckpoint, CheckpointSink } from "./checkpoint.ts";
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
	validateUsage,
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
	readonly checkpoint?: CheckpointSink;
}

/** Repository-owned loop. Its only model/tool dependencies are Pan-owned semantic contracts. */
export class NativeKernel implements AgentKernel {
	readonly kind = "native" as const;
	private readonly adapter: ModelAdapter;
	private readonly checkpoint?: CheckpointSink;
	private readonly tools: AgentTool[];
	private readonly limits: KernelLimits;
	private readonly messages: Message[];
	private readonly sessionId = randomUUID();
	private readonly seededContextError?: string;
	private activeController?: AbortController;
	private idle?: Promise<void>;
	private settleIdle?: () => void;
	private running = false;
	private importing = false;
	private closed = false;

	constructor(options: NativeKernelOptions) {
		validateAgentTools(options.tools);
		try {
			validateCanonicalContext(options.initialMessages ?? []);
		} catch (error) {
			this.seededContextError = errorText(error);
		}
		this.adapter = options.adapter;
		this.checkpoint = options.checkpoint;
		if (this.checkpoint && !this.adapter.checkpoint) throw new Error("checkpoint_provider_unsupported");
		this.tools = [...options.tools];
		this.limits = options.limits;
		this.messages = [...(options.initialMessages ?? [])];
	}

	get isRunning(): boolean { return this.running; }
	get contextMessageCount(): number { return this.messages.length; }

	async runTask(request: KernelRunRequest): Promise<KernelRunResult> {
		if (this.importing) throw new Error("checkpoint_import_in_progress");
		return this.execute(request);
	}

	async resumeTask(request: KernelRunRequest, checkpoint: NativeCheckpoint): Promise<KernelRunResult> {
		if (!this.adapter.checkpoint || !this.checkpoint) throw new Error("checkpoint_provider_unsupported");
		if (this.running || this.closed || this.importing) throw new Error("checkpoint_session_unavailable");
		if (!((checkpoint.version === 1 && checkpoint.next === "model_exchange") || (checkpoint.version === 2 && checkpoint.next === "pending_tool" && this.checkpoint.pending))
			|| checkpoint.task !== request.task || checkpoint.systemPrompt !== request.systemPrompt
			|| checkpoint.toolsJSON !== JSON.stringify(this.tools.map(describeAgentTool))
			|| checkpoint.provider !== this.adapter.providerId || checkpoint.model !== this.adapter.modelId
			|| checkpoint.reasoning !== this.adapter.reasoningLevel || checkpoint.providerFormat !== this.adapter.checkpoint.format
			|| !Number.isSafeInteger(checkpoint.modelCalls) || checkpoint.modelCalls < 1
			|| !Number.isSafeInteger(checkpoint.toolCalls) || checkpoint.toolCalls < 1) throw new Error("checkpoint_identity_invalid");
		if (checkpoint.next === "pending_tool") {
            const last = checkpoint.messages.at(-1);
            const calls = last?.role === "assistant" ? toolCalls(last) : [];
            if (calls.length !== 1 || !checkpoint.resolution || !["completed", "not_started"].includes(checkpoint.resolution.kind)) throw new Error("checkpoint_pending_invalid");
            const result = checkpoint.resolution.kind === "completed" ? checkpoint.resolution.result : this.errorResult(calls[0]!, "validation only");
            validateToolResult(result);
            validateCanonicalContext([...checkpoint.messages, result]);
        } else {
            if (checkpoint.resolution) throw new Error("checkpoint_unexpected_resolution");
            validateCanonicalContext(checkpoint.messages);
            if (checkpoint.messages.at(-1)?.role !== "tool_result") throw new Error("checkpoint_not_settled");
        }
        validateUsage(checkpoint.usage);
		this.importing = true;
		try { await this.adapter.checkpoint.importState(structuredClone(checkpoint.providerState)); } finally { this.importing = false; }
		this.messages.splice(0, this.messages.length, ...structuredClone(checkpoint.messages));
		return this.execute(request, checkpoint);
	}

	private async execute(request: KernelRunRequest, restored?: NativeCheckpoint): Promise<KernelRunResult> {
		if (this.closed) throw new Error("NativeKernel is closed");
		if (this.running) throw new Error("A task is already running");
		this.running = true;
		this.idle = new Promise<void>((resolve) => { this.settleIdle = resolve; });
		const controller = new AbortController();
		this.activeController = controller;
		let modelCalls = restored?.modelCalls ?? 0;
		let admittedToolCalls = restored?.toolCalls ?? 0;
		let usage = restored?.usage ?? EMPTY_USAGE;
		let finalText = "";
		const terminal = (status: KernelRunResult["status"], reason: string): KernelRunResult => ({
			status, reason, finalText, modelCalls, toolCalls: admittedToolCalls, usage,
		});

        const snapshot = async (next: "model_exchange" | "pending_tool"): Promise<NativeCheckpoint> => ({
            version: next === "pending_tool" ? 2 : 1, sourceRunId: request.runId, task: request.task,
            systemPrompt: request.systemPrompt, toolsJSON: JSON.stringify(this.tools.map(describeAgentTool)),
            provider: this.adapter.providerId, model: this.adapter.modelId, reasoning: this.adapter.reasoningLevel,
            providerFormat: this.adapter.checkpoint!.format, providerState: await this.adapter.checkpoint!.exportState(),
            messages: structuredClone(this.messages), modelCalls, toolCalls: admittedToolCalls, usage: structuredClone(usage), next,
        });
        const settle = async (call: ToolCall, reused?: ToolResultMessage) => {
            if (!reused) {
                await request.onObservation({type:"tool.started",runId:request.runId,toolCallId:call.id,toolName:call.name,arguments:call.arguments});
                if (controller.signal.aborted) throw new Error("operator_cancelled");
            }
            const result = reused ?? await this.executeTool(call, controller.signal);
            await this.checkpoint?.settled?.(result);
            this.messages.push(result);
            if (!reused) await request.onObservation({type:"tool.settled",runId:request.runId,toolCallId:call.id,toolName:call.name,isError:result.isError,text:resultText(result.content),...(result.details === undefined ? {} : {details:result.details})});
        };
		try {
			if (this.seededContextError) return terminal("model_error", this.seededContextError);
			if (!restored) this.messages.push({ role: "user", content: [{ type: "text", text: request.task }], timestamp: Date.now() });
            if (restored?.next === "pending_tool") {
                const call = toolCalls(this.messages.at(-1) as AssistantMessage)[0]!;
                if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
                // Transfer the durable pending barrier to this attempt before any possible effect.
                await this.checkpoint!.pending!(await snapshot("pending_tool"));
                await settle(call, restored.resolution?.kind === "completed" ? restored.resolution.result : undefined);
                if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
                await this.checkpoint!.commit(await snapshot("model_exchange"));
            }
			while (true) {
				if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				if (this.limits.maxModelTurns !== null && modelCalls >= this.limits.maxModelTurns) return terminal("incomplete", "turn_limit");
				validateCanonicalContext(this.messages);

				await this.checkpoint?.invalidate();
				const turn = modelCalls + 1;
				await request.onObservation({ type: "model.turn_started", runId: request.runId, turn });
				if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
				modelCalls += 1;
				let outcome: ModelOutcome;
				let progressOpen = true;
				try {
					outcome = await this.adapter.exchange({
						sessionId: this.sessionId,
						context: {
							systemPrompt: request.systemPrompt,
							messages: [...this.messages],
							tools: this.tools.map(describeAgentTool),
						},
						...(request.onProgress ? { onProgress: (delta: import("../protocol/model-adapter-contract.ts").ModelTextDelta) => {
							if (!progressOpen || controller.signal.aborted || !delta || delta.type !== "text_delta" || typeof delta.text !== "string") return;
							try { request.onProgress?.({type:"text_delta", text:delta.text, runId:request.runId, turn}); } catch { /* Transient observer cannot alter execution. */ }
						} } : {}),
						signal: controller.signal,
					});
				} catch (error) {
					progressOpen = false;
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
				finally { progressOpen = false; }
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
				if (this.limits.maxToolSteps !== null && admittedToolCalls + calls.length > this.limits.maxToolSteps) {
					this.messages.pop();
					return terminal("incomplete", "step_limit");
				}
				admittedToolCalls += calls.length;

                if (calls.length === 1 && this.checkpoint?.pending) await this.checkpoint.pending(await snapshot("pending_tool"));
                for (const call of calls) {
                    if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
                    await settle(call);
                    if (controller.signal.aborted) return terminal("cancelled", "operator_cancelled");
                }
                if (this.checkpoint && this.adapter.checkpoint) await this.checkpoint.commit(await snapshot("model_exchange"));
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
