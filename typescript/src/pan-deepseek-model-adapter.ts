import { validateAgentToolDefinitions, type AgentToolDefinition } from "./agent-tool.ts";
import {
	CanonicalProtocolError,
	UNAVAILABLE,
	assertJsonObject,
	validateCanonicalContext,
	validateModelOutcome,
	type AssistantMessage,
	type Availability,
	type JsonObject,
	type JsonValue,
	type Message,
	type ModelFailure,
	type ModelFailureCategory,
	type ModelOutcome,
	type ModelResponse,
	type ResponseIdentity,
	type ToolCall,
	type Usage,
} from "./canonical-protocol.ts";
import {
	DEFAULT_DEEPSEEK_PROFILE,
	type DeepSeekProfile,
} from "./deepseek-profile.ts";
import {
	DeepSeekFetchTransport,
	DeepSeekTransportConfigurationError,
	type DeepSeekTransport,
	type DeepSeekTransportRequest,
	type DeepSeekTransportResponse,
} from "./deepseek-transport.ts";
import type { ModelAdapter, ModelExchangeRequest } from "./model-adapter-contract.ts";

export const DEEPSEEK_OFFICIAL_CONTRACT = Object.freeze({
	retrievedOn: "2026-09-07",
	chatCompletions: {
		url: "https://api-docs.deepseek.com/api/create-chat-completion/",
		sha256: "67b6a6c8ab70f51ad56f6018077ac58768d95f73b53639b4d00b3f6d57a4fad9",
	},
	thinkingMode: {
		url: "https://api-docs.deepseek.com/guides/thinking_mode/",
		sha256: "f28c43248d26db1f27af0cb082abb00326c957d560d33a21839736edd1d10724",
	},
	toolCalls: {
		url: "https://api-docs.deepseek.com/guides/tool_calls/",
		sha256: "41420d8609a15ff13afd5b82a66ea1b2a5440a59787718ade7f48230b660bcfa",
	},
	errorCodes: {
		url: "https://api-docs.deepseek.com/quick_start/error_codes/",
		sha256: "0dd0c3c189933e69d1de6be900f6a1653ab2b543dd3a720baf1eb48c19dff916",
	},
});

/** Exact Provider error codes that classify HTTP 400 as Context overflow. */
export const DEEPSEEK_CONTEXT_OVERFLOW_CODES = Object.freeze([
	"context_length_exceeded",
	"context_overflow",
]);

export const DEEPSEEK_HTTP_FAILURE_TABLE = Object.freeze({
	400: { category: "provider", retryable: false, detail: "deepseek_http_400" },
	401: { category: "authentication", retryable: false, detail: "deepseek_http_401_authentication" },
	402: { category: "provider", retryable: false, detail: "deepseek_http_402_balance" },
	422: { category: "provider", retryable: false, detail: "deepseek_http_422" },
	429: { category: "rate_limit", retryable: true, detail: "deepseek_http_429_rate_limit" },
	500: { category: "provider", retryable: true, detail: "deepseek_http_500" },
	503: { category: "provider", retryable: true, detail: "deepseek_http_503" },
} satisfies Readonly<Record<number, { category: ModelFailureCategory; retryable: boolean; detail: string }>>);

type WireRecord = Record<string, unknown>;

interface WireToolCallAccumulator {
	readonly index: number;
	id: string;
	type?: "function";
	name: string;
	arguments: string;
}

interface IdentityAccumulator {
	id?: string;
	model?: string;
	fingerprint?: string;
	created?: number;
}

interface AssembledResponse {
	readonly outcome: ModelResponse | ModelFailure;
	readonly reasoningObserved: boolean;
	readonly reasoning: string;
}

interface ContinuationRecord {
	readonly messageKey: string;
	readonly providerOwned: boolean;
	readonly reasoningObserved: boolean;
	readonly reasoning: string;
}

interface PreparedContinuation {
	readonly records: readonly ContinuationRecord[];
	readonly reasoningByAssistant: readonly (ContinuationRecord | undefined)[];
}

class DeepSeekProtocolError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = "DeepSeekProtocolError";
		this.code = code;
	}
}

function isRecord(value: unknown): value is WireRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function protocol(code: string): never {
	throw new DeepSeekProtocolError(code);
}

function stableJson(value: JsonValue): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const objectValue = value as { readonly [key: string]: JsonValue };
	return `{${Object.keys(objectValue).sort().map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key] as JsonValue)}`).join(",")}}`;
}

function messageKey(message: AssistantMessage): string {
	return stableJson(message as unknown as JsonValue);
}

function reported(value: string | undefined): Availability<string> {
	return value === undefined ? UNAVAILABLE : { status: "reported", value };
}

function identityOf(accumulator: IdentityAccumulator): ResponseIdentity {
	return {
		provider: { status: "reported", value: "deepseek" },
		model: reported(accumulator.model),
		responseId: reported(accumulator.id),
		backendFingerprint: reported(accumulator.fingerprint),
	};
}

function unavailableIdentity(): ResponseIdentity {
	return {
		provider: { status: "reported", value: "deepseek" },
		model: UNAVAILABLE,
		responseId: UNAVAILABLE,
		backendFingerprint: UNAVAILABLE,
	};
}

function failure(
	category: ModelFailureCategory,
	detail: string,
	retryable: boolean,
	identity: ResponseIdentity = unavailableIdentity(),
	usage: Usage = UNAVAILABLE,
): ModelFailure {
	return { kind: "failure", category, detail, retryable, identity, usage };
}

function safeCode(error: unknown): string {
	if (error instanceof DeepSeekProtocolError || error instanceof CanonicalProtocolError) return error.code;
	return "deepseek_protocol_failure";
}

function encodeSingleText(
	content: readonly ({ readonly type: "text"; readonly text: string } | { readonly type: "image" })[],
	code: string,
): string {
	if (content.some((item) => item.type === "image")) protocol("deepseek_image_input_unsupported");
	const text = content.filter((item): item is { readonly type: "text"; readonly text: string } => item.type === "text");
	if (text.length !== 1) protocol(code);
	return text[0]?.text ?? "";
}

function encodeToolDefinitions(tools: readonly AgentToolDefinition[]): WireRecord[] {
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	}));
}

function encodeAssistant(
	message: AssistantMessage,
	record: ContinuationRecord | undefined,
): WireRecord {
	const textBlocks = message.content.filter((item) => item.type === "text");
	if (textBlocks.length > 1) protocol("deepseek_assistant_text_blocks_unsupported");
	const calls = message.content.filter((item): item is ToolCall => item.type === "tool_call");
	const encoded: WireRecord = {
		role: "assistant",
		content: textBlocks[0]?.text ?? "",
	};
	if (record?.reasoningObserved) encoded.reasoning_content = record.reasoning;
	if (calls.length > 0) {
		encoded.tool_calls = calls.map((call) => ({
			id: call.id,
			type: "function",
			function: { name: call.name, arguments: JSON.stringify(call.arguments) },
		}));
	}
	return encoded;
}

function encodeMessages(
	systemPrompt: string,
	messages: readonly Message[],
	continuation: PreparedContinuation,
	replayReasoning: boolean,
): WireRecord[] {
	const encoded: WireRecord[] = [{ role: "system", content: systemPrompt }];
	let assistantIndex = 0;
	for (const message of messages) {
		if (message.role === "user") {
			encoded.push({ role: "user", content: encodeSingleText(message.content, "deepseek_user_text_blocks_unsupported") });
			continue;
		}
		if (message.role === "assistant") {
			encoded.push(encodeAssistant(
				message,
				replayReasoning ? continuation.reasoningByAssistant[assistantIndex] : undefined,
			));
			assistantIndex += 1;
			continue;
		}
		encoded.push({
			role: "tool",
			tool_call_id: message.toolCallId,
			content: encodeSingleText(message.content, "deepseek_tool_result_text_blocks_unsupported"),
		});
	}
	return encoded;
}

function buildRequest(
	profile: DeepSeekProfile,
	request: ModelExchangeRequest,
	continuation: PreparedContinuation,
): DeepSeekTransportRequest {
	const body: WireRecord = {
		model: profile.modelId,
		messages: encodeMessages(
			request.context.systemPrompt,
			request.context.messages,
			continuation,
			request.context.tools.length > 0,
		),
		thinking: { type: "enabled" },
		reasoning_effort: profile.thinkingLevel,
		stream: true,
		stream_options: { include_usage: true },
	};
	if (request.context.tools.length > 0) body.tools = encodeToolDefinitions(request.context.tools);
	return {
		method: "POST",
		path: "/chat/completions",
		headers: { accept: "text/event-stream", "content-type": "application/json" },
		body: JSON.stringify(body),
		signal: request.signal,
	};
}

async function readBodyBytes(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of body) {
		if (!(chunk instanceof Uint8Array)) protocol("deepseek_transport_chunk_invalid");
		chunks.push(chunk);
		size += chunk.byteLength;
	}
	const combined = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return combined;
}

async function readSseEvents(body: AsyncIterable<Uint8Array>): Promise<string[]> {
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let buffer = "";
	let dataLines: string[] = [];
	const events: string[] = [];
	const processLine = (rawLine: string): void => {
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		if (line.length === 0) {
			if (dataLines.length > 0) events.push(dataLines.join("\n"));
			dataLines = [];
			return;
		}
		if (line.startsWith(":")) return;
		if (!line.startsWith("data:")) protocol("deepseek_sse_field_unsupported");
		const value = line.slice(5);
		dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
	};
	for await (const chunk of body) {
		if (!(chunk instanceof Uint8Array)) protocol("deepseek_transport_chunk_invalid");
		try {
			buffer += decoder.decode(chunk, { stream: true });
		} catch {
			protocol("deepseek_sse_invalid_utf8");
		}
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			processLine(buffer.slice(0, newline));
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
		}
	}
	try {
		buffer += decoder.decode();
	} catch {
		protocol("deepseek_sse_invalid_utf8");
	}
	if (buffer.length > 0) processLine(buffer);
	if (dataLines.length > 0) events.push(dataLines.join("\n"));
	return events;
}

function observeIdentity(accumulator: IdentityAccumulator, envelope: WireRecord): void {
	const fields = [
		["id", "id"],
		["model", "model"],
		["system_fingerprint", "fingerprint"],
	] as const;
	for (const [wireName, localName] of fields) {
		const value = envelope[wireName];
		if (value === undefined || value === null) continue;
		if (typeof value !== "string" || value.length === 0) protocol(`deepseek_${wireName}_invalid`);
		const prior = accumulator[localName];
		if (prior !== undefined && prior !== value) protocol(`deepseek_${wireName}_inconsistent`);
		accumulator[localName] = value;
	}
	const created = envelope.created;
	if (created === undefined || created === null) return;
	if (typeof created !== "number" || !Number.isInteger(created) || created < 0) protocol("deepseek_created_invalid");
	if (accumulator.created !== undefined && accumulator.created !== created) protocol("deepseek_created_inconsistent");
	accumulator.created = created;
}

function appendOptionalString(target: { value: string; observed: boolean }, value: unknown, code: string): void {
	if (value === undefined || value === null) return;
	if (typeof value !== "string") protocol(code);
	target.observed = true;
	target.value += value;
}

function appendToolCall(
	accumulators: Map<number, WireToolCallAccumulator>,
	raw: unknown,
): void {
	if (!isRecord(raw)) protocol("deepseek_tool_call_delta_invalid");
	const index = raw.index;
	if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
		protocol("deepseek_tool_call_index_invalid");
	}
	const accumulator = accumulators.get(index) ?? { index, id: "", name: "", arguments: "" };
	const id = raw.id;
	if (id !== undefined && id !== null) {
		if (typeof id !== "string") protocol("deepseek_tool_call_id_invalid");
		accumulator.id += id;
	}
	const type = raw.type;
	if (type !== undefined && type !== null) {
		if (type !== "function") protocol("deepseek_tool_call_type_invalid");
		accumulator.type = "function";
	}
	const fn = raw.function;
	if (fn !== undefined && fn !== null) {
		if (!isRecord(fn)) protocol("deepseek_tool_call_function_invalid");
		if (fn.name !== undefined && fn.name !== null) {
			if (typeof fn.name !== "string") protocol("deepseek_tool_call_name_invalid");
			accumulator.name += fn.name;
		}
		if (fn.arguments !== undefined && fn.arguments !== null) {
			if (typeof fn.arguments !== "string") protocol("deepseek_tool_call_arguments_invalid");
			accumulator.arguments += fn.arguments;
		}
	}
	accumulators.set(index, accumulator);
}

function parseUsage(raw: unknown): Usage {
	if (!isRecord(raw)) protocol("deepseek_usage_missing");
	const integer = (name: string): number => {
		const value = raw[name];
		if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
			protocol(`deepseek_usage_${name}_invalid`);
		}
		return value;
	};
	const details = raw.completion_tokens_details;
	let reasoning: number | undefined;
	if (details !== undefined && details !== null) {
		if (!isRecord(details)) protocol("deepseek_usage_completion_details_invalid");
		if (details.reasoning_tokens !== undefined) {
			if (typeof details.reasoning_tokens !== "number" || !Number.isInteger(details.reasoning_tokens) || details.reasoning_tokens < 0) {
				protocol("deepseek_usage_reasoning_tokens_invalid");
			}
			reasoning = details.reasoning_tokens;
		}
	}
	if (raw.prompt_cache_miss_tokens !== undefined) integer("prompt_cache_miss_tokens");
	return {
		status: "reported",
		value: {
			input: integer("prompt_tokens"),
			output: integer("completion_tokens"),
			cacheRead: integer("prompt_cache_hit_tokens"),
			...(reasoning === undefined ? {} : { reasoning }),
			totalTokens: integer("total_tokens"),
		},
	};
}

function completeToolCalls(accumulators: Map<number, WireToolCallAccumulator>): ToolCall[] {
	const ordered = [...accumulators.values()].sort((left, right) => left.index - right.index);
	for (let index = 0; index < ordered.length; index += 1) {
		if (ordered[index]?.index !== index) protocol("deepseek_tool_call_index_gap");
	}
	return ordered.map((item) => {
		if (!item.id || item.type !== "function" || !item.name || !item.arguments) {
			protocol("deepseek_tool_call_incomplete");
		}
		let argumentsValue: unknown;
		try {
			argumentsValue = JSON.parse(item.arguments);
		} catch {
			protocol("deepseek_tool_call_arguments_json_invalid");
		}
		try {
			assertJsonObject(argumentsValue, "deepseek_tool_call.arguments");
		} catch {
			protocol("deepseek_tool_call_arguments_object_required");
		}
		return { type: "tool_call", id: item.id, name: item.name, arguments: argumentsValue };
	});
}

async function assembleSuccessfulResponse(response: DeepSeekTransportResponse): Promise<AssembledResponse> {
	const events = await readSseEvents(response.body);
	const identity = {} as IdentityAccumulator;
	const content = { value: "", observed: false };
	const reasoning = { value: "", observed: false };
	const calls = new Map<number, WireToolCallAccumulator>();
	let finishReason: string | undefined;
	let usage: Usage | undefined;
	let doneCount = 0;

	for (const event of events) {
		if (event === "[DONE]") {
			doneCount += 1;
			if (doneCount > 1) protocol("deepseek_sse_done_duplicate");
			continue;
		}
		if (doneCount > 0) protocol("deepseek_sse_data_after_done");
		if (finishReason !== undefined) protocol("deepseek_sse_data_after_terminal");
		let decoded: unknown;
		try {
			decoded = JSON.parse(event);
		} catch {
			protocol("deepseek_sse_json_invalid");
		}
		if (!isRecord(decoded) || decoded.object !== "chat.completion.chunk") {
			protocol("deepseek_sse_envelope_invalid");
		}
		observeIdentity(identity, decoded);
		const choices = decoded.choices;
		if (!Array.isArray(choices) || choices.length !== 1 || !isRecord(choices[0])) {
			protocol("deepseek_sse_choices_invalid");
		}
		const choice = choices[0];
		if (choice.index !== 0 || !isRecord(choice.delta)) protocol("deepseek_sse_choice_invalid");
		const delta = choice.delta;
		if (delta.role !== undefined && delta.role !== null && delta.role !== "assistant") {
			protocol("deepseek_sse_role_invalid");
		}
		appendOptionalString(content, delta.content, "deepseek_sse_content_invalid");
		appendOptionalString(reasoning, delta.reasoning_content, "deepseek_sse_reasoning_invalid");
		if (delta.tool_calls !== undefined && delta.tool_calls !== null) {
			if (!Array.isArray(delta.tool_calls)) protocol("deepseek_sse_tool_calls_invalid");
			for (const rawCall of delta.tool_calls) appendToolCall(calls, rawCall);
		}
		const rawFinish = choice.finish_reason;
		if (rawFinish !== undefined && rawFinish !== null) {
			if (typeof rawFinish !== "string" || ![
				"stop", "length", "tool_calls", "content_filter", "insufficient_system_resource",
			].includes(rawFinish)) protocol("deepseek_finish_reason_unknown");
			finishReason = rawFinish;
			usage = parseUsage(decoded.usage);
		} else if (decoded.usage !== undefined && decoded.usage !== null) {
			protocol("deepseek_usage_before_terminal");
		}
	}
	if (doneCount !== 1) protocol("deepseek_sse_done_missing");
	if (finishReason === undefined || usage === undefined) protocol("deepseek_sse_terminal_missing");
	if (identity.created === undefined) protocol("deepseek_created_missing");
	const responseIdentity = identityOf(identity);
	if (finishReason === "content_filter") {
		return {
			outcome: failure("provider", "deepseek_content_filtered", false, responseIdentity, usage),
			reasoningObserved: reasoning.observed,
			reasoning: reasoning.value,
		};
	}
	if (finishReason === "insufficient_system_resource") {
		return {
			outcome: failure("provider", "deepseek_insufficient_system_resource", true, responseIdentity, usage),
			reasoningObserved: reasoning.observed,
			reasoning: reasoning.value,
		};
	}
	const toolCalls = completeToolCalls(calls);
	if (finishReason === "tool_calls" && toolCalls.length === 0) protocol("deepseek_tool_calls_missing");
	if (finishReason !== "tool_calls" && toolCalls.length > 0) protocol("deepseek_partial_tool_call_not_admitted");
	if (finishReason === "stop" && (!content.observed || content.value.length === 0)) {
		protocol("deepseek_final_content_missing");
	}
	const messageContent: ModelResponse["message"]["content"] = [
		...(content.observed ? [{ type: "text" as const, text: content.value }] : []),
		...toolCalls,
	];
	const stopReason = finishReason as ModelResponse["stopReason"];
	const outcome: ModelResponse = {
		kind: "response",
		message: { role: "assistant", content: messageContent, timestamp: identity.created * 1000 },
		stopReason,
		usage,
		identity: responseIdentity,
		...(reasoning.observed && reasoning.value.length > 0
			? { diagnostics: { reasoning: { state: "present" as const } } }
			: {}),
	};
	return { outcome, reasoningObserved: reasoning.observed, reasoning: reasoning.value };
}

async function classifyHttpFailure(response: DeepSeekTransportResponse, signal: AbortSignal): Promise<ModelFailure> {
	let contextCode: string | undefined;
	let bytes: Uint8Array;
	try {
		bytes = await readBodyBytes(response.body);
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw error;
	}
	try {
		const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
		if (isRecord(decoded) && isRecord(decoded.error) && typeof decoded.error.code === "string") {
			contextCode = decoded.error.code;
		}
	} catch {
		contextCode = undefined;
	}
	if (response.status === 400 && contextCode !== undefined && DEEPSEEK_CONTEXT_OVERFLOW_CODES.some((code) => code === contextCode)) {
		return failure("context_overflow", "deepseek_context_overflow", false);
	}
	const mapped = DEEPSEEK_HTTP_FAILURE_TABLE[response.status as keyof typeof DEEPSEEK_HTTP_FAILURE_TABLE];
	if (mapped) return failure(mapped.category, mapped.detail, mapped.retryable);
	return failure("provider", `deepseek_http_${response.status}`, response.status >= 500);
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

export interface PanDeepSeekModelAdapterOptions {
	readonly transport?: DeepSeekTransport;
}

/** Deep Pan Adapter: canonical Context in, one assembled canonical outcome out. */
export class PanDeepSeekModelAdapter implements ModelAdapter {
	readonly providerId = "deepseek";
	readonly modelId: DeepSeekProfile["modelId"];
	readonly reasoningLevel: DeepSeekProfile["thinkingLevel"];
	private readonly profile: DeepSeekProfile;
	private readonly transport: DeepSeekTransport;
	private readonly continuations = new Map<string, readonly ContinuationRecord[]>();

	constructor(profile: DeepSeekProfile = DEFAULT_DEEPSEEK_PROFILE, options: PanDeepSeekModelAdapterOptions = {}) {
		this.profile = { ...profile };
		this.modelId = profile.modelId;
		this.reasoningLevel = profile.thinkingLevel;
		this.transport = options.transport ?? new DeepSeekFetchTransport();
	}

	async exchange(request: ModelExchangeRequest): Promise<ModelOutcome> {
		if (request.signal.aborted) return failure("cancelled", "deepseek_exchange_cancelled", false);
		let prepared: PreparedContinuation;
		let transportRequest: DeepSeekTransportRequest;
		try {
			prepared = this.prepare(request);
			transportRequest = buildRequest(this.profile, request, prepared);
		} catch (error) {
			return failure("protocol", safeCode(error), false);
		}

		let response: DeepSeekTransportResponse;
		try {
			response = await this.transport.send(transportRequest);
		} catch (error) {
			if (isAbort(error, request.signal)) return failure("cancelled", "deepseek_exchange_cancelled", false);
			if (error instanceof DeepSeekTransportConfigurationError) {
				return failure("authentication", error.code, false);
			}
			return failure("transport", "deepseek_transport_failure", true);
		}
		if (request.signal.aborted) return failure("cancelled", "deepseek_exchange_cancelled", false);
		if (response.status < 200 || response.status >= 300) {
			try {
				return await classifyHttpFailure(response, request.signal);
			} catch (error) {
				if (isAbort(error, request.signal)) return failure("cancelled", "deepseek_exchange_cancelled", false);
				return failure("transport", "deepseek_transport_failure", true);
			}
		}

		let assembled: AssembledResponse;
		try {
			assembled = await assembleSuccessfulResponse(response);
			if (request.signal.aborted) return failure("cancelled", "deepseek_exchange_cancelled", false);
			validateModelOutcome(assembled.outcome, request.context.messages);
		} catch (error) {
			if (isAbort(error, request.signal)) return failure("cancelled", "deepseek_exchange_cancelled", false);
			if (error instanceof DeepSeekProtocolError || error instanceof CanonicalProtocolError) {
				return failure("protocol", safeCode(error), false);
			}
			return failure("transport", "deepseek_transport_failure", true);
		}
		if (assembled.outcome.kind === "response") {
			this.continuations.set(request.sessionId, [
				...prepared.records,
				{
					messageKey: messageKey(assembled.outcome.message),
					providerOwned: true,
					reasoningObserved: assembled.reasoningObserved,
					reasoning: assembled.reasoning,
				},
			]);
		}
		return assembled.outcome;
	}

	private prepare(request: ModelExchangeRequest): PreparedContinuation {
		if (request.sessionId.trim().length === 0) protocol("deepseek_session_id_empty");
		if (typeof request.context.systemPrompt !== "string") protocol("deepseek_system_prompt_invalid");
		validateCanonicalContext(request.context.messages);
		validateAgentToolDefinitions(request.context.tools);
		const assistants = request.context.messages.filter((message): message is AssistantMessage => message.role === "assistant");
		const prior = this.continuations.get(request.sessionId);
		if (prior !== undefined) {
			if (prior.length !== assistants.length) protocol("deepseek_session_history_length_mismatch");
			for (let index = 0; index < prior.length; index += 1) {
				if (prior[index]?.messageKey !== messageKey(assistants[index] as AssistantMessage)) {
					protocol("deepseek_session_history_mismatch");
				}
			}
			return { records: prior, reasoningByAssistant: prior };
		}
		const records = assistants.map((message): ContinuationRecord => ({
			messageKey: messageKey(message),
			providerOwned: false,
			reasoningObserved: false,
			reasoning: "",
		}));
		if (request.context.tools.length > 0 && assistants.some((message) => message.content.some((item) => item.type === "tool_call"))) {
			protocol("deepseek_reasoning_history_unavailable");
		}
		return { records, reasoningByAssistant: records };
	}
}

export function createPanDeepSeekAdapter(
	profile: DeepSeekProfile = DEFAULT_DEEPSEEK_PROFILE,
	options: PanDeepSeekModelAdapterOptions = {},
): PanDeepSeekModelAdapter {
	return new PanDeepSeekModelAdapter(profile, options);
}
