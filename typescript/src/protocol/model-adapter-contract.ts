import type { AgentToolDefinition } from "./agent-tool.ts";
import type { Message, ModelOutcome } from "./canonical-protocol.ts";

export interface ModelContext {
	readonly systemPrompt: string;
	readonly messages: readonly Message[];
	readonly tools: readonly AgentToolDefinition[];
}

/** Provisional public text only; never a completed message or executable action. */
export interface ModelTextDelta { readonly type: "text_delta"; readonly text: string }
export type ModelProgressSink = (delta: ModelTextDelta) => void;

export interface ModelExchangeRequest {
	readonly onProgress?: ModelProgressSink;
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
