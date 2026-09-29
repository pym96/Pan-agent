/** #53 Kimi Code transport: official OpenAI-compatible endpoint only. Pan-owned; no DeepSeek delegation. */
import { KIMI_OFFICIAL_CONTRACT } from "./kimi-profile.ts";

export type KimiCredentialSource = () => string | undefined;

export interface KimiTransportRequest {
	readonly method: string;
	readonly path: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly signal: AbortSignal;
}

export interface KimiTransportResponse {
	readonly status: number;
	readonly retryAfterMs?: number;
	readonly body: AsyncIterable<Uint8Array>;
}

export interface KimiTransport {
	send(request: KimiTransportRequest): Promise<KimiTransportResponse>;
}

export type KimiFetch = typeof fetch;

/** Observe original local source operations, independently of cancellation races.
 * The observer must not throw; it receives no request, credential or response data.
 */
export type KimiSourceObserver = (kind: "read" | "return", operation: Promise<unknown>) => void;

function sourceOperation<T>(kind: "read" | "return", invoke: () => T | PromiseLike<T>, observe?: KimiSourceObserver): Promise<T> {
	// Include synchronous source exceptions in the same observable settlement path.
	const operation = Promise.resolve().then(invoke);
	observe?.(kind, operation);
	return operation;
}

export interface KimiFetchTransportOptions {
	readonly onSourceOperation?: KimiSourceObserver;
	readonly credentialSource?: KimiCredentialSource;
	readonly fetchImplementation?: KimiFetch;
	/** Durable local fetch-entry marker, not proof of server receipt. */
	readonly onAttempt?: () => void;
}

export class KimiTransportConfigurationError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = "KimiTransportConfigurationError";
		this.code = code;
	}
}

function defaultCredentialSource(): string | undefined {
	return process.env.KIMI_API_KEY;
}

/** Abortable byte stream: cancellation releases the iterator without draining the body. */
export async function* abortableKimiBody(body: AsyncIterable<Uint8Array>, signal: AbortSignal, observe?: KimiSourceObserver): AsyncIterable<Uint8Array> {
	const iterator = body[Symbol.asyncIterator]();
	let rejectAbort!: (reason: unknown) => void;
	const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
	const abort = () => rejectAbort(new DOMException("Operation aborted", "AbortError"));
	signal.addEventListener("abort", abort, { once: true });
	try {
		if (signal.aborted) throw new DOMException("Operation aborted", "AbortError");
		while (true) {
			const item = await Promise.race([sourceOperation("read", () => iterator.next(), observe), aborted]);
			if (signal.aborted) throw new DOMException("Operation aborted", "AbortError");
			if (item.done) return;
			yield item.value;
		}
	} finally {
		signal.removeEventListener("abort", abort);
		// Async generators may defer return until a pending next completes. Never let that delay Run cancellation.
		// Keep cancellation prompt, but expose the ORIGINAL cleanup promise to the owner.
		// Completion of this wrapper is deliberately not source-settlement evidence.
		if (iterator.return) void sourceOperation("return", () => iterator.return!(), observe).catch(() => {});
	}
}

/** Production Fetch transport for the frozen official endpoint. Construction is inert; credentials resolve only in send(). */
export class KimiFetchTransport implements KimiTransport {
	private readonly onAttempt?: () => void;
	private readonly onSourceOperation?: KimiSourceObserver;
	private readonly credentialSource: KimiCredentialSource;
	private readonly fetchImplementation: KimiFetch;

	constructor(options: KimiFetchTransportOptions = {}) {
		this.onAttempt = options.onAttempt;
		this.onSourceOperation = options.onSourceOperation;
		this.credentialSource = options.credentialSource ?? defaultCredentialSource;
		this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
	}

	async send(request: KimiTransportRequest): Promise<KimiTransportResponse> {
		if (request.signal.aborted) throw new DOMException("Operation aborted", "AbortError");
		if (request.path !== KIMI_OFFICIAL_CONTRACT.chatCompletionsPath) {
			throw new KimiTransportConfigurationError("kimi_endpoint_not_supported");
		}
		const credential = this.credentialSource();
		if (!credential || credential.trim().length === 0) {
			throw new KimiTransportConfigurationError("kimi_credential_unavailable");
		}
		request.signal.throwIfAborted();
		this.onAttempt?.();
		const response = await this.fetchImplementation(`${KIMI_OFFICIAL_CONTRACT.baseUrl}${request.path}`, {
			method: request.method,
			headers: { ...request.headers, authorization: `Bearer ${credential}` },
			body: request.body,
			signal: request.signal,
		});
		// A non-cooperative fetch can fulfill after cancellation, before a consumer
		// ever enters the body generator. Close that source too, with the same proof.
		if (request.signal.aborted) {
			const iterator = (response.body as AsyncIterable<Uint8Array> | null)?.[Symbol.asyncIterator]();
			if (iterator?.return) void sourceOperation("return", () => iterator.return!(), this.onSourceOperation).catch(() => {});
			throw new DOMException("Operation aborted", "AbortError");
		}
		const seconds = Number(response.headers?.get("retry-after"));
		return { status: response.status, ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: Math.min(60000, seconds * 1000) } : {}), body: abortableKimiBody(response.body as AsyncIterable<Uint8Array>, request.signal, this.onSourceOperation) };
	}
}
