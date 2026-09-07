export interface DeepSeekTransportRequest {
	readonly method: "POST";
	readonly path: "/chat/completions";
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly signal: AbortSignal;
}

export interface DeepSeekTransportResponse {
	readonly status: number;
	readonly body: AsyncIterable<Uint8Array>;
}

/** Internal transport seam used by the Pan DeepSeek Adapter and offline fixtures. */
export interface DeepSeekTransport {
	send(request: DeepSeekTransportRequest): Promise<DeepSeekTransportResponse>;
}

export type DeepSeekCredentialSource = () => string | undefined;
export type DeepSeekFetch = typeof globalThis.fetch;

export interface DeepSeekFetchTransportOptions {
	readonly baseUrl?: string;
	readonly credentialSource?: DeepSeekCredentialSource;
	readonly fetchImplementation?: DeepSeekFetch;
}

export class DeepSeekTransportConfigurationError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = "DeepSeekTransportConfigurationError";
		this.code = code;
	}
}

function defaultCredentialSource(): string | undefined {
	return process.env.DEEPSEEK_API_KEY;
}

async function* responseBytes(response: Response): AsyncIterable<Uint8Array> {
	if (!response.body) return;
	const reader = response.body.getReader();
	try {
		while (true) {
			const item = await reader.read();
			if (item.done) return;
			if (item.value) yield item.value;
		}
	} finally {
		reader.releaseLock();
	}
}

/** Production Fetch transport. Construction is inert; credentials are resolved only by send(). */
export class DeepSeekFetchTransport implements DeepSeekTransport {
	private readonly baseUrl: string;
	private readonly credentialSource: DeepSeekCredentialSource;
	private readonly fetchImplementation: DeepSeekFetch;

	constructor(options: DeepSeekFetchTransportOptions = {}) {
		this.baseUrl = (options.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "");
		this.credentialSource = options.credentialSource ?? defaultCredentialSource;
		this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
	}

	async send(request: DeepSeekTransportRequest): Promise<DeepSeekTransportResponse> {
		if (request.signal.aborted) throw new DOMException("Operation aborted", "AbortError");
		const credential = this.credentialSource();
		if (!credential || credential.trim().length === 0) {
			throw new DeepSeekTransportConfigurationError("deepseek_credential_unavailable");
		}
		const response = await this.fetchImplementation(`${this.baseUrl}${request.path}`, {
			method: request.method,
			headers: { ...request.headers, authorization: `Bearer ${credential}` },
			body: request.body,
			signal: request.signal,
		});
		return { status: response.status, body: responseBytes(response) };
	}
}
