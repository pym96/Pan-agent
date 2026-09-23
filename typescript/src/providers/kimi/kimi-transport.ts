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

export interface KimiFetchTransportOptions {
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
export async function* abortableKimiBody(body: AsyncIterable<Uint8Array>, signal: AbortSignal): AsyncIterable<Uint8Array> {
	const iterator = body[Symbol.asyncIterator]();
	let rejectAbort!: (reason: unknown) => void;
	const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
	const abort = () => rejectAbort(new DOMException("Operation aborted", "AbortError"));
	signal.addEventListener("abort", abort, { once: true });
	try {
		if (signal.aborted) throw new DOMException("Operation aborted", "AbortError");
		while (true) {
			const item = await Promise.race([iterator.next(), aborted]);
			if (signal.aborted) throw new DOMException("Operation aborted", "AbortError");
			if (item.done) return;
			yield item.value;
		}
	} finally {
		signal.removeEventListener("abort", abort);
		// Async generators may defer return until a pending next completes. Never let that delay Run cancellation.
		try { void Promise.resolve(iterator.return?.()).catch(() => {}); } catch { /* Best-effort source cleanup. */ }
	}
}

/** Production Fetch transport for the frozen official endpoint. Construction is inert; credentials resolve only in send(). */
export class KimiFetchTransport implements KimiTransport {
	private readonly onAttempt?: () => void;
	private readonly credentialSource: KimiCredentialSource;
	private readonly fetchImplementation: KimiFetch;

	constructor(options: KimiFetchTransportOptions = {}) {
		this.onAttempt = options.onAttempt;
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
		const seconds = Number(response.headers?.get("retry-after"));
		return { status: response.status, ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: Math.min(60000, seconds * 1000) } : {}), body: abortableKimiBody(response.body as AsyncIterable<Uint8Array>, request.signal) };
	}
}
