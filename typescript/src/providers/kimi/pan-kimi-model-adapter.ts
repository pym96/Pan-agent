/** #53 Pan-owned Kimi Code ModelAdapter: canonical Context in, one assembled canonical outcome out.
 *  OpenAI-compatible streaming chat completions on the frozen official endpoint.
 *  No DeepSeek delegation, no reasoning_content continuation field, no error-body detail. */
import { validateAgentToolDefinitions, type AgentToolDefinition } from "../../protocol/agent-tool.ts";
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
} from "../../protocol/canonical-protocol.ts";
import { DEFAULT_KIMI_PROFILE, type KimiProfile } from "./kimi-profile.ts";
import {
	KimiFetchTransport,
	KimiTransportConfigurationError,
	abortableKimiBody,
	type KimiTransport,
	type KimiTransportRequest,
	type KimiTransportResponse,
} from "./kimi-transport.ts";
import type { ModelAdapter, ModelExchangeRequest } from "../../protocol/model-adapter-contract.ts";

/** Frozen status→category table. The provider error body is never read into detail. */
export const KIMI_HTTP_FAILURE_TABLE = Object.freeze({
	400: { category: "provider", retryable: false, detail: "kimi_http_400" },
	401: { category: "authentication", retryable: false, detail: "kimi_http_401_authentication" },
	403: { category: "authentication", retryable: false, detail: "kimi_http_403_forbidden" },
	404: { category: "provider", retryable: false, detail: "kimi_http_404" },
	422: { category: "provider", retryable: false, detail: "kimi_http_422" },
	429: { category: "rate_limit", retryable: true, detail: "kimi_http_429_rate_limit" },
	500: { category: "provider", retryable: true, detail: "kimi_http_500" },
	502: { category: "provider", retryable: true, detail: "kimi_http_502" },
	503: { category: "provider", retryable: true, detail: "kimi_http_503" },
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

class KimiProtocolError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = "KimiProtocolError";
		this.code = code;
	}
}

function isRecord(value: unknown): value is WireRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function protocol(code: string): never {
	throw new KimiProtocolError(code);
}

function reported(value: string | undefined): Availability<string> {
	return value === undefined ? UNAVAILABLE : { status: "reported", value };
}

function identityOf(accumulator: IdentityAccumulator): ResponseIdentity {
	return {
		provider: { status: "reported", value: "kimi-code" },
		model: reported(accumulator.model),
		responseId: reported(accumulator.id),
		backendFingerprint: reported(accumulator.fingerprint),
	};
}

function unavailableIdentity(): ResponseIdentity {
	return {
		provider: { status: "reported", value: "kimi-code" },
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
	if (error instanceof KimiProtocolError || error instanceof CanonicalProtocolError) return error.code;
	return "kimi_protocol_failure";
}

function encodeSingleText(
	content: readonly ({ readonly type: "text"; readonly text: string } | { readonly type: "image" })[],
	code: string,
): string {
	if (content.some((item) => item.type === "image")) protocol("kimi_image_input_unsupported");
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

function encodeAssistant(message: AssistantMessage): WireRecord {
	const textBlocks = message.content.filter((item) => item.type === "text");
	if (textBlocks.length > 1) protocol("kimi_assistant_text_blocks_unsupported");
	const calls = message.content.filter((item): item is ToolCall => item.type === "tool_call");
	const encoded: WireRecord = {
		role: "assistant",
		content: textBlocks[0]?.text ?? "",
	};
	// Deliberately no reasoning_content continuation field on this path.
	if (calls.length > 0) {
		encoded.tool_calls = calls.map((call) => ({
			id: call.id,
			type: "function",
			function: { name: call.name, arguments: JSON.stringify(call.arguments) },
		}));
	}
	return encoded;
}

function encodeMessages(systemPrompt: string, messages: readonly Message[]): WireRecord[] {
	const encoded: WireRecord[] = [{ role: "system", content: systemPrompt }];
	for (const message of messages) {
		if (message.role === "user") {
			encoded.push({ role: "user", content: encodeSingleText(message.content, "kimi_user_text_blocks_unsupported") });
			continue;
		}
		if (message.role === "assistant") {
			encoded.push(encodeAssistant(message));
			continue;
		}
		encoded.push({
			role: "tool",
			tool_call_id: message.toolCallId,
			content: encodeSingleText(message.content, "kimi_tool_result_text_blocks_unsupported"),
		});
	}
	return encoded;
}

function buildRequest(profile: KimiProfile, request: ModelExchangeRequest): KimiTransportRequest {
	const body: WireRecord = {
		model: profile.modelId,
		messages: encodeMessages(request.context.systemPrompt, request.context.messages),
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
		if (!(chunk instanceof Uint8Array)) protocol("kimi_transport_chunk_invalid");
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

async function* readSseEvents(body: AsyncIterable<Uint8Array>): AsyncIterable<string> {
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
		if (!line.startsWith("data:")) protocol("kimi_sse_field_unsupported");
		const value = line.slice(5);
		dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
	};
	for await (const chunk of body) {
		if (!(chunk instanceof Uint8Array)) protocol("kimi_transport_chunk_invalid");
		try {
			buffer += decoder.decode(chunk, { stream: true });
		} catch {
			protocol("kimi_sse_invalid_utf8");
		}
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			processLine(buffer.slice(0, newline));
			buffer = buffer.slice(newline + 1);
			while (events.length) yield events.shift()!;
			newline = buffer.indexOf("\n");
		}
	}
	try {
		buffer += decoder.decode();
	} catch {
		protocol("kimi_sse_invalid_utf8");
	}
	if (buffer.length > 0) processLine(buffer);
	if (dataLines.length > 0) events.push(dataLines.join("\n"));
	for (const event of events) yield event;
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
		if (typeof value !== "string" || value.length === 0) protocol(`kimi_${wireName}_invalid`);
		const prior = accumulator[localName];
		if (prior !== undefined && prior !== value) protocol(`kimi_${wireName}_inconsistent`);
		accumulator[localName] = value;
	}
	const created = envelope.created;
	if (created === undefined || created === null) return;
	if (typeof created !== "number" || !Number.isInteger(created) || created < 0) protocol("kimi_created_invalid");
	if (accumulator.created !== undefined && accumulator.created !== created) protocol("kimi_created_inconsistent");
	accumulator.created = created;
}

function appendOptionalString(target: { value: string; observed: boolean }, value: unknown, code: string): void {
	if (value === undefined || value === null) return;
	if (typeof value !== "string") protocol(code);
	target.observed = true;
	target.value += value;
}

function appendToolCall(accumulators: Map<number, WireToolCallAccumulator>, raw: unknown): void {
	if (!isRecord(raw)) protocol("kimi_tool_call_delta_invalid");
	const index = raw.index;
	if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
		protocol("kimi_tool_call_index_invalid");
	}
	const accumulator = accumulators.get(index) ?? { index, id: "", name: "", arguments: "" };
	const id = raw.id;
	if (id !== undefined && id !== null) {
		if (typeof id !== "string") protocol("kimi_tool_call_id_invalid");
		accumulator.id += id;
	}
	const type = raw.type;
	if (type !== undefined && type !== null) {
		if (type !== "function") protocol("kimi_tool_call_type_invalid");
		accumulator.type = "function";
	}
	const fn = raw.function;
	if (fn !== undefined && fn !== null) {
		if (!isRecord(fn)) protocol("kimi_tool_call_function_invalid");
		if (fn.name !== undefined && fn.name !== null) {
			if (typeof fn.name !== "string") protocol("kimi_tool_call_name_invalid");
			accumulator.name += fn.name;
		}
		if (fn.arguments !== undefined && fn.arguments !== null) {
			if (typeof fn.arguments !== "string") protocol("kimi_tool_call_arguments_invalid");
			accumulator.arguments += fn.arguments;
		}
	}
	accumulators.set(index, accumulator);
}

/** Usage is optional on this path: a missing or absent usage object stays unavailable, never fabricated. */
function parseUsage(raw: unknown): Usage {
	if (raw === undefined || raw === null) return UNAVAILABLE;
	if (!isRecord(raw)) protocol("kimi_usage_invalid");
	const integer = (name: string): number => {
		const value = raw[name];
		if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
			protocol(`kimi_usage_${name}_invalid`);
		}
		return value;
	};
	return {
		status: "reported",
		value: {
			input: integer("prompt_tokens"),
			output: integer("completion_tokens"),
			cacheRead: 0,
			totalTokens: integer("total_tokens"),
		},
	};
}

function completeToolCalls(accumulators: Map<number, WireToolCallAccumulator>): ToolCall[] {
	const ordered = [...accumulators.values()].sort((left, right) => left.index - right.index);
	for (let index = 0; index < ordered.length; index += 1) {
		if (ordered[index]?.index !== index) protocol("kimi_tool_call_index_gap");
	}
	return ordered.map((item) => {
		if (!item.id || item.type !== "function" || !item.name || !item.arguments) {
			protocol("kimi_tool_call_incomplete");
		}
		let argumentsValue: unknown;
		try {
			argumentsValue = JSON.parse(item.arguments);
		} catch {
			protocol("kimi_tool_call_arguments_json_invalid");
		}
		try {
			assertJsonObject(argumentsValue, "kimi_tool_call.arguments");
		} catch {
			protocol("kimi_tool_call_arguments_object_required");
		}
		return { type: "tool_call", id: item.id, name: item.name, arguments: argumentsValue as JsonObject };
	});
}

async function assembleSuccessfulResponse(response: KimiTransportResponse, request: ModelExchangeRequest): Promise<ModelOutcome> {
	const events = readSseEvents(abortableKimiBody(response.body, request.signal));
	const identity = {} as IdentityAccumulator;
	const content = { value: "", observed: false };
	const calls = new Map<number, WireToolCallAccumulator>();
	let finishReason: string | undefined;
	let usage: Usage = UNAVAILABLE;
	let doneCount = 0;

	for await (const event of events) {
		if (event === "[DONE]") {
			doneCount += 1;
			if (doneCount > 1) protocol("kimi_sse_done_duplicate");
			continue;
		}
		if (doneCount > 0) protocol("kimi_sse_data_after_done");
		if (finishReason !== undefined) protocol("kimi_sse_data_after_terminal");
		let decoded: unknown;
		try {
			decoded = JSON.parse(event);
		} catch {
			protocol("kimi_sse_json_invalid");
		}
		if (!isRecord(decoded) || decoded.object !== "chat.completion.chunk") {
			protocol("kimi_sse_envelope_invalid");
		}
		observeIdentity(identity, decoded);
		const choices = decoded.choices;
		if (!Array.isArray(choices) || choices.length !== 1 || !isRecord(choices[0])) {
			protocol("kimi_sse_choices_invalid");
		}
		const choice = choices[0];
		if (choice.index !== 0 || !isRecord(choice.delta)) protocol("kimi_sse_choice_invalid");
		const delta = choice.delta;
		if (delta.role !== undefined && delta.role !== null && delta.role !== "assistant") {
			protocol("kimi_sse_role_invalid");
		}
		appendOptionalString(content, delta.content, "kimi_sse_content_invalid");
		if (typeof delta.content === "string" && delta.content && !request.signal.aborted) {
			try { request.onProgress?.({ type: "text_delta", text: delta.content }); } catch { /* A display sink cannot change the assembled outcome. */ }
		}
		if (delta.reasoning_content !== undefined && delta.reasoning_content !== null) protocol("kimi_reasoning_field_unsupported");
		if (delta.tool_calls !== undefined && delta.tool_calls !== null) {
			if (!Array.isArray(delta.tool_calls)) protocol("kimi_sse_tool_calls_invalid");
			for (const rawCall of delta.tool_calls) appendToolCall(calls, rawCall);
		}
		const rawFinish = choice.finish_reason;
		if (rawFinish !== undefined && rawFinish !== null) {
			if (typeof rawFinish !== "string" || !["stop", "length", "tool_calls", "content_filter"].includes(rawFinish)) protocol("kimi_finish_reason_unknown");
			finishReason = rawFinish;
			usage = parseUsage(decoded.usage);
		} else if (decoded.usage !== undefined && decoded.usage !== null) {
			protocol("kimi_usage_before_terminal");
		}
	}
	if (doneCount !== 1) protocol("kimi_sse_done_missing");
	if (finishReason === undefined) protocol("kimi_sse_terminal_missing");
	if (identity.created === undefined) protocol("kimi_created_missing");
	const responseIdentity = identityOf(identity);
	if (finishReason === "content_filter") {
		return failure("provider", "kimi_content_filtered", false, responseIdentity, usage);
	}
	const toolCalls = completeToolCalls(calls);
	if (finishReason === "tool_calls" && toolCalls.length === 0) protocol("kimi_tool_calls_missing");
	if (finishReason !== "tool_calls" && toolCalls.length > 0) protocol("kimi_partial_tool_call_not_admitted");
	if (finishReason === "stop" && (!content.observed || content.value.length === 0)) {
		protocol("kimi_final_content_missing");
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
	};
	return outcome;
}

/** Status-only classification: the provider error body is never parsed into detail. */
async function classifyHttpFailure(response: KimiTransportResponse, signal: AbortSignal): Promise<ModelFailure> {
	try {
		await readBodyBytes(abortableKimiBody(response.body, signal));
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw error;
	}
	const mapped = KIMI_HTTP_FAILURE_TABLE[response.status as keyof typeof KIMI_HTTP_FAILURE_TABLE];
	if (mapped) return failure(mapped.category, mapped.detail, mapped.retryable);
	return failure("provider", `kimi_http_${response.status}`, response.status >= 500);
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

export interface PanKimiModelAdapterOptions {
	readonly transport?: KimiTransport;
}

/** Pan-owned Kimi adapter: one canonical exchange per call, no cross-call continuation state. */
export class PanKimiModelAdapter implements ModelAdapter {
	readonly providerId = "kimi-code";
	readonly modelId: KimiProfile["modelId"];
	readonly reasoningLevel = "off";
	private readonly profile: KimiProfile;
	private readonly transport: KimiTransport;

	constructor(profile: KimiProfile = DEFAULT_KIMI_PROFILE, options: PanKimiModelAdapterOptions = {}) {
		this.profile = { ...profile };
		this.modelId = profile.modelId;
		this.transport = options.transport ?? new KimiFetchTransport();
	}

	async exchange(request: ModelExchangeRequest): Promise<ModelOutcome> {
		if (request.signal.aborted) return failure("cancelled", "kimi_exchange_cancelled", false);
		let transportRequest: KimiTransportRequest;
		try {
			if (request.sessionId.trim().length === 0) protocol("kimi_session_id_empty");
			if (typeof request.context.systemPrompt !== "string") protocol("kimi_system_prompt_invalid");
			validateCanonicalContext(request.context.messages);
			validateAgentToolDefinitions(request.context.tools);
			transportRequest = buildRequest(this.profile, request);
		} catch (error) {
			return failure("protocol", safeCode(error), false);
		}

		let response: KimiTransportResponse;
		try {
			response = await this.transport.send(transportRequest);
		} catch (error) {
			if (isAbort(error, request.signal)) return failure("cancelled", "kimi_exchange_cancelled", false);
			if (error instanceof KimiTransportConfigurationError) {
				return failure("authentication", error.code, false);
			}
			return failure("transport", "kimi_transport_failure", true);
		}
		if (request.signal.aborted) return failure("cancelled", "kimi_exchange_cancelled", false);
		if (response.status < 200 || response.status >= 300) {
			try {
				return await classifyHttpFailure(response, request.signal);
			} catch (error) {
				if (isAbort(error, request.signal)) return failure("cancelled", "kimi_exchange_cancelled", false);
				return failure("transport", "kimi_transport_failure", true);
			}
		}

		try {
			const outcome = await assembleSuccessfulResponse(response, request);
			if (request.signal.aborted) return failure("cancelled", "kimi_exchange_cancelled", false);
			validateModelOutcome(outcome, request.context.messages);
			return outcome;
		} catch (error) {
			if (isAbort(error, request.signal)) return failure("cancelled", "kimi_exchange_cancelled", false);
			if (error instanceof KimiProtocolError || error instanceof CanonicalProtocolError) {
				return failure("protocol", safeCode(error), false);
			}
			return failure("transport", "kimi_transport_failure", true);
		}
	}
}

export function createPanKimiAdapter(
	profile: KimiProfile = DEFAULT_KIMI_PROFILE,
	options: PanKimiModelAdapterOptions = {},
): PanKimiModelAdapter {
	return new PanKimiModelAdapter(profile, options);
}
