/**
 * Transitional Pan↔Pi compatibility boundary.
 *
 * PiKernel remains the default during #31–#32, and the production Provider
 * implementation is replaced only by a downstream WorkOrder. All Pi shapes
 * and conversion decisions are confined here (plus PiKernel orchestration);
 * NativeKernel and the Pan contracts never import Pi.
 */
import type { AgentTool as PiAgentTool } from "@earendil-works/pi-agent-core";
import {
	validateToolCall as validatePiToolCall,
	type AssistantMessage as PiAssistantMessage,
	type Context as PiContext,
	type Message as PiMessage,
	type Tool as PiToolDefinition,
	type Usage as PiUsage,
} from "@earendil-works/pi-ai";
import type { PiModelAdapter } from "./model-adapter.ts";
import type { AgentTool, AgentToolDefinition } from "./agent-tool.ts";
import {
	assertJsonValue,
	type AssistantMessage,
	type Availability,
	type ImageContent,
	type JsonObject,
	type JsonValue,
	type Message,
	type ModelFailure,
	type ModelOutcome,
	type ModelResponse,
	type ResponseIdentity,
	type TextContent,
	type ToolCall,
	type ToolResultMessage,
	type Usage,
} from "./canonical-protocol.ts";
import type { ModelAdapter } from "./model-adapter-contract.ts";

function reported(value: string | undefined): Availability<string> {
	return value === undefined || value.length === 0
		? { status: "unavailable" }
		: { status: "reported", value };
}

export function piUsageToPan(usage: PiUsage): Usage {
	return {
		status: "reported",
		value: {
			input: usage.input,
			output: usage.output,
			cacheRead: usage.cacheRead,
			cacheWrite: usage.cacheWrite,
			...(usage.cacheWrite1h === undefined ? {} : { cacheWrite1h: usage.cacheWrite1h }),
			...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }),
			totalTokens: usage.totalTokens,
			cost: { ...usage.cost },
		},
	};
}

export function piAssistantIdentity(message: PiAssistantMessage): ResponseIdentity {
	return {
		provider: reported(message.provider),
		model: reported(message.responseModel ?? message.model),
		responseId: reported(message.responseId),
	};
}

function piContentToPan(content: PiAssistantMessage["content"]): AssistantMessage["content"] {
	return content.flatMap((item): (TextContent | ToolCall)[] => {
		if (item.type === "text") return [{ type: "text", text: item.text }];
		if (item.type === "toolCall") {
			return [{ type: "tool_call", id: item.id, name: item.name, arguments: item.arguments as JsonObject }];
		}
		return [];
	});
}

function piAssistantToOutcome(message: PiAssistantMessage): ModelOutcome {
	const usage = piUsageToPan(message.usage);
	const identity = piAssistantIdentity(message);
	if (message.stopReason === "error" || message.stopReason === "aborted") {
		const failure: ModelFailure = {
			kind: "failure",
			category: message.stopReason === "aborted" ? "cancelled" : "provider",
			detail: message.errorMessage ?? (message.stopReason === "aborted" ? "model_exchange_cancelled" : "provider_error"),
			retryable: false,
			usage,
			identity,
		};
		return failure;
	}
	if (message.stopReason === "pending" || message.stopReason === "deferred") {
		return {
			kind: "failure",
			category: "protocol",
			detail: `unsupported_pi_stop_reason:${message.stopReason}`,
			retryable: false,
			usage,
			identity,
		};
	}
	const response: ModelResponse = {
		kind: "response",
		message: { role: "assistant", content: piContentToPan(message.content), timestamp: message.timestamp },
		stopReason: message.stopReason === "toolUse" ? "tool_calls" : message.stopReason,
		usage,
		identity,
		...(message.content.some((item) => item.type === "thinking")
			? { diagnostics: { reasoning: { state: message.content.some((item) => item.type === "thinking" && item.redacted) ? "redacted" as const : "present" as const } } }
			: {}),
	};
	return response;
}

const EMPTY_PI_USAGE: PiUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function panImageToPi(content: ImageContent): { type: "image"; data: string; mimeType: string } {
	return { type: "image", data: content.data, mimeType: content.mediaType };
}

function panMessageToPi(message: Message, adapter: PiModelAdapter): PiMessage {
	if (message.role === "user") {
		return {
			role: "user",
			content: message.content.map((content) => content.type === "text" ? content : panImageToPi(content)),
			timestamp: message.timestamp,
		};
	}
	if (message.role === "tool_result") {
		return {
			role: "toolResult",
			toolCallId: message.toolCallId,
			toolName: message.toolName,
			content: message.content.map((content) => content.type === "text" ? content : panImageToPi(content)),
			details: message.details,
			isError: message.isError,
			timestamp: message.timestamp,
		};
	}
	return {
		role: "assistant",
		content: message.content.map((content) => content.type === "text"
			? content
			: { type: "toolCall" as const, id: content.id, name: content.name, arguments: content.arguments }),
		api: adapter.model.api,
		provider: adapter.providerId as PiAssistantMessage["provider"],
		model: adapter.modelId,
		usage: EMPTY_PI_USAGE,
		stopReason: message.content.some((content) => content.type === "tool_call") ? "toolUse" : "stop",
		timestamp: message.timestamp,
	};
}

function panToolDefinitionToPi(tool: AgentToolDefinition): PiToolDefinition {
	return {
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters as PiToolDefinition["parameters"],
	};
}

/** Temporary production bridge; #33 replaces its Pi-backed transport implementation. */
export function adaptPiModelAdapter(adapter: PiModelAdapter): ModelAdapter {
	return {
		providerId: adapter.providerId,
		modelId: adapter.modelId,
		reasoningLevel: adapter.thinkingLevel,
		async exchange(request): Promise<ModelOutcome> {
			const context: PiContext = {
				systemPrompt: request.context.systemPrompt,
				messages: request.context.messages.map((message) => panMessageToPi(message, adapter)),
				tools: request.context.tools.map(panToolDefinitionToPi),
			};
			const source = await adapter.streamFn(adapter.model, context, {
				sessionId: request.sessionId,
				signal: request.signal,
				reasoning: adapter.thinkingLevel === "off" ? undefined : adapter.thinkingLevel,
			});
			return piAssistantToOutcome(await source.result());
		},
	};
}

function piImageToPan(content: { type: "image"; data: string; mimeType: string }): ImageContent {
	return { type: "image", data: content.data, mediaType: content.mimeType };
}

function piMessageToPan(message: PiMessage): Message {
	if (message.role === "user") {
		const content = typeof message.content === "string"
			? [{ type: "text" as const, text: message.content }]
			: message.content.map((item) => item.type === "text" ? item : piImageToPan(item));
		return { role: "user", content, timestamp: message.timestamp };
	}
	if (message.role === "toolResult") {
		const result: ToolResultMessage = {
			role: "tool_result",
			toolCallId: message.toolCallId,
			toolName: message.toolName,
			content: message.content.map((item) => item.type === "text" ? item : piImageToPan(item)),
			isError: message.isError,
			timestamp: message.timestamp,
		};
		return result;
	}
	return {
		role: "assistant",
		content: piContentToPan(message.content),
		timestamp: message.timestamp,
	};
}

export function piMessagesToPan(messages: readonly PiMessage[]): Message[] {
	return messages.map(piMessageToPan);
}

export function piAssistantPublicText(message: PiAssistantMessage): string {
	return message.content
		.filter((content): content is { type: "text"; text: string } => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

function jsonDetails(value: unknown): JsonValue | undefined {
	if (value === undefined) return undefined;
	try {
		assertJsonValue(value, "tool_result.details");
		return value;
	} catch {
		return undefined;
	}
}

/** Legacy test/reference bridge; explicit Native product composition no longer uses it after #32. */
export function adaptPiAgentTool(tool: PiAgentTool): AgentTool {
	return {
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters as JsonObject,
		validate(argumentsValue) {
			try {
				const prepared = tool.prepareArguments ? tool.prepareArguments(argumentsValue) : argumentsValue;
				const value = validatePiToolCall([tool], {
					type: "toolCall",
					id: "pan-compatibility-validation",
					name: tool.name,
					arguments: prepared as Record<string, unknown>,
				});
				return { ok: true, value: value as JsonObject };
			} catch (error) {
				return { ok: false, error: error instanceof Error ? error.message : String(error) };
			}
		},
		async execute(invocation) {
			const result = await tool.execute(
				invocation.toolCallId,
				invocation.arguments as never,
				invocation.signal,
			);
			const details = jsonDetails(result.details);
			return {
				content: result.content.map((item) => item.type === "text" ? item : piImageToPan(item)),
				...(details === undefined ? {} : { details }),
			};
		},
	};
}

export function adaptPiAgentTools(tools: readonly PiAgentTool[]): AgentTool[] {
	return tools.map(adaptPiAgentTool);
}
