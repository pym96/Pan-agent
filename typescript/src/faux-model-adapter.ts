import { validateAgentToolDefinitions } from "./agent-tool.ts";
import {
	CanonicalProtocolError,
	UNAVAILABLE,
	validateCanonicalContext,
	validateModelOutcome,
	type Message,
	type ModelFailure,
	type ModelOutcome,
} from "./canonical-protocol.ts";
import type { ModelAdapter, ModelContext, ModelExchangeRequest } from "./model-adapter-contract.ts";

export interface FauxPendingExchange {
	readonly kind: "pending";
}

export type FauxScriptEntry = ModelOutcome | FauxPendingExchange;

export interface FauxRecordedExchange {
	readonly sessionId: string;
	readonly context: ModelContext;
}

export interface FauxAdapterState {
	readonly cursor: number;
	readonly exchangeCount: number;
	readonly requests: readonly FauxRecordedExchange[];
}

export interface FauxModelAdapterOptions {
	readonly providerId?: string;
	readonly modelId?: string;
	readonly reasoningLevel?: string;
}

export const FAUX_PENDING_EXCHANGE: FauxPendingExchange = Object.freeze({ kind: "pending" });

function clone<T>(value: T): T {
	return structuredClone(value);
}

/**
 * Deterministic Pan ModelAdapter for offline product and consumer tests.
 *
 * Each admitted exchange consumes one canonical script entry. The Adapter has
 * no Provider envelope, clock, randomness, network, credential, or Pi path.
 */
export class FauxModelAdapter implements ModelAdapter {
	readonly providerId: string;
	readonly modelId: string;
	readonly reasoningLevel: string;
	private readonly script: readonly FauxScriptEntry[];
	private cursorValue = 0;
	private exchangeCountValue = 0;
	private readonly recordedRequests: FauxRecordedExchange[] = [];

	constructor(script: readonly FauxScriptEntry[], options: FauxModelAdapterOptions = {}) {
		this.script = clone(script);
		this.providerId = options.providerId ?? "pan-faux";
		this.modelId = options.modelId ?? "pan-faux-v1";
		this.reasoningLevel = options.reasoningLevel ?? "off";
	}

	get state(): FauxAdapterState {
		return {
			cursor: this.cursorValue,
			exchangeCount: this.exchangeCountValue,
			requests: clone(this.recordedRequests),
		};
	}

	async exchange(request: ModelExchangeRequest): Promise<ModelOutcome> {
		if (request.signal.aborted) return this.cancelledFailure();
		this.validateRequest(request);
		this.exchangeCountValue += 1;
		this.recordedRequests.push({
			sessionId: request.sessionId,
			context: clone(request.context),
		});

		const entry = this.script[this.cursorValue];
		if (entry === undefined) return this.exhaustedFailure();
		this.cursorValue += 1;
		if (entry.kind === "pending") return this.waitForCancellation(request.signal);

		const outcome = clone(entry);
		try {
			validateModelOutcome(outcome, request.context.messages);
			return outcome;
		} catch (error) {
			return this.protocolFailure(`faux_script_invalid:${this.errorCode(error)}`);
		}
	}

	private validateRequest(request: ModelExchangeRequest): void {
		if (request.sessionId.trim().length === 0) throw new CanonicalProtocolError("faux_session_id_empty");
		if (typeof request.context.systemPrompt !== "string") {
			throw new CanonicalProtocolError("faux_system_prompt_invalid");
		}
		validateCanonicalContext(request.context.messages);
		validateAgentToolDefinitions(request.context.tools);
	}

	private waitForCancellation(signal: AbortSignal): Promise<ModelOutcome> {
		if (signal.aborted) return Promise.resolve(this.cancelledFailure());
		return new Promise((resolve) => {
			signal.addEventListener("abort", () => resolve(this.cancelledFailure()), { once: true });
		});
	}

	private identity() {
		return {
			provider: { status: "reported" as const, value: this.providerId },
			model: { status: "reported" as const, value: this.modelId },
			responseId: UNAVAILABLE,
		};
	}

	private exhaustedFailure(): ModelFailure {
		return this.protocolFailure("faux_script_exhausted");
	}

	private cancelledFailure(): ModelFailure {
		return {
			kind: "failure",
			category: "cancelled",
			detail: "faux_exchange_cancelled",
			retryable: false,
			usage: UNAVAILABLE,
			identity: this.identity(),
		};
	}

	private protocolFailure(detail: string): ModelFailure {
		return {
			kind: "failure",
			category: "protocol",
			detail,
			retryable: false,
			usage: UNAVAILABLE,
			identity: this.identity(),
		};
	}

	private errorCode(error: unknown): string {
		return error instanceof CanonicalProtocolError
			? error.code
			: error instanceof Error
				? error.message
				: String(error);
	}
}

/** Build a canonical user Context without introducing a Faux-only message shape. */
export function fauxUserMessage(text: string, timestamp = 0): Message {
	return { role: "user", content: [{ type: "text", text }], timestamp };
}
