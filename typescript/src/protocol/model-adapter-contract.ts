import type { AgentToolDefinition } from "./agent-tool.ts";
import type { Message, ModelOutcome } from "./canonical-protocol.ts";

export interface ModelContext {
	readonly systemPrompt: string;
	readonly messages: readonly Message[];
	readonly tools: readonly AgentToolDefinition[];
}

export interface ModelExchangeRequest {
	readonly sessionId: string;
	readonly context: ModelContext;
	readonly signal: AbortSignal;
}

/**
 * The sole model seam used by NativeKernel.
 *
 * An Adapter accepts semantic Context and returns one fully assembled semantic
 * outcome. Authentication, HTTP, streaming assembly, and Provider envelopes
 * stay inside concrete adapters and never cross this interface.
 */
export interface ModelAdapter {
	readonly providerId: string;
	readonly modelId: string;
	readonly reasoningLevel: string;
	exchange(request: ModelExchangeRequest): Promise<ModelOutcome>;
}
